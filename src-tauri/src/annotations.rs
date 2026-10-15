// SPDX-License-Identifier: AGPL-3.0-only
//! Owner configuration assertions stay separate from observations and private contact.
use crate::{
    engine::Report,
    intake,
    payload::{self, Labels, Review},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Annotations {
    #[serde(default)]
    pub cohorts: Vec<Cohort>,
    #[serde(default)]
    pub assignments_required: bool,
    pub contributor: Option<Contributor>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Contributor {
    pub dashcam_talk_username: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Cohort {
    pub id: String,
    pub evidence_indices: Vec<usize>,
    #[serde(default)]
    pub folder_indices: Vec<usize>,
    pub owner: Owner,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Owner {
    pub channel_count: u8,
    pub firmware: Option<String>,
    pub quality: Option<String>,
    pub quality_label: Option<String>,
    pub parking_mode_label: Option<String>,
    pub parking_mode: Option<String>,
    pub time_lapse_fps: Option<f64>,
}
fn valid_label(s: &str, max: usize) -> bool {
    !s.is_empty()
        && s.len() <= max
        && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b" ._-".contains(&c))
}
fn private_username(c: &Contributor) -> Result<&str, String> {
    let s = c.dashcam_talk_username.as_str();
    if !valid_label(s, 40) || !s.as_bytes()[s.len() - 1].is_ascii_alphanumeric() {
        return Err("DashCamTalk username must be 1–40 ASCII letters/numbers, spaces, dot, underscore or hyphen, starting and ending alphanumeric.".into());
    }
    Ok(s)
}
pub fn prepare(r: &Report, l: &Labels, a: &Annotations) -> Result<Review, String> {
    if let Some(c) = &a.contributor {
        private_username(c)?;
    }
    if a.cohorts.len() > 16 {
        return Err("At most 16 owner configuration groups are allowed.".into());
    }
    let samples = intake::selected_samples(r);
    let mut ids = BTreeSet::new();
    let mut seen = BTreeSet::new();
    let mut referenced = BTreeSet::new();
    let mut secure = true;
    for c in &a.cohorts {
        if c.id.is_empty()
            || c.id.len() > 32
            || !c.id.as_bytes()[0].is_ascii_alphanumeric()
            || !c
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            || !ids.insert(&c.id)
        {
            return Err("Invalid or duplicate configuration group ID.".into());
        }
        if c.evidence_indices.is_empty() && c.folder_indices.is_empty() {
            return Err("Remove empty configuration groups or assign samples to them.".into());
        }
        let mut folders = BTreeSet::new();
        for i in &c.folder_indices {
            if *i >= r.folders.len() || !folders.insert(i) {
                return Err("Invalid or duplicate group folder reference.".into());
            }
            referenced.insert(*i);
        }
        for i in &c.evidence_indices {
            if *i >= samples.len() || !seen.insert(*i) {
                return Err("Each sample can belong to exactly one configuration group.".into());
            }
        }
        let o = &c.owner;
        payload::setting_label(o.quality.as_deref(), o.quality_label.as_deref())?;
        payload::setting_label(o.parking_mode.as_deref(), o.parking_mode_label.as_deref())?;
        if o.channel_count > 8
            || o.firmware
                .as_ref()
                .is_some_and(|s| !s.is_empty() && !valid_label(s, 32))
            || o.quality.as_ref().is_some_and(|s| {
                ![
                    "unknown", "low", "normal", "medium", "high", "maximum", "extreme", "other",
                ]
                .contains(&s.as_str())
            })
            || o.parking_mode.as_ref().is_some_and(|s| {
                ![
                    "unknown",
                    "off",
                    "buffered",
                    "time-lapse",
                    "low-bitrate",
                    "motion",
                    "impact",
                    "low-power-impact",
                    "radar",
                    "other",
                ]
                .contains(&s.as_str())
            })
            || o.time_lapse_fps
                .is_some_and(|v| !v.is_finite() || v <= 0. || v > 240.)
        {
            return Err("Invalid configuration setting or owner capture cadence.".into());
        }
        secure &= o.channel_count > 0;
    }
    let grouped = !a.cohorts.is_empty() || a.assignments_required;
    secure &= !grouped || (seen.len() == samples.len() && !a.cohorts.is_empty());
    if grouped && samples.is_empty() {
        secure &= referenced.len() == r.folders.len();
    }
    let mut base = l.clone();
    if grouped {
        base.channel_count = a
            .cohorts
            .iter()
            .map(|c| c.owner.channel_count)
            .max()
            .unwrap_or(1)
            .max(1);
        base.channel_setup = "Mixed/owner-grouped; see numbered configuration assertions".into();
        base.firmware.clear();
        base.settings = "No whole-card setting asserted".into();
        base.quality_label = None;
        base.parking_mode_label = None;
        base.quality = "unknown".into();
        base.parking_mode = "unknown".into();
        base.time_lapse_fps = None;
    }
    let mut review = payload::prepare(r, &base)?;
    if grouped {
        let group_text = serde_json::to_string(&a.cohorts).map_err(|_| "Group encoding failed")?;
        let unassigned: Vec<_> = (0..samples.len()).filter(|i| !seen.contains(i)).collect();
        let note=format!(" Owner-reported configuration groups (channelCount 0 means unknown, never measured): {group_text}. Unassigned sample indices: {unassigned:?}. Membership references the bounded secure-intake sample order, not the entire card. Shared fallback settings do not apply to these groups.");
        let mut public: Value =
            serde_json::from_str(&review.public_json).map_err(|_| "Review encoding failed")?;
        let inventory = public["notes"]
            .as_str()
            .unwrap_or("")
            .split_once("Entries:")
            .map(|(_, rest)| format!("Entries:{rest}"))
            .unwrap_or_default();
        let public_notes = format!("No whole-card configuration asserted. {inventory}{note}");
        public["notes"] = json!(if public_notes.chars().count() <= 2000 {
            public_notes
        } else {
            format!("No whole-card configuration asserted. {inventory} Full numbered owner configuration annotations exceed the public aggregate format's note limit. They are retained in the detailed local report and, if valid, the exact private-submission preview; no partial configuration labels are substituted here.")
        });
        review.public_json =
            serde_json::to_string_pretty(&public).map_err(|_| "Review encoding failed")?;
        let mut private: Value =
            serde_json::from_str(&review.private_json).map_err(|_| "Review encoding failed")?;
        private["training"]["notes"] = json!(note);
        review.private_json =
            serde_json::to_string_pretty(&private).map_err(|_| "Review encoding failed")?;
    }
    if !secure {
        review.submission_json.clear();
        review.warning.push_str(" Private intake unavailable: assign every selected sample exactly once and confirm each group's channel count; unknown/unassigned settings remain local. No whole-card settings have been inferred.");
    }
    if !review.submission_json.is_empty() {
        let mut body: Value =
            serde_json::from_str(&review.submission_json).map_err(|_| "Intake encoding failed")?;
        if !a.cohorts.is_empty() {
            let cohorts: Vec<_> = a.cohorts.iter().map(|c| {
                let mut owner = json!({"channelCount":c.owner.channel_count});
                if let Some(s) = &c.owner.firmware {
                    if !s.is_empty() { owner["firmware"] = json!(s); }
                }
                if let Some(s) = &c.owner.quality_label { owner["qualityLabel"] = json!(s); }
                if let Some(s) = &c.owner.parking_mode_label { owner["parkingModeLabel"] = json!(s); }
                if let Some(s) = &c.owner.quality { owner["quality"] = json!(s); }
                if let Some(s) = &c.owner.parking_mode { owner["parkingMode"] = json!(s); }
                if let Some(v) = c.owner.time_lapse_fps { owner["timeLapseFps"] = json!(v); }
                json!({"id":c.id,"evidenceIndices":c.evidence_indices,"folderIndices":c.folder_indices,"owner":owner})
            }).collect();
            body["cohorts"] = json!(cohorts);
        }
        if let Some(c) = &a.contributor {
            body["contributor"] = json!({"dashcamTalkUsername":private_username(c)?});
        }
        let bytes = serde_json::to_string(&body).map_err(|_| "Intake encoding failed")?;
        if bytes.len() > 16384 {
            review.submission_json.clear();
            review
                .warning
                .push_str(" Complete grouped payload exceeds 16 KiB; export locally instead.");
        } else {
            review.submission_json = bytes;
        }
    }
    review.warning.push_str(" Protection status and parking subtype are independent. Filename suffixes are observable tokens only; no universal channel/model mapping is assumed. Capture cadence is owner-reported, not video playback fps. Contributor, if opted in, appears only in the secure-intake preview, never either local export.");
    Ok(review)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Report, Labels, Annotations) {
        let video = crate::video::Video {
            file_size_bytes: 1000,
            duration_seconds: 60.,
            codec: "h264".into(),
            width: 1920,
            height: 1080,
            nominal_frame_rate: Some(30.),
            video_bitrate: Some(120000.),
        };
        let folder = crate::engine::Folder {
            path: "DCIM/Movie".into(),
            file_count: 2,
            extensions: std::collections::BTreeMap::from([("MP4".into(), 2)]),
            samples: (0..2)
                .map(|i| crate::engine::Sample {
                    file_size_bytes: 1000,
                    video: Some(video.clone()),
                    local_name: format!("PRIVATE-20261015-{i}.MP4"),
                    filename_template: "unknown".into(),
                })
                .collect(),
            videos: vec![video.clone(), video],
            ..Default::default()
        };
        let r = Report {
            scanned_files: 2,
            sampled_files: 2,
            probe_attempts: 2,
            folders: vec![folder],
            ..Default::default()
        };
        let l:Labels=serde_json::from_value(json!({"manufacturer":"VIOFO","model":"Owner model","channelSetup":"DO NOT INHERIT","firmware":"old","settings":"DO NOT INHERIT","channelCount":8,"quality":"maximum","parkingMode":"impact","timeLapseFps":10})).unwrap();
        let a:Annotations=serde_json::from_value(json!({"assignmentsRequired":true,"contributor":{"dashcamTalkUsername":"PrivateTester"},"cohorts":[{"id":"1","evidenceIndices":[0],"folderIndices":[0],"owner":{"channelCount":2,"firmware":"1.0","quality":"high","parkingMode":"time-lapse","timeLapseFps":1}},{"id":"2","evidenceIndices":[1],"folderIndices":[0],"owner":{"channelCount":3,"parkingMode":"low-bitrate"}}]})).unwrap();
        (r, l, a)
    }
    #[test]
    fn ordinary_single_configuration_needs_no_assignments() {
        let (r, mut l, _) = fixture();
        l.quality = "extreme".into();
        l.quality_label = Some("Extreme".into());
        l.parking_mode = "radar".into();
        l.parking_mode_label = Some("Radar Parking".into());
        let a: Annotations = serde_json::from_value(json!({"cohorts":[]})).unwrap();
        let review = prepare(&r, &l, &a).unwrap();
        let body: Value = serde_json::from_str(&review.submission_json).unwrap();
        assert!(body.get("cohorts").is_none());
        assert_eq!(body["owner"]["qualityLabel"], "Extreme");
        assert_eq!(body["owner"]["parkingModeLabel"], "Radar Parking");
        assert_eq!(body["owner"]["channelCount"], 8);
        assert_eq!(body["evidence"][0]["fps"], 30.);
        println!("APP_SINGLE_CONTRACT:{}", review.submission_json);
        assert!(review.public_json.contains("Radar Parking"));
        assert!(review.private_json.contains("Extreme"));
    }
    #[test]
    fn branded_group_settings_are_explicit_and_not_inherited() {
        let (r, mut l, mut a) = fixture();
        l.quality_label = Some("GLOBAL MUST NOT INHERIT".into());
        l.parking_mode_label = Some("GLOBAL MUST NOT INHERIT".into());
        a.cohorts[0].owner.quality = Some("other".into());
        assert!(prepare(&r, &l, &a).is_err());
        a.cohorts[0].owner.quality_label = Some("Brand Custom+".into());
        a.cohorts[0].owner.parking_mode = Some("other".into());
        a.cohorts[0].owner.parking_mode_label = Some("Auto Event Detection".into());
        let review = prepare(&r, &l, &a).unwrap();
        let body: Value = serde_json::from_str(&review.submission_json).unwrap();
        assert_eq!(body["cohorts"][0]["owner"]["qualityLabel"], "Brand Custom+");
        assert!(body["cohorts"][1]["owner"].get("qualityLabel").is_none());
        for s in [
            &review.submission_json,
            &review.public_json,
            &review.private_json,
        ] {
            assert!(!s.contains("GLOBAL MUST NOT INHERIT"));
        }
    }
    #[test]
    fn setting_labels_reject_contacts_injection_and_unbounded_text() {
        for text in [
            "",
            " ",
            " email@example.com",
            "email@example.com",
            "https://example.com",
            "<script>",
            "line\nbreak",
            "Unicodeé",
        ] {
            assert!(
                payload::setting_label(Some("other"), Some(text)).is_err(),
                "{text}"
            );
        }
        assert!(payload::setting_label(Some("other"), Some(&"A".repeat(81))).is_err());
        assert!(payload::setting_label(Some("other"), Some("Brand (A-B)_+&/ 2")).is_ok());
    }
    #[test]
    fn mixed_fixture_emits_contract() {
        let (r, l, a) = fixture();
        let review = prepare(&r, &l, &a).unwrap();
        let body: Value = serde_json::from_str(&review.submission_json).unwrap();
        assert_eq!(body["cohorts"][0]["owner"]["channelCount"], 2);
        assert_eq!(body["cohorts"][1]["owner"]["channelCount"], 3);
        assert_eq!(body["cohorts"][0]["owner"]["timeLapseFps"], 1.);
        assert_eq!(body["evidence"][0]["fps"], 30.);
        assert_eq!(body["evidence"][0]["mode"], "unknown");
        assert_eq!(body["evidence"][0]["channel"], "unknown");
        assert!(body["cohorts"][1]["owner"].get("quality").is_none());
        assert!(!review.public_json.contains("PrivateTester"));
        assert!(!review.private_json.contains("PrivateTester"));
        assert!(!review.public_json.contains("DO NOT INHERIT"));
        assert!(!review.public_json.contains("channel count 3"));
        for text in [
            &review.public_json,
            &review.private_json,
            &review.submission_json,
        ] {
            assert!(!text.contains("PRIVATE-20261015"));
        }
        println!("APP_CONTRACT:{}", review.submission_json);
        let public: Value = serde_json::from_str(&review.public_json).unwrap();
        println!("APP_PUBLIC:{}", public);
    }
    #[test]
    fn public_aggregate_note_limit_never_silently_truncates_group_assertions() {
        let (r, l, mut a) = fixture();
        let template = a.cohorts[0].clone();
        a.cohorts = (0..16)
            .map(|i| {
                let mut c = template.clone();
                c.id = (i + 1).to_string();
                c.evidence_indices = if i < 2 { vec![i] } else { vec![] };
                c
            })
            .collect();
        let review = prepare(&r, &l, &a).unwrap();
        let public: Value = serde_json::from_str(&review.public_json).unwrap();
        let notes = public["notes"].as_str().unwrap();
        assert!(notes.chars().count() <= 2000);
        assert!(notes.contains("exceed the public aggregate"));
        assert!(review.private_json.contains("\\\"id\\\":\\\"16\\\""));
    }
    #[test]
    fn rejects_overlap_and_invalid_group_references() {
        let (r, l, mut a) = fixture();
        a.cohorts[1].evidence_indices = vec![0];
        assert!(prepare(&r, &l, &a).is_err());
        a.cohorts[1].evidence_indices = vec![5];
        assert!(prepare(&r, &l, &a).is_err());
        a.cohorts[1].evidence_indices = vec![1];
        a.cohorts[1].folder_indices = vec![5];
        assert!(prepare(&r, &l, &a).is_err());
    }
    #[test]
    fn unknown_and_unassigned_stay_local_without_whole_card_inheritance() {
        let (r, l, mut a) = fixture();
        a.cohorts[1].owner.channel_count = 0;
        let review = prepare(&r, &l, &a).unwrap();
        assert!(review.submission_json.is_empty());
        assert!(review
            .public_json
            .contains("No whole-card configuration asserted"));
        a.cohorts.pop();
        let review = prepare(&r, &l, &a).unwrap();
        assert!(review.submission_json.is_empty());
        assert!(review
            .public_json
            .contains("Unassigned sample indices: [1]"));
        a.cohorts.clear();
        assert!(prepare(&r, &l, &a).unwrap().submission_json.is_empty());
    }
    #[test]
    fn contributor_is_opt_in_and_strictly_bounded() {
        let (r, l, mut a) = fixture();
        a.contributor = None;
        assert!(!prepare(&r, &l, &a)
            .unwrap()
            .submission_json
            .contains("contributor"));
        for name in [
            "",
            "https://example.org",
            "person@example.org",
            "trailing-",
            " leading",
            "private\nname",
        ] {
            a.contributor = Some(Contributor {
                dashcam_talk_username: name.into(),
            });
            assert!(prepare(&r, &l, &a).is_err(), "{name}");
        }
    }
}
