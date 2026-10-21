# Temporal inference review fixes

Native whole-inventory evidence remains ephemeral and capped at 16,384 entries.
No new I/O, decoding, persisted timestamps, or per-clip serialization is added.
Incomplete/capped inventories still fail closed before inference.

- Cadence and bitrate transition windows must stay in the same recording context.
  An explicitly explained driving/parking boundary is not missing-media evidence.
  Parking episode start lists, not unrelated driving histories, must align across
  observed source roles. Missing parking coverage, unknown context, unexplained
  parking boundaries, conflicting behavior or capture cadence still veto a global
  suggestion. Each episode must independently meet the adjacent-pair threshold.
- BlackVue representations are selected **before adjacency**, per source role:
  original, otherwise documented S substream, otherwise L live-event encoding.
  Only finite manufacturer filename forms already accepted by `profile_name`
  establish these representations. Originals and alternate encoding measurements
  are never mixed. Every alternate start/context must exist in the selected
  representation; otherwise aggregation fails closed. Same-time originals or
  duplicate files are not arbitrarily deduplicated. Output cohorts describe only
  the selected primary representation.
- `DrivingBaseline` callers must now provide canonical `channel` and explicit
  `representation` (`original`, `substream`, `live_event`), in addition to matching
  model, firmware, codec, dimensions, playback rate and measured sample count.
  A front baseline cannot strengthen rear observations, even at identical encoding.
- Derived relative bitrate must be finite and in the inclusive range
  `1e-9..=1e9`; unusable ratios are omitted without suppressing timing evidence.

## Verification

Temporarily register `pub mod mode_evidence;` using
`docs/observed-mode-module.patch`, run native tests and Clippy, then restore
`src-tauri/src/lib.rs` before committing. Integration remains parent-owned.

Focused review regressions first reproduced mixed-context, original/proxy and
nonfinite-ratio failures against the base implementation. Source-role regression
also failed with the new role/representation predicates disabled, then passed
with them restored. Additional regressions cover unequal driving histories,
missing parking coverage and conflicting parking episodes.

Validation logs stay uncommitted in this worktree: `temporal-red.log`,
`temporal-role-red.log`, `temporal-green.log`, `temporal-clippy.log`.
No anonymous historical records were joined without exact starts, and no real
hardware media, owner identity authority or protection-as-trigger assumptions
were used.
