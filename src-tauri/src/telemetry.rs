// SPDX-License-Identifier: AGPL-3.0-only
//! Owner crash/error reporting (Sentry).
//!
//! Rust panics, selected command errors and logs are sent to the owner's Sentry
//! project. Webview events reach Rust through `tauri-plugin-sentry` IPC, so the
//! renderer keeps its no-network CSP. Every event, breadcrumb and log is scrubbed
//! here before it leaves the process: home/user paths, the local username,
//! camera serial-like identifiers, GPS/location values and media filenames.
//! Reporting must never break the app: every failure path is silent.
//!
//! Set `DASHCAM_SCANNER_SENTRY=0` to disable reporting for a run.
//! Set `DASHCAM_SCANNER_SENTRY_TEST=rust-error,rust-panic,js-error,js-rejection`
//! to emit synthetic verification events (hidden owner/developer trigger).

use regex::{Captures, Regex};
use sentry::protocol::{Event, Log, LogAttribute, Value};
use sentry::{Breadcrumb, Level};
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

/// Public client key (DSN). Not a credential: it only allows event ingestion.
pub const DSN: &str = "https://0bd96cfd0ed148e53c9e1aac975b2545@o4512479442698240.ingest.us.sentry.io/4512479509610497";
pub const DISABLE_ENV: &str = "DASHCAM_SCANNER_SENTRY";
pub const TEST_ENV: &str = "DASHCAM_SCANNER_SENTRY_TEST";
const TRACES_SAMPLE_RATE: f32 = 0.2;

pub fn release() -> String {
    format!("dashcam-card-scanner@{}", env!("CARGO_PKG_VERSION"))
}

pub fn environment() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    }
}

fn enabled() -> bool {
    !DSN.is_empty()
        && !DSN.starts_with("__")
        && !matches!(
            std::env::var(DISABLE_ENV).ok().as_deref(),
            Some("0" | "false" | "off" | "no")
        )
}

/// Initialise Sentry. Returns `None` (reporting off) on any problem.
pub fn init(plugin: &tauri_plugin_sentry::Sentry) -> Option<sentry::ClientInitGuard> {
    if !enabled() {
        return None;
    }
    // The Sentry transport uses reqwest 0.13 without a bundled crypto provider;
    // install ring (already used by the app's reqwest 0.12) as process default.
    let _ = rustls::crypto::ring::default_provider().install_default();
    // `dsn()` panics on an invalid value; validate first so reporting can never
    // take the app down.
    DSN.parse::<sentry::types::Dsn>().ok()?;
    let options = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        sentry::ClientOptions::new()
            .dsn(DSN)
            .release(release())
            .environment(environment())
            .send_default_pii(false)
            .traces_sample_rate(TRACES_SAMPLE_RATE)
            .auto_session_tracking(false)
            .attach_stacktrace(true)
            .before_send(scrub_event)
            .before_breadcrumb(|crumb| Some(scrub_breadcrumb(crumb)))
            .before_send_log(|log| Some(scrub_log(log)))
            .add_integration(plugin.clone())
    }))
    .ok()?;
    let guard =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| sentry::init(options))).ok()?;
    if !guard.is_enabled() {
        return None;
    }
    sentry::logger_info!(
        release = release(),
        environment = environment(),
        "Dashcam Card Scanner started"
    );
    Some(guard)
}

/// Flush queued events (used on app exit and after verification triggers).
pub fn flush() {
    if let Some(client) = sentry::Hub::current().client() {
        let _ = client.flush(Some(std::time::Duration::from_secs(3)));
    }
}

/// Expected user-flow messages are logged, not raised as error events.
fn expected_flow_error(error: &str) -> bool {
    [
        "An operation is already running.",
        "Choose a folder first.",
        "Scan first.",
        "Explicit submission consent is required.",
        "Check updates and approve this version first.",
    ]
    .contains(&error)
}

/// Report a failed privileged command result (scrubbed) and pass it through.
pub fn command_result<T>(command: &'static str, result: Result<T, String>) -> Result<T, String> {
    if let Err(error) = &result {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            if expected_flow_error(error) {
                sentry::logger_info!(command = command, "{command} declined: {error}");
                return;
            }
            sentry::logger_error!(command = command, "{command} failed: {error}");
            sentry::with_scope(
                |scope| {
                    scope.set_tag("command", command);
                    scope.set_fingerprint(Some(&["command-error", command, error.as_str()]));
                },
                || sentry::capture_message(&format!("{command} failed: {error}"), Level::Error),
            );
        }));
    }
    result
}

