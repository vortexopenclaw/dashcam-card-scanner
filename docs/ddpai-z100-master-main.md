# DDPAI Z100 Master main-unit confirmation

Choose **DDPAI → Z100 Master - Main Unit** only when confirming this model's
main-unit card, not a separately recording accessory. Shared DDPAI numbered
folders (or a model-looking volume label) cannot establish exact identity.
The selector-only catalog entry intentionally has no automatic recognition rules.

The owner-confirmed main unit has built-in front and telephoto cameras. Current
firmware labels telephoto recordings `inside`. After explicit selection, observed
videos under `DCIM/200video/front` and `DCIM/200video/inside` suggest editable
front/telephoto roles. Empty rear folders and photos/thumbnails do not increase
the observed video-channel count. Missing clips are not evidence that a built-in
lens was disabled. This mapping never applies to generic, sibling or accessory
cards without explicit main-unit confirmation.

Only `S_` videos in the main unit's front recording folder establish time-lapse
parking evidence. Inside/rear/photo/thumbnail/other-folder files do not inherit
that marker. Review shows the per-sample time-lapse evidence; a mixed card does
not receive a whole-card parking setting or an invented capture cadence. Encoded
playback fps and bitrate do not establish capture fps. The v1 submission schema
retains broad `parking` context and physical roles; its owner parking setting
remains separately editable, and it has no per-sample subtype field.

Manual preview uses a private working clone of the native scan. Preparing a
report independently reapplies the exact owner-confirmed manufacturer/model
context, so renderer previews cannot change the original scan's recognition.
Switching identity or rescanning recomputes suggestions. Owner edits to channel
count/setup are preserved.

## Verification and deployment

Synthetic Rust tests exercise read-only inventory, main-unit preview, empty rear,
incomplete observed coverage, generic/sibling/accessory and wrong-channel
negatives, and prepared submission roles/modes. The frontend integration consumes
real Rust-generated preview output in the mounted app's picker/review/rescan/
submission flow and sends the actual native envelope through offline gateway
admission with exact stored-record readback. These are not physical-card or
footage/codec-decoding validation. Native OCR shipping policy is unchanged.

The bounded folder-component allowlist adds `200video`, `201photo`, `202thumb`
and `inside` in both the native scanner and intake validator. **Deploy the intake
schema update before shipping the scanner**, otherwise an older gateway may
reject these newly preserved components. No deployment or release is performed
by these changes.
