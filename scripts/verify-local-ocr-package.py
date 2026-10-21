#!/usr/bin/env python3
"""Verify signed embedded native OCR bytes in every actual macOS package app.

Run separately against build app, readonly-mounted DMG app, and safely extracted
updater app, passing that architecture's OUT_DIR/model-stamp-helper. This helper
is embedded in Mach-O, not an external resource; parity includes its full signature.
"""
import argparse
import hashlib
from pathlib import Path
import plistlib
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("app", type=Path)
parser.add_argument("helper", type=Path)
args = parser.parse_args()
subprocess.run(["codesign", "--verify", "--deep", "--strict", str(args.app)], check=True)
subprocess.run(["codesign", "--verify", "--strict", str(args.helper)], check=True)
info = plistlib.loads((args.app / "Contents/Info.plist").read_bytes())
sealed = plistlib.loads((args.app / "Contents/_CodeSignature/CodeResources").read_bytes())
assert "rules2" in sealed and "files2" in sealed, "Missing version-2 sealed resources"
details = subprocess.check_output(["codesign", "-d", "--verbose=4", str(args.app)], stderr=subprocess.STDOUT).decode()
assert "Info.plist entries=" in details and "not bound" not in details, "Unbound Info.plist"
executable = args.app / "Contents/MacOS" / info["CFBundleExecutable"]
helper = args.helper.read_bytes()
assert executable.read_bytes().count(helper) == 1, "Embedded helper missing, duplicated or changed"
app_arch = subprocess.check_output(["lipo", "-archs", str(executable)]).strip()
helper_arch = subprocess.check_output(["lipo", "-archs", str(args.helper)]).strip()
assert helper_arch in app_arch.split(), "Helper/app target architecture mismatch"
print(f"PASS: sealed app/Info.plist + signed embedded helper, {helper_arch.decode()}, sha256={hashlib.sha256(helper).hexdigest()}")
