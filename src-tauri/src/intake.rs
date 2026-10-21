// SPDX-License-Identifier: AGPL-3.0-only
//! Strict pre-release intake v1: individual nullable samples, bounded complete structure.
use crate::{engine::Report, payload::Labels};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
// Provision only after separate deployment review. No environment-variable endpoint override.
pub const ORIGIN: Option<&str> =
    Some("https://dashcam-card-scanner-intake.vortexradar.workers.dev");
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn label(s: &str, max: usize) -> bool {
    !s.is_empty()
        && s.len() <= max
        && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b" ._-".contains(&c))
}
fn media_type(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv" => "video",
        "jpg" | "jpeg" | "png" => "image",
        _ => "other",
    }
}
fn positive(value: Option<f64>, max: f64) -> Option<f64> {
    value.filter(|v| v.is_finite() && *v > 0. && *v <= max)
}
// Shared deterministic bounded sample order for local review and private intake.
pub fn selected_samples(r: &Report) -> Vec<(usize, &crate::engine::Sample)> {
    let ordered: Vec<Vec<_>> = r
        .folders
        .iter()
        .map(|f| {
            let mut families: std::collections::BTreeMap<&str, Vec<_>> =
                std::collections::BTreeMap::new();
            for s in &f.samples {
                families.entry(&s.filename_template).or_default().push(s);
            }
            let mut row = Vec::new();
            for round in 0..16 {
                for samples in families.values() {
                    if let Some(s) = samples.get(round) {
                        row.push(*s);
                    }
                }
            }
            row
        })
        .collect();
    let mut out = Vec::new();
    for round in 0..16 {
        for (index, row) in ordered.iter().enumerate() {
            if let Some(s) = row.get(round) {
                if out.len() == 24 {
                    return out;
                }
                out.push((index, *s));
            }
        }
    }
    out
}
// Match the same embedded patterns used by local recognition, including candidates
// whose role maps are incomplete. Missing or conflicting mappings must not become
// a claim merely because another sibling profile supplies a convenient answer.
// A validated native camera restricts candidates, but never bypasses pattern matching.
#[cfg(test)]
fn sample_hints(name: &str, recognized_camera_id: Option<&str>) -> (&'static str, &'static str) {
    sample_hints_for_folder(name, "", recognized_camera_id)
}
/// Shared local-review/intake hints. Only validated native identity authorizes
/// folder context; owner labels never restrict the all-candidate consensus.
pub(crate) fn sample_hints_for_folder(
    name: &str,
    folder: &str,
    recognized_camera_id: Option<&str>,
) -> (&'static str, &'static str) {
    static PATTERNS: std::sync::LazyLock<Vec<(String, Vec<regex::Regex>)>> =
        std::sync::LazyLock::new(|| {
            let catalog: Value =
                serde_json::from_str(include_str!("../assets/camera-catalog.json"))
                    .expect("embedded catalog");
            catalog["cameras"]
                .as_array()
                .expect("embedded cameras")
                .iter()
                .map(|c| {
                    let patterns = c["patterns"]
                        .as_array()
                        .expect("embedded patterns")
                        .iter()
                        .filter_map(|p| regex::Regex::new(p["pattern"].as_str()?).ok())
                        .collect();
                    (
                        c["id"].as_str().expect("embedded camera id").to_owned(),
                        patterns,
                    )
                })
                .collect()
        });
    if name.len() > 256 {
        return ("unknown", "unknown");
    }
    let hints = crate::recognition::catalog()
        .iter()
        .filter(|camera| {
            recognized_camera_id.is_none_or(|id| id == camera.id)
                && PATTERNS.iter().any(|(id, patterns)| {
                    id == &camera.id && patterns.iter().any(|pattern| pattern.is_match(name))
                })
        })
        .map(|camera| {
            if recognized_camera_id.is_some() {
                crate::recognition::sample_hints_for_folder(camera, name, folder)
            } else {
                crate::recognition::sample_hints(camera, name)
            }
        })
        .collect::<Vec<_>>();
    consensus_hints(&hints)
}
fn consensus_hints(hints: &[(Option<String>, Option<String>)]) -> (&'static str, &'static str) {
    fn channel(value: Option<&str>) -> &'static str {
        match value {
            Some("front") => "front",
            Some("rear") => "rear",
            Some("interior") => "interior",
            Some("telephoto") => "telephoto",
            Some("left") => "left",
            Some("right") => "right",
            _ => "unknown",
        }
    }
    fn mode(value: Option<&str>) -> &'static str {
        match value {
            Some("normal") => "normal",
            Some("event" | "protected") => "protected",
            Some("parking") => "parking",
            _ => "unknown",
        }
    }
    let Some(first) = hints.first() else {
        return ("unknown", "unknown");
    };
    let c = channel(first.0.as_deref());
    let m = mode(first.1.as_deref());
    (
        if hints.iter().all(|h| channel(h.0.as_deref()) == c) {
            c
        } else {
            "unknown"
        },
        if hints.iter().all(|h| mode(h.1.as_deref()) == m) {
            m
        } else {
            "unknown"
        },
    )
}
pub fn envelope(r: &Report, l: &Labels) -> Result<String, String> {
    l.validate()?;
    if !label(l.manufacturer.trim(), 64)
        || !label(l.model.trim(), 64)
        || (!l.firmware.trim().is_empty() && !label(l.firmware.trim(), 32))
        || !(1..=8).contains(&l.channel_count)
    {
        return Err("Intake requires ASCII camera labels and 1–8 channels.".into());
    }
    if ![
        "low", "normal", "medium", "high", "maximum", "extreme", "other", "unknown",
    ]
    .contains(&l.quality.as_str())
        || ![
            "off",
            "buffered",
            "time-lapse",
            "low-bitrate",
            "motion",
            "impact",
            "low-power-impact",
            "radar",
            "other",
            "unknown",
        ]
        .contains(&l.parking_mode.as_str())
    {
        return Err("Invalid owner setting enum".into());
    }
    if l.time_lapse_fps.is_some() && positive(l.time_lapse_fps, 240.).is_none() {
        return Err("Owner capture cadence must be >0 and <=240 fps.".into());
    }
    if r.cancelled || r.limited || r.folders.is_empty() || r.folders.len() > 32 {
        return Err("Intake requires a complete structural scan of at most 32 folders. Export locally instead.".into());
    }
    let mut folders = Vec::new();
    let mut evidence = Vec::new();
    let mut total_media = 0u64;
    for f in &r.folders {
        let mut counts: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
        for (ext, count) in &f.extensions {
            let known = matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp4"
                    | "mov"
                    | "m4v"
                    | "avi"
                    | "ts"
                    | "mkv"
                    | "jpg"
                    | "jpeg"
                    | "png"
                    | "dat"
                    | "bin"
                    | "txt"
                    | "log"
                    | "nmea"
                    | "srt"
            );
            *counts
                .entry(if known { ext.clone() } else { "unknown".into() })
                .or_default() += count;
        }
        if counts.len() > 16 {
            return Err("Too many extension groups for intake. Export locally.".into());
        }
        let media: u64 = counts
            .iter()
            .filter(|(e, _)| media_type(e) != "other")
            .map(|(_, n)| *n)
            .sum();
        total_media += media;
        let components: Vec<&str> = if f.path == "." {
            vec![]
        } else {
            f.path.split('/').collect()
        };
        folders.push(json!({"components":components,"fileCount":f.file_count,"mediaCount":media,"extensions":counts.iter().map(|(e,n)|json!({"extension":e,"mediaType":media_type(e),"count":n})).collect::<Vec<_>>(),"filenameTemplates":f.filename_templates}));
    }
    for (index, sample) in selected_samples(r) {
        let v = sample.video.as_ref();
        let codec = v
            .map(|v| v.codec.as_str())
            .filter(|c| ["h264", "hevc", "av1", "mjpeg", "mpeg4"].contains(c))
            .unwrap_or("unknown");
        let (channel, mode) = sample_hints_for_folder(
            &sample.local_name,
            &r.folders[index].path,
            r.recognized_camera_id.as_deref(),
        );
        evidence.push(json!({"folderIndex":index,"channel":channel,"mode":mode,"width":v.map(|v|v.width).filter(|n|*n>0 && *n<=16384),"height":v.map(|v|v.height).filter(|n|*n>0 && *n<=16384),"fps":positive(v.and_then(|v|v.nominal_frame_rate),240.),"bitrateKbps":positive(v.and_then(|v|v.video_bitrate),1e9).map(|n|n/1000.),"containerBitrateKbps":Value::Null,"sizeBytes":(sample.file_size_bytes>0 && sample.file_size_bytes<=1_000_000_000_000).then_some(sample.file_size_bytes),"durationSeconds":positive(v.map(|v|v.duration_seconds),86400.),"codec":codec}));
    }
    if total_media == 0 {
        return Err(
            "Intake requires positive-media structure. Local export remains available.".into(),
        );
    }
    let mut owner = json!({"manufacturer":l.manufacturer.trim(),"model":l.model.trim(),"channelCount":l.channel_count,"quality":l.quality,"parkingMode":l.parking_mode});
    if let Some(s) = &l.quality_label {
        owner["qualityLabel"] = json!(s);
    }
    if let Some(s) = &l.parking_mode_label {
        owner["parkingModeLabel"] = json!(s);
    }
    if !l.firmware.trim().is_empty() {
        owner["firmware"] = json!(l.firmware.trim());
    }
    if let Some(n) = l.time_lapse_fps {
        owner["timeLapseFps"] = json!(n);
    }
    let body=serde_json::to_string(&json!({"schemaVersion":1,"owner":owner,"evidence":evidence,"structure":{"completed":true,"fileCount":r.scanned_files,"mediaCount":total_media,"folders":folders,"observedLayouts":[]}})).map_err(|_|"JSON encoding failed")?;
    if body.len() > 16384 {
        return Err("Complete intake exceeds 16 KiB. Export locally; structural totals are never silently truncated.".into());
    }
    Ok(body)
}
pub fn origin() -> Result<&'static str, String> {
    let s=ORIGIN.ok_or("Secure intake is not provisioned. Export JSON instead; the legacy feedback endpoint is never used for direct submission.")?;
    let u = reqwest::Url::parse(s).map_err(|_| "Invalid intake configuration")?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
    {
        return Err("Invalid intake configuration".into());
    }
    Ok(s.trim_end_matches('/'))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outgoing_sampling_round_robins_folders_and_filename_families() {
        let r = Report {
            folders: (0..8)
                .map(|i| crate::engine::Folder {
                    path: format!("folder-{i}"),
                    samples: [
                        "SEQUENCEF.MP4",
                        "SEQUENCEF.MP4",
                        "SEQUENCER.MP4",
                        "SEQUENCER.MP4",
                    ]
                    .iter()
                    .map(|t| crate::engine::Sample {
                        filename_template: t.to_string(),
                        ..Default::default()
                    })
                    .collect(),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let chosen = selected_samples(&r);
        assert_eq!(chosen.len(), 24);
        for i in 0..8 {
            assert_eq!(chosen.iter().filter(|(f, _)| *f == i).count(), 3);
        }
        assert_eq!(chosen[0].1.filename_template, "SEQUENCEF.MP4");
        assert_eq!(chosen[8].1.filename_template, "SEQUENCER.MP4");
    }
    #[test]
    fn native_recognition_context_reaches_intake_without_crossing_json_boundaries() {
        use crate::engine::{Folder, Sample};
        let mut report = Report {
            scanned_files: 9,
            folders: vec![Folder {
                path: "Normal".into(),
                file_count: 9,
                extensions: [("mp4".into(), 9)].into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        for (token, width, height) in [("A", 3840, 2160), ("B", 1920, 1080), ("C", 2560, 1440)] {
            for mode in ["N", "E", "P"] {
                report.folders[0].samples.push(Sample {
                    local_name: format!("20251211_184930_01110_{mode}_{token}.MP4"),
                    filename_template: format!("SEQUENCE_{mode}_{token}.MP4"),
                    video: Some(crate::video::Video {
                        file_size_bytes: 100,
                        duration_seconds: 1.,
                        codec: "h264".into(),
                        width,
                        height,
                        nominal_frame_rate: None,
                        video_bitrate: None,
                    }),
                    ..Default::default()
                });
            }
        }
        let labels = Labels {
            manufacturer: "Owner".into(),
            model: "Unverified".into(),
            channel_setup: "front-interior-rear".into(),
            firmware: String::new(),
            settings: String::new(),
            channel_count: 3,
            quality: "unknown".into(),
            quality_label: None,
            parking_mode_label: None,
            parking_mode: "unknown".into(),
            time_lapse_fps: None,
        };
        let unrecognized: Value =
            serde_json::from_str(&envelope(&report, &labels).unwrap()).unwrap();
        for evidence in unrecognized["evidence"].as_array().unwrap() {
            assert_eq!(evidence["channel"], "unknown");
            assert_eq!(evidence["mode"], "unknown");
        }
        let (_, camera) =
            crate::recognition::recognize(std::path::Path::new("/Volumes/N4 Pro S"), &report);
        report.recognized_camera_id = Some(camera.unwrap().id.clone());
        assert_eq!(
            report.recognized_camera_id.as_deref(),
            Some("vantrue-n4-pro-s")
        );
        let body = envelope(&report, &labels).unwrap();
        let recognized: Value = serde_json::from_str(&body).unwrap();
        let chosen = selected_samples(&report);
        assert_eq!(chosen.len(), 9);
        for ((_, sample), evidence) in chosen
            .iter()
            .zip(recognized["evidence"].as_array().unwrap())
        {
            let (channel, mode) =
                sample_hints(&sample.local_name, report.recognized_camera_id.as_deref());
            let token = sample
                .local_name
                .trim_end_matches(".MP4")
                .rsplit('_')
                .next()
                .unwrap();
            assert_eq!(
                channel,
                match token {
                    "A" => "front",
                    "B" => "interior",
                    "C" => "rear",
                    _ => unreachable!(),
                }
            );
            let mode_token = sample.local_name.split('_').nth(3).unwrap();
            assert_eq!(
                mode,
                match mode_token {
                    "N" => "normal",
                    "E" => "protected",
                    "P" => "parking",
                    _ => unreachable!(),
                }
            );
            assert_eq!(evidence["channel"], channel);
            assert_eq!(evidence["mode"], mode);
        }
        assert_eq!(
            sample_hints("personal_B.MP4", report.recognized_camera_id.as_deref()),
            ("unknown", "unknown")
        );
        assert_eq!(
            sample_hints("20251211_184930_EF.mp4", Some("missing-camera")),
            ("unknown", "unknown")
        );
        let review = crate::payload::prepare(&report, &labels).unwrap();
        let serialized = serde_json::to_string(&report).unwrap();
        for text in [
            &body,
            &review.public_json,
            &review.private_json,
            &serialized,
        ] {
            for forbidden in [
                "recognizedCameraId",
                "recognized_camera_id",
                "vantrue-n4-pro-s",
                "20251211",
                "/Volumes/",
            ] {
                assert!(!text.contains(forbidden), "leaked {forbidden}");
            }
        }
        let mut injected: Value = serde_json::from_str(&serialized).unwrap();
        injected["recognizedCameraId"] = json!("vantrue-n4-pro-s");
        injected["recognized_camera_id"] = json!("vantrue-n4-pro-s");
        let decoded: Report = serde_json::from_value(injected).unwrap();
        assert!(decoded.recognized_camera_id.is_none());
    }
    #[test]
    fn a119_native_folder_context_reaches_selected_evidence_and_stays_out_of_json() {
        use crate::engine::{Folder, Sample};
        let name = "20300101120000_000001.MP4";
        // Deliberately not lexical folder order: use selection's actual folder index.
        let cases = [
            ("DCIM/Parking/RO", "parking"),
            ("DCIM/Movie", "normal"),
            ("DCIM/Movie/RO", "protected"),
            ("DCIM/Parking", "parking"),
        ];
        let mut report = Report {
            scanned_files: 4,
            folders: cases
                .iter()
                .map(|(path, _)| Folder {
                    path: (*path).into(),
                    file_count: 1,
                    extensions: [("mp4".into(), 1)].into(),
                    samples: vec![Sample {
                        local_name: name.into(),
                        filename_template: "SEQUENCE.MP4".into(),
                        ..Default::default()
                    }],
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let labels = Labels {
            manufacturer: "VIOFO".into(),
            model: "A119M Pro".into(),
            channel_setup: "front".into(),
            channel_count: 1,
            firmware: String::new(),
            settings: String::new(),
            quality: "unknown".into(),
            quality_label: None,
            parking_mode: "buffered".into(),
            parking_mode_label: Some("Auto Event Detection".into()),
            time_lapse_fps: None,
        };
        let (_, camera) =
            crate::recognition::recognize(std::path::Path::new("/Volumes/Untitled"), &report);
        assert!(camera.is_none());
        // Matching known single-front siblings agrees on the role, not the exact
        // model or mode. Owner-selected labels still provide no native authority.
        let unknown: Value = serde_json::from_str(&envelope(&report, &labels).unwrap()).unwrap();
        for evidence in unknown["evidence"].as_array().unwrap() {
            assert_eq!(evidence["channel"], "front");
            assert_eq!(evidence["mode"], "unknown");
        }
        let (_, camera) =
            crate::recognition::recognize(std::path::Path::new("/Volumes/A119M Pro"), &report);
        report.recognized_camera_id = Some(camera.unwrap().id.clone());
        assert_eq!(
            report.recognized_camera_id.as_deref(),
            Some("viofo-a119m-pro")
        );
        let body = envelope(&report, &labels).unwrap();
        let value: Value = serde_json::from_str(&body).unwrap();
        let evidence = value["evidence"].as_array().unwrap();
        let selected = selected_samples(&report);
        assert_eq!(selected.len(), 4);
        assert_eq!(evidence.len(), selected.len());
        for ((index, sample), evidence) in selected.iter().zip(evidence) {
            let expected = ("front", cases[*index].1);
            assert_eq!(
                sample_hints_for_folder(
                    &sample.local_name,
                    &report.folders[*index].path,
                    report.recognized_camera_id.as_deref()
                ),
                expected
            );
            assert_eq!(evidence["folderIndex"], *index);
            assert_eq!(evidence["channel"], expected.0);
            assert_eq!(evidence["mode"], expected.1);
        }
        assert_eq!(value["owner"]["parkingModeLabel"], "Auto Event Detection");
        let review = crate::payload::prepare(&report, &labels).unwrap();
        let serialized = serde_json::to_string(&report).unwrap();
        for text in [
            &body,
            &serialized,
            &review.public_json,
            &review.private_json,
        ] {
            for forbidden in [
                "recognizedCameraId",
                "recognized_camera_id",
                "viofo-a119m-pro",
                name,
                "/Volumes/",
            ] {
                assert!(!text.contains(forbidden), "leaked {forbidden}");
            }
        }
        let mut injected: Value = serde_json::from_str(&serialized).unwrap();
        injected["recognizedCameraId"] = json!("viofo-a119m-pro");
        injected["recognized_camera_id"] = json!("viofo-a119m-pro");
        let mut decoded: Report = serde_json::from_value(injected).unwrap();
        assert!(decoded.recognized_camera_id.is_none());
        // Restore only native basenames to isolate the identity boundary from the
        // separate serialization-skipped basename boundary.
        for folder in &mut decoded.folders {
            assert!(folder.samples[0].local_name.is_empty());
            folder.samples[0].local_name = name.into();
        }
        let roundtrip: Value = serde_json::from_str(&envelope(&decoded, &labels).unwrap()).unwrap();
        for evidence in roundtrip["evidence"].as_array().unwrap() {
            assert_eq!(evidence["channel"], "front");
            assert_eq!(evidence["mode"], "unknown");
        }
        for (folder, _) in cases {
            assert_eq!(
                sample_hints_for_folder(name, folder, Some("missing-camera")),
                ("unknown", "unknown")
            );
            assert_eq!(
                sample_hints_for_folder("personal.MP4", folder, Some("viofo-a119m-pro")),
                ("unknown", "unknown")
            );
            assert_eq!(
                sample_hints_for_folder(name, folder, None),
                ("front", "unknown")
            );
        }
        assert_eq!(
            sample_hints_for_folder(name, "personal/Parking", Some("viofo-a119m-pro")),
            ("front", "unknown")
        );
        report.recognized_camera_id = Some("missing-camera".into());
        let unknown: Value = serde_json::from_str(&envelope(&report, &labels).unwrap()).unwrap();
        for evidence in unknown["evidence"].as_array().unwrap() {
            assert_eq!(evidence["channel"], "unknown");
            assert_eq!(evidence["mode"], "unknown");
        }
    }
    #[test]
    fn existing_n4_hints_map_to_strict_roles_and_modes() {
        let camera = crate::recognition::catalog()
            .iter()
            .find(|c| c.id == "vantrue-n4-pro-s")
            .unwrap();
        for (token, channel) in [("A", "front"), ("B", "interior"), ("C", "rear")] {
            for (token_mode, mode) in [("N", "normal"), ("E", "protected"), ("P", "parking")] {
                let hint = crate::recognition::sample_hints(
                    camera,
                    &format!("20251211_184930_01110_{token_mode}_{token}.MP4"),
                );
                assert_eq!(consensus_hints(&[hint.clone(), hint]), (channel, mode));
            }
        }
    }
    #[test]
    fn missing_conflicting_or_unsupported_candidate_hints_stay_unknown() {
        let hint = |c: &str, m: &str| (Some(c.to_owned()), Some(m.to_owned()));
        assert_eq!(
            consensus_hints(&[hint("front", "normal"), hint("rear", "normal")]),
            ("unknown", "normal")
        );
        assert_eq!(
            consensus_hints(&[hint("front", "normal"), (None, None)]),
            ("unknown", "unknown")
        );
        assert_eq!(
            consensus_hints(&[hint("primary", "timelapse")]),
            ("unknown", "unknown")
        );
        assert_eq!(sample_hints("personal_B.MP4", None), ("unknown", "unknown"));
        assert_eq!(sample_hints(&"A".repeat(257), None), ("unknown", "unknown"));
        // These siblings match the N4-shaped basename but have incomplete capture
        // maps. They must not silently be excluded from the unanimity check.
        assert_eq!(
            sample_hints("20251211_184930_01110_N_C.MP4", None),
            ("unknown", "unknown")
        );
    }
    #[test]
    fn envelope_carries_only_bounded_consensus_not_local_names_or_identity() {
        use crate::engine::{Folder, Sample};
        let name = "20251211_184930_EF.mp4";
        let report = Report {
            scanned_files: 1,
            folders: vec![Folder {
                path: "RO".into(),
                file_count: 1,
                extensions: [("mp4".into(), 1)].into(),
                filename_templates: ["unknown".into()].into(),
                samples: vec![Sample {
                    local_name: name.into(),
                    filename_template: "unknown".into(),
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        };
        let labels = Labels {
            manufacturer: "Owner".into(),
            model: "Unverified".into(),
            channel_setup: "front".into(),
            firmware: String::new(),
            settings: String::new(),
            channel_count: 1,
            quality: "unknown".into(),
            quality_label: None,
            parking_mode_label: None,
            parking_mode: "unknown".into(),
            time_lapse_fps: None,
        };
        let body = envelope(&report, &labels).unwrap();
        let value: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(value["evidence"][0]["channel"], "front");
        assert_eq!(value["evidence"][0]["mode"], "protected");
        assert_eq!(value["owner"]["model"], "Unverified");
        let review = crate::payload::prepare(&report, &labels).unwrap();
        for text in [&body, &review.public_json, &review.private_json] {
            for forbidden in [
                name,
                "20251211",
                "localName",
                "local_name",
                "sourceSha256",
                "/Volumes/",
            ] {
                assert!(!text.contains(forbidden), "leaked {forbidden}");
            }
        }
        let mut unknown = report;
        unknown.folders[0].samples[0].local_name = "personal_B.MP4".into();
        let value: Value = serde_json::from_str(&envelope(&unknown, &labels).unwrap()).unwrap();
        assert_eq!(value["evidence"][0]["channel"], "unknown");
        assert_eq!(value["evidence"][0]["mode"], "unknown"); // RO is not a parking subtype.
    }
    #[test]
    fn sha256_known_vector() {
        assert_eq!(
            hash(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
    #[test]
    fn disabled_by_default() {
        if ORIGIN.is_none() {
            assert!(origin().is_err());
        }
    }
    #[test]
    fn constrained_labels() {
        assert!(!label("/Users/person", 64));
        assert!(!label("hello@example.com", 64));
        assert!(!label("<script>", 64));
        assert!(label("VIOFO T330W", 64));
    }
}
