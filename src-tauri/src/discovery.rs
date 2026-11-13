// SPDX-License-Identifier: AGPL-3.0-only
//! Private, bounded declarations, never identity authority. No source names cross IPC.
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_std::fs::{Dir, OpenOptions};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{LazyLock, Mutex};
fn matches(pattern: &'static str, value: &str) -> bool {
    static PATTERNS: LazyLock<Mutex<BTreeMap<&'static str, regex::Regex>>> =
        LazyLock::new(|| Mutex::new(BTreeMap::new()));
    let mut patterns = PATTERNS.lock().unwrap();
    patterns
        .entry(pattern)
        .or_insert_with(|| regex::Regex::new(pattern).expect("technical grammar"))
        .is_match(value)
}
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Read,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub id: String,
    pub format: String,
    pub encoding: String,
    pub size_bytes: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Observation {
    pub source_id: String,
    pub field: String,
    pub key: String,
    pub value: String,
    pub line: usize,
    pub record: usize,
    pub scope: String,
}
#[derive(Clone, Default, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Coverage {
    pub inventoried_candidates: usize,
    pub inspected_files: usize,
    pub uninspected_files: usize,
    pub retained_observations: usize,
    pub omitted_observations: usize,
    pub bytes_read: usize,
    pub limited: bool,
    pub multiple_model_values: bool,
    pub reasons: BTreeMap<String, usize>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Discovery {
    pub version: u8,
    pub sources: Vec<Source>,
    pub observations: Vec<Observation>,
    pub coverage: Coverage,
    #[serde(skip)]
    models: BTreeSet<String>,
}
impl Default for Discovery {
    fn default() -> Self {
        Self {
            version: 1,
            sources: vec![],
            observations: vec![],
            coverage: Coverage::default(),
            models: BTreeSet::new(),
        }
    }
}
fn field(key: &str) -> Option<&'static str> {
    Some(match key {
        "manufacturer" | "make" | "vendor" | "brand" => "manufacturer",
        "model" | "model_name" | "camera_model" | "device_model" | "product_model"
        | "dev_model" | "rear_model" | "inside_model" | "front_model" | "rc_model" => "model",
        "firmware" | "firmware_version" | "fw_version" | "fw" | "soft_version"
        | "software_version" | "rear_version" | "inside_version" | "micom_version" => "firmware",
        "build" | "build_version" | "version" | "hardware_version" => "build",
        "resolution" | "width" | "height" | "fps" | "frame_rate" | "bitrate" | "quality"
        | "hdr" | "parking_mode" | "time_lapse" | "codec" => "setting",
        _ => return None,
    })
}
// Closed technical grammars, not a redaction-based permission to publish text.
pub fn valid_value(kind: &str, key: &str, s: &str) -> bool {
    if field(key) != Some(kind) { return false; }
    let field = kind;
    if s.is_empty() || s.len() > 80 || s.trim() != s || !s.is_ascii() {
        return false;
    }
    let lower = s.to_ascii_lowercase();
    if matches(
        r"^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)[0-9.]+$",
        s,
    ) {
        return false;
    }
    if [
        "password",
        "passwd",
        "secret",
        "token",
        "@",
        "http",
        "www.",
        "wifi",
        "ssid",
        "gps",
        "serial",
        "latitude",
        "longitude",
        "address",
        "credential",
        "canary",
        "email",
    ]
    .iter()
    .any(|x| lower.contains(x))
    {
        return false;
    }
    // Network identifiers, phone-like long numbers, UUIDs and long opaque identifiers.
    if matches!(field, "model" | "manufacturer") && matches(r"(?:[0-9]{7,}|[A-Fa-f0-9]{12,})", s) { return false; }
    if matches(r"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+", s) {
        // Four-part dotted application versions are allowed only in version fields.
        if !matches!(field, "firmware" | "build") {
            return false;
        }
    }
    match field {
        "manufacturer" => matches(
            r"^[A-Za-z][A-Za-z0-9_-]{1,31}$",
            s,
        ),
        "model" => {
            matches(
                r"^[A-Za-z0-9][A-Za-z0-9._()+-]{0,31}(?: [A-Za-z0-9][A-Za-z0-9._()+-]{0,23}){0,3}$",
                s,
            ) && s.split(' ').any(|t| t.chars().any(|c| c.is_ascii_alphabetic()) && t.chars().any(|c| c.is_ascii_digit()))
        }
        "firmware" | "build" => matches(
            r"^[vV]?[0-9]{1,4}(?:\.[0-9]{1,6}){1,5}(?:[_+-][A-Za-z0-9.-]{1,32})?$",
            s,
        ),
        "setting" => match key {
            "resolution" => matches(r"^[1-9][0-9]{1,4}[xX][1-9][0-9]{1,4}$", s),
            "width" | "height" => s.parse::<u32>().is_ok_and(|n| (1..=16384).contains(&n)),
            "fps" | "frame_rate" | "time_lapse" => s
                .parse::<f64>()
                .is_ok_and(|n| n.is_finite() && n > 0. && n <= 240.),
            "bitrate" => s.parse::<u32>().is_ok_and(|n| n > 0 && n <= 1000000000),
            "quality" => {
                ["low", "normal", "medium", "high", "maximum", "extreme"].contains(&lower.as_str())
            }
            "hdr" => ["on", "off", "auto", "0", "1"].contains(&lower.as_str()),
            "parking_mode" => [
                "on",
                "off",
                "buffered",
                "time-lapse",
                "low-bitrate",
                "motion",
                "impact",
                "radar",
            ]
            .contains(&lower.as_str()),
            "codec" => ["h264", "h265", "hevc", "av1", "mjpeg", "mpeg4"].contains(&lower.as_str()),
            _ => false,
        },
        _ => false,
    }
}
impl Discovery {
    fn reason(&mut self, r: &str) {
        *self.coverage.reasons.entry(r.into()).or_default() += 1;
        self.coverage.limited = true;
    }
    fn observe(&mut self, id: &str, key: &str, value: &str, line: usize, record: usize) {
        let key = key.to_ascii_lowercase().replace([' ', '-'], "_");
        let Some(field) = field(&key) else { return };
        if !valid_value(field, &key, value) {
            self.reason("unsafe_value");
            return;
        }
        if field == "model" {
            if self.models.len() < 2 {
                self.models.insert(value.to_owned());
            }
            self.coverage.multiple_model_values |= self.models.len() > 1;
        }
        if self.observations.len() >= 128 || !self.sources.iter().any(|s| s.id == id) {
            self.coverage.omitted_observations += 1;
            self.reason("observation_limit");
            return;
        }
        self.observations.push(Observation {
            source_id: id.into(),
            field: field.into(),
            key,
            value: value.into(),
            line,
            record,
            scope: "unbound".into(),
        });
        self.coverage.retained_observations = self.observations.len();
    }
    fn json(&mut self, id: &str, v: &Value, line: usize, record: &mut usize) {
        match v {
            Value::Object(m) => {
                let r = *record;
                *record += 1;
                for (k, v) in m {
                    match v {
                        Value::String(s) => self.observe(id, k, s, line, r),
                        Value::Number(n) => self.observe(id, k, &n.to_string(), line, r),
                        _ => {}
                    }
                    self.json(id, v, line, record);
                }
            }
            Value::Array(a) => {
                for v in a {
                    self.json(id, v, line, record)
                }
            }
            _ => {}
        }
    }
    fn parse(&mut self, id: &str, text: &str) -> String {
        let text = text.trim_start_matches('\u{feff}');
        let t = text.trim();
        if t.starts_with('<') {
            self.reason("unsupported_format");
            return "xml".into();
        }
        if let Ok(v) = serde_json::from_str::<crate::ddpai_log::Unique>(t) {
            // Whole JSON is located at document granularity: zero means no exact line.
            self.json(id, &v.0, 0, &mut 0);
            return "json".into();
        }
        let array_json = t.strip_prefix('[').is_some_and(|rest| {
            rest.trim_start().starts_with(['{', '[', '"']) || rest.trim().is_empty()
        });
        if (t.starts_with('{') || array_json)
            && serde_json::from_str::<crate::ddpai_log::Unique>(t.lines().next().unwrap_or(""))
                .is_err()
        {
            self.reason("malformed");
            return "json".into();
        }
        let mut format = "unknown";
        let mut record = 0;
        let mut seen = BTreeSet::new();
        for (i, line) in text.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() || line.starts_with([';', '#']) {
                continue;
            }
            if line.starts_with('[') && line.ends_with(']') && !line.contains('{') {
                format = "ini";
                record += 1;
                seen.clear();
                continue;
            }
            if line.contains('{') {
                if let Some(payload) = crate::ddpai_log::payload(line) {
                    match serde_json::from_str::<crate::ddpai_log::Unique>(payload) {
                        Ok(v) => {
                            if !seen.is_empty() { record += 1; seen.clear(); }
                            self.json(id, &v.0, i + 1, &mut record);
                            format = "framed_json";
                        }
                        Err(_) => self.reason("malformed"),
                    }
                } else {
                    self.reason("malformed")
                }
                continue;
            }
            if let Some((key, value)) = line.split_once('=').or_else(|| line.split_once(':')) {
                if format == "unknown" {
                    format = "key_value"
                }
                let key = key.trim().to_ascii_lowercase().replace([' ', '-'], "_");
                // Preserve duplicate declarations as separate records, never last-wins collapse.
                if !seen.insert(key.clone()) {
                    record += 1;
                    seen.clear();
                    seen.insert(key.clone());
                }
                let value = value.trim();
                let value = if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
                    &value[1..value.len() - 1]
                } else {
                    value
                };
                self.observe(id, &key, value, i + 1, record);
            } else if t.starts_with(['{', '[']) {
                self.reason("malformed");
            }
        }
        if format == "unknown" {
            self.reason("unsupported_format")
        }
        format.into()
    }
    pub fn inspect(&mut self, dir: &Dir, path: &Path, size: u64, cancel: &AtomicBool) {
        self.inspect_with_hook(dir, path, size, cancel, || {});
    }
    fn inspect_with_hook(
        &mut self,
        dir: &Dir,
        path: &Path,
        size: u64,
        cancel: &AtomicBool,
        after_read: impl FnOnce(),
    ) {
        self.coverage.inventoried_candidates += 1;
        self.coverage.uninspected_files += 1;
        if cancel.load(Ordering::Relaxed) {
            self.coverage.limited = true;
            return;
        }
        if self.coverage.inspected_files >= 256 {
            self.reason("file_limit");
            return;
        }
        if size > 65536 {
            self.reason("oversize");
            return;
        }
        if self.coverage.bytes_read + size as usize > 4 * 1024 * 1024 {
            self.reason("byte_limit");
            return;
        }
        self.coverage.inspected_files += 1;
        self.coverage.uninspected_files -= 1;
        let id = format!("support-{}", self.coverage.inventoried_candidates);
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No).nonblock(true);
        let result = (|| {
            let before = dir.symlink_metadata(path).map_err(|_| "read_error")?;
            let mut f = dir.open_with(path, &options).map_err(|_| "read_error")?;
            let opened = f.metadata().map_err(|_| "read_error")?;
            if !opened.is_file()
                || !before.is_file()
                || !same(&before, &opened)
                || opened.len() != size
            {
                return Err("changed_source");
            }
            let mut bytes = Vec::new();
            let read = f.by_ref().take(size).read_to_end(&mut bytes);
            self.coverage.bytes_read += bytes.len();
            read.map_err(|_| "read_error")?;
            after_read();
            let after = f.metadata().map_err(|_| "read_error")?;
            let named = dir.symlink_metadata(path).map_err(|_| "changed_source")?;
            if !same(&opened, &after) || !same(&after, &named) || bytes.len() as u64 != size {
                return Err("changed_source");
            }
            Ok(bytes)
        })();
        let bytes = match result {
            Ok(b) => b,
            Err(r) => {
                self.reason(r);
                return;
            }
        };
        if cancel.load(Ordering::Relaxed) {
            self.coverage.limited = true;
            return;
        }
        let mut format = "unknown".to_string();
        let mut encoding = "unknown";
        if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            format = "jpeg".into();
            encoding = "binary"
        } else if [b"ftyp", b"moov", b"mdat", b"styp"]
            .iter()
            .any(|tag| bytes.get(4..8) == Some(tag.as_slice()))
        {
            format = "isobmff".into();
            encoding = "binary"
        } else if bytes.get(257..262) == Some(b"ustar") {
            format = "tar".into();
            encoding = "binary"
        } else if bytes.contains(&0)
            && !bytes.starts_with(&[0xff, 0xfe])
            && !bytes.starts_with(&[0xfe, 0xff])
        {
            format = "binary".into();
            encoding = "binary"
        }
        // Retain facts preferentially; no-fact format representatives cannot starve them.
        if self.sources.len() >= 128 {
            if let Some(i) = self.sources.iter().position(|s| !self.observations.iter().any(|o| o.source_id == s.id)) {
                self.sources.remove(i);
                self.reason("observation_limit");
            }
        }
        if self.sources.len() < 128 {
            self.sources.push(Source {
                id: id.clone(),
                format: format.clone(),
                encoding: encoding.into(),
                size_bytes: size,
            });
        } else {
            self.reason("observation_limit");
        }
        if encoding == "binary" {
            self.reason("unsupported_format");
            return;
        }
        let decoded: Result<String, ()> =
            if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
                let le = bytes[0] == 0xff;
                encoding = if le { "utf16le" } else { "utf16be" };
                if bytes.len() % 2 != 0 {
                    Err(())
                } else {
                    String::from_utf16(
                        &bytes[2..]
                            .chunks_exact(2)
                            .map(|c| {
                                if le {
                                    u16::from_le_bytes([c[0], c[1]])
                                } else {
                                    u16::from_be_bytes([c[0], c[1]])
                                }
                            })
                            .collect::<Vec<_>>(),
                    )
                    .map_err(|_| ())
                }
            } else {
                encoding = "utf8";
                String::from_utf8(bytes).map_err(|_| ())
            };
        match decoded {
            Ok(text) => {
                if text
                    .chars()
                    .any(|c| c.is_control() && !['\n', '\r', '\t', '\x1b'].contains(&c))
                {
                    format = "binary".into();
                    encoding = "binary";
                    self.reason("unsupported_format");
                } else {
                    format = self.parse(&id, &text);
                }
            }
            Err(_) => {
                encoding = "unknown";
                self.reason("invalid_encoding");
            }
        }
        if let Some(s) = self.sources.iter_mut().find(|s| s.id == id) {
            s.format = format;
            s.encoding = encoding.into();
        }
    }
}
#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
fn same(a: &cap_std::fs::Metadata, b: &cap_std::fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt;
        if a.dev() != b.dev() || a.ino() != b.ino() {
            return false;
        }
    }
    a.is_file() == b.is_file() && a.len() == b.len() && a.modified().ok() == b.modified().ok()
}
