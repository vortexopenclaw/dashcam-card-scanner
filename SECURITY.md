# Security and privacy architecture

## Trust boundaries

The renderer is local static HTML/TypeScript, uses textContent rather than HTML interpolation, and has no filesystem, shell, opener, HTTP or updater plugin permissions. CSP permits only local assets and Tauri IPC, not renderer network requests or remote navigation. Custom Rust commands are the narrow privileged boundary. They hold selected source handles/state and exact reviewed payloads; the renderer cannot supply arbitrary read/export paths, endpoints or a replacement upload body. Native dialogs select both source and destination.

The scanner opens source files read-only through capability-relative no-follow operations, skips links/reparse points/nonregular files, reads no configs and has bounded enumeration/probing. Export is a separate operation creating a new file outside the source, never overwriting existing files. The app cannot prevent a hostile local administrator from replacing files, mutating directories or patching the binary; use a stable card and a hardware write blocker for forensics. Source path, OS logs and WebView/application memory on the local computer are not a public data boundary.

No Cloudflare API token, account key, admin credential, shared upload password, signing private key or private endpoint is needed by this app. The endpoint and updater PUBLIC verification key are public configuration, not credentials. Public upload endpoints are inherently discoverable and abusable: CORS and hidden URLs are not authentication. No such claim is made here.

## Opt-in intake

`src-tauri/src/intake.rs` contains the dedicated reviewed HTTPS intake origin. Submission fails closed when unconfigured. Do not redirect it to the legacy feedback Worker. The separately deployed intake service owns bounded validation, request limits, duplicate detection, private storage, and maintainer review.

An explicit Submit click prepares exact UTF-8 metadata bytes and sends them natively to `/submit-direct`; optional previews expose the outgoing data. There is no CAPTCHA, verification window, shared secret, or ticket in this flow. The native client uses the compiled HTTPS origin, explicit JSON content type, no redirects, and a 20-second timeout. It accepts only HTTP 202 with a bounded receipt matching the exact report hash and `status: pending`. Receipt hashes stay internal except in optional technical details. Local successful hashes/snapshots prevent unchanged repeats within the app session; server transactional dedupe remains authoritative. Retry requires another explicit click. Exports do not transmit data.

The direct service enforces schema/body limits, bounded per-IP/global rates, immutable transactional report-hash dedupe, storage quotas, and a disable switch. Semantically identical reports with different valid JSON whitespace currently consume separate raw-hash storage records; retained capacity has no automatic reclamation. Anonymous quota exhaustion remains an availability risk. These controls do not authenticate contributors or guarantee spam prevention; human verification was deliberately removed for this small project. Legacy challenge/ticket routes remain server-side only for older installed clients. The service provider sees IP/network metadata. No contact field exists. Evidence remains pending until a maintainer reviews it; automatic database publication is not part of the app. Existing model/new firmware/quality/parking mode/channel combinations must be reconciled in the separate review workflow, not guessed locally.

## Local model recognition

On macOS, a signed native OCR helper is embedded in the app executable. A private temporary copy decodes an inherited read-only no-follow-opened media descriptor; it also receives the public catalog and a native-constructed sandbox policy. The child environment is cleared. The current policy denies network access, process execution/forking, selected credential stores, and source-root writes, but is a partial denylist, not complete filesystem isolation. A compromised decoder could still access other readable files or write unblocked locations. Stronger isolation remains an open release-blocking audit finding; do not treat descriptor-only input as an OS-level capability boundary. Bounded AVFoundation frame decoding and bottom-strip Vision OCR return only known catalog indices; raw text/images never enter reports or submissions. Timeouts and cancellation terminate the helper. Source path reopening is avoided, but cooperative bounds cannot guarantee a deadline for blocked kernel I/O. Exact stamps need corroborating card patterns and conflicting identities are rejected. Known single-channel consensus and observed filename roles can suggest channels without asserting an exact model. Windows/Linux currently have metadata recognition only.

## Data separation

Public schema 1.0 export contains aggregate summaries only. Private paired evidence export contains no literal filenames or paths and remains local unless the owner separately shares it. Gateway payload is independently versioned and strictly allowlisted. Owner-entered labels are untrusted assertions and can still contain identifying text; users must review them. Native measurements describe samples, not camera identity, capture cadence, continuity or authenticity. Scanner-reported values are not remotely attested.

## Updates and releases

Official Tauri updater plugin verifies signatures before installing. The unprovisioned placeholder public key disables both check/install commands. There is no unsigned fallback. Public key replacement is a source-reviewed change; PRIVATE signing key and optional password stay in protected release secrets or explicitly authorized protected recovery-signing storage, never source or app resources. Platform signing and updater signing are separate: absence of Apple Developer ID/notarization or Windows Authenticode credentials means Gatekeeper/SmartScreen prompts are expected. Linux updater support is for AppImage, not `.deb`.

CI read-only verification gets no privileged secrets. Only manual protected-main release jobs can access `scanner-release` secrets, using pinned action commits and a draft release. Administrators MUST configure environment required reviewers and main-only deployment policy, protect main, and review the exact source/workflow before approval. No `pull_request_target`, arbitrary-ref release input, self-hosted PR runner, Cloudflare deployment token or untrusted PR secret access is configured. The workflow does not deploy intake or modify the legacy Worker. Supply-chain dependencies are locked; dependency audits and artifact credential-pattern checks are defense in depth, not proof of no vulnerabilities.

## Reporting

Do not attach private card media, raw configs, secrets or user exports to public issues. Report security concerns using https://www.vortexradar.com/security-contact/. Include a minimal synthetic reproduction and affected version.
