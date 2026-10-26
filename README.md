# Dashcam Card Scanner by Vortex Radar

Open-source, standalone **Tauri 2** desktop utility for read-only dashcam card research. No Offloader installation, account, cloud credential, or media upload is required. Licensed **AGPL-3.0-only**; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Use

1. Choose the card root or a local folder; scanning starts automatically. Paths remain local. Newly inserted, eligible removable camera cards can be detected while the app is idle, without replacing an active report.
2. Follow read-only scan progress, or cancel. Skipped entries, unavailable measurements and partial scans are shown.
3. Confirm editable camera/channel suggestions from the bundled profile catalog, or choose/type a manufacturer and model. Use brand-specific quality/parking suggestions or enter another setting. Ordinary reports need no manual sample assignment. **Advanced: mixed configurations** provides separate groups and batch assignment when a card contains different settings; missing group assertions never inherit another group's values.
4. Click **Submit** after confirming your camera and settings. Only metadata is sent—no footage, CAPTCHA, verification window, ticket, or extra checkbox. The button shows **Sending…**, then **Submitted ✓** and a nearby thank-you after a matching server receipt. Unchanged reports are not sent again in the same app session.
5. The dedicated intake validates bounded reports, detects duplicates, and enforces basic request/storage limits. Anonymous direct submission does not authenticate contributors or eliminate spam. Optional report previews, sample measurements, and exact technical JSON are available without making them mandatory steps. The legacy feedback endpoint is never contacted directly.
6. **More options → Save report to file…** keeps a local copy or supports manual sharing when online submission is unavailable. The app creates a new file outside the source and never overwrites existing files. Saving sends nothing.

**Settings** is a separate screen with appearance, optional saved DashCamTalk username, and app updates. A nonempty saved username is automatically included in the private submission you review and approve, identifying the contribution for possible credit. It remains excluded from local exports and public proposals; credit/publication is a deliberate maintainer action. No automatic forum messaging occurs.

### Data formats

- **Public export:** published `dashcam-camera-profiles` card-scan schema **1.0**, folder summaries, filename SHAPES and aggregate `video_summary`. Original names/dates/paths are never exported. Unknown folder components become `folder-N`; known camera directory names are allowlisted. Shape alphabet: `N` digit, `A` uppercase letter, `a` lowercase letter, `?` other character. Extensions have a separate allowlisted count map. No literal channel inference from shapes.
- **Private paired export:** existing Feedback training envelope, safe directory counts, shapes in the bounded message, codec and individual whole-file byte-size/duration/video-stream bitrate/dimensions/frame-rate measurements in `videoSpecSummaries.storageRateSamples`. No contact or original filenames. This format is export-only. It is tested through an **unmodified** legacy Worker snapshot with mocked storage and read-back of the exact persisted record, not merely HTTP acceptance.
- **Secure intake:** revised strict schemaVersion 1 with complete safe folder components/counts/templates and up to 24 INDIVIDUAL nullable samples, preserving exact whole-file size/duration pairs, video-stream bitrate and codec. Container bitrate stays null when not measured. Structure-only positive-media scans are accepted without ffprobe. Partial scans, more than 32 folders or complete payloads above 16 KiB remain export-only. Owner channel/mode settings do not change measured playback fps. Sample channel/mode hints use validated native camera context, or remain unknown when matching profiles conflict; protected events are not inferred to be parking. This is a separate versioned, strict gateway contract. The exact outgoing JSON is reviewed independently and serialized once; its exact UTF-8 bytes are hashed and uploaded without reserialization. See [SECURITY.md](SECURITY.md). No automatic publication occurs.

Public export is not a substitute for private paired evidence; do not add undeclared paired fields to public schema 1.0. A safe label can still identify a person if the owner enters one; review labels before export or submission.

## Automatic recognition

On macOS 11 and later, a bundled native helper examines a bounded selection of bottom-of-frame model stamps locally using AVFoundation and Vision. Known stamps must agree with card filename/folder evidence. No frames or raw recognized text are uploaded or kept in reports. Blank or conflicting evidence remains editable/manual; OCR is not device authentication. Windows and Linux currently use metadata recognition without frame OCR. Observed channel suggestions come from known filename roles and card evidence, not merely the model’s maximum supported channels; missing recordings can undercount channels.

