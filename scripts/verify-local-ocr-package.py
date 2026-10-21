#!/usr/bin/env python3
"""Verify the sealed macOS app contains the target-native signed OCR worker.

Bundle mode follows the normal package-parity verifier, which has already checked
that build app, mounted DMG app and extracted updater app have identical contents.
"""
import argparse
import hashlib
from pathlib import Path
import plistlib
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('app', type=Path, nargs='?')
parser.add_argument('helper', type=Path, nargs='?')
parser.add_argument('--bundle-dir', type=Path)
args = parser.parse_args()
if args.bundle_dir:
    assert args.app is None and args.helper is None
    args.app = args.bundle_dir / 'macos/Dashcam Card Scanner.app'
    info = plistlib.loads((args.app / 'Contents/Info.plist').read_bytes())
    executable = args.app / 'Contents/MacOS' / info['CFBundleExecutable']
    executable_bytes = executable.read_bytes()
    candidates = sorted((args.bundle_dir.parent / 'build').glob('*/out/model-stamp-helper'))
    matches = [p for p in candidates if executable_bytes.count(p.read_bytes()) == 1]
    assert matches, 'No target-built signed OCR helper matches the packaged executable'
    args.helper = matches[0]
assert args.app and args.helper, 'Pass an app and helper, or --bundle-dir'
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(args.app)], check=True)
subprocess.run(['codesign', '--verify', '--strict', str(args.helper)], check=True)
info = plistlib.loads((args.app / 'Contents/Info.plist').read_bytes())
sealed = plistlib.loads((args.app / 'Contents/_CodeSignature/CodeResources').read_bytes())
assert 'rules2' in sealed and 'files2' in sealed, 'Missing version-2 sealed resources'
details = subprocess.check_output(['codesign', '-d', '--verbose=4', str(args.app)], stderr=subprocess.STDOUT).decode()
assert 'Info.plist entries=' in details and 'not bound' not in details, 'Unbound Info.plist'
executable = args.app / 'Contents/MacOS' / info['CFBundleExecutable']
helper = args.helper.read_bytes()
assert executable.read_bytes().count(helper) == 1, 'Embedded helper missing, duplicated or changed'
app_arch = subprocess.check_output(['lipo', '-archs', str(executable)]).strip()
helper_arch = subprocess.check_output(['lipo', '-archs', str(args.helper)]).strip()
assert helper_arch in app_arch.split(), 'Helper/app target architecture mismatch'
print(f'PASS: sealed app/Info.plist + signed embedded helper, {helper_arch.decode()}, sha256={hashlib.sha256(helper).hexdigest()}')
