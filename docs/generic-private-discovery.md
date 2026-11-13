# Private generic support-file discovery (v1)

`Report.discovery` is independent of recognition, owner labels, and the existing DDPAI adapter. Unknown technical model declarations survive without a retail-catalog match, always with `scope: "unbound"`. Neither main-camera identity nor accessory identity nor present settings are inferred from these declarations. Unsafe OCR stays compile-disabled.

## Reading and coverage

The normal native walker considers **every regular file** (including unfamiliar names, extensions, extensionless files, dot directories and temporary slots). This deliberately broad candidate definition includes media; its counts do not mean all candidates are support files. Existing OS-directory, symlink, offline-placeholder and inventory safety rules still apply. Directory enumeration is sorted for deterministic bounded selection; normal walker inventory limits and cancellation still make overall inventory partial.

Generic inspection caps: 256 file inspections, 4 MiB read bytes, 64 KiB per file, 128 anonymous source descriptors and 128 observations. Oversized files are counted but not opened/read. Reaching read/inspection caps does not stop inventory of remaining candidates. Reason counters count occurrences: one file may contribute several unsafe-value or observation-limit occurrences. Source-descriptor omissions also increment `observation_limit`; fact omissions separately increment `omittedObservations`. A source-cap omission never leaves a dangling observation reference. Model conflict is tracked before truncation with bounded state and remains sticky during 16 KiB intake fitting. Partial walker inventory is disclosed by `coverage.limited` and the normal scan inventory flags; unvisited files are not guessed.

No-follow directory handles originate from the filesystem anchor. Files are no-follow/nonblocking opened, checked regular, and compared before/opened/after/named for identity, size and modification time. Changed reads are discarded; bytes already read remain counted. No archives, executables, decoders, network, OCR, or downloadable parsers are invoked.

## Supported generic syntax (not universal format coverage)

- Strict UTF-8, optional UTF-8 BOM, BOM-marked UTF-16LE/BE. Invalid encoding is rejected, never decoded lossily.
- Bounded JSON with recursive duplicate-key rejection; nested objects/arrays retain separate numeric record context. Whole JSON document observations use document-start line 1; line-framed JSON uses the original line number.
- Sectioned INI and `key=value` / `key:value` text. Section boundaries and duplicate keys advance record context; repeated fields are preserved rather than last-wins collapsed. Section names and unknown parent keys are not retained. Values must match a closed technical field vocabulary and typed value grammar.
- JSON log lines with bounded external framing, including ANSI SGR framing outside JSON only. Generic declarations do not borrow DDPAI's identity semantics.
- JPEG, TAR and ISO BMFF header recognition is structural only; unknown binary and generic XML are explicitly unsupported. XML DTD/entity processing is **not implemented**.

Only anonymous `support-N` IDs, format/encoding/size, recognized canonical technical keys and validated bounded values are serialized. No support paths, hashes, raw keys, raw text, parent/section names, credentials, contact/network/location/device identifiers or arbitrary printable fragments are exported. This is a conservative technical grammar, not authentication of producer-supplied values. Version-shaped declarations cannot establish firmware authenticity or current state.

## Private pipeline

Optional `scan.discovery` survives native report/context cloning, both UI scan assignment paths, explicit review, private detailed exports, native snapshot/IPC, intake validation, stored exact report, and private reviewer output. The UI includes coverage-only results, unsupported reasons, and ambiguity; it never writes generic values into owner fields. Receiver rejects extra keys, unknown enums, invalid technical values, mismatched coverage and dangling source IDs. Legacy envelopes without discovery remain valid. Intake fitting removes facts with explicit retained/omitted counters and only removes sources after no facts remain; conflict is not recomputed from the truncated subset. Anonymous proposals strip discovery recursively (including standalone discovery/observation objects); native public export is an independent aggregate allowlist.

## Evidence and tests

`tests/reference/generic-discovery-synthetic.json` is a portable **synthetic** corpus: BlackVue-style text BIN, Viofo-style INI, Vantrue menu-like INI, unknown paths/extensions, UTF-16, nested and framed JSON. These are not claims about historical vendor formats. The separately retained sanitized DDPAI ANSI fixture remains the actual-structure replay evidence, tested through its proven adapter and generic reader independently.

Native tests exercise encodings, duplicate guards, section records, secrets, binary/XML reasons, unknown locations, symlinks/ancestor links, source mutation, cancellation, resource limits and sticky conflict under both discovery and payload truncation. `tests/generic-discovery-native.test.js` drives a real native scan through editable UI, then sends the exact prepared bytes through local Worker HTTP handling and verifies both receiving stores and reviewer record integrity. No mounted card or remote service is used.
