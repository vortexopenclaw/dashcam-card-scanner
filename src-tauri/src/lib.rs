// SPDX-License-Identifier: AGPL-3.0-only
pub mod annotations;
pub mod engine;
pub mod intake;
pub mod mode_evidence;
pub mod payload;
pub mod recognition;
pub mod video;
pub mod volumes;
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
mod ipc;
mod observed_channels;
use tauri_plugin_updater::UpdaterExt;
#[derive(Default)]
struct Data {
    source: Option<PathBuf>,
    report: Option<engine::Report>,
    review: Option<Review>,
    update: Option<String>,
    // Running package metadata stays unchanged until restart. Only a successful
    // native install may set this; subsequent checks must not offer it again.
    installed_update: Option<String>,
}
impl Data {
    fn begin_update_check(&mut self) -> bool {
        if self.installed_update.is_some() {
            return false;
        }
        self.update = None;
        true
    }
    fn can_install(&self, version: &str, consent: bool) -> bool {
        consent && self.installed_update.is_none() && self.update.as_deref() == Some(version)
    }
    fn finish_install(&mut self, version: String) {
        self.update = None;
        self.installed_update = Some(version);
    }
    fn approve_restart(&self, consent: bool) -> Result<(), String> {
        if !consent {
            return Err(
                "Explicit restart consent is required. Save or export your report first.".into(),
            );
        }
        if self.installed_update.is_none() {
            return Err("Install an update successfully before restarting to finish it.".into());
        }
        Ok(())
    }
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
    let dialog_app = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        dialog_app.dialog().file().blocking_pick_folder()
    })
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
fn camera_catalog() -> Vec<recognition::Camera> {
    recognition::catalog().to_vec()
}
#[tauri::command]
async fn discover_cards() -> Result<Vec<volumes::Card>, String> {
    tauri::async_runtime::spawn_blocking(volumes::discover)
        .await
        .map_err(|_| "Card discovery failed".into())
}
#[tauri::command]
async fn select_discovered_card(id: String, s: State<'_, AppState>) -> Result<String, String> {
    let _busy = begin(&s)?;
    let path = tauri::async_runtime::spawn_blocking(move || volumes::select(&id))
        .await
        .map_err(|_| "Card selection failed")??;
    let mut d = lock(&s)?;
    let display = path.display().to_string();
    d.source = Some(path);
    d.report = None;
    d.review = None;
    Ok(display)
}
#[tauri::command]
async fn scan_source(
    app: tauri::AppHandle,
    s: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let _busy = begin(&s)?;
    let source = {
        let mut d = lock(&s)?;
        d.review = None;
        d.report = None;
        d.source.clone().ok_or("Choose a folder first.")?
    };
    s.cancel.store(false, Ordering::SeqCst);
    let cancel = s.cancel.clone();
    let (result, mut camera_recognition, channel_evidence, parking_evidence) = tauri::async_runtime::spawn_blocking(move || {
        let mut result = engine::scan(&source, &cancel, |p| {
            let _ = app.emit("scan-progress", p);
        })?;
        let (camera_recognition, camera) = recognition::recognize_with_ocr(&source, &result, &cancel, || {
            let _ = app.emit("scan-progress", serde_json::json!({"phase":"Reading camera model", "entries":result.entries_seen,"files":result.scanned_files,"probed":result.probe_attempts}));
        });
        if cancel.load(Ordering::SeqCst) { result.cancelled = true; }
        result.recognized_camera_id = camera.map(|camera| camera.id.clone());
        let channel_evidence = observed_channels::observed_channels(&result, result.recognized_camera_id.as_deref());
        let parking_evidence = mode_evidence::parking_evidence(&result, result.recognized_camera_id.as_deref());
        Ok::<_, String>((result, camera_recognition, channel_evidence, parking_evidence))
    })
    .await
    .map_err(|_| "Scan task failed")??;
    // Only observed card roles prefill channel count, not the profile's maximum.
    if let Some(fields) = camera_recognition.as_object_mut() {
        fields.remove("channelCount");
        fields.remove("channelSetup");
        if let Some(count) = channel_evidence.count {
            fields.insert("channelCount".into(), serde_json::json!(count));
        }
        if let Some(setup) = &channel_evidence.setup {
            fields.insert("channelSetup".into(), serde_json::json!(setup));
        }
    }
    // Local IPC-only review associations; report serializers never contain basenames.
    lock(&s)?.report = Some(result.clone());
    let samples:Vec<_>=intake::selected_samples(&result).iter().enumerate().map(|(index,(folder,sample))| {
        let mut value=serde_json::json!({"index":index,"folderIndex":folder,"folder":result.folders[*folder].path,"localName":sample.local_name,"filenameTemplate":sample.filename_template,"sizeBytes":sample.file_size_bytes,"video":sample.video});
        let (channel,mode)=intake::sample_hints_for_folder(&sample.local_name,&result.folders[*folder].path,result.recognized_camera_id.as_deref());
        if channel != "unknown" { value["roleHint"]=serde_json::json!(channel); }
        if mode != "unknown" { value["modeHint"]=serde_json::json!(mode); }
        value["modeEvidence"]=serde_json::json!(mode_evidence::file_mode_evidence(&sample.local_name,&result.folders[*folder].path,result.recognized_camera_id.as_deref()));
        value
    }).collect();
    let mut value = serde_json::to_value(&result).map_err(|_| "Scan encoding failed")?;
    value["cameraRecognition"] = camera_recognition;
    value["channelEvidence"] =
        serde_json::to_value(channel_evidence).map_err(|_| "Channel encoding failed")?;
    value["reviewSamples"] = serde_json::json!(samples);
    value["parkingEvidence"] =
        serde_json::to_value(parking_evidence).map_err(|_| "Parking evidence encoding failed")?;
    Ok(value)
}
#[tauri::command]
fn cancel_scan(s: State<'_, AppState>) {
    s.cancel.store(true, Ordering::SeqCst);
}
#[tauri::command]
fn prepare_review(
    labels: Labels,
    annotations: Option<annotations::Annotations>,
    s: State<'_, AppState>,
) -> Result<Review, String> {
    let _busy = begin(&s)?;
    let mut d = lock(&s)?;
    d.review = None;
    let report = d.report.as_ref().ok_or("Scan first.")?;
    let mut annotations = annotations.unwrap_or_default();
    annotations.assignments_required = !annotations.cohorts.is_empty();
    let mut review = annotations::prepare(report, &labels, &annotations)?;
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
// Snapshot only after explicit Submit; preparation/export never initiate network I/O.
fn submission_snapshot(s: &AppState, token: &str, consent: bool) -> Result<Review, String> {
    if !consent {
        return Err("Explicit submission consent is required.".into());
    }
    let (r, _) = reviewed(s, token)?;
    if r.submission_json.is_empty() || r.submission_json.len() > 16384 {
        return Err("No valid bounded intake envelope. Prepare the report again.".into());
    }
    if intake::hash(r.submission_json.as_bytes()) != r.payload_hash {
        return Err("Prepared payload integrity check failed".into());
    }
    Ok(r)
}
fn matching_receipt(receipt: &[u8], hash: &str) -> Result<(), String> {
    if receipt.len() > 16384 {
        return Err("Oversize intake receipt".into());
    }
    let value: serde_json::Value =
        serde_json::from_slice(receipt).map_err(|_| "Invalid intake receipt")?;
    if value.get("id").and_then(|v| v.as_str()) != Some(hash)
        || value.get("status").and_then(|v| v.as_str()) != Some("pending")
    {
        return Err("Intake receipt did not match reviewed payload".into());
    }
    Ok(())
}
fn submission_rejection(status: u16, bytes: &[u8]) -> &'static str {
    let value = serde_json::from_slice::<serde_json::Value>(bytes).ok();
    let code = value
        .as_ref()
        .and_then(|v| v.get("error"))
        .and_then(|v| v.as_str());
    match (status, code) {
        (429, Some("storage_capacity")) => "submission:storage_capacity",
        (429, _) => "submission:rate_limited",
        (400 | 413 | 422, _) => "submission:invalid_report",
        (500..=599, _) => "submission:service_unavailable",
        _ => "submission:service_rejected",
    }
}
#[tauri::command]
async fn submit_review(
    token: String,
    consent: bool,
    s: State<'_, AppState>,
) -> Result<String, String> {
    let _busy = begin(&s)?;
    let r = submission_snapshot(&s, &token, consent)?;
    let (client, request) = direct_request(&r.submission_json)?;
    let mut response = client.execute(request).await.map_err(|error| {
        if error.is_timeout() {
            "submission:network_timeout"
        } else {
            "submission:network_unavailable"
        }
    })?;
    let response_status = response.status();
    if response.content_length().is_some_and(|n| n > 16384) {
        return Err(if response_status == reqwest::StatusCode::ACCEPTED {
            "submission:receipt_unconfirmed"
        } else {
            submission_rejection(response_status.as_u16(), &[])
        }
        .into());
    }
    let mut receipt = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Invalid intake receipt")?
    {
        if receipt.len() + chunk.len() > 16384 {
            return Err("submission:receipt_unconfirmed".into());
        }
        receipt.extend_from_slice(&chunk);
    }
    if response_status != reqwest::StatusCode::ACCEPTED {
        return Err(submission_rejection(response_status.as_u16(), &receipt).into());
    }
    matching_receipt(&receipt, &r.payload_hash).map_err(|_| "submission:receipt_unconfirmed")?;
    lock(&s)?.review = None;
    Ok(r.payload_hash)
}
fn direct_request(bytes: &str) -> Result<(reqwest::Client, reqwest::Request), String> {
    let origin = intake::origin()?;
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|_| "Network client unavailable")?;
    let request = client
        .post(format!("{origin}/submit-direct"))
        .header("Content-Type", "application/json")
        .body(bytes.to_owned())
        .build()
        .map_err(|_| "Submission request unavailable")?;
    Ok((client, request))
}
#[derive(Clone, serde::Serialize)]
struct UpdateProgress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
}
impl Default for UpdateProgress {
    fn default() -> Self {
        Self {
            phase: "downloading",
            downloaded: 0,
            total: None,
        }
    }
}
impl UpdateProgress {
    fn chunk(&mut self, bytes: usize, total: Option<u64>) {
        self.downloaded = self.downloaded.saturating_add(bytes as u64);
        self.total = total;
    }
}
fn update_error(error: &tauri_plugin_updater::Error) -> &'static str {
    use tauri_plugin_updater::Error;
    // Never expose upstream URLs, paths, signature bytes or arbitrary server text.
    match error {
        Error::Reqwest(_) | Error::Network(_) =>
            "Update download failed. Check your internet connection and retry.",
        Error::Minisign(_) | Error::Base64(_) | Error::SignatureUtf8(_)
        | Error::SignedVersionMismatch { .. } | Error::MissingSignedVersion =>
            "Update signature verification failed. Nothing was installed. Retry later or contact support; unsigned updates are never allowed.",
        #[cfg(target_os = "macos")]
        Error::Io(error) if error.kind() == std::io::ErrorKind::ReadOnlyFilesystem =>
            "The update cannot be installed on this read-only volume or disk image. Move Dashcam Card Scanner to Applications, open it there, then retry.",
        Error::Io(_) | Error::TempDirNotOnSameMountPoint | Error::TempDirNotFound
        | Error::FailedToDetermineExtractPath =>
            "Update installation failed. Check that the app location is writable and there is enough free disk space, then retry.",
        Error::PreviousAppNotRestored(_) =>
            "Update installation failed and the previous app could not be restored automatically. Do not restart; contact support to recover the app.",
        Error::ReleaseNotFound | Error::Serialization(_) | Error::TargetNotFound(_)
        | Error::TargetsNotFound(_) =>
            "Update information is unavailable for this platform. Retry later.",
        _ => "Update could not be installed. Retry later or contact support; no unsigned fallback is allowed.",
    }
}

