// SPDX-License-Identifier: AGPL-3.0-only
use crate::video::{self, Video};
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Component, Path},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
pub const MAX_ENTRIES: usize = 100_000;
pub const MAX_DIRS: usize = 160;
pub const MAX_DEPTH: usize = 8;
pub const MAX_SAMPLES: usize = 64;
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub file_size_bytes: u64,
    pub video: Option<Video>,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub path: String,
    pub depth: usize,
    pub file_count: u64,
    pub total_file_size_bytes: u64,
    pub extensions: BTreeMap<String, u64>,
    pub filename_shapes: BTreeSet<String>,
    pub filename_templates: BTreeSet<String>,
    pub samples: Vec<Sample>,
    pub videos: Vec<Video>,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub scanned_files: u64,
    pub entries_seen: usize,
    pub skipped: u64,
    pub probe_attempts: usize,
    pub sampled_files: usize,
    pub probe_failures: usize,
    pub limited: bool,
    pub cancelled: bool,
    pub folders: Vec<Folder>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: &'static str,
    pub entries: usize,
    pub files: u64,
    pub probed: usize,
}
pub fn shape(name: &str) -> String {
    // No literal alphanumerics survive, even personal filenames, serials and dates.
    name.chars()
        .take(100)
        .map(|c| {
            if c.is_ascii_digit() {
                'N'
            } else if c.is_uppercase() {
                'A'
            } else if c.is_alphabetic() {
                'a'
            } else if "._- ".contains(c) {
                c
            } else {
                '?'
            }
        })
        .collect()
}
pub fn safe_root(root: &Path) -> Result<std::path::PathBuf, String> {
    if !root.is_absolute()
        || root
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err("Choose an absolute folder without traversal components.".into());
    }
    let mut p = std::path::PathBuf::new();
    for c in root.components() {
        p.push(c);
        if matches!(c, Component::Prefix(_)) {
            continue;
        }
        let m = std::fs::symlink_metadata(&p).map_err(|_| "Source is unavailable.")?;
        if m.file_type().is_symlink() || reparse(&m) {
            return Err("Links and reparse-point sources are not allowed.".into());
        }
    }
    let canonical = root.canonicalize().map_err(|_| "Source is unavailable.")?;
    if !canonical.is_dir() {
        return Err("Choose a folder.".into());
    }
    Ok(canonical)
}
// Walk from a trusted filesystem anchor with no-follow per component, including the selected root.
pub fn open_dir_secure(path: &Path) -> Result<Dir, String> {
    let mut anchor = std::path::PathBuf::new();
    let mut normals = Vec::new();
    for c in path.components() {
        match c {
            Component::Prefix(_) | Component::RootDir => anchor.push(c),
            Component::Normal(n) => normals.push(n),
            _ => return Err("Unsafe directory path".into()),
        }
    }
    if anchor.as_os_str().is_empty() {
        return Err("Absolute directory required".into());
    }
    let mut dir = Dir::open_ambient_dir(anchor, ambient_authority())
        .map_err(|_| "Directory anchor unavailable")?;
    for n in normals {
        let m = dir
            .symlink_metadata(n)
            .map_err(|_| "Directory unavailable")?;
        if m.file_type().is_symlink() || entry_reparse(&m) {
            return Err("Links and reparse points are not allowed".into());
        }
        dir = dir
            .open_dir_nofollow(n)
            .map_err(|_| "Directory unavailable or changed")?;
    }
    Ok(dir)
}
#[cfg(windows)]
fn reparse(m: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    m.file_attributes() & 0x400 != 0
}
#[cfg(not(windows))]
fn reparse(_: &std::fs::Metadata) -> bool {
    false
}
fn entry_reparse(m: &cap_std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        m.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = m;
        false
    }
}
fn camera_component(s: &str) -> Option<String> {
    const SAFE:&str="dcim movie movies ro parking photo photos video videos normal event events emergency record recording front rear interior telephoto left right lock locked snapshot snapshots continuous driving blackvue innovv garmin thinkware viofo";
    SAFE.split(' ')
        .any(|v| v == s.to_ascii_lowercase())
        .then(|| s.to_string())
}
fn extension(p: &Path) -> String {
    let raw = p.extension().and_then(|v| v.to_str()).unwrap_or("");
    if [
        "mp4", "mov", "m4v", "avi", "ts", "mkv", "jpg", "jpeg", "png", "bin", "ini", "txt", "dat",
        "srt", "wav", "log", "nmea",
    ]
    .contains(&raw.to_ascii_lowercase().as_str())
    {
        raw.into()
    } else {
        "other".into()
    }
}
pub fn filename_template(name: &str) -> String {
    use std::sync::LazyLock;
    static RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"^([0-9_]+?)(_?(?:PF|PR|PI|PT|F|R|I|T))?\.([A-Za-z0-9]+)$").unwrap()
    });
    static SHAPES: LazyLock<Vec<regex::Regex>> = LazyLock::new(|| {
        [
            r"^[0-9]{4}_[0-9]{4}_[0-9]{6}_[0-9]+$",
            r"^[0-9]{8}_[0-9]{6}_[0-9]+$",
            r"^[0-9]{8}_[0-9]{6}$",
            r"^[0-9]{4}_[0-9]{4}_[0-9]{6}$",
            r"^[0-9]+$",
        ]
        .iter()
        .map(|r| regex::Regex::new(r).unwrap())
        .collect()
    });
    const STEMS: [&str; 5] = [
        "YYYY_MMDD_HHMMSS_SEQUENCE",
        "YYYYMMDD_HHMMSS_SEQUENCE",
        "YYYYMMDD_HHMMSS",
        "YYYY_MMDD_HHMMSS",
        "SEQUENCE",
    ];
    if name.len() > 256 {
        return "unknown".into();
    }
    let Some(c) = RE.captures(name) else {
        return "unknown".into();
    };
    if ![
        "mp4", "mov", "avi", "ts", "mkv", "jpg", "jpeg", "png", "dat", "bin", "txt", "log", "nmea",
        "srt",
    ]
    .contains(&c[3].to_ascii_lowercase().as_str())
    {
        return "unknown".into();
    }
    SHAPES
        .iter()
        .position(|r| r.is_match(&c[1]))
        .map(|i| {
            format!(
                "{}{}.{}",
                STEMS[i],
                c.get(2).map_or("", |m| m.as_str()),
                &c[3]
            )
        })
        .unwrap_or_else(|| "unknown".into())
}
pub fn scan(
    root: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(Progress),
) -> Result<Report, String> {
    let root = safe_root(root)?;
    let dir = open_dir_secure(&root)?;
    let mut queue = vec![(dir, ".".to_string(), 0usize)];
    let mut r = Report::default();
    let start = Instant::now();
    let mut last = Instant::now() - Duration::from_secs(1);
    let mut aliases: BTreeMap<String, String> = BTreeMap::new();
    while let Some((dir, path, depth)) = queue.pop() {
        if cancel.load(Ordering::Relaxed) {
            r.cancelled = true;
            break;
        }
        let mut folder = Folder {
            path: path.clone(),
            depth,
            ..Default::default()
        };
        let entries = match dir.entries() {
            Ok(e) => e,
            Err(_) => {
                r.skipped += 1;
                r.limited = true;
                continue;
            }
        };
        let mut local_probes = 0;
        for entry in entries {
            if cancel.load(Ordering::Relaxed) {
                r.cancelled = true;
                break;
            }
            if r.entries_seen >= MAX_ENTRIES || start.elapsed() > Duration::from_secs(120) {
                r.limited = true;
                break;
            }
            r.entries_seen += 1;
            if last.elapsed() > Duration::from_millis(100) {
                progress(Progress {
                    phase: "Scanning metadata",
                    entries: r.entries_seen,
                    files: r.scanned_files,
                    probed: r.probe_attempts,
                });
                last = Instant::now();
            }
            let entry = match entry {
                Ok(v) => v,
                Err(_) => {
                    r.skipped += 1;
                    r.limited = true;
                    continue;
                }
            };
            let name = entry.file_name();
            let p = Path::new(&name);
            if p.components().count() != 1
                || !p.components().all(|c| matches!(c, Component::Normal(_)))
            {
                r.skipped += 1;
                continue;
            }
            let meta = match dir.symlink_metadata(p) {
                Ok(v) => v,
                Err(_) => {
                    r.skipped += 1;
                    r.limited = true;
                    continue;
                }
            };
            if meta.file_type().is_symlink() || entry_reparse(&meta) {
                r.skipped += 1;
                continue;
            }
            if meta.is_dir() {
                if depth >= MAX_DEPTH || queue.len() + r.folders.len() + 1 >= MAX_DIRS {
                    r.limited = true;
                    r.skipped += 1;
                    continue;
                }
                let label = camera_component(&name.to_string_lossy()).unwrap_or_else(|| {
                    let next = aliases.len() + 1;
                    aliases
                        .entry(name.to_string_lossy().into_owned())
                        .or_insert_with(|| format!("folder-{next}"))
                        .clone()
                });
                let label = if path == "." {
                    label
                } else {
                    format!("{path}/{label}")
                };
                match dir.open_dir_nofollow(p) {
                    Ok(d) => queue.push((d, label, depth + 1)),
                    Err(_) => r.skipped += 1,
                };
            } else if meta.is_file() {
                // Cloud placeholders/offline/reparse entries must not trigger hydration.
                #[cfg(windows)]
                {
                    use cap_std::fs::MetadataExt;
                    if meta.file_attributes() & (0x1000 | 0x40000 | 0x400000) != 0 {
                        r.skipped += 1;
                        continue;
                    }
                }
                r.scanned_files += 1;
                folder.file_count += 1;
                folder.total_file_size_bytes =
                    folder.total_file_size_bytes.saturating_add(meta.len());
                let ext = extension(p);
                let ext_lower = ext.to_ascii_lowercase();
                *folder.extensions.entry(ext.clone()).or_default() += 1;
                if matches!(
                    ext_lower.as_str(),
                    "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv" | "jpg" | "jpeg" | "png"
                ) && folder.filename_shapes.len() < 20
                {
                    folder
                        .filename_shapes
                        .insert(shape(&name.to_string_lossy()));
                }
                if folder.filename_templates.len() < 16
                    && matches!(
                        ext_lower.as_str(),
                        "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv" | "jpg" | "jpeg" | "png"
                    )
                {
                    folder
                        .filename_templates
                        .insert(filename_template(&name.to_string_lossy()));
                }
                if matches!(
                    ext_lower.as_str(),
                    "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv"
                ) && r.sampled_files < MAX_SAMPLES
                    && local_probes < 4
                {
                    local_probes += 1;
                    r.sampled_files += 1;
                    if !matches!(ext_lower.as_str(), "mp4" | "mov" | "m4v") {
                        folder.samples.push(Sample {
                            file_size_bytes: meta.len(),
                            video: None,
                        });
                        continue;
                    }
                    r.probe_attempts += 1;
                    let mut options = OpenOptions::new();
                    options.read(true).follow(FollowSymlinks::No);
                    let result = dir.open_with(p, &options).ok().and_then(|mut f| {
                        let m = f.metadata().ok()?;
                        if !m.is_file() || entry_reparse(&m) {
                            return None;
                        }
                        video::probe(&mut f, m.len())
                    });
                    folder.samples.push(Sample {
                        file_size_bytes: result.as_ref().map_or(meta.len(), |v| v.file_size_bytes),
                        video: result.clone(),
                    });
                    if let Some(v) = result {
                        folder.videos.push(v)
                    } else {
                        r.probe_failures += 1
                    }
                }
            } else {
                r.skipped += 1;
            }
        }
        r.folders.push(folder);
        if r.cancelled
            || (r.limited
                && (r.entries_seen >= MAX_ENTRIES || start.elapsed() > Duration::from_secs(120)))
        {
            break;
        }
    }
    progress(Progress {
        phase: if r.cancelled {
            "Cancelled"
        } else if r.limited {
            "Bounded scan complete (partial)"
        } else {
            "Scan complete"
        },
        entries: r.entries_seen,
        files: r.scanned_files,
        probed: r.probe_attempts,
    });
    Ok(r)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn privacy_and_read_only() {
        let t = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        std::fs::create_dir(t.path().join("Ariel-private-20261015")).unwrap();
        let f = t
            .path()
            .join("Ariel-private-20261015/20261015_Ariel-secret.MP4");
        std::fs::write(&f, b"not a video").unwrap();
        let before = std::fs::read(&f).unwrap();
        let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
        let s = serde_json::to_string(&r).unwrap();
        assert!(!s.contains("Ariel"));
        assert!(!s.contains("20261015"));
        assert!(!s.contains(&t.path().display().to_string()));
        assert_eq!(r.scanned_files, 1);
        assert_eq!(r.probe_failures, 1);
        assert_eq!(before, std::fs::read(f).unwrap());
    }
    #[test]
    fn cancellation_and_depth_limit() {
        let t = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        let r = scan(t.path(), &AtomicBool::new(true), |_| {}).unwrap();
        assert!(r.cancelled);
        let mut p = t.path().to_path_buf();
        for _ in 0..12 {
            p.push("dcim");
            std::fs::create_dir(&p).unwrap();
        }
        let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
        assert!(r.limited);
        assert_eq!(r.folders.len(), 9);
    }
    #[cfg(unix)]
    #[test]
    fn skips_links_and_rejects_link_root() {
        use std::os::unix::fs::symlink;
        let t = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        let out = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        std::fs::write(out.path().join("secret.mp4"), b"private").unwrap();
        symlink(out.path(), t.path().join("link")).unwrap();
        symlink(out.path().join("secret.mp4"), t.path().join("linked.mp4")).unwrap();
        let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(r.scanned_files, 0);
        assert_eq!(r.skipped, 2);
        assert!(scan(&t.path().join("link"), &AtomicBool::new(false), |_| {}).is_err());
    }
    #[test]
    fn callback_cancellation() {
        let t = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        for i in 0..100 {
            std::fs::write(t.path().join(format!("{i}.txt")), b"x").unwrap();
        }
        let cancel = AtomicBool::new(false);
        let r = scan(t.path(), &cancel, |_| cancel.store(true, Ordering::Relaxed)).unwrap();
        assert!(r.cancelled);
        assert!(r.scanned_files < 100);
    }

    #[test]
    fn finite_templates_preserve_suffix_but_not_dates_or_unknown_names() {
        assert_eq!(
            filename_template("2026_1015_131010_000001PT.MP4"),
            "YYYY_MMDD_HHMMSS_SEQUENCEPT.MP4"
        );
        assert_eq!(
            filename_template("20261015_131010_F.mov"),
            "YYYYMMDD_HHMMSS_F.mov"
        );
        assert_eq!(filename_template("000001T.MP4"), "SEQUENCET.MP4");
        assert_eq!(filename_template("Ariel-secret20261015.MP4"), "unknown");
        assert_eq!(filename_template("20261015_131010_F.private"), "unknown");
    }
    #[test]
    fn sampling_budget_applies_to_unsupported_formats() {
        let t = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        for i in 0..20 {
            let d = t.path().join(format!("private-{i}"));
            std::fs::create_dir(&d).unwrap();
            for j in 0..5 {
                std::fs::write(d.join(format!("{j}.TS")), b"synthetic").unwrap();
            }
        }
        let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(r.scanned_files, 100);
        assert_eq!(r.sampled_files, 64);
        assert_eq!(r.probe_attempts, 0);
        assert!(r.folders.iter().all(|f| f.samples.len() <= 4));
        assert!(!r.limited);
    }
    #[cfg(windows)]
    #[test]
    fn skips_windows_junctions() {
        let t = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        let out = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        std::fs::write(out.path().join("secret.mp4"), b"private").unwrap();
        let link = t.path().join("junction");
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(out.path())
            .status()
            .unwrap();
        assert!(status.success());
        let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(r.scanned_files, 0);
        assert_eq!(r.skipped, 1);
        assert!(safe_root(&link).is_err());
        std::fs::remove_dir(link).unwrap();
    }
}
