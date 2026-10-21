// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use sha2::{Digest, Sha256};
use std::sync::atomic::AtomicBool;

fn scan(names: &[&str]) -> Report {
    let root = tempfile::Builder::new()
        .prefix("mode-fixture-")
        .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
        .unwrap();
    let mut before = Vec::new();
    for name in names {
        let path = root.path().join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"synthetic metadata unavailable").unwrap();
        before.push((
            path.clone(),
            Sha256::digest(std::fs::read(&path).unwrap()),
            std::fs::metadata(path).unwrap().modified().unwrap(),
        ));
    }
    let report = crate::engine::scan(root.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.scanned_files, names.len() as u64);
    assert!(report.inventory_complete);
    for (path, hash, mtime) in before {
        assert_eq!(Sha256::digest(std::fs::read(&path).unwrap()), hash);
        assert_eq!(std::fs::metadata(path).unwrap().modified().unwrap(), mtime);
    }
    report
}
#[test]
fn explicit_parking_markers_keep_subtype_and_cadence_unknown() {
    for (name, folder, id) in [
        (
            "2030_0101_120000_000001PF.MP4",
            "DCIM/Movie/RO",
            "viofo-t340",
        ),
        (
            "20300101_120000_00001_P_A.MP4",
            "Parking",
            "vantrue-n4-pro-s",
        ),
        (
            "20300101_120000_PFS.mp4",
            "BlackVue/Record",
            "blackvue-elite-9",
        ),
        (
            "REC_20300101_120000_F.MP4",
            "motion_timelapse_rec",
            "thinkware-arc-700",
        ),
    ] {
        let e = file_mode_evidence(name, folder, Some(id));
        assert_eq!(e.context, "parking", "{id}");
        assert_eq!(e.parking_subtype, None);
        assert_eq!(e.trigger, "unknown");
    }
}
#[test]
fn protection_and_trigger_are_separate_from_parking_configuration() {
    let e = file_mode_evidence(
        "20300101120000_000001.MP4",
        "DCIM/Movie/RO",
        Some("viofo-a119-mini-2"),
    );
    assert_eq!(e.context, "unknown");
    assert_eq!(e.protected, Some(true));
    assert_eq!(e.trigger, "unknown");
    let e = file_mode_evidence(
        "20300101_120000_IFL.mp4",
        "BlackVue/Record",
        Some("blackvue-elite-9"),
    );
    assert_eq!(e.context, "parking");
    assert_eq!(e.trigger, "impact");
    assert_eq!(e.parking_subtype, None); // triggered clip != configured standby mode
    assert_eq!(
        file_mode_evidence(
            "20300101_120000_00001_E_A.MP4",
            "Event",
            Some("vantrue-n4-pro-s")
        )
        .trigger,
        "unknown"
    );
}
#[test]
fn folder_context_requires_valid_model_and_matching_filename() {
    for id in ["viofo-a119-mini-2", "viofo-a119m-pro"] {
        let name = "20300101120000_000001.MP4";
        assert_eq!(
            file_mode_evidence(name, "DCIM/Parking/RO", Some(id)).context,
            "parking"
        );
        assert_eq!(
            file_mode_evidence(name, "DCIM/Movie", Some(id)).context,
            "driving"
        );
        assert_eq!(
            file_mode_evidence("personal.MP4", "DCIM/Parking", Some(id)).context,
            "unknown"
        );
        assert_eq!(
            file_mode_evidence(name, "Parking", Some(id)).context,
            "unknown"
        );
        assert_eq!(
            file_mode_evidence(name, "DCIM/Parking", None).context,
            "unknown"
        );
    }
    assert_eq!(
        file_mode_evidence("REC_20300101_120000_F.MP4", "parking_rec", None).context,
        "unknown"
    );
    assert_eq!(
        file_mode_evidence(
            "REC_20300101_120000_F.MP4",
            "parking_rec",
            Some("owner-model")
        )
        .context,
        "unknown"
    );
}
#[test]
fn consensus_without_identity_and_conflicting_vantrue_placement() {
    assert_eq!(
        file_mode_evidence("20300101_120000_00001_P_A.MP4", "Parking", None).context,
        "parking"
    );
    assert_eq!(
        file_mode_evidence("20300101_120000_00001_N_A.MP4", "Parking", None).context,
        "unknown"
    );
    assert_eq!(
        file_mode_evidence("20300101_120000_PF.mp4", "BlackVue/Record", None).context,
        "parking"
    );
    // I means parking impact on reviewed current models, but not every catalog candidate agrees.
    assert_eq!(
        file_mode_evidence("20300101_120000_IF.mp4", "BlackVue/Record", None).context,
        "unknown"
    );
}
#[test]
fn whole_card_suggestion_is_broad_local_and_requires_full_single_context() {
    let mut report = scan(&[
        "DCIM/Parking/20300101120000_000001.MP4",
        "DCIM/Parking/RO/20300101120100_000002.MP4",
    ]);
    let e = parking_evidence(&report, Some("viofo-a119-mini-2"));
    assert_eq!(e.suggestion, Some("parking"));
    assert_eq!(e.samples.len(), 2);
    assert_eq!(e.scope, "observed_recordings_not_camera_setting");
    let json = serde_json::to_string(&e).unwrap();
    assert!(
        json.contains("folderIndex")
            && json.contains("sampleIndex")
            && json.contains("parkingSubtype")
    );
    assert!(!json.contains("2030") && !json.contains("DCIM") && !json.contains("localName"));
    assert_eq!(parking_evidence(&report, None).suggestion, None);
    report.recognized_camera_id = Some("viofo-a119-mini-2".into());
    assert_eq!(parking_evidence(&report, None).suggestion, Some("parking"));
    assert_eq!(
        parking_evidence(&report, Some("viofo-a119m-pro")).suggestion,
        None
    );
    report.inventory_complete = false;
    assert_eq!(parking_evidence(&report, None).suggestion, None);
}
#[test]
fn mixed_driving_parking_unknown_and_foreign_models_never_get_whole_card_labels() {
    for extra in [
        "DCIM/Movie/20300101120100_000002.MP4",
        "DCIM/Movie/RO/20300101120100_000002.MP4",
        "DCIM/Parking/personal.MP4",
        "BlackVue/Record/20300101_120000_NF.mp4",
    ] {
        let report = scan(&["DCIM/Parking/20300101120000_000001.MP4", extra]);
        assert_eq!(
            parking_evidence(&report, Some("viofo-a119-mini-2")).suggestion,
            None,
            "{extra}"
        );
    }
}
#[test]
fn late_unsampled_modes_prevent_global_parking_prefill() {
    let mut names: Vec<_> = (0..80)
        .map(|i| {
            format!(
                "DCIM/Parking/2030010112{:02}{:02}_{i:06}.MP4",
                i / 60,
                i % 60
            )
        })
        .collect();
    names.push("DCIM/Parking/unknown.MP4".into());
    let report = scan(&names.iter().map(String::as_str).collect::<Vec<_>>());
    let e = parking_evidence(&report, Some("viofo-a119-mini-2"));
    assert_eq!(e.suggestion, None);
    assert_eq!(e.reason, "unsampled_media_mode_unknown");
    assert!(e.samples.len() <= crate::engine::MAX_SAMPLES);
}
#[test]
fn source_catalog_defects_are_not_silently_repaired_into_recognition_rules() {
    // Reviewed source has double-escaped regexes; fixed single-model defaults
    // belong to the UI catalog, not guessed observed filename authority here.
    for (id, name, folder) in [
        ("vantrue-e1-pro", "20300101_120000_00001_P_A.MP4", "Parking"),
        ("rove-r2-4k-pro", "2030_0101_120000_000001.MP4", "Video"),
    ] {
        assert_eq!(
            file_mode_evidence(name, folder, Some(id)).context,
            "unknown"
        );
        assert_eq!(
            observed_channels::observed_channels(&scan(&[&format!("{folder}/{name}")]), Some(id))
                .count,
            None
        );
    }
}
