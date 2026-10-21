// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use crate::engine;
use std::sync::atomic::AtomicBool;

fn scan(files: &[(&str, &[u8])]) -> Report {
    let root = tempfile::Builder::new()
        .prefix("unlabeled-card-")
        .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
        .unwrap();
    let mut before = Vec::new();
    for (name, bytes) in files {
        let path = root.path().join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, bytes).unwrap();
        before.push((
            path.clone(),
            std::fs::metadata(path).unwrap().modified().unwrap(),
            bytes.to_vec(),
        ));
    }
    let report = engine::scan(root.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(report.scanned_files, files.len() as u64);
    assert!(report.inventory_complete);
    for (path, mtime, bytes) in before {
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        assert_eq!(std::fs::metadata(path).unwrap().modified().unwrap(), mtime);
    }
    report
}
fn result(names: &[&str], id: Option<&str>) -> ObservedChannels {
    observed_channels(
        &scan(
            &names
                .iter()
                .map(|n| (*n, b"metadata unavailable".as_slice()))
                .collect::<Vec<_>>(),
        ),
        id,
    )
}
#[test]
fn normal_parking_roles_are_deduplicated_without_model_ocr() {
    let r = result(
        &[
            "DCIM/Movie/2030_0101_120000_000001F.MP4",
            "DCIM/Movie/2030_0101_120000_000001R.MP4",
            "DCIM/Parking/2030_0101_120000_000001PF.MP4",
            "DCIM/Parking/2030_0101_120000_000001PR.MP4",
        ],
        None,
    );
    assert_eq!(r.count, Some(2));
    assert_eq!(r.setup.as_deref(), Some("front + rear"));
    assert_eq!(r.confidence, "observed");
}
#[test]
fn known_maximum_is_not_observed_count() {
    assert_eq!(
        result(
            &["DCIM/Movie/2030_0101_120000_000001F.MP4"],
            Some("viofo-t340")
        )
        .count,
        Some(1)
    );
    assert_eq!(
        result(
            &["DCIM/Movie/20300101120000_000001.MP4"],
            Some("viofo-a119m-pro")
        )
        .setup
        .as_deref(),
        Some("front")
    );
    assert_eq!(
        result(&["DCIM/Movie/20300101120000_000001.MP4"], None).count,
        Some(1)
    );
}
#[test]
fn known_four_roles_and_photos_outside_private_video_samples() {
    let mut report = scan(&[
        ("DCIM/Movie/2030_0101_120000_000001F.MP4", b"video"),
        ("DCIM/Photo/2030_0101_120000_000001R.JPG", b"photo"),
        ("DCIM/Photo/2030_0101_120000_000001PI.JPG", b"photo"),
        ("DCIM/Photo/2030_0101_120000_000001PT.JPG", b"photo"),
    ]);
    assert_eq!(
        observed_channels(&report, Some("viofo-t340")).count,
        Some(4)
    );
    // All available anonymous finite evidence still works after private samples
    // are exhausted, independent of sample order and metadata availability.
    for folder in &mut report.folders {
        folder.samples.clear();
    }
    let r = observed_channels(&report, Some("viofo-t340"));
    assert_eq!(r.roles, ["front", "rear", "interior", "telephoto"]);
    let text = serde_json::to_string(&r).unwrap();
    assert!(!text.contains("DCIM") && !text.contains("2030") && !text.contains("localName"));
    assert_eq!(
        serde_json::to_value(r).unwrap().as_object().unwrap().len(),
        5
    );
}
#[test]
fn abc_roles_require_native_profile_or_all_candidate_consensus() {
    let names = [
        "Normal/20300101_120000_00001_N_A.MP4",
        "Parking/20300101_120000_00001_P_B.MP4",
        "Normal/20300101_120000_00001_N_C.MP4",
    ];
    assert_eq!(
        result(&names, Some("vantrue-n4-pro-s")).roles,
        ["front", "rear", "interior"]
    );
    assert_eq!(result(&names, None).count, None); // N5 and E360 disagree.
}
#[test]
fn conflicts_and_foreign_known_files_do_not_invent_a_setup() {
    let r = result(
        &[
            "DCIM/Movie/2030_0101_120000_000001F.MP4",
            "Normal/20300101_120000_00001_N_A.MP4",
        ],
        None,
    );
    assert_eq!(r.count, None);
    assert_eq!(r.confidence, "conflicting");
    assert_eq!(
        result(
            &["Normal/20300101_120000_00001_N_A.MP4"],
            Some("viofo-t340")
        )
        .confidence,
        "conflicting"
    );
}
#[test]
fn numeric_suffixes_folder_names_owner_labels_and_unknown_ids_are_not_roles() {
    for names in [
        vec!["Front/000001.MP4", "Rear/000002.MP4"],
        vec!["DCIM/Movie/personal.MP4"],
    ] {
        assert_eq!(result(&names, None).count, None);
    }
    assert_eq!(
        result(
            &["DCIM/Movie/2030_0101_120000_000001F.MP4"],
            Some("owner-chosen-model")
        )
        .count,
        None
    );
}
#[test]
fn import_cannot_inject_native_identity() {
    let report = scan(&[("DCIM/Movie/20300101120000_000001.MP4", b"video")]);
    let mut json = serde_json::to_value(&report).unwrap();
    json["recognizedCameraId"] = "viofo-a119m-pro".into();
    json["recognized_camera_id"] = "viofo-a119m-pro".into();
    json["model"] = "A119M Pro".into();
    let imported: Report = serde_json::from_value(json).unwrap();
    assert!(imported.recognized_camera_id.is_none());
    assert_eq!(observed_channels(&imported, None).count, None);
    let mut native = report;
    native.recognized_camera_id = Some("viofo-a119m-pro".into());
    assert_eq!(observed_channels(&native, None).count, Some(1));
    assert_eq!(
        observed_channels(&native, Some("viofo-t340")).confidence,
        "conflicting"
    );
}
#[test]
fn encoding_resolution_and_modes_do_not_add_channels() {
    let small = metadata_fixture(b"avc1", 1920, 30);
    let large = metadata_fixture(b"hvc1", 3840, 60);
    let report = scan(&[
        ("DCIM/Movie/2030_0101_120000_000001F.MP4", &small),
        ("DCIM/Movie/2030_0101_120001_000002F.MP4", &large),
        ("DCIM/Parking/2030_0101_120002_000003PF.MP4", &small),
    ]);
    assert_eq!(report.metadata_coverage.measured_files, 3);
    assert_eq!(report.metadata_coverage.cohort_count, 3);
    assert_eq!(observed_channels(&report, None).count, Some(1));
}
// Metadata-only BMFF, not decodable footage or hardware validation.
fn metadata_fixture(codec: &[u8; 4], width: u16, fps: u32) -> Vec<u8> {
    fn boxed(tag: &[u8; 4], body: Vec<u8>) -> Vec<u8> {
        let mut bytes = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        bytes.extend(tag);
        bytes.extend(body);
        bytes
    }
    let mut mdhd = vec![0; 24];
    mdhd[12..16].copy_from_slice(&1000u32.to_be_bytes());
    mdhd[16..20].copy_from_slice(&1000u32.to_be_bytes());
    let mut hdlr = vec![0; 12];
    hdlr[8..12].copy_from_slice(b"vide");
    let mut entry = vec![0; 78];
    entry[24..26].copy_from_slice(&width.to_be_bytes());
    entry[26..28].copy_from_slice(&1080u16.to_be_bytes());
    let mut stsd = vec![0, 0, 0, 0, 0, 0, 0, 1];
    stsd.extend(boxed(codec, entry));
    let mut stsz = vec![0; 4];
    stsz.extend(1u32.to_be_bytes());
    stsz.extend(fps.to_be_bytes());
    let mut stbl = boxed(b"stsd", stsd);
    stbl.extend(boxed(b"stsz", stsz));
    let mut mdia = boxed(b"mdhd", mdhd);
    mdia.extend(boxed(b"hdlr", hdlr));
    mdia.extend(boxed(b"minf", boxed(b"stbl", stbl)));
    let mut bytes = boxed(b"moov", boxed(b"trak", boxed(b"mdia", mdia)));
    bytes.extend(boxed(b"mdat", vec![0; fps as usize]));
    bytes
}
#[test]
fn whole_card_evidence_survives_the_64_sample_budget() {
    let bytes = metadata_fixture(b"avc1", 1920, 30);
    let mut names: Vec<_> = (0..80)
        .map(|i| format!("private-{i}/2030_0101_120000_000001F.MP4"))
        .collect();
    names.extend([
        "last/2030_0101_120000_000001R.MP4".into(),
        "photo/2030_0101_120000_000001PT.JPG".into(),
    ]);
    let report = scan(
        &names
            .iter()
            .map(|n| (n.as_str(), bytes.as_slice()))
            .collect::<Vec<_>>(),
    );
    assert_eq!(report.metadata_coverage.measured_files, 81);
    assert!(report.sampled_files <= 64);
    assert_eq!(
        observed_channels(&report, Some("viofo-t340")).roles,
        ["front", "rear", "telephoto"]
    );
}
#[test]
fn missing_and_partial_inventory_is_labeled_observed() {
    let mut report = scan(&[("DCIM/Movie/2030_0101_120000_000001R.MP4", b"video")]);
    report.inventory_complete = false;
    report.limited = true;
    let r = observed_channels(&report, Some("viofo-t340"));
    assert_eq!(r.count, Some(1));
    assert_eq!(r.setup.as_deref(), Some("rear"));
    assert!(r.reason.contains("undercount"));
}
#[test]
fn deterministic_five_role_bound_and_limit_fail_closed() {
    let mut report = Report::default();
    report.folders.push(engine::Folder {
        filename_templates: (0..4097).map(|i| format!("unknown-{i}")).collect(),
        ..Default::default()
    });
    let r = observed_channels(&report, None);
    assert_eq!(r.count, None);
    assert!(r.reason.contains("limit"));
    assert_eq!(r, observed_channels(&report, None));
}
