#!/usr/bin/env python3
"""Generate scoped UI identities, NOT a firmware SKU/SSID alias dictionary.

Input: sanitized official-public model-inventory.json. No cards, logs or network.
"""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('inventory', type=Path)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'src/ddpai-identities.json')
args = parser.parse_args()
source = json.loads(args.inventory.read_text())
rows = []
for m in source['models']:
    rows.append({
        'id': m['id'], 'model': m['canonical_display_name'], 'region': m['region'],
        'aliases': [a['name'] for a in m['aliases'] if a['kind'] in (
            'official_manual_heading', 'official_product_title', 'manual_heading_revision_ambiguous')],
        'recognitionEligible': 'mismatch' not in m['status'] and not any('Series-level' in n for n in m['notes']),
        'sources': m['official_urls'], 'notes': m['notes'],
    })
assert len(rows) == source['counts']['inventory_rows']
assert len({r['id'] for r in rows}) == len(rows)
args.output.write_text(json.dumps({'scope': source['scope'], 'identities': rows}, ensure_ascii=False, indent=2))
print(f'{len(rows)} scoped identity rows; no hardware/channel-count claims')
