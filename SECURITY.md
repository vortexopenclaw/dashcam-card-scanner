# Security and privacy architecture

## Trust boundaries

The renderer is local static HTML/TypeScript, uses textContent rather than HTML interpolation, and has no filesystem, shell, opener, HTTP or updater plugin permissions. CSP permits only local assets and Tauri IPC, not renderer network requests or remote navigation. Custom Rust commands are the narrow privileged boundary. They hold selected source handles/state and exact reviewed payloads; the renderer cannot supply arbitrary read/export paths, endpoints or a replacement upload body. Native dialogs select both source and destination.

The scanner opens source files read-only through capability-relative no-follow operations, skips links/reparse points/nonregular files, reads no configs and has bounded enumeration/probing. Export is a separate operation creating a new file outside the source, never overwriting existing files. The app cannot prevent a hostile local administrator from replacing files, mutating directories or patching the binary; use a stable card and a hardware write blocker for forensics. Source path, OS logs and WebView/application memory on the local computer are not a public data boundary.

No Cloudflare API token, account key, admin credential, shared upload password, signing private key or private endpoint is needed by this app. The endpoint and updater PUBLIC verification key are public configuration, not credentials. Public upload endpoints are inherently discoverable and abusable: CORS and hidden URLs are not authentication. No such claim is made here.

## Opt-in intake

`src-tauri/src/intake.rs` contains the dedicated reviewed HTTPS intake origin. Submission fails closed when unconfigured. Do not redirect it to the legacy feedback Worker. The separately deployed intake service owns bounded validation, request limits, duplicate detection, private storage, and maintainer review.

An explicit Submit click prepares exact UTF-8 metadata bytes and sends them natively to `/submit-direct`; optional previews expose the outgoing data. There is no CAPTCHA, verification window, shared secret, or ticket in this flow. The native client uses the compiled HTTPS origin, explicit JSON content type, no redirects, and a 20-second timeout. It accepts only HTTP 202 with a bounded receipt matching the exact report hash and `status: pending`. Receipt hashes stay internal except in optional technical details. Local successful hashes/snapshots prevent unchanged repeats within the app session; server transactional dedupe remains authoritative. Retry requires another explicit click. Exports do not transmit data.

The direct service implements schema/body limits, bounded pre-validation work and admission budgets, transactional semantic duplicate admission while preserving exact first-record bytes, storage quotas, and a disable switch. Explicit authorized reclamation/reconciliation preserves records until reviewed archival/deletion is confirmed; no silent deletion or unlimited raw-hash aliases are used. Anonymous quota exhaustion remains an availability risk, and deployment/readback must be verified independently from source tests. These controls do not authenticate contributors or guarantee spam prevention; human verification was deliberately removed for this small project. Legacy challenge/ticket routes remain server-side only for older installed clients. The service provider sees IP/network metadata. No contact field exists. Evidence remains pending until a maintainer reviews it; automatic database publication is not part of the app. Existing model/new firmware/quality/parking mode/channel combinations must be reconciled in the separate review workflow, not guessed locally.

## Local model recognition

Video-stamp OCR is temporarily disabled in 0.1.8 on every platform with the owner's approval. The build script does not compile or embed a native media-decoding worker, and environment variables cannot re-enable it. Package verification requires the compiled metadata-only mode and rejects a bundled or embedded cached OCR worker. Metadata probing, card-pattern recognition, fixed-hardware single-channel defaults, manual model choices and qualified temporal suggestions remain available; video-frame model identification is not claimed.

The isolated restoration candidates demonstrate why this is necessary: clearing the worker environment and applying App Sandbox filesystem/network/process and broker restrictions still allowed a dedicated synthetic parent's environment flag to be read via KERN_PROCARGS2, including a raw syscall. No real credential access or decoder exploit was demonstrated. Restoring OCR requires an independently verified stronger execution boundary and real recognition/immutability regressions; a working decoder or signed helper alone is insufficient. Restoration research remains separate from the 0.1.8 release.

## Data separation

Public schema 1.0 export contains aggregate summaries only. Private paired evidence export contains no literal filenames or paths and remains local unless the owner separately shares it. Gateway payload is independently versioned and strictly allowlisted. Owner-entered labels are untrusted assertions and can still contain identifying text; users must review them. Native measurements describe sampled encoding metadata, not proof of camera identity, capture cadence, continuity or authenticity. Separately marked temporal estimates use bounded whole-inventory adjacency, coverage and paired metadata; they are not measured capture fps or owner-confirmed settings. Automatic setting choices retain suggestedFields provenance through private intake and review. Scanner-reported values are not remotely attested.

## Updates and releases

Official Tauri updater plugin verifies signatures before installing. The unprovisioned placeholder public key disables both check/install commands. There is no unsigned fallback. Public key replacement is a source-reviewed change; PRIVATE signing key and optional password stay in protected release secrets or explicitly authorized protected recovery-signing storage, never source or app resources. Platform signing and updater signing are separate: absence of Apple Developer ID/notarization or Windows Authenticode credentials means Gatekeeper/SmartScreen prompts are expected. Linux updater support is for AppImage, not `.deb`.

CI read-only verification gets no privileged secrets. Only manual protected-main release jobs can access `scanner-release` secrets, using pinned action commits and a draft release. Administrators MUST configure environment required reviewers and main-only deployment policy, protect main, and review the exact source/workflow before approval. No `pull_request_target`, arbitrary-ref release input, self-hosted PR runner, Cloudflare deployment token or untrusted PR secret access is configured. The workflow does not deploy intake or modify the legacy Worker. Supply-chain dependencies are locked; dependency audits and artifact credential-pattern checks are defense in depth, not proof of no vulnerabilities.

## Reporting

Do not attach private card media, raw configs, secrets or user exports to public issues. Report security concerns using https://www.vortexradar.com/security-contact/. Include a minimal synthetic reproduction and affected version.
