# Dashcam Card Scanner 0.1.14

- Preserve native camera model IDs containing parentheses through private report validation.
- Correct filename hint patterns without converting shared filename evidence into exact camera identification.
- Refresh the public camera selector provenance from reviewed, committed profile inputs.
- Update URI parsing dependencies and make verification less sensitive to concurrent native fixture load.

## Distribution

macOS packages are ad-hoc signed, not Developer ID signed or notarized. Normal first-launch Open Anyway approval may be required. Windows installers are not Authenticode signed. Official updater signatures establish package authenticity, not operating-system trust or continuity from an older, previously approved GUI installation. Linux automatic installation uses AppImage; the Debian package requires package-manager/manual installation.

## Publication hold

Keep this release draft until the receiving intake deployment accepts the expanded native model IDs and the parent explicitly authorizes publication. Do not change the latest feed while held.

## Source provenance

- Offloader profile data: `4cb36727dcf70afa5847a74db77ecf31139389c0`.
- Canonical selector identities: `d8e38bd56b088b3f20c6b8db87d90229efcc60dc`.
- The latter's profile bytes are unchanged from `cc91a34bd8075df6db8771aaca12e021ae38da3c`; only corrected history tests changed.

## Verification reliability

The failed integrated run is preserved outside the repository as `scanner-integrated-verification.log`. The default Vitest worker count launched competing Cargo/probe processes and starved UI tests on the loaded host. Limit concurrent file workers to two; retain all test timeouts and assertions. The active-scan updater test also raced the real 500ms automatic check: on a busy host its post-scan click could install an already discovered update. Use fake time for that case and assert exactly one check and zero installations rather than depending on elapsed wall time.
