// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use std::sync::atomic::AtomicBool;
#[test]
fn main_unit_flow_and_submission() {
    let root = std::env::temp_dir().join(format!("scanner-z100-{}", uuid::Uuid::new_v4()));
    for folder in ["front", "inside", "rear"] {
        std::fs::create_dir_all(root.join("DCIM/200video").join(folder)).unwrap();
    }
    for folder in ["front", "inside"] {
        std::fs::write(
            root.join("DCIM/200video")
                .join(folder)
                .join("S_20300101120100_0001_0001.mp4"),
            b"synthetic",
        )
        .unwrap();
    }
    // Resolve the harness's OS temp-directory alias (for example /var ->
    // /private/var on macOS); production source-link rejection stays intact.
    let root = root.canonicalize().unwrap();
    let report = crate::engine::scan(&root, &AtomicBool::new(false), |_| {}).unwrap();
    let (auto, camera) = crate::recognition::recognize(&root.join("Z100 Master"), &report);
    assert!(camera.is_none());
    assert!(auto.get("model").is_none());
    assert_eq!(auto["manufacturer"], "DDPAI");
    assert!(auto["candidates"]
        .as_array()
        .unwrap()
        .iter()
        .all(|c| c["id"] != ID));
    let generic = preview(&report, false);
    assert!(generic["reviewSamples"]
        .as_array()
        .unwrap()
        .iter()
        .all(|s| s["roleHint"] != "telephoto" && s["modeHint"] != "parking"));
    let main = preview(&report, true);
    assert_eq!(main["channelEvidence"]["count"], 2);
    assert_eq!(main["channelEvidence"]["setup"], "front + telephoto");
    let samples = main["reviewSamples"].as_array().unwrap();
    assert!(samples.iter().any(|s| s["roleHint"] == "front"
        && s["modeHint"] == "parking"
        && s["modeEvidence"]["parkingSubtype"] == "time-lapse"));
    assert!(samples
        .iter()
        .any(|s| s["roleHint"] == "telephoto" && s["modeHint"] == "unknown"));
    let labels = crate::payload::Labels {
        manufacturer: "DDPAI".into(),
        model: MODEL.into(),
        channel_setup: "front + telephoto".into(),
        channel_count: 2,
        firmware: String::new(),
        settings: String::new(),
        quality: "unknown".into(),
        quality_label: None,
        parking_mode: "unknown".into(),
        parking_mode_label: None,
        time_lapse_fps: None,
        suggested_fields: vec![],
    };
    assert!(selected(&labels));
    let contextual = apply(&report, selected(&labels));
    let review = crate::annotations::prepare(&contextual, &labels, &Default::default()).unwrap();
    let envelope: serde_json::Value = serde_json::from_str(&review.submission_json).unwrap();
    let evidence = envelope["evidence"].as_array().unwrap();
    assert!(evidence
        .iter()
        .any(|e| e["channel"] == "front" && e["mode"] == "parking"));
    assert!(evidence
        .iter()
        .any(|e| e["channel"] == "telephoto" && e["mode"] == "unknown"));
    assert!(report.recognized_camera_id.is_none());
    assert_eq!(preview(&report, false), generic);
    // Incomplete observed coverage is one observed lens, not a disabled built-in lens.
    std::fs::remove_file(root.join("DCIM/200video/inside/S_20300101120100_0001_0001.mp4")).unwrap();
    let partial = crate::engine::scan(&root, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(preview(&partial, true)["channelEvidence"]["count"], 1);
    // Actual optional rear footage adds one observed role, never a fourth system lens.
    for folder in ["inside", "rear"] {
        std::fs::write(root.join("DCIM/200video").join(folder).join("S_20300101120100_0001_0001.mp4"), b"synthetic").unwrap();
    }
    std::fs::create_dir_all(root.join("DCIM/201photo/rear")).unwrap();
    std::fs::write(root.join("DCIM/201photo/rear/S_20300101120100.jpg"), b"synthetic").unwrap();
    let triple = crate::engine::scan(&root, &AtomicBool::new(false), |_| {}).unwrap();
    let triple_preview = preview(&triple, true);
    assert_eq!(triple_preview["channelEvidence"]["count"], 3);
    assert_eq!(triple_preview["channelEvidence"]["setup"], "front + telephoto + rear");
    assert!(triple_preview["reviewSamples"].as_array().unwrap().iter().any(|s| s["folder"] == "DCIM/200video/rear" && s["roleHint"] == "rear" && s["modeHint"] == "unknown"));
    assert_eq!(hints("S_20300101120100.jpg", "DCIM/201photo/rear"), ("rear", "unknown"));
    let mut system_labels = labels.clone();
    system_labels.channel_count = 4;
    system_labels.channel_setup = "front + telephoto + rear + separate cabin".into();
    let review = crate::annotations::prepare(&apply(&triple, true), &system_labels, &Default::default()).unwrap();
    let envelope: serde_json::Value = serde_json::from_str(&review.submission_json).unwrap();
    assert_eq!(envelope["owner"]["channelCount"], 4);
    assert!(envelope["evidence"].as_array().unwrap().iter().any(|e| e["channel"] == "rear" && e["mode"] == "unknown"));
    // A rear photo with an empty rear video folder does not establish observed rear video.
    std::fs::remove_file(root.join("DCIM/200video/rear/S_20300101120100_0001_0001.mp4")).unwrap();
    let photos_only = crate::engine::scan(&root, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(preview(&photos_only, true)["channelEvidence"]["count"], 2);
    let accessory = root.join("Z100 Master");
    std::fs::create_dir_all(accessory.join("DCIM/200video/inside")).unwrap();
    std::fs::write(
        accessory.join("DCIM/200video/inside/S_20300101120100.mp4"),
        b"synthetic",
    )
    .unwrap();
    let accessory_report =
        crate::engine::scan(&accessory, &AtomicBool::new(false), |_| {}).unwrap();
    assert!(crate::recognition::recognize(&accessory, &accessory_report)
        .1
        .is_none());
    assert!(preview(&accessory_report, false)["reviewSamples"]
        .as_array()
        .unwrap()
        .iter()
        .all(|s| s["roleHint"] != "telephoto" && s["modeHint"] != "parking"));
    // Cabin/accessory footage does not establish a main-card role.
    let cabin = root.join("cabin-card");
    std::fs::create_dir_all(cabin.join("DCIM/200video/cabin")).unwrap();
    std::fs::write(cabin.join("DCIM/200video/cabin/S_20300101120100.mp4"), b"synthetic").unwrap();
    let cabin_report = crate::engine::scan(&cabin, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(preview(&cabin_report, true)["channelEvidence"]["count"], serde_json::Value::Null);
    assert_eq!(hints("S_20300101120100.mp4", "DCIM/200video/cabin"), ("unknown", "unknown"));
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn rear_q_time_lapse_is_main_unit_and_folder_scoped() {
    let name = "Q_20300101120100_0001_A.mp4";
    let folder = "DCIM/200video/rear";
    assert_eq!(crate::intake::sample_hints_for_folder(name, folder, Some(ID)), ("rear", "parking"));
    let evidence = crate::mode_evidence::file_mode_evidence(name, folder, Some(ID));
    assert_eq!(evidence.context, "parking");
    assert_eq!(evidence.parking_subtype, Some("time-lapse"));
    assert_eq!(evidence.trigger, "unknown");
    assert_eq!(evidence.protected, None);
    for id in [None, Some("ddpai-z100-master"), Some("ddpai-z100-pro"), Some("ddpai-z100-accessory")] {
        assert_ne!(crate::intake::sample_hints_for_folder(name, folder, id).1, "parking");
        assert_ne!(crate::mode_evidence::file_mode_evidence(name, folder, id).parking_subtype, Some("time-lapse"));
    }
    for (name, folder) in [
        (name, "DCIM/200video/front"), (name, "DCIM/200video/inside"),
        (name, "Other/rear"), (name, "DCIM/200video/cabin"),
        ("Q_20300101120100.jpg", "DCIM/201photo/rear"),
        ("20300101120100_0001_A.mp4", folder),
        ("S_20300101120100.mp4", folder), ("q_20300101120100.mp4", folder),
    ] {
        assert_eq!(hints(name, folder).1, "unknown");
        assert_ne!(crate::mode_evidence::file_mode_evidence(name, folder, Some(ID)).parking_subtype, Some("time-lapse"));
    }
}
#[test]
fn scope_negatives() {
    let name = "S_20300101120100.mp4";
    for id in [None, Some("ddpai-sibling"), Some("ddpai-z100-accessory")] {
        assert_ne!(
            crate::intake::sample_hints_for_folder(name, "DCIM/200video/inside", id).0,
            "telephoto"
        );
        assert_ne!(
            crate::mode_evidence::file_mode_evidence(name, "DCIM/200video/front", id)
                .parking_subtype,
            Some("time-lapse")
        );
    }
    for (name, folder) in [
        (name, "DCIM/200video/inside"),
        (name, "DCIM/200video/rear"),
        (name, "Other/front"),
        ("S_20300101120100.jpg", "DCIM/201photo/front"),
        ("20300101120100.mp4", "DCIM/200video/front"),
    ] {
        assert_ne!(
            crate::mode_evidence::file_mode_evidence(name, folder, Some(ID)).parking_subtype,
            Some("time-lapse")
        );
    }
}
