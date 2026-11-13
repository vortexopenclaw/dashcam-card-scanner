// SPDX-License-Identifier: AGPL-3.0-only
// Run with the actual JSON discovery objects emitted by each native verifier.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {validateDiscovery} from '../intake/discovery.js';
const peer=await import(pathToFileURL(resolve('../ddpai-log-offloader/workers/feedback/discovery.js')));
assert.deepEqual(readFileSync('intake/discovery.js'),readFileSync('../ddpai-log-offloader/workers/feedback/discovery.js'));
assert(process.argv.length>=4,'Supply Scanner and Offloader native discovery fixture paths');
for(const path of process.argv.slice(2)){
 const fixture=JSON.parse(readFileSync(path,'utf8'));
 const d=fixture.report?.discovery??fixture.scan?.discovery??fixture.discovery??fixture;
 validateDiscovery(d);peer.validateDiscovery(d);
 console.log(`PASS both receiving modules: ${path} (${d.observations.length} observations)`);
}
