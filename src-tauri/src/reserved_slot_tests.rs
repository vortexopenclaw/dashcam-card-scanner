// SPDX-License-Identifier: AGPL-3.0-only
// Synthetic fixtures only; no real card data.
use super::*;
use std::sync::atomic::AtomicBool;

fn scratch() -> tempfile::TempDir {
    tempfile::Builder::new()
        .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
        .unwrap()
}
fn slot(len: usize) -> Vec<u8> {
    let mut v = vec![0u8; len];
    v[..HEADER_LEN as usize].fill(HEADER_BYTE);
    v
}
fn run(bytes: &[u8], budget: Budget) -> (Check, Meter) {
    let t = scratch();
    std::fs::write(t.path().join("S_1.jpg"), bytes).unwrap();
    let dir = crate::engine::open_dir_secure(t.path()).unwrap();
    let meta = dir.symlink_metadata("S_1.jpg").unwrap();
    let mut meter = Meter { budget, ..Default::default() };
    let c = check(&dir, Path::new("S_1.jpg"), &meta, &mut meter);
    (c, meter)
}

#[test]
fn positive_slot_is_reserved() {
    assert_eq!(run(&slot(4096), Budget::default()).0, Check::Reserved);
    assert_eq!(run(&slot(129), Budget::default()).0, Check::Reserved);
}
#[test]
fn genuine_jpeg_is_not_reserved() {
    let mut v = vec![0xFF, 0xD8, 0xFF, 0xE0];
    v.resize(4096, 0);
    let (c, m) = run(&v, Budget::default());
    assert_eq!(c, Check::NotReserved);
    assert_eq!(m.bytes_read, HEADER_LEN);
}
#[test]
fn changed_tail_byte_is_not_reserved() {
    let mut v = slot(4096);
    *v.last_mut().unwrap() = 1;
    assert_eq!(run(&v, Budget::default()).0, Check::NotReserved);
    let mut v = slot(4096);
    v[5] = 0;
    assert_eq!(run(&v, Budget::default()).0, Check::NotReserved);
}
#[test]
fn header_only_is_not_reserved() {
    assert_eq!(run(&slot(128), Budget::default()).0, Check::NotReserved);
    assert_eq!(run(&[], Budget::default()).0, Check::NotReserved);
}
#[cfg(unix)]
#[test]
fn symlink_is_never_reserved() {
    let t = scratch();
    std::fs::write(t.path().join("target.bin"), slot(4096)).unwrap();
    std::os::unix::fs::symlink(t.path().join("target.bin"), t.path().join("S_1.jpg")).unwrap();
    let dir = crate::engine::open_dir_secure(t.path()).unwrap();
    // Even if handed regular-file metadata, the no-follow open must refuse the link.
    let meta = dir.symlink_metadata("target.bin").unwrap();
    let mut meter = Meter::default();
    assert_eq!(check(&dir, Path::new("S_1.jpg"), &meta, &mut meter), Check::UnverifiedReadFailure);
    // And the walker skips symlinks entirely: no slot, no media.
    let r = crate::engine::scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(r.reserved_slot_coverage.reserved_slot_count, 0);
}
#[test]
fn oversize_and_budget_stay_unverified() {
    let small = Budget { max_file_bytes: 1024, ..Budget::default() };
    assert_eq!(run(&slot(4096), small).0, Check::UnverifiedOversize);
    let bytes = Budget { max_total_bytes: 1000, ..Budget::default() };
    assert_eq!(run(&slot(4096), bytes).0, Check::UnverifiedBudget);
    let files = Budget { max_files: 0, ..Budget::default() };
    let (c, m) = run(&slot(4096), files);
    assert_eq!((c, m.bytes_read), (Check::UnverifiedBudget, 0));
}
#[test]
fn scan_keeps_slots_structural_but_not_image_media() {
    let t = scratch();
    let d = t.path().join("DCIM/201photo/front");
    std::fs::create_dir_all(&d).unwrap();
    for i in 0..3 {
        std::fs::write(d.join(format!("S_2030010112010{i}.jpg")), slot(4096)).unwrap();
    }
    let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0];
    jpeg.resize(4096, 0);
    std::fs::write(d.join("S_20300101120109.jpg"), &jpeg).unwrap();
    let r = crate::engine::scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
    let f = r.folders.iter().find(|f| f.file_count == 4).unwrap();
    assert_eq!(f.extensions["jpg"], 4);
    assert_eq!(f.reserved_slot_count(), 3);
    assert_eq!(f.samples.len(), 1);
    assert_eq!(r.reserved_slot_coverage.reserved_slot_count, 3);
    assert_eq!(r.reserved_slot_coverage.not_reserved, 1);
    assert_eq!(r.reserved_slot_coverage.unverified(), 0);
    assert_eq!(crate::intake::folder_media_count(f), 1);
    assert_eq!(crate::observed_channels::media_count(f), 1);
    // Export stays aggregate: no slot names leak into the report JSON.
    let json = serde_json::to_string(&r).unwrap();
    assert!(!json.contains("S_20300101120100"));
    assert!(json.contains("\"reservedSlotCount\":3"));
}
