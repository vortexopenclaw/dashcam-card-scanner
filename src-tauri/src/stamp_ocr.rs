// SPDX-License-Identifier: AGPL-3.0-only
//! Memory-only model identity probing. Not a report or outbound payload type.
use super::{catalog, Camera};
use crate::engine::Report;
use std::{path::Path, sync::atomic::AtomicBool};

pub(super) struct Evidence {
    pub identities: std::collections::BTreeSet<usize>,
    pub complete: bool,
    /// False only for unsupported platforms or no eligible local media. Failures
    /// after an eligible sample is selected must veto label-based exact identity.
    pub attempted: bool,
}

#[cfg(not(all(target_os = "macos", not(scanner_no_native_ocr))))]
pub(super) fn probe(_: &Path, _: &Report, _: &AtomicBool, _: &mut dyn FnMut()) -> Evidence {
    Evidence {
        identities: Default::default(),
        complete: false,
        attempted: false,
    }
}

#[cfg(all(target_os = "macos", not(scanner_no_native_ocr)))]
pub(super) fn probe(
    root: &Path,
    report: &Report,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(),
) -> Evidence {
    macos::probe(root, report, cancel, progress)
}

pub(super) fn corroborates(camera: &Camera, report: &Report) -> bool {
    report.folders.iter().any(|f| {
        camera
            .folders
            .iter()
            .any(|p| p.eq_ignore_ascii_case(&f.path))
            && f.samples
                .iter()
                .any(|s| super::pattern_matches(camera, &s.local_name))
    })
}

pub(super) fn unique(evidence: &Evidence, report: &Report) -> Option<&'static Camera> {
    if !evidence.complete || evidence.identities.len() != 1 {
        return None;
    }
    let camera = catalog().get(*evidence.identities.first()?)?;
    corroborates(camera, report).then_some(camera)
}

