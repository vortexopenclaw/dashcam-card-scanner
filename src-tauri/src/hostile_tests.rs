// SPDX-License-Identifier: AGPL-3.0-only
//! Security review regressions: hostile card trees, mutated media headers and
//! hostile support-file text. Synthetic fixtures only; nothing leaves the temp dir.
use crate::{annotations, engine, intake, mode_evidence, observed_channels, payload, recognition, video};
use std::{io::Cursor, sync::atomic::AtomicBool};

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
pub(crate) fn mp4(codec: &[u8; 4], width: u16, samples: u32, duration_ms: u32) -> Vec<u8> {
    let mut mdhd = vec![0; 24];
    mdhd[12..16].copy_from_slice(&1000u32.to_be_bytes());
    mdhd[16..20].copy_from_slice(&duration_ms.to_be_bytes());
    let mut hdlr = vec![0; 12];
    hdlr[8..12].copy_from_slice(b"vide");
    let mut entry = vec![0; 78];
    entry[24..26].copy_from_slice(&width.to_be_bytes());
    entry[26..28].copy_from_slice(&1080u16.to_be_bytes());
    let mut stsd = vec![0, 0, 0, 0, 0, 0, 0, 1];
    stsd.extend(boxed(codec, entry));
    let mut stsz = vec![0; 4];
    stsz.extend(1u32.to_be_bytes());
    stsz.extend(samples.to_be_bytes());
    let mut stbl = boxed(b"stsd", stsd);
    stbl.extend(boxed(b"stsz", stsz));
    let mut mdia = boxed(b"mdhd", mdhd);
    mdia.extend(boxed(b"hdlr", hdlr));
    mdia.extend(boxed(b"minf", boxed(b"stbl", stbl)));
    let mut bytes = boxed(b"ftyp", b"isom\0\0\0\0isom".to_vec());
    bytes.extend(boxed(b"moov", boxed(b"trak", boxed(b"mdia", mdia))));
    bytes.extend(boxed(b"mdat", vec![0; samples as usize]));
    bytes
}
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}
fn labels() -> payload::Labels {
    serde_json::from_value(serde_json::json!({"manufacturer":"Synthetic","model":"Fixture","channelSetup":"front","firmware":"","settings":"","channelCount":1,"quality":"unknown","qualityLabel":null,"parkingModeLabel":null,"parkingMode":"unknown","timeLapseFps":null})).unwrap()
}
/// Everything the IPC surface derives from a finished scan, as one string.
fn pipeline(root: &std::path::Path, report: &engine::Report) -> String {
    let cancel = AtomicBool::new(false);
    let (recognition, _) = recognition::recognize_with_ocr(root, report, &cancel, || {});
    let mut out = serde_json::to_string(report).unwrap();
    out.push_str(&recognition.to_string());
    for id in [None, Some("blackvue-dr970x-plus"), Some("viofo-a119m-pro"), Some(crate::manual_camera::ID)] {
        out.push_str(&serde_json::to_string(&mode_evidence::parking_evidence(report, id)).unwrap());
        out.push_str(&serde_json::to_string(&observed_channels::observed_channels(report, id)).unwrap());
    }
    for (folder, sample) in intake::selected_samples(report) {
        let _ = intake::sample_hints_for_folder(&sample.local_name, &report.folders[folder].path, None);
    }
    if let Ok(review) = annotations::prepare(report, &labels(), &annotations::Annotations::default()) {
        out.push_str(&review.public_json);
        out.push_str(&review.private_json);
        out.push_str(&review.submission_json);
    }
    out
}
fn snapshot(root: &std::path::Path) -> Vec<(std::path::PathBuf, u64, Option<std::time::SystemTime>)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for e in std::fs::read_dir(&dir).unwrap().flatten() {
            let m = std::fs::symlink_metadata(e.path()).unwrap();
            out.push((e.path(), m.len(), m.modified().ok()));
            if m.is_dir() {
                stack.push(e.path());
            }
        }
    }
    out.sort();
    out
}

