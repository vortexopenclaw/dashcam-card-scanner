<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Reserved photo slots

Some cameras (observed on DDPAI Z100, about 220 per card) preallocate
photo-extension files (for example `.jpg`) that hold exactly 128 bytes of
`0x0A` followed only by `0x00` bytes. They cannot decode as JPEG or PNG, so
they are not image media. Mirrors the Dashcam Offloader fix (offloader issue #35).

## Rule

A file is a reserved slot only if every check passes (`src-tauri/src/reserved_slot.rs`):

- photo extension (`jpg`, `jpeg`, `png`), regular file, size greater than 128 bytes;
- opened through the walker's capability directory with no symlink following;
- first 128 bytes are `0x0A`, every remaining byte is `0x00`, and EOF is exactly at the recorded size;
- size, modification time and (Unix) device/inode are identical before and after the read and match the walker's entry metadata;
- within the per-file bound (32 MiB) and per-scan budget (512 MiB read, 20,000 files).

Anything failing, unreadable or over budget stays normal image media. Folder
names (such as `tmp`) and fixed sizes are never evidence.

## Effects

- Kept in structural inventory: folder `fileCount`, `extensions`, filename templates.
- Excluded from image media counts, observed-channel media counts and sample selection.
- Intake: the strict schema has no slot type, so slots are counted in the folder's
  `unknown` (`other`) extension group; `fileCount` is unchanged and `mediaCount`
  excludes them. No new intake field.
- Report: per-folder `reservedSlots` (extension → count) and report-level
  `reservedSlotCoverage` (`reservedSlotCount`, `notReserved`, `unverifiedBudget`,
  `unverifiedOversize`, `unverifiedReadFailure`). Counts only; no names, paths or hashes.