#[tauri::command]
fn app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}
#[tauri::command]
fn restart_app(app: tauri::AppHandle, consent: bool, s: State<'_, AppState>) -> Result<(), String> {
    let _busy = begin(&s)?;
    lock(&s)?.approve_restart(consent)?;
    // Tauri relaunches the current trusted installed bundle; no renderer path,
    // process plugin permission or shell helper is involved.
    app.restart();
}
fn updater_ready() -> bool {
    let c: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap_or_default();
    c["plugins"]["updater"]["pubkey"]
        .as_str()
        .is_some_and(|s| !s.starts_with("REPLACE_") && s.len() > 40)
}
fn approved_update_target(url: &tauri::Url, version: &str) -> bool {
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    let Some(segments) = url.path_segments() else {
        return false;
    };
    let parts: Vec<_> = segments.collect();
    parts.len() == 6
        && parts[..4]
            == [
                "vortexopenclaw",
                "dashcam-card-scanner",
                "releases",
                "download",
            ]
        && [format!("v{version}"), format!("v{version}-mac")].contains(&parts[4].to_owned())
        && !parts[5].is_empty()
        && !parts[5].contains('%')
}
#[tauri::command]
async fn check_update(
    app: tauri::AppHandle,
    s: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let _busy = begin(&s)?;
    if !lock(&s)?.begin_update_check() {
        return Ok(None);
    }
    if !updater_ready() {
        return Err("Updates are disabled in this review build: official public verification key is not provisioned. Unsigned updates are never installed.".into());
    }
    let update = app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(20))
        .configure_client(|b| {
            b.https_only(true)
                .connect_timeout(std::time::Duration::from_secs(10))
        })
        .build()
        .map_err(|_| "Updater unavailable")?
        .check()
        .await
        .map_err(|error| format!("Update check failed. {}", update_error(&error)))?;
    if update
        .as_ref()
        .is_some_and(|u| !approved_update_target(&u.download_url, &u.version))
    {
        return Err(
            "Update source rejected. Only official versioned release assets are allowed.".into(),
        );
    }
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
    if !updater_ready() || !lock(&s)?.can_install(&version, consent) {
        return Err("Check updates and approve this version first.".into());
    }

    let mut update = app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(20))
        .configure_client(|b| {
            b.https_only(true)
                .connect_timeout(std::time::Duration::from_secs(10))
        })
        .build()
        .map_err(|_| "Updater unavailable")?
        .check()
        .await
        .map_err(|error| format!("Update recheck failed. {}", update_error(&error)))?
        .filter(|u| u.version == version && approved_update_target(&u.download_url, &u.version))
        .ok_or("Update source or version changed; check again.")?;
    update.timeout = Some(std::time::Duration::from_secs(600));
    let progress = Mutex::new(UpdateProgress::default());
    let _ = app.emit("update-progress", progress.lock().unwrap().clone());
    update
        .download_and_install(
            |bytes, total| {
                let mut p = progress.lock().unwrap();
                p.chunk(bytes, total);
                let _ = app.emit("update-progress", p.clone());
            },
            || {
                let mut p = progress.lock().unwrap();
                // The plugin verifies the signature after this callback and
                // before touching the installation. This is not success yet.
                p.phase = "installing";
                let _ = app.emit("update-progress", p.clone());
            },
        )
        .await
        .map_err(|error| update_error(&error))?;
    // Do not mark installed on download completion, signature failure, or a
    // failed bundle replacement. The running package version remains unchanged.
    lock(&s)?.finish_install(version);
    let mut p = progress.lock().unwrap();
    p.phase = "installed";
    let _ = app.emit("update-progress", p.clone());
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(|invoke| {
            // Only the main local-origin webview may invoke application commands.
            let webview = invoke.message.webview_ref();
            if !webview
                .url()
                .is_ok_and(|url| ipc::trusted_main(webview.label(), &url))
            {
                invoke
                    .resolver
                    .reject("Remote application commands are forbidden");
                return true;
            }
            let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
                choose_source,
                camera_catalog,
                discover_cards,
                select_discovered_card,
                scan_source,
                cancel_scan,
                prepare_review,
                export_review,
                submit_review,
                check_update,
                install_update,
                app_version,
                restart_app
            ];
            handler(invoke)
        })
        .run(tauri::generate_context!())
        .expect("Application runtime failed");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn updates_require_official_immutable_same_version_release_assets() {
        for tag in ["v0.1.8", "v0.1.8-mac"] {
            let url = format!("https://github.com/vortexopenclaw/dashcam-card-scanner/releases/download/{tag}/Dashcam-Card-Scanner.app.tar.gz");
            assert!(approved_update_target(&url.parse().unwrap(), "0.1.8"));
        }
        for bad in [
            "http://github.com/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.8/a",
            "https://evil.example/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.8/a",
            "https://github.com/attacker/dashcam-card-scanner/releases/download/v0.1.8/a",
            "https://github.com/vortexopenclaw/other/releases/download/v0.1.8/a",
            "https://github.com/vortexopenclaw/dashcam-card-scanner/releases/latest/download/a",
            "https://github.com/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.9/a",
            "https://user@github.com/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.8/a",
            "https://github.com:8443/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.8/a",
            "https://github.com/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.8/a?redirect=https://evil.example",
            "https://github.com/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.8/a#fragment",
            "https://github.com/vortexopenclaw/dashcam-card-scanner/releases/download/v0.1.8/a%2Foutside",
        ] {
            assert!(!approved_update_target(&bad.parse().unwrap(), "0.1.8"), "{bad}");
        }
    }
    #[test]
    #[ignore = "developer-only live synthetic intake acceptance; explicit fixture required"]
    fn live_native_direct_submission_receives_matching_receipt() {
        let path = std::env::var_os("SCANNER_LIVE_SYNTHETIC_SUBMISSION")
            .expect("explicit synthetic fixture required");
        let bytes = std::fs::read_to_string(path).unwrap();
        let fixture: serde_json::Value = serde_json::from_str(&bytes).unwrap();
        assert_eq!(fixture["owner"]["manufacturer"], "Synthetic");
        assert_eq!(fixture["owner"]["model"], "Fixture");
        let hash = intake::hash(bytes.as_bytes());
        tauri::async_runtime::block_on(async {
            let (client, request) = direct_request(&bytes).unwrap();
            let mut response = match client.execute(request).await {
                Ok(response) => response,
                Err(error) => panic!(
                    "Native synthetic transport failed: timeout={} connect={}",
                    error.is_timeout(),
                    error.is_connect()
                ),
            };
            let status = response.status();
            let mut receipt = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .expect("bounded response read failed")
            {
                assert!(receipt.len() + chunk.len() <= 16384);
                receipt.extend_from_slice(&chunk);
            }
            println!("Native synthetic intake HTTP {}", status.as_u16());
            assert_eq!(status, reqwest::StatusCode::ACCEPTED);
            matching_receipt(&receipt, &hash).unwrap();
            println!("Native exact-byte matching receipt verified; no owner media used.");
        });
    }
    #[test]
    fn submission_failures_classify_only_allowlisted_status_and_codes() {
        assert_eq!(
            submission_rejection(429, br#"{"error":"storage_capacity"}"#),
            "submission:storage_capacity"
        );
        assert_eq!(
            submission_rejection(429, br#"{"error":"rate_limited"}"#),
            "submission:rate_limited"
        );
        assert_eq!(
            submission_rejection(400, b"private upstream text"),
            "submission:invalid_report"
        );
        assert_eq!(
            submission_rejection(503, b"private upstream text"),
            "submission:service_unavailable"
        );
        assert_eq!(
            submission_rejection(403, br#"{"error":"AUDIT_ONLY_FAKE_SECRET"}"#),
            "submission:service_rejected"
        );
    }
    #[test]
    fn direct_request_is_fixed_https_exact_bytes_without_authorization() {
        let bytes = "{\"synthetic\":true}\n";
        let (_, request) = direct_request(bytes).unwrap();
        assert_eq!(request.method(), reqwest::Method::POST);
        assert_eq!(
            request.url().as_str(),
            "https://dashcam-card-scanner-intake.vortexradar.workers.dev/submit-direct"
        );
        assert_eq!(request.headers()["content-type"], "application/json");
        assert!(!request.headers().contains_key("authorization"));
        assert_eq!(
            request.body().unwrap().as_bytes().unwrap(),
            bytes.as_bytes()
        );
    }

    #[test]
    fn direct_submit_requires_consent_current_token_and_exact_frozen_bytes() {
        let s = AppState::default();
        let bytes = "{\"synthetic\":true}\n";
        let hash = intake::hash(bytes.as_bytes());
        lock(&s).unwrap().source = Some(PathBuf::from("synthetic-source"));
        lock(&s).unwrap().review = Some(Review {
            token: "prepared-token".into(),
            public_json: String::new(),
            submission_json: bytes.into(),
            private_json: String::new(),
            payload_hash: hash.clone(),
            warning: String::new(),
            submission_available: true,
        });
        assert!(submission_snapshot(&s, "prepared-token", false).is_err());
        assert!(submission_snapshot(&s, "stale-token", true).is_err());
        let frozen = submission_snapshot(&s, "prepared-token", true).unwrap();
        assert_eq!(frozen.submission_json.as_bytes(), bytes.as_bytes());
        assert_eq!(frozen.payload_hash, hash);
        // Failed requests may be retried with the same reviewed bytes; no ticket state.
        assert!(submission_snapshot(&s, "prepared-token", true).is_ok());
        lock(&s)
            .unwrap()
            .review
            .as_mut()
            .unwrap()
            .submission_json
            .push(' ');
        assert!(submission_snapshot(&s, "prepared-token", true).is_err());
        assert_eq!(frozen.submission_json, bytes);
        lock(&s)
            .unwrap()
            .review
            .as_mut()
            .unwrap()
            .submission_json
            .clear();
        assert!(submission_snapshot(&s, "prepared-token", true).is_err());
        lock(&s).unwrap().review.as_mut().unwrap().submission_json = " ".repeat(16385);
        assert!(submission_snapshot(&s, "prepared-token", true).is_err());
        lock(&s).unwrap().review = None;
        assert!(submission_snapshot(&s, "prepared-token", true).is_err());
    }
    #[test]
    fn internal_receipt_requires_matching_hash_pending_status_and_bounded_json() {
        let hash = intake::hash(b"synthetic");
        let good = serde_json::json!({"id":hash,"status":"pending","duplicate":true}).to_string();
        assert!(matching_receipt(good.as_bytes(), &hash).is_ok());
        for bad in [
            "{}".into(),
            "not json".into(),
            good.replace("pending", "accepted"),
            good.replace(&hash, &"a".repeat(64)),
            " ".repeat(16385),
        ] {
            assert!(matching_receipt(bad.as_bytes(), &hash).is_err());
        }
    }

    #[test]
    fn updater_requires_reviewed_version_and_explicit_install_consent() {
        let mut d = Data::default();
        assert!(!d.can_install("0.1.3", true));
        d.update = Some("0.1.3".into());
        assert!(!d.can_install("0.1.3", false));
        assert!(!d.can_install("0.1.4", true));
        assert!(d.can_install("0.1.3", true));
        assert!(d.begin_update_check());
        assert!(!d.can_install("0.1.3", true));
    }
    #[test]
    fn installed_update_survives_checks_and_cannot_be_reinstalled() {
        let mut d = Data {
            update: Some("0.1.3".into()),
            ..Data::default()
        };
        d.finish_install("0.1.3".into());
        assert!(!d.begin_update_check());
        assert_eq!(d.installed_update.as_deref(), Some("0.1.3"));
        assert!(d.update.is_none());
        assert!(!d.can_install("0.1.3", true));
    }
    #[test]
    fn restart_requires_successful_install_and_fresh_consent() {
        let mut d = Data::default();
        assert!(d.approve_restart(false).is_err());
        assert!(d.approve_restart(true).is_err());
        d.update = Some("0.1.3".into());
        // An available or downloaded update is not an installed update.
        assert!(d.approve_restart(true).is_err());
        d.finish_install("0.1.3".into());
        assert!(d.approve_restart(false).is_err());
        assert!(d.approve_restart(true).is_ok());
    }
    #[test]
    fn restart_busy_gate_blocks_active_operations_and_releases_on_error() {
        let s = AppState::default();
        let busy = begin(&s).unwrap();
        assert!(begin(&s).is_err());
        drop(busy);
        {
            let _busy = begin(&s).unwrap();
            assert!(lock(&s).unwrap().approve_restart(true).is_err());
        }
        assert!(begin(&s).is_ok());
    }
    #[test]
    fn update_progress_preserves_unknown_total_and_saturates() {
        let mut p = UpdateProgress::default();
        assert_eq!(
            serde_json::to_value(&p).unwrap(),
            serde_json::json!({
                "phase": "downloading", "downloaded": 0, "total": null
            })
        );
        p.chunk(12, None);
        p.chunk(8, Some(20));
        assert_eq!(p.downloaded, 20);
        assert_eq!(p.total, Some(20));
        p.downloaded = u64::MAX;
        p.chunk(1, None);
        assert_eq!(p.downloaded, u64::MAX);
        for phase in ["installing", "installed"] {
            p.phase = phase;
            assert_eq!(serde_json::to_value(&p).unwrap()["phase"], phase);
        }
    }
    #[test]
    fn updater_errors_are_actionable_without_upstream_secrets_or_paths() {
        use tauri_plugin_updater::Error;
        assert!(update_error(&Error::Network(
            "https://private.invalid/?secret=token".into()
        ))
        .contains("internet"));
        assert!(
            update_error(&Error::SignatureUtf8("SECRET_SIGNATURE".into()))
                .contains("signature verification failed")
        );
        assert!(
            update_error(&Error::Io(std::io::Error::other("/private/secret"))).contains("writable")
        );
        assert!(update_error(&Error::PreviousAppNotRestored(PathBuf::from(
            "/private/secret"
        )))
        .contains("Do not restart"));
        for error in [
            Error::Network("secret".into()),
            Error::SignatureUtf8("secret".into()),
            Error::Io(std::io::Error::other("secret")),
        ] {
            assert!(!update_error(&error).contains("secret"));
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn only_confirmed_read_only_errors_suggest_moving_to_applications() {
        use tauri_plugin_updater::Error;
        let readonly = Error::Io(std::io::Error::from_raw_os_error(30));
        assert!(update_error(&readonly).contains("Applications"));
        let denied = Error::Io(std::io::Error::from(std::io::ErrorKind::PermissionDenied));
        assert!(!update_error(&denied).contains("disk image"));
        assert!(!update_error(&denied).contains("Applications"));
    }
    #[test]
    fn updater_uses_only_the_official_compiled_https_feed() {
        let c: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert!(updater_ready());
        assert_eq!(c["plugins"]["updater"]["endpoints"], serde_json::json!([
            "https://github.com/vortexopenclaw/dashcam-card-scanner/releases/latest/download/latest.json"
        ]));
    }
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
