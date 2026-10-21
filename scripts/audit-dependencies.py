#!/usr/bin/env python3
"""Audit registries AND vendored upstream versions; never hide path-crate risk."""

import json
import os
from pathlib import Path

import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    # First enforce real source, resolution, features and provenance. Fail closed.
    subprocess.run([sys.executable, str(ROOT / "scripts/verify-dependency-backports.py"),
                    "--verify-upstream"], check=True)
    audit = os.environ.get("CARGO_AUDIT", "cargo-audit")
    subprocess.run([audit, "audit", "--file", str(ROOT / "src-tauri/Cargo.lock"),
                    "--deny", "warnings"], check=True)

    # cargo-audit does not match path sources. Audit the SAME locked versions
    # as their upstream registry origins as well, solely for advisory discovery.
    # This projection is never used for resolution, compilation or distribution.
    origins = json.loads((ROOT / "src-tauri/vendor/origins.json").read_text())
    lock = (ROOT / "src-tauri/Cargo.lock").read_text()
    for name, origin in origins.items():
        package, version = name.rsplit("-", 1)
        needle = f'name = "{package}"\nversion = "{version}"\n'
        assert lock.count(needle) == 1
        lock = lock.replace(needle, needle + 'source = "registry+https://github.com/rust-lang/crates.io-index"\n'
                            + f'checksum = "{origin["archive_sha256"]}"\n')
    scratch = ROOT / "tests/dependency-regressions/target/tmp"
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="scanner-audit-", dir=scratch) as directory:
        path = Path(directory) / "Cargo.lock"
        path.write_text(lock)
        result = subprocess.run([audit, "audit", "--file", str(path), "--json"], text=True, capture_output=True)
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr)
    report = json.loads(result.stdout)
    print("UPSTREAM-VERSION AUDIT (includes vendored crates; not the build lock):")
    print(json.dumps(report, indent=2))
    assert not report["settings"]["ignore"], "advisory ignores are forbidden"
    assert report["vulnerabilities"]["count"] == 0
    for warnings in report["warnings"].values():
        for warning in warnings:
            # This is a verified code remediation, not a version-range exemption.
            # Any additional warning/advisory fails until actually remediated.
            assert warning["advisory"]["id"] == "RUSTSEC-2024-0429", warning
            assert warning["package"]["name"] == "glib" and warning["package"]["version"] == "0.18.5"
    print("RUSTSEC-2024-0429: upstream version remains affected; exact local two-line backport verified.")
    print("NOT an advisory-DB zero-warning claim. Optimized native regression and Linux CI remain mandatory.")


if __name__ == "__main__":
    main()
