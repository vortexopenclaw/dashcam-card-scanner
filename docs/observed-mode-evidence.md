# Observed channel and parking evidence implementation

## Integration (parent-owned lib.rs / UI)

Apply `observed-mode-module.patch` before compiling: `engine::Report` now has a serde-skipped native `TemporalInventory`. Existing `cameraRecognition.channelCount/channelSetup` wiring remains unchanged; do not replace it with a new unconsumed observed field.

After native recognition sets `report.recognized_camera_id`, compute:

```rust
let parking_evidence = mode_evidence::parking_evidence(&report, report.recognized_camera_id.as_deref());
```

Attach that **only to local scan IPC**, not to Report/public export/intake. `samples` uses `(folderIndex, sampleIndex)` in `report.folders[].samples[]`; the selected outgoing/IPC sample list has a different order. For each displayed `intake::selected_samples` row, call `file_mode_evidence(actual_local_name, actual_folder.path, native_id)` directly; do not join by unrelated array position.

`parkingEvidence.temporal.suggestion` is the useful probabilistic family: `continuous_like`, `low_bitrate_continuous_like`, `time_lapse_like`, `event_like`. Consume its confidence, reason, optional estimatedCaptureFps and cohorts. `parkingEvidence.suggestion` is only the separately scoped broad `parking` marker, not a selected menu subtype. Never map broad `parking` to Auto Event Detection. No generalized exact power/trigger setting is inferred. Protect explicit owner edits, including Unknown; estimates must not become owner-confirmed facts. An owner model selection is not native recognition authority.

For explicit applicable measured driving references, call `infer_temporal_parking(report, native_id, Some(firmware), baselines)` and replace the default `temporal` field. The default call has no firmware baseline and therefore cannot claim likely low-bitrate continuous from bitrate alone. `DrivingBaseline` requires exact native model, firmware, codec, dimensions and playback fps plus at least five measured clips. Do not substitute a generic maximum-bitrate preset or differently firmware-qualified cohort.

## Sources / finite conventions

Reviewed public sources, not private cards/configuration/state:

