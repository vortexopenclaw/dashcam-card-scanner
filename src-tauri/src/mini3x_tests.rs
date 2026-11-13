// SPDX-License-Identifier: AGPL-3.0-only
// Synthetic logs only. No source-card identifiers, GPS, or media.
use super::*;
fn fixture(model: &str) -> String {
    format!("[12:00:00:000 INFO-IPS]:WEBGetProductInfo[449]:pJsonData={}\n", json!({"model":model,"version":"v9.0.1.10","password":"synthetic-secret"}))
}
#[test]
fn mini3x_exact_product_bounded_padding_and_private_projection() {
    let t = tempfile::Builder::new().tempdir_in(std::env::temp_dir().canonicalize().unwrap()).unwrap();
    let dir = t.path().join("DCIM/207log");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("20300101120000_000.log");
    let mut bytes = fixture("DDPAI DM003_Overseas_V2").into_bytes();
    bytes.resize(512000, 0); bytes[511999] = 123;
    std::fs::write(&path, &bytes).unwrap();
    let r = crate::engine::scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(r.recognized_camera_id.as_deref(), Some("ddpai-mini3x"));
    assert_eq!(recognition(&r).unwrap()["model"], "MINI3X");
    assert!(!confirmed_z100_main(&r));
    assert_eq!(r.component_metadata[0].firmware_version.as_deref(), Some("v9.0.1.10"));
    assert!(!serde_json::to_string(&r.component_metadata).unwrap().contains("synthetic-secret"));
    for model in ["DDPAI DM003_Overseas_V20", "MINI3X", "MINI3X V3", "Unknown sibling"] {
        std::fs::write(&path, fixture(model)).unwrap();
        assert!(recognition(&crate::engine::scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap()).unwrap().get("model").is_none());
    }
    bytes[1000] = b'x';
    std::fs::write(&path, bytes).unwrap();
    let (rows,c) = read(t.path(), &AtomicBool::new(false));
    assert!(rows.is_empty()); assert!(c.unwrap().limited);
}
#[cfg(unix)]
#[test]
fn mini3x_root_product_symlink_is_not_identity() {
    let t = tempfile::Builder::new().tempdir_in(std::env::temp_dir().canonicalize().unwrap()).unwrap(); let outside = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(outside.path(), fixture("DDPAI DM003_Overseas_V2")).unwrap();
    std::fs::create_dir_all(t.path().join("DCIM/207log")).unwrap();
    std::os::unix::fs::symlink(outside.path(), t.path().join("DCIM/207log/20300101120000_000.log")).unwrap();
    let (rows,c) = read(t.path(), &AtomicBool::new(false));
    assert!(rows.is_empty()); assert!(c.unwrap().limited);
}
