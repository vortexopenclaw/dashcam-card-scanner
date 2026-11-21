# Dashcam Card Scanner 0.1.16

- Empty reserved photo slots (such as the placeholder files on DDPAI Z100 cards) are no longer counted as images or chosen as samples. A file is treated as an empty slot only after its entire contents are verified; anything unreadable, changed, or over the scan budget stays a normal image.
- Reports include a count of empty slots found and how many photo files could not be checked. Counts only; no file names or paths.

## Distribution

macOS packages are ad-hoc signed, not Developer ID signed or notarized. Normal first-launch Open Anyway approval may be required. Windows installers are not Authenticode signed. Official updater signatures establish package authenticity, not operating-system trust or continuity from an older, previously approved GUI installation. Linux automatic installation uses AppImage; the Debian package requires package-manager/manual installation.