- [BlackVue manufacturer support: Video File Naming](https://support.blackvue.com.au/hc/en-us/articles/13301776266895-Video-File-Naming): YYYYMMDD_HHMMSS_[type][direction][other].mp4; F/R source directions; S substream / L live-event alternate representation; P motion **or** time-lapse; I parking impact. [Manufacturer firmware announcement](https://media.blackvue.com/major-update-improved-blackvue-app-ui-dark-mode-live-event-upload-and-more/) independently documents I and optional S/L. The observation-only addition handles **only existing catalog-supported N/E/M/P/I and F/R**, stripping exactly one documented S/L. No new model authority or recognition patterns were added. Optional O/rear-port IR layouts are deliberately not generalized to fixed physical directions.
- [Thinkware RADAR parking support](https://support.thinkware.com/hc/en-us/articles/21305282643859-RADAR-Parking-Mode) and [ARC official guide](https://eu.thinkwarestore.com/wp-content/uploads/2025/01/arc_manual_english_20240423.pdf): motion_timelapse_rec stores parking recording and parking_rec stores parking incidents; RADAR also uses these folders, so a folder is not proof of motion versus time-lapse versus radar. Existing catalog filenames must corroborate the validated native model before folder inference. REC F/R roles already worked; whole-native-name retention now prevents the two-per-stratum/64-total representative cap from hiding later R files.
- Public [dashcam-camera-profiles](https://github.com/vortexopenclaw/dashcam-camera-profiles/tree/bf9f6bb72f1a2e57e12f5b48162e4ba9ece00c07), reviewed local tracked profiles: Viofo A329T / A119 Mini 2, Vantrue E1 Pro, BlackVue Elite 9, Thinkware ARC700, Rove R2-4K Pro. A119 Mini2 profile cites [official manual](https://viofotech.com/download/manual/MINI2/A119MINI2EnglishManual.pdf), grounding top-level DCIM/Parking and independent RO protection. A329T public reviewed examples ground PF/PR/PT parking roles, not a universal parking subtype. Existing source-catalog rules remain the filename gate. Vantrue P supplies broad parking while E does not distinguish manual/G-sensor and T alone does not prove parking.
- Public Dashcam Offloader `Sources/DashcamOffloaderApp/CardScannerParkingInference.swift` was audited as a prior implementation, not copied as authority. Its sparse-timing/RO-based default subtype paths are intentionally not carried over. Reviewed Elite9 public profile explicitly says motion/time-lapse bitrate and playback-fps overlap.

Online evidence was obtained through web search (Exa fallback after Brave HTTP402) and lightweight web extraction. No browser, Firecrawl, credentials, physical cards, or source configuration files were accessed.

## Temporal estimator (heuristic, not hardware-proof)

The existing traversal records each video name, sanitized folder association and already-probed paired `Video` metadata into a private bounded vector. There is no additional source walk, open/read, decoder or external subprocess. Every video, including unmeasured/unsupported ones, counts toward coverage. Both serialization and deserialization skip this native inventory. It is bounded to16,384 entries and256-byte name/folder strings; exhaustion disables temporal authority without stopping inventory or header probing. Current implementation fails closed past this cap rather than pretending a sparse subset adjacent. Literal timestamps/names are not emitted by inference; only relative interval/duration/cadence aggregates are emitted locally.

Adjacency never comes from representative samples. Per-channel names are catalog-correlated, finite timestamp forms are validated as calendar dates and sorted **before** settings/context partitioning. Unknown identity, foreign/unknown filenames, unmeasured metadata, incomplete/cancelled inventory, cap loss, or imported JSON cannot yield temporal authority. The estimator conservatively aborts temporal inference for unpositionable/unmeasured files instead of skipping them and manufacturing adjacent pairs. It preserves file-level deterministic evidence independently.

At least four adjacent pairs per run are required. Each pair uses the preceding clip's measured playback duration; the final clip's duration/rate is excluded. Codec/resolution/fps, duration changes, contiguous cadence changes, sustained rate transitions, duplicate timestamps and sequence discontinuities split runs. Sequence+1 is a **conservative guard**, not a universal assertion about numbering across manufacturers; other increment schemes currently under-suggest rather than assign roles from numbers. Physical files already deleted/overwritten before a scan cannot always be detected, especially for names without sequence numbers.

- **Continuous-like:** all start intervals match their own preceding durations within max(1.1seconds, two playback-frame periods). This tolerates filename rounding/frame boundaries; it does **not** prove zero-gap audiovisual coverage.
- **Time-lapse-like:** start/playback ratios at least2, stable within5% (with rounding tolerance). Estimated capture fps = measured playback fps / measured wall-time compression ratio.1/3/5fps fixtures use actual paired durations/start intervals, not assumed30fps configuration. Nonstandard/VFR-like average playback rates do not produce cadence; average-fps metadata alone cannot exclude every VFR stream. Low nonaccelerated playback fps remains continuous-like wall-time behavior unless a separate documented model/firmware rule establishes a time-lapse menu option. No such rule was invented here.
- **Likely low-bitrate continuous:** continuous timing plus stable rates no more than half an explicitly matched baseline; no universal Mbps cutoff. Static-scene VBR remains an alternative, disclosed in the reason and a `likely`, never verified, confidence ceiling.
- **Event-like:** irregular nonoverlapping parking bursts, with known parking context and no known sequence loss. Exact buffered/auto-event/low-power-impact strategies remain unknown. Multi-channel starts must agree for whole-card suggestion; a sparse/gapped inventory alone is not impact evidence. A single isolated outlier among a stable run does not become event mode.
- **Mixed:** contiguous compression/rate or encoding changes are separated and no whole-card suggestion is emitted for changing runs, missing channels, unsupported rows or inconsistent channel cadence. Conservative partitioning can suppress a global suggestion on an ordinary card containing driving/parking transitions; review per-cohort evidence instead. Sustained VBR scene changes can also create a separate rate cohort; this is not asserted to be a menu setting change.

Camera timestamps are local wall time, not UTC. Midnight rollover is handled. Duplicate/reversed sequence order, extreme intervals and isolated one-hour/DST-like discontinuities block confident global inference. A timezone/DST offset cannot be authenticated from filename dates alone; clock accuracy and true completeness remain assumptions and owner confirmation is always required.

## Audit findings / explicitly left unresolved

Bundled and upstream E1 Pro and Rove R2-4K Pro filename expressions are double-escaped. This lane does not silently normalize those source tokens or modify recognition/catalog generation. Their observed filename mode/count remains unknown pending a separately reviewed canonical-source correction; fixed verified single-camera model defaults remain a distinct frontend concern. Several A119 family entries are selector-only and have no native filename authority. The frontend's fixed-single roster must remain separate from observed count.

The new bounded whole-name evidence closes actual late-channel gaps for Thinkware/Vantrue/BlackVue names whose anonymous engine templates currently become `unknown`; existing finite Viofo templates continue beyond the new cap. Once native evidence is capped or absent, opaque unsampled templates fail closed rather than fabricate a whole-card role count. Same-role files from incompatible candidate models remain conflicting, not automatically one camera.

## Proposed strict anonymous intake retention (coordination required)

Prior saved A119M Pro reports without names/starts/wall spans/adjacency cannot calibrate cadence. Existing paired bitrate/duration variability is not temporal evidence. No historical cadence was fabricated here.

The current strict public Report/intake contract is unchanged. The parent/Worker lane should add an optional **versioned derived summary**, allowlist it in both validator and sanitizer, and verify exact stored-record round-trip before claiming retention. Do not serialize `TemporalInventory` or add original times/names. Proposed `temporalEvidence` v1 object (reject unknown properties):

- `version`: literal1.
- `coverage`: enum `complete|partial|capped|unavailable`; `nativeVideoCount`, `retainedVideoCount`, `unmeasuredVideoCount`: nonnegative bounded integers, retained<=native; explicit cap.
- `cohorts`: at most64 entries; each has only allowlisted `channel`, `recordingContext`, `suggestion`, `confidence`, `reasonCode`, `adjacentPairCount` (0..16383), `durationMedianSeconds` (finite >0..7200), optional `startIntervalMedianSeconds` (finite >0..7200), `playbackFps` (finite1..240), optional `estimatedCaptureFps` (finite >0..240), optional `relativeDrivingBitrate` (finite >0..100), and `ownerConfirmed:false`. Enum suggestions are the four implementation families or null; reasons are a finite vocabulary, not arbitrary strings. Include codec/dimensions and existing anonymous measurement-cohort reference for baseline/context association; no firmware assertion unless explicitly supplied under the existing owner-setting contract.
- No timestamps, first/last start, basenames, original folder paths, serials, coordinates, raw OCR, native ID authority injection, or per-file recording-start offsets.
- Cadence requires complete/uncapped native coverage, supported measurements and >=4 genuinely adjacent pairs; validators must reject a cadence on unavailable/partial evidence and reject owner-confirmation promotion. Treat derived recommendations as untrusted estimates server-side, not automatic profile facts.

The present IPC result exposes relative derived statistics needed for this mapping, but **persistence remains a parent/Worker integration task**; no schema/Worker files were edited in this lane.

## Verification

Verified locally on macOS with the separate module-declaration patch temporarily applied: `cargo test --locked --manifest-path src-tauri/Cargo.toml` returned **98 passed,0 failed,2 existing developer-only tests ignored**; `cargo check --locked`, all-targets Clippy with `-D warnings`, rustfmt and `git diff --check` passed. The two ignored tests are the ffmpeg oracle and actual native OCR decoder integration, outside this lane. No frontend, packaged app, cross-platform build, upload, deployment or hardware recognition validation is claimed. The parent-owned lib declaration is supplied separately rather than committed into lib.rs.

Tests use real scratch filesystem fixtures and SHA256/mtime readbacks, including a real16,386-file traversal crossing the temporal cap. Metadata-only BMFF fixtures are synthetic, not decodable footage or hardware validation. Tests cover1/3/5fps temporal cases; ordinary/low-rate continuous; firmware/codec/resolution/fps baseline mismatch; irregular aligned events; dropped/missing channels and sequences; every-tenth representative-sample aliasing; partial/unsupported/VFR-like metadata; truncated clips; changing timing/encoding/rate; rounding/midnight/DST-like jumps; JSON injection; proxy/live role deduplication; late channels beyond the64 representative budget; and source immutability.
