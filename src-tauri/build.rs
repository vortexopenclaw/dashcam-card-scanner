fn main() {
    // 0.1.8 security hold: do not compile or embed a media-decoding/OCR worker.
    // Tested macOS App Sandbox policies do not isolate KERN_PROCARGS2 access to
    // another process's environment. This release uses metadata recognition on
    // every platform; no environment variable may re-enable the unsafe worker.
    println!("cargo:rustc-check-cfg=cfg(scanner_no_native_ocr)");
    println!("cargo:rustc-cfg=scanner_no_native_ocr");
    println!("cargo:rustc-env=SCANNER_MODEL_READING_MODE=metadata_only_security_hold");
    tauri_build::build()
}
