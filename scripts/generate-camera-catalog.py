#!/usr/bin/env python3
"""AGPL-3.0-only. Build bounded public profile subset; requires developer PyYAML.
Usage: python3 scripts/generate-camera-catalog.py /path/to/offloader
No source paths, sample names, GPS data or free-text notes are copied.
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
target = Path(__file__).resolve().parents[1] / 'src-tauri/assets/camera-catalog.json'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(output,indent=2,sort_keys=True)+'\n')
print(f'Generated {len(records)} catalog entries; restricted parsing: {skipped}')
