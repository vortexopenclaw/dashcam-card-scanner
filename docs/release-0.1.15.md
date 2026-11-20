# Dashcam Card Scanner 0.1.15

Security hardening from an independent review (no exploitable vulnerability was found):

- Updates now require the version inside each update signature to match the offered version.
- A file swapped for a named pipe during a scan can no longer hang the scan.
- One folder's listing is capped at 262,144 entries and reported as incomplete instead of using several GB of memory.
- Private filenames containing invisible or format characters (zero-width, BOM, line separators) are rejected.
- The intake admin key is compared in constant time.
- SECURITY.md now describes bounded support-file parsing accurately.
- New hostile-card, malformed-MP4 and hostile-filename regression tests.

## Distribution

macOS packages are ad-hoc signed, not Developer ID signed or notarized. Normal first-launch Open Anyway approval may be required. Windows installers are not Authenticode signed. Official updater signatures establish package authenticity, not operating-system trust or continuity from an older, previously approved GUI installation. Linux automatic installation uses AppImage; the Debian package requires package-manager/manual installation.
