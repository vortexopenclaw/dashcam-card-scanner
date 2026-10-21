// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic offline audit regressions only; no real cards, credentials or owners.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import worker,{IntakeGate} from '../worker.js';
import {Storage} from './storage.js';
import {parse,sha256,validate} from '../schema.js';
import {evidenceHash,cohort,structureHash,review,pull,checkRecord} from '../review.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture=()=>({schemaVersion:1,owner:{manufacturer:'Synthetic',model:'Audit',firmware:'1',channelCount:2,quality:'high',parkingMode:'buffered'},evidence:[{channel:'front',mode:'normal',width:1920,height:1080,fps:30,bitrateKbps:10000,containerBitrateKbps:11000,sizeBytes:10000000,durationSeconds:10,codec:'h264',folderIndex:0}],structure:{completed:true,fileCount:2,mediaCount:2,folders:[{components:['DCIM','Movie'],fileCount:1,mediaCount:1,extensions:[{extension:'mp4',mediaType:'video',count:1}],filenameTemplates:['SEQUENCE.mp4']},{components:['Parking'],fileCount:1,mediaCount:1,extensions:[{extension:'mp4',mediaType:'video',count:1}],filenameTemplates:['SEQUENCE.mp4']}],observedLayouts:[{folderIndex:0,channel:'front',mode:'normal'},{folderIndex:1,channel:'rear',mode:'parking'}]}});
async function record(p){validate(p);const rawJSON=JSON.stringify(p);return {id:await sha256(rawJSON),receivedAt:'2026-01-01T00:00:00Z',rawJSON,report:p};}
async function directory(t){const d=await fs.mkdtemp(path.join(root,'.test-audit-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}
function credentials(t){for(const [k,v] of Object.entries({CF_ACCOUNT_ID:'a'.repeat(32),CF_KV_NAMESPACE_ID:'b'.repeat(32),CF_API_TOKEN:'synthetic-only'})){const old=process.env[k];process.env[k]=v;t.after(()=>{if(old===undefined)delete process.env[k];else process.env[k]=old;});}}
test('BOM exact-byte upload rejected before redemption or storage, plain bytes retain integrity',async t=>{
 const storage=new Storage(),kv=new Map();
 const env={ENABLED:'true',IP_SALT:'s'.repeat(32),TURNSTILE_SECRET:'synthetic',TURNSTILE_SITE_KEY:'synthetic',ORIGIN:'https://intake.example',MAX_RECORDS:'10',MAX_STORED_BYTES:'100000',PENDING:{put:async(k,v)=>kv.set(k,v)}};
 const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(url,init)=>gate.fetch(new Request(url,init))})};
 t.mock.method(globalThis,'fetch',async()=>Response.json({success:true,hostname:'intake.example',action:'scanner_upload'}));
 const headers={'content-type':'application/json',origin:env.ORIGIN,'cf-connecting-ip':'192.0.2.1'};
 const bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(fixture()))]);
 assert.throws(()=>parse(bytes),/bom/i);
 const issue=async body=>{const r=await worker.fetch(new Request(env.ORIGIN+'/ticket',{method:'POST',headers,body:JSON.stringify({hash:await sha256(body),turnstile:'synthetic'})}),env);assert.equal(r.status,200);return (await r.json()).ticket;};
 const ticket=await issue(bytes),before=structuredClone(storage.data.get('control').tickets);
 const send=(body,ticket)=>worker.fetch(new Request(env.ORIGIN+'/submit',{method:'POST',headers:{...headers,authorization:'Bearer '+ticket},body}),env);
 assert.equal((await send(bytes,ticket)).status,400);assert.equal(kv.size,0);assert.deepEqual(storage.data.get('control').tickets,before);assert.equal(storage.data.get('control').records,0);
 const plain=bytes.subarray(3);assert.equal((await send(plain,await issue(plain))).status,202);const stored=JSON.parse([...kv.values()][0]);await checkRecord(stored);assert.equal(stored.rawJSON,plain.toString());
});
test('numeric hash ignores optional positional refs but retains every measurement and paired samples',async()=>{
 const p=fixture(),q=structuredClone(p);delete q.evidence[0].folderIndex;
 assert.equal(await evidenceHash(p),await evidenceHash(q));const r=await review(await record(q),[],[await record(p)]);assert(r.flags.includes('duplicate_numeric_evidence'));assert.equal(r.scannerReportedMeasurements[0].folderIndex,undefined);
 for(const [k,v] of Object.entries({channel:'rear',mode:'parking',width:1280,height:720,fps:25,bitrateKbps:9000,containerBitrateKbps:9500,sizeBytes:9000000,durationSeconds:9,codec:'hevc'})){const changed=structuredClone(p);changed.evidence[0][k]=v;assert.notEqual(await evidenceHash(p),await evidenceHash(changed),k);}
 const a=structuredClone(p);a.evidence.push({...a.evidence[0],sizeBytes:20000000,durationSeconds:20});const b=structuredClone(a);b.evidence.reverse();assert.equal(await evidenceHash(a),await evidenceHash(b));[b.evidence[0].durationSeconds,b.evidence[1].durationSeconds]=[b.evidence[1].durationSeconds,b.evidence[0].durationSeconds];assert.notEqual(await evidenceHash(a),await evidenceHash(b));
});
test('cohorts preserve channel/mode/folder relationships and canonicalize traversal order',async()=>{
 const p=fixture(),reordered=structuredClone(p);reordered.structure.folders.reverse();reordered.evidence[0].folderIndex=1;for(const e of reordered.structure.observedLayouts)e.folderIndex=1-e.folderIndex;reordered.structure.observedLayouts.reverse();
 assert.equal(cohort(p),cohort(reordered));assert.equal(await structureHash(p),await structureHash(reordered));assert.equal(await evidenceHash(p),await evidenceHash(reordered));
 const mode=structuredClone(p);mode.evidence[0].mode='parking';assert.notEqual(cohort(p),cohort(mode));assert.deepEqual((await review(await record(mode),[],[await record(p)])).possibleConflicts,[]);
 const swapped=structuredClone(p);swapped.structure.observedLayouts[0].mode='parking';swapped.structure.observedLayouts[1].mode='normal';assert.notEqual(cohort(p),cohort(swapped));
 const moved=structuredClone(p);moved.evidence[0].folderIndex=1;assert.notEqual(cohort(p),cohort(moved));
 const changed=structuredClone(reordered);changed.evidence[0].fps=25;assert.deepEqual((await review(await record(changed),[],[await record(p)])).possibleConflicts,[(await record(p)).id]);
 assert.equal((await review(await record(reordered),[],[await record(p)])).duplicateEvidence[0].sameCohort,true);
});
test('pull quarantines damaged records without tainted raw data and continues bounded pagination',async t=>{
 credentials(t);const d=await directory(t),good=await record(fixture()),bad=structuredClone(good);bad.id='b'.repeat(64);bad.rawJSON='PRIVATE_UNTRUSTED_TEXT';const mismatch=structuredClone(good),badId='c'.repeat(64),malformedId='d'.repeat(64);
 const legacy=structuredClone(good);legacy.id=await sha256('\ufeff'+good.rawJSON);const oversizedId='e'.repeat(64);
 const pages=[];t.mock.method(globalThis,'fetch',async url=>{if(url.includes('/keys?')){pages.push(url);return Response.json({success:true,result:pages.length===1?[bad.id,badId,malformedId,legacy.id,oversizedId].map(id=>({name:'pending/v1/'+id})):[{name:'pending/v1/'+good.id}],result_info:pages.length===1?{cursor:'next'}:{}});}if(url.endsWith(bad.id))return Response.json(bad);if(url.endsWith(badId))return Response.json(mismatch);if(url.endsWith(malformedId))return new Response('{invalid');if(url.endsWith(legacy.id))return Response.json(legacy);if(url.endsWith(oversizedId))return new Response('x'.repeat(2000001));return Response.json(good);});
 const result=await pull(d,2);assert.equal(result.downloaded,1);assert.equal(result.quarantined,5);assert.equal(result.hasMore,false);assert.equal(pages.length,2);await checkRecord(JSON.parse(await fs.readFile(path.join(d,good.id+'.json'),'utf8')));
 assert.deepEqual((await fs.readdir(d)).sort(),[good.id+'.json','quarantine'].sort());const names=await fs.readdir(path.join(d,'quarantine'));assert.equal(names.length,5);for(const name of names){const text=await fs.readFile(path.join(d,'quarantine',name),'utf8'),q=JSON.parse(text);assert.deepEqual(Object.keys(q).sort(),['id','reason']);assert.equal(q.reason,'invalid_record');assert(!text.includes('PRIVATE_UNTRUSTED_TEXT'));if(process.platform!=='win32')assert.equal((await fs.stat(path.join(d,'quarantine',name))).mode&0o777,0o600);}
 pages.length=0;const repeated=await pull(d,1);assert.equal(repeated.quarantined,5);assert.equal((await fs.readdir(path.join(d,'quarantine'))).length,5);
});
test('pull does not quarantine network/auth errors or oversized list responses as bad records',async t=>{
 credentials(t);const d=await directory(t),id='a'.repeat(64);let oversized=false;t.mock.method(globalThis,'fetch',async url=>url.includes('/keys?')?Response.json({success:true,result:Array.from({length:oversized?101:1},()=>({name:'pending/v1/'+id}))}):new Response('secret error',{status:403}));
 await assert.rejects(pull(d,1),/Cloudflare HTTP 403/);assert.deepEqual(await fs.readdir(d),[]);oversized=true;await assert.rejects(pull(d,1),/Invalid list response/);
});
test('proposal requires latest accept tied to current snapshot; re-review restores eligibility',async t=>{
 const d=await directory(t),r=await record(fixture());await fs.mkdir(path.join(d,'pending'));await fs.writeFile(path.join(d,'pending',r.id+'.json'),JSON.stringify(r));const snapshot=commit=>fs.writeFile(path.join(d,'snapshot.json'),JSON.stringify({commit,profiles:[]}));
 const run=(...args)=>execFileSync(process.execPath,[path.join(root,'review.js'),...args],{env:{...process.env,REVIEW_DATA_DIR:d},encoding:'utf8',stdio:['ignore','pipe','pipe']});
 await snapshot('snapshot-A');run('decide',r.id,'accept');assert.equal(JSON.parse(run('proposal',r.id)).snapshotCommit,'snapshot-A');await snapshot('snapshot-B');assert.throws(()=>run('proposal',r.id));run('decide',r.id,'accept');assert.equal(JSON.parse(run('proposal',r.id)).snapshotCommit,'snapshot-B');run('decide',r.id,'reject');assert.throws(()=>run('proposal',r.id));
 await fs.writeFile(path.join(d,'decisions.jsonl'),JSON.stringify({id:r.id,decision:'accept'})+'\n');assert.throws(()=>run('proposal',r.id));
});