/// Hidden verification trigger value (comma separated list), if set.
pub fn test_trigger() -> Option<String> {
    std::env::var(TEST_ENV)
        .ok()
        .filter(|v| !v.trim().is_empty())
}

/// Synthetic text deliberately containing values the scrubber must remove.
fn synthetic_private_text() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/example".into());
    format!(
        "synthetic verification: {home}/Movies/DCIM/2026_0101_120000_0042F.MP4 \
         camera serial A229P2304001234 at 37.774929,-122.419416"
    )
}

#[inline(never)]
fn trigger_test_rust_error() {
    let error: Result<(), String> = Err(synthetic_private_text());
    let _ = command_result("sentry_verification_rust_error", error);
}

#[inline(never)]
fn trigger_test_rust_panic() {
    let _ = std::thread::Builder::new()
        .name("sentry-verification".into())
        .spawn(|| panic!("sentry verification panic: {}", synthetic_private_text()))
        .map(|handle| handle.join());
}

/// Run Rust-side verification triggers requested via `DASHCAM_SCANNER_SENTRY_TEST`.
pub fn run_startup_test_triggers() {
    let Some(trigger) = test_trigger() else {
        return;
    };
    if trigger.contains("rust-error") {
        trigger_test_rust_error();
    }
    if trigger.contains("rust-panic") {
        trigger_test_rust_panic();
    }
    sentry::logger_warn!(
        trigger = trigger.as_str(),
        "Sentry verification trigger ran"
    );
    flush();
}

// ---------------------------------------------------------------- scrubbing

static HOME_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)(/Users/|/home/|[A-Z]:\\{1,2}Users\\{1,2}|[A-Z]:/Users/)[^/\\\s"'<>:]+"#)
        .unwrap()
});
static VOLUME_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(/Volumes/|/media/[^/\s"']+/|/run/media/[^/\s"']+/)[^/\s"'<>]+"#).unwrap()
});
static MEDIA_FILE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b([^\s/\\\x22'<>:|?*]+)\.(mp4|mov|avi|mkv|ts|m4v|3gp|h264|h265|hevc|jpe?g|png|heic|nmea|gpx|kml|gps|dat|thm)\b")
        .unwrap()
});
static GPS_PAIR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[-+]?\d{1,3}\.\d{3,}\s*[,; ]\s*[-+]?\d{1,3}\.\d{3,}").unwrap());
static GPS_DMS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\d{1,3}°\s*\d{1,2}['′]\s*[\d.]+["″]?\s*[NSEW]"#).unwrap());
static NMEA: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\$G[PNLAB][A-Z]{3},[^\s\x22']*").unwrap());
static SERIAL_LABELLED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(serial(?:[ _-]?(?:no|number))?|s/n|sn|imei)(\s*[:=#]?\s*)[A-Za-z0-9-]{4,}")
        .unwrap()
});
static SERIAL_TOKEN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b[A-Z0-9]{10,}\b").unwrap());
static MAC_ADDR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b").unwrap());
static SENSITIVE_KEY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(serial|serial_?(no|number)|sn|imei|mac|mac_?address|gps|lat|latitude|lon|lng|longitude|location|coords?|coordinates|geo|username|user_?name|hostname|host_?name|server_name|email|ip|ip_?address)$").unwrap()
});
static LOCAL_USER: LazyLock<Option<Regex>> = LazyLock::new(|| {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .ok()
        .filter(|u| u.len() >= 3)?;
    Regex::new(&format!(r"(?i)\b{}\b", regex::escape(&user))).ok()
});

