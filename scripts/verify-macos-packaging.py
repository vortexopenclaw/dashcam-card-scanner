#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Verify bundle integrity, not Developer ID trust/notarization or updater signatures.

Read-only DMG inspection; updater archives are extracted only after path/type/size
validation. Never removes quarantine or changes Gatekeeper policy.
"""
import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

APP_NAME = "Dashcam Card Scanner.app"


def run(*args):
    result = subprocess.run([str(a) for a in args], capture_output=True, check=False)
    if result.returncode:
        raise ValueError("{} failed: {}".format(args[0], result.stderr.decode(errors="replace").strip()))
    return result


def verify_app(app):
    app = Path(app)
    if app.is_symlink() or not app.is_dir() or app.name != APP_NAME:
        raise ValueError("Expected real {} bundle: {}".format(APP_NAME, app))
    info = app / "Contents/Info.plist"
    resources = app / "Contents/_CodeSignature/CodeResources"
    if not info.is_file() or not resources.is_file():
        raise ValueError("Missing bound Info.plist or sealed CodeResources: {}".format(app))
    metadata = plistlib.loads(info.read_bytes())
    if metadata.get("CFBundleIdentifier") != "com.vortexradar.cardscanner":
        raise ValueError("Unexpected bundle identifier")
    executable = metadata.get("CFBundleExecutable", "")
    if not executable or Path(executable).name != executable:
        raise ValueError("Invalid CFBundleExecutable")
    if not (app / "Contents/MacOS" / executable).is_file():
        raise ValueError("Missing bundle executable")
    seal = plistlib.loads(resources.read_bytes())
    if not seal.get("files2") or not seal.get("rules2"):
        raise ValueError("Missing version 2 resource seal")
    # Verification validates the actual Info.plist hash and every sealed resource.
    run("codesign", "--verify", "--deep", "--strict", "--verbose=4", app)
    result = run("codesign", "--display", "--verbose=4", app)
    details = (result.stdout + result.stderr).decode(errors="replace")
    if "linker-signed" in details or not re.search(r"Info\.plist entries=\d+", details):
        raise ValueError("Linker-only signature or unbound Info.plist")
    if not re.search(r"Sealed Resources version=2\b", details):
        raise ValueError("Signature has no version 2 resource seal")
    return manifest(app)


def manifest(app):
    result = {}
    root = Path(app).resolve()
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            if not path.resolve().is_relative_to(root):
                raise ValueError("Bundle symlink escapes app: " + relative)
            result[relative] = ("link", os.readlink(path))
        elif path.is_file():
            result[relative] = ("file", hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_mode & 0o777)
        elif not path.is_dir():
            raise ValueError("Unsupported bundle entry: " + relative)
    return result


def extract_updater(archive, destination):
    """Allow only a single app tree; reject traversal, hardlinks and special files."""
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        if len(members) > 50000 or sum(m.size for m in members) > 2 * 1024**3:
            raise ValueError("Updater archive exceeds extraction limits")
        seen = set()
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or not name.parts or name.parts[0] != APP_NAME:
                raise ValueError("Unsafe updater archive path: " + member.name)
            if name in seen:
                raise ValueError("Duplicate updater archive entry: " + member.name)
            seen.add(name)
            if not (member.isdir() or member.isfile() or member.issym()):
                raise ValueError("Unsupported updater archive entry: " + member.name)
            if member.issym():
                target = PurePosixPath(member.linkname)
                resolved = (destination / str(name.parent) / str(target)).resolve()
                if target.is_absolute() or not resolved.is_relative_to(destination / APP_NAME):
                    raise ValueError("Unsafe updater symlink: " + member.name)
        # Never traverse an archive-created symlink, regardless of member ordering.
        links = {PurePosixPath(m.name) for m in members if m.issym()}
        for member in members:
            name = PurePosixPath(member.name)
            if any(parent in links for parent in name.parents):
                raise ValueError("Archive member traverses symlink: " + member.name)
        for member in members:
            path = destination / member.name
            path.parent.mkdir(parents=True, exist_ok=True)
            if member.isdir():
                path.mkdir(exist_ok=True)
            elif member.issym():
                path.symlink_to(member.linkname)
            else:
                source = tar.extractfile(member)
                if source is None:
                    raise ValueError("Missing regular archive data")
                with source, path.open("xb") as target:
                    shutil.copyfileobj(source, target)
                path.chmod(member.mode & 0o777)
    return destination / APP_NAME


def verify_dmg(dmg):
    with tempfile.TemporaryDirectory(prefix="scanner-dmg-") as temporary:
        mount = Path(temporary) / "mount"
        mount.mkdir()
        attached = False
        try:
            run("hdiutil", "attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount, dmg)
            attached = True
            apps = list(mount.glob("*.app"))
            if len(apps) != 1 or apps[0].name != APP_NAME:
                raise ValueError("DMG must contain exactly the expected app")
            return verify_app(apps[0])
        finally:
            if attached:
                run("hdiutil", "detach", mount)


def verify_packages(app, dmg, updater):
    expected = verify_app(app)
    if verify_dmg(dmg) != expected:
        raise ValueError("DMG app differs from build app")
    with tempfile.TemporaryDirectory(prefix="scanner-packaging-") as temporary:
        base = Path(temporary)
        extracted = base / "updater"
        extracted.mkdir()
        if verify_app(extract_updater(updater, extracted)) != expected:
            raise ValueError("Updater app differs from build app")
    print("PASS: build app, read-only DMG app and updater archive have identical, strict-valid bundle signatures and sealed resources.")
    print("NOT a Gatekeeper distribution approval: ad-hoc signing supplies neither Developer ID trust nor notarization.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle-dir", type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("macOS codesign and hdiutil are required")
    root = args.bundle_dir.resolve()
    apps = list((root / "macos").glob("*.app"))
    dmgs = list((root / "dmg").glob("*.dmg"))
    archives = list((root / "macos").glob("*.app.tar.gz"))
    if len(apps) != 1 or len(dmgs) != 1 or len(archives) != 1:
        raise ValueError("Expected exactly one build app, DMG and updater .app.tar.gz in " + str(root))
    verify_packages(apps[0], dmgs[0], archives[0])


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, tarfile.TarError, plistlib.InvalidFileException) as error:
        sys.exit("macOS packaging verification FAILED: " + str(error))
