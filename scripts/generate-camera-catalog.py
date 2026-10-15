#!/usr/bin/env python3
"""AGPL-3.0-only. Build bounded public profile subset; requires developer PyYAML.
Usage: python3 scripts/generate-camera-catalog.py /path/to/offloader [/path/to/dashcam-camera-profiles]
The optional canonical public JSON profiles supplement selector identities only.
They do not supply executable patterns, exact recognition, or physical-scan proof.
No source paths, sample names, GPS data, or free-text notes are copied.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
import yaml
root = Path(sys.argv[1])
records = []
skipped = []
for path in sorted((root / 'profiles').glob('*.yaml')):
    raw = path.read_bytes()
    try:
        d = yaml.load(raw, Loader=yaml.BaseLoader)
    except yaml.YAMLError:
        # This upstream file has malformed detection YAML; parse only independent
        # top-level identity/channel sections, not a repaired detection rule.
        text = raw.decode()
        sections = re.findall(r'^(?:id|manufacturer|model|channels):[^\n]*(?:\n[ \t]+[^\n]*|\n(?=\n))*', text, re.M)
        d = yaml.load('\n'.join(sections), Loader=yaml.BaseLoader)
        skipped.append(path.name)
    channels = d.get('channels', {})
    roles = []
    if isinstance(channels, dict):
        for token, val in channels.items():
            role = val if isinstance(val, str) else val.get('position', val.get('role', val.get('id', token)))
            role = role.removeprefix('parking_')
            if role not in roles:
                roles.append(role)
    else:
        roles = ['primary'] * int(channels)
    patterns = []
    for p in d.get('filename_patterns', []):
        if not isinstance(p, dict) or not p.get('pattern'):
            continue
        patterns.append({k: int(p[k]) if k.endswith('_group') else p[k] for k in ['pattern', 'channel_group', 'mode_group', 'channels', 'modes'] if k in p})
    folders = [f['path'] for f in d.get('folders', []) if isinstance(f, dict) and isinstance(f.get('path'), str)]
    records.append(dict(id=d.get('id', path.stem), manufacturer=d.get('manufacturer', d.get('brand', path.stem.split('-')[0].title())), model=d.get('model', path.stem), channelCount=len(roles), channelSetup=' + '.join(roles), patterns=patterns, folders=folders, sourceSha256=hashlib.sha256(raw).hexdigest()))
output = {'source': 'https://github.com/vortexopenclaw/dashcam-offloader', 'commit': subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(), 'license':'AGPL-3.0-only', 'restrictedParsing':skipped, 'cameras':records}
if len(sys.argv) > 2:
    canonical = Path(sys.argv[2])
    known = {camera['id'] for camera in records}
    for path in sorted((canonical / 'profiles').glob('*.json')):
        raw = path.read_bytes()
        profile = json.loads(raw)
        if profile['id'] in known:
            continue
        # Missing channel evidence stays unknown. Variant maxima are not a
        # confirmed owner setup, so only an unambiguous variant may prefill.
        variants = profile.get('channel_variants', [])
        roles = variants[0].get('roles', []) if len(variants) == 1 else []
        count = variants[0].get('channels', 0) if len(variants) == 1 else 0
        if not isinstance(count, int) or not 1 <= count <= 8 or len(roles) != count:
            count, roles = 0, []
        records.append(dict(id=profile['id'], manufacturer=profile['manufacturer'], model=profile['model'], channelCount=count, channelSetup=' + '.join(roles), patterns=[], folders=[], sourceSha256=hashlib.sha256(raw).hexdigest(), selectorOnly=True))
        known.add(profile['id'])
    output['identitySource'] = {'source': 'https://github.com/vortexopenclaw/dashcam-camera-profiles', 'commit': subprocess.check_output(['git', '-C', str(canonical), 'rev-parse', 'HEAD'], text=True).strip()}
records.sort(key=lambda camera: (camera['manufacturer'].casefold(), camera['model'].casefold(), camera['id']))
target = Path(__file__).resolve().parents[1] / 'src-tauri/assets/camera-catalog.json'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(output,indent=2,sort_keys=True)+'\n')
print(f'Generated {len(records)} catalog entries; restricted parsing: {skipped}')