#[cfg(unix)]
#[test]
fn hostile_card_tree_is_contained_read_only_and_never_exports_outside_names() {
    use std::os::unix::{ffi::OsStrExt, fs::symlink};
    let card = scratch();
    let outside = scratch();
    let root = card.path();
    std::fs::write(outside.path().join("SECRET_OUTSIDE.MP4"), mp4(b"avc1", 1920, 30, 1000)).unwrap();
    std::fs::write(outside.path().join("device.ini"), "model=OUTSIDE X9\n").unwrap();
    let movie = root.join("DCIM/Movie");
    std::fs::create_dir_all(&movie).unwrap();
    let video = mp4(b"avc1", 1920, 30, 1000);
    // Links in every position, plus special files with media/config names.
    symlink(outside.path(), root.join("DCIM/linkdir")).unwrap();
    symlink(outside.path().join("SECRET_OUTSIDE.MP4"), movie.join("2030_0101_000000_000001F.MP4")).unwrap();
    symlink(outside.path().join("device.ini"), root.join("config.ini")).unwrap();
    symlink("/dev/zero", movie.join("zero.mp4")).unwrap();
    symlink("../../../../../../etc/passwd", movie.join("passwd.txt")).unwrap();
    symlink(&movie, movie.join("loop")).unwrap();
    let fifo = std::ffi::CString::new(movie.join("fifo.MP4").as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc_mkfifo(fifo.as_ptr(), 0o644) }, 0);
    let fifo = std::ffi::CString::new(root.join("settings.ini").as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc_mkfifo(fifo.as_ptr(), 0o644) }, 0);
    let _socket = std::os::unix::net::UnixListener::bind(movie.join("sock.mp4")).unwrap();
    // Odd names: controls, bidi, traversal-looking, separators legal on Unix, long, non-UTF-8.
    let long = format!("{}.MP4", "9".repeat(251));
    let names: Vec<Vec<u8>> = vec![
        b"..\\..\\evil.MP4".to_vec(),
        b"C:evil.MP4".to_vec(),
        b"line\nbreak\r\x1b[31m.MP4".to_vec(),
        "rtl\u{202e}4PM.MP4".as_bytes().to_vec(),
        "nul\u{0}".replace('\0', "\u{7f}").into_bytes(),
        b"<img src=x onerror=alert(1)>.MP4".to_vec(),
        b"\"quote',comma;.MP4".to_vec(),
        b" leading.MP4".to_vec(),
        b"trailing.MP4 ".to_vec(),
        b".hidden.MP4".to_vec(),
        b"...MP4".to_vec(),
        b"\xff\xfe\xfd.MP4".to_vec(),
        b"20300101_000000_NF\xff.mp4".to_vec(),
        long.clone().into_bytes(),
        "\u{0661}\u{0662}\u{0663}\u{0664}\u{0665}\u{0666}\u{0667}\u{0668}_\u{0661}\u{0662}\u{0663}\u{0664}\u{0665}\u{0666}_NFS.mp4".as_bytes().to_vec(),
        "\u{0662}\u{0660}\u{0662}\u{0666}_\u{0660}\u{0661}\u{0660}\u{0661}_\u{0660}\u{0660}\u{0660}\u{0660}\u{0660}\u{0660}_\u{0661}F.MP4".as_bytes().to_vec(),
        b"20300101_000000_NF.mp4".to_vec(),
        b"20300101_000100_NFS.mp4".to_vec(),
        b"9999_9999_999999_99999999999999999999999999999999F.MP4".to_vec(),
        b"2030_0229_000000_18446744073709551615F.MP4".to_vec(),
    ];
    for name in &names {
        match std::fs::write(movie.join(std::ffi::OsStr::from_bytes(name)), &video) {
            // APFS/HFS+ reject non-UTF-8 names (EILSEQ); such names can't exist there.
            Err(e) if cfg!(target_os = "macos") && e.raw_os_error() == Some(92) => continue,
            r => r.unwrap(),
        }
    }
    // Hostile declarations inside real (non-link) support files.
    std::fs::write(root.join("device.ini"), "model=../../etc/passwd\nmodel=<script>alert(1)</script>\nfirmware=1.0\x1b]0;title\x07\nmodel=Evil X9\nfw=1.2.3\n").unwrap();
    std::fs::write(root.join("gps.nmea"), "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A\nlatitude: 48.117300\nlon=11.516667\nserial=SN123456789\n").unwrap();
    let mut deep = root.join("DCIM");
    for i in 0..40 {
        deep.push(format!("d{i}\u{202e}"));
        std::fs::create_dir(&deep).unwrap();
    }
    let before = snapshot(root);
    let outside_before = snapshot(outside.path());
    let (tx, rx) = std::sync::mpsc::channel();
    let scan_root = root.to_path_buf();
    std::thread::spawn(move || {
        let report = engine::scan(&scan_root, &AtomicBool::new(false), |_| {}).unwrap();
        let text = pipeline(&scan_root, &report);
        tx.send((report, text)).unwrap();
    });
    // A FIFO or device target must never block or stream into the scanner.
    let (report, text) = rx
        .recv_timeout(std::time::Duration::from_secs(120))
        .expect("scan must not block on special files");
    assert_eq!(before, snapshot(root), "source tree must be untouched");
    assert_eq!(outside_before, snapshot(outside.path()));
    assert!(report.limited, "depth limit is disclosed");
    for forbidden in [
        "SECRET_OUTSIDE",
        "OUTSIDE X9",
        "passwd",
        "<script>",
        "\u{202e}",
        "48.117300",
        "SN123456789",
        "GPRMC",
        &root.display().to_string(),
        &outside.path().display().to_string(),
    ] {
        assert!(!text.contains(forbidden), "leaked {forbidden:?}");
    }
    // Raw controls can never survive in any serialized JSON string.
    assert!(!text.chars().any(|c| c.is_control() && c != '\n'));
    // Private basenames that reach review/intake satisfy the documented structural rule.
    let review = annotations::prepare(&report, &labels(), &annotations::Annotations::default()).unwrap();
    let private: serde_json::Value = serde_json::from_str(&review.private_json).unwrap();
    let rows = private.get("evidence").or_else(|| private.get("privateEvidence")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    for row in rows {
        if let Some(name) = row.get("filename").and_then(|v| v.as_str()) {
            assert!(intake::safe_media_name(name), "{name:?}");
            assert!(!name.contains(['/', '\\', ':', '\n', '\u{202e}']), "{name:?}");
        }
        if let Some(folder) = row.get("folder").and_then(|v| v.as_str()) {
            assert!(!folder.contains("..") && !folder.starts_with('/'), "{folder:?}");
        }
    }
}
#[cfg(unix)]
extern "C" {
    #[link_name = "mkfifo"]
    fn libc_mkfifo(path: *const std::ffi::c_char, mode: u32) -> i32;
}

