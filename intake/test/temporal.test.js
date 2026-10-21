// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import worker,{IntakeGate} from '../worker.js';
import {Storage} from './storage.js';
import {validate,sha256,admissionHash} from '../schema.js';
import {review,checkRecord,createProposal} from '../review.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url));
let cached;
function fixture(){
 if(!cached){const out=execFileSync('cargo',['test','--locked','--quiet','--manifest-path','src-tauri/Cargo.toml','--lib','intake::tests::temporal_native_prepared_fixture','--','--nocapture'],{cwd:root,encoding:'utf8',timeout:240000});cached=JSON.parse(out.split('\n').find(x=>x.startsWith('TEMPORAL_NATIVE:')).slice(16));}
 return structuredClone(cached);
}
test('native generated BMFF -> real prepared bytes -> strict schema -> Worker exact stored readback',async()=>{
 const p=fixture();assert.equal(validate(p),p);assert.equal(p.temporalEvidence.cohorts[0].estimatedCaptureFps,1);assert(p.evidence.every(e=>e.sizeBytes>0&&e.durationSeconds===60&&e.fps===30));
 const bytes=JSON.stringify(p)+'\n',id=await sha256(bytes),kv=new Map(),storage=new Storage();
 const env={ENABLED:'true',IP_SALT:'s'.repeat(32),ORIGIN:'https://intake.example',MAX_RECORDS:'1000',MAX_STORED_BYTES:'10000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};
 const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(url,init)=>gate.fetch(new Request(url,init))})};
 const r=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:bytes}),env);assert.equal(r.status,202);
 const record=JSON.parse(kv.get('pending/v1/'+id));assert.equal(record.rawJSON,bytes);assert.deepEqual(await checkRecord(record),p);assert.deepEqual(record.report.evidence,p.evidence);assert.deepEqual(record.report.temporalEvidence,p.temporalEvidence);assert.deepEqual(storage.data.get('record/'+id),record);
 const result=await review(record,[]);assert.equal(result.ownerAssertions.parkingMode,undefined);assert.equal(result.ownerAssertions.timeLapseFps,undefined);assert.deepEqual(result.estimatedSettings,{parkingMode:'time-lapse',timeLapseFps:1});assert.deepEqual(result.derivedTemporalEvidence,p.temporalEvidence);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'temporal-proposal-'));
 try{await fs.mkdir(path.join(dir,'pending'));await fs.writeFile(path.join(dir,'pending',id+'.json'),JSON.stringify(record));await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify({commit:'synthetic-snapshot',profiles:[]}));await fs.writeFile(path.join(dir,'decisions.jsonl'),JSON.stringify({id,decision:'accept',snapshotCommit:'synthetic-snapshot'})+'\n');const proposal=await createProposal(dir,id);assert.deepEqual(proposal.derivedTemporalEvidence,p.temporalEvidence);assert.equal(proposal.ownerAssertions.parkingMode,undefined);assert.deepEqual(proposal.estimatedSettings,result.estimatedSettings);assert.deepEqual(proposal.scannerReportedMeasurements,p.evidence);}finally{await fs.rm(dir,{recursive:true,force:true});}
 const legacy=fixture();delete legacy.temporalEvidence;delete legacy.owner.suggestedFields;validate(legacy);assert.notEqual(await admissionHash(bytes),await admissionHash(JSON.stringify(legacy)));
});
test('group estimates stay distinct and global suggestions never become group assertions',async()=>{
 const p=fixture();p.cohorts=[{id:'estimated',evidenceIndices:p.evidence.map((_,i)=>i),owner:{channelCount:1,parkingMode:'time-lapse',timeLapseFps:1,suggestedFields:['parkingMode','timeLapseFps']}}];validate(p);
 let rawJSON=JSON.stringify(p),r=await review({id:await sha256(rawJSON),rawJSON,report:p},[]);assert.equal(r.cohortReviews[0].ownerAssertions.parkingMode,undefined);assert.equal(r.cohortReviews[0].estimatedSettings.timeLapseFps,1);
 p.cohorts[0].owner={channelCount:1};rawJSON=JSON.stringify(p);r=await review({id:await sha256(rawJSON),rawJSON,report:p},[]);assert.equal(r.cohortReviews[0].ownerAssertions.parkingMode,undefined);assert.deepEqual(r.cohortReviews[0].estimatedSettings,{});
});
test('temporal rejects private/unknown fields, invalid floats, coverage/count errors and promotion',()=>{
 const mutations=[p=>p.temporalEvidence.ownerConfirmed=true,p=>p.temporalEvidence.name='20300101.MP4',p=>p.temporalEvidence.cohorts[0].path='/private',p=>p.temporalEvidence.cohortCount++,p=>p.temporalEvidence.omittedCohortCount=-1,p=>p.temporalEvidence.cohortCount=16385,p=>p.temporalEvidence.cohorts=Array(9).fill(p.temporalEvidence.cohorts[0]),p=>p.temporalEvidence.cohorts[0].adjacentPairCount=16384,p=>p.temporalEvidence.inventoryComplete=false,p=>p.temporalEvidence.temporalLimited=true,p=>p.temporalEvidence.cohorts[0].adjacentPairCount=3,p=>p.temporalEvidence.cohorts[0].confidence='high',p=>p.owner.suggestedFields=['parkingMode','parkingMode'],p=>p.owner.suggestedFields=['model']];
 for(const value of [NaN,Infinity,-Infinity,0,241,1e100])mutations.push(p=>p.temporalEvidence.cohorts[0].estimatedCaptureFps=value);
 for(const change of mutations){const p=fixture();change(p);assert.throws(()=>validate(p));}
 const p=fixture();p.temporalEvidence.inventoryComplete=false;for(const c of p.temporalEvidence.cohorts){c.suggestion=null;c.startIntervalMedianSeconds=null;c.estimatedCaptureFps=null;c.relativeDrivingBitrate=null;}validate(p);
});