/// Keys whose values are code/debug identifiers: only path scrubbing applies.
fn structural_key(key: &str) -> bool {
    matches!(
        key,
        "function"
            | "raw_function"
            | "symbol"
            | "module"
            | "package"
            | "filename"
            | "abs_path"
            | "instruction_addr"
            | "symbol_addr"
            | "image_addr"
            | "debug_id"
            | "code_id"
            | "debug_file"
            | "code_file"
            | "event_id"
            | "trace_id"
            | "span_id"
            | "parent_span_id"
            | "release"
            | "dist"
            | "environment"
            | "platform"
            | "version"
            | "name"
            | "type"
            | "op"
            | "sdk"
            | "timestamp"
            | "start_timestamp"
            | "level"
            | "context_line"
            | "pre_context"
            | "post_context"
    )
}

fn short_hash(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest.iter().take(4).map(|b| format!("{b:02x}")).collect()
}

/// Path-only scrubbing (safe for stack frames and debug images).
pub fn scrub_paths(text: &str) -> String {
    let text = HOME_PATH.replace_all(text, "${1}<user>");
    let text = VOLUME_PATH.replace_all(&text, "${1}<volume>");
    match &*LOCAL_USER {
        Some(user) => user.replace_all(&text, "<user>").into_owned(),
        None => text.into_owned(),
    }
}

/// Full free-text scrubbing.
pub fn scrub_text(text: &str) -> String {
    let text = scrub_paths(text);
    let text = NMEA.replace_all(&text, "<nmea>");
    let text = GPS_DMS.replace_all(&text, "<gps>");
    let text = GPS_PAIR.replace_all(&text, "<gps>");
    let text = MAC_ADDR.replace_all(&text, "<mac>");
    let text = SERIAL_LABELLED.replace_all(&text, "${1}${2}<serial>");
    let text = SERIAL_TOKEN.replace_all(&text, |c: &Captures| {
        let token = &c[0];
        if token.bytes().any(|b| b.is_ascii_digit())
            && token.bytes().any(|b| b.is_ascii_uppercase())
        {
            "<serial>".to_string()
        } else {
            token.to_string()
        }
    });
    MEDIA_FILE
        .replace_all(&text, |c: &Captures| {
            let (stem, ext) = (&c[1], &c[2]);
            // `.ts` is also TypeScript; only treat digit-heavy names as MPEG-TS.
            let ts_source = ext.eq_ignore_ascii_case("ts")
                && stem.bytes().filter(|b| b.is_ascii_digit()).count() < 4;
            if ts_source || stem.starts_with('<') {
                c[0].to_string()
            } else {
                format!("<media-{}>.{}", short_hash(stem), ext)
            }
        })
        .into_owned()
}

fn scrub_json(value: &mut serde_json::Value, key: Option<&str>) {
    match value {
        serde_json::Value::String(s) => {
            *s = if key.is_some_and(structural_key) {
                scrub_paths(s)
            } else {
                scrub_text(s)
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                scrub_json(item, key);
            }
        }
        serde_json::Value::Object(map) => {
            map.remove("server_name");
            map.remove("user");
            for (k, v) in map.iter_mut() {
                if SENSITIVE_KEY.is_match(k) && !v.is_null() {
                    *v = serde_json::Value::String("[redacted]".into());
                } else {
                    scrub_json(v, Some(k));
                }
            }
        }
        _ => {}
    }
}