The sidebar provides **Scanner** and **Settings** navigation without discarding the current report. Updates check at startup; an explicit Update click downloads, verifies, installs, and restarts automatically, clearing an unsent report as explained beside the action.

## Metadata and scan limits

No ffprobe binary is bundled, downloaded or launched. A built-in Rust ISO BMFF parser reads bounded MP4/MOV/M4V metadata, skips media payload boxes and does not parse GPS, metadata tags or config files. It supports ordinary non-fragmented visual sample entries `avc1/avc3`, `hvc1/hev1`, `av01`, `mp4v`, `vp09`. Width/height come from the visual sample entry, duration from the video media timescale, average nominal frame rate from sample count / media duration, and video bitrate from **video sample-table bytes × 8 / video duration**, not whole-file/container bitrate. Whole-file size is retained separately. These are average playback/encoding measurements, not capture cadence or proof of selected parking mode.

Unsupported, fragmented, malformed, oversize, or missing metadata yields unavailable values or a failed probe, never a guess. Edit-list timelines, rotation, variable-frame-rate distributions, and capture cadence are not interpreted. AVI/TS/MKV are inventoried but not probed. The scanner attempts supported video headers across the whole card, rather than stopping metadata inspection after its retained sample budget. Folder-level metadata cohorts preserve observed encoding changes and paired measurement extrema. A separate, bounded selection retains up to 64 individual samples, with at most two per observed filename-template/encoding stratum; this selection is not statistically representative and cannot guarantee that every configuration reaches a submission. No capture-mode or trigger inference is asserted from encoding measurements alone.

Exceptional traversal limits: 10,000,000 enumerated entries, 16,384 directories, depth 32, and 8,192 metadata cohorts. Parser limits include a 4 MiB moov, 256 top-level boxes, 4,096 boxes per container, and 1,000,000 video sample sizes; folder summaries retain at most 20 filename shapes. The interface reports inventory completeness, metadata coverage, unsupported measurements, and specific scan issues separately. Links, Windows reparse points/offline placeholders, and nonregular files are skipped. Reads run in a blocking worker; cancellation is checked between entries. There is no fixed whole-card time cutoff, and filesystem/kernel I/O on a disconnected or stalled volume can still block a current read; cancellation is **not a hard OS I/O deadline**. Use a stable card; this is not a hostile concurrently mutating filesystem sandbox. OS access-time or removable-media bookkeeping is outside the app’s control; use a hardware write blocker when forensic immutability is required.

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

Tests use generated fixtures, not proof of hardware compatibility. A developer-only Cargo example (`scan_fixture`) exercises the real Rust engine and exports. Contract tests use Ajv against the published schema snapshot; DOM tests verify navigation, auto-scan guards, review invalidation, consent and no automatic submit. Automated suites do not contact production. `intake/` contains the separate abuse-controlled service and its tests, with no private snapshots. Optional `node scripts/verify-native.mjs` generates H.264/HEVC clips and compares the native reader to a host ffprobe; these development tools are not app dependencies. Catalog generation uses developer-only Python/PyYAML; the generated catalog is compiled into the desktop app.

Local ad-hoc Mac review bundle, without updater artifacts (not notarized):

