// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const p=JSON.parse(readFileSync('package.json','utf8'));
const c=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
assert.match(p.version,/^\d+\.\d+\.\d+$/);
assert.equal(c.version,p.version);
assert.match(readFileSync('src-tauri/Cargo.toml','utf8'),new RegExp('version = "'+p.version.replaceAll('.','\\.')+'"'));
const key=c.plugins.updater.pubkey;
assert(!key.startsWith('REPLACE_'),'Official PUBLIC updater key must be committed before release');
assert.match(key,/^[A-Za-z0-9+/=]+$/,'Public updater key must be base64');
assert(Buffer.from(key,'base64').toString('utf8').startsWith('untrusted comment:'),'Expected Tauri/minisign public key file encoding');
assert.equal(c.bundle.createUpdaterArtifacts,true);
assert.deepEqual(c.plugins.updater.endpoints,['https://github.com/vortexopenclaw/dashcam-card-scanner/releases/latest/download/latest.json']);
console.log('Release version, public key format and updater endpoint preflight passed.');
