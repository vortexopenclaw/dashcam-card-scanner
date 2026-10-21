"""Check real macro diagnostics, including former abort paths, without GTK/display."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "src-tauri/vendor"


class DependencyDiagnostics(unittest.TestCase):
    def check_diagnostic(self, source, expected):
        scratch = ROOT / "tests/dependency-regressions/target/tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="scanner-macro-", dir=scratch) as directory:
            crate = Path(directory)
            (crate / "src").mkdir()
            (crate / "src/lib.rs").write_text(source)
            (crate / "Cargo.toml").write_text(f'''[package]
name = "scanner-invalid-macro"
version = "0.0.0"
edition = "2021"
[dependencies]
glib = "=0.18.5"
gtk3-macros = "=0.18.2"
[target.'cfg(target_os = "linux")'.dependencies]
gtk = "=0.18.2"
[patch.crates-io]
glib = {{ path = "{VENDOR / 'glib-0.18.5'}" }}
glib-macros = {{ path = "{VENDOR / 'glib-macros-0.18.5'}" }}
gtk3-macros = {{ path = "{VENDOR / 'gtk3-macros-0.18.2'}" }}
''')
            env = dict(os.environ)
            env.setdefault("CARGO_TARGET_DIR", str(ROOT / "tests/dependency-regressions/target"))
            result = subprocess.run(["cargo", "check", "--offline", "--manifest-path", str(crate / "Cargo.toml")],
                                    env=env, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertIn(expected, result.stderr, result.stderr[-4000:])
            self.assertNotIn("panicked", result.stderr)

    def test_enum_rejects_struct(self):
        self.check_diagnostic('#[derive(glib::Enum)] struct Invalid;', "only supports enums")

    def test_boxed_requires_type_attribute(self):
        self.check_diagnostic('#[derive(Clone, glib::Boxed)] struct Invalid;', "requires #[boxed_type")

    def test_object_subclass_rejects_non_impl(self):
        self.check_diagnostic('#[glib::object_subclass] struct Invalid;', "This macro should be used on `impl`")

    def test_variant_rejects_invalid_mode_without_panic(self):
        self.check_diagnostic('#[derive(glib::Variant)] #[variant_enum(unknown)] enum Invalid { A }',
                              "unknown type in #[variant_enum]")

    def test_closure_rejects_async(self):
        self.check_diagnostic('fn invalid() { let _ = glib::closure!(async || {}); }', "Async closure not allowed")

    def test_closure_preserves_both_watch_error_locations(self):
        self.check_diagnostic('fn invalid() { let _ = glib::closure!(@watch a, @watch b => move || {}); }',
                              "Previous `@watch` found here")

    def test_gtk_missing_template(self):
        self.check_diagnostic('#[derive(gtk3_macros::CompositeTemplate)] struct Invalid;',
                              "derive(CompositeTemplate) requires #[template(...)]")

    def test_gtk_rejects_enum(self):
        self.check_diagnostic('#[derive(gtk3_macros::CompositeTemplate)] #[template(string = "")] enum Invalid { A }',
                              "only supports structs")


if __name__ == "__main__":
    unittest.main()
