// SPDX-License-Identifier: AGPL-3.0-only
//! Custom IPC remains restricted even without a remote verification webview.
use tauri::Url;
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
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn commands_require_main_and_local_origin() {
        for local in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/index.html",
        ] {
            let url = local.parse().unwrap();
            assert!(trusted_main("main", &url));
            assert!(!trusted_main("other", &url));
        }
        for remote in [
            "https://dashcam-card-scanner-intake.vortexradar.workers.dev",
            "https://challenges.cloudflare.com",
            "https://evil.example",
            "tauri://evil/index.html",
            "http://localhost:5174",
            "http://user@tauri.localhost",
            "tauri://localhost:123/index.html",
        ] {
            assert!(!trusted_main("main", &remote.parse().unwrap()));
        }
        assert_eq!(
            trusted_main("main", &"http://localhost:5173".parse().unwrap()),
            cfg!(debug_assertions)
        );
    }
}
