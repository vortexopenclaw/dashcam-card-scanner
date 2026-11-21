// SPDX-License-Identifier: AGPL-3.0-only
//! Validated empty reserved photo slots.
//!
//! Some cameras (observed on DDPAI Z100) preallocate photo-extension files that
//! contain exactly 128 bytes of 0x0A followed only by 0x00 bytes. Such a file
//! cannot decode as JPEG or PNG, so it is not image media. It stays in the
//! structural inventory (file and extension counts) and is excluded only from
//! image media counts and sample selection.
//!
//! Folder names and fixed sizes are never evidence. A file is a reserved slot
//! only after a bounded, no-follow, regular-file, full-content check with
//! stable size and modification time and EOF exactly at the recorded size.
//! Anything failing or unverified stays normal image media.
//! Mirrors the Dashcam Offloader fix (offloader issue #35).
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_std::fs::{Dir, Metadata, OpenOptions};
use serde::{Deserialize, Serialize};
use std::{io::Read, path::Path};

pub const HEADER_LEN: u64 = 128;
pub const HEADER_BYTE: u8 = 0x0A;

#[derive(Clone, Copy, Debug)]
pub(crate) struct Budget {
    /// Largest file eligible for verification. Larger files stay media.
    pub max_file_bytes: u64,
    /// Total bytes read across one scan.
    pub max_total_bytes: u64,
    /// Files checked across one scan.
    pub max_files: u64,
}
impl Default for Budget {
    fn default() -> Self {
        Self {
            max_file_bytes: 32 * 1024 * 1024,
            max_total_bytes: 512 * 1024 * 1024,
            max_files: 20_000,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Check {
    Reserved,
    NotReserved,
    UnverifiedBudget,
    UnverifiedOversize,
    UnverifiedReadFailure,
}

/// Aggregate counts only: no names, paths or hashes.
#[derive(Clone, Default, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub reserved_slot_count: u64,
    pub not_reserved: u64,
    pub unverified_budget: u64,
    pub unverified_oversize: u64,
    pub unverified_read_failure: u64,
}
impl Coverage {
    pub fn unverified(&self) -> u64 {
        self.unverified_budget + self.unverified_oversize + self.unverified_read_failure
    }
    pub(crate) fn record(&mut self, c: Check) {
        match c {
            Check::Reserved => self.reserved_slot_count += 1,
            Check::NotReserved => self.not_reserved += 1,
            Check::UnverifiedBudget => self.unverified_budget += 1,
            Check::UnverifiedOversize => self.unverified_oversize += 1,
            Check::UnverifiedReadFailure => self.unverified_read_failure += 1,
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct Meter {
    pub budget: Budget,
    pub bytes_read: u64,
    pub files_checked: u64,
}

pub(crate) fn is_photo_ext(lower: &str) -> bool {
    matches!(lower, "jpg" | "jpeg" | "png")
}

#[derive(PartialEq, Eq)]
struct Snapshot {
    len: u64,
    modified: Option<std::time::SystemTime>,
    #[cfg(unix)]
    id: (u64, u64),
}
fn snapshot(m: &Metadata) -> Snapshot {
    Snapshot {
        len: m.len(),
        modified: m.modified().ok().map(|t| t.into_std()),
        #[cfg(unix)]
        id: {
            use cap_std::fs::MetadataExt;
            (m.dev(), m.ino())
        },
    }
}

/// `recorded` is the no-follow entry metadata observed by the walker.
pub(crate) fn check(dir: &Dir, name: &Path, recorded: &Metadata, meter: &mut Meter) -> Check {
    let size = recorded.len();
    if !recorded.is_file() || size <= HEADER_LEN {
        // Header-only or shorter files are not the signature; no read needed.
        return Check::NotReserved;
    }
    if meter.files_checked >= meter.budget.max_files
        || meter.bytes_read.saturating_add(HEADER_LEN) > meter.budget.max_total_bytes
    {
        return Check::UnverifiedBudget;
    }
    meter.files_checked += 1;
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No).nonblock(true);
    let Ok(mut f) = dir.open_with(name, &options) else {
        return Check::UnverifiedReadFailure;
    };
    let Ok(before) = f.metadata() else {
        return Check::UnverifiedReadFailure;
    };
    if !before.is_file() || before.len() != size || before.file_type().is_symlink() {
        return Check::UnverifiedReadFailure;
    }
    let mut header = [0u8; HEADER_LEN as usize];
    if f.read_exact(&mut header).is_err() {
        return Check::UnverifiedReadFailure;
    }
    meter.bytes_read += HEADER_LEN;
    if header.iter().any(|&b| b != HEADER_BYTE) {
        return Check::NotReserved;
    }
    if size > meter.budget.max_file_bytes {
        return Check::UnverifiedOversize;
    }
    let tail = size - HEADER_LEN;
    if meter.bytes_read.saturating_add(tail) > meter.budget.max_total_bytes {
        return Check::UnverifiedBudget;
    }
    let mut buf = [0u8; 64 * 1024];
    let mut remaining = tail;
    while remaining > 0 {
        let want = remaining.min(buf.len() as u64) as usize;
        match f.read(&mut buf[..want]) {
            Ok(0) | Err(_) => return Check::UnverifiedReadFailure,
            Ok(n) => {
                meter.bytes_read += n as u64;
                remaining -= n as u64;
                if buf[..n].iter().any(|&b| b != 0) {
                    return Check::NotReserved;
                }
            }
        }
    }
    // EOF must be exactly at the recorded size.
    match f.read(&mut buf[..1]) {
        Ok(0) => {}
        _ => return Check::UnverifiedReadFailure,
    }
    let Ok(after) = f.metadata() else {
        return Check::UnverifiedReadFailure;
    };
    let Ok(entry_after) = dir.symlink_metadata(name) else {
        return Check::UnverifiedReadFailure;
    };
    if snapshot(&before) != snapshot(&after)
        || snapshot(recorded) != snapshot(&entry_after)
        || snapshot(&before) != snapshot(recorded)
    {
        return Check::UnverifiedReadFailure;
    }
    Check::Reserved
}

#[cfg(test)]
#[path = "reserved_slot_tests.rs"]
mod tests;
