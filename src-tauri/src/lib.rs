// SPDX-License-Identifier: AGPL-3.0-only
pub mod engine;
pub mod intake;
pub mod payload;
pub mod video;
use payload::{Labels, Review};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
#[derive(Default)]
struct Data {
    source: Option<PathBuf>,
    report: Option<engine::Report>,
    review: Option<Review>,
    update: Option<String>,
}
#[derive(Default)]
struct AppState {
    data: Mutex<Data>,
    busy: AtomicBool,
    cancel: Arc<AtomicBool>,
}
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
fn lock(s: &AppState) -> Result<std::sync::MutexGuard<'_, Data>, String> {
    s.data
        .lock()
        .map_err(|_| "State unavailable; restart the app.".into())
}
fn begin(s: &AppState) -> Result<Busy<'_>, String> {
    s.busy
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "An operation is already running.")?;
    Ok(Busy(&s.busy))
}
#[tauri::command]
async fn choose_source(
    app: tauri::AppHandle,
    s: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let _busy = begin(&s)?;
    let chosen =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
            .await
            .map_err(|_| "Folder dialog failed")?;
    if let Some(file) = chosen {
        let path = file.into_path().map_err(|_| "Local folders only")?;
        let path = engine::safe_root(&path)?;
        let mut d = lock(&s)?;
        let display = path.display().to_string();
        d.source = Some(path);
        d.report = None;
        d.review = None;
        Ok(Some(display))
    } else {
        Ok(None)
    }
}
#[tauri::command]
async fn scan_source(
    app: tauri::AppHandle,
    s: State<'_, AppState>,
) -> Result<engine::Report, String> {
    let _busy = begin(&s)?;
    let source = {
        let mut d = lock(&s)?;
        d.review = None;
        d.report = None;
        d.source.clone().ok_or("Choose a folder first.")?
    };
    s.cancel.store(false, Ordering::SeqCst);
    let cancel = s.cancel.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        engine::scan(&source, &cancel, |p| {
            let _ = app.emit("scan-progress", p);
        })
    })
    .await
    .map_err(|_| "Scan task failed")??;
    lock(&s)?.report = Some(result.clone());
    Ok(result)
}
#[tauri::command]
fn cancel_scan(s: State<'_, AppState>) {
    s.cancel.store(true, Ordering::SeqCst);
}
#[tauri::command]
fn prepare_review(labels: Labels, s: State<'_, AppState>) -> Result<Review, String> {
    let _busy = begin(&s)?;
    let mut d = lock(&s)?;
    d.review = None;
    let mut review = payload::prepare(d.report.as_ref().ok_or("Scan first.")?, &labels)?;
    review.payload_hash = intake::hash(review.submission_json.as_bytes());
    d.review = Some(review.clone());
    Ok(review)
}
fn reviewed(s: &AppState, token: &str) -> Result<(Review, PathBuf), String> {
    let d = lock(s)?;
    let r = d
        .review
        .as_ref()
        .filter(|r| r.token == token)
        .ok_or("Review is stale. Prepare it again.")?;
    Ok((r.clone(), d.source.clone().ok_or("No source")?))
}
pub fn export_new(source: &Path, target: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = target.parent().ok_or("Choose an export folder.")?;
    let parent = engine::safe_root(parent)?;
    let source = engine::safe_root(source)?;
    // Compare filesystem identity, not just string case/prefix (APFS and NTFS may be case-insensitive).
    let source_handle =
        same_file::Handle::from_path(&source).map_err(|_| "Source identity unavailable")?;
    let mut inside = false;
    for ancestor in parent.ancestors() {
        let handle = same_file::Handle::from_path(ancestor)
            .map_err(|_| "Export ancestor identity unavailable")?;
        if handle == source_handle {
            inside = true;
            break;
        }
    }
    if inside {
        return Err(
            "Export must be outside the source folder. No source writes are allowed.".into(),
        );
    }
    let name = target.file_name().ok_or("Choose a filename.")?;
    let name_text = name
        .to_str()
        .ok_or("Export filename must be valid Unicode")?;
    let base = name_text
        .split('.')
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if Path::new(name).components().count() != 1
        || name_text
            .chars()
            .any(|c| c.is_control() || ":<>\"|?*".contains(c))
        || name_text.ends_with(['.', ' '])
        || reserved.contains(&base.as_str())
    {
        return Err("Unsafe filename".into());
    }
    let dir = engine::open_dir_secure(&parent)?;
    let mut options = cap_std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    // Do not overwrite existing files or follow existing links/hardlinks.
    let mut f=dir.open_with(name,&options).map_err(|_|"Cannot create export. Choose a new filename outside the source (existing files are never overwritten).")?;
    f.write_all(bytes)
        .and_then(|_| f.sync_all())
        .map_err(|_| "Export failed; an incomplete destination file may remain.".into())
}
#[tauri::command]
async fn export_review(
    app: tauri::AppHandle,
    token: String,
    kind: String,
    s: State<'_, AppState>,
) -> Result<bool, String> {
    let _busy = begin(&s)?;
    let (r, source) = reviewed(&s, &token)?;
    let text = match kind.as_str() {
        "public" => r.public_json,
        "private" => r.private_json,
        _ => return Err("Unknown export format".into()),
    };
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_file_name(format!("dashcam-{kind}-scan.json"))
            .add_filter("JSON", &["json"])
            .blocking_save_file()
    })
    .await
    .map_err(|_| "Save dialog failed")?;
    if let Some(p) = chosen {
        let target = p.into_path().map_err(|_| "Local files only")?;
        tauri::async_runtime::spawn_blocking(move || export_new(&source, &target, text.as_bytes()))
            .await
            .map_err(|_| "Export task failed")??;
        Ok(true)
    } else {
        Ok(false)
    }
}
#[tauri::command]
fn begin_verification(
    app: tauri::AppHandle,
    token: String,
    s: State<'_, AppState>,
) -> Result<String, String> {
    let _busy = begin(&s)?;
    let origin = intake::origin()?;
    let (r, _) = reviewed(&s, &token)?;
    if r.submission_json.is_empty() {
        return Err(
            "No valid bounded intake envelope. Check the review warning or export locally.".into(),
        );
    }
    app.opener()
        .open_url(
            format!("{origin}/challenge#{}", r.payload_hash),
            None::<&str>,
        )
        .map_err(|_| "Browser could not be opened")?;
    Ok(format!("Verify hash {} in your browser, complete the challenge, then paste the one-use ticket here. Ticket expires after five minutes.",r.payload_hash))
}
#[tauri::command]
async fn submit_review(
    token: String,
    consent: bool,
    ticket: String,
    s: State<'_, AppState>,
) -> Result<String, String> {
    if !consent {
        return Err("Explicit submission consent is required.".into());
    }
    let _busy = begin(&s)?;
    let origin = intake::origin()?;
    let (r, _) = reviewed(&s, &token)?;
    if r.submission_json.is_empty() {
        return Err(
            "No valid bounded intake envelope. Check the review warning or export locally.".into(),
        );
    }
    if ticket.len() < 16
        || ticket.len() > 4096
        || !ticket
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
    {
        return Err("Invalid verification ticket".into());
    }
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|_| "Network client unavailable")?;
    let mut response=client.post(format!("{origin}/submit")).bearer_auth(ticket).header("Content-Type","application/json").body(r.submission_json).send().await.map_err(|_|"No confirmed receipt. Do not reuse this ticket; obtain a new challenge before retrying.")?;
    if response.status() != reqwest::StatusCode::ACCEPTED {
        return Err(format!(
            "Intake rejected submission (HTTP {}). Obtain a fresh ticket before retrying.",
            response.status().as_u16()
        ));
    }
    if response.content_length().is_some_and(|n| n > 16384) {
        return Err("Invalid intake receipt".into());
    }
    let mut receipt = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Invalid intake receipt")?
    {
        if receipt.len() + chunk.len() > 16384 {
            return Err("Oversize intake receipt".into());
        }
        receipt.extend_from_slice(&chunk);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&receipt).map_err(|_| "Invalid intake receipt")?;
    if value.get("id").and_then(|v| v.as_str()) != Some(&r.payload_hash)
        || value.get("status").and_then(|v| v.as_str()) != Some("pending")
    {
        return Err("Intake receipt did not match reviewed payload".into());
    }
    lock(&s)?.review = None;
    Ok(r.payload_hash)
}
fn updater_ready() -> bool {
    let c: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap_or_default();
    c["plugins"]["updater"]["pubkey"]
        .as_str()
        .is_some_and(|s| !s.starts_with("REPLACE_") && s.len() > 40)
}
#[tauri::command]
async fn check_update(
    app: tauri::AppHandle,
    s: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let _busy = begin(&s)?;
    lock(&s)?.update = None;
    if !updater_ready() {
        return Err("Updates are disabled in this review build: official public verification key is not provisioned. Unsigned updates are never installed.".into());
    }
    let update = app
        .updater()
        .map_err(|_| "Updater unavailable")?
        .check()
        .await
        .map_err(|_| "Update check failed")?;
    let version = update.map(|u| u.version);
    lock(&s)?.update = version.clone();
    Ok(version)
}
#[tauri::command]
async fn install_update(
    app: tauri::AppHandle,
    version: String,
    consent: bool,
    s: State<'_, AppState>,
) -> Result<(), String> {
    let _busy = begin(&s)?;
    if !consent || !updater_ready() || lock(&s)?.update.as_ref() != Some(&version) {
        return Err("Check updates and approve this version first.".into());
    }
    let update = app
        .updater()
        .map_err(|_| "Updater unavailable")?
        .check()
        .await
        .map_err(|_| "Update recheck failed")?
        .filter(|u| u.version == version)
        .ok_or("Update changed; check again.")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| {
            "Update failed verification or installation; no unsigned fallback is allowed."
        })?;
    lock(&s)?.update = None;
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            choose_source,
            scan_source,
            cancel_scan,
            prepare_review,
            export_review,
            begin_verification,
            submit_review,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("Application runtime failed");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_never_writes_source_or_overwrites() {
        let source = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        let dest = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        assert!(export_new(source.path(), &source.path().join("bad.json"), b"x").is_err());
        assert!(!source.path().join("bad.json").exists());
        let p = dest.path().join("ok.json");
        export_new(source.path(), &p, b"safe").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"safe");
        assert!(export_new(source.path(), &p, b"bad").is_err());
        assert_eq!(std::fs::read(&p).unwrap(), b"safe");
    }
    #[test]
    fn placeholder_updater_fails_closed() {
        if include_str!("../tauri.conf.json").contains("REPLACE_WITH_") {
            assert!(!updater_ready());
        }
    }

    #[test]
    fn export_rejects_device_names_and_alternate_streams() {
        let source = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        let dest = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        for name in [
            "NUL.json",
            "CON",
            "file.json:stream",
            "file?.json",
            "trailing.",
        ] {
            assert!(export_new(source.path(), &dest.path().join(name), b"x").is_err());
        }
    }
    #[cfg(unix)]
    #[test]
    fn export_rejects_symlinks_and_existing_hardlinks() {
        use std::os::unix::fs::symlink;
        let source = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        let dest = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        let original = source.path().join("original.json");
        std::fs::write(&original, b"untouched").unwrap();
        let hard = dest.path().join("hard.json");
        std::fs::hard_link(&original, &hard).unwrap();
        assert!(export_new(source.path(), &hard, b"bad").is_err());
        let link = dest.path().join("link");
        symlink(source.path(), &link).unwrap();
        assert!(export_new(source.path(), &link.join("bad.json"), b"bad").is_err());
        assert_eq!(std::fs::read(original).unwrap(), b"untouched");
    }
}
