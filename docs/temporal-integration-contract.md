# Temporal suggestions and retained evidence integration contract

## Authority and privacy

Temporal suggestions come only from the bounded native whole-inventory collector and validated native recognition context. Owner-selected model strings never create native authority. Keep dates, basenames, source paths, absolute/relative per-file recording starts, GPS and OCR text out of submission and exports. Do not serialize or deserialize TemporalInventory. No extra source walk, probe pass, decoder or network request.

Local scan IPC adds `parkingEvidence` from `mode_evidence::parking_evidence`. UI consumes only its `temporal` family, confidence, reason and optional estimatedCaptureFps, not the broad parking marker as an exact menu setting. Keep deterministic per-file mode/trigger/protection separate. Suggested channel counts retain existing observed-role precedence.

## Owner-choice provenance

Optional `owner.suggestedFields` is a unique array of at most two strings: `parkingMode`, `timeLapseFps`. Absence means legacy/manual assertion, not independently verified truth. UI includes only fields that it automatically populated and that the owner has not explicitly edited. An explicit edit, even to the same value, removes that field's suggested provenance; source replacement resets state, same-source rescan preserves owner edits and provenance. Never mark an automatic estimate owner-confirmed just because Submit was clicked. Grouped reports must not inherit global suggested settings as confirmed assertions; preserve provenance per group if inheriting, or withhold those inherited inferred settings.

The native label type, intake schema, review/accept/proposal consumer and public/legacy export paths must respect this distinction. Keep estimated choices visible privately as estimates, but do not promote them into confirmed public settings or measured capture fps. `ownerConfirmationRequired` stays true in derived evidence. Explicit user Submit still authorizes exact outgoing bytes; no new checkbox or CAPTCHA.

## Strict optional private intake field

Keep schemaVersion1 for legacy compatibility; add optional top-level `temporalEvidence` with reject-unknown-key validation. This is untrusted derived research evidence, not hardware or owner-setting proof.

- `version`: literal1.
- `inventoryComplete`: boolean.
- `temporalLimited`: boolean.
- `cohortCount`: nonnegative bounded integer: total native temporal cohorts before outgoing cap.
- `omittedCohortCount`: integer; together with retained array length must equal cohortCount.
- `ownerConfirmed`: literal false.
- `cohorts`: at most8 entries, prioritize parking context before other measured contexts. Each allows only:
  - `channel`: existing canonical source role or unknown.
  - `recordingContext`: driving/parking/unknown.
  - `suggestion`: null or continuous_like/low_bitrate_continuous_like/time_lapse_like/event_like.
  - `confidence`: normalize the native estimate to low/medium only; never confirmed/high.
  - `reasonCode`: finite reviewed enum; map static native reasons to these codes, never forward arbitrary text. Suggested vocabulary: consistent_adjacent_timing, comparable_lower_bitrate, irregular_correlated_bursts, mixed_or_incomplete, insufficient_evidence.
  - `adjacentPairCount`: nonnegative bounded integer (maximum native cap minus one).
  - `playbackFps`: finite positive <=240 or null if unmeasured.
  - `durationMedianSeconds`: finite positive <=86400 or null.
  - `startIntervalMedianSeconds`: finite positive <=604800 or null.
  - `estimatedCaptureFps`: finite positive <=240 or null, distinct from playback fps.
  - `relativeDrivingBitrate`: finite positive <=100 or null.

No source identity/date/name, raw OCR, free-form reason or label, arbitrary object properties, or exact timestamp arrays. Context association is per native cohort; do not join unrelated representative arrays to manufacture it. Cadence or a family recommendation requires complete, uncapped inventory and at least4 genuine adjacent pairs. Capped/partial evidence may retain honest availability counts but no cadence/family recommendation. Keep channel/representation/firmware baseline safeguards; do not invent baselines.

Preserve the existing16KiB frozen-byte limit. Do not silently drop existing paired measurements to make room for the new field. Bound/truncate the optional derived cohort list with explicit omitted counts; if even the minimal summary cannot fit, omit it with a clear local preparation warning rather than pretending it was retained. Exact-byte receipt hashing and semantic admission include the actual validated optional field without weakening legacy comparisons.

## Required acceptance

Test native generated-media inventory -> real native prepared JSON -> strict validator -> Worker store readback, verifying both paired measurements and derived summaries plus provenance. Test unknown fields, names/dates/paths, NaN/Inf/huge inputs, cap/count inconsistencies, incomplete/capped cadence, and owner-confirmation promotion. Existing legacy clients/reports must remain accepted. New optional fields need verified Worker-first deployment; a new app's local success is not deployed retention. No deployment/release in this integration lane.

Frontend: mixed normal driving + parking cards still offer the coherent parking estimate; show confidence and short reason; preserve manual/Unknown settings across rescan/navigation; reset on source replacement; never map event-like to a specific buffered/impact/motion menu. Time-lapse and baseline-qualified low-bitrate may prefill their supported generic menu values. Generic continuous/event families remain useful visible suggestions when no exact menu option is justified. Offer an explicit manual correction path and keep estimated cadence visibly approximate.
