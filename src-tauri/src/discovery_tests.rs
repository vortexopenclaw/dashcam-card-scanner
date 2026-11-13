// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
fn parse(s: &str) -> Discovery {
    let mut d = Discovery::default();
    d.sources.push(Source {
        id: "support-1".into(),
        format: "unknown".into(),
        encoding: "utf8".into(),
        size_bytes: s.len() as u64,
    });
    d.parse("support-1", s);
    d
}
fn inspect(bytes: &[u8]) -> Discovery {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("unknown"), bytes).unwrap();
    let root = crate::engine::safe_root(temp.path()).unwrap();
    let dir = crate::engine::open_dir_secure(&root).unwrap();
    let mut d = Discovery::default();
    d.inspect(
        &dir,
        Path::new("unknown"),
        bytes.len() as u64,
        &AtomicBool::new(false),
    );
    d
}
#[test]
fn generic_unknown_nested_records_not_identity() {
    let d = parse(
        r#"{"camera":{"model":"Uncatalogued-X9","fw":"8.0.0.16"},"rear":{"rear_model":"Accessory-Q2","version":"2.3.4"},"wifi_pwd":"CANARY_SECRET","owner":"CANARY_CONTACT"}"#,
    );
    assert_eq!(d.observations.len(), 4);
    assert!(d.coverage.multiple_model_values);
    assert!(d.observations.iter().all(|o| o.scope == "unbound"));
    assert_eq!(
        d.observations
            .iter()
            .find(|o| o.key == "version")
            .unwrap()
            .field,
        "build"
    );
    assert!(!serde_json::to_string(&d).unwrap().contains("CANARY"));
}
#[test]
fn synthetic_sectioned_and_duplicate_ini_preserves_context() {
    let d=parse("[front]\nModel=Proto-X9\nFirmware=1.2.3\n[rear]\nModel=Proto-R2\nModel=Proto-R3\nHDR=on\nQuality=Standard\nResolution=3840x2160\n");
    assert_eq!(d.observations.len(), 6);
    let models: Vec<_> = d
        .observations
        .iter()
        .filter(|o| o.field == "model")
        .collect();
    assert_ne!(models[0].record, models[1].record);
    assert_ne!(models[1].record, models[2].record);
    assert!(d.coverage.multiple_model_values);
    assert_eq!(d.coverage.reasons["unsafe_value"], 1);
}
#[test]
fn strict_duplicate_json_and_invalid_encoding() {
    for s in [
        r#"{"model":"X1","model":"X2"}"#,
        r#"{"nested":{"fw":"1.2","fw":"2.3"}}"#,
    ] {
        let d = parse(s);
        assert!(d.observations.is_empty());
        assert!(d.coverage.reasons.contains_key("malformed"));
    }
    let d = inspect(&[0xff, 0x81]);
    assert_eq!(d.coverage.reasons["invalid_encoding"], 1);
    let d = inspect(&[0xff, 0xfe, 0x00, 0xd8]);
    assert_eq!(d.coverage.reasons["invalid_encoding"], 1);
}
#[test]
fn utf8_bom_utf16_both_and_framed_line_json() {
    let s = "model=Future-X1\nfirmware=1.2.3\n";
    for le in [true, false] {
        let mut b = if le {
            vec![0xff, 0xfe]
        } else {
            vec![0xfe, 0xff]
        };
        for c in s.encode_utf16() {
            b.extend(if le { c.to_le_bytes() } else { c.to_be_bytes() });
        }
        let d = inspect(&b);
        assert_eq!(d.observations.len(), 2);
        assert_eq!(
            d.sources[0].encoding,
            if le { "utf16le" } else { "utf16be" }
        );
    }
    let d = inspect(format!("\u{feff}{s}").as_bytes());
    assert_eq!(d.observations.len(), 2);
    let d=parse("\x1b[32m[t] info {\"model\":\"Future-X1\",\"fw\":\"1.2.3\"}\x1b[0m\n{\"rear_model\":\"Rear-X2\"}\n");
    assert_eq!(d.observations.len(), 3);
    assert_eq!(d.observations[2].line, 2);
}
#[test]
fn binary_magic_xml_and_no_printable_fragments() {
    for (b, f) in [
        (vec![0xff, 0xd8, 0xff], "jpeg"),
        (b"\0\0\0\x18ftypisom".to_vec(), "isobmff"),
        (b"\0model=Secret-X1".to_vec(), "binary"),
        (b"<root><model>Future-X1</model></root>".to_vec(), "xml"),
        (
            b"arbitrary printable fragments Future-X1".to_vec(),
            "unknown",
        ),
    ] {
        let d = inspect(&b);
        assert_eq!(d.sources[0].format, f);
        assert!(d.observations.is_empty());
        assert_eq!(d.coverage.reasons["unsupported_format"], 1);
    }
    let mut tar = vec![0; 512];
    tar[257..262].copy_from_slice(b"ustar");
    assert_eq!(inspect(&tar).sources[0].format, "tar");
}
#[test]
fn typed_validators_reject_sensitive_canaries() {
    for field in ["firmware", "build"] {
        for value in ["192.168.1.10", "10.0.0.1", "172.16.1.2", "127.0.0.1"] {
            assert!(!valid_value(field, field, value));
        }
    }

    for s in [
        "alice@example.org",
        "https://example.org",
        "CANARY_SECRET",
        "wifi-network",
        "123456789",
        "192.168.1.10",
        "aa:bb:cc:dd:ee:ff",
        "550e8400-e29b-41d4-a716-446655440000",
        "GPS 12.34",
    ] {
        let d = parse(&format!("model={s}\n"));
        assert!(d.observations.is_empty(), "{s}");
        assert_eq!(d.coverage.reasons["unsafe_value"], 1);
    }
    for s in ["High detail CANARY", "PlatePix", "arbitrary owner words"] {
        assert!(!valid_value("setting", "quality", s));
    }
}
#[test]
fn observation_limit_sticky_model_conflict_and_no_dangling_sources() {
    let mut text = String::new();
    for _ in 0..130 {
        text.push_str("fps=30\n")
    }
    text.push_str("model=Future-X1\nmodel=Rear-X2\n");
    let d = parse(&text);
    assert_eq!(d.observations.len(), 128);
    assert_eq!(d.coverage.omitted_observations, 4);
    assert!(d.coverage.multiple_model_values);
    assert_eq!(d.coverage.reasons["observation_limit"], 4);
}
#[test]
fn payload_fitting_discloses_omissions_and_keeps_conflict_sticky() {
    let mut text = String::new();
    for _ in 0..128 {
        text.push_str("model=Future-XXXXXXXXXXXXXX Proto-XXXXXXXXXXXXXX Pro-XXXXXXXXXXXXXX\n")
    }
    text.push_str("rear_model=Rear-X2\n");
    let d = parse(&text);
    let mut payload = serde_json::json!({"schemaVersion":1,"owner":{"manufacturer":"Synthetic","model":"Owner","channelCount":2},"evidence":[],"scan":{"discovery":d}});
    let out = crate::intake::fit_payload(&mut payload).unwrap();
    assert!(out.len() <= 16384);
    let d = &payload["scan"]["discovery"];
    let c = &d["coverage"];
    let retained = c["retainedObservations"].as_u64().unwrap();
    let omitted = c["omittedObservations"].as_u64().unwrap();
    assert!(retained < 128);
    assert_eq!(retained + omitted, 129);
    assert_eq!(retained, d["observations"].as_array().unwrap().len() as u64);
    assert_eq!(c["multipleModelValues"], true);
    assert_eq!(c["limited"], true);
    assert_eq!(c["reasons"]["observation_limit"], omitted);
}
#[test]
fn inventory_size_byte_file_source_caps_and_cancellation() {
    let temp = tempfile::tempdir().unwrap();
    let root = crate::engine::safe_root(temp.path()).unwrap();
    let dir = crate::engine::open_dir_secure(&root).unwrap();
    std::fs::write(root.join("file"), b"model=Future-X1\n").unwrap();
    let mut d = Discovery::default();
    for _ in 0..260 {
        d.inspect(&dir, Path::new("file"), 16, &AtomicBool::new(false));
    }
    assert_eq!(d.coverage.inventoried_candidates, 260);
    assert_eq!(d.coverage.inspected_files, 256);
    assert_eq!(d.coverage.uninspected_files, 4);
    assert_eq!(d.coverage.reasons["file_limit"], 4);
    let mut d = Discovery::default();
    d.inspect(&dir, Path::new("file"), 65537, &AtomicBool::new(false));
    assert_eq!(d.coverage.reasons["oversize"], 1);
    assert_eq!(d.coverage.bytes_read, 0);
    let mut d = Discovery::default();
    d.coverage.bytes_read = 4194300;
    d.inspect(&dir, Path::new("file"), 16, &AtomicBool::new(false));
    assert_eq!(d.coverage.reasons["byte_limit"], 1);
    let mut d = Discovery::default();
    d.inspect(&dir, Path::new("file"), 16, &AtomicBool::new(true));
    assert_eq!(d.coverage.uninspected_files, 1);
    assert_eq!(d.coverage.bytes_read, 0);
    std::fs::write(root.join("large"), vec![b' '; 65536]).unwrap();
    let mut aggregate = Discovery::default();
    for _ in 0..65 {
        aggregate.inspect(&dir, Path::new("large"), 65536, &AtomicBool::new(false));
    }
    assert_eq!(aggregate.coverage.bytes_read, 4194304);
    assert_eq!(aggregate.coverage.inspected_files, 64);
    assert_eq!(aggregate.coverage.uninspected_files, 1);
    assert_eq!(aggregate.coverage.reasons["byte_limit"], 1);
    // All successful inspections retain at most 128 anonymous sources, count omissions.
    let mut d = Discovery::default();
    let n = std::fs::metadata(root.join("file")).unwrap().len();
    for _ in 0..140 {
        d.inspect(&dir, Path::new("file"), n, &AtomicBool::new(false));
    }
    assert_eq!(d.sources.len(), 128);
    assert_eq!(d.observations.len(), 128);
    assert_eq!(d.coverage.omitted_observations, 12);
    assert!(d
        .observations
        .iter()
        .all(|o| d.sources.iter().any(|s| s.id == o.source_id)));
}
#[test]
fn mutation_and_cancellation_during_read_discard_observations() {
    let temp = tempfile::tempdir().unwrap();
    let root = crate::engine::safe_root(temp.path()).unwrap();
    let p = root.join("file");
    std::fs::write(&p, b"model=Future-X1\n").unwrap();
    let dir = crate::engine::open_dir_secure(&root).unwrap();
    let size = std::fs::metadata(&p).unwrap().len();
    let mut d = Discovery::default();
    d.inspect_with_hook(
        &dir,
        Path::new("file"),
        size,
        &AtomicBool::new(false),
        || {
            std::fs::write(&p, b"model=Replaced-X2\nextra=data").unwrap();
        },
    );
    assert!(d.observations.is_empty());
    assert_eq!(d.coverage.reasons["changed_source"], 1);
    assert_eq!(d.coverage.bytes_read, size as usize);
    let cancel = AtomicBool::new(false);
    let mut d = Discovery::default();
    let size = std::fs::metadata(&p).unwrap().len();
    d.inspect_with_hook(&dir, Path::new("file"), size, &cancel, || {
        cancel.store(true, Ordering::Relaxed)
    });
    assert!(d.observations.is_empty());
    assert!(d.coverage.limited);
}
#[test]
fn walker_inventory_continues_after_limits_and_selection_is_deterministic() {
    let mut snapshots = Vec::new();
    for reverse in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let root = crate::engine::safe_root(temp.path()).unwrap();
        for j in 0..260 {
            let i = if reverse { 259 - j } else { j };
            std::fs::write(
                root.join(format!("unknown-{i:03}.opaque")),
                format!("model=Future-X{i:03}\n"),
            )
            .unwrap();
        }
        let report = crate::engine::scan(&root, &AtomicBool::new(false), |_| {}).unwrap();
        let d = report.discovery.unwrap();
        assert_eq!(report.scanned_files, 260);
        assert_eq!(d.coverage.inventoried_candidates, 260);
        assert_eq!(d.coverage.inspected_files, 256);
        assert_eq!(d.coverage.uninspected_files, 4);
        assert_eq!(d.coverage.reasons["file_limit"], 4);
        assert_eq!(d.observations.len(), 128);
        assert_eq!(d.coverage.omitted_observations, 128);
        assert_eq!(d.observations[0].value, "Future-X000");
        assert!(d.coverage.multiple_model_values);
        snapshots.push(serde_json::to_value(d).unwrap());
    }
    assert_eq!(snapshots[0], snapshots[1]);
}
#[test]
fn unknown_paths_extensions_symlinks_and_changed_size() {
    let temp = tempfile::tempdir().unwrap();
    let root = crate::engine::safe_root(temp.path()).unwrap();
    std::fs::create_dir_all(root.join(".git/deep/tmp")).unwrap();
    std::fs::write(
        root.join(".git/deep/tmp/unfamiliar.zzz"),
        b"model=Future-X1\nfirmware=1.2.3\n",
    )
    .unwrap();
    std::fs::write(root.join("extensionless"), b"version=2.3.4\n").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(root.join("extensionless"), root.join("link")).unwrap();
    let report = crate::engine::scan(&root, &AtomicBool::new(false), |_| {}).unwrap();
    let d = report.discovery.unwrap();
    assert_eq!(d.coverage.inventoried_candidates, 2);
    assert_eq!(d.observations.len(), 3);
    assert!(report.recognized_camera_id.is_none());
    assert!(!serde_json::to_string(&d).unwrap().contains("unfamiliar"));
    let dir = crate::engine::open_dir_secure(&root).unwrap();
    let mut d = Discovery::default();
    d.inspect(&dir, Path::new("extensionless"), 3, &AtomicBool::new(false));
    assert_eq!(d.coverage.reasons["changed_source"], 1);
    #[cfg(unix)]
    {
        let mut d = Discovery::default();
        d.inspect(&dir, Path::new("link"), 14, &AtomicBool::new(false));
        assert!(d.observations.is_empty());
        assert_eq!(d.coverage.reasons["read_error"], 1);
        std::os::unix::fs::symlink(root.join(".git"), root.join("ancestor")).unwrap();
        assert!(crate::engine::open_dir_secure(&root.join("ancestor/deep")).is_err());
    }
}
