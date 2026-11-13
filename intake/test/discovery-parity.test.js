// SPDX-License-Identifier: AGPL-3.0-only
// Lightweight portable grammar checks. Native fixture integration lives in Vitest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {validTechnical,validateDiscovery,validDiscovery,projectDiscovery,safeDiscoveryValue} from '../discovery.js';
const peerURL=new URL('../../../ddpai-log-offloader/workers/feedback/discovery.js',import.meta.url);
const peer=existsSync(peerURL)?await import(peerURL):null;
const cases=JSON.parse(readFileSync(new URL('../../tests/reference/discovery-validation-cases.json',import.meta.url)));
test('shared receiver API preserves both caller contracts and optional legacy payloads',()=>{
 assert.equal(validDiscovery(undefined),true);
 assert.equal(projectDiscovery(undefined),undefined);
 assert.equal(safeDiscoveryValue('Alpha A1','model'),true);
 assert.equal(safeDiscoveryValue('person@example.com','model'),false);
 assert.throws(()=>projectDiscovery({rawLine:'not technical evidence'}));
});
test('canonical receiving validator agrees on every portable grammar case',()=>{
 for(const c of cases)assert.equal(validTechnical(c.field,c.key,c.value),c.valid,JSON.stringify(c));
});
test('canonical receiving validators are byte identical and agree on every portable grammar case',{skip:!peer},()=>{
 assert.deepEqual(readFileSync(new URL('../discovery.js',import.meta.url)),readFileSync(new URL('../../../ddpai-log-offloader/workers/feedback/discovery.js',import.meta.url)));
 for(const c of cases)assert.equal(peer.validTechnical(c.field,c.key,c.value),c.valid,JSON.stringify(c));
});
test('inventory ordinals and explicit document locations, with strict coverage and non-JSON line rejection',()=>{
 const d={version:1,sources:[{id:'support-257',format:'json',encoding:'utf8',sizeBytes:20}],observations:[{sourceId:'support-257',field:'model',key:'model',value:'Alpha A1',line:0,record:0,scope:'unbound'}],coverage:{inventoriedCandidates:257,inspectedFiles:1,uninspectedFiles:256,retainedObservations:1,omittedObservations:0,bytesRead:20,limited:true,multipleModelValues:false,reasons:{oversize:256}}};
 for(const validate of [validateDiscovery,...(peer?[peer.validateDiscovery]:[])]){
  assert.doesNotThrow(()=>validate(d));
  const ini=structuredClone(d);ini.sources[0].format='ini';assert.throws(()=>validate(ini),/line/);
  const bad=structuredClone(d);bad.sources[0].id='support-258';bad.observations[0].sourceId='support-258';assert.throws(()=>validate(bad),/coverage/);
 }
});
