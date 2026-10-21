// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,beforeAll,afterAll} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
// This exact unmodified reference snapshot is test-only and never bundled.
import worker from './reference/legacy-worker.js';
import {Storage} from '../intake/test/storage.js';
import {validate as validateIntake,generalizeFilename} from '../intake/schema.js';
let scratch,parsed,source,before;
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const box=(kind,...payload)=>{const p=Buffer.concat(payload);return Buffer.concat([u32(p.length+8),Buffer.from(kind),p]);};
function fixture(){
 const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(200,16);
 const hdlr=Buffer.alloc(24);hdlr.write('vide',8);
 const entry=Buffer.alloc(78);entry.writeUInt16BE(640,24);entry.writeUInt16BE(360,26);
 const stsd=box('stsd',Buffer.alloc(4),u32(1),box('avc1',entry));
 const stsz=box('stsz',Buffer.alloc(4),u32(1000),u32(6));
 return Buffer.concat([box('ftyp',Buffer.from('isom'),u32(0),Buffer.from('isom')),box('moov',box('trak',box('mdia',box('mdhd',mdhd),box('hdlr',hdlr),box('minf',box('stbl',stsd,stsz))))),box('mdat',Buffer.alloc(6000))]);
}
beforeAll(()=>{
 scratch=mkdtempSync(join(realpathSync(tmpdir()),'scanner-contract-'));source=join(scratch,'card');mkdirSync(join(source,'DCIM'),{recursive:true});
 const path=join(source,'DCIM','20261015_Ariel-private.MP4');writeFileSync(path,fixture());before={hash:createHash('sha256').update(readFileSync(path)).digest('hex'),mtime:statSync(path).mtimeMs};
 const output=execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',source],{cwd:resolve('.'),encoding:'utf8',maxBuffer:2e6,timeout:240000});parsed=JSON.parse(output);
},240000);
afterAll(()=>{if(scratch)rmSync(scratch,{recursive:true,force:true});});
test('native scan measures paired metadata from bytes without altering source',()=>{
 const v=parsed.report.folders.flatMap(f=>f.videos)[0];expect(v).toMatchObject({durationSeconds:0.2,codec:'h264',width:640,height:360,nominalFrameRate:30,videoBitrate:240000});
 const path=join(source,'DCIM','20261015_Ariel-private.MP4');expect(v.fileSizeBytes).toBe(statSync(path).size);expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(before.hash);expect(statSync(path).mtimeMs).toBe(before.mtime);
});
test('public export validates exact published schema and contains shapes, not original names',()=>{
 const schema=JSON.parse(readFileSync('tests/reference/card-scan.schema.json','utf8'));const validate=new Ajv2020({strict:false}).compile(schema);const data=JSON.parse(parsed.review.publicJson);expect(validate(data),JSON.stringify(validate.errors)).toBe(true);
 expect(data.card_layout.folders.find(f=>f.path==='DCIM').video_summary.bitrate_range_mbps).toEqual([0.24,0.24]);expect(parsed.review.publicJson).not.toContain('20261015');expect(parsed.review.publicJson).not.toContain('Ariel');expect(parsed.review.privateJson).not.toContain(source);
});
test('existing Worker persisted round trip retains shape message, directory counts, codecs and paired rates',async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
 const records=new Map();const env={RATE_LIMIT_SALT:'synthetic-test-only-salt-not-a-credential',FEEDBACK_RATE_LIMITER:{idFromName:s=>s,get:()=>({fetch:async()=>Response.json({ok:true})})},FEEDBACK_BUCKET:{put:async(k,v)=>records.set(k,v)}};
 const body=parsed.review.privateJson;const response=await worker.fetch(new Request('https://example.invalid/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body}),env);
 expect(response.status).toBe(202);const receipt=await response.json();const exact=[...records.values()].map(JSON.parse).find(v=>v.id===receipt.id);expect(exact).toBeDefined();
 expect(exact.message).toContain('NNNNNNNN_Aaaaa-aaaaaaa.AAN');expect(exact.scan.directorySummaries.find(d=>d.path==='DCIM').directFileCount).toBe(1);expect(exact.scan.filenamePatternSummaries).toEqual([]);
 const v=exact.scan.videoSpecSummaries[0];expect(v.sampleCodecs).toEqual(['h264']);expect(v.storageRateSamples[0]).toMatchObject({fileSizeBytes:statSync(join(source,'DCIM','20261015_Ariel-private.MP4')).size,durationSeconds:0.2,videoBitrate:240000,width:640,height:360,nominalFrameRate:30});
 expect(JSON.stringify(exact)).not.toContain('20261015');expect(JSON.stringify(exact)).not.toContain('Ariel');expect(JSON.stringify(exact)).not.toContain(source);
});
test('gateway v1 is a distinct bounded allowlist and hash binds exact reviewed bytes',()=>{
 const body=parsed.review.submissionJson;expect(Buffer.from(body).subarray(0,3)).not.toEqual(Buffer.from([0xef,0xbb,0xbf]));expect(body.charCodeAt(0)).toBe(123);const data=JSON.parse(body);expect(Object.keys(data).sort()).toEqual(['evidence','owner','schemaVersion','structure']);expect(data.schemaVersion).toBe(1);expect(validateIntake(data)).toBe(data);expect(data.structure.fileCount).toBe(1);expect(data.structure.folders.find(f=>f.components[0]==='DCIM').mediaCount).toBe(1);expect(data.evidence[0]).toMatchObject({channel:'unknown',mode:'unknown',bitrateKbps:240,durationSeconds:0.2,containerBitrateKbps:null,codec:'h264'});expect(body.length).toBeLessThan(16384);expect(createHash('sha256').update(body,'utf8').digest('hex')).toBe(parsed.review.payloadHash);expect(body).not.toContain('fileSizeBytes');expect(body).not.toContain('settings');
});

// Offline proof that the real scanner adapter, not a hand-written sample, persists exact pairs.
test('scanner output passes challenged intake and exact persisted-record readback',async()=>{
 const {default:intakeWorker,IntakeGate}=await import('../intake/worker.js');
 const kv=new Map();const storage=new Storage();
 const env={ENABLED:'true',IP_SALT:'synthetic-offline-test-salt-0000000000000000',TURNSTILE_SECRET:'synthetic-offline-only',TURNSTILE_SITE_KEY:'synthetic',ORIGIN:'https://intake.example',MAX_RECORDS:'10',MAX_STORED_BYTES:'100000',PENDING:{put:async(k,v)=>kv.set(k,v),delete:async k=>kv.delete(k)}};
 const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(url,init)=>gate.fetch(new Request(url,init))})};
 const req=(route,body,headers={})=>new Request('https://intake.example'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://intake.example','cf-connecting-ip':'192.0.2.1',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 const realFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({success:true,hostname:'intake.example',action:'scanner_upload'});
 try{
  const body=parsed.review.submissionJson;const hash=parsed.review.payloadHash;
  const challenge=await intakeWorker.fetch(req('/ticket',{hash,turnstile:'synthetic-token'}),env);expect(challenge.status).toBe(200);const ticket=(await challenge.json()).ticket;
  const res=await intakeWorker.fetch(req('/submit',body,{Authorization:'Bearer '+ticket}),env);expect(res.status).toBe(202);const receipt=await res.json();expect(receipt).toMatchObject({id:hash,status:'pending'});
  const stored=[...kv.values()].map(JSON.parse).find(v=>v.id===hash);expect(stored.rawJSON).toBe(body);expect(stored.report.evidence[0]).toMatchObject({sizeBytes:parsed.report.folders.flatMap(f=>f.videos)[0].fileSizeBytes,durationSeconds:0.2,bitrateKbps:240,codec:'h264',containerBitrateKbps:null});expect(stored.report.structure.fileCount).toBe(1);
  expect((await intakeWorker.fetch(req('/submit',body,{Authorization:'Bearer '+ticket}),env)).status).toBe(401);
 }finally{globalThis.fetch=realFetch;}
});
test('unsupported video and image-only scans produce valid structure without invented metadata',()=>{
 for(const [ext,content] of [['TS','synthetic unknown video'],['JPG','synthetic image']]){
  const card=join(scratch,ext);mkdirSync(join(card,'Private-person-folder'),{recursive:true});writeFileSync(join(card,'Private-person-folder','2026_1015_131010_000001PT.'+ext),content);
  const result=JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',card],{encoding:'utf8',timeout:120000}));
  const body=JSON.parse(result.review.submissionJson);expect(validateIntake(body)).toBe(body);expect(body.structure.mediaCount).toBe(1);expect(body.structure.folders.find(f=>f.fileCount===1).filenameTemplates).toEqual([generalizeFilename('2026_1015_131010_000001PT.'+ext)]);
  expect(result.review.submissionJson).not.toContain('Private-person');expect(result.review.submissionJson).not.toContain('2026_1015');
  if(ext==='TS'){expect(body.evidence[0]).toMatchObject({width:null,height:null,fps:null,bitrateKbps:null,containerBitrateKbps:null,durationSeconds:null,codec:'unknown',sizeBytes:content.length});}else{expect(body.evidence).toEqual([]);}
 }
},120000);