#[test]
fn mutated_iso_bmff_headers_never_panic_or_report_impossible_values() {
    let base = mp4(b"hvc1", 3840, 60, 2000);
    let mut rng = Rng(0x9e3779b97f4a7c15);
    for round in 0..60_000 {
        let mut b = base.clone();
        for _ in 0..1 + rng.below(4) {
            let i = rng.below(b.len());
            match rng.below(5) {
                0 => b[i] = rng.next() as u8,
                1 => b[i] = [0, 1, 0x7f, 0x80, 0xff][rng.below(5)],
                2 => {
                    // Overwrite a whole big-endian word with a boundary value.
                    let v = [0u32, 1, 7, 8, 15, 16, 0x7fff_ffff, 0x8000_0000, 0xffff_ffff, b.len() as u32][rng.below(10)];
                    if b.len() >= 4 {
                        let i = i.min(b.len() - 4);
                        b[i..i + 4].copy_from_slice(&v.to_be_bytes());
                    }
                }
                3 => b.truncate(i.max(1)),
                _ => b.extend(std::iter::repeat_n(rng.next() as u8, rng.below(64))),
            }
        }
        // Lie about the size too: metadata can be stale relative to content.
        let claimed = match round % 4 {
            0 => b.len() as u64,
            1 => b.len() as u64 + rng.below(1 << 20) as u64,
            2 => rng.below(b.len() + 1) as u64,
            _ => u64::MAX,
        };
        if let Some(v) = video::probe(&mut Cursor::new(&b), claimed) {
            assert!(v.duration_seconds.is_finite() && v.duration_seconds > 0.0 && v.duration_seconds <= 86400.0);
            assert!((16..=32768).contains(&v.width) && (16..=32768).contains(&v.height));
            assert!(v.nominal_frame_rate.is_none_or(|f| f.is_finite() && f > 0.0));
            assert!(v.video_bitrate.is_none_or(|f| f.is_finite() && f > 0.0));
        }
    }
    // 64-bit box sizes, version-1 mdhd and maximal sample tables.
    let mut large = b"\0\0\0\x01moov".to_vec();
    large.extend(u64::MAX.to_be_bytes());
    assert!(video::probe(&mut Cursor::new(&large), u64::MAX).is_none());
    let mut stsz = vec![0; 4];
    stsz.extend(u32::MAX.to_be_bytes());
    stsz.extend(u32::MAX.to_be_bytes());
    assert!(video::probe(&mut Cursor::new(boxed(b"moov", boxed(b"stsz", stsz))), 28).is_none());
}

