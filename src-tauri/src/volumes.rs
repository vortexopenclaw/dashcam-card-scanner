// SPDX-License-Identifier: AGPL-3.0-only
//! Native mounted-volume discovery. No media files opened, no recursion, no shell.
use crate::engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
#[derive(Clone, Serialize)]
pub struct Card {
    pub id: String,
    pub label: String,
    pub path: String,
}
fn camera_root(path: &Path) -> bool {
    let Ok(dir) = engine::open_dir_secure(path) else {
        return false;
    };
    let Ok(entries) = dir.entries() else {
        return false;
    };
    entries.take(128).filter_map(Result::ok).any(|e| {
        let name = e.file_name().to_string_lossy().to_ascii_lowercase();
        // Only familiar top-level camera directories; never enumerate media here.
        [
            "dcim",
            "normal",
            "event",
            "parking",
            "record",
            "recording",
            "blackvue",
            "video",
            "videos",
            "movie",
            "teslacam",
        ]
        .contains(&name.as_str())
            && e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink())
            && dir.open_dir_nofollow(e.file_name()).is_ok()
    })
}
use cap_fs_ext::DirExt;
fn eligible(removable: bool, filesystem: &str, path: &Path) -> bool {
    // Fail closed: excludes system/APFS/NTFS backup disks and all network FS.
    removable
        && ["fat", "fat32", "vfat", "msdos", "exfat", "msdosfs"]
            .contains(&filesystem.to_ascii_lowercase().as_str())
        && path.parent().is_some()
}
pub fn discover() -> Vec<Card> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mut cards = Vec::new();
    for disk in disks.list().iter().take(64) {
        let path = disk.mount_point();
        if !eligible(
            disk.is_removable(),
            &disk.file_system().to_string_lossy(),
            path,
        ) {
            continue;
        }
        let Ok(path) = engine::safe_root(path) else {
            continue;
        };
        if !camera_root(&path) {
            continue;
        }
        let label = disk
            .name()
            .to_string_lossy()
            .chars()
            .filter(|c| !c.is_control())
            .take(100)
            .collect::<String>();
        // Include native device identity/name + capacity + mountpoint; selection
        // always enumerates again, never trusts a renderer-supplied path.
        let Ok(handle) = same_file::Handle::from_path(&path) else {
            continue;
        };
        use std::hash::{Hash, Hasher};
        let mut fingerprint = std::collections::hash_map::DefaultHasher::new();
        handle.hash(&mut fingerprint);
        let identity = format!(
            "{:?}|{:?}|{}|{}",
            disk.name(),
            path,
            disk.total_space(),
            fingerprint.finish()
        );
        cards.push(Card {
            id: format!("{:x}", Sha256::digest(identity.as_bytes())),
            label: if label.is_empty() {
                "Camera card".into()
            } else {
                label
            },
            path: path.display().to_string(),
        });
    }
    cards.sort_by(|a, b| a.id.cmp(&b.id));
    cards.dedup_by(|a, b| a.id == b.id);
    cards
}
pub fn select(id: &str) -> Result<PathBuf, String> {
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid card identity".into());
    }
    let card = discover()
        .into_iter()
        .find(|c| c.id == id)
        .ok_or("Card removed or no longer eligible. Refresh and select again.")?;
    engine::safe_root(Path::new(&card.path))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excludes_internal_network_backup() {
        assert!(!eligible(false, "exfat", Path::new("/Volumes/Card")));
        for fs in ["apfs", "ntfs", "nfs", "smbfs", "ext4"] {
            assert!(!eligible(true, fs, Path::new("/Volumes/Card")));
        }
        assert!(eligible(true, "ExFAT", Path::new("/Volumes/Card")));
        assert!(select("/Volumes/Untrusted").is_err());
    }
    #[test]
    fn shallow_read_only_discovery() {
        let d = tempfile::tempdir().unwrap();
        assert!(!camera_root(d.path()));
        std::fs::create_dir(d.path().join("DCIM")).unwrap();
        assert!(camera_root(d.path()));
        #[cfg(unix)]
        {
            std::fs::remove_dir(d.path().join("DCIM")).unwrap();
            std::os::unix::fs::symlink("/", d.path().join("DCIM")).unwrap();
            assert!(!camera_root(d.path()));
        }
    }
    #[test]
    fn live_bounded_discovery() {
        let cards = discover();
        println!("Live removable camera-like cards: {}", cards.len());
        assert!(cards.len() <= 64);
    }
}