/// Scrub an outgoing event. Returns `None` (drop) if it cannot be safely scrubbed.
pub fn scrub_event(event: Event<'static>) -> Option<Event<'static>> {
    let mut value = serde_json::to_value(&event).ok()?;
    if let Some(device) = value
        .pointer_mut("/contexts/device")
        .and_then(|d| d.as_object_mut())
    {
        device.remove("name");
    }
    scrub_json(&mut value, None);
    let mut event: Event<'static> = serde_json::from_value(value).ok()?;
    event.server_name = None;
    // An explicit unroutable address stops Sentry inferring the sender IP (and
    // city-level geo) from the connection; the project also scrubs IPs.
    event.user = Some(sentry::User {
        ip_address: Some(sentry::protocol::IpAddress::Exact(
            std::net::Ipv4Addr::UNSPECIFIED.into(),
        )),
        ..Default::default()
    });
    Some(event)
}

pub fn scrub_breadcrumb(crumb: Breadcrumb) -> Breadcrumb {
    let Ok(mut value) = serde_json::to_value(&crumb) else {
        return Breadcrumb::default();
    };
    scrub_json(&mut value, None);
    serde_json::from_value(value).unwrap_or_default()
}

pub fn scrub_log(mut log: Log) -> Log {
    log.body = scrub_text(&log.body);
    for (key, attribute) in log.attributes.iter_mut() {
        // SDK metadata stays; message parameters carry user text and are scrubbed.
        if key.starts_with("sentry.") && !key.starts_with("sentry.message.parameter") {
            continue;
        }
        let LogAttribute(value) = attribute;
        if SENSITIVE_KEY.is_match(key) {
            *value = Value::String("[redacted]".into());
        } else {
            scrub_json(value, Some(key));
        }
    }
    log
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrubs_paths_serials_gps_and_media_names() {
        let input =
            "open /Users/alice/Movies/DCIM/2026_0101_120000_0042F.MP4 on /Volumes/VIOFO_A229 \
                     serial A229P2304001234 SN: XJ-99812 at 37.774929,-122.419416 \
                     $GPRMC,123519,A,4807.038,N mac 00:1A:2B:3C:4D:5E C:\\Users\\bob\\x.mov";
        let out = scrub_text(input);
        for leaked in [
            "alice",
            "bob",
            "2026_0101_120000_0042F",
            "VIOFO_A229",
            "A229P2304001234",
            "XJ-99812",
            "37.774929",
            "-122.419416",
            "4807.038",
            "00:1A:2B",
        ] {
            assert!(!out.contains(leaked), "{leaked} leaked in {out}");
        }
        assert!(out.contains("/Users/<user>/Movies/DCIM/<media-"));
        assert!(out.contains(".MP4"));
        assert!(out.contains(".mov"));
        assert!(out.contains("<gps>"));
        assert!(out.contains("<serial>"));
    }

    #[test]
    fn keeps_code_identifiers_readable() {
        let out = scrub_text(
            "at app:///src/ui.ts:10 in scanner::telemetry::trigger_test_rust_panic 0x1f2a",
        );
        assert!(out.contains("app:///src/ui.ts"));
        assert!(out.contains("scanner::telemetry::trigger_test_rust_panic"));
        assert_eq!(
            scrub_paths("/Users/carol/.cargo/registry/src/lib.rs"),
            "/Users/<user>/.cargo/registry/src/lib.rs"
        );
    }

    #[test]
    fn scrubs_structured_event() {
        let mut event = Event {
            message: Some("failed /home/dave/clip_20260101_0001.mp4".into()),
            server_name: Some("Daves-MacBook".into()),
            ..Default::default()
        };
        event
            .extra
            .insert("latitude".into(), serde_json::json!(37.7));
        event
            .extra
            .insert("note".into(), serde_json::json!("serial ABCDEF123456"));
        let event = scrub_event(event).unwrap();
        let text = serde_json::to_string(&event).unwrap();
        assert!(!text.contains("dave"));
        assert!(!text.contains("clip_20260101_0001"));
        assert!(!text.contains("Daves-MacBook"));
        assert!(!text.contains("37.7"));
        assert!(!text.contains("ABCDEF123456"));
    }

    #[test]
    fn scrubs_log_body_and_message_parameters() {
        let mut attributes = std::collections::BTreeMap::new();
        attributes.insert(
            "sentry.message.parameter.error".to_string(),
            LogAttribute(Value::String("/Users/erin/DCIM/20260101_0001.MP4".into())),
        );
        attributes.insert(
            "sentry.sdk.name".to_string(),
            LogAttribute(Value::String("sentry.rust".into())),
        );
        let log = Log {
            level: sentry::protocol::LogLevel::Error,
            body: "x failed: /Users/erin/DCIM/20260101_0001.MP4".into(),
            trace_id: None,
            timestamp: std::time::SystemTime::now(),
            severity_number: None,
            attributes: attributes.into_iter().collect(),
        };
        let text = serde_json::to_string(&scrub_log(log)).unwrap();
        assert!(!text.contains("erin"));
        assert!(!text.contains("20260101_0001"));
        assert!(text.contains("sentry.rust"));
    }

    #[test]
    fn release_and_environment_are_versioned() {
        assert_eq!(
            release(),
            format!("dashcam-card-scanner@{}", env!("CARGO_PKG_VERSION"))
        );
        assert!(["development", "production"].contains(&environment()));
    }
}
