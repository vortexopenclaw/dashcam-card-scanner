// SPDX-License-Identifier: AGPL-3.0-only
use super::*;

#[test]
fn parking_alignment_is_episode_local_but_missing_parking_still_vetoes() {
    let starts: Vec<_> = (0..16)
        .map(|i| 43200 + if i < 8 { i * 60 } else { 480 + (i - 8) * 600 })
        .collect();
    let mut r = scan(&starts, 60.0, 30.0, &["F", "R"]);
    for entry in &mut r.temporal.entries {
        let name = entry.name.clone();
        let driving =
            timestamp(&name).unwrap().0 < timestamp("2030_0101_120800_000009PF.MP4").unwrap().0;
        let role = if name.ends_with("PF.MP4") { "F" } else { "R" };
        entry.name = format!("REC_20300101_{}_{role}.MP4", &name[10..16]);
        entry.folder = if driving {
            "cont_rec"
        } else {
            "motion_timelapse_rec"
        }
        .into();
    }
    // Independent driving history must not veto aligned parking episodes.
    r.temporal
        .entries
        .retain(|e| !e.name.ends_with("120100_R.MP4"));
    r.temporal.seen -= 1;
    r.metadata_coverage.recognized_files -= 1;
    let e = infer_temporal_parking(&r, Some("thinkware-arc-700"), None, &[]);
    assert_eq!(e.suggestion, Some("time_lapse_like"), "{e:?}");
    assert_eq!(
        e.cohorts
            .iter()
            .filter(|c| c.recording_context == "parking")
            .count(),
        2
    );
    r.temporal
        .entries
        .retain(|e| !e.name.ends_with("121800_R.MP4"));
    r.temporal.seen -= 1;
    r.metadata_coverage.recognized_files -= 1;
    assert_eq!(
        infer_temporal_parking(&r, Some("thinkware-arc-700"), None, &[]).suggestion,
        None
    );
}

#[test]
fn conflicting_parking_episodes_are_not_hidden_by_driving_boundaries() {
    let starts: Vec<_> = (0..24)
        .map(|i| {
            43200
                + if i < 8 {
                    i * 600
                } else if i < 16 {
                    4800 + (i - 8) * 60
                } else {
                    5280 + (i - 16) * 1800
                }
        })
        .collect();
    let mut r = scan(&starts, 60.0, 30.0, &["F"]);
    for entry in &mut r.temporal.entries {
        let seq = timestamp(&entry.name).unwrap().1.unwrap();
        entry.name = format!("REC_20300101_{}_F.MP4", &entry.name[10..16]);
        entry.folder = if (9..=16).contains(&seq) {
            "cont_rec"
        } else {
            "motion_timelapse_rec"
        }
        .into();
    }
    let e = infer_temporal_parking(&r, Some("thinkware-arc-700"), None, &[]);
    assert_eq!(e.suggestion, None);
    let parking: Vec<_> = e
        .cohorts
        .iter()
        .filter(|c| c.recording_context == "parking")
        .collect();
    assert_eq!(parking.len(), 2);
    assert!(parking
        .iter()
        .all(|c| c.suggestion == Some("time_lapse_like")));
    assert_ne!(
        parking[0].estimated_capture_fps,
        parking[1].estimated_capture_fps
    );
}
