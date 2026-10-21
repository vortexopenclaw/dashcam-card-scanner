// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use crate::engine::{Folder, Sample};
use std::sync::atomic::AtomicBool;

fn report() -> Report {
    let mut report = Report::default();
    report.folders.push(Folder {
        path: "DCIM/Movie".into(),
        samples: vec![Sample {
            local_name: "20261021120000_000001.MP4".into(),
            ..Sample::default()
        }],
        ..Folder::default()
    });
    report
}
fn index(id: &str) -> usize {
    catalog().iter().position(|c| c.id == id).unwrap()
}
#[test]
fn stamp_requires_unique_complete_corroborated_identity() {
    let r = report();
    let evidence = |ids: &[usize], complete| stamp_ocr::Evidence {
        identities: ids.iter().copied().collect(),
        complete,
    };
    let pro = index("viofo-a119m-pro");
    let mini = index("viofo-a119-mini-2");
    assert_eq!(
        recognition_from_stamp(Path::new("/Volumes/Untitled"), &r, &evidence(&[pro], true))
            .1
            .unwrap()
            .id,
        "viofo-a119m-pro"
    );
    for e in [
        evidence(&[pro, mini], true),
        evidence(&[mini], false),
        evidence(&[pro], false),
    ] {
        let (v, c) = recognition_from_stamp(Path::new("/Volumes/A119M Pro"), &r, &e);
        assert!(c.is_none());
        assert!(v.get("model").is_none());
    }
    assert!(stamp_ocr::unique(&evidence(&[pro], true), &Report::default()).is_none());
}

#[test]
#[cfg(not(all(target_os = "macos", not(scanner_no_native_ocr))))]
fn non_macos_metadata_fallback() {
    let (v, c) = recognize_with_ocr(
        Path::new("/Volumes/A119M Pro"),
        &report(),
        &AtomicBool::new(false),
        || {},
    );
    assert_eq!(c.unwrap().id, "viofo-a119m-pro");
    assert!(!v.to_string().contains("bottom-of-frame"));
}

#[test]
#[cfg(all(target_os = "macos", not(scanner_no_native_ocr)))]
#[ignore = "developer-only generated MP4s; run scripts/test-local-ocr.py"]
fn actual_native_decoder_and_vision() {
    let base = std::path::PathBuf::from(
        std::env::var_os("SCANNER_OCR_FIXTURES").expect("fixture directory"),
    );
    let cancel = AtomicBool::new(false);
    let mut ticks = 0;
    for (name, expected) in [
        ("positive", Some("viofo-a119m-pro")),
        ("blank", None),
        ("mini", Some("viofo-a119-mini-2")),
        ("conflicting", None),
        ("mixed", None),
        ("top-only", None),
        ("large-tail", Some("viofo-a119m-pro")),
    ] {
        let root = base.join(name);
        let r = crate::engine::scan(&root, &cancel, |_| {}).unwrap();
        let before = serde_json::to_string(&r).unwrap();
        let (v, c) = recognize_with_ocr(&root, &r, &cancel, || ticks += 1);
        assert_eq!(serde_json::to_string(&r).unwrap(), before);
        eprintln!(
            "actual AVFoundation+Vision {name}: {}",
            c.map_or("unknown", |c| c.id.as_str())
        );
        assert_eq!(c.map(|c| c.id.as_str()), expected, "{name}: {v}");
        assert!(!v.to_string().contains("20261021"));
        if name == "mini" {
            let evidence = stamp_ocr::probe(&root, &r, &cancel, &mut || {});
            let (v, c) = recognition_from_stamp(Path::new("/Volumes/A119M Pro"), &r, &evidence);
            assert_eq!(c.unwrap().id, "viofo-a119-mini-2");
            assert_eq!(v["model"], "A119 Mini 2");
        }
    }
    assert!(ticks >= 6);
    let root = base.join("positive");
    let r = crate::engine::scan(&root, &cancel, |_| {}).unwrap();
    let stopped = AtomicBool::new(true);
    assert!(
        recognize_with_ocr(&root, &r, &stopped, || panic!("cancelled progress"))
            .1
            .is_none()
    );
    let in_flight = AtomicBool::new(false);
    let start = std::time::Instant::now();
    assert!(recognize_with_ocr(&root, &r, &in_flight, || {
        in_flight.store(true, std::sync::atomic::Ordering::Relaxed);
    })
    .1
    .is_none());
    assert!(start.elapsed() < std::time::Duration::from_secs(5));
    // A swapped FIFO must never block the read-only file open.
    assert!(recognize_with_ocr(&base.join("fifo"), &r, &cancel, || {})
        .1
        .is_none());
    // Real no-follow final file and directory checks using an existing report.
    for name in ["symlink-file", "symlink-dir"] {
        assert!(recognize_with_ocr(&base.join(name), &r, &cancel, || {})
            .1
            .is_none());
    }
}
