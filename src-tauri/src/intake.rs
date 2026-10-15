// SPDX-License-Identifier: AGPL-3.0-only
//! Strict pre-release intake v1: individual nullable samples, bounded complete structure.
use crate::{engine::Report, payload::Labels};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
// Provision only after separate deployment review. No environment-variable endpoint override.
pub const ORIGIN: Option<&str> = None;
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn label(s: &str, max: usize) -> bool {
    !s.is_empty()
        && s.len() <= max
        && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b" ._-".contains(&c))
}
fn media_type(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "mp4" | "mov" | "avi" | "ts" | "mkv" => "video",
        "jpg" | "jpeg" | "png" => "image",
        _ => "other",
    }
}
fn positive(value: Option<f64>, max: f64) -> Option<f64> {
    value.filter(|v| v.is_finite() && *v > 0. && *v <= max)
}
pub fn envelope(r: &Report, l: &Labels) -> Result<String, String> {
    if !label(l.manufacturer.trim(), 64)
        || !label(l.model.trim(), 64)
        || (!l.firmware.trim().is_empty() && !label(l.firmware.trim(), 32))
        || !(1..=8).contains(&l.channel_count)
    {
        return Err("Intake requires ASCII camera labels and 1–8 channels.".into());
    }
    if !["low", "normal", "medium", "high", "maximum", "unknown"].contains(&l.quality.as_str())
        || ![
            "off",
            "buffered",
            "time-lapse",
            "low-bitrate",
            "motion",
            "impact",
            "low-power-impact",
            "unknown",
        ]
        .contains(&l.parking_mode.as_str())
    {
        return Err("Invalid owner setting enum".into());
    }
    if l.time_lapse_fps.is_some() && positive(l.time_lapse_fps, 240.).is_none() {
        return Err("Owner capture cadence must be >0 and <=240 fps.".into());
    }
    if r.cancelled || r.limited || r.folders.is_empty() || r.folders.len() > 32 {
        return Err("Intake requires a complete structural scan of at most 32 folders. Export locally instead.".into());
    }
    let mut folders = Vec::new();
    let mut evidence = Vec::new();
    let mut total_media = 0u64;
    for (index, f) in r.folders.iter().enumerate() {
        let mut counts: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
        for (ext, count) in &f.extensions {
            let known = matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp4"
                    | "mov"
                    | "avi"
                    | "ts"
                    | "mkv"
                    | "jpg"
                    | "jpeg"
                    | "png"
                    | "dat"
                    | "bin"
                    | "txt"
                    | "log"
                    | "nmea"
                    | "srt"
            );
            *counts
                .entry(if known { ext.clone() } else { "unknown".into() })
                .or_default() += count;
        }
        if counts.len() > 16 {
            return Err("Too many extension groups for intake. Export locally.".into());
        }
        let media: u64 = counts
            .iter()
            .filter(|(e, _)| media_type(e) != "other")
            .map(|(_, n)| *n)
            .sum();
        total_media += media;
        let components: Vec<&str> = if f.path == "." {
            vec![]
        } else {
            f.path.split('/').collect()
        };
        folders.push(json!({"components":components,"fileCount":f.file_count,"mediaCount":media,"extensions":counts.iter().map(|(e,n)|json!({"extension":e,"mediaType":media_type(e),"count":n})).collect::<Vec<_>>(),"filenameTemplates":f.filename_templates}));
        for sample in &f.samples {
            if evidence.len() >= 24 {
                break;
            }
            let v = sample.video.as_ref();
            let codec = v
                .map(|v| v.codec.as_str())
                .filter(|c| ["h264", "hevc", "av1", "mjpeg", "mpeg4"].contains(c))
                .unwrap_or("unknown");
            evidence.push(json!({"folderIndex":index,"channel":"unknown","mode":"unknown","width":v.map(|v|v.width).filter(|n|*n>0 && *n<=16384),"height":v.map(|v|v.height).filter(|n|*n>0 && *n<=16384),"fps":positive(v.and_then(|v|v.nominal_frame_rate),240.),"bitrateKbps":positive(v.and_then(|v|v.video_bitrate),1e9).map(|n|n/1000.),"containerBitrateKbps":Value::Null,"sizeBytes":(sample.file_size_bytes>0 && sample.file_size_bytes<=1_000_000_000_000).then_some(sample.file_size_bytes),"durationSeconds":positive(v.map(|v|v.duration_seconds),86400.),"codec":codec}));
        }
    }
    if total_media == 0 {
        return Err(
            "Intake requires positive-media structure. Local export remains available.".into(),
        );
    }
    let mut owner = json!({"manufacturer":l.manufacturer.trim(),"model":l.model.trim(),"channelCount":l.channel_count,"quality":l.quality,"parkingMode":l.parking_mode});
    if !l.firmware.trim().is_empty() {
        owner["firmware"] = json!(l.firmware.trim());
    }
    if let Some(n) = l.time_lapse_fps {
        owner["timeLapseFps"] = json!(n);
    }
    let body=serde_json::to_string(&json!({"schemaVersion":1,"owner":owner,"evidence":evidence,"structure":{"completed":true,"fileCount":r.scanned_files,"mediaCount":total_media,"folders":folders,"observedLayouts":[]}})).map_err(|_|"JSON encoding failed")?;
    if body.len() > 16384 {
        return Err("Complete intake exceeds 16 KiB. Export locally; structural totals are never silently truncated.".into());
    }
    Ok(body)
}
pub fn origin() -> Result<&'static str, String> {
    let s=ORIGIN.ok_or("Secure intake is not provisioned. Export JSON instead; the legacy feedback endpoint is never used for direct submission.")?;
    let u = reqwest::Url::parse(s).map_err(|_| "Invalid intake configuration")?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
    {
        return Err("Invalid intake configuration".into());
    }
    Ok(s.trim_end_matches('/'))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sha256_known_vector() {
        assert_eq!(
            hash(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
    #[test]
    fn disabled_by_default() {
        if ORIGIN.is_none() {
            assert!(origin().is_err());
        }
    }
    #[test]
    fn constrained_labels() {
        assert!(!label("/Users/person", 64));
        assert!(!label("hello@example.com", 64));
        assert!(!label("<script>", 64));
        assert!(label("VIOFO T330W", 64));
    }
}
