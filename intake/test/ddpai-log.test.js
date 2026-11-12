// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline synthetic metadata only: exercises the actual receiving validator/storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,parse,sha256} from '../schema.js';
import worker,{IntakeGate} from '../worker.js';
import {anonymousProposal,checkRecord} from '../review.js';
import {Storage} from './storage.js';
const sourceFile='DCIM/207log/ui/ui_20300101120000_000.log';
const actual=JSON.parse(readFileSync(new URL('../../tests/reference/ddpai-device-info.json',import.meta.url),'utf8'));
const observations=()=>[['logging_device','model','soft_version'],['rear','rear_model','rear_version'],['inside','inside_model','inside_version']].map(([component,m,v])=>({manufacturer:'DDPAI',component,reportedModel:actual[m]||null,model:component==='logging_device'?'Z100 Master':null,firmwareVersion:actual[v]||null,sourceKind:'ddpai_ui_device_info',sourceFile,sourceLine:29,identityEstablished:!!actual[m]}));
const fixture=()=>({schemaVersion:1,owner:{manufacturer:'DDPAI',model:'Z100 Master',firmware:'owner-current',channelCount:4},evidence:[{channel:'front',mode:'unknown',width:1920,height:1080,fps:30,bitrateKbps:10000,containerBitrateKbps:null,sizeBytes:10000000,durationSeconds:10,codec:'h264'}],scan:{componentMetadata:observations(),componentMetadataCoverage:{inspectedFiles:1,retainedEntries:3,omittedEntries:0,limited:false}}});
function setup(){const storage=new Storage(),kv=new Map();const env={ENABLED:'true',IP_SALT:'s'.repeat(32),ORIGIN:'https://intake.example',MAX_RECORDS:'100',MAX_STORED_BYTES:'1000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(u,i)=>gate.fetch(new Request(u,i))})};return {env,kv,storage};}
const send=(c,body)=>worker.fetch(new Request(c.env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body}),c.env);
test('actual-shaped allowlist preserves historical observations through real admission and exact stored readback',async()=>{
 const p=fixture(),bytes=JSON.stringify(p)+'\n',c=setup(),r=await send(c,bytes);assert.equal(r.status,202);const receipt=await r.json();assert.equal(receipt.id,await sha256(bytes));
 const stored=JSON.parse(c.kv.get('pending/v1/'+receipt.id));await checkRecord(stored);assert.equal(stored.rawJSON,bytes);assert.deepEqual(stored.report.scan,p.scan);assert.deepEqual(stored.report.owner,p.owner);assert.deepEqual(c.storage.data.get('record/'+receipt.id),stored);
 assert.equal(stored.report.scan.componentMetadata[1].model,null);assert.equal(stored.report.scan.componentMetadata[1].identityEstablished,false);assert.equal(stored.report.scan.componentMetadata[1].firmwareVersion,'v9.0.0.0');
 for(const forbidden of ['wifi_pwd','wifi_ssid','sn_code','bt_info','<omitted>','msgHdr'])assert(!stored.rawJSON.includes(forbidden));
 assert.equal((await send(c,bytes)).status,202);assert.equal(c.kv.size,1);
});
test('old reports remain valid; optional coverage communicates unread evidence without guessed omissions',()=>{
 const p=fixture();delete p.scan;assert.equal(validate(p),p);p.scan={componentMetadata:[],componentMetadataCoverage:{inspectedFiles:0,retainedEntries:0,omittedEntries:0,limited:true}};assert.equal(validate(p),p);
});
test('recursive anonymous export strips every private log envelope, including coverage and source association',()=>{
 const p=fixture(),out=anonymousProposal({scan:p.scan,nested:{componentMetadata:p.scan.componentMetadata,componentMetadataCoverage:p.scan.componentMetadataCoverage}});const text=JSON.stringify(out);for(const value of ['componentMetadata','sourceLine','sourceFile','8.0.0.16','v9.0.0.0','207log'])assert(!text.includes(value));
});
test('strict receiving schema rejects credential/raw-log/source/coverage/model/firmware negatives before storage',async()=>{
 const mutations=[
  p=>p.scan.rawLog='private',p=>p.scan.componentMetadata[0].wifi_pwd='private',p=>p.scan.componentMetadata[0].serial='private',p=>p.scan.componentMetadata[0].gps='private',
  p=>p.scan.componentMetadata[0].sourceFile='/Volumes/private/ui_20300101120000_000.log',p=>p.scan.componentMetadata[0].sourceFile='DCIM/207log/ui/../ui_20300101120000_000.log',p=>p.scan.componentMetadata[0].sourceFile='DCIM/207log/ui/ui_20300101120000_000.log\n',
  p=>p.scan.componentMetadata[0].sourceLine=0,p=>p.scan.componentMetadata[0].model='Z100\nMaster',p=>p.scan.componentMetadata[0].reportedModel='a'.repeat(81),p=>p.scan.componentMetadata[0].firmwareVersion='password or coordinates',
  p=>p.scan.componentMetadata[1].identityEstablished=true,p=>p.scan.componentMetadata[1].model='MINI3X',p=>p.scan.componentMetadataCoverage.retainedEntries=2,p=>p.scan.componentMetadataCoverage.inspectedFiles=0,p=>p.scan.componentMetadataCoverage.omittedEntries=1,p=>p.scan.componentMetadata=null,
  p=>{p.scan.componentMetadata.push({...p.scan.componentMetadata[0]});p.scan.componentMetadataCoverage.retainedEntries++;},
  p=>{p.scan.componentMetadata=Array.from({length:33},(_,i)=>({...p.scan.componentMetadata[0],sourceLine:i+1}));p.scan.componentMetadataCoverage.retainedEntries=33;}
 ];
 for(const mutate of mutations){const p=fixture();mutate(p);assert.throws(()=>validate(p));const c=setup();const r=await send(c,JSON.stringify(p));assert.equal(r.status,400);assert.equal(c.kv.size,0);}
});
test('duplicate structured metadata JSON keys rejected before admission',()=>{
 const bytes=JSON.stringify(fixture()).replace('"sourceLine":29','"sourceLine":29,"sourceLine":30');assert.throws(()=>parse(new TextEncoder().encode(bytes)),/duplicate_json_key/);
});
