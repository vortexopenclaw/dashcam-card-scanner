# Parking-recording suggestion contract

The scanner should make useful, editable, confidence-qualified suggestions—not require certainty before helping. A recording-pattern estimate is distinct from a verified manufacturer menu setting, and evidence must remain distinguishable from owner corrections.

## Required evidence and privacy

Use measured playback duration/frame count/fps, anonymous video bitrate/codec/resolution cohorts, and native-private filename recording times and channel roles. Parse only demonstrated brand filename conventions. Do not upload literal recording times, file paths or footage. No additional frame decoding/OCR is needed for ordinary cadence estimation. Keep model/firmware context where known; do not make the owner's model selection native device authority.

Temporal adjacency must come from the full filename inventory, or a bounded contiguous run with tracked coverage—not from representative outgoing samples. Sampling every tenth one-minute clip can falsely mimic accelerated capture. Keep channels separate while calculating intervals, then corroborate aligned events across channels. Preserve complete inventory/header probing when inference budgets are exhausted.

## Patterns and suggestions

- **Continuous-like:** repeated per-channel start intervals approximately equal measured playback durations, allowing timestamp rounding and normal frame-boundary differences. Require multiple consistent adjacent full clips. Corroboration across front/rear/interior/telephoto strengthens confidence. Do not require mathematically zero gaps or assume missing files prove event recording.
- **Likely low-bitrate continuous:** continuous-like timing plus a distinct low video-rate cohort relative to applicable same-model/firmware/codec/resolution driving or verified profile evidence. Bitrate strengthens this conclusion; never use one universal Mbps cutoff. Static-scene variable-bitrate encoding can also be low, so preserve an appropriate confidence ceiling without corroboration. Without rate context, still suggest continuous-like parking rather than Unknown.
- **Likely accelerated/time-lapse:** stable consecutive start intervals substantially longer than playback duration, with a consistent compression ratio across complete clips. Estimate capture fps from actual frame count divided by wall interval; equivalently measured average playback fps * measured playback duration / start interval when metadata is valid. Derive per-channel robust estimates and compare their agreement. Do not assume playback is always30fps. Model-specific native-low-fps time-lapse may require a separate documented rule when playback is not accelerated.
- **Event-like:** irregular noncontiguous bursts and gaps, corroborated across channels and supported by a sufficiently complete inventory. Suggest the event-based family even when exact buffered Auto Event Detection versus low-power impact behavior is not established. Absence of files alone, sparse representative samples, card overwrite and partial scans are not trigger evidence. Known model/firmware markers and reviewed empirical cohorts may strengthen a subtype suggestion.
- **Mixed:** partition changing compression factors, rates, codecs/resolutions, channels and documented filename/folder modes. Surface per-setup suggestions; do not overwrite a whole card with one parking mode when it contains multiple configurations.

## Cadence examples (synthetic arithmetic, not camera measurements)

For measured30fps playback and60seconds playback per complete clip:

- Consecutive starts1800seconds apart imply approximately1fps capture.
- Consecutive starts600seconds apart imply approximately3fps capture.
- Consecutive starts360seconds apart imply approximately5fps capture.

These estimates assume genuinely adjacent full segments and valid filename clocks. A missing intervening clip or sampling stride invalidates that assumption. Exclude last/truncated clips, read/parse failures, transition pairs, outliers and clock-change boundaries. Detect midnight rollover correctly; reduce confidence across ambiguous timezone/DST or clock resets. Unsupported duration or frame metadata must not become a fabricated cadence value.

## User-facing behavior

Prefill adequately supported likely modes/cadence, show a short reason and confidence such as “Likely time-lapse · about3fps, based on consecutive clip timing,” and retain editable choices. Use partial useful information when exact subtype is unresolved. Protect manual edits, including explicit Unknown, during rescans/navigation; source replacement resets them. Do not represent a suggested value as independently verified hardware configuration or silently learn it as an owner-confirmed profile fact. RO/protection and impact trigger remain separate.

## Required regressions

Continuous gap-free sequences; low-rate continuous with changing firmware baselines;1/3/5fps accelerated sequences; native-low-fps documented mode; irregular event bursts; mixed modes; cross-channel loss; missing/intervening files; sample-stride aliasing; truncated/final clips; VFR/unsupported measurements; timestamp rounding; midnight and clock changes; partial/capped inventory; preserved source bytes/mtimes and owner edits. Source-backed deterministic markers and probabilistic pattern evidence must remain distinct.
