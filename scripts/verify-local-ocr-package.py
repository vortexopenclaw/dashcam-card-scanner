#!/usr/bin/env python3
"""Verify sealed macOS 0.1.8 packages exclude the disabled native OCR worker.

Bundle mode follows package-parity checks for app, DMG and updater contents.
This release intentionally uses metadata-only recognition on every platform.
"""
import argparse
from pathlib import Path
import plistlib
import subprocess

MODE = b"metadata_only_security_hold"
parser = argparse.ArgumentParser()
parser.add_argument('app', type=Path, nargs='?')
parser.add_argument('helper', type=Path, nargs='?')
parser.add_argument('--bundle-dir', type=Path)
args = parser.parse_args()
if args.bundle_dir:
    assert args.app is None and args.helper is None
    args.app = args.bundle_dir / 'macos/Dashcam Card Scanner.app'
assert args.app and args.helper is None, 'Pass an app or --bundle-dir; native OCR must be absent'
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(args.app)], check=True)
info = plistlib.loads((args.app / 'Contents/Info.plist').read_bytes())
sealed = plistlib.loads((args.app / 'Contents/_CodeSignature/CodeResources').read_bytes())
assert 'rules2' in sealed and 'files2' in sealed, 'Missing version-2 sealed resources'
details = subprocess.check_output(['codesign', '-d', '--verbose=4', str(args.app)], stderr=subprocess.STDOUT).decode()
assert 'Info.plist entries=' in details and 'not bound' not in details, 'Unbound Info.plist'
executable = args.app / 'Contents/MacOS' / info['CFBundleExecutable']
data = executable.read_bytes()
assert MODE in data, 'Missing compiled metadata-only security mode; refuse OCR-enabled release'
assert not any(p.name in {'model-stamp', 'model-stamp-helper', 'ModelStamp.app'} for p in args.app.rglob('*')), 'Native OCR worker bundled despite security hold'
# Old build output can remain in CI caches. It must never be embedded in this app.
if args.bundle_dir:
    build = args.bundle_dir.parent / 'build'
    candidates = list(build.glob('*/out/model-stamp-helper')) + list(build.glob('*/out/ModelStamp.app/Contents/MacOS/model-stamp'))
    for candidate in candidates:
        assert candidate.read_bytes() not in data, 'Cached native OCR worker embedded despite security hold'
arch = subprocess.check_output(['lipo', '-archs', str(executable)]).decode().strip()
print(f'PASS: sealed {arch} app; metadata-only recognition; native decoder/OCR worker absent')
