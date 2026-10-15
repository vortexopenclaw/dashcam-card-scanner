# Dashcam Card Scanner by Vortex Radar

Open-source, standalone **Tauri 2** desktop utility for read-only dashcam card research. No Offloader installation, account, cloud credential, or media upload is required. Licensed **AGPL-3.0-only**; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Use

1. Choose the card root or a local folder. Paths remain local.
2. Scan read-only. Progress, cancellation, skipped entries, unavailable probes and partial scans are shown.
3. Enter the manufacturer/model. Review the sampled files and assign separate configuration groups when a card contains different channel counts, firmware, quality or parking settings. Unknown settings stay unknown; one group's assertions never apply to the whole card.
4. Review the human-readable report and, if desired, expand the exact outgoing technical details before approving submission.
5. Optional submission requires explicit consent, a browser Turnstile challenge and a short-lived one-use ticket bound to the exact reviewed payload. The dedicated intake origin is provisioned, but production intake remains disabled pending a successful browser-approved upload and private readback. The legacy feedback endpoint is never contacted directly.
6. **More options → Save report to file…** keeps a local copy or supports manual sharing when online submission is unavailable. The app creates a new file outside the source and never overwrites existing files. Saving sends nothing.

Appearance lives only in **Settings**: Match System (default), Dark, or Light. Settings can also remember an optional DashCamTalk username. Including that username requires a separate opt-in on a private submission; local exports and public proposals exclude it. No automatic forum messaging or publication occurs.

### Data formats

- **Public export:** published `dashcam-camera-profiles` card-scan schema **1.0**, folder summaries, filename SHAPES and aggregate `video_summary`. Original names/dates/paths are never exported. Unknown folder components become `folder-N`; known camera directory names are allowlisted. Shape alphabet: `N` digit, `A` uppercase letter, `a` lowercase letter, `?` other character. Extensions have a separate allowlisted count map. No literal channel inference from shapes.
- **Private paired export:** existing Feedback training envelope, safe directory counts, shapes in the bounded message, codec and individual whole-file byte-size/duration/video-stream bitrate/dimensions/frame-rate measurements in `videoSpecSummaries.storageRateSamples`. No contact or original filenames. This format is export-only. It is tested through an **unmodified** legacy Worker snapshot with mocked storage and read-back of the exact persisted record, not merely HTTP acceptance.
- **Secure intake:** revised strict schemaVersion 1 with complete safe folder components/counts/templates and up to 24 INDIVIDUAL nullable samples, preserving exact whole-file size/duration pairs, video-stream bitrate and codec. Container bitrate stays null when not measured. Structure-only positive-media scans are accepted without ffprobe. Partial scans, more than 32 folders or complete payloads above 16 KiB remain export-only. Owner channel/mode settings do not change measured playback fps; sample channel/mode remain unknown. This is a separate versioned, strict gateway contract. The exact outgoing JSON is reviewed independently and serialized once; its exact UTF-8 bytes are hashed and uploaded without reserialization. See [SECURITY.md](SECURITY.md). No automatic publication occurs.

Public export is not a substitute for private paired evidence; do not add undeclared paired fields to public schema 1.0. A safe label can still identify a person if the owner enters one; review labels before export or submission.

## Metadata and scan limits

No ffprobe binary is bundled, downloaded or launched. A built-in Rust ISO BMFF parser reads bounded MP4/MOV/M4V metadata, skips media payload boxes and does not parse GPS, metadata tags or config files. It supports ordinary non-fragmented visual sample entries `avc1/avc3`, `hvc1/hev1`, `av01`, `mp4v`, `vp09`. Width/height come from the visual sample entry, duration from the video media timescale, average nominal frame rate from sample count / media duration, and video bitrate from **video sample-table bytes × 8 / video duration**, not whole-file/container bitrate. Whole-file size is retained separately. These are average playback/encoding measurements, not capture cadence or proof of selected parking mode.

Unsupported, fragmented, malformed, oversize or missing metadata yields unavailable values or a failed probe, never a guess. Edit-list timelines, rotation, variable-frame-rate distributions and capture cadence are not interpreted. AVI/TS/MKV are inventoried but not probed. Bounded first-encounter sampling is not statistically representative: at most 4 sampled videos per directory, 64 overall (unsupported files consume sample budget); mixed settings/channels can be missed. No identity/model/mode/trigger inference is asserted.

Limits: 100,000 enumerated entries, 160 directories, depth 8, 120 seconds of cooperative processing, 4 MiB moov, 256 top-level boxes, 4,096 boxes per container, 1,000,000 video sample sizes, 20 shapes per folder. Links, Windows reparse points/offline placeholders and nonregular files are skipped. Reads run in a blocking worker; cancellation is checked between entries. Filesystem/kernel I/O on a disconnected or stalled volume can still block a current read; the time bound is **not a hard OS I/O deadline**. Use a stable card; this is not a hostile concurrently mutating filesystem sandbox. OS access-time or removable-media bookkeeping is outside the app’s control; use a hardware write blocker when forensic immutability is required.

## Development

Prerequisites: Node 24+, Rust stable, and [Tauri platform dependencies](https://v2.tauri.app/start/prerequisites/). macOS needs Command Line Tools; Linux needs WebKitGTK 4.1/GTK/AppIndicator; Windows needs MSVC/WebView2.

```sh
npm ci
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm test
npm run test:intake
npm run tauri -- dev
```

Tests use generated metadata-only fixtures (not actual camera recordings). A developer-only Cargo example (`scan_fixture`) exercises the real Rust engine and exports. Contract tests use Ajv against the exact published schema snapshot; DOM tests verify literal rendering, review invalidation, consent and no automatic submit. Automated test suites do not contact production. `intake/` contains the separate abuse-controlled intake/review service and its tests, with no private snapshots; the dedicated Worker is deployed disabled pending acceptance. Optional `node scripts/verify-native.mjs` generates actual H.264/HEVC test clips and compares the native scanner to a host ffprobe; these development tools are not app dependencies.

Local unsigned review bundle, without updater artifacts:

```sh
npm run tauri -- build --no-sign --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

## Platforms and releases

CI matrix is configured for Windows x64, macOS arm64 and x64, Linux x64. Local verification evidence is recorded separately; CI configuration is not proof those builds have run. Windows ARM64 is deferred/unverified. Linux `.deb` and AppImage are built; Tauri in-app updater is intended for AppImage, **not `.deb` package-manager installs**.

`release.yml` is manually dispatched on protected `main` and uses the protected **scanner-release** environment. Repository administrators must configure required reviewers and main-only deployment branch rules; YAML alone cannot create that protection. The workflow refuses the placeholder updater public key, requires private signing key CI secrets, creates a **draft** release, and builds signed updater artifacts plus `latest.json`. A maintainer must inspect all artifacts before manually publishing. There is no PR-triggered privileged workflow and no `pull_request_target`.

Official updater endpoint: `https://github.com/vortexopenclaw/dashcam-card-scanner/releases/latest/download/latest.json`. The official PUBLIC verification key is provisioned in `src-tauri/tauri.conf.json`; private signing material is not in this repository or app. Release signing secrets are provisioned in the protected, main-only `scanner-release` CI environment. Verification failure never falls back to unsigned installation. No Apple distribution/notarization or Windows Authenticode credentials are present; artifacts are not claimed notarized or SmartScreen-trusted. See [CONTRIBUTING.md](CONTRIBUTING.md).
