# Private DDPAI structured-log observations

This local implementation keeps video-stamp OCR disabled (`scanner_no_native_ocr`,
`metadata_only_security_hold`). No decoder, network lookup or external processing
is introduced. Native card scans are read-only.

## Extraction and identity

Only direct `DCIM/207log/ui/ui_<14 digits>_<3 digits>.log` files are eligible.
The selected source and directory chain use capability-based no-follow opens;
files must be regular, not links/reparse points, and are opened nonblocking.
Limits: 512 directory entries, 32 files, 512 KiB/file, 4 MiB total, 16 KiB/line,
32 retained component observations. Cancellation is checked throughout. The
reader takes a bounded extra byte to detect truncation. Unread/invalid evidence
sets `limited`; only actually parsed excess observations increment omissions.

The parser requires a root JSON object containing object-valued `msgHdr`, string
`model` and `soft_version`. A text prefix is allowed, not arbitrary JSON suffixes.
Duplicate keys anywhere in the object are rejected. Only allowlisted model,
firmware and protocol component fields survive. Unknown nested fields, raw
lines, Wi-Fi values, serials, Bluetooth fields, GPS, absolute paths and log-body
hashes never enter the report.

Firmware is a version-shaped historical observation, not a current live-camera
assertion. A blank component model with `v9.0.0.0` stays model-unbound. Protocol
`inside_model` is not the same evidence as a main-card `inside` video folder.
Neither component versions nor accessory models identify the logging device.

`src/ddpai-identities.json` preserves 133 **scoped identity rows**, not 133 proven
hardware models. It is derived from the supplied official-public inventory:

```sh
python3 scripts/generate-ddpai-identities.py /path/to/model-inventory.json
```

Only exact case-insensitive retail labels and documented manual/product aliases
are matched. Optional `DDPAI ` and the observed `DZ2602_GLOBAL_` wrapper are
handled; no other SKU or SSID templates are imported. Region/revision collisions
stay multiple candidates. Bare `MINI3X`, `N3 Pro` and ambiguous revision aliases
do not establish V3, V2 or 2026 hardware. Series-level and mismatched manual
records are not recognition authorities. The UI deduplicates identical display
labels without deleting the independent regional recognition candidates. No
channel maximum is imported from this identity inventory.

Automatic identity requires all retained logging-device observations to agree,
one candidate, and complete log inspection. Unknown, malformed, incomplete,
conflicting or mixed identities veto automatic selection. Exact identities
without a native recording profile remain editable identity suggestions only.
Only confirmed Z100 Master logging-device identity plus actual main-card front
video metadata enables the existing `inside` → telephoto adapter. Rear/inside
protocol metadata never activates it by itself. Owner-confirmed manual context
remains separate; observed card roles are not a configured 4CH system count.

## Private envelope and publication boundary

Native `Report.componentMetadata` and `componentMetadataCoverage` flow to the
prepared private envelope as `scan.componentMetadata` and
`scan.componentMetadataCoverage`. The older legacy local fallback also preserves
those fields. Old envelopes omit `scan` and remain valid. Entry camelCase fields
match the shared DDPAI log contract: manufacturer, component, reportedModel,
model, firmwareVersion, sourceKind, sourceFile, sourceLine, identityEstablished.

The real intake validator accepts only this strict optional scan shape. Its
immutable stored report and exact raw prepared bytes preserve the same source
association. Private reviewer views retain the observations. Anonymous proposals
recursively strip metadata and coverage (including detached typed entries);
Scanner public exports are an explicit aggregate allowlist with neither field.

The frontend shows historical observations separately and discloses their
private submission near Submit. Log firmware is never copied into the owner's
current-firmware input. Manual identity/settings edits and configured channel
counts survive same-source rescans; a replacement source clears observations.

The 16 KiB direct-body limit is unchanged. Fitting removes optional temporal
rows, then a suffix of numeric evidence, updating exact retained/omitted identity
and measurement counts and retained group membership. If even metadata plus
complete structure exceeds the budget, metadata entries can be omitted with
explicit coverage counts. Complete structural totals are never truncated. Groups
with no remaining evidence or folder association fail closed to local export.

## Verification boundaries

- `tests/ddpai-log-ui.test.ts`: lightweight bridge-only UI/catalog tests.
- `intake/test/ddpai-log.test.js`: actual receiving validator, immutable mock
  storage/readback, anonymity, schema and privacy negatives; no Cargo hook.
- `src-tauri/src/ddpai_log_tests.rs`: synthetic real-shaped native scans,
  duplicate/mixed/unknown/sibling/component cases, symlink and budget negatives.
- `tests/ddpai-log-native.test.js`: generated metadata-only BMFF + sanitized
  actual-shaped log through native scan/preparation and real receiving storage.
  It invokes Cargo and must run under the heavy-job gate.

**The intake Node glob is not lightweight:** `intake/test/temporal.test.js` also
invokes Cargo. Run broad suites only under the shared heavy-job gate; explicitly
name vetted lightweight files otherwise. No physical-card or real owner-media
acceptance is implied by these synthetic tests.
