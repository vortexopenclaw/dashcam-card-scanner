# Sentry crash/error reporting

Project: `vortex-openclaw/dashcam-card-scanner` (https://us.sentry.io), one project for Rust and webview events (`event.process` tag = `rust` / `webview`).

- Rust: `src-tauri/src/telemetry.rs` — `sentry` 0.49 (panic, backtrace, contexts, debug-images, logs; reqwest + rustls/ring) plus `tauri-plugin-sentry` 0.9 (no JS injection, no minidump). Failed privileged commands (`scan_source`, `select_discovered_card`, `export_review`, `submit_review`, `check_update`, `install_update`) are captured via `telemetry::command_result`; expected flow refusals are logged only.
- Webview: `src/telemetry.ts` — `@sentry/browser` 11 with `tauri-plugin-sentry-api` IPC transport, `browserTracingIntegration` (0.2), console warn/error logging. IPC rejections become breadcrumbs/logs.
- Scrubbing: both sides, see SECURITY.md. `sendDefaultPii` off (`dataCollection.userInfo=false` in SDK v11).
- Disable for a run: `DASHCAM_SCANNER_SENTRY=0`.

## Verification triggers (hidden)

```sh
DASHCAM_SCANNER_SENTRY_TEST=rust-error,rust-panic,js-error,js-rejection \
  "src-tauri/target/release/bundle/macos/Dashcam Card Scanner.app/Contents/MacOS/dashcam-card-scanner"
```

Each trigger sends a synthetic event containing a fake home path, media filename, serial and GPS pair, which must arrive scrubbed.

## Source maps and debug files

`npm run build` (also Tauri's `beforeBuildCommand`) emits hidden source maps, then `scripts/sentry-sourcemaps.mjs` uploads them for release `dashcam-card-scanner@<version>` with URL prefix `app:///assets` when `SENTRY_AUTH_TOKEN` (org token, CI scope) is set, and always deletes them from `dist/` so they are not embedded. Upload failures do not fail the build unless `SENTRY_UPLOAD_REQUIRED=1`.

Rust panics are symbolicated client-side (function names from the binary symbol table). The release profile also writes line tables to a separate debug file (`split-debuginfo = "packed"`; never bundled). For file:line Rust stacks use the owner build:

```sh
SENTRY_AUTH_TOKEN=... npm run tauri:build:sentry -- --bundles app
```

It remaps the builder's home directory out of compiled paths (`--remap-path-prefix`), because Sentry adds DWARF paths during server-side symbolication, after client scrubbing. Do not upload debug files from a build without that remap. `npm run sentry:debug-files` uploads existing debug files only.

Release CI: `release.yml` passes `secrets.SENTRY_AUTH_TOKEN` (stored in the `scanner-release` environment) to the tauri-action build for JS source maps, applies the same `--remap-path-prefix` home/checkout remap as `tauri:build:sentry` for the whole build job, and then uploads the per-platform Rust debug files (`.dSYM` on macOS, `.pdb` on Windows, binary + `.dwp` on Linux). A failed or skipped debug file upload is shown as a failed step/warning but does not fail the release build.