#[cfg(all(target_os = "macos", not(scanner_no_native_ocr)))]
mod macos {
    use super::*;
    use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt, OpenOptionsSyncExt};
    use cap_std::fs::OpenOptions;
    use std::{
        fs,
        io::{Read, Write},
        os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt},
        path::Component,
        process::{Command, Stdio},
        sync::atomic::Ordering,
        time::{Duration, Instant},
    };

    const HELPER: &[u8] = include_bytes!(env!("MODEL_STAMP_HELPER"));
    const MAX_FILES: usize = 6;
    // Vision's first local model initialization can take ~50s on a cold host.
    const SCAN_BUDGET: Duration = Duration::from_secs(80);
    const FILE_BUDGET: Duration = Duration::from_secs(65);

    struct Helper(std::path::PathBuf);
    impl Drop for Helper {
        fn drop(&mut self) {
            let _ = fs::remove_file(self.0.join("model-stamp"));
            let _ = fs::remove_dir(&self.0);
        }
    }
    impl Helper {
        fn create() -> std::io::Result<Self> {
            // Unique private directory, no executable search path or mutable shared cache.
            let dir = std::env::temp_dir().join(format!("scanner-ocr-{}", uuid::Uuid::new_v4()));
            fs::DirBuilder::new().mode(0o700).create(&dir)?;
            let helper = Self(dir);
            let path = helper.0.join("model-stamp");
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o700)
                .open(&path)?;
            file.write_all(HELPER)?;
            file.sync_all()?;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o500))?;
            Ok(helper)
        }
    }

    pub(super) fn probe(
        root: &Path,
        report: &Report,
        cancel: &AtomicBool,
        progress: &mut dyn FnMut(),
    ) -> Evidence {
        let start = Instant::now();
        let mut evidence = Evidence {
            identities: Default::default(),
            complete: true,
            attempted: false,
        };
        let fail = || Evidence {
            identities: Default::default(),
            complete: false,
            attempted: true,
        };
        if cancel.load(Ordering::Relaxed) {
            return fail();
        }
        let Ok(root) = crate::engine::safe_root(root) else {
            return fail();
        };
        let Ok(helper) = Helper::create() else {
            return fail();
        };
        // All known identities, not merely current pattern candidates: a sibling stamp
        // must veto a spoofed label, even when its own structure cannot be corroborated.
        let stamps: Vec<_> = catalog()
            .iter()
            .map(|c| format!("{} {}", c.manufacturer, c.model))
            .collect();
        let Ok(stamps) = serde_json::to_string(&stamps) else {
            return fail();
        };
        let mut attempts = 0;
        for (folder_index, sample) in crate::intake::selected_samples(report) {
            let Some(folder) = report.folders.get(folder_index) else {
                continue;
            };
            // Sanitized aliases are NOT source paths. Only canonical camera folders
            // retained verbatim by engine::camera_component are eligible.
            if !catalog().iter().any(|c| {
                c.folders
                    .iter()
                    .any(|p| p.eq_ignore_ascii_case(&folder.path))
            }) {
                continue;
            }
            let name = Path::new(&sample.local_name);
            if name.components().count() != 1
                || !name.components().all(|c| matches!(c, Component::Normal(_)))
            {
                continue;
            }
            if !name
                .extension()
                .and_then(|x| x.to_str())
                .is_some_and(|e| ["mp4", "mov", "m4v"].contains(&e.to_ascii_lowercase().as_str()))
            {
                continue;
            }
            if attempts == MAX_FILES {
                break;
            }
            if cancel.load(Ordering::Relaxed) || start.elapsed() >= SCAN_BUDGET {
                evidence.complete = false;
                break;
            }
            attempts += 1;
            evidence.attempted = true;
            progress();
            let Ok(dir) = crate::engine::open_dir_secure(&root.join(&folder.path)) else {
                evidence.complete = false;
                continue;
            };
            let mut options = OpenOptions::new();
            options.read(true).follow(FollowSymlinks::No).nonblock(true);
            let Ok(file) = dir.open_with(name, &options) else {
                evidence.complete = false;
                continue;
            };
            if !file.metadata().is_ok_and(|m| m.is_file() && m.len() > 0) {
                evidence.complete = false;
                continue;
            }
            // No pathname is ever passed to AVFoundation: fd 0 owns the opened inode,
            // so swapping root/directories/filename cannot redirect the decoder.
            // Defense in depth: the decoder receives no inherited credentials,
            // cannot use the network/exec/keychain service, and cannot read common
            // credential stores. This is not a complete filesystem allowlist:
            // Apple's Vision runtime still needs its model/cache resources.
            let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else {
                evidence.complete = false;
                continue;
            };
            let media = root.join(&folder.path).join(name);
            let quote = |p: &Path| serde_json::to_string(&p.to_string_lossy()).unwrap();
            let stores = [
                ".ssh",
                ".aws",
                ".azure",
                ".config",
                ".kube",
                ".gnupg",
                ".hermes",
                ".openclaw",
                ".docker",
                ".netrc",
                ".env",
                "Library/Keychains",
                "Library/Cookies",
                "Library/Safari",
                "Library/Application Support/1Password",
                "Library/Application Support/Google/Chrome",
                "Library/Application Support/Firefox",
            ];
            let denied = stores
                .iter()
                .map(|p| format!("(subpath {})", quote(&home.join(p))))
                .collect::<String>();
            let policy = format!(
                r#"(version 1)(allow default)(deny network*)(deny process-exec)(deny process-fork)(deny mach-lookup (global-name "com.apple.securityd") (global-name "com.apple.coreservices.launchservicesd"))(deny file-read* file-write* {denied} (regex #"(^|/)[.]env([.][^/]*)?$"))(deny file-write* (subpath {}))(allow file-read* (literal {}) (subpath {}))(allow file-write* (subpath {}))"#,
                quote(&root),
                quote(&media),
                quote(&helper.0),
                quote(&helper.0)
            );
            let mut child = match Command::new(helper.0.join("model-stamp"))
                .env_clear()
                .env("PATH", "/usr/bin:/bin")
                .arg(&stamps)
                .arg(policy)
                .stdin(Stdio::from(file.into_std()))
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
            {
                Ok(c) => c,
                Err(_) => {
                    evidence.complete = false;
                    continue;
                }
            };
            let deadline = Instant::now();
            let mut last_progress = Instant::now();
            let status = loop {
                if last_progress.elapsed() >= Duration::from_millis(250) {
                    progress();
                    last_progress = Instant::now();
                }
                if cancel.load(Ordering::Relaxed)
                    || start.elapsed() >= SCAN_BUDGET
                    || deadline.elapsed() >= FILE_BUDGET
                {
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                match child.try_wait() {
                    Ok(Some(s)) => break Some(s),
                    Ok(None) => std::thread::sleep(Duration::from_millis(20)),
                    Err(_) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break None;
                    }
                }
            };
            if !status.is_some_and(|s| s.success()) {
                evidence.complete = false;
                continue;
            }
            let mut bytes = Vec::new();
            if child
                .stdout
                .take()
                .unwrap()
                .take(1025)
                .read_to_end(&mut bytes)
                .is_err()
                || bytes.len() > 1024
            {
                evidence.complete = false;
                continue;
            }
            let Ok(text) = std::str::from_utf8(&bytes) else {
                evidence.complete = false;
                continue;
            };
            let text = text.trim();
            if text.is_empty() {
                // A successfully examined frame can have its model stamp disabled.
                // No match is not a contradictory identity or a failed worker.
                continue;
            }
            for token in text.split(',') {
                match token.parse::<usize>() {
                    Ok(index) if index < catalog().len() => {
                        evidence.identities.insert(index);
                    }
                    _ => evidence.complete = false,
                }
            }
        }
        if attempts == 0 || cancel.load(Ordering::Relaxed) {
            evidence.complete = false;
        }
        evidence
    }
}
