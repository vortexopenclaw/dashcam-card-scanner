// SPDX-License-Identifier: AGPL-3.0-only
//! Developer-only probe harness; not a Tauri command and not included in the app binary.
use scanner::{engine, intake, payload};
use std::{path::Path, sync::atomic::AtomicBool};
fn main() {
    let path = std::env::args_os()
        .nth(1)
        .expect("usage: cargo run --example scan_fixture -- SOURCE");
    let report = engine::scan(Path::new(&path), &AtomicBool::new(false), |_| {})
        .expect("read-only scan failed");
    let z100 = std::env::args().any(|a| a == "--z100");
    let mut labels = payload::Labels {
        manufacturer: "Synthetic".into(),
        model: "Fixture".into(),
        channel_setup: "front + rear".into(),
        firmware: "1.0".into(),
        settings: "synthetic test, not hardware evidence".into(),
        channel_count: 2,
        quality: "high".into(),
        quality_label: None,
        parking_mode: "unknown".into(),
        parking_mode_label: None,
        time_lapse_fps: None,
        suggested_fields: vec![],
    };
    if z100 {
        labels.manufacturer = "DDPAI".into();
        labels.model = scanner::manual_camera::MODEL.into();
        labels.channel_setup = "front + telephoto".into();
    }
    let contextual = scanner::manual_camera::apply(&report, z100);
    let mut review = payload::prepare(&contextual, &labels).expect("review failed");
    review.payload_hash = intake::hash(review.submission_json.as_bytes());
    println!(
        "{}",
        serde_json::json!({"report":report,"cameraRecognition":scanner::recognition::recognize(Path::new(&path),&report).0,"review":review,"genericContext":scanner::manual_camera::preview(&report,false),"mainContext":scanner::manual_camera::preview(&report,true)})
    );
}
