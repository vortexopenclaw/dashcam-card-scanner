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
    let labels = payload::Labels {
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
    };
    let mut review = payload::prepare(&report, &labels).expect("review failed");
    review.payload_hash = intake::hash(review.submission_json.as_bytes());
    println!("{}", serde_json::json!({"report":report,"review":review}));
}
