#!/usr/bin/env python3
"""Verify vendored source, actual Linux resolution and preserved updater fixes.

Path crates are not covered by cargo-audit's registry matching. This check is
mandatory alongside strict cargo-audit, never an advisory ignore list.
"""
import hashlib
import difflib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tomllib
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "src-tauri/vendor"


def verify_vendor(vendor=VENDOR):
    upstream = json.loads((vendor / "upstream-files.json").read_text())
    patched = json.loads((vendor / "patched-files.json").read_text())
    for name, record in upstream.items():
        crate = vendor / name
        actual = {str(p.relative_to(crate)) for p in crate.rglob("*") if p.is_file()}
        assert actual == set(record["files"]), f"unexpected/missing vendored files: {name}"
        for file, original_hash in record["files"].items():
            expected = patched.get(f"{name}/{file}", original_hash)
            assert hashlib.sha256((crate / file).read_bytes()).hexdigest() == expected, f"source drift: {name}/{file}"
        package = tomllib.loads((crate / "Cargo.toml").read_text())["package"]
        assert f'{package["name"]}-{package["version"]}' == name, "do not fake patched versions"
        assert (crate / "LICENSE").is_file()
    source = (vendor / "glib-0.18.5/src/variant_iter.rs").read_text()
    assert "let mut p: *mut libc::c_char" in source and "&mut p," in source
    for name in ("glib-macros-0.18.5", "gtk3-macros-0.18.2"):
        assert "proc-macro-error" not in tomllib.loads((vendor / name / "Cargo.toml").read_text())["dependencies"]
        assert all("proc_macro_error" not in p.read_text() for p in (vendor / name / "src").glob("*.rs"))
    print("VERIFIED local backport: RUSTSEC-2024-0429 still covers upstream glib 0.18.5.")
    print("cargo-audit omits path-source advisory matching; this is NOT an advisory-DB all-clear.")


def main():
    verify_vendor()
    if "--verify-upstream" in sys.argv:
        origins = json.loads((VENDOR / "origins.json").read_text())
        upstream = json.loads((VENDOR / "upstream-files.json").read_text())
        differences = []
        for name, origin in origins.items():
            with urllib.request.urlopen(origin["url"], timeout=60) as response:
                archive = response.read()
            assert hashlib.sha256(archive).hexdigest() == origin["archive_sha256"]
            with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
                for file, expected in upstream[name]["files"].items():
                    member = tar.extractfile(f"{name}/{file}")
                    assert member is not None
                    original = member.read()
                    assert hashlib.sha256(original).hexdigest() == expected
                    current = (VENDOR / name / file).read_bytes()
                    if original != current:
                        differences.extend(difflib.unified_diff(
                            original.decode().splitlines(True), current.decode().splitlines(True),
                            fromfile=f"a/{name}/{file}", tofile=f"b/{name}/{file}"))
        assert "".join(differences) == (VENDOR / "scanner-backports.patch").read_text()
        print("Original file provenance verified against checksum-pinned crates.io archives.")
    manifest = ROOT / "src-tauri/Cargo.toml"
    updater = tomllib.loads(manifest.read_text())["dependencies"]["tauri-plugin-updater"]
    assert updater["default-features"] is False
    assert set(updater["features"]) == {"rustls-tls", "system-proxy"}
    metadata = json.loads(subprocess.check_output([
        "cargo", "metadata", "--locked", "--format-version", "1", "--filter-platform",
        "x86_64-unknown-linux-gnu", "--manifest-path", str(manifest)], text=True))
    packages = metadata["packages"]
    assert not {"proc-macro-error", "proc-macro-error2", "proc-macro-error-attr", "proc-macro-error-attr2", "zip"} & {p["name"] for p in packages}
    for name in ("glib-0.18.5", "glib-macros-0.18.5", "gtk3-macros-0.18.2"):
        matches = [p for p in packages if f'{p["name"]}-{p["version"]}' == name]
        assert len(matches) == 1
        assert Path(matches[0]["manifest_path"]).resolve() == (VENDOR / name / "Cargo.toml").resolve()
        assert matches[0]["source"] is None
    for name, version in (("rustls-webpki", "0.103.16"), ("webpki-roots", "1.0.10")):
        assert any(p["name"] == name and p["version"] == version for p in packages)
    print("Linux dependency metadata resolves all three local patches; obsolete diagnostic backends/ZIP absent.")
    print("Native Linux build/tests and GTK macro expansion are separate required checks, not proven by metadata.")


if __name__ == "__main__":
    main()
