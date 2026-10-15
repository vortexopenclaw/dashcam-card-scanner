// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic local fixtures; no network or contributor messaging.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {sha256} from '../schema.js';
import {listReports,reviewReport,decideReport,createProposal} from '../review.js';
const script=fileURLToPath(new URL('../review.js',import.meta.url));
async function fixture(t,legacy=false){
 const dir=await fs.mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'review-details-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const sample={channel:'front',mode:'normal',width:1920,height:1080,fps:30,bitrateKbps:10000,containerBitrateKbps:null,sizeBytes:75000000,durationSeconds:60,codec:'h264'};
 const report={schemaVersion:1,owner:{manufacturer:'Synthetic',model:'Details',channelCount:1},contributor:{dashcamTalkUsername:'Private Test User'},evidence:[sample,{...sample,fps:25}]};
 if(!legacy)report.cohorts=[{id:'known',evidenceIndices:[0],owner:{channelCount:1}},{id:'new',evidenceIndices:[1],owner:{channelCount:1}}];
 const rawJSON=JSON.stringify(report),id=await sha256(rawJSON),record={id,report,rawJSON,receivedAt:'2026-01-01T00:00:00Z'};
 await fs.mkdir(path.join(dir,'pending'));const target=path.join(dir,'pending',id+'.json');await fs.writeFile(target,JSON.stringify(record));await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify({commit:'snapshot-a',profiles:[]}));return {dir,id,target};
}
test('private question/reason/reference round-trip preserves text and never changes pending report',async t=>{
 const {dir,id,target}=await fixture(t),before=await fs.readFile(target,'utf8');
 const details={question:'Which firmware was used for the parking samples?\nPlease check settings.',note:'<script>literal text only</script>\tPrivate note',reason:'Need settings for comparison',reference:'profile:synthetic; cohort:parking'};
 const entry=await decideReport(dir,id,'needs-info',details);for(const [k,v] of Object.entries(details))assert.equal(entry[k],v);
 assert.deepEqual((await reviewReport(dir,id)).decisionHistory[0],Object.fromEntries(Object.entries(entry).filter(([k])=>k!=='message')));
 assert.equal((await listReports(dir))[0].decision.question,details.question);assert.equal(await fs.readFile(target,'utf8'),before);
 if(process.platform!=='win32')assert.equal((await fs.stat(path.join(dir,'decisions.jsonl'))).mode&0o777,0o600);
});
test('strict bounded details reject invalid shapes, unknown keys and nonprinting controls before append',async t=>{
 const {dir,id}=await fixture(t);
 for(const details of [null,[],true,'text',new Date(),{extra:'no'},{id:'override'},{snapshotCommit:'override'},JSON.parse('{"__proto__":"no"}'),...[undefined,null,0,{},[],true,'','   ','a'.repeat(2001),'x\u0000','x\u001b[31m','x\r','x\u007f','x\u0085','x\u202e','x\u2066'].map(note=>({note}))])await assert.rejects(decideReport(dir,id,'accept',details),/Invalid decision details/);
 assert.deepEqual((await reviewReport(dir,id)).decisionHistory,[]);
 for(const key of ['note','question','reason','reference'])await decideReport(dir,id,'accept',{[key]:'x'.repeat(2000)});
 for(const key of ['note','question','reason','reference'])await assert.rejects(decideReport(dir,id,'accept',{[key]:'x'.repeat(2001)}));
});
test('new clarification and covered actions require specific metadata; legacy calls remain compatible',async t=>{
 const {dir,id}=await fixture(t);
 await assert.rejects(decideReport(dir,id,'needs-info',{}),/question/);
 for(const details of [{},{reason:'known model'},{reference:'profile:synthetic'}])await assert.rejects(decideReport(dir,id,'duplicate',details),/reason.*reference/);
 await decideReport(dir,id,'duplicate',{reason:'Same measured evidence and configuration as cited group',reference:'report:'+id+'; cohort:known'});
 for(const decision of ['needs-info','duplicate','reject','accept'])assert.equal((await decideReport(dir,id,decision)).decision,decision);
});
test('cohort annotations neither authorize whole report nor suppress new groups',async t=>{
 const {dir,id}=await fixture(t);
 await decideReport(dir,id,'accept',{cohortId:'new',note:'Private approval annotation only'});
 await assert.rejects(createProposal(dir,id),/accept/);assert.equal((await listReports(dir))[0].decision,null);
 await decideReport(dir,id,'duplicate',{cohortId:'known',reason:'Numeric and settings comparison complete',reference:'canonical:synthetic, configuration:2CH driving'});
 await assert.rejects(createProposal(dir,id),/accept/);
 await decideReport(dir,id,'accept',{note:'Explicit whole report approval'});
 await decideReport(dir,id,'needs-info',{cohortId:'known',question:'Can you confirm firmware?'});
 assert.equal((await listReports(dir))[0].decision.decision,'accept');assert.deepEqual((await createProposal(dir,id)).cohortReviews.map(c=>c.id),['known','new']);
 await decideReport(dir,id,'reject',{reason:'Whole report no longer approved'});await decideReport(dir,id,'accept',{cohortId:'new'});await assert.rejects(createProposal(dir,id),/accept/);
});
test('cohort IDs must exist, including legacy sentinel, and annotations never renew snapshot approval',async t=>{
 const {dir,id}=await fixture(t,true);
 for(const cohortId of ['missing','legacy/../other','x'.repeat(2001)])await assert.rejects(decideReport(dir,id,'accept',{cohortId}));
 await decideReport(dir,id,'accept',{cohortId:'legacy'});await assert.rejects(createProposal(dir,id),/accept/);
 await decideReport(dir,id,'accept');await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify({commit:'snapshot-b',profiles:[]}));
 await decideReport(dir,id,'accept',{cohortId:'legacy'});await assert.rejects(createProposal(dir,id),/Current snapshot/);
});
test('public proposal recursively excludes private annotations, contacts and raw JSON',async t=>{
 const {dir,id}=await fixture(t);
 await decideReport(dir,id,'needs-info',{cohortId:'new',question:'PRIVATE_QUESTION',note:'PRIVATE_NOTE',reason:'PRIVATE_REASON',reference:'PRIVATE_REFERENCE'});
 await decideReport(dir,id,'accept',{note:'PRIVATE_APPROVAL'});
 const text=JSON.stringify(await createProposal(dir,id));
 for(const token of ['PRIVATE_','Private Test User','dashcamTalkUsername','contributor','rawJSON','sanitizedRawReport','decisionHistory'])assert(!text.includes(token),token);
 const inspect=value=>{if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){assert(!['question','reason','reference','note','decisionHistory'].includes(key),key);inspect(child);}};inspect(JSON.parse(text));
 assert.equal((await reviewReport(dir,id)).decisionHistory[0].question,'PRIVATE_QUESTION');
});
test('CLI accepts one details JSON argument without executing text and rejects malformed details',async t=>{
 const {dir,id}=await fixture(t),env={...process.env,REVIEW_DATA_DIR:dir};
 const question='What firmware? $(no-shell) "quoted"\nsecond line';
 const entry=JSON.parse(execFileSync(process.execPath,[script,'decide',id,'needs-info',JSON.stringify({question,cohortId:'new'})],{env,encoding:'utf8'}));assert.equal(entry.question,question);
 for(const details of ['{','{"question":"ok","unknown":"no"}'])assert.throws(()=>execFileSync(process.execPath,[script,'decide',id,'needs-info',details],{env,stdio:'pipe'}));
 assert.equal((await reviewReport(dir,id)).decisionHistory.length,1);
});