#[test]
fn hostile_names_never_panic_any_name_consumer() {
    let alphabet: Vec<&str> = vec![
        "0", "1", "2", "9", "_", "-", ".", " ", "F", "R", "S", "L", "N", "E", "P", "I", "T", "A", "B", "C", "mp4", "MP4", "MOV", "jpg", "ts",
        "2030", "0101", "1231", "0229", "000000", "235959", "REC_", "EVT_", "PAK_", "\u{0661}", "\u{0969}", "\u{ff11}", "\u{202e}", "\u{0}", "\n", "/", "\\", ":", "é", "\u{1f600}", "\u{fffd}", "99999999999999999999",
    ];
    let ids: Vec<Option<String>> = std::iter::once(None)
        .chain(recognition::catalog().iter().map(|c| Some(c.id.clone())))
        .chain([Some(crate::manual_camera::ID.to_owned()), Some("no-such-camera".to_owned())])
        .collect();
    let folders = ["", ".", "DCIM/Movie", "DCIM/Parking/RO", "DCIM/200video/front", "Event", "Normal", "cont_rec", "folder-1/\u{202e}"];
    let mut rng = Rng(0x243f6a8885a308d3);
    for round in 0..4000 {
        let mut name = String::new();
        for _ in 0..1 + rng.below(12) {
            name.push_str(alphabet[rng.below(alphabet.len())]);
        }
        if round % 3 == 0 {
            name.push_str([".mp4", "S.mp4", "L.mp4", "F.MP4", "_A.MP4"][rng.below(5)]);
        }
        let id = ids[rng.below(ids.len())].as_deref();
        let folder = folders[rng.below(folders.len())];
        let _ = engine::filename_template(&name);
        let _ = engine::shape(&name);
        let _ = intake::safe_media_name(&name);
        let _ = intake::sample_hints_for_folder(&name, folder, id);
        let _ = mode_evidence::file_mode_evidence(&name, folder, id);
        let _ = observed_channels::profile_name(&name, id.unwrap_or(""));
        let _ = observed_channels::sample_role(&name, id.unwrap_or("blackvue-dr970x-plus"));
        let _ = crate::manual_camera::hints(&name, folder);
        // A whole native inventory of the same hostile name drives temporal inference.
        let mut report = engine::Report { scanned_files: 6, inventory_complete: true, ..Default::default() };
        let video = video::probe(&mut Cursor::new(mp4(b"avc1", 1920, 30, 1000)), mp4(b"avc1", 1920, 30, 1000).len() as u64);
        for k in 0..6 {
            let variant = name.replacen('0', &k.to_string(), 1);
            report.temporal.record(&variant, folder, video.as_ref());
            report.metadata_coverage.recognized_files += 1;
        }
        report.recognized_camera_id = id.map(str::to_owned);
        let _ = mode_evidence::parking_evidence(&report, id);
        let _ = observed_channels::observed_channels(&report, id);
    }
}

#[test]
fn hostile_support_text_never_panics_or_retains_unsafe_values() {
    let pieces: Vec<&str> = vec![
        "model", "version", "fw", "firmware", "serial", "latitude", "wifi_password", "=", ":", "\"", "{", "}", "[", "]", ",", "\n", "\r\n", " ", "\t",
        "\x1b[", "\x1b[31m", "\x1b[0;1m", "m", ";", "Evil X9", "1.2.3", "48.117300", "192.168.1.1", "../../etc/passwd", "<script>", "é", "\u{202e}", "\u{feff}",
        "WEBGetProductInfo[1]:pJsonData=", "msgHdr", "soft_version", "pJsonData", "\\", "\\u0000", "null", "true", "1e999", "-0", "DDPAI Z100 Master",
    ];
    let mut rng = Rng(0x13198a2e03707344);
    for _ in 0..30_000 {
        let mut text = String::new();
        for _ in 0..1 + rng.below(24) {
            text.push_str(pieces[rng.below(pieces.len())]);
        }
        for line in text.lines() {
            if let Some(json) = crate::ddpai_log::payload(line) {
                assert!(line.contains(json));
            }
        }
        let card = crate::discovery::fuzz_parse(&text);
        for o in &card.observations {
            assert!(crate::discovery::valid_value(&o.field, &o.key, &o.value), "{o:?}");
            assert!(o.value.is_ascii() && !o.value.contains(['<', '/', '\\', '\x1b']), "{o:?}");
        }
        assert!(card.observations.len() <= 128);
    }
}

#[test]
fn invisible_and_format_characters_are_rejected_in_private_basenames() {
    // Same cases as tests/private-identities.test.js so the native and intake validators agree.
    for name in [
        "a\u{200b}b.MP4", "\u{feff}a.MP4", "a\u{2028}b.MP4", "a\u{061c}b.MP4",
        "a\u{200f}b.MP4", "a\u{2060}b.MP4", "a\u{00ad}b.MP4", "a\u{180e}b.MP4",
    ] {
        assert!(!intake::safe_media_name(name), "{name:?}");
    }
    for name in ["new vendor+token2030.MP4", "S_20300115_A.MP4", "照片2030.jpg"] {
        assert!(intake::safe_media_name(name), "{name:?}");
    }
}
