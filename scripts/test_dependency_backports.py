"""Prove source enforcement rejects reverted patches and dishonest versions."""
import contextlib
import importlib.util
import io
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("backports", ROOT / "scripts/verify-dependency-backports.py")
assert spec is not None and spec.loader is not None
backports = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backports)


class BackportEnforcement(unittest.TestCase):
    def test_checked_in_vendor_passes(self):
        with contextlib.redirect_stdout(io.StringIO()):
            backports.verify_vendor()

    def assert_mutation_rejected(self, file, old, new):
        scratch = ROOT / "tests/dependency-regressions/target/tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as directory:
            vendor = Path(directory) / "vendor"
            shutil.copytree(backports.VENDOR, vendor)
            path = vendor / file
            text = path.read_text()
            self.assertIn(old, text)
            path.write_text(text.replace(old, new, 1))
            with self.assertRaises(AssertionError):
                backports.verify_vendor(vendor)

    def test_reverting_ffi_mutability_fails(self):
        self.assert_mutation_rejected("glib-0.18.5/src/variant_iter.rs", "&mut p,", "&p,")

    def test_fake_version_bump_fails(self):
        self.assert_mutation_rejected("glib-0.18.5/Cargo.toml", 'version = "0.18.5"', 'version = "0.20.0"')

    def test_reintroducing_unmaintained_backend_fails(self):
        self.assert_mutation_rejected("gtk3-macros-0.18.2/Cargo.toml", "[dependencies.proc-macro2]",
                                      '[dependencies.proc-macro-error]\nversion = "1"\n\n[dependencies.proc-macro2]')


if __name__ == "__main__":
    unittest.main()
