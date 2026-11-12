# Contributing

This is AGPL-3.0-only software. Preserve license/copyright notices and publish corresponding source with distributed builds. Submit focused changes with tests and a clear privacy impact statement.

Run frontend build/tests and cargo check/test before proposing a change. Do not commit card scans, media, actual filenames, source paths, credentials, private signing keys, config dumps, contacts, device identifiers or GPS. Use generated synthetic fixtures only. No test should contact the production feedback/intake endpoint. The test-only legacy Worker snapshot is unmodified reference code, not permission to deploy changes to that Worker.

Do not infer camera identity from owner labels. Separate video-stream bitrate from whole-file/container rate, capture cadence from playback fps, selected setting from observed measurement, and public aggregates from private paired samples. Public exports preserve useful anonymous structure/filename SHAPES without original names/dates. Explicitly reviewed private envelopes retain bounded safe original basenames and relative folder context linked directly to each retained measurement. Use only synthetic 2030 fixtures in Git; test exact stored-record readback and public privacy stripping.

## Camera-support parity

New-model support and channel/mode corrections must be tracked in all three projects: Dashcam Card Scanner, Dashcam Offloader, and dashcam-camera-profiles. Verify each app's actual classification, editable suggestions, and submission output; updating a reference catalog alone does not establish parity. Preserve manual-versus-automatic identity boundaries and owner/unit-scoped exceptions. Track release/update-feed verification separately for each app and platform, and disclose any delivery blocker rather than calling a one-app update complete.

A release needs reviewed source, all matrix checks, platform artifact inspection, official updater key provisioning, signature verification and approved draft publication. Updating a workflow file does not establish protected-environment settings. Never claim platform notarization/signing or hardware compatibility without actual evidence. Windows ARM64 remains deferred until built/tested separately.
