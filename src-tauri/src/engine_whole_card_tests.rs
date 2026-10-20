// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use std::io::Cursor;

fn scratch() -> tempfile::TempDir {
    tempfile::Builder::new()
        .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
        .unwrap()
}
fn boxed(tag: &[u8; 4], body: Vec<u8>) -> Vec<u8> {
    let mut b = ((body.len() + 8) as u32).to_be_bytes().to_vec();
    b.extend(tag);
    b.extend(body);
    b
}
// Minimal metadata-only ISO BMFF fixtures. These test the reader, not decoding.
fn metadata_fixture(codec: &[u8; 4], width: u16, fps: u32) -> Vec<u8> {
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
    assert!(video::probe(&mut Cursor::new(&bytes), bytes.len() as u64).is_some());
    bytes
}
#[test]
fn whole_card_exceeds_old_directory_and_probe_limits() {
    let t = scratch();
    let bytes = metadata_fixture(b"avc1", 1920, 30);
    for i in 0..180 {
        let d = t.path().join(format!("private-{i}"));
        std::fs::create_dir(&d).unwrap();
        for j in 0..2 {
            std::fs::write(d.join(format!("{j:06}F.MP4")), &bytes).unwrap();
        }
    }
    std::fs::write(
        t.path().join("999999T.MP4"),
        metadata_fixture(b"hvc1", 3840, 60),
    )
    .unwrap();
    std::fs::write(
        t.path().join("999998R.MP4"),
        metadata_fixture(b"avc1", 2560, 25),
    )
    .unwrap();
    let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(r.folders.len(), 181);
    assert_eq!(r.scanned_files, 362);
    assert_eq!(r.probe_attempts, 362);
    assert_eq!(r.metadata_coverage.inspected_files, 362);
    assert_eq!(r.metadata_coverage.measured_files, 362);
    assert!(r.inventory_complete && r.metadata_coverage.complete && !r.limited);
    assert!(r.metadata_coverage.representative_samples_limited);
    assert!(r.sampled_files <= MAX_SAMPLES);
    assert_eq!(
        r.sampled_files,
        r.folders.iter().map(|f| f.samples.len()).sum::<usize>()
    );
    let cohorts: Vec<_> = r.folders.iter().flat_map(|f| &f.metadata_cohorts).collect();
    assert_eq!(cohorts.iter().map(|c| c.file_count).sum::<u64>(), 362);
    assert!(cohorts
        .iter()
        .any(|c| c.filename_template == "SEQUENCET.MP4"
            && c.paired_measurements[0].codec == "hevc"
            && c.paired_measurements[0].nominal_frame_rate == Some(60.)));
    assert!(cohorts
        .iter()
        .any(|c| c.filename_template == "SEQUENCER.MP4" && c.paired_measurements[0].width == 2560));
    assert!(r
        .folders
        .iter()
        .flat_map(|f| &f.videos)
        .any(|v| v.codec == "hevc"));
    let json = serde_json::to_string(&r).unwrap();
    assert!(!json.contains("private-"));
    assert!(!json.contains("999999"));
}
#[test]
fn tiny_exceptional_guards_have_distinct_counted_reasons() {
    let t = scratch();
    for i in 0..4 {
        std::fs::create_dir(t.path().join(format!("camera{i}"))).unwrap();
    }
    let cancel = AtomicBool::new(false);
    for (limits, reason) in [
        (
            Limits {
                entries: 1,
                ..Limits::default()
            },
            "entry_resource_limit",
        ),
        (
            Limits {
                directories: 1,
                ..Limits::default()
            },
            "directory_resource_limit",
        ),
        (
            Limits {
                depth: 0,
                ..Limits::default()
            },
            "directory_depth_limit",
        ),
    ] {
        let r = scan_with_limits(t.path(), &cancel, |_| {}, limits).unwrap();
        assert!(r.limited && !r.inventory_complete);
        assert!(r.issues[reason] > 0);
        assert_eq!(r.issues.len(), 1);
    }
}
#[test]
fn cohort_resource_guard_does_not_abort_header_or_inventory_coverage() {
    let t = scratch();
    for (i, width) in [1920, 2560, 3840].into_iter().enumerate() {
        std::fs::write(
            t.path().join(format!("{i}F.MP4")),
            metadata_fixture(b"avc1", width, 30),
        )
        .unwrap();
    }
    let r = scan_with_limits(
        t.path(),
        &AtomicBool::new(false),
        |_| {},
        Limits {
            cohorts: 1,
            ..Limits::default()
        },
    )
    .unwrap();
    assert!(r.inventory_complete && !r.limited);
    assert_eq!(r.probe_attempts, 3);
    assert_eq!(r.metadata_coverage.measured_files, 3);
    assert_eq!(r.metadata_coverage.cohort_count, 1);
    assert_eq!(r.issues["metadata_cohort_limit"], 2);
    assert!(!r.metadata_coverage.complete);
}
#[test]
fn late_unique_variant_reclaims_duplicate_intake_slot_immediately() {
    let cancel = AtomicBool::new(false);
    let mut walker = Walker {
        report: Report::default(),
        cancel: &cancel,
        progress: |_: Progress| {},
        limits: Limits::default(),
        last: Instant::now(),
        directories: 0,
        stopped: false,
        next_alias: 0,
        sample_reclamation_exhausted: false,
    };
    let mut f = Folder::default();
    for i in 0..32 {
        for _ in 0..2 {
            walker.retain_sample(
                &mut f,
                Sample {
                    filename_template: format!("family{i}"),
                    ..Default::default()
                },
            );
        }
    }
    assert_eq!(walker.report.sampled_files, MAX_SAMPLES);
    walker.retain_sample(
        &mut f,
        Sample {
            filename_template: "late-channel".into(),
            ..Default::default()
        },
    );
    assert_eq!(walker.report.sampled_files, MAX_SAMPLES);
    assert!(f
        .samples
        .iter()
        .any(|s| s.filename_template == "late-channel"));
}
#[test]
fn paired_extrema_remain_actual_clips_without_cross_configuration_averages() {
    let base = video::probe(
        &mut Cursor::new(metadata_fixture(b"avc1", 1920, 30)),
        metadata_fixture(b"avc1", 1920, 30).len() as u64,
    )
    .unwrap();
    let clips: Vec<_> = (0..100)
        .map(|i| Video {
            duration_seconds: 1. + i as f64,
            file_size_bytes: 1000 + i,
            video_bitrate: Some(5000. - i as f64),
            ..base.clone()
        })
        .collect();
    let mut pairs = vec![];
    for v in &clips {
        add_pair(&mut pairs, v);
    }
    assert!(pairs.len() <= 5);
    assert!(pairs.contains(&clips[0]) && pairs.contains(&clips[99]));
    assert!(pairs.iter().all(|v| clips.contains(v)));
}
#[cfg(unix)]
#[test]
fn unreadable_camera_directory_and_video_have_explicit_reasons_but_os_junk_does_not() {
    use std::os::unix::fs::PermissionsExt;
    // Root can bypass permissions; do not claim a permission failure was exercised.
    if std::process::Command::new("id")
        .arg("-u")
        .output()
        .unwrap()
        .stdout
        == b"0\n"
    {
        return;
    }
    let t = scratch();
    let media = t.path().join("Movie");
    let os = t.path().join(".Spotlight-V100");
    let f = t.path().join("000001F.MP4");
    std::fs::create_dir(&media).unwrap();
    std::fs::create_dir(&os).unwrap();
    std::fs::write(&f, metadata_fixture(b"avc1", 1920, 30)).unwrap();
    for p in [&media, &os, &f] {
        std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o0)).unwrap();
    }
    let result = scan(t.path(), &AtomicBool::new(false), |_| {});
    for p in [&media, &os] {
        std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o600)).unwrap();
    let r = result.unwrap();
    assert!(!r.inventory_complete && r.limited);
    assert_eq!(
        r.issues.get("directory_open_failed").copied().unwrap_or(0)
            + r.issues
                .get("directory_enumeration_failed")
                .copied()
                .unwrap_or(0),
        1
    );
    assert_eq!(r.issues["video_open_failed"], 1);
    std::fs::remove_dir(media).unwrap();
    std::fs::remove_file(f).unwrap();
    let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert!(r.inventory_complete && r.issues.is_empty());
}
#[test]
fn scanning_changes_neither_source_hashes_nor_mtimes() {
    use sha2::{Digest, Sha256};
    let t = scratch();
    let f = t.path().join("000001F.MP4");
    std::fs::write(&f, metadata_fixture(b"avc1", 1920, 30)).unwrap();
    let before = Sha256::digest(std::fs::read(&f).unwrap());
    let mtime = std::fs::metadata(&f).unwrap().modified().unwrap();
    let dir_mtime = std::fs::metadata(t.path()).unwrap().modified().unwrap();
    let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert!(r.metadata_coverage.complete);
    assert_eq!(before, Sha256::digest(std::fs::read(&f).unwrap()));
    assert_eq!(mtime, std::fs::metadata(f).unwrap().modified().unwrap());
    assert_eq!(
        dir_mtime,
        std::fs::metadata(t.path()).unwrap().modified().unwrap()
    );
}
#[test]
fn older_report_json_still_deserializes_with_default_coverage_fields() {
    let mut value = serde_json::to_value(Report::default()).unwrap();
    for field in ["inventoryComplete", "metadataCoverage", "issues"] {
        value.as_object_mut().unwrap().remove(field);
    }
    assert!(serde_json::from_value::<Report>(value).is_ok());
}
#[test]
#[ignore = "developer-only ffmpeg/ffprobe oracle, no production subprocesses"]
fn ffmpeg_whole_card_oracle() {
    use std::process::Command;
    let fixtures = scratch();
    let card = scratch();
    for (name, codec, size, fps) in [
        ("a", "libx264", "320x240", "30"),
        ("b", "libx265", "640x360", "25"),
    ] {
        let f = fixtures.path().join(format!("{name}.mp4"));
        let output = Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                &format!("color=c=black:s={size}:r={fps}"),
                "-t",
                "0.4",
                "-c:v",
                codec,
                "-threads",
                "1",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&f)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let oracle = Command::new("ffprobe")
            .args(["-v", "error", "-show_streams", "-of", "json"])
            .arg(&f)
            .output()
            .unwrap();
        assert!(oracle.status.success());
        let oracle: serde_json::Value = serde_json::from_slice(&oracle.stdout).unwrap();
        let bytes = std::fs::read(&f).unwrap();
        let v = video::probe(&mut Cursor::new(&bytes), bytes.len() as u64).unwrap();
        assert_eq!(
            oracle["streams"][0]["codec_name"].as_str().unwrap(),
            v.codec
        );
        assert_eq!(
            oracle["streams"][0]["width"].as_u64().unwrap(),
            u64::from(v.width)
        );
        assert_eq!(
            oracle["streams"][0]["height"].as_u64().unwrap(),
            u64::from(v.height)
        );
        assert_eq!(v.nominal_frame_rate, Some(fps.parse().unwrap()));
        let duration: f64 = oracle["streams"][0]["duration"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();
        assert!((v.duration_seconds - duration).abs() < 0.0001);
        for i in 0..180 {
            let d = card.path().join(format!("card-{i}"));
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(
                d.join(format!("000001{}.MP4", if name == "a" { "F" } else { "T" })),
                &bytes,
            )
            .unwrap();
        }
    }
    let r = scan(card.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(r.scanned_files, 360);
    assert_eq!(r.probe_attempts, 360);
    assert_eq!(r.metadata_coverage.measured_files, 360);
    assert!(r.inventory_complete && r.metadata_coverage.complete);
    assert_eq!(
        r.folders
            .iter()
            .flat_map(|f| &f.videos)
            .map(|v| &v.codec)
            .collect::<BTreeSet<_>>()
            .len(),
        2
    );
    println!("ffmpeg oracle: {} directories, {} files, {} inspected, {} measured, {} retained private samples", r.folders.len(), r.scanned_files, r.metadata_coverage.inspected_files, r.metadata_coverage.measured_files, r.sampled_files);
}
