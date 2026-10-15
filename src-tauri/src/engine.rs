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
    io::{Read, Seek, SeekFrom},
    path::{Component, Path},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
pub const MAX_ENTRIES: usize = 10_000_000;
pub const MAX_DIRS: usize = 16_384;
pub const MAX_DEPTH: usize = 32;
pub const MAX_SAMPLES: usize = 64;
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub file_size_bytes: u64,
    pub video: Option<Video>,
    // Local review association only. Never serialized to reports, exports or intake.
    #[serde(skip)]
    pub local_name: String,
    #[serde(skip)]
    pub filename_template: String,
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
    /// Streaming, anonymous configuration evidence, independent of private intake samples.
    #[serde(default)]
    pub metadata_cohorts: Vec<MetadataCohort>,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCohort {
    pub filename_template: String,
    pub extension: String,
    pub file_count: u64,
    /// First, lowest, and highest measured bitrate/duration pairs, never averaged.
    pub paired_measurements: Vec<Video>,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCoverage {
    pub recognized_files: usize,
    pub inspected_files: usize,
    pub measured_files: usize,
    pub unsupported_files: usize,
    pub cohort_count: usize,
    pub complete: bool,
    pub representative_samples_limited: bool,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    // Trusted native recognition context only; never accepted from or sent to JSON.
    #[serde(skip)]
    pub recognized_camera_id: Option<String>,
    pub scanned_files: u64,
    pub entries_seen: usize,
    pub skipped: u64,
    pub probe_attempts: usize,
    pub sampled_files: usize,
    pub probe_failures: usize,
    pub limited: bool,
    pub cancelled: bool,
    pub folders: Vec<Folder>,
    #[serde(default)]
    pub inventory_complete: bool,
    /// Fixed reason codes and counts only: never source names or error strings.
    #[serde(default)]
    pub issues: BTreeMap<String, u64>,
    #[serde(default)]
    pub metadata_coverage: MetadataCoverage,
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
// Preserve probe's public interface while distinguishing source I/O failures from
// unsupported/malformed headers. Neither raw errors nor source names leave the engine.
struct ProbeReader<R> {
    inner: R,
    failed: bool,
}
impl<R: Read> Read for ProbeReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let result = self.inner.read(buf);
        self.failed |= result.is_err() || matches!(result, Ok(0)) && !buf.is_empty();
        result
    }
}
impl<R: Seek> Seek for ProbeReader<R> {
    fn seek(&mut self, from: SeekFrom) -> std::io::Result<u64> {
        let result = self.inner.seek(from);
        self.failed |= result.is_err();
        result
    }
}
fn offline_placeholder(m: &cap_std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        m.file_attributes() & (0x1000 | 0x40000 | 0x400000) != 0
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
        "mp4", "mov", "m4v", "avi", "ts", "mkv", "jpg", "jpeg", "png", "dat", "bin", "txt", "log",
        "nmea", "srt",
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
// Private intake remains bounded independently of whole-card inventory/header coverage.
const MAX_COHORTS: usize = 8192;
#[derive(Clone, Copy)]
struct Limits {
    entries: usize,
    directories: usize,
    depth: usize,
    cohorts: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            entries: MAX_ENTRIES,
            directories: MAX_DIRS,
            depth: MAX_DEPTH,
            cohorts: MAX_COHORTS,
        }
    }
}
fn issue(r: &mut Report, code: &str, inventory: bool) {
    *r.issues.entry(code.into()).or_default() += 1;
    r.limited |= inventory;
}
fn ignored_os_directory(name: &str) -> bool {
    matches!(
        name,
        ".Spotlight-V100"
            | ".Trashes"
            | ".fseventsd"
            | ".TemporaryItems"
            | "System Volume Information"
            | "$RECYCLE.BIN"
    )
}
fn same_configuration(a: &Video, b: &Video) -> bool {
    a.codec == b.codec
        && a.width == b.width
        && a.height == b.height
        && a.nominal_frame_rate == b.nominal_frame_rate
}
// Retain actual paired measurements at each extremum; never synthesize an average clip.
fn add_pair(pairs: &mut Vec<Video>, v: &Video) {
    let mut candidates = pairs.clone();
    candidates.push(v.clone());
    let mut keep = vec![candidates[0].clone()];
    for metric in [0, 1] {
        let value = |v: &Video| {
            if metric == 0 {
                v.video_bitrate
            } else {
                Some(v.duration_seconds)
            }
        };
        for largest in [false, true] {
            let best = candidates
                .iter()
                .filter(|v| value(v).is_some())
                .min_by(|a, b| {
                    let order = value(a).unwrap().total_cmp(&value(b).unwrap());
                    if largest {
                        order.reverse()
                    } else {
                        order
                    }
                });
            if let Some(best) = best {
                if !keep.contains(best) {
                    keep.push(best.clone());
                }
            }
        }
    }
    *pairs = keep;
}
pub fn scan(
    root: &Path,
    cancel: &AtomicBool,
    progress: impl FnMut(Progress),
) -> Result<Report, String> {
    scan_with_limits(root, cancel, progress, Limits::default())
}
fn scan_with_limits(
    root: &Path,
    cancel: &AtomicBool,
    progress: impl FnMut(Progress),
    limits: Limits,
) -> Result<Report, String> {
    let root = safe_root(root)?;
    let dir = open_dir_secure(&root)?;
    let mut walker = Walker {
        report: Report::default(),
        cancel,
        progress,
        limits,
        last: Instant::now() - Duration::from_secs(1),
        directories: 0,
        stopped: false,
        next_alias: 0,
        sample_reclamation_exhausted: false,
    };
    walker.visit(dir, ".".into(), 0);
    let r = &mut walker.report;
    r.inventory_complete = !r.limited && !r.cancelled;
    r.metadata_coverage.complete = r.inventory_complete
        && r.metadata_coverage.inspected_files == r.metadata_coverage.recognized_files
        && r.probe_failures == 0
        && r.metadata_coverage.unsupported_files == 0
        && !r.issues.contains_key("metadata_cohort_limit");
    r.metadata_coverage.representative_samples_limited =
        r.metadata_coverage.recognized_files > r.sampled_files;
    (walker.progress)(Progress {
        phase: if r.cancelled {
            "Cancelled"
        } else if r.limited {
            "Inventory incomplete"
        } else {
            "Scan complete"
        },
        entries: r.entries_seen,
        files: r.scanned_files,
        probed: r.probe_attempts,
    });
    Ok(walker.report)
}
struct Walker<'a, F> {
    report: Report,
    cancel: &'a AtomicBool,
    progress: F,
    limits: Limits,
    last: Instant,
    directories: usize,
    stopped: bool,
    next_alias: usize,
    sample_reclamation_exhausted: bool,
}
impl<F: FnMut(Progress)> Walker<'_, F> {
    fn visit(&mut self, dir: Dir, path: String, depth: usize) {
        if self.cancel.load(Ordering::Relaxed) {
            self.report.cancelled = true;
            return;
        }
        self.directories += 1;
        let mut folder = Folder {
            path: path.clone(),
            depth,
            ..Default::default()
        };
        let entries = match dir.entries() {
            Ok(e) => e,
            Err(_) => {
                issue(&mut self.report, "directory_enumeration_failed", true);
                self.report.skipped += 1;
                return;
            }
        };
        // Recursive depth-first enumeration retains at most MAX_DEPTH + 1 directory
        // handles/iterators, not one open handle for every child of a wide directory.
        for entry in entries {
            if self.cancel.load(Ordering::Relaxed) {
                self.report.cancelled = true;
                break;
            }
            if self.stopped {
                break;
            }
            if self.report.entries_seen >= self.limits.entries {
                issue(&mut self.report, "entry_resource_limit", true);
                self.stopped = true;
                break;
            }
            self.report.entries_seen += 1;
            if self.last.elapsed() > Duration::from_millis(100) {
                (self.progress)(Progress {
                    phase: "Scanning metadata",
                    entries: self.report.entries_seen,
                    files: self.report.scanned_files,
                    probed: self.report.probe_attempts,
                });
                self.last = Instant::now();
            }
            let entry = match entry {
                Ok(v) => v,
                Err(_) => {
                    issue(&mut self.report, "directory_entry_failed", true);
                    self.report.skipped += 1;
                    continue;
                }
            };
            let name = entry.file_name();
            let p = Path::new(&name);
            if p.components().count() != 1
                || !p.components().all(|c| matches!(c, Component::Normal(_)))
            {
                issue(&mut self.report, "unsafe_entry_name", true);
                self.report.skipped += 1;
                continue;
            }
            // Exact OS metadata allowlist is intentional, including unreadable OS junk.
            // No wildcard/dot-folder exclusions: camera directories must not be hidden.
            let meta = match dir.symlink_metadata(p) {
                Ok(m) => m,
                Err(_) => {
                    issue(&mut self.report, "entry_metadata_failed", true);
                    self.report.skipped += 1;
                    continue;
                }
            };
            if meta.file_type().is_symlink() || entry_reparse(&meta) {
                self.report.skipped += 1;
                continue;
            }
            if meta.is_dir() {
                if ignored_os_directory(&name.to_string_lossy()) {
                    self.report.skipped += 1;
                    continue;
                }
                if depth >= self.limits.depth {
                    issue(&mut self.report, "directory_depth_limit", true);
                    self.report.skipped += 1;
                    continue;
                }
                if self.directories >= self.limits.directories {
                    issue(&mut self.report, "directory_resource_limit", true);
                    self.stopped = true;
                    break;
                }
                let label = camera_component(&name.to_string_lossy()).unwrap_or_else(|| {
                    self.next_alias += 1;
                    format!("folder-{}", self.next_alias)
                });
                let label = if path == "." {
                    label
                } else {
                    format!("{path}/{label}")
                };
                match dir.open_dir_nofollow(p) {
                    Ok(child) => self.visit(child, label, depth + 1),
                    Err(_) => {
                        issue(&mut self.report, "directory_open_failed", true);
                        self.report.skipped += 1;
                    }
                }
            } else if meta.is_file() {
                if offline_placeholder(&meta) {
                    issue(&mut self.report, "offline_placeholder_excluded", true);
                    self.report.skipped += 1;
                    continue;
                }
                self.report.scanned_files += 1;
                folder.file_count += 1;
                folder.total_file_size_bytes =
                    folder.total_file_size_bytes.saturating_add(meta.len());
                let ext = extension(p);
                let lower = ext.to_ascii_lowercase();
                *folder.extensions.entry(ext.clone()).or_default() += 1;
                let media = matches!(lower.as_str(), "mp4" | "mov" | "m4v" | "avi" | "ts" | "mkv");
                let template = filename_template(&name.to_string_lossy());
                if media || matches!(lower.as_str(), "jpg" | "jpeg" | "png") {
                    if folder.filename_shapes.len() < 20 {
                        folder
                            .filename_shapes
                            .insert(shape(&name.to_string_lossy()));
                    }
                    if folder.filename_templates.len() < 256 {
                        folder.filename_templates.insert(template.clone());
                    }
                }
                if !media {
                    continue;
                }
                self.report.metadata_coverage.recognized_files += 1;
                // Probe eligibility depends only on the safely opened file, never retention budgets.
                let result = if matches!(lower.as_str(), "mp4" | "mov" | "m4v") {
                    self.report.probe_attempts += 1;
                    let mut options = OpenOptions::new();
                    options.read(true).follow(FollowSymlinks::No);
                    match dir.open_with(p, &options) {
                        Ok(mut f) => match f.metadata() {
                            Ok(m)
                                if m.is_file()
                                    && !entry_reparse(&m)
                                    && !offline_placeholder(&m) =>
                            {
                                self.report.metadata_coverage.inspected_files += 1;
                                let mut reader = ProbeReader {
                                    inner: &mut f,
                                    failed: false,
                                };
                                let result = video::probe(&mut reader, m.len());
                                if reader.failed {
                                    issue(&mut self.report, "video_read_failed", true);
                                    None
                                } else {
                                    result
                                }
                            }
                            _ => {
                                issue(&mut self.report, "video_metadata_failed", true);
                                None
                            }
                        },
                        Err(_) => {
                            issue(&mut self.report, "video_open_failed", true);
                            None
                        }
                    }
                } else {
                    self.report.metadata_coverage.unsupported_files += 1;
                    issue(&mut self.report, "video_container_unsupported", false);
                    None
                };
                if matches!(lower.as_str(), "mp4" | "mov" | "m4v") && result.is_none() {
                    self.report.probe_failures += 1;
                    issue(&mut self.report, "video_header_unmeasured", false);
                }
                let sample = Sample {
                    file_size_bytes: result.as_ref().map_or(meta.len(), |v| v.file_size_bytes),
                    video: result.clone(),
                    local_name: name.to_string_lossy().into_owned(),
                    filename_template: template.clone(),
                };
                self.retain_sample(&mut folder, sample);
                if let Some(v) = result {
                    self.report.metadata_coverage.measured_files += 1;
                    if let Some(cohort) = folder.metadata_cohorts.iter_mut().find(|c| {
                        c.filename_template == template
                            && c.extension == ext
                            && same_configuration(&c.paired_measurements[0], &v)
                    }) {
                        cohort.file_count += 1;
                        add_pair(&mut cohort.paired_measurements, &v);
                    } else if self.report.metadata_coverage.cohort_count < self.limits.cohorts {
                        folder.metadata_cohorts.push(MetadataCohort {
                            filename_template: template,
                            extension: ext,
                            file_count: 1,
                            paired_measurements: vec![v],
                        });
                        self.report.metadata_coverage.cohort_count += 1;
                    } else {
                        issue(&mut self.report, "metadata_cohort_limit", false);
                    }
                }
            } else {
                self.report.skipped += 1;
            }
        }
        // Legacy recognition/export consumers still see every retained encoding and
        // paired extremum, not merely the first clip of a changing rate cohort.
        folder.videos = folder
            .metadata_cohorts
            .iter()
            .flat_map(|c| c.paired_measurements.iter().cloned())
            .collect();
        self.report.folders.push(folder);
    }
    fn retain_sample(&mut self, folder: &mut Folder, sample: Sample) {
        // Stratify on observed template AND encoding, with at most two clips per
        // stratum. Late variants replace redundant rows, not metadata coverage.
        let same = |s: &Sample| {
            s.filename_template == sample.filename_template
                && match (&s.video, &sample.video) {
                    (Some(a), Some(b)) => same_configuration(a, b),
                    (None, None) => true,
                    _ => false,
                }
        };
        let count = folder.samples.iter().filter(|s| same(s)).count();
        if count >= 2 {
            return;
        }
        if self.report.sampled_files < MAX_SAMPLES {
            folder.samples.push(sample);
            self.report.sampled_files += 1;
            return;
        }
        if count == 0 && !self.sample_reclamation_exhausted {
            // Once all retained strata are unique, no later clip can reclaim a
            // duplicate. Avoid rescanning all prior folders for every card file.
            self.sample_reclamation_exhausted = true;
            // Reclaim a redundant stratum in the current or an earlier folder.
            for f in std::iter::once(&mut *folder).chain(self.report.folders.iter_mut()) {
                let redundant = (0..f.samples.len()).find(|&i| {
                    (0..i).any(|j| {
                        f.samples[i].filename_template == f.samples[j].filename_template
                            && match (&f.samples[i].video, &f.samples[j].video) {
                                (Some(a), Some(b)) => same_configuration(a, b),
                                (None, None) => true,
                                _ => false,
                            }
                    })
                });
                if let Some(i) = redundant {
                    f.samples.remove(i);
                    self.report.sampled_files -= 1;
                    self.sample_reclamation_exhausted = false;
                    break;
                }
            }
            if self.report.sampled_files < MAX_SAMPLES {
                folder.samples.push(sample);
                self.report.sampled_files += 1;
            }
        }
    }
}
#[cfg(test)]
#[path = "engine_whole_card_tests.rs"]
mod whole_card_tests;

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
        for _ in 0..MAX_DEPTH + 4 {
            p.push("dcim");
            std::fs::create_dir(&p).unwrap();
        }
        let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
        assert!(r.limited);
        assert_eq!(r.folders.len(), MAX_DEPTH + 1);
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
        assert!(
            !r.limited,
            "intentional link exclusions are not scan failures"
        );
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
    fn mixed_numeric_suffixes_get_bounded_sampling_slots_without_role_inference() {
        let t = tempfile::Builder::new()
            .tempdir_in(std::env::temp_dir().canonicalize().unwrap())
            .unwrap();
        for suffix in ["F", "R", "I", "T", "PF", "PR", "PI", "PT"] {
            for i in 0..8 {
                std::fs::write(t.path().join(format!("{i:06}{suffix}.MP4")), b"not video").unwrap();
            }
        }
        let r = scan(t.path(), &AtomicBool::new(false), |_| {}).unwrap();
        assert_eq!(r.scanned_files, 64);
        assert_eq!(r.sampled_files, 16);
        let templates: BTreeSet<_> = r.folders[0]
            .samples
            .iter()
            .map(|s| s.filename_template.clone())
            .collect();
        assert_eq!(templates.len(), 8);
        assert!(r.folders[0]
            .samples
            .iter()
            .all(|s| !s.local_name.is_empty()));
        let serialized = serde_json::to_string(&r).unwrap();
        assert!(!serialized.contains("localName"));
        assert!(!serialized.contains("000000"));
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
        assert_eq!(r.sampled_files, 40);
        assert_eq!(r.probe_attempts, 0);
        assert!(r.folders.iter().all(|f| f.samples.len() <= 2));
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
