# macOS update trust investigation

## Outcome

No production workaround is justified by the available evidence. Do not replace
Tauri's installer with Offloader's installer on the assumption that `ditto`
transfers Gatekeeper approval. Do not remove quarantine, manufacture approval
flags, copy provenance from the old version, or weaken signature verification.

This investigation does **not** establish a permanent requirement for paid Apple
membership for every in-app update. It establishes that neither installer has a
special Apple trust-continuity mechanism, and that a fresh quarantined launch is
not equivalent to the successful unquarantined local update test.

## Direct observations

Test host: macOS 27.0.1, arm64. Scanner source: a7080c6. Read-only inspections used
local official 0.1.2 and 0.1.3 bundles, their matching updater archives, and the
installed `/Applications/Dashcam Offloader.app`.

- Scanner 0.1.2 has designated requirement
  `cdhash H"88f2380c237f26a31e943cc98fe454e6af3dbfea"`.
- Scanner 0.1.3 has designated requirement
  `cdhash H"f068aae9c1d763777a387720d97c1a82fbe2d198"`.
- Both Scanner versions are ad-hoc signed with hardened runtime, and have no
  TeamIdentifier. The identifiers match, but their designated requirements do not.
- Installed Offloader is also ad-hoc signed, without hardened runtime, and has
  designated requirement `cdhash H"47c6235667ab45bafb1077bdf2245d8b4582d817"`.
  This is not a Developer ID-signed counterexample.
- Inspected Scanner and Offloader bundles have `com.apple.provenance`, but no
  quarantine attribute. Provenance presence alone is not evidence of approval.
- `spctl --assess --type execute -vv` rejects these bundles (exit 3), including
  the working installed Offloader. Assessment is not a launch acceptance test.
- `syspolicy_check distribution` returns 70 for both Scanner 0.1.2 and installed
  Offloader, reporting ad-hoc signing and a missing notary ticket.
- Each official Scanner updater tar contains nine entries, no PAX headers, and
  no AppleDouble entries. These archives do not contain archived quarantine or
  provenance metadata to explain the owner's repeat prompt.
- The owner's affected Scanner bundle is not present under `/Applications` on
  this test host. The running Scanner found here is the separate local
  acceptance-harness clone, not the owner's browser-installed application.

## Actual installer comparison

Offloader was read from GitHub at **d160f4a6343163d68b952c742f75c425baaa7f67**, not
from the stale local checkout. Relevant sources:
`Sources/DashcamOffloaderApp/UpdateService.swift` and
`scripts/build-macos-app.sh`.

Offloader authenticates its manifest with Ed25519, checks the archive SHA-256,
uses URLSession to download a zip, extracts with `/usr/bin/ditto -x -k`, verifies
strict/deep code signing and expected bundle identifier, version, and build,
and only then writes its trusted installer. That installer waits for the old
PID to exit, moves the old bundle to backup, copies the staged bundle to a new
path with `ditto`, and launches via `/usr/bin/open -n`. There is no quarantine
clearing or notarization step. Its build script uses ad-hoc signing unless a
Developer ID identity is explicitly configured.

Tauri updater 2.14 verifies the signed downloaded bytes before installation,
extracts the tar into a same-volume temporary directory, sets the root to 0755,
and swaps bundles with `renamex_np(RENAME_SWAP)`, falling back to backed-up
renames where needed. It has no quarantine/xattr code. Tauri 2.12.4 relaunches
through `/usr/bin/open -n` as well. Both installers replace executable inodes
rather than overwrite the running executable's contents, consistent with
Apple's guidance. Offloader's PID-wait and strict staged identity checks are
useful differences, but are not demonstrated fixes for this Gatekeeper prompt.

## Exercised replacement experiment

A disposable clone-only experiment compared:

1. APFS `renamex_np(RENAME_SWAP)`, matching Tauri's replacement operation.
2. Moving the old bundle aside, then `ditto` copying the staged bundle to a fresh
   destination, matching Offloader's replacement operation.

For each operation, unapproved synthetic quarantine was added either to the old
bundle or to the staged bundle. No approval was forged, no xattr was removed,
and no tested application was launched. All four installed clones passed
`codesign --verify --deep --strict` and retained the exact new executable SHA-256.

Both operations preserve staged quarantine, and neither carries old-bundle
quarantine onto an unquarantined new bundle. `ditto` normalized the test
quarantine's agent field, but did not eliminate quarantine. All four installed
clones still received exit 3 from standalone Gatekeeper assessment.

This falsifies the narrow theory that simply adopting Offloader's copy semantics
removes staged quarantine or makes an ad-hoc update intrinsically Gatekeeper
accepted. It does not reproduce an already-approved browser-installed app.

Evidence is retained under the active profile's scratch directory:

- `scanner-macos-update-trust-evidence/compare_replacement.py`
- `scanner-macos-update-trust-evidence/replacement-run-77828/results.json`
- `scanner-macos-update-trust-evidence/UpdateService.swift`
- `scanner-macos-update-trust-evidence/build-macos-app.sh`

## Remaining acceptance requirement and blockers

A claim of fixed repeat prompts requires a genuine browser-downloaded old build,
its normal user-approved first launch, a verified native update, and relaunch on
the affected Mac or a clean VM. Capture quarantine/provenance, strict code-signing
results, designated requirements, executable inodes, and exact target path both
before and after installation. Compare the same acquisition history with
Offloader. A successful unquarantined clone update is insufficient.

The old build's real approval history is unavailable here. System log inspection
also failed with `Operation not permitted`; no elevated access or security
settings were changed to work around that. A development certificate is not a
Developer ID distribution certificate or notarization credential, and changing
the signer without the above acceptance test would be speculative.

No app source, updater key, feed, release, installed user app, or OS security
configuration was modified. Only disposable clones and this report were written.

## Sources

Usable web evidence first came from ordinary web search; Apple Developer forum
content was then retrieved via lightweight extraction. The JS-only updating guide
was retrieved from Apple's public documentation JSON endpoint.

- [Apple: Resolving Trusted Execution Problems](https://developer.apple.com/forums/thread/706442)
  documents quarantine propagation, differences between Unix tools and user-level
  downloads, false-negative tests, and the need for a fresh test Mac or VM.
- [Apple: Resolving Gatekeeper Problems](https://developer.apple.com/forums/thread/706379)
  distinguishes signature validity from notarization and launch policy.
- [Apple: macOS Code Signing In Depth](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)
  distinguishes identity tracking by subsystem; stable designated requirements
  alone do not imply Gatekeeper trust.
- [Apple: Updating Mac software](https://developer.apple.com/documentation/security/updating_mac_software)
  requires replacing signed executable files instead of overwriting them in place;
  both investigated installers already follow that rule.
