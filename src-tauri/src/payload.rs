// SPDX-License-Identifier: AGPL-3.0-only
use crate::engine::Report;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Labels {
    pub manufacturer: String,
    pub model: String,
    pub channel_setup: String,
    pub firmware: String,
    pub settings: String,
    pub channel_count: u8,
    pub quality: String,
    pub parking_mode: String,
    pub time_lapse_fps: Option<f64>,
}
impl Labels {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=8).contains(&self.channel_count) {
            return Err("Choose the owner-reported channel count (1–8).".into());
        }
        if !["unknown", "low", "normal", "medium", "high", "maximum"]
            .contains(&self.quality.as_str())
            || ![
                "unknown",
                "off",
                "buffered",
                "time-lapse",
                "low-bitrate",
                "motion",
                "impact",
                "low-power-impact",
            ]
            .contains(&self.parking_mode.as_str())
            || self
                .time_lapse_fps
                .is_some_and(|v| !v.is_finite() || v <= 0. || v > 240.)
        {
            return Err("Invalid owner-reported quality, parking mode or capture cadence.".into());
        }
        for (name, value, max, required) in [
            ("Manufacturer", &self.manufacturer, 100, true),
            ("Model", &self.model, 100, true),
            ("Channel setup", &self.channel_setup, 200, true),
            ("Firmware", &self.firmware, 100, false),
            ("Settings", &self.settings, 600, false),
        ] {
            if (required && value.trim().is_empty())
                || value.chars().count() > max
                || value.chars().any(|c| c.is_control())
            {
                return Err(format!(
                    "{name} is missing, too long, or contains control characters."
                ));
            }
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub token: String,
    pub public_json: String,
    pub submission_json: String,
    pub private_json: String,
    pub payload_hash: String,
    pub warning: String,
}
pub fn prepare(r: &Report, l: &Labels) -> Result<Review, String> {
    l.validate()?;
    if r.cancelled || r.scanned_files == 0 {
        return Err("Finish a nonempty scan before preparing a review.".into());
    }
    let folders:Vec<Value>=r.folders.iter().map(|f|{
        let mut v=json!({"path":f.path,"file_count":f.file_count,"extensions":f.extensions,"filename_patterns":f.filename_shapes.iter().map(|s|json!({"pattern":s,"channel":"unknown"})).collect::<Vec<_>>()});
        if !f.videos.is_empty() {
            let mut summary=json!({});let first=&f.videos[0];
            if f.videos.iter().all(|v|v.codec==first.codec){summary["codec"]=json!(first.codec);}
            if f.videos.iter().all(|v|v.width==first.width && v.height==first.height){summary["resolution"]=json!(format!("{}x{}",first.width,first.height));}
            if let Some(rate)=first.nominal_frame_rate {if (1.0..=240.).contains(&rate) && f.videos.iter().all(|v|v.nominal_frame_rate==Some(rate)){summary["frame_rate"]=json!(rate);}}
            let rates:Vec<_>=f.videos.iter().filter_map(|v|v.video_bitrate).collect();
            if !rates.is_empty(){summary["bitrate_range_mbps"]=json!([rates.iter().copied().fold(f64::INFINITY,f64::min)/1e6,rates.iter().copied().fold(0.,f64::max)/1e6]);}
            v["video_summary"]=summary;
        } v
    }).collect();
    let public = json!({"schema_version":"1.0","camera":{"manufacturer":l.manufacturer.trim(),"model":l.model.trim(),"channel_setup":l.channel_setup.trim(),"firmware":l.firmware.trim()},"evidence":{"kind":"card-validated","notes":"Owner-labeled card scan. Native ISO BMFF metadata samples; no identity inference. Partial/mixed folders may omit non-uniform aggregate fields."},"card_layout":{"folders":folders},"notes":format!("Owner-reported settings: {}. Entries: {}; skipped: {}; bounded/partial: {}; native probes: {}; unavailable/unsupported samples: {}. No ffprobe used. Shapes: N=digit, A=uppercase, a=lowercase, ?=other; not literal filenames.",format!("{}; quality {}; parking {}; channel count {}; capture cadence {:?} fps (owner reported)",l.settings.trim(),l.quality,l.parking_mode,l.channel_count,l.time_lapse_fps),r.entries_seen,r.skipped,r.limited,r.probe_attempts,r.probe_failures)});
    // Existing Worker drops generalized pattern fields. Carry bounded anonymous shapes in message,
    // not fabricated filenameSamples. Persist numeric paired observations in storageRateSamples.
    let mut shapes=String::from("Dashcam Card Scanner: anonymous filename SHAPES (not literal names). N=digit A=uppercase a=lowercase ?=other.\n");
    for f in &r.folders {
        for s in &f.filename_shapes {
            let line = format!("{}: {}\n", f.path, s);
            if shapes.len() + line.len() < 10500 {
                shapes.push_str(&line);
            }
        }
    }
    shapes.push_str(&format!("Native ISO BMFF probes: {}; unavailable: {}; bounded/partial: {}; skipped: {}. Unsupported formats are not probed. No ffprobe used.",r.probe_attempts,r.probe_failures,r.limited,r.skipped));
    let summaries:Vec<Value>=r.folders.iter().flat_map(|f|f.videos.iter().map(|v|json!({"folder":f.path,"fileCount":1,"totalFileSizeBytes":v.file_size_bytes,"minFileSizeBytes":v.file_size_bytes,"maxFileSizeBytes":v.file_size_bytes,"sampleCodecs":[v.codec],"sampleResolutions":[format!("{}x{}",v.width,v.height)],"sampleFrameRates":v.nominal_frame_rate.into_iter().collect::<Vec<_>>(),"sampleBitrateMin":v.video_bitrate,"sampleBitrateMax":v.video_bitrate,"sampleDurationMin":v.duration_seconds,"sampleDurationMax":v.duration_seconds,"storageRateSamples":[v]}))).collect();
    let submission = json!({"kind":"training","message":shapes,"appVersion":format!("card-scanner/{}",env!("CARGO_PKG_VERSION")),"contact":"","training":{"manufacturer":l.manufacturer.trim(),"model":l.model.trim(),"channelSetup":l.channel_setup.trim(),"notes":format!("Owner-reported firmware: {}; owner-reported settings: {}. These labels are not scanner-verified.",l.firmware.trim(),format!("{}; quality {}; parking {}; channel count {}; capture cadence {:?} fps (owner reported)",l.settings.trim(),l.quality,l.parking_mode,l.channel_count,l.time_lapse_fps))},"scan":{"scannedFiles":r.scanned_files,"copyableItems":0,"excludedItems":r.skipped,"directorySummaries":r.folders.iter().map(|f|json!({"path":f.path,"depth":f.depth,"directFileCount":f.file_count,"directTotalFileSizeBytes":f.total_file_size_bytes,"extensionCounts":f.extensions})).collect::<Vec<_>>(),"filenameSamples":[],"videoSpecSummaries":summaries}});
    let (outgoing, reason) = match crate::intake::envelope(r, l) {
        Ok(v) => (v, String::new()),
        Err(e) => (String::new(), format!(" Intake unavailable: {e}")),
    };
    Ok(Review{token:uuid::Uuid::new_v4().to_string(),public_json:serde_json::to_string_pretty(&public).map_err(|_|"JSON encoding failed")?,submission_json:outgoing,private_json:serde_json::to_string_pretty(&submission).map_err(|_|"JSON encoding failed")?,payload_hash:String::new(),warning:format!("Review all owner-entered labels: do not include contacts, serials, GPS, paths or identifiers. Public export is aggregate schema 1.0; private submission contains anonymous paired measurements. The existing Worker retains shapes in the message, not its filenamePatternSummaries. Partial scans are labeled. Sampling is bounded and not representative of every setting/channel. Gateway evidence preserves individual pairs; container bitrate and unmeasured metadata are null. Channel/mode remain unknown; owner settings are separate.{}",reason)})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn enforces_labels_and_nonempty_scan() {
        let l = Labels {
            manufacturer: "VIOFO".into(),
            model: "Test".into(),
            channel_setup: "2CH".into(),
            firmware: "".into(),
            settings: "High".into(),
            channel_count: 2,
            quality: "high".into(),
            parking_mode: "unknown".into(),
            time_lapse_fps: None,
        };
        assert!(prepare(&Report::default(), &l).is_err());
        let r = Report {
            scanned_files: 1,
            ..Default::default()
        };
        assert!(prepare(&r, &l).is_ok());
        let mut bad = l;
        bad.model = "\n".into();
        assert!(prepare(&r, &bad).is_err());
    }
}
