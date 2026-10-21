# GTK3 dependency security backports

These are **upstream-version-preserving local forks**, not new upstream releases.
Keep their MIT licenses and `.cargo_vcs_info.json`. `Cargo.toml.orig` is the
unmodified published source manifest; Cargo builds the patched normalized manifest.

## Why this graph exists

On `x86_64-unknown-linux-gnu`, Tauri 2.12.4's Wry runtime requires GTK3 0.18.2
and WebKit2GTK 2.0.2; Tao, Muda, the GTK dialog default feature, and the WebKit
bindings also reach GLib 0.18.5. Disabling only dialog's GTK feature does **not**
remove GTK/GLib from the runtime graph. Tauri's `wry` and `x11` defaults, GTK
`v3_24`, and WebKit `v2_40` are active. Do not disable the application runtime
just to eliminate an audit finding. GLib >=0.20 is a different binding API and
cannot simply replace 0.18 in this graph.

Both `glib-macros 0.18.5` and `gtk3-macros 0.18.2` brought in
`proc-macro-error 1.0.4`. Their removal is real, including the obsolete attribute
backend and syn 1 dependency, not an advisory exemption.

## Changes and provenance

- **glib 0.18.5**: exact two-line fix from gtk-rs/gtk-rs-core PR #1343,
  commit `b5a4071e439bef2b5eea76c3aa25e5ae84839e34` (merge
  `05dff0ee696f9bcd8617cd48c4b812d046d440cb`). Make the variadic C
  out-pointer mutable and pass `&mut p`, never `&p`. Original upstream patch
  is saved as `glib-upstream-fix.patch`.
- **glib-macros 0.18.5 / gtk3-macros 0.18.2**: local compatible migration
  from `proc-macro-error` to the already-present, maintained `syn::Error`
  diagnostics API. Token-producing functions return compile-error tokens;
  parsers propagate `syn::Result`. Preserve the second duplicate-watch error
  using `Error::combine`; wrap expression diagnostics in a block. This is a
  local implementation, **not** a claimed verbatim upstream macro backport.
  Current gtk-rs glib-macros 0.20.12 likewise has no proc-macro-error backend,
  but wholesale substitution changes generated GLib APIs and closure syntax.
- Do **not** substitute `proc-macro-error2 2.0.1`: live RustSec reports
  **RUSTSEC-2026-0173**, also unmaintained. That attempted route was rejected.

Published crate origins:

| Crate | Published VCS revision |
| --- | --- |
| glib 0.18.5 | `42b9caf98e03ded086362d9653ca58fe94dc8658` |
| glib-macros 0.18.5 | `42b9caf98e03ded086362d9653ca58fe94dc8658` |
| gtk3-macros 0.18.2 | `00133512bfc8bbb8e9be59b20e93406c6a3eeb21` (published metadata says dirty) |

`origins.json` pins official crates.io archives by SHA-256. `upstream-files.json`
records every published file we retained (all except Cargo's extraction markers).
`patched-files.json` lists the only changed hashes. `scanner-backports.patch`
is the complete reproducible delta, including normalized manifest changes.

## Audit contract — no false all-clear

RustSec still marks **upstream glib 0.18.5** affected by RUSTSEC-2024-0429;
its published fixed range is >=0.20.0. Cargo-audit omits registry advisory
matching for path crates. Therefore raw cargo-audit's zero warnings after
vendoring are **not** proof of zero outstanding upstream advisories.

Run `python3.12 scripts/audit-dependencies.py` from the repository root:

1. Verify all vendored hashes and their checksum-pinned upstream archives,
   reproduce the complete patch, and inspect actual Linux Cargo metadata.
2. Run strict `cargo-audit audit --deny warnings` against the real build lock.
3. Separately audit a temporary **upstream-version registry projection** of
   the same lock (never used to build). Print the complete JSON report,
   including GLib's advisory. Reject vulnerabilities, configured ignores,
   and any additional warnings. Only the exact source-verified local GLib fix
   is recognized as a code remediation; its upstream-version finding remains
   explicit. Runtime regression CI is independently required.

The earlier updater hardening remains: default features disabled, `rustls-tls`
and `system-proxy` retained, ZIP absent, rustls-webpki 0.103.16 and both roots
crates 1.0.10. No audit ignore configuration was added.

## Verification and platform acceptance

Requires Python >=3.11 (CI pins 3.12), native GLib development libraries and
pkg-config. On macOS, Homebrew GLib is needed for the standalone regressions;
the application itself does not start using GLib on macOS.

```sh
python3.12 scripts/audit-dependencies.py
cargo test --locked --release --manifest-path tests/dependency-regressions/Cargo.toml
python3.12 -m unittest discover -s scripts -p 'test_dependency_*.py' -v
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Observed on Apple Silicon: optimized iterator/enum regressions pass; the same
iterator test linked to **unpatched** GLib 0.18.5 exits 101 with SIGSEGV. All
five advisory-listed methods (`next`, `next_back`, `nth`, `nth_back`, `last`)
are exercised. Compile-fail tests check real GLib and GTK macro diagnostics,
including duplicate-watch locations and invalid variant mode without panic.
Mutation tests reject reverting pointer mutability, fake version bumps, and
reintroducing the obsolete diagnostic dependency.

**Linux is still a separate acceptance requirement**, not established by these
macOS results. `.github/workflows/dependency-security.yml` always runs Ubuntu
22.04 with GLib/GTK3/WebKit2GTK 4.1 development packages, optimized regressions,
a real GTK CompositeTemplate expansion (headless compile), diagnostics,
mutation checks, strict auditing and full application cargo check/test.
Do not call the patch Linux-validated until that job actually passes.

Before shipping, run the existing `Verify desktop builds` workflow with
`all_platforms=true` and retain its Windows NSIS `.exe`, macOS `.app.tar.gz`
and signatures, and Linux bundles. Packaging alone does **not** prove install:
use disposable Windows/macOS environments to verify signature validation and
actual updater installation of NSIS EXE and macOS tar artifacts, plus relaunch.
Removing ZIP must not remove those existing supported install paths. No such
cross-platform install or Linux run was performed on this macOS-only host
(the Docker daemon was unavailable).

## Private reviewer (do not apply automatically)

The separate `review-app` repository needs equivalent patches at its workspace
root manifest (`review-app/src-tauri/Cargo.toml` in today's layout):

```toml
[patch.crates-io]
glib = { path = "../../src-tauri/vendor/glib-0.18.5" }
glib-macros = { path = "../../src-tauri/vendor/glib-macros-0.18.5" }
gtk3-macros = { path = "../../src-tauri/vendor/gtk3-macros-0.18.2" }
```

Then regenerate its **own** lock with `cargo update -p glib -p glib-macros -p
gtk3-macros`, review the exact diff, audit both its real lock and upstream-version
projection, and run its native tests. For a standalone private checkout, copy
the full vendor/provenance bundle inside that repo and adjust paths to local
copies; do not depend on a public sibling at distribution time. Its Mac-only
product scope does not validate Linux. This change does not edit that repo.

Official evidence was retrieved first with lightweight `web_extract` from
rustsec.org and the upstream GitHub PR; archives were verified directly against
static.crates.io. No credentials, authenticated API, push or deployment used.
