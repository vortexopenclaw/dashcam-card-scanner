// SPDX-License-Identifier: AGPL-3.0-only
#[test]
fn release_018_cannot_enable_the_unisolated_native_ocr_worker() {
    const { assert!(cfg!(scanner_no_native_ocr)) };
    assert_eq!(scanner::MODEL_READING_MODE, "metadata_only_security_hold");
}

// Security review: the update manifest (latest.json) is not signed; only the
// artifact is. Without `requireSignedVersion`, a manifest can announce a new
// version while pointing at an older, validly signed build whose signature
// carries no version (rollback to a known-vulnerable release, e.g. pre-0.1.8).
#[test]
fn updater_binds_the_announced_version_to_the_signature_and_never_downgrades() {
    let conf: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let updater: tauri_plugin_updater::Config =
        serde_json::from_value(conf["plugins"]["updater"].clone()).unwrap();
    assert!(
        updater.require_signed_version,
        "plugins.updater.requireSignedVersion must be true"
    );
    assert!(!updater.allow_downgrades);
    assert!(!updater.dangerous_insecure_transport_protocol);
    assert!(!updater.dangerous_accept_invalid_certs);
    assert!(!updater.dangerous_accept_invalid_hostnames);
    assert_eq!(updater.endpoints.len(), 1);
    assert_eq!(updater.endpoints[0].scheme(), "https");
}
