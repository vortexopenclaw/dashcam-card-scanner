# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("packaging_verifier", Path(__file__).with_name("verify-macos-packaging.py"))
assert SPEC is not None and SPEC.loader is not None
verifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier)
ROOT = Path(__file__).resolve().parents[1]


class ConfigTests(unittest.TestCase):
    def test_full_bundle_adhoc_signing_is_explicit(self):
        config = json.loads((ROOT / "src-tauri/tauri.conf.json").read_text())
        self.assertEqual(config["bundle"]["macOS"]["signingIdentity"], "-")
        self.assertTrue(config["bundle"]["createUpdaterArtifacts"])

    def test_public_version_is_coherent(self):
        version = json.loads((ROOT / "package.json").read_text())["version"]
        lock = json.loads((ROOT / "package-lock.json").read_text())
        config = json.loads((ROOT / "src-tauri/tauri.conf.json").read_text())
        self.assertRegex(version, r"^\d+\.\d+\.\d+$")
        self.assertEqual(lock["version"], version)
        self.assertEqual(lock["packages"][""]["version"], version)
        self.assertEqual(config["version"], version)
        self.assertIn('name = "dashcam-card-scanner"\nversion = "' + version + '"',
                      (ROOT / "src-tauri/Cargo.toml").read_text())
        self.assertIn('name = "dashcam-card-scanner"\nversion = "' + version + '"',
                      (ROOT / "src-tauri/Cargo.lock").read_text())

    def test_both_workflows_verify_actual_packages(self):
        for workflow in ["release.yml", "verify.yml"]:
            text = (ROOT / ".github/workflows" / workflow).read_text()
            self.assertIn("python3 scripts/verify-macos-packaging.py --bundle-dir", text)
        release = (ROOT / ".github/workflows/release.yml").read_text()
        self.assertIn("releaseDraft: true", release)
        self.assertIn("-F draft=true", release)
        review = (ROOT / ".github/workflows/verify.yml").read_text()
        mac_command = next(line for line in review.splitlines() if "TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' npm run tauri" in line)
        self.assertNotIn("--no-sign", mac_command)
        self.assertNotIn("createUpdaterArtifacts", mac_command)


class ArchiveTests(unittest.TestCase):
    def test_unsafe_archive_entries_rejected(self):
        for name, kind, link in [
            ("../escape", tarfile.REGTYPE, ""),
            ("/absolute", tarfile.REGTYPE, ""),
            (verifier.APP_NAME + "/Contents/escape", tarfile.SYMTYPE, "../../../escape"),
            (verifier.APP_NAME + "/hardlink", tarfile.LNKTYPE, "elsewhere"),
            (verifier.APP_NAME + "/device", tarfile.CHRTYPE, ""),
        ]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / "unsafe.tar.gz"
                with tarfile.open(archive, "w:gz") as tar:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    member.linkname = link
                    tar.addfile(member)
                with self.assertRaises(ValueError):
                    verifier.extract_updater(archive, root / "out")
                self.assertFalse((root / "out").exists())

    def test_regular_archive_preserves_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "safe.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                member = tarfile.TarInfo(verifier.APP_NAME + "/Contents/MacOS/scanner")
                member.mode = 0o755
                member.size = 4
                tar.addfile(member, io.BytesIO(b"test"))
            app = verifier.extract_updater(archive, root / "out")
            self.assertEqual((app / "Contents/MacOS/scanner").read_bytes(), b"test")
            if sys.platform != "win32":
                self.assertEqual((app / "Contents/MacOS/scanner").stat().st_mode & 0o777, 0o755)


@unittest.skipUnless(sys.platform == "darwin", "requires real macOS codesign")
class SignatureTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="scanner-signature-test-")
        self.addCleanup(self.temporary.cleanup)
        self.app = Path(self.temporary.name) / verifier.APP_NAME
        contents = self.app / "Contents"
        (contents / "MacOS").mkdir(parents=True)
        (contents / "Resources").mkdir()
        (contents / "Resources/evidence.txt").write_text("sealed fixture")
        (contents / "Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": "com.vortexradar.cardscanner",
            "CFBundleExecutable": "scanner",
            "CFBundleName": "Dashcam Card Scanner",
            "CFBundlePackageType": "APPL",
            "CFBundleVersion": "1",
        }))
        executable = contents / "MacOS/scanner"
        subprocess.run(["clang", "-x", "c", "-Wl,-adhoc_codesign", "-o", str(executable), "-"],
                       input=b"int main(void) { return 0; }\n", check=True, capture_output=True)

    def sign_bundle(self):
        verifier.run("codesign", "--force", "--sign", "-", self.app)

    def test_executable_only_signing_rejected_full_bundle_passes(self):
        with self.assertRaises(ValueError):
            verifier.verify_app(self.app)
        self.sign_bundle()
        self.assertTrue(verifier.verify_app(self.app))

    def test_tampered_resource_rejected(self):
        self.sign_bundle()
        (self.app / "Contents/Resources/evidence.txt").write_text("tampered")
        with self.assertRaises(ValueError):
            verifier.verify_app(self.app)

    def test_tampered_info_plist_rejected(self):
        self.sign_bundle()
        info = self.app / "Contents/Info.plist"
        data = plistlib.loads(info.read_bytes())
        data["CFBundleVersion"] = "2"
        info.write_bytes(plistlib.dumps(data))
        with self.assertRaises(ValueError):
            verifier.verify_app(self.app)


@unittest.skipUnless(sys.platform == "darwin" and os.environ.get("SCANNER_BROKEN_DMG") and os.environ.get("SCANNER_REPAIRED_DMG"),
                     "optional real downloaded/repaired DMG fixtures not supplied")
class DownloadedArtifactTests(unittest.TestCase):
    def test_old_download_fails_repaired_dmg_passes(self):
        # A distinct inode avoids reattaching the owner's already-mounted image.
        # Bytes remain identical to the exact download and repaired artifact.
        with tempfile.TemporaryDirectory(prefix="scanner-real-dmg-test-") as directory:
            broken = Path(directory) / "broken.dmg"
            repaired = Path(directory) / "repaired.dmg"
            shutil.copyfile(os.environ["SCANNER_BROKEN_DMG"], broken)
            shutil.copyfile(os.environ["SCANNER_REPAIRED_DMG"], repaired)
            with self.assertRaisesRegex(ValueError, "Missing bound Info.plist|codesign failed|Linker-only"):
                verifier.verify_dmg(broken)
            self.assertTrue(verifier.verify_dmg(repaired))


if __name__ == "__main__":
    unittest.main()
