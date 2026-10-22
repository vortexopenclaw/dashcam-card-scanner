# SPDX-License-Identifier: AGPL-3.0-only
"""Exercise generation only in an isolated synthetic tree, never real inputs."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/generate-camera-catalog.py'


class CameraCatalogTests(unittest.TestCase):
    def generate(self, aliases=''):
        # Keep all disposable files inside this worktree's ignored build tree.
        target = ROOT / 'src-tauri/target'
        target.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='catalog-test-', dir=target) as temp:
            root = Path(temp)
            script = root / 'scripts/generate-camera-catalog.py'
            script.parent.mkdir()
            script.write_bytes(SCRIPT.read_bytes())
            native = root / 'native'
            public = root / 'public'
            for source in [native, public]:
                (source / 'profiles').mkdir(parents=True)
            (native / 'profiles/h1.yaml').write_text('''id: vueroid-h1
manufacturer: Vueroid
model: H1 QHD Infinite
channels:
  F: front
folders:
  - path: INF
filename_patterns:
  - pattern: '^SYNTHETIC_[A-Z]\\.mp4$'
detection:
  high_confidence:
    - path: CONFIG/config.bin
      contains: DO_NOT_COPY_CONFIG_DETECTION
''' + aliases)
            for profile in [
                {'id': 'vueroid-h1', 'manufacturer': 'Vueroid', 'model': 'H1 QHD Infinite'},
                {'id': 'synthetic-selector', 'manufacturer': 'Synthetic', 'model': 'Selector'},
            ]:
                (public / 'profiles' / (profile['id'] + '.json')).write_text(json.dumps(profile))
            # Only provenance is stubbed. Parsing/filtering/output execute unchanged.
            with patch('sys.argv', [str(script), str(native), str(public)]), patch(
                'subprocess.check_output', return_value='synthetic-test-commit\n'
            ), contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(script), run_name='__main__')
            return json.loads((root / 'src-tauri/assets/camera-catalog.json').read_text())

    def test_h1_aliases_and_stable_id_dedup_without_config_parsing(self):
        data = self.generate()
        self.assertEqual(len(data['cameras']), 2)
        h1 = next(c for c in data['cameras'] if c['id'] == 'vueroid-h1')
        self.assertEqual(h1['model'], 'H1 QHD Infinite')
        self.assertEqual(h1['aliases'], ['H1', 'H1 QHD'])
        self.assertEqual(h1['channelCount'], 1)
        self.assertNotIn('selectorOnly', h1)
        self.assertEqual(len(h1['patterns']), 1)
        self.assertEqual(h1['folders'], ['INF'])
        selector = next(c for c in data['cameras'] if c['id'] == 'synthetic-selector')
        self.assertTrue(selector['selectorOnly'])
        self.assertEqual(selector['patterns'], [])
        self.assertEqual(selector['folders'], [])
        self.assertNotIn('DO_NOT_COPY_CONFIG_DETECTION', json.dumps(data))
        self.assertNotIn('CONFIG/config.bin', json.dumps(data))

    def test_explicit_catalog_aliases_are_carried_and_validated(self):
        h1 = next(c for c in self.generate('aliases: [H1, H1 QHD, H1-QHD]\n')['cameras'] if c['id'] == 'vueroid-h1')
        self.assertEqual(h1['aliases'], ['H1', 'H1 QHD', 'H1-QHD'])
        with self.assertRaisesRegex(ValueError, 'Invalid model aliases'):
            self.generate('aliases: invalid-scalar\n')


if __name__ == '__main__':
    unittest.main()
