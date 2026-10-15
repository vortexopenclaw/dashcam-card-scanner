// SPDX-License-Identifier: AGPL-3.0-only
//! Local-only hints. Never attached to the engine report or outgoing payload.
use crate::engine::Report;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, sync::LazyLock};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera {
    pub id: String,
    pub manufacturer: String,
    pub model: String,
    pub channel_count: usize,
    pub channel_setup: String,
    #[serde(skip_serializing, default)]
    patterns: Vec<Pattern>,
    #[serde(skip_serializing, default)]
    folders: Vec<String>,
}
#[derive(Clone, Deserialize)]
struct Pattern {
    pattern: String,
    channel_group: Option<usize>,
    mode_group: Option<usize>,
    #[serde(default)]
    channels: BTreeMap<String, String>,
    #[serde(default)]
    modes: BTreeMap<String, String>,
}
static CATALOG: LazyLock<Vec<Camera>> = LazyLock::new(|| {
    let v: serde_json::Value = serde_json::from_str(include_str!("../assets/camera-catalog.json"))
        .expect("embedded catalog");
    serde_json::from_value(v["cameras"].clone()).expect("embedded camera records")
});
pub fn catalog() -> &'static [Camera] {
    &CATALOG
}
fn normalized(s: &str) -> String {
    s.chars()
        .filter(char::is_ascii_alphanumeric)
        .flat_map(char::to_lowercase)
        .collect()
}
fn pattern_matches(camera: &Camera, name: &str) -> bool {
    name.len() <= 256
        && camera
            .patterns
            .iter()
            .any(|p| regex::Regex::new(&p.pattern).is_ok_and(|r| r.is_match(name)))
}
pub fn sample_hints(camera: &Camera, name: &str) -> (Option<String>, Option<String>) {
    for p in &camera.patterns {
        if name.len() > 256 {
            break;
        }
        let Ok(re) = regex::Regex::new(&p.pattern) else {
            continue;
        };
        let Some(c) = re.captures(name) else { continue };
        let channel = p
            .channel_group
            .and_then(|g| c.get(g))
            .and_then(|v| p.channels.get(v.as_str()))
            .cloned();
        let mode = p
            .mode_group
            .and_then(|g| c.get(g))
            .and_then(|v| p.modes.get(v.as_str()))
            .cloned();
        return (channel, mode);
    }
    (None, None)
}
/// Exact identity needs a model label AND filename/structure corroboration.
/// Shared sibling patterns alone never select an exact model.
pub fn recognize(root: &Path, report: &Report) -> (serde_json::Value, Option<&'static Camera>) {
    let label = normalized(root.file_name().and_then(|s| s.to_str()).unwrap_or(""));
    let candidates: Vec<_> = catalog()
        .iter()
        .filter(|c| {
            let model = normalized(&c.model);
            !model.is_empty()
                && (label == model
                    || label == normalized(&format!("{}{}", c.manufacturer, c.model)))
        })
        .filter(|c| {
            report
                .folders
                .iter()
                .any(|f| c.folders.iter().any(|p| p.eq_ignore_ascii_case(&f.path)))
                && report
                    .folders
                    .iter()
                    .flat_map(|f| &f.samples)
                    .any(|s| pattern_matches(c, &s.local_name))
        })
        .collect();
    if candidates.len() == 1 {
        let c = candidates[0];
        // N4-series filenames are shared: require the observed three-channel specs,
        // not bitrate or a guess from an A/B/C suffix alone.
        let specs_ok = c.id != "vantrue-n4-pro-s"
            || [("A", 3840, 2160), ("B", 1920, 1080), ("C", 2560, 1440)]
                .iter()
                .all(|(token, w, h)| {
                    report.folders.iter().flat_map(|f| &f.samples).any(|s| {
                        s.local_name.ends_with(&format!("_{token}.MP4"))
                            && s.video
                                .as_ref()
                                .is_some_and(|v| v.width == *w && v.height == *h)
                    })
                });
        if specs_ok {
            return (
                serde_json::json!({"manufacturer":c.manufacturer,"model":c.model,"channelCount":c.channel_count,"channelSetup":c.channel_setup,"confidence":"supported","reason":"Model label corroborated by known filename and folder evidence; editable suggestion, not device authentication."}),
                Some(c),
            );
        }
    }
    let families: std::collections::BTreeSet<_> = catalog()
        .iter()
        .filter(|c| {
            report
                .folders
                .iter()
                .flat_map(|f| &f.samples)
                .any(|s| pattern_matches(c, &s.local_name))
        })
        .map(|c| c.manufacturer.as_str())
        .collect();
    let mut value = serde_json::json!({"confidence":"unknown","reason":"No unique model evidence. Shared filename patterns cannot identify an exact model."});
    if families.len() == 1 {
        value["manufacturer"] = serde_json::json!(families.first().unwrap());
        value["confidence"] = serde_json::json!("pattern");
    }
    (value, None)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_is_bounded_and_public() {
        assert_eq!(catalog().len(), 56);
        let text = serde_json::to_string(catalog()).unwrap();
        assert!(!text.contains("/Volumes/") && !text.contains("sourceSha256"));
        for c in catalog() {
            assert!(c.channel_count > 0 && c.channel_count <= 8);
        }
    }
    #[test]
    fn bare_label_never_identifies() {
        let (v, c) = recognize(Path::new("/Volumes/N4 Pro S"), &Report::default());
        assert!(c.is_none());
        assert!(v.get("model").is_none());
    }
    #[test]
    fn n4_exact_requires_label_shape_structure_and_specs() {
        use crate::{
            engine::{Folder, Sample},
            video::Video,
        };
        let mut report = Report::default();
        let mut folder = Folder {
            path: "Normal".into(),
            ..Folder::default()
        };
        for (token, w, h) in [("A", 3840, 2160), ("B", 1920, 1080), ("C", 2560, 1440)] {
            folder.samples.push(Sample {
                local_name: format!("20251211_184930_01110_N_{token}.MP4"),
                video: Some(Video {
                    file_size_bytes: 100,
                    duration_seconds: 1.0,
                    codec: "h264".into(),
                    width: w,
                    height: h,
                    nominal_frame_rate: None,
                    video_bitrate: None,
                }),
                ..Sample::default()
            });
        }
        report.folders.push(folder);
        let (v, c) = recognize(Path::new("/Volumes/N4 Pro S"), &report);
        assert_eq!(c.unwrap().id, "vantrue-n4-pro-s");
        assert_eq!(v["channelCount"], 3);
        let text = serde_json::to_string(&v).unwrap();
        assert!(!text.contains("/Volumes/") && !text.contains("20251211"));
        assert!(recognize(Path::new("/Volumes/Untitled"), &report)
            .1
            .is_none());
        report.folders[0].samples[2].video.as_mut().unwrap().width = 1920;
        assert!(recognize(Path::new("/Volumes/N4 Pro S"), &report)
            .1
            .is_none());
        report.folders[0].samples[0].video = None;
        assert!(recognize(Path::new("/Volumes/N4 Pro S"), &report)
            .1
            .is_none());
    }
    #[test]
    fn n4_roles_are_grounded() {
        let c = catalog()
            .iter()
            .find(|c| c.id == "vantrue-n4-pro-s")
            .unwrap();
        assert_eq!(
            sample_hints(c, "20251211_184930_01110_N_B.MP4"),
            (Some("interior".into()), Some("normal".into()))
        );
        assert_eq!(sample_hints(c, "personal_B.MP4"), (None, None));
    }
}
