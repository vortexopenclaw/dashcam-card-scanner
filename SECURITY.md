# Security and privacy architecture

## Trust boundaries

The renderer is local static HTML/TypeScript, uses textContent rather than HTML interpolation, and has no filesystem, shell, opener, HTTP or updater plugin permissions. CSP permits only local assets and Tauri IPC, not renderer network requests or remote navigation. Custom Rust commands are the narrow privileged boundary. They hold selected source handles/state and exact reviewed payloads; the renderer cannot supply arbitrary read/export paths, endpoints or a replacement upload body. Native dialogs select both source and destination.

The scanner opens source files read-only through capability-relative no-follow operations, skips links/reparse points/nonregular files, reads no configs and has bounded enumeration/probing. Export is a separate operation creating a new file outside the source, never overwriting existing files. The app cannot prevent a hostile local administrator from replacing files, mutating directories or patching the binary; use a stable card and a hardware write blocker for forensics. Source path, OS logs and WebView/application memory on the local computer are not a public data boundary.

No Cloudflare API token, account key, admin credential, shared upload password, signing private key or private endpoint is needed by this app. The endpoint and updater PUBLIC verification key are public configuration, not credentials. Public upload endpoints are inherently discoverable and abusable: CORS and hidden URLs are not authentication. No such claim is made here.

## Opt-in intake

`src-tauri/src/intake.rs` contains a deliberately empty reviewed-origin constant. Browser verification and submission fail closed before any network request when unconfigured. Do not redirect it to the existing unchallenged feedback Worker. The sibling intake service owns abuse protection and review; its origin must be independently deployed/reviewed before provisioning.

The app creates and holds exact UTF-8 JSON bytes, shows them to the owner, computes SHA-256, opens only the compiled HTTPS origin `/challenge#HASH` in the system browser, and accepts a manually pasted, short-lived one-use ticket. Payload data is not placed in the URL. The native client POSTs the exact saved bytes to `/submit`, with that ticket as Bearer authorization and explicit JSON content type, HTTPS-only transport, no redirect following, and a 20-second request timeout. The client accepts only HTTP 202 with the exact matching report hash and `status: pending`. An error or lost response requires a new ticket; the UI clears each ticket on attempted use. Tickets are held only in memory, never preferences/files/logs. Exports do not transmit data.

Server-side Turnstile verification, hash binding, atomic one-use redemption, expiry, body/schema limits, IP quotas, idempotent report-hash dedupe and storage protections are the intake service’s responsibilities, not something an open client can enforce. The service provider sees IP/network metadata. No contact field exists. Evidence remains pending until a maintainer reviews it; automatic database publication is not part of the app. Existing model/new firmware/quality/parking mode/channel combinations must be reconciled in the separate review workflow, not guessed locally.

## Data separation

Public schema 1.0 export contains aggregate summaries only. Private paired evidence export contains no literal filenames or paths and remains local unless the owner separately shares it. Gateway payload is independently versioned and strictly allowlisted. Owner-entered labels are untrusted assertions and can still contain identifying text; users must review them. Native measurements describe samples, not camera identity, capture cadence, continuity or authenticity. Scanner-reported values are not remotely attested.

## Updates and releases

Official Tauri updater plugin verifies signatures before installing. The unprovisioned placeholder public key disables both check/install commands. There is no unsigned fallback. Public key replacement is a source-reviewed change; PRIVATE signing key and optional password exist only in GitHub protected-environment secrets. Platform signing and updater signing are separate: absence of Apple Developer ID/notarization or Windows Authenticode credentials means Gatekeeper/SmartScreen prompts are expected. Linux updater support is for AppImage, not `.deb`.

CI read-only verification gets no privileged secrets. Only manual protected-main release jobs can access `scanner-release` secrets, using pinned action commits and a draft release. Administrators MUST configure environment required reviewers and main-only deployment policy, protect main, and review the exact source/workflow before approval. No `pull_request_target`, arbitrary-ref release input, self-hosted PR runner, Cloudflare deployment token or untrusted PR secret access is configured. The workflow does not deploy intake or modify the legacy Worker. Supply-chain dependencies are locked; dependency audits and artifact credential-pattern checks are defense in depth, not proof of no vulnerabilities.

## Reporting

Do not attach private card media, raw configs, secrets or user exports to public issues. Report security concerns using https://www.vortexradar.com/security-contact/. Include a minimal synthetic reproduction and affected version.
