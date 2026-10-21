// SPDX-License-Identifier: AGPL-3.0-only
//! Local IPC suggestions only; never attach to exported Report or intake.
//! Filename recording context is not the selected parking configuration.
use crate::{engine::Report, observed_channels, recognition};
use serde::Serialize;
use std::{collections::BTreeSet, sync::LazyLock};
#[path = "mode_temporal.rs"]
mod temporal;
pub use temporal::{
    infer_temporal_parking, DrivingBaseline, TemporalInventory, TemporalParkingEvidence,
};

struct ModeCamera {
    id: String,
    folders: Vec<String>,
    patterns: Vec<regex::Regex>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileModeEvidence {
    pub context: &'static str,
    pub parking_subtype: Option<&'static str>,
    pub trigger: &'static str,
    pub protected: Option<bool>,
    pub basis: &'static str,
}
fn unknown() -> FileModeEvidence {
    FileModeEvidence {
        context: "unknown",
        parking_subtype: None,
        trigger: "unknown",
        protected: None,
        basis: "insufficient_or_conflicting_evidence",
    }
}

/// Same trust boundary as observed_channels: native identity only, never owner fields.
/// Without identity every matching catalog candidate must agree, including unknowns.
pub fn file_mode_evidence(name: &str, folder: &str, native_id: Option<&str>) -> FileModeEvidence {
    if name.len() > 256 || folder.len() > 4096 || !observed_channels::is_media(name) {
        return unknown();
    }
    // Photos show a role but do not establish a recording mode.
    if !name.rsplit_once('.').is_some_and(|(_, e)| {
        matches!(
            e.to_ascii_lowercase().as_str(),
            "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv"
        )
    }) {
        return unknown();
    }
    // The same bundled catalog as native recognition, with precompiled rules;
    // do not add independent model-recognition patterns here.
    static PATTERNS: LazyLock<Vec<ModeCamera>> = LazyLock::new(|| {
        let catalog: serde_json::Value =
            serde_json::from_str(include_str!("../assets/camera-catalog.json")).expect("catalog");
        catalog["cameras"]
            .as_array()
            .expect("cameras")
            .iter()
            .map(|c| ModeCamera {
                id: c["id"].as_str().expect("id").to_owned(),
                folders: c["folders"]
                    .as_array()
                    .expect("folders")
                    .iter()
                    .filter_map(|f| f.as_str().map(str::to_owned))
                    .collect(),
                patterns: c["patterns"]
                    .as_array()
                    .expect("patterns")
                    .iter()
                    .filter_map(|p| regex::Regex::new(p["pattern"].as_str()?).ok())
                    .collect(),
            })
            .collect()
    });
    let mut agreement = None;
    for camera in PATTERNS.iter() {
        if native_id.is_some_and(|id| id != camera.id) {
            continue;
        }
        let witness = observed_channels::profile_name(name, &camera.id);
        for re in &camera.patterns {
            let Some(captures) = re.captures(&witness) else {
                continue;
            };
            let tokens: BTreeSet<_> = captures
                .iter()
                .skip(1)
                .flatten()
                .map(|m| m.as_str())
                .collect();
            let mut one = unknown();
            if camera.id.starts_with("viofo-") {
                if tokens
                    .iter()
                    .any(|t| matches!(*t, "PF" | "PR" | "PI" | "PT"))
                {
                    one.context = "parking";
                    one.basis = "filename_parking_marker";
                }
                // Grounded single-front families have no mode/channel suffix.
                // RO alone remains unknown, including Movie/RO time-lapse files.
                if native_id.is_some()
                    && matches!(camera.id.as_str(), "viofo-a119-mini-2" | "viofo-a119m-pro")
                {
                    match folder {
                        "DCIM/Parking" | "DCIM/Parking/RO" => {
                            one.context = "parking";
                            one.basis = "documented_model_folder";
                        }
                        "DCIM/Movie" => {
                            one.context = "driving";
                            one.basis = "documented_model_folder";
                        }
                        _ => {}
                    }
                }
                if matches!(folder, "DCIM/Movie/RO" | "DCIM/Parking/RO") {
                    one.protected = Some(true);
                }
            } else if camera.id.starts_with("blackvue-") {
                if tokens.contains("P") {
                    one.context = "parking";
                    one.basis = "filename_parking_marker";
                } else if tokens.contains("I")
                    && matches!(
                        camera.id.as_str(),
                        "blackvue-elite-9" | "blackvue-elite-10" | "blackvue-dr970x-plus"
                    )
                {
                    one.context = "parking";
                    one.trigger = "impact";
                    one.basis = "documented_parking_impact_marker";
                } else if tokens.contains("N") {
                    one.context = "driving";
                    one.basis = "filename_normal_marker";
                }
            } else if camera.id.starts_with("vantrue-") {
                if tokens.contains("P") {
                    one.context = "parking";
                    one.basis = "filename_parking_marker";
                } else if tokens.contains("N") {
                    one.context = "driving";
                    one.basis = "filename_normal_marker";
                }
                if folder == "Event" {
                    one.protected = Some(true);
                }
                // E does not distinguish manual from G-sensor; T alone does not
                // establish parking. Do not turn a folder into conflicting authority.
                if (folder == "Normal" && one.context == "parking")
                    || (folder == "Parking" && one.context == "driving")
                {
                    one = unknown();
                }
            } else if camera.id.starts_with("thinkware-") && native_id.is_some() {
                // Exact model plus catalog filename corroboration, never an arbitrary
                // folder named Parking. Shared folder does NOT identify a subtype:
                // motion, time-lapse and radar can use motion_timelapse_rec.
                if camera.folders.iter().any(|f| f == folder) {
                    match folder {
                        "motion_timelapse_rec" | "parking_rec" => {
                            one.context = "parking";
                            one.basis = "documented_model_folder";
                        }
                        "cont_rec" => {
                            one.context = "driving";
                            one.basis = "documented_model_folder";
                        }
                        _ => {}
                    }
                }
            }
            if let Some(previous) = &agreement {
                if previous != &one {
                    return unknown();
                }
            } else {
                agreement = Some(one);
            }
        }
    }
    agreement.unwrap_or_else(unknown)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleModeEvidence {
    pub folder_index: usize,
    pub sample_index: usize,
    pub evidence: FileModeEvidence,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkingEvidence {
    /// Broad observed parking only. Never a subtype, enabled setting, or cadence.
    pub suggestion: Option<&'static str>,
    pub scope: &'static str,
    pub reason: &'static str,
    pub samples: Vec<SampleModeEvidence>,
    /// Probabilistic behavior suggestions from native whole-inventory adjacency,
    /// independent of the capped representatives above. Prefer its coherent
    /// suggestion over the broad observed-parking marker when present.
    pub temporal: TemporalParkingEvidence,
}
/// Conservative whole-card prefill: only complete, fully sampled, one native model,
/// all media explicitly parking, with nonconflicting observed channel evidence.
/// Larger cards retain per-sample evidence but cannot get a whole-card label from
/// capped private samples; the current templates erase several brand mode markers.
pub fn parking_evidence(report: &Report, validated_native_id: Option<&str>) -> ParkingEvidence {
    let id = validated_native_id.or(report.recognized_camera_id.as_deref());
    let valid = id.is_some_and(|id| recognition::catalog().iter().any(|c| c.id == id))
        && !validated_native_id
            .zip(report.recognized_camera_id.as_deref())
            .is_some_and(|(a, b)| a != b);
    let mut samples = Vec::new();
    let mut fully_sampled = true;
    let mut all_parking = true;
    let mut media = 0;
    'folders: for (fi, folder) in report.folders.iter().enumerate() {
        let count = observed_channels::media_count(folder);
        media += count;
        let mut retained = 0;
        for (si, sample) in folder.samples.iter().enumerate() {
            if !observed_channels::is_media(&sample.local_name) {
                continue;
            }
            if samples.len() == crate::engine::MAX_SAMPLES {
                fully_sampled = false;
                break 'folders;
            }
            retained += 1;
            let evidence = if valid || id.is_none() {
                file_mode_evidence(&sample.local_name, &folder.path, id)
            } else {
                unknown()
            };
            all_parking &= evidence.context == "parking";
            samples.push(SampleModeEvidence {
                folder_index: fi,
                sample_index: si,
                evidence,
            });
        }
        fully_sampled &= retained == count;
    }
    let channels = observed_channels::observed_channels(report, validated_native_id);
    let reason = if !valid {
        "single_native_identity_required"
    } else if !report.inventory_complete || report.cancelled || report.limited {
        "incomplete_inventory"
    } else if !fully_sampled {
        "unsampled_media_mode_unknown"
    } else if channels.count.is_none() {
        "mixed_or_unresolved_channel_evidence"
    } else if media == 0 || !all_parking {
        "mixed_or_unknown_recording_context"
    } else {
        "all_observed_media_explicitly_parking_subtype_unknown"
    };
    ParkingEvidence {
        suggestion: (reason == "all_observed_media_explicitly_parking_subtype_unknown")
            .then_some("parking"),
        scope: "observed_recordings_not_camera_setting",
        reason,
        samples,
        temporal: infer_temporal_parking(report, validated_native_id, None, &[]),
    }
}

#[cfg(test)]
#[path = "mode_evidence_tests.rs"]
mod tests;
