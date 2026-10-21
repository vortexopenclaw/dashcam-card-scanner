// SPDX-License-Identifier: AGPL-3.0-only
#[test]
fn release_018_cannot_enable_the_unisolated_native_ocr_worker() {
    const { assert!(cfg!(scanner_no_native_ocr)) };
    assert_eq!(scanner::MODEL_READING_MODE, "metadata_only_security_hold");
}
