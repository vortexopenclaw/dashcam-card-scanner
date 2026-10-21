# Local model-stamp OCR

macOS only (Apple AVFoundation + Vision), no uploaded images/words and no installed
Offloader, ffmpeg, tesseract, runtime Swift compiler, or developer-path dependency.
Windows/Linux use the existing metadata/model-label recognition; **no OCR there**.

## Parent integration

`recognition::recognize_with_ocr(root: &Path, report: &Report,
    cancel: &AtomicBool, progress: impl FnMut())
    -> (serde_json::Value, Option<&'static Camera>)`

Call **once** after `engine::scan` inside the existing `spawn_blocking` flow.
Replace its existing `recognition::recognize` call, not the per-video header probe.
Pass the same scan cancellation flag. Emit a fixed “Reading local model stamp”
progress phase from the callback (called at most about every 250 ms during decode).
The backward-compatible `recognize` already uses OCR, but cannot receive the
caller's cancellation flag; the explicit hook should be used by the scan owner.
Do not call both APIs. Continue using the returned static camera for existing
native context/annotations. Never place internal OCR evidence in a report.

Exact stamp evidence is an editable suggestion, not authentication. It needs
matching filename AND folder evidence, does not require a volume model label,
and vetoes contradictory labels. Unknown/blank frames don't select a model;
partial/mixed/conflicting known identities cannot force an exact camera. With
no detected identity the existing corroborated model-label path remains usable.

## Safety and boundedness

- Uses the same 24-element `intake::selected_samples` ordering, with at most six
  eligible MP4/MOV/M4V candidates, two frames each (0 and 1 s), bottom 25% only.
- Sanitized folder aliases are NOT source paths. Only verbatim known camera
  folders are eligible; `safe_root` and anchor-relative `open_dir_secure` reject
  traversal/symlinks. Final media is opened read-only, nonblocking, no-follow,
  checked regular, and inherited as fd 0. No original pathname reaches decoder.
- AVFoundation cannot decode `/dev/fd/0` directly. A custom resource loader serves
  bounded 64 KiB `pread` chunks from fd 0 with a total 64 MiB per-worker read cap;
  asynchronous delivery permits seeking to a large file's tail moov. The custom
  URL is a fixed local scheme, not an external network URL.
- Frame maximum 2560×1440. Recognition uses CPU-only accurate English Vision,
  no custom words or language correction, top-1 confidence >=0.75, whole compact
  manufacturer+model observation equality (never partial sibling substrings).
- Worker stdout contains only allowlisted catalog **indices**; raw OCR strings
  and frame pixels remain in worker memory. Stderr is discarded. Nothing is
  saved on the source or retained in report/export/submission payloads.
- Parent polls at 20 ms, hard-kills/reaps worker at cancellation/65 s per file/
  80 s total. Worker independently exits at 70 s. Cold Vision initialization was
  actually ~50 s on this host; warm complete synthetic suite was ~6 s. Kernel
  filesystem operations cannot be made deadline-safe by cooperative Rust checks.

## Packaging

`build.rs` compiles the target-native helper with `xcrun swiftc`, signs it ad-hoc,
and embeds the **signed executable bytes in the main Mach-O** via `include_bytes`.
Both aarch64→arm64 and x86_64→x86_64 are mapped explicitly. Non-macOS invokes no
Swift/signing tool and references no native resource. There is no sidecar path
that can go missing in a DMG/updater. At runtime a unique private 0700 directory
materializes precisely those bytes, executable 0500, removed on completion;
this is bundled native code, not a runtime Swift source/compiler invocation.
Current project packaging is ad-hoc/integrity-only, not Developer ID notarized.
Future Developer ID/Gatekeeper acceptance must explicitly exercise temporary
embedded-helper execution; do not claim notarization from ad-hoc verification.

Run `scripts/verify-local-ocr-package.py <actual.app> <target OUT_DIR/model-stamp-helper>`
on the build app, read-only-mounted actual DMG app, and safely extracted actual
updater app. It checks deep strict codesign, bound Info.plist, version-2 sealed
resources, exact signed-helper bytes inside the main executable, and architecture
parity. For each CI target, OUT_DIR is under its own cargo target build directory.
No additional resource/binary config is required. Do not pass `--no-sign`.

Optional build-time `SCANNER_DISABLE_NATIVE_OCR=1` compiles the exact same no-OCR
fallback as non-macOS, without Swift or helper references. Default macOS builds
fail rather than silently shipping a missing helper when native compilation fails.

## Verification

`python3 scripts/test-local-ocr.py --scratch <private absolute scratch directory>`
creates synthetic ffmpeg MP4s (developer-only) and actually exercises Rust's
secure opener + signed embedded helper + AVFoundation + Vision. It asserts:
A119M Pro positive on Untitled-equivalent root; blank negative; Mini 2 selected
instead of Pro including spoofed Pro-label conflict; two stamps/frame negative;
mixed-card negative; top-of-frame-only negative; 128 MiB sparse-free-box/tail-moov
positive; cancellation; symlink-directory/file and FIFO rejection. Source hashes
and mtimes are checked. Fixtures are never committed. The script asserts the
ignored test was actually collected, not a zero-test success.

`SCANNER_DISABLE_NATIVE_OCR=1 cargo test --locked --manifest-path src-tauri/Cargo.toml non_macos_metadata_fallback`
exercises the non-native fallback on this Mac; actual Windows/Linux full builds
remain CI acceptance, not claims from a Mac conditional build.

Local Apple Silicon app bundle, Rust check/test/fmt/Clippy (-D warnings), frontend
build and existing frontend tests passed. Intel cross-compilation on this ARM
host was blocked by its installed Apple toolchain's ARM-only Swift compatibility
libraries; compile the unmodified helper on the actual Intel macOS runner. No
physical owner's card was available/tested. Do not promote synthetic evidence
into a real-card recognition guarantee.
