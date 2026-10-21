// SPDX-License-Identifier: AGPL-3.0-only
//! Bounded ephemeral whole-inventory evidence. No additional filesystem access.
use super::file_mode_evidence;
use crate::{engine::Report, observed_channels, recognition, video::Video};
use serde::Serialize;
use std::{collections::BTreeMap, sync::LazyLock};
const MAX_TEMPORAL: usize = 16_384;
#[derive(Clone, Default, Debug)]
pub struct TemporalInventory {
    entries: Vec<Entry>,
    seen: usize,
    limited: bool,
}
#[derive(Clone, Debug)]
struct Entry {
    name: String,
    folder: String,
    video: Option<Video>,
}
impl TemporalInventory {
    pub(crate) fn names(&self) -> impl Iterator<Item = &str> {
        self.entries.iter().map(|e| e.name.as_str())
    }
    pub(crate) fn complete_for(&self, report: &Report) -> bool {
        !self.limited
            && self.seen > 0
            && self.seen == report.metadata_coverage.recognized_files
            && self.entries.len() == self.seen
    }
    pub(crate) fn record(&mut self, name: &str, folder: &str, video: Option<&Video>) {
        self.seen += 1;
        // Cap private strings as well as entry count. Even rejected/unsupported
        // media counts toward coverage; never pretend sparse retained rows adjacent.
        if self.entries.len() == MAX_TEMPORAL || name.len() > 256 || folder.len() > 256 {
            self.limited = true;
            return;
        }
        self.entries.push(Entry {
            name: name.into(),
            folder: folder.into(),
            video: video.cloned(),
        });
    }
}
/// Explicit measured baseline; callers must supply the matching firmware cohort,
/// not a generic model preset or a historical differently configured unit.
pub struct DrivingBaseline<'a> {
    pub native_id: &'a str,
    /// Canonical source role, never a resolution-derived channel guess.
    pub channel: &'a str,
    /// `original`, `substream`, or `live_event`; alternate encodings never mix.
    pub representation: &'a str,
    pub firmware: &'a str,
    pub codec: &'a str,
    pub width: u32,
    pub height: u32,
    pub playback_fps: f64,
    pub median_video_bitrate: f64,
    pub measured_clips: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemporalCohort {
    pub channel: String,
    pub recording_context: &'static str,
    pub suggestion: Option<&'static str>,
    pub confidence: &'static str,
    pub reason: &'static str,
    pub adjacent_pairs: usize,
    pub estimated_capture_fps: Option<f64>,
    pub measured_playback_fps: f64,
    pub median_start_interval_seconds: Option<f64>,
    pub median_playback_duration_seconds: f64,
    pub relative_driving_bitrate: Option<f64>,
    pub owner_confirmation_required: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemporalParkingEvidence {
    pub suggestion: Option<&'static str>,
    pub estimated_capture_fps: Option<f64>,
    pub confidence: &'static str,
    pub scope: &'static str,
    pub reason: &'static str,
    pub inventory_complete: bool,
    pub temporal_limited: bool,
    pub cohorts: Vec<TemporalCohort>,
}
struct Clip<'a> {
    start: i64,
    seq: Option<u64>,
    entry: &'a Entry,
    context: &'static str,
    representation: &'static str,
}
fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    v[v.len() / 2]
}
// Naive camera wall-clock seconds, not UTC and never serialized. Finite formats
// only; an accepted native catalog filename must corroborate before use.
fn timestamp(name: &str) -> Option<(i64, Option<u64>)> {
    static RE: LazyLock<Vec<regex::Regex>> = LazyLock::new(|| {
        [
        r"^(\d{4})_(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d+)",
        r"^(?:REC_|EVT_|MOT_|PAK_|PAS_|MAN_)?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:_(\d+))?",
        r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(\d+)",
        r"^(?:REC_|EVT_|MOT_|PAK_|MAN_)?(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})",
    ].iter().map(|s| regex::Regex::new(s).unwrap()).collect()
    });
    let c = RE.iter().find_map(|r| r.captures(name))?;
    let n = |i| c.get(i)?.as_str().parse::<i64>().ok();
    let (y, m, d, h, min, s) = (n(1)?, n(2)?, n(3)?, n(4)?, n(5)?, n(6)?);
    let leap = |y: i64| y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    if !(1970..=2100).contains(&y)
        || !(1..=12).contains(&m)
        || !(0..24).contains(&h)
        || !(0..60).contains(&min)
        || !(0..60).contains(&s)
    {
        return None;
    }
    let months = [
        31,
        if leap(y) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if !(1..=months[m as usize - 1]).contains(&d) {
        return None;
    }
    let days: i64 = (1970..y)
        .map(|y| if leap(y) { 366 } else { 365 })
        .sum::<i64>()
        + months[..m as usize - 1].iter().sum::<i64>()
        + d
        - 1;
    Some((
        days * 86400 + h * 3600 + min * 60 + s,
        c.get(7).and_then(|m| m.as_str().parse().ok()),
    ))
}
fn cadence_transition(clips: &[Clip<'_>], i: usize) -> bool {
    if i < 4 || i + 2 >= clips.len() {
        return false;
    }
    if clips[i - 4..i + 3]
        .iter()
        .any(|c| c.context != clips[i].context)
    {
        return false;
    }
    let before: Vec<_> = (i - 3..i)
        .map(|j| (clips[j].start - clips[j - 1].start) as f64)
        .collect();
    let after: Vec<_> = (i..i + 3)
        .map(|j| (clips[j].start - clips[j - 1].start) as f64)
        .collect();
    let a = median(before.clone());
    let b = median(after.clone());
    a > 0.0
        && b > 0.0
        && (a - b).abs() > 0.25 * a.max(b)
        && before.iter().all(|v| (v - a).abs() <= (0.05 * a).max(1.1))
        && after.iter().all(|v| (v - b).abs() <= (0.05 * b).max(1.1))
}
fn rate_transition(clips: &[Clip<'_>], i: usize) -> bool {
    if i < 3 || i + 2 >= clips.len() {
        return false;
    }
    if clips[i - 3..i + 3]
        .iter()
        .any(|c| c.context != clips[i].context)
    {
        return false;
    }
    let values = |range: std::ops::Range<usize>| {
        range
            .map(|j| clips[j].entry.video.as_ref()?.video_bitrate)
            .collect::<Option<Vec<f64>>>()
    };
    let (Some(before), Some(after)) = (values(i - 3..i), values(i..i + 3)) else {
        return false;
    };
    let a = median(before.clone());
    let b = median(after.clone());
    a.is_finite()
        && b.is_finite()
        && a > 0.0
        && b > 0.0
        && a.max(b) / a.min(b) >= 2.5
        && before.iter().all(|v| (v - a).abs() <= a * 0.2)
        && after.iter().all(|v| (v - b).abs() <= b * 0.2)
}
fn config(a: &Clip<'_>, b: &Clip<'_>, final_clip: bool) -> bool {
    let (Some(a_v), Some(b_v)) = (&a.entry.video, &b.entry.video) else {
        return false;
    };
    a.context == b.context
        && a_v.codec == b_v.codec
        && a_v.width == b_v.width
        && a_v.height == b_v.height
        && a_v.nominal_frame_rate == b_v.nominal_frame_rate
        && (final_clip
            || (a_v.duration_seconds - b_v.duration_seconds).abs()
                <= 0.10 * a_v.duration_seconds.max(b_v.duration_seconds))
}
fn cohort(
    run: &[Clip<'_>],
    role: &str,
    id: &str,
    firmware: Option<&str>,
    baselines: &[DrivingBaseline<'_>],
) -> TemporalCohort {
    let v = run[0].entry.video.as_ref().expect("validated video");
    // Last clip has no known following start: omit its duration/rate from estimates.
    let pairs = run.len().saturating_sub(1);
    let durations: Vec<_> = run
        .iter()
        .take(pairs.max(1))
        .map(|c| c.entry.video.as_ref().unwrap().duration_seconds)
        .collect();
    let duration = median(durations.clone());
    let fps = v.nominal_frame_rate.unwrap_or(0.0);
    let mut out = TemporalCohort {
        channel: role.into(),
        recording_context: run[0].context,
        suggestion: None,
        confidence: "insufficient",
        reason: "at_least_four_adjacent_pairs_required",
        adjacent_pairs: pairs,
        estimated_capture_fps: None,
        measured_playback_fps: fps,
        median_start_interval_seconds: None,
        median_playback_duration_seconds: duration,
        relative_driving_bitrate: None,
        owner_confirmation_required: true,
    };
    if pairs < 4 {
        return out;
    }
    let intervals: Vec<_> = run
        .windows(2)
        .map(|p| (p[1].start - p[0].start) as f64)
        .collect();
    let spacing = median(intervals.clone());
    out.median_start_interval_seconds = Some(spacing);
    let tolerance = 1.1f64.max(2.0 / fps.max(1.0));
    if intervals
        .iter()
        .any(|i| *i <= 0.0 || *i > 7200.0 || (*i - duration - 3600.0).abs() <= 2.0)
    {
        out.reason = "clock_jump_duplicate_or_dst_ambiguity";
        return out;
    }
    let continuous = intervals
        .iter()
        .zip(&durations)
        .all(|(i, d)| (i - d).abs() <= tolerance);
    let ratios: Vec<_> = intervals
        .iter()
        .zip(&durations)
        .map(|(i, d)| i / d)
        .collect();
    let ratio = median(ratios.clone());
    let stable = ratios
        .iter()
        .all(|r| (r - ratio).abs() <= (0.05 * ratio).max(tolerance / duration));
    let stable_pairs = ratios
        .iter()
        .filter(|r| (*r - ratio).abs() <= (0.05 * ratio).max(tolerance / duration))
        .count();
    if !stable && stable_pairs >= 4 && stable_pairs * 4 >= pairs * 3 {
        out.reason = "isolated_gap_or_outlier_not_event_recording_proof";
        return out;
    }
    if continuous {
        out.suggestion = Some("continuous_like");
        out.confidence = "likely";
        out.reason =
            "repeated_adjacent_start_intervals_match_playback_duration_not_proof_of_gap_free_media";
        let rates: Vec<_> = run
            .iter()
            .take(pairs)
            .filter_map(|c| c.entry.video.as_ref()?.video_bitrate)
            .filter(|r| r.is_finite() && *r > 0.0)
            .collect();
        if rates.len() == pairs {
            let rate = median(rates.clone());
            let baseline = baselines.iter().find(|b| {
                b.native_id == id
                    && b.channel == role
                    && b.representation == run[0].representation
                    && Some(b.firmware) == firmware
                    && !b.firmware.is_empty()
                    && b.codec == v.codec
                    && b.width == v.width
                    && b.height == v.height
                    && (b.playback_fps - fps).abs() < 0.1
                    && b.measured_clips >= 5
                    && b.median_video_bitrate.is_finite()
                    && b.median_video_bitrate > 0.0
            });
            if let Some(b) = baseline {
                let relative = rate / b.median_video_bitrate;
                // Reject overflow, underflow and unusable extremes before IPC.
                if !relative.is_finite() || !(1e-9..=1e9).contains(&relative) {
                    return out;
                }
                out.relative_driving_bitrate = Some(relative);
                if run[0].context == "parking"
                    && relative <= 0.5
                    && rates.iter().all(|r| (r - rate).abs() <= rate * 0.2)
                {
                    out.suggestion = Some("low_bitrate_continuous_like");
                    out.reason = "continuous_timing_and_stable_lower_rate_than_matching_firmware_encoding_baseline_vbr_scene_remains_alternative";
                }
            }
        }
    } else if ratio >= 2.0 && stable {
        // Parser reports average/nominal playback fps, not a CFR guarantee.
        // Do not estimate cadence for obviously nonstandard/VFR-like averages.
        if [24.0f64, 25.0, 30.0, 50.0, 60.0]
            .iter()
            .any(|f| (fps - f).abs() / f < 0.01)
        {
            out.suggestion = Some("time_lapse_like");
            out.confidence = "likely";
            out.estimated_capture_fps = Some(fps / ratio);
            out.reason =
                "stable_adjacent_wall_clock_compression_factor_capture_estimate_not_owner_setting";
        } else {
            out.reason = "unsupported_or_variable_playback_rate";
        }
    } else if run[0].context == "parking"
        && intervals.iter().all(|i| *i >= duration - tolerance)
        && intervals.iter().any(|i| *i > duration * 2.0)
    {
        out.suggestion = Some("event_like");
        out.confidence = "possible";
        out.reason = "irregular_parking_bursts_trigger_and_power_strategy_unknown_gaps_remain_an_alternative";
    } else {
        out.reason = "mixed_timing_or_unexplained_gaps";
    }
    out
}
/// Only native whole-card entries may establish adjacency. Representative samples,
/// imported reports and partially retained inventories NEVER enter this estimator.
/// Output contains aggregates only; camera-local timestamps remain ephemeral.
pub fn infer_temporal_parking(
    report: &Report,
    validated_native_id: Option<&str>,
    firmware: Option<&str>,
    baselines: &[DrivingBaseline<'_>],
) -> TemporalParkingEvidence {
    let mut out = TemporalParkingEvidence {
        suggestion: None,
        estimated_capture_fps: None,
        confidence: "unknown",
        scope: "likely_recording_behavior_owner_confirmation_required",
        reason: "whole_inventory_adjacency_required",
        inventory_complete: false,
        temporal_limited: report.temporal.limited,
        cohorts: Vec::new(),
    };
    let id = validated_native_id.or(report.recognized_camera_id.as_deref());
    let Some(id) = id.filter(|id| recognition::catalog().iter().any(|c| c.id == *id)) else {
        out.reason = "single_native_identity_required";
        return out;
    };
    if validated_native_id
        .zip(report.recognized_camera_id.as_deref())
        .is_some_and(|(a, b)| a != b)
    {
        out.reason = "conflicting_native_identity";
        return out;
    }
    if !report.inventory_complete
        || report.cancelled
        || report.limited
        || report.temporal.limited
        || report.temporal.seen == 0
        || report.temporal.seen != report.metadata_coverage.recognized_files
        || report.temporal.entries.len() != report.temporal.seen
    {
        return out;
    }
    out.inventory_complete = true;
    let mut channels: BTreeMap<String, Vec<Clip<'_>>> = BTreeMap::new();
    let mut unresolved = false;
    for entry in &report.temporal.entries {
        let Some(role) = observed_channels::sample_role(&entry.name, id) else {
            out.reason = "unresolved_file_cannot_establish_temporal_adjacency";
            return out;
        };
        let Some((start, seq)) = timestamp(&entry.name) else {
            out.reason = "unresolved_timestamp_cannot_establish_temporal_adjacency";
            return out;
        };
        let Some(v) = &entry.video else {
            out.reason = "unmeasured_file_breaks_temporal_adjacency";
            return out;
        };
        if !v.duration_seconds.is_finite()
            || !(0.1..=7200.0).contains(&v.duration_seconds)
            || !v
                .nominal_frame_rate
                .is_some_and(|f| f.is_finite() && (1.0..=240.0).contains(&f))
        {
            out.reason = "unsupported_metadata_breaks_temporal_adjacency";
            return out;
        }
        let context = file_mode_evidence(&entry.name, &entry.folder, Some(id)).context;
        unresolved |= context == "unknown";
        channels.entry(role).or_default().push(Clip {
            start,
            seq,
            entry,
            context,
            representation: if observed_channels::profile_name(&entry.name, id) != entry.name {
                if entry.name.ends_with("S.mp4") {
                    "substream"
                } else {
                    "live_event"
                }
            } else {
                "original"
            },
        });
    }
    // Sort before partitioning by settings: filtering a changing encoding first
    // would manufacture regularly spaced 'adjacency' across intervening clips.
    let mut aligned: Option<Vec<Vec<i64>>> = None;
    let mut alignment_ok = true;
    for (role, clips) in &mut channels {
        // Manufacturer-defined representations, not arbitrary same-time dedup.
        // Prefer originals, then S substreams, then L live-event encodings.
        let primary = ["original", "substream", "live_event"]
            .into_iter()
            .find(|r| clips.iter().any(|c| c.representation == *r))
            .unwrap();
        let primary_starts: std::collections::BTreeSet<_> = clips
            .iter()
            .filter(|c| c.representation == primary)
            .map(|c| (c.start, c.context))
            .collect();
        unresolved |= clips
            .iter()
            .any(|c| !primary_starts.contains(&(c.start, c.context)));
        clips.retain(|c| c.representation == primary);
        clips.sort_by_key(|c| c.start);
        // Align parking episodes only: unrelated driving coverage may differ.
        // Preserve episode breaks so separate parking runs cannot be joined.
        let mut starts: Vec<Vec<i64>> = Vec::new();
        for (i, c) in clips.iter().enumerate() {
            if c.context == "parking" {
                if i == 0 || clips[i - 1].context != "parking" {
                    starts.push(Vec::new());
                }
                starts.last_mut().unwrap().push(c.start);
            }
        }
        if let Some(reference) = &aligned {
            alignment_ok &= starts.len() == reference.len()
                && starts.iter().zip(reference).all(|(a, b)| {
                    a.len() == b.len() && a.iter().zip(b).all(|(a, b)| (a - b).abs() <= 1)
                });
        } else {
            aligned = Some(starts);
        }
        let mut begin = 0;
        for i in 1..=clips.len() {
            let boundary = i == clips.len()
                || !config(&clips[i - 1], &clips[i], i == clips.len() - 1)
                || cadence_transition(clips, i)
                || rate_transition(clips, i)
                || clips[i].start <= clips[i - 1].start
                || clips[i - 1]
                    .seq
                    .zip(clips[i].seq)
                    .is_some_and(|(a, b)| a.checked_add(1) != Some(b));
            if boundary {
                if i < clips.len()
                    && clips[i - 1].context == clips[i].context
                    && clips[i].context != "driving"
                {
                    unresolved = true;
                }
                out.cohorts
                    .push(cohort(&clips[begin..i], role, id, firmware, baselines));
                begin = i;
            }
        }
    }
    let relevant: Vec<_> = out
        .cohorts
        .iter()
        .filter(|c| c.recording_context != "driving")
        .collect();
    let choices: std::collections::BTreeSet<_> =
        relevant.iter().filter_map(|c| c.suggestion).collect();
    let cadence: Vec<_> = relevant
        .iter()
        .filter_map(|c| c.estimated_capture_fps)
        .collect();
    let cadence_agrees = cadence.is_empty()
        || cadence
            .iter()
            .all(|f| (f - cadence[0]).abs() <= 0.05 * cadence[0]);
    // Driving cohorts can coexist with parking, but several distinct parking
    // settings or unexplained boundaries cannot become one whole-card assertion.
    if !unresolved
        && alignment_ok
        && !relevant.is_empty()
        && relevant.iter().all(|c| c.suggestion.is_some())
        && choices.len() == 1
        && cadence_agrees
    {
        out.suggestion = choices.first().copied();
        out.estimated_capture_fps = cadence.first().copied();
        out.confidence = if out.suggestion == Some("event_like") {
            "possible"
        } else {
            "likely"
        };
        out.reason = "coherent_adjacent_parking_cohort_not_hardware_or_configuration_proof";
    } else {
        out.reason = "mixed_incomplete_unaligned_or_unsupported_cohorts_review_individually";
    }
    out
}
#[cfg(test)]
#[path = "mode_temporal_tests.rs"]
mod tests;
