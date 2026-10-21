// SPDX-License-Identifier: AGPL-3.0-only
//! Memory-only, single-use native challenge binding. Never Debug/log this state.
use std::time::{Duration, Instant};
use tauri::Url;

pub const ORIGIN: &str = "https://dashcam-card-scanner-intake.vortexradar.workers.dev";
pub fn trusted_main(label: &str, url: &Url) -> bool {
    label == "main"
        && url.username().is_empty()
        && url.password().is_none()
        && ((url.scheme() == "tauri"
            && url.host_str() == Some("localhost")
            && url.port().is_none())
            || url.origin().ascii_serialization() == "http://tauri.localhost"
            || (cfg!(debug_assertions)
                && url.origin().ascii_serialization() == "http://localhost:5173"))
}
pub fn hex64(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn fixed_origin(url: &Url) -> bool {
    url.origin().ascii_serialization() == ORIGIN
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
}
pub fn allowed_navigation(url: &Url) -> bool {
    (fixed_origin(url) && url.path() == "/challenge")
        || (url.scheme() == "https"
            && url.host_str() == Some("challenges.cloudflare.com")
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none())
        || matches!(url.as_str(), "about:blank" | "about:srcdoc")
}
// Fixed field order, no percent decoding, duplicate keys, arbitrary callback, or query strings.
fn completion(url: &Url) -> Option<(&str, &str, &str)> {
    if !fixed_origin(url) || url.path() != "/app-complete" {
        return None;
    }
    let fields: Vec<_> = url.fragment()?.split('&').collect();
    if fields.len() != 3 {
        return None;
    }
    let state = fields[0].strip_prefix("state=")?;
    let hash = fields[1].strip_prefix("hash=")?;
    let result = fields[2];
    if !hex64(state) || !hex64(hash) {
        return None;
    }
    Some((state, hash, result))
}
pub struct Session {
    pub token: String,
    pub hash: String,
    pub label: String,
    pub nonce: String,
    started: Instant,
    ticket: Option<String>,
    completed: bool,
}
pub enum Outcome {
    Complete(String),
    Failed(&'static str),
}
impl Session {
    pub fn is_complete(&self) -> bool {
        self.completed
    }
    pub fn new(token: String, hash: String) -> Self {
        let nonce = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        Self {
            token,
            hash,
            label: format!("verification-{}", uuid::Uuid::new_v4().simple()),
            nonce,
            started: Instant::now(),
            ticket: None,
            completed: false,
        }
    }
    pub fn url(&self) -> Url {
        format!(
            "{ORIGIN}/challenge#app=1&hash={}&state={}",
            self.hash, self.nonce
        )
        .parse()
        .expect("fixed challenge URL")
    }
    pub fn accept(
        &mut self,
        label: &str,
        current: Option<(&str, &str)>,
        url: &Url,
    ) -> Option<Outcome> {
        if self.label != label || self.completed {
            return None;
        }
        let (state, hash, result) = completion(url)?;
        if state != self.nonce || hash != self.hash {
            return None;
        }
        self.completed = true;
        if current != Some((self.token.as_str(), self.hash.as_str())) {
            return Some(Outcome::Failed("stale"));
        }
        if self.started.elapsed() > Duration::from_secs(300) {
            return Some(Outcome::Failed("expired"));
        }
        if let Some(ticket) = result.strip_prefix("ticket=").filter(|t| hex64(t)) {
            self.ticket = Some(ticket.into());
            return Some(Outcome::Complete(ticket.into()));
        }
        match result {
            "error=challenge" => Some(Outcome::Failed("challenge")),
            "error=expired" => Some(Outcome::Failed("expired")),
            _ => Some(Outcome::Failed("invalid_completion")),
        }
    }
    pub fn redeem(&mut self, token: &str, hash: &str, ticket: &str) -> bool {
        let approved = self.ticket.take(); // Every attempt consumes local approval, even on mismatch.
        self.token == token
            && self.hash == hash
            && hex64(ticket)
            && self.started.elapsed() <= Duration::from_secs(300)
            && approved.as_deref() == Some(ticket)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_webviews_never_receive_application_commands() {
        for local in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/index.html",
        ] {
            let url = local.parse().unwrap();
            assert!(trusted_main("main", &url));
            assert!(!trusted_main("verification-window", &url));
        }
        for remote in [
            ORIGIN,
            "https://challenges.cloudflare.com",
            "https://evil.example",
            "tauri://evil/index.html",
            "http://localhost:5174",
            "http://user@tauri.localhost",
        ] {
            assert!(!trusted_main("main", &remote.parse().unwrap()));
        }
    }
    #[test]
    fn wrong_ticket_and_changed_hash_consume_approval() {
        for changed in [true, false] {
            let mut s = Session::new("review".into(), "a".repeat(64));
            let url = callback(&s, &format!("ticket={}", "b".repeat(64)));
            let label = s.label.clone();
            let hash = s.hash.clone();
            assert!(s.accept(&label, Some(("review", &hash)), &url).is_some());
            let changed_hash = "c".repeat(64);
            assert!(!s.redeem(
                "review",
                if changed { &changed_hash } else { &hash },
                &"d".repeat(64)
            ));
            assert!(!s.redeem("review", &hash, &"b".repeat(64)));
        }
    }
    fn callback(s: &Session, result: &str) -> Url {
        format!(
            "{ORIGIN}/app-complete#state={}&hash={}&{result}",
            s.nonce, s.hash
        )
        .parse()
        .unwrap()
    }
    #[test]
    fn exact_bound_one_use_handoff_and_redemption() {
        let mut s = Session::new("review".into(), "a".repeat(64));
        let url = callback(&s, &format!("ticket={}", "b".repeat(64)));
        let label = s.label.clone();
        let hash = s.hash.clone();
        assert!(s
            .accept("wrong-window", Some(("review", &hash)), &url)
            .is_none());
        assert!(matches!(
            s.accept(&label, Some(("review", &hash)), &url),
            Some(Outcome::Complete(_))
        ));
        assert!(s.accept(&label, Some(("review", &hash)), &url).is_none());
        assert!(s.redeem("review", &hash, &"b".repeat(64)));
        assert!(!s.redeem("review", &hash, &"b".repeat(64)));
    }
    #[test]
    fn stale_expiry_error_and_cancel_fail_closed() {
        for reason in ["stale", "expired", "challenge"] {
            let mut s = Session::new("review".into(), "a".repeat(64));
            if reason == "expired" {
                s.started -= Duration::from_secs(301);
            }
            let url = callback(&s, "error=challenge");
            let label = s.label.clone();
            let hash = s.hash.clone();
            let token = if reason == "stale" {
                "changed"
            } else {
                "review"
            };
            assert!(
                matches!(s.accept(&label, Some((token, &hash)), &url), Some(Outcome::Failed(r)) if r == reason)
            );
            assert!(!s.redeem("review", &hash, &"b".repeat(64)));
        }
        let s = Session::new("review".into(), "a".repeat(64));
        let mut active = Some(s);
        active.take();
        assert!(active.is_none());
    }
    #[test]
    fn callback_origin_path_query_fields_and_nonce_are_strict() {
        let mut s = Session::new("review".into(), "a".repeat(64));
        let valid = callback(&s, &format!("ticket={}", "b".repeat(64))).to_string();
        let label = s.label.clone();
        let hash = s.hash.clone();
        for bad in [
            valid.replace(ORIGIN, "https://evil.example"),
            valid.replace("/app-complete", "/app-complete/"),
            valid.replace("#", "?x=1#"),
            valid.replace("https://", "https://user@"),
            valid.replace(&s.nonce, &"c".repeat(64)),
            format!("{valid}&ticket={}", "b".repeat(64)),
        ] {
            assert!(s
                .accept(&label, Some(("review", &hash)), &bad.parse().unwrap())
                .is_none());
        }
        for bad in [
            "https://evil.example/",
            "http://challenges.cloudflare.com/",
            "https://challenges.cloudflare.com.evil.example/",
            "file:///etc/passwd",
            "tauri://localhost/",
            "https://dashcam-card-scanner-intake.vortexradar.workers.dev/submit",
        ] {
            assert!(!allowed_navigation(&bad.parse().unwrap()));
        }
        assert!(allowed_navigation(&s.url()));
        assert!(allowed_navigation(
            &"https://challenges.cloudflare.com/turnstile/v0/x"
                .parse()
                .unwrap()
        ));
        for t in [
            "A".repeat(64),
            "a".repeat(63),
            format!("{}%61", "a".repeat(61)),
        ] {
            assert!(!hex64(&t));
        }
    }
}
