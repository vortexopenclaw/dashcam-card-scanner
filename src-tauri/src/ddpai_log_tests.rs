// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use crate::{
    engine::{Folder, Report, Sample},
    payload::Labels,
};
fn object() -> Value {
    serde_json::from_str(include_str!("../../tests/reference/ddpai-device-info.json")).unwrap()
}
fn temp() -> tempfile::TempDir {
    tempfile::Builder::new()
        .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
        .unwrap()
}
fn logs(root: &Path, lines: &[String]) {
    let dir = root.join("DCIM/207log/ui");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("ui_20300101120000_000.log"), lines.join("\n")).unwrap();
}
fn scan(root: &Path) -> Report {
    crate::engine::scan(root, &AtomicBool::new(false), |_| {}).unwrap()
}
fn labels() -> Labels {
    Labels {
        manufacturer: "DDPAI".into(),
        model: "Z100 Master".into(),
        firmware: "owner-current".into(),
        channel_setup: "owner 4CH system".into(),
        channel_count: 4,
        settings: String::new(),
        quality: "unknown".into(),
        quality_label: None,
        parking_mode: "unknown".into(),
        parking_mode_label: None,
        time_lapse_fps: None,
        suggested_fields: vec![],
    }
}
fn boxed(tag: &[u8; 4], body: Vec<u8>) -> Vec<u8> {
    let mut out = ((body.len() + 8) as u32).to_be_bytes().to_vec();
    out.extend(tag);
    out.extend(body);
    out
}
fn video() -> Vec<u8> {
    let mut mdhd = vec![0; 24];
    mdhd[12..16].copy_from_slice(&1000u32.to_be_bytes());
    mdhd[16..20].copy_from_slice(&1000u32.to_be_bytes());
    let mut hdlr = vec![0; 12];
    hdlr[8..12].copy_from_slice(b"vide");
    let mut entry = vec![0; 78];
    entry[24..26].copy_from_slice(&1920u16.to_be_bytes());
    entry[26..28].copy_from_slice(&1080u16.to_be_bytes());
    let mut stsd = vec![0, 0, 0, 0, 0, 0, 0, 1];
    stsd.extend(boxed(b"avc1", entry));
    let mut stsz = vec![0; 4];
    stsz.extend(1u32.to_be_bytes());
    stsz.extend(30u32.to_be_bytes());
    let mut stbl = boxed(b"stsd", stsd);
    stbl.extend(boxed(b"stsz", stsz));
    let mut mdia = boxed(b"mdhd", mdhd);
    mdia.extend(boxed(b"hdlr", hdlr));
    mdia.extend(boxed(b"minf", boxed(b"stbl", stbl)));
    let mut bytes = boxed(b"moov", boxed(b"trak", boxed(b"mdia", mdia)));
    bytes.extend(boxed(b"mdat", vec![0; 30]));
    bytes
}
#[test]
fn actual_shaped_log_normal_scan_to_review_private_only() {
    let t = temp();
    logs(t.path(), &[format!("[synthetic INFO] {}", object())]);
    for name in ["front", "inside", "rear"] {
        let dir = t.path().join("DCIM/200video").join(name);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("20300101120000_0001_0001.mp4"), video()).unwrap();
    }
    let r = scan(t.path());
    assert!(r.inventory_complete);
    assert_eq!(r.component_metadata.len(), 3);
    assert_eq!(recognition(&r).unwrap()["model"], "Z100 Master");
    assert!(confirmed_z100_main(&r));
    assert_eq!(
        r.recognized_camera_id.as_deref(),
        Some(crate::manual_camera::ID)
    );
    let channels = crate::manual_camera::preview(&r, false);
    assert_eq!(channels["channelEvidence"]["count"], 3);
    assert!(channels["reviewSamples"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["roleHint"] == "telephoto"));
    for row in &r.component_metadata[1..] {
        assert!(!row.identity_established);
        assert_eq!(row.model, None);
        assert_eq!(row.firmware_version.as_deref(), Some("v9.0.0.0"));
    }
    let review = crate::annotations::prepare(&r, &labels(), &Default::default()).unwrap();
    let body: Value = serde_json::from_str(&review.submission_json).unwrap();
    assert_eq!(
        body["scan"]["componentMetadata"],
        json!(r.component_metadata)
    );
    assert_eq!(body["owner"]["firmware"], "owner-current");
    assert_eq!(body["owner"]["channelCount"], 4);
    for private in [
        "componentMetadata",
        "soft_version",
        "wifi_pwd",
        "sn_code",
        "bt_info",
        "<omitted>",
        "20300101120000_000.log",
    ] {
        assert!(!review.public_json.contains(private));
    }
    for forbidden in [
        "wifi_pwd",
        "wifi_ssid",
        "sn_code",
        "bt_info",
        "msgHdr",
        "<omitted>",
    ] {
        assert!(!review.submission_json.contains(forbidden));
    }
    assert!(!review.submission_json.contains(t.path().to_str().unwrap()));
}
#[test]
fn catalog_exact_sibling_unknown_revision_and_region_negatives() {
    assert_eq!(
        exact_model("DDPAI DZ2602_GLOBAL_Z100 Master").as_deref(),
        Some("Z100 Master")
    );
    assert_eq!(exact_model("Z100 Pro").as_deref(), Some("Z100 Pro"));
    assert_eq!(exact_model("Z100").as_deref(), Some("Z100"));
    for s in [
        "Z100 Master Plus",
        "Z100 Master Dual",
        "DZ9999_Z100 Master",
        "DDPAI-Z100 Master",
        "unknown camera",
        "MINI3X",
        "N3 Pro",
        "N5 Pro",
    ] {
        assert!(exact_model(s).is_none(), "{s}");
    }
    assert!(candidates("MINI3X")
        .iter()
        .any(|x| x.model == "MINI3X (V3)"));
    assert!(candidates("MINI3X").len() > 1);
    assert!(candidates("N3 Pro").len() > 1);
    assert_eq!(exact_model("N3 Pro (V2)").as_deref(), Some("N3 Pro (V2)"));
    assert_eq!(IDENTITIES.len(), 133); // scoped identity rows, NOT proven hardware count
}
#[test]
fn mixed_unknown_duplicate_malformed_and_accessory_do_not_authorize_main_context() {
    let t = temp();
    let mut sibling = object();
    sibling["model"] = json!("Z100 Pro");
    logs(t.path(), &[object().to_string(), sibling.to_string()]);
    let r = scan(t.path());
    assert!(recognition(&r).unwrap().get("model").is_none());
    assert!(!confirmed_z100_main(&r));
    assert_eq!(r.component_metadata.len(), 6);
    sibling["model"] = json!("Unknown camera");
    logs(t.path(), &[object().to_string(), sibling.to_string()]);
    assert!(recognition(&scan(t.path())).unwrap().get("model").is_none());
    logs(
        t.path(),
        &[
            r#"{"msgHdr":{},"model":"Z100 Master","model":"Z100 Pro","soft_version":"8.0.0.16"}"#
                .into(),
        ],
    );
    let r = scan(t.path());
    assert!(r.component_metadata.is_empty());
    assert!(r.component_metadata_coverage.as_ref().unwrap().limited);
    logs(
        t.path(),
        &[r#"{"msgHdr":{"x":1,"x":2},"model":"Z100 Master","soft_version":"8.0.0.16"}"#.into()],
    );
    assert!(scan(t.path()).component_metadata.is_empty());
    for line in [
        r#"{"model":"Z100 Master","soft_version":"8.0.0.16"}"#,
        r#"{"outer":{"msgHdr":{},"model":"Z100 Master","soft_version":"8.0.0.16"}}"#,
    ] {
        assert!(record(line, "DCIM/207log/ui/ui_20300101120000_000.log", 1)
            .unwrap()
            .is_empty());
    }
    let mut accessory = object();
    accessory["model"] = json!("");
    accessory["inside_model"] = json!("Z100 Master");
    logs(t.path(), &[accessory.to_string()]);
    let r = scan(t.path());
    assert!(recognition(&r).unwrap().get("model").is_none());
    assert!(!confirmed_z100_main(&r));
    logs(t.path(), &[object().to_string(), object().to_string()]);
    assert_eq!(
        recognition(&scan(t.path())).unwrap()["model"],
        "Z100 Master"
    ); // repeated observations remain source-linked
}
#[test]
fn bounded_coverage_retains_known_omissions_without_guessing_unread_entries() {
    let t = temp();
    logs(t.path(), &vec![object().to_string(); 12]);
    let r = scan(t.path());
    let c = r.component_metadata_coverage.as_ref().unwrap();
    assert_eq!((c.retained_entries, c.omitted_entries), (32, 4));
    assert!(c.limited);
    assert!(recognition(&r).unwrap().get("model").is_none());
    logs(t.path(), &["x".repeat(600 * 1024)]);
    let r = scan(t.path());
    let c = r.component_metadata_coverage.unwrap();
    assert!(c.limited);
    assert_eq!(c.omitted_entries, 0);
    let mut bad = object();
    bad["soft_version"] = json!("password or GPS");
    assert!(record(&bad.to_string(), "x", 1).is_err());
    bad = object();
    bad["model"] = json!("Z100\nMaster");
    assert!(record(&bad.to_string(), "x", 1).is_err());
}
#[cfg(unix)]
#[test]
fn refuses_symlinked_log_file_and_every_directory_component() {
    use std::os::unix::fs::symlink;
    for component in ["DCIM", "207log", "ui", "ui_20300101120000_000.log"] {
        let t = temp();
        let outside = temp();
        logs(outside.path(), &[object().to_string()]);
        let (link, target) = match component {
            "DCIM" => (t.path().join("DCIM"), outside.path().join("DCIM")),
            "207log" => (
                t.path().join("DCIM/207log"),
                outside.path().join("DCIM/207log"),
            ),
            "ui" => (
                t.path().join("DCIM/207log/ui"),
                outside.path().join("DCIM/207log/ui"),
            ),
            _ => (
                t.path().join("DCIM/207log/ui").join(component),
                outside.path().join("DCIM/207log/ui").join(component),
            ),
        };
        std::fs::create_dir_all(link.parent().unwrap()).unwrap();
        symlink(target, link).unwrap();
        let (rows, c) = read(t.path(), &AtomicBool::new(false));
        assert!(rows.is_empty());
        assert!(c.unwrap().limited);
    }
}
#[test]
fn budget_reduces_numeric_samples_with_exact_counts_and_preserves_metadata() {
    let source = "DCIM/207log/ui/ui_20300101120000_000.log";
    let mut rows = Vec::new();
    for i in 1..=10 {
        rows.extend(record(&object().to_string(), source, i).unwrap());
    }
    let mut r = Report {
        scanned_files: 24,
        inventory_complete: true,
        component_metadata: rows.clone(),
        component_metadata_coverage: Some(Coverage {
            inspected_files: 1,
            retained_entries: 30,
            ..Default::default()
        }),
        ..Default::default()
    };
    let video = crate::video::Video {
        file_size_bytes: 1000,
        duration_seconds: 1.,
        codec: "h264".into(),
        width: 1920,
        height: 1080,
        nominal_frame_rate: Some(30.),
        video_bitrate: Some(8000.),
    };
    r.metadata_coverage.measured_files = 24;
    r.folders.push(Folder {
        path: "DCIM/200video/front".into(),
        file_count: 24,
        extensions: std::collections::BTreeMap::from([("mp4".into(), 24)]),
        samples: (0..24)
            .map(|i| Sample {
                file_size_bytes: 1000,
                video: Some(video.clone()),
                local_name: format!("203001011200{i:02}_0001_0001.mp4"),
                filename_template: "unknown".into(),
            })
            .collect(),
        ..Default::default()
    });
    let review = crate::annotations::prepare(&r, &labels(), &Default::default()).unwrap();
    assert!(review.submission_json.len() <= 16384);
    let body: Value = serde_json::from_str(&review.submission_json).unwrap();
    assert_eq!(body["scan"]["componentMetadata"], json!(rows));
    let n = body["evidence"].as_array().unwrap().len();
    assert!(n < 24);
    assert_eq!(body["retention"]["retainedMeasurements"], n);
    assert_eq!(body["retention"]["omittedMeasurements"], 24 - n);
}
