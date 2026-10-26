"""Offline tests for current-draft pinning; no release or candidate execution."""
import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('pin', pathlib.Path(__file__).with_name('pin-native-release.py'))
pin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pin)

class PinTests(unittest.TestCase):
    def setUp(self):
        self.source = 'a' * 40
        self.release = {'id': 123, 'draft': True, 'prerelease': False, 'tag_name': 'v0.1.9',
                        'target_commitish': self.source, 'assets': [
                            {'id': i, 'name': f'synthetic-{i}', 'size': 1, 'digest': 'sha256:' + 'b' * 64}
                            for i in range(13)]}

    def test_exact_draft(self):
        result = pin.validate(self.release, '0.1.9', self.source, 'synthetic-public-key')
        self.assertEqual(result['version'], '0.1.9')
        self.assertEqual(len(result['assets']), 13)
        self.assertEqual(result['target_commitish'], self.source)

    def test_fail_closed(self):
        for field, value in [('draft', False), ('prerelease', True), ('tag_name', 'v0.1.8'),
                             ('target_commitish', 'c' * 40), ('assets', self.release['assets'][:-1])]:
            release = copy.deepcopy(self.release)
            release[field] = value
            with self.subTest(field=field), self.assertRaises(AssertionError):
                pin.validate(release, '0.1.9', self.source, 'public')

    def test_unsafe_missing_duplicate_inventory(self):
        for field, value in [('name', '../escape'), ('name', 'synthetic-1'), ('digest', None), ('size', 0)]:
            release = copy.deepcopy(self.release)
            release['assets'][0][field] = value
            with self.subTest(field=field), self.assertRaises((AssertionError, TypeError)):
                pin.validate(release, '0.1.9', self.source, 'public')

    def test_legacy_pin_unchanged(self):
        import json
        legacy = json.loads(pathlib.Path('scripts/native-candidate-pin.json').read_text())
        self.assertEqual(legacy['id'], 419929169)
        self.assertEqual(legacy['tag_name'], 'v0.1.8')
        self.assertEqual(legacy['target_commitish'], 'afc679f96bc5fedca522e7db5e5155a12e5d0537')

if __name__ == '__main__': unittest.main()
