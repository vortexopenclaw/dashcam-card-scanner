#!/usr/bin/env python3
"""Read-only synthetic parity check: canonical JSON, native YAML, Scanner JSON.
Usage: python3 scripts/verify-filename-catalog-parity.py CANONICAL_ROOT NATIVE_ROOT
Requires developer PyYAML. Does not read media, settings contents, or cards.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import yaml

scanner = Path(__file__).resolve().parents[1]
canonical, native = map(Path, sys.argv[1:])
catalog = json.loads((scanner / 'src-tauri/assets/camera-catalog.json').read_text())['cameras']
for identity in ('vantrue-e1-pro', 'vantrue-e1-pro-s', 'rove-r2-4k-pro'):
    source = native / 'profiles' / f'{identity}.yaml'
    raw = source.read_bytes()
    profile = yaml.load(raw, Loader=yaml.BaseLoader)
    public = json.loads((canonical / 'profiles' / f'{identity}.json').read_text())
    entries = [c for c in catalog if c['id'] == identity]
    assert len(entries) == 1, identity
    camera = entries[0]
    assert camera['sourceSha256'] == hashlib.sha256(raw).hexdigest(), f'{identity}: source hash drift; regenerate catalog'
    assert camera['patterns'][0]['pattern'] == profile['filename_patterns'][0]['pattern'], identity
    if identity.startswith('vantrue-'):
        positives = [f'20300101_120000_00001_{mode}_A.{ext}' for mode in 'NPET' for ext in ('MP4', 'JPG')]
        negatives = ['20300101_120000_00001_X_A.MP4', '20300101_120000_00001_N_B.MP4', '20300101_120000_00001_N_AxMP4']
    else:
        positives = ['2030_0101_120000_001.MP4']
        negatives = ['2030_0101_120000_001xMP4', '2030_0101_120000_001.JPG']
    negatives += [positives[0] + '.extra']
    patterns = [public['filename_patterns'][0]['pattern'], camera['patterns'][0]['pattern']]
    patterns += [rule['filename_pattern']['regex'] for rules in profile.get('detection', {}).values() for rule in rules if 'filename_pattern' in rule]
    for pattern in patterns:
        regex = re.compile(pattern)
        assert all(regex.fullmatch(name) for name in positives), f'{identity}: broken grammar'
        assert all(not regex.fullmatch(name) for name in negatives), f'{identity}: permissive grammar'
    for exclude in profile.get('exclude', []):
        if exclude.startswith('^'):
            assert re.match(exclude, '._synthetic.MP4'), f'{identity}: AppleDouble exclude grammar'
            assert not re.match(exclude, 'synthetic.MP4'), f'{identity}: exclude rejects ordinary files'
    if identity.startswith('vantrue-'):
        p = camera['patterns'][0]
        for name in positives:
            match = re.fullmatch(p['pattern'], name)
            assert match is not None, identity
            assert p['channels'][match[p['channel_group']]] == 'front'
            assert match[p['mode_group']] in p['modes']
    print(f'PASS {identity}: canonical/native/Scanner synthetic grammar, captures and raw source hash')
print('PASS three-target source parity (source commit provenance must match the final committed native checkout).')
