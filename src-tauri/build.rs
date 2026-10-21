use std::{env, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=native/ModelStamp.swift");
    println!("cargo:rerun-if-env-changed=SCANNER_DISABLE_NATIVE_OCR");
    println!("cargo:rustc-check-cfg=cfg(scanner_no_native_ocr)");
    let disabled = env::var("SCANNER_DISABLE_NATIVE_OCR").as_deref() == Ok("1");
    if disabled {
        println!("cargo:rustc-cfg=scanner_no_native_ocr");
    }
    if !disabled && env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap();
        let swift_arch = match arch.as_str() {
            "aarch64" => "arm64",
            "x86_64" => "x86_64",
            _ => panic!("Unsupported macOS OCR architecture"),
        };
        let output = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("model-stamp-helper");
        let status = Command::new("xcrun")
            .args(["swiftc", "-parse-as-library", "-O", "-target"])
            .arg(format!("{swift_arch}-apple-macosx11.0"))
            .args(["native/ModelStamp.swift", "-o"])
            .arg(&output)
            .status()
            .expect("macOS OCR requires the Apple Swift compiler at build time");
        assert!(status.success(), "Native OCR helper compilation failed");
        let status = Command::new("codesign")
            .args(["--force", "--sign", "-", "--timestamp=none"])
            .arg(&output)
            .status()
            .expect("codesign required for embedded native OCR helper");
        assert!(status.success(), "Native OCR helper signing failed");
        // Included in the main Mach-O, hence in its signature/sealed bundle and
        // every updater/DMG. No developer paths or runtime Swift invocation.
        println!("cargo:rustc-env=MODEL_STAMP_HELPER={}", output.display());
    }
    tauri_build::build()
}