```sh
npm run tauri -- build --ci --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

## Platforms and releases

During UI iteration, push/PR verification defaults to Apple Silicon Mac. Manually dispatch **Verify desktop builds** with `all_platforms: true` for Windows x64, Intel Mac and Linux x64 acceptance before public release. The agent-managed release workflow still targets all four. Windows installers are configured to embed the offline WebView2 installer rather than requiring a separate runtime download on a tester's PC; that package still needs platform acceptance. Windows ARM64 is deferred. Linux `.deb` and AppImage targets remain; the in-app updater is for AppImage, **not `.deb` package-manager installs**.

`release.yml` is explicitly dispatched on protected `main` and uses the main-only **scanner-release** environment. Routine releases are agent-managed under owner authorization; no separate GitHub human approval is required. Repository administrators must retain the environment's single `main` branch deployment rule; YAML alone cannot create that protection, and the workflow reads it back and fails closed if it changes. Signing secrets stay environment-scoped. The workflow refuses the placeholder updater public key, requires private signing key CI secrets, creates a **draft** release, and builds signed updater artifacts plus `latest.json`. Before publishing a validated draft, the agent must confirm all automated tests, signed platform assets, packaging/OCR checks, manifest inspection, exact-artifact native installation/startup and updater acceptance. Missing platform acceptance or a real quality/security concern blocks promotion and must be reported directly to the owner, not bypassed. This policy does not authorize bypassing unrelated PR/branch/security requirements. There is no PR-triggered privileged workflow and no `pull_request_target`.

Official updater endpoint: `https://github.com/vortexopenclaw/dashcam-card-scanner/releases/latest/download/latest.json`. The official PUBLIC verification key is provisioned in `src-tauri/tauri.conf.json`; private signing material is not in this repository or app. Release signing secrets are provisioned in the protected, main-only `scanner-release` CI environment. Verification failure never falls back to unsigned installation. No Apple distribution/notarization or Windows Authenticode credentials are present; artifacts are not claimed notarized or SmartScreen-trusted. See [CONTRIBUTING.md](CONTRIBUTING.md).

### Exact-artifact native acceptance (operator notes)

For the current version, after the complete `release.yml` build and inspection
pass, dispatch **Exact draft native acceptance** (`native-release.yml`) on `main`
with the exact draft `release_id` and 40-character build `source_sha`. It refuses
published releases, wrong versions/sources, partial inventories and missing hashes.
Its download-only broker snapshots the 13-asset inventory and authenticates all
four canonical updater signatures before sharing the exact bytes with isolated
native jobs. Tauri package-specific aliases must exactly match their canonical
platform entry; unknown keys or mismatched aliases fail closed. Debian metadata,
when present, is authenticated by the broker but never used as the Linux AppImage
update or staged for native execution.
Native probes preserve the existing OS trust controls and install/start/restart
checks. This does not publish, and native acceptance does not replace real
previous-version in-app update/relaunch acceptance. Retain the draft if either
fails. No signing secret is supplied to this workflow; candidate execution has
read-only repository permissions and a minimal environment.

The separate historical lane below remains pinned to 0.1.8; do not use it as
acceptance evidence for a newer release.

For the specifically approved 0.1.8 candidate, dispatch **Approved draft release**
on protected `main` with `native_candidate: true`. This mode skips draft creation,
retargeting, rebuilding and signing. The main-only `scanner-release` environment
protects a download/verification-only broker; only that job has `contents: write`.
It references no signing secret, executes no candidate and persists no checkout
credential. Same-run hosted native jobs have `contents: read`, no shared writable
cache, and a minimal candidate process environment. The pinned source remains
`afc679f96bc5fedca522e7db5e5155a12e5d0537` even if CI-only main advances.

The broker checks the independently retained 13-file inventory, sizes, hashes,
original public key, four updater signatures/trusted comments and tamper controls.
Native jobs independently rehash the necessary 11 files and reverify signatures.
The unused Debian package/signature are not promoted. A public receipt contains
hashes, not credentials or private inputs. **Actions artifacts in this public
repository are readable by authenticated repository readers; draft privacy does
not carry over.** This is the explicitly approved candidate staging surface, not
a private distribution channel or public release attachment. Candidate artifacts
expire after one day; text/native evidence expires after 14 days.

Sequence: prerequisite preflight → build once → verify exact signed artifacts →
isolated normal native install/startup/restart → owner-conditional public latest
promotion → immediate real old-version in-app update/relaunch. No publication is
automatic. Public GitHub latest reaches the public audience, not a targeted canary.

Ad-hoc macOS signing is not Developer ID/notarization. `spctl` assessment is retained
separately from actual LaunchServices behavior. The hosted first-install probe adds
representative downloaded-DMG quarantine, never removes it, and stops on actual
normal launch denial; this is not proof of a real browser download or in-app updater
provenance. Windows uses the configured WebView2 download bootstrapper, not an
offline-install claim. Missing platform acceptance blocks promotion; hashes or CI
build success are not substitutes. Never clear trust controls to make a gate pass.
