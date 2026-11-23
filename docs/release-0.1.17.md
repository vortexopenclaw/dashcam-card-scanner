# Dashcam Card Scanner 0.1.17

- Automatic crash, error and log reporting to the developer's Sentry project, on by default, for both the native app and the window. Reports are scrubbed before sending: home folders, user names, volume labels, serial numbers, MAC addresses, GPS coordinates and media file names are removed. No card media, reports, payloads, user identity or IP address are sent.
- Set `DASHCAM_SCANNER_SENTRY=0` to turn reporting off for a run.
- Release builds upload JavaScript source maps and Rust debug files to Sentry (never bundled into the app) so reports show readable stack traces.

## Distribution

macOS packages are ad-hoc signed, not Developer ID signed or notarized. Normal first-launch Open Anyway approval may be required. Windows installers are not Authenticode signed. Official updater signatures establish package authenticity, not operating-system trust or continuity from an older, previously approved GUI installation. Linux automatic installation uses AppImage; the Debian package requires package-manager/manual installation.
