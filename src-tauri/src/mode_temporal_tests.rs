// SPDX-License-Identifier: AGPL-3.0-only
use super::*;
use sha2::{Digest, Sha256};
use std::sync::atomic::AtomicBool;
fn bmff(duration: f64, fps: f64, frame_bytes: u32) -> Vec<u8> {
    fn bx(tag: &[u8; 4], body: Vec<u8>) -> Vec<u8> {
        let mut b = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        b.extend(tag);
        b.extend(body);
        b
    }
    let mut mdhd = vec![0; 24];
    mdhd[12..16].copy_from_slice(&1000u32.to_be_bytes());
    mdhd[16..20].copy_from_slice(&((duration * 1000.0) as u32).to_be_bytes());
    let mut hdlr = vec![0; 12];
    hdlr[8..12].copy_from_slice(b"vide");
    let mut entry = vec![0; 78];
    entry[24..26].copy_from_slice(&1920u16.to_be_bytes());
    entry[26..28].copy_from_slice(&1080u16.to_be_bytes());
    let mut stsd = vec![0, 0, 0, 0, 0, 0, 0, 1];
    stsd.extend(bx(b"avc1", entry));
    let count = (duration * fps).round() as u32;
    let mut stsz = vec![0; 4];
    stsz.extend(frame_bytes.to_be_bytes());
    stsz.extend(count.to_be_bytes());
    let mut stbl = bx(b"stsd", stsd);
    stbl.extend(bx(b"stsz", stsz));
    let mut mdia = bx(b"mdhd", mdhd);
    mdia.extend(bx(b"hdlr", hdlr));
    mdia.extend(bx(b"minf", bx(b"stbl", stbl)));
    let mut bytes = bx(b"moov", bx(b"trak", bx(b"mdia", mdia)));
    bytes.extend(bx(b"mdat", vec![0; (frame_bytes * count) as usize]));
    bytes
}
fn scan(starts: &[u32], duration: f64, fps: f64, channels: &[&str]) -> Report {
    let root = tempfile::Builder::new()
        .prefix("temporal-native-")
        .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
        .unwrap();
    let bytes = bmff(duration, fps, 10);
    let mut before = Vec::new();
    for (i, t) in starts.iter().enumerate() {
        for ch in channels {
            let day = 1 + t / 86400;
            let sec = t % 86400;
            let name = format!(
                "2030_01{day:02}_{:02}{:02}{:02}_{:06}P{ch}.MP4",
                sec / 3600,
                sec / 60 % 60,
                sec % 60,
                i + 1
            );
            let path = root.path().join(name);
            std::fs::write(&path, &bytes).unwrap();
            before.push((
                path.clone(),
                Sha256::digest(&bytes),
                std::fs::metadata(path).unwrap().modified().unwrap(),
            ));
        }
    }
    let r = crate::engine::scan(root.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(
        r.metadata_coverage.measured_files,
        starts.len() * channels.len()
    );
    for (p, hash, mtime) in before {
        assert_eq!(Sha256::digest(std::fs::read(&p).unwrap()), hash);
        assert_eq!(std::fs::metadata(p).unwrap().modified().unwrap(), mtime);
    }
    r
}
fn infer(r: &Report) -> TemporalParkingEvidence {
    infer_temporal_parking(r, Some("viofo-t340"), None, &[])
}
#[test]
fn native_whole_inventory_infers_one_three_five_capture_fps_not_playback_fps() {
    for capture in [1, 3, 5] {
        let starts: Vec<_> = (0..8).map(|i| 43200 + i * 1800 / capture).collect();
        let r = scan(&starts, 60.0, 30.0, &["F", "R"]);
        assert!(r.sampled_files < r.metadata_coverage.measured_files);
        let e = infer(&r);
        assert_eq!(e.suggestion, Some("time_lapse_like"), "{e:?}");
        assert!((e.estimated_capture_fps.unwrap() - capture as f64).abs() < 0.01);
        assert_eq!(e.cohorts[0].measured_playback_fps, 30.0);
        let json = serde_json::to_string(&e).unwrap();
        assert!(!json.contains("2030") && !json.contains("localName") && !json.contains("120000"));
    }
}
#[test]
fn continuous_rounding_and_midnight_are_not_time_lapse() {
    let starts: Vec<_> = (0..8).map(|i| 86300 + i * 60).collect();
    let r = scan(&starts, 59.967, 30.0, &["F", "R"]);
    let e = infer(&r);
    assert_eq!(e.suggestion, Some("continuous_like"), "{e:?}");
    assert_eq!(e.estimated_capture_fps, None);
    let mut jitter = r.clone();
    // One-second filename quantization is tolerated; durations remain actual pairs.
    for (i, e) in jitter.temporal.entries.iter_mut().enumerate() {
        if i % 4 == 0 {
            let bytes = e.name.as_bytes();
            let mut name = String::from_utf8(bytes.to_vec()).unwrap();
            let sec = name[14..16].parse::<u32>().unwrap();
            if sec < 59 {
                name.replace_range(14..16, &format!("{:02}", sec + 1));
                e.name = name;
            }
        }
    }
    assert_eq!(infer(&jitter).suggestion, Some("continuous_like"));
}
#[test]
fn representative_every_tenth_continuous_sample_cannot_alias_three_fps() {
    let starts: Vec<_> = (0..71).map(|i| 43200 + i * 60).collect();
    let mut r = scan(&starts, 60.0, 30.0, &["F"]);
    assert!(r.sampled_files <= 64);
    // Deliberately replace outgoing representatives with every tenth full entry.
    r.folders[0].samples = r
        .temporal
        .entries
        .iter()
        .step_by(10)
        .map(|e| crate::engine::Sample {
            local_name: e.name.clone(),
            video: e.video.clone(),
            ..Default::default()
        })
        .collect();
    assert_eq!(infer(&r).suggestion, Some("continuous_like"));
    r.temporal = TemporalInventory::default();
    assert_eq!(infer(&r).suggestion, None);
}
#[test]
fn matching_firmware_encoding_baseline_strengthens_only_continuous_family() {
    let r = scan(
        &(0..8).map(|i| 43200 + i * 60).collect::<Vec<_>>(),
        60.0,
        30.0,
        &["F"],
    );
    let baseline = DrivingBaseline {
        native_id: "viofo-t340",
        firmware: "known-v1",
        codec: "h264",
        width: 1920,
        height: 1080,
        playback_fps: 30.0,
        median_video_bitrate: 24000.0,
        measured_clips: 8,
    };
    let e = infer_temporal_parking(&r, Some("viofo-t340"), Some("known-v1"), &[baseline]);
    assert_eq!(e.suggestion, Some("low_bitrate_continuous_like"));
    assert!(e.cohorts[0].reason.contains("vbr_scene"));
    for (firmware, codec, width, fps) in [
        ("other-v2", "h264", 1920, 30.0),
        ("known-v1", "hevc", 1920, 30.0),
        ("known-v1", "h264", 3840, 30.0),
        ("known-v1", "h264", 1920, 60.0),
    ] {
        let b = DrivingBaseline {
            native_id: "viofo-t340",
            firmware,
            codec,
            width,
            height: 1080,
            playback_fps: fps,
            median_video_bitrate: 24000.0,
            measured_clips: 8,
        };
        assert_eq!(
            infer_temporal_parking(&r, Some("viofo-t340"), Some("known-v1"), &[b]).suggestion,
            Some("continuous_like")
        );
    }
}
#[test]
fn irregular_aligned_parking_bursts_are_event_like_not_exact_trigger_modes() {
    let e = infer(&scan(
        &[43200, 43300, 43800, 44000, 45000, 45400],
        60.0,
        30.0,
        &["F", "R"],
    ));
    assert_eq!(e.suggestion, Some("event_like"), "{e:?}");
    assert_eq!(e.confidence, "possible");
    assert_eq!(e.estimated_capture_fps, None);
}
#[test]
fn dropped_channels_sequences_and_incomplete_inventory_fail_whole_card_closed() {
    let starts: Vec<_> = (0..8).map(|i| 43200 + i * 600).collect();
    let r = scan(&starts, 60.0, 30.0, &["F", "R"]);
    let mut dropped = r.clone();
    dropped.temporal.entries.remove(2);
    dropped.temporal.seen -= 1;
    dropped.metadata_coverage.recognized_files -= 1;
    assert_eq!(infer(&dropped).suggestion, None);
    let mut partial = r.clone();
    partial.inventory_complete = false;
    assert_eq!(infer(&partial).suggestion, None);
    let mut unsupported = r.clone();
    unsupported.temporal.entries[2].video = None;
    assert_eq!(infer(&unsupported).suggestion, None);
    let mut vfr = r.clone();
    for e in &mut vfr.temporal.entries {
        e.video.as_mut().unwrap().nominal_frame_rate = Some(27.4);
    }
    assert_eq!(infer(&vfr).suggestion, None);
    let mut duplicate = r.clone();
    duplicate.temporal.entries[2].name = duplicate.temporal.entries[0].name.clone();
    assert_eq!(infer(&duplicate).suggestion, None);
}
#[test]
fn mixed_settings_and_gap_boundaries_retain_cohorts_without_global_label() {
    let starts: Vec<_> = (0..12)
        .map(|i| {
            43200
                + if i < 6 {
                    i * 600
                } else {
                    3000 + (i - 5) * 1800
                }
        })
        .collect();
    let r = scan(&starts, 60.0, 30.0, &["F", "R"]);
    assert_eq!(infer(&r).suggestion, None); // not one stable compression factor
    let mut changed = r.clone();
    for e in changed.temporal.entries.iter_mut().skip(12) {
        e.video.as_mut().unwrap().width = 3840;
    }
    let e = infer(&changed);
    assert_eq!(e.suggestion, None);
    assert!(e.cohorts.len() >= 3);
    let mut short = r.clone();
    short.temporal.entries[4]
        .video
        .as_mut()
        .unwrap()
        .duration_seconds = 3.0;
    assert_eq!(infer(&short).suggestion, None);
    assert_eq!(
        infer(&scan(
            &[43200, 43260, 46920, 46980, 47040, 47100],
            60.0,
            30.0,
            &["F"]
        ))
        .suggestion,
        None
    ); // DST/clock jump
}
#[test]
fn serde_cannot_import_temporal_authority_and_cap_does_not_stop_inventory() {
    let mut r = scan(
        &(0..8).map(|i| 43200 + i * 600).collect::<Vec<_>>(),
        60.0,
        30.0,
        &["F"],
    );
    let mut json = serde_json::to_value(&r).unwrap();
    assert!(json.get("temporal").is_none());
    json["temporal"] = serde_json::json!({"seen":8,"limited":false,"entries":[]});
    let imported: Report = serde_json::from_value(json).unwrap();
    assert_eq!(infer(&imported).suggestion, None);
    let entry = r.temporal.entries[0].clone();
    for _ in 0..MAX_TEMPORAL {
        r.temporal
            .record(&entry.name, &entry.folder, entry.video.as_ref());
    }
    assert!(r.temporal.limited);
    assert_eq!(r.temporal.entries.len(), MAX_TEMPORAL);
    assert_eq!(infer(&r).suggestion, None);
    assert!(r.inventory_complete); // temporal budget is not structural-inventory failure
}
#[test]
fn native_low_playback_fps_is_not_universally_a_time_lapse_menu_setting() {
    let e = infer(&scan(
        &(0..8).map(|i| 43200 + i * 60).collect::<Vec<_>>(),
        60.0,
        3.0,
        &["F"],
    ));
    assert_eq!(e.suggestion, Some("continuous_like"));
    assert_eq!(e.estimated_capture_fps, None);
    // It records continuous-looking wall time at low playback fps. Distinguishing
    // menu-selected nonaccelerated time lapse needs model/firmware evidence.
}
#[test]
fn isolated_false_gap_and_bitrate_transition_do_not_label_whole_card() {
    let e = infer(&scan(
        &[43200, 43260, 43320, 43380, 43500, 43560, 43620, 43680],
        60.0,
        30.0,
        &["F", "R"],
    ));
    assert_eq!(e.suggestion, None);
    let mut r = scan(
        &(0..12).map(|i| 43200 + i * 60).collect::<Vec<_>>(),
        60.0,
        30.0,
        &["F"],
    );
    // Retention order is filesystem order, so partition by parsed filename time.
    for e in &mut r.temporal.entries {
        if timestamp(&e.name).unwrap().0 >= timestamp("2030_0101_120600_000007PF.MP4").unwrap().0 {
            e.video.as_mut().unwrap().video_bitrate = Some(24000.0);
        }
    }
    let e = infer(&r);
    assert_eq!(e.suggestion, None);
    assert_eq!(e.cohorts.len(), 2);
    assert!(e
        .cohorts
        .iter()
        .all(|c| c.suggestion == Some("continuous_like")));
}
#[test]
fn final_truncated_clip_duration_is_excluded_not_a_fake_mode_transition() {
    let mut r = scan(
        &(0..8).map(|i| 43200 + i * 600).collect::<Vec<_>>(),
        60.0,
        30.0,
        &["F"],
    );
    let last = r
        .temporal
        .entries
        .iter_mut()
        .max_by_key(|e| timestamp(&e.name).unwrap().0)
        .unwrap();
    last.video.as_mut().unwrap().duration_seconds = 2.0;
    assert_eq!(infer(&r).suggestion, Some("time_lapse_like"));
    assert!((infer(&r).estimated_capture_fps.unwrap() - 3.0).abs() < 0.01);
}
#[test]
fn actual_traversal_temporal_cap_preserves_complete_inventory_and_source() {
    let root = tempfile::Builder::new()
        .prefix("temporal-cap-native-")
        .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
        .unwrap();
    let mut before = Vec::new();
    for i in 0..MAX_TEMPORAL + 2 {
        let p = root.path().join(format!("{i:06}.MP4"));
        std::fs::write(&p, b"unmeasured").unwrap();
        before.push((p.clone(), std::fs::metadata(p).unwrap().modified().unwrap()));
    }
    let r = crate::engine::scan(root.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert!(r.inventory_complete);
    assert!(!r.limited);
    assert_eq!(r.scanned_files as usize, MAX_TEMPORAL + 2);
    assert_eq!(r.probe_attempts, MAX_TEMPORAL + 2);
    assert!(r.temporal.limited);
    assert_eq!(r.temporal.entries.len(), MAX_TEMPORAL);
    assert_eq!(infer(&r).suggestion, None);
    for (p, mtime) in before {
        assert_eq!(
            Sha256::digest(std::fs::read(&p).unwrap()),
            Sha256::digest(b"unmeasured")
        );
        assert_eq!(std::fs::metadata(p).unwrap().modified().unwrap(), mtime);
    }
}
