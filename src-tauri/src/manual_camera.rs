// SPDX-License-Identifier: AGPL-3.0-only
//! Explicit owner model AND recording-unit confirmation, never automatic identity.
use crate::{engine::Report, payload::Labels};
#[cfg(test)]
#[path = "manual_camera_tests.rs"]
mod tests;
pub const ID: &str = "ddpai-z100-master-main";
pub const MODEL: &str = "Z100 Master - Main Unit";
pub fn selected(labels: &Labels) -> bool {
    labels.manufacturer.trim().eq_ignore_ascii_case("DDPAI") && labels.model.trim() == MODEL
}
/// A private working clone only. The original scan retains its native identity.
/// Existing evidence adapters accept this explicitly confirmed unit context too.
pub fn apply(report: &Report, selected: bool) -> Report {
    let mut report = report.clone();
    if selected {
        report.recognized_camera_id = Some(ID.into());
    }
    report
}
pub fn hints(name: &str, folder: &str) -> (&'static str, &'static str) {
    if name.len() > 256 {
        return ("unknown", "unknown");
    }
    let video = name.rsplit_once('.').is_some_and(|(_, ext)| {
        matches!(
            ext.to_ascii_lowercase().as_str(),
            "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv"
        )
    });
    let photo = name.rsplit_once('.').is_some_and(|(_, ext)| {
        matches!(ext.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png")
    });
    let folder = folder.to_ascii_lowercase();
    let channel = match folder.as_str() {
        "dcim/200video/front" if video => "front",
        "dcim/200video/inside" if video => "telephoto",
        "dcim/200video/rear" if video => "rear",
        "dcim/201photo/front" if photo => "front",
        "dcim/201photo/inside" if photo => "telephoto",
        "dcim/201photo/rear" if photo => "rear",
        _ => "unknown",
    };
    let mode = if video && channel == "front" && name.starts_with("S_") {
        "parking"
    } else {
        "unknown"
    };
    (channel, mode)
}
pub fn channels(report: &Report) -> crate::observed_channels::ObservedChannels {
    // Only folders containing actual videos establish observed roles. Empty rear,
    // photo/thumbnail folders and the hardware's supported maximum add no footage.
    let mut roles = Vec::new();
    for (folder, role) in [
        ("dcim/200video/front", "front"),
        ("dcim/200video/inside", "telephoto"),
        ("dcim/200video/rear", "rear"),
    ] {
        if report.folders.iter().any(|f| {
            f.path.eq_ignore_ascii_case(folder)
                && f.extensions.iter().any(|(ext, n)| {
                    *n > 0
                        && matches!(
                            ext.to_ascii_lowercase().as_str(),
                            "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv"
                        )
                })
        }) {
            roles.push(role.to_owned());
        }
    }
    crate::observed_channels::ObservedChannels {
        count: (!roles.is_empty()).then_some(roles.len()),
        setup: (!roles.is_empty()).then(|| roles.join(" + ")),
        roles, confidence: "owner_confirmed_unit",
        reason: "Manually selected main-unit card. Built-in front + telephoto; inside is firmware-labeled telephoto. Optional rear makes 3CH on this card; a 4CH system adds a separate cabin-camera microSD. Observed video roles only, not installed system coverage.",
    }
}
pub fn preview(report: &Report, selected: bool) -> serde_json::Value {
    let report = apply(report, selected);
    let id = report.recognized_camera_id.as_deref();
    let channels = crate::observed_channels::observed_channels(&report, id);
    let samples: Vec<_> = crate::intake::selected_samples(&report).iter().enumerate().map(|(index, (folder, sample))| {
        let path = &report.folders[*folder].path;
        let (role, mode) = crate::intake::sample_hints_for_folder(&sample.local_name, path, id);
        serde_json::json!({"index":index,"folderIndex":folder,"folder":path,"localName":sample.local_name,"filenameTemplate":sample.filename_template,"sizeBytes":sample.file_size_bytes,"video":sample.video,"roleHint":role,"modeHint":mode,"modeEvidence":crate::mode_evidence::file_mode_evidence(&sample.local_name,path,id)})
    }).collect();
    serde_json::json!({"channelEvidence":channels,"reviewSamples":samples})
}
