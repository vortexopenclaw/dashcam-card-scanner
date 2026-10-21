// SPDX-License-Identifier: AGPL-3.0-only
//! IPC-only editable suggestions. Never attach these fields to exported reports.
//! Identity arguments must come from native recognition, never owner labels/JSON.
use crate::{engine::Report, recognition};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::LazyLock,
};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ObservedChannels {
    pub count: Option<usize>,
    pub setup: Option<String>,
    pub roles: Vec<String>,
    pub confidence: &'static str,
    pub reason: &'static str,
}
struct Rule {
    regex: regex::Regex,
    group: Option<usize>,
    channels: BTreeMap<String, String>,
}
struct Profile {
    id: String,
    roles: BTreeSet<String>,
    rules: Vec<Rule>,
}
static PROFILES: LazyLock<Vec<Profile>> = LazyLock::new(|| {
    let catalog: serde_json::Value =
        serde_json::from_str(include_str!("../assets/camera-catalog.json")).expect("catalog");
    catalog["cameras"]
        .as_array()
        .expect("cameras")
        .iter()
        .map(|c| Profile {
            id: c["id"].as_str().expect("id").into(),
            roles: c["channelSetup"]
                .as_str()
                .unwrap_or("")
                .split(" + ")
                .map(str::to_owned)
                .collect(),
            rules: c["patterns"]
                .as_array()
                .expect("patterns")
                .iter()
                .filter_map(|p| {
                    Some(Rule {
                        regex: regex::Regex::new(p["pattern"].as_str()?).ok()?,
                        group: p["channel_group"].as_u64().map(|v| v as usize),
                        channels: p["channels"]
                            .as_object()
                            .map(|m| {
                                m.iter()
                                    .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.into())))
                                    .collect()
                            })
                            .unwrap_or_default(),
                    })
                })
                .collect(),
        })
        .collect()
});
fn role(value: &str) -> Option<&str> {
    match value {
        "parking_front" => Some("front"),
        "parking_rear" => Some("rear"),
        "parking_interior" => Some("interior"),
        "parking_telephoto" => Some("telephoto"),
        "front" | "rear" | "interior" | "telephoto" | "left" | "right" | "primary"
        | "front_telephoto" | "panoramic_front" | "interior_front" | "interior_rear" => Some(value),
        _ => None,
    }
}
// Only use an explicit canonical role map, or a canonical channel capture whose
// literal direction is also supported by that profile's layout. Numeric tokens
// and arbitrary folder names never establish roles. Missing maps remain unknown.
fn rule_role<'a>(p: &'a Profile, r: &'a Rule, c: &regex::Captures<'_>) -> Option<&'a str> {
    let mapped: BTreeSet<_> = if let Some(g) = r.group {
        c.get(g)
            .and_then(|t| r.channels.get(t.as_str()))
            .and_then(|v| role(v))
            .into_iter()
            .collect()
    } else {
        c.iter()
            .skip(1)
            .flatten()
            .filter_map(|t| r.channels.get(t.as_str()))
            .filter_map(|v| role(v))
            .collect()
    };
    if mapped.len() == 1 {
        return mapped.first().copied();
    }
    if !mapped.is_empty() {
        return None;
    }
    let token = c.get(r.group?)?.as_str();
    let direction = match token {
        "F" | "PF" => "front",
        "R" | "PR" => "rear",
        "I" | "PI" => "interior",
        "T" | "PT" => "telephoto",
        _ => return None,
    };
    p.roles.contains(direction).then_some(direction)
}
#[derive(Default)]
struct Evidence {
    roles: BTreeSet<String>,
    candidates: Option<BTreeSet<String>>,
    ambiguous: bool,
    conflict: bool,
}
impl Evidence {
    fn name(&mut self, name: &str, id: Option<&str>) {
        if name.len() > 256 {
            return;
        }
        let mut candidates = BTreeSet::new();
        let mut roles = BTreeSet::new();
        let mut matched = false;
        for p in PROFILES.iter().filter(|p| id.is_none_or(|id| id == p.id)) {
            for r in &p.rules {
                let Some(c) = r.regex.captures(name) else {
                    continue;
                };
                matched = true;
                candidates.insert(p.id.clone());
                let hint = rule_role(p, r, &c).or_else(|| {
                    (p.id == "viofo-a119m-pro"
                        && name.ends_with(".MP4")
                        && p.roles.len() == 1
                        && p.roles.contains("front"))
                    .then_some("front")
                });
                if let Some(hint) = hint {
                    roles.insert(hint.to_owned());
                } else {
                    self.ambiguous = true;
                }
            }
        }
        if !matched {
            // A validated identity must not conceal known evidence from another
            // camera; unrelated personal filenames are otherwise ignored.
            if id.is_some()
                && PROFILES
                    .iter()
                    .any(|p| p.rules.iter().any(|r| r.regex.is_match(name)))
            {
                self.conflict = true;
            }
            return;
        }
        if roles.len() > 1 {
            self.conflict = true;
        }
        self.roles.extend(roles);
        self.candidates = Some(match self.candidates.take() {
            None => candidates,
            Some(previous) => previous.intersection(&candidates).cloned().collect(),
        });
        if self.candidates.as_ref().is_some_and(BTreeSet::is_empty) {
            self.conflict = true;
        }
    }
}
// These are generalized templates, NOT original basenames. A template is usable
// only when *every* possible sequence length yields the same grounded role.
// SEQUENCE/unknown deliberately stay unresolved: they erase timestamp structure.
fn template_names(template: &str) -> Vec<String> {
    let stems = [
        ("YYYY_MMDD_HHMMSS_SEQUENCE", "2000_0101_120000_", true),
        ("YYYYMMDD_HHMMSS_SEQUENCE", "20000101_120000_", true),
        ("YYYY_MMDD_HHMMSS", "2000_0101_120000", false),
        ("YYYYMMDD_HHMMSS", "20000101_120000", false),
    ];
    for (stem, digits, variable) in stems {
        if let Some(tail) = template.strip_prefix(stem) {
            if tail.len() > 24 {
                return vec![];
            }
            let max = if variable {
                256usize.saturating_sub(digits.len() + tail.len())
            } else {
                1
            };
            return (1..=max)
                .map(|n| {
                    format!(
                        "{digits}{}{tail}",
                        if variable {
                            "0".repeat(n)
                        } else {
                            String::new()
                        }
                    )
                })
                .collect();
        }
    }
    vec![]
}
/// Native-only API. `None` still permits all-candidate channel consensus without
/// model OCR. A known ID restricts evidence, not the count to its supported max.
/// Imported Report JSON cannot supply recognized_camera_id (serde-skipped).
/// Unknown/contradictory evidence returns no prefill rather than a guessed setup.
pub fn observed_channels(report: &Report, validated_native_id: Option<&str>) -> ObservedChannels {
    let id = validated_native_id.or(report.recognized_camera_id.as_deref());
    let empty = |confidence, reason| ObservedChannels {
        count: None,
        setup: None,
        roles: vec![],
        confidence,
        reason,
    };
    if validated_native_id
        .zip(report.recognized_camera_id.as_deref())
        .is_some_and(|(a, b)| a != b)
    {
        return empty(
            "conflicting",
            "Conflicting native camera identities; no channel suggestion.",
        );
    }
    if id.is_some_and(|id| !recognition::catalog().iter().any(|c| c.id == id)) {
        return empty(
            "unknown",
            "Unknown native camera identity; no channel suggestion.",
        );
    }
    let mut evidence = Evidence::default();
    let mut templates = BTreeSet::new();
    for folder in &report.folders {
        for sample in &folder.samples {
            evidence.name(&sample.local_name, id);
            // Native intake consensus remains authoritative for actual samples.
            // Anonymous templates use precompiled catalog rules: invoking the
            // per-sample helper on every generalized witness recompiles regexes.
            let shared =
                crate::intake::sample_hints_for_folder(&sample.local_name, &folder.path, id).0;
            if shared != "unknown" && !evidence.roles.contains(shared) {
                evidence.conflict = true;
            }
        }
        // Fail closed rather than truncate later channel evidence. Check during
        // collection so the exceptional cap also bounds helper allocation.
        for template in folder.filename_templates.iter().chain(
            folder
                .metadata_cohorts
                .iter()
                .filter(|c| c.file_count > 0)
                .map(|c| &c.filename_template),
        ) {
            if template.len() > 256 || (!templates.contains(template) && templates.len() == 4096) {
                return empty(
                    "unknown",
                    "Channel evidence limit reached; confirm the editable setup manually.",
                );
            }
            templates.insert(template.clone());
        }
    }
    for template in templates {
        let names = template_names(&template);
        if names.is_empty() {
            continue;
        }
        let mut inferred = Evidence::default();
        let mut usable = true;
        for name in names {
            let mut one = Evidence::default();
            one.name(&name, id);
            evidence.conflict |= one.conflict;
            evidence.ambiguous |= one.ambiguous;
            if one.roles.len() != 1 || one.ambiguous || one.conflict {
                usable = false;
                break;
            }
            inferred.name(&name, id);
        }
        if usable && !inferred.conflict && inferred.roles.len() == 1 {
            evidence.roles.extend(inferred.roles);
            if let Some(candidates) = inferred.candidates {
                evidence.candidates = Some(match evidence.candidates.take() {
                    Some(previous) => previous.intersection(&candidates).cloned().collect(),
                    None => candidates,
                });
            }
        }
    }
    if evidence.conflict
        || evidence.candidates.as_ref().is_some_and(BTreeSet::is_empty)
        || evidence.roles.len() > 5
    {
        return empty(
            "conflicting",
            "Mixed or contradictory known channel evidence; confirm the editable setup manually.",
        );
    }
    if evidence.ambiguous || evidence.roles.is_empty() {
        return empty("unknown", "Filename evidence does not establish an unambiguous channel setup; owner labels, resolutions and folders are not channel evidence.");
    }
    let roles: Vec<_> = [
        "front",
        "panoramic_front",
        "primary",
        "rear",
        "interior",
        "interior_front",
        "interior_rear",
        "telephoto",
        "front_telephoto",
        "left",
        "right",
    ]
    .into_iter()
    .filter(|r| evidence.roles.contains(*r))
    .map(str::to_owned)
    .collect();
    ObservedChannels { count: Some(roles.len()), setup: Some(roles.join(" + ")), roles, confidence: "observed", reason: "Observed distinct filename roles; editable suggestion, not a configured-channel guarantee. Missing clips can undercount; modes, photos and encoding changes do not add channels." }
}

#[cfg(test)]
#[path = "observed_channels_tests.rs"]
mod tests;
