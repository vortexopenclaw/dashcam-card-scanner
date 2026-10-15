// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic offline reports only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {validate,sha256} from '../schema.js';
import {review,evidenceHash,structureHash,listReports,reviewReport,decideReport,createProposal} from '../review.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sample=(channel='front',mode='normal')=>({channel,mode,width:1920,height:1080,fps:30,bitrateKbps:10000,containerBitrateKbps:11000,sizeBytes:75000000,durationSeconds:60,codec:'h264'});
const owner=()=>({manufacturer:'Synthetic',model:'Mixed',channelCount:3,firmware:'Global',quality:'maximum',parkingMode:'off'});
const mixed=()=>({schemaVersion:1,owner:owner(),evidence:[sample(),sample('rear'),sample('front','parking'),sample('rear','parking'),sample('interior','parking')],cohorts:[{id:'driving',evidenceIndices:[0,1],owner:{channelCount:2,firmware:'A',quality:'high',parkingMode:'off'}},{id:'parking',evidenceIndices:[2,3,4],owner:{channelCount:3,firmware:'B',quality:'low',parkingMode:'time-lapse',timeLapseFps:1}}]});
async function record(report){const rawJSON=JSON.stringify(report);return {id:await sha256(rawJSON),receivedAt:'2026-01-01T00:00:00Z',rawJSON,report};}
async function local(t,p=mixed()){const dir=await fs.mkdtemp(path.join(root,'.test-run-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'pending'));const r=await record(p);await fs.writeFile(path.join(dir,'pending',r.id+'.json'),JSON.stringify(r));await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify({commit:'synthetic-commit-a',profiles:[]}));return {dir,r};}
const structure=()=>({completed:true,fileCount:2,mediaCount:2,folders:['Movie','Parking'].map(x=>({components:[x],fileCount:1,mediaCount:1,extensions:[{extension:'mp4',mediaType:'video',count:1}],filenameTemplates:['unknown']})),observedLayouts:[{folderIndex:0,channel:'front',mode:'normal'},{folderIndex:1,channel:'rear',mode:'parking'}]});
test('private contributor strict bounded handle accepts forum spaces, rejects contact injection',()=>{
 for(const name of ['A','Synthetic User','a_b-c.d','a'.repeat(40)])assert.equal(validate({...mixed(),contributor:{dashcamTalkUsername:name}}).contributor.dashcamTalkUsername,name);
 for(const name of ['', 'a'.repeat(41),'https://example.com','email@example.com','line\nbreak',' leading','trailing ','unicodeé','<script>'])assert.throws(()=>validate({...mixed(),contributor:{dashcamTalkUsername:name}}));
 for(const contributor of [{}, {dashcamTalkUsername:'Safe',email:'private'},null])assert.throws(()=>validate({...mixed(),contributor}));
});
test('cohort references form exact sample partition and strict settings shape',()=>{
 assert.equal(validate(mixed()).cohorts.length,2);
 for(const mutate of [p=>p.cohorts[1].evidenceIndices.push(0),p=>p.cohorts[0].evidenceIndices.pop(),p=>p.cohorts[0].evidenceIndices.push(24),p=>p.cohorts[0].evidenceIndices.push(0.5),p=>p.cohorts[0].evidenceIndices.push(0),p=>p.cohorts[0].id=p.cohorts[1].id,p=>p.cohorts[0].id='private/name',p=>p.cohorts[0].owner.model='No',p=>delete p.cohorts[0].owner.channelCount,p=>p.cohorts[0].owner.channelCount=9,p=>p.cohorts[0].owner.timeLapseFps=0,p=>p.cohorts[0].notes='No',p=>p.cohorts[0].folderIndices=[0],p=>p.cohorts=[],p=>p.cohorts=Array(17).fill(p.cohorts[0])]){const p=mixed();mutate(p);assert.throws(()=>validate(p));}
});
test('structure-only cohorts need valid references and cover folders without fabricated samples',async()=>{
 const p={schemaVersion:1,owner:owner(),evidence:[],structure:structure(),cohorts:[{id:'a',evidenceIndices:[],folderIndices:[0],owner:{channelCount:1}},{id:'b',evidenceIndices:[],folderIndices:[1],owner:{channelCount:1,parkingMode:'motion'}}]};
 validate(p);const r=await review(await record(p),[]);assert.equal(r.cohortReviews.length,2);assert(r.cohortReviews.every(c=>c.flags.includes('insufficient_measurements')));assert.equal(r.cohortReviews[1].scannerReportedStructure.folders[0].components[0],'Parking');
 const bad=structuredClone(p);bad.cohorts.pop();assert.throws(()=>validate(bad),/incomplete_folder_coverage/);bad.cohorts[0].folderIndices=[2];assert.throws(()=>validate(bad));bad.cohorts[0].folderIndices=[];assert.throws(()=>validate(bad),/empty_cohort/);
});
test('mixed 2CH driving and 3CH parking compare independently, measurements stay paired',async()=>{
 const p=mixed();validate(p);const profiles=[{id:'synthetic',manufacturer:'Synthetic',model:'Mixed',channel_variants:[{channels:2,roles:['front','rear']},{channels:3,roles:['front','rear','interior']}]}];
 const r=await review(await record(p),profiles);assert.equal(r.cohortReviews.length,2);
 for(const g of r.cohortReviews){assert.equal(g.canonicalChannelComparison.status,'known_layout');assert(!g.flags.includes('owner_measurement_contradiction'));assert(!g.flags.includes('owner_channel_count_contradiction'));assert.match(g.canonicalNumericComparison,/manual/);assert.match(g.observationBasis,/asserted/);}
 assert.equal(r.cohortReviews[0].ownerAssertions.channelCount,2);assert.equal(r.cohortReviews[1].ownerAssertions.timeLapseFps,1);assert.deepEqual(r.cohortReviews[1].scannerReportedMeasurements,p.evidence.slice(2));assert.equal(r.cohortReviews[1].scannerReportedMeasurements[0].fps,30);assert.deepEqual(r.ownerAssertions,{manufacturer:'Synthetic',model:'Mixed'});
});
test('missing cohort settings never inherit shared owner assertions',async()=>{
 const p=mixed();p.cohorts[1].owner={channelCount:3};const r=await review(await record(p),[]),g=r.cohortReviews[1];assert.equal(g.ownerAssertions.firmware,undefined);assert.equal(g.cohort.parkingMode,null);assert(g.flags.includes('insufficient_metadata'));assert(!g.flags.includes('owner_measurement_contradiction'));
});
test('numeric duplicates ignore handles and partitions but configuration comparisons do not',async()=>{
 const p=mixed(),q=structuredClone(p);q.contributor={dashcamTalkUsername:'Private Synthetic Handle'};q.cohorts.reverse();q.cohorts[1].id='renamed';assert.equal(await evidenceHash(p),await evidenceHash(q));assert.equal(await structureHash(p),await structureHash(q));
 const before=await record(p),after=await review(await record(q),[],[before]);assert(after.cohortReviews.every(g=>g.duplicateEvidence.some(d=>d.id===before.id&&d.sameCohort)));
 q.cohorts[0].owner.firmware='C';const changed=await review(await record(q),[],[before]);assert(changed.cohortReviews[0].flags.includes('new_firmware_candidate'));assert(changed.cohortReviews[0].duplicateEvidence.some(d=>!d.sameCohort));
});
test('legacy reports and mixed prior cohorts compare without treating whole card as one config',async()=>{
 const p=mixed(),legacy={schemaVersion:1,owner:{manufacturer:'Synthetic',model:'Mixed',...p.cohorts[0].owner},evidence:p.evidence.slice(0,2)};
 const old=await record(legacy),r=await review(await record(p),[],[old]);assert(r.cohortReviews[0].flags.includes('duplicate_numeric_evidence'));assert(!r.cohortReviews[1].flags.includes('duplicate_numeric_evidence'));
 const reverse=await review(old,[],[await record(p)]);assert(reverse.flags.includes('duplicate_numeric_evidence'));
});
test('measurement variations conflict only with matching configuration cohort',async()=>{
 const p=mixed(),q=structuredClone(p);q.evidence[0].bitrateKbps+=1;const old=await record(p),r=await review(await record(q),[],[old]);assert(r.cohortReviews[0].possibleConflicts.includes(old.id));assert.equal(r.cohortReviews[1].possibleConflicts.length,0);
});
test('shared folder context does not contaminate sampled modes or double count report inventory',async()=>{
 const p=mixed();p.structure=structure();p.evidence.forEach(e=>e.folderIndex=0);p.cohorts.forEach(c=>c.folderIndices=[0]);p.structure.observedLayouts.push({folderIndex:0,channel:'interior',mode:'parking'});validate(p);
 const r=await review(await record(p),[]);assert.equal(r.scannerReportedStructure.mediaCount,2);assert.equal(r.cohortReviews[0].canonicalChannelComparison.completeObservedLayout,true);assert(!r.cohortReviews[0].flags.includes('owner_measurement_contradiction'));assert.match(r.cohortReviews[0].inventoryScope,/must not be added/);
});
test('local private list/review retain handle; accepted public proposal recursively purges contact and raw JSON',async t=>{
 const p=mixed();p.contributor={dashcamTalkUsername:'Private Synthetic Handle'};const {dir,r}=await local(t,p);
 assert.equal((await listReports(dir))[0].contributor.dashcamTalkUsername,p.contributor.dashcamTalkUsername);assert.equal((await reviewReport(dir,r.id)).sanitizedRawReport.contributor.dashcamTalkUsername,p.contributor.dashcamTalkUsername);await assert.rejects(createProposal(dir,r.id),/accept/);
 await decideReport(dir,r.id,'accept');const proposal=await createProposal(dir,r.id),text=JSON.stringify(proposal);assert.equal(proposal.cohortReviews.length,2);assert.equal(proposal.sourceReportHash,r.id);
 for(const forbidden of ['contributor','dashcamTalkUsername','Private Synthetic Handle','sanitizedRawReport','rawJSON',r.receivedAt])assert(!text.includes(forbidden),forbidden);
 assert.equal((await listReports(dir))[0].decision.decision,'accept');await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify({commit:'synthetic-commit-b',profiles:[]}));await assert.rejects(createProposal(dir,r.id),/Current snapshot/);await decideReport(dir,r.id,'accept');assert.equal((await createProposal(dir,r.id)).snapshotCommit,'synthetic-commit-b');
});
test('regrouped identical measurements remain whole-report duplicates without config agreement',async()=>{
 const p=mixed(),q=structuredClone(p);q.cohorts=[{id:'unclassified',evidenceIndices:[0,1,2,3,4],owner:{channelCount:3}}];validate(q);const old=await record(p),r=await review(await record(q),[],[old]);assert(r.flags.includes('duplicate_numeric_evidence'));assert.equal(r.duplicateEvidence[0].id,old.id);assert.equal(r.cohortReviews[0].duplicateEvidence.length,0);assert.match(r.duplicateEvidence[0].scope,/partition ignored/);
 const legacy={schemaVersion:1,owner:owner(),evidence:p.evidence};const back=await review(await record(legacy),[],[old]);assert.equal(back.wholeReportDuplicateEvidence[0].id,old.id);
});
test('shared structure-only folder roles are unattributed, never exact cohort layout claims',async()=>{
 const p={schemaVersion:1,owner:owner(),evidence:[],structure:structure(),cohorts:[{id:'a',evidenceIndices:[],folderIndices:[0,1],owner:{channelCount:2,parkingMode:'off'}},{id:'b',evidenceIndices:[],folderIndices:[0,1],owner:{channelCount:2,parkingMode:'motion'}}]};validate(p);const r=await review(await record(p),[]);for(const g of r.cohortReviews){assert.deepEqual(g.scannerReportedStructure.observedLayouts,[]);assert.equal(g.canonicalChannelComparison.completeObservedLayout,false);assert(!g.flags.includes('owner_measurement_contradiction'));}
});
test('native JSON subprocess bridge lists, reviews, decides, proposes without shell or listener',async t=>{
 const p=mixed();p.contributor={dashcamTalkUsername:'Private Bridge User'};const {dir,r}=await local(t,p);const run=(...args)=>JSON.parse(execFileSync(process.execPath,[path.join(root,'review.js'),...args],{env:{...process.env,REVIEW_DATA_DIR:dir},encoding:'utf8'}));
 assert.equal(run('list')[0].id,r.id);assert.equal(run('review',r.id).contributor.dashcamTalkUsername,'Private Bridge User');assert.equal(run('decide',r.id,'accept').decision,'accept');assert(!JSON.stringify(run('proposal',r.id)).includes('Private Bridge User'));
});
