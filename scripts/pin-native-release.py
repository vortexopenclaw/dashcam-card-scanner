"""Snapshot an inspected draft for download-only native acceptance, never publish."""
import json
import os
import pathlib
import re
import subprocess


def validate(release, version, source, pubkey):
    assert re.fullmatch(r'[0-9a-f]{40}', source), 'Exact source SHA required'
    assert release['draft'] is True and release['prerelease'] is False
    assert release['tag_name'] == 'v' + version
    assert release['target_commitish'] == source, 'Draft source mismatch'
    assets = release['assets']
    assert len(assets) == 13, 'Complete inspected 13-asset inventory required'
    assert len({a['name'] for a in assets}) == 13
    for asset in assets:
        assert '/' not in asset['name'] and '\\' not in asset['name'] and '..' not in asset['name']
        assert asset['size'] > 0 and re.fullmatch(r'sha256:[0-9a-f]{64}', asset['digest'])
    return {**{k: release[k] for k in ('id', 'draft', 'tag_name', 'target_commitish')},
            'version': version, 'pubkey': pubkey,
            'assets': [{k: a[k] for k in ('id', 'name', 'digest', 'size')} for a in assets]}


if __name__ == '__main__':
    release_id = os.environ['RELEASE_ID']
    assert release_id.isdigit()
    release = json.loads(subprocess.check_output(['gh', 'api', 'repos/vortexopenclaw/dashcam-card-scanner/releases/' + release_id]))
    version = json.loads(pathlib.Path('package.json').read_text())['version']
    pubkey = json.loads(pathlib.Path('src-tauri/tauri.conf.json').read_text())['plugins']['updater']['pubkey']
    pin = validate(release, version, os.environ['SOURCE_SHA'], pubkey)
    pathlib.Path('current-native-pin.json').write_text(json.dumps(pin, indent=2))
    print('Exact draft source and complete hashed inventory pinned; native acceptance does not publish.')
