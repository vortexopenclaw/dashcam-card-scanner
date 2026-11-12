// SPDX-License-Identifier: AGPL-3.0-only
// Entirely synthetic 2030 media. Never contacts a live endpoint or reads a card.
import {test,expect,beforeAll,afterAll} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import fs from 'node:fs/promises';
import worker,{IntakeGate} from '../intake/worker.js';
import {Storage} from '../intake/test/storage.js';
import {validate,safeMediaName,sha256} from '../intake/schema.js';
import {checkRecord,createProposal,decideReport,evidenceHash} from '../intake/review.js';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const box=(s,...a)=>{const b=Buffer.concat(a);return Buffer.concat([u32(b.length+8),Buffer.from(s),b]);};
function media(short=false,codec='avc1'){
 const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(short?100:200,16);
 const hdlr=Buffer.alloc(24);hdlr.write('vide',8);const entry=Buffer.alloc(78);entry.writeUInt16BE(640,24);entry.writeUInt16BE(360,26);
 return Buffer.concat([box('moov',box('trak',box('mdia',box('mdhd',mdhd),box('hdlr',hdlr),box('minf',box('stbl',box('stsd',Buffer.alloc(4),u32(1),box(codec,entry)),box('stsz',Buffer.alloc(4),u32(1000),u32(short?3:6))))))),box('mdat',Buffer.alloc(short?3000:6000))]);
}
let scratch,native,expected;
const scan=(root,flags=[])=>JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',root,...flags],{encoding:'utf8',timeout:240000,maxBuffer:4e6}));
beforeAll(()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
 scratch=mkdtempSync(join(realpathSync(tmpdir()),'private-identities-'));const root=join(scratch,'card');expected=[];
 for(const [folder,channel] of [['DCIM/200video/front','front'],['DCIM/200video/inside','telephoto']]){
  mkdirSync(join(root,folder),{recursive:true});
  for(const name of ['S_20300115010101_0001_A.MP4','unfamiliar-camera+token 2030.M4V','2030-image-shaped-name.MP4']){
   const data=media();writeFileSync(join(root,folder,name),data);expected.push({filename:name,folder,channel,mode:channel==='front'&&name.startsWith('S_')?'parking':'unknown',sizeBytes:data.length,durationSeconds:0.2,bitrateKbps:240,fps:30,containerBitrateKbps:null});
  }
 }
 const photo='DCIM/201photo/inside';mkdirSync(join(root,photo),{recursive:true});writeFileSync(join(root,photo,'unfamiliar-photo2030.JPG'),'synthetic image');
 native=scan(root,['--z100']);
},240000);
afterAll(()=>{if(scratch)rmSync(scratch,{recursive:true,force:true});});
test('native private review retains exact linked measurements and photo identity; no reconstruction by array position',()=>{
 const p=validate(JSON.parse(native.review.submissionJson));expect(p.evidence).toHaveLength(7);expect(new Set(p.evidence.map(e=>e.sourceIdentifier)).size).toBe(7);
 for(const e of expected){const row=p.evidence.find(x=>x.folder===e.folder&&x.filename===e.filename);expect(row).toMatchObject(e);expect(row.sourceIdentifier).toMatch(/^source-/);}
 expect(p.evidence.find(e=>e.filename==='unfamiliar-photo2030.JPG')).toMatchObject({folder:'DCIM/201photo/inside',channel:'telephoto',durationSeconds:null,bitrateKbps:null});
 expect(p.retention).toEqual({inventoriedIdentities:7,retainedIdentities:7,omittedIdentities:0,measuredFiles:6,retainedMeasurements:6,omittedMeasurements:0});
 expect(native.review.privateJson).toBe(native.review.submissionJson);expect(native.review.submissionJson).not.toContain(scratch);
 for(const e of expected)expect(native.review.publicJson).not.toContain(e.filename);
 expect(native.review.publicJson).not.toContain('sourceIdentifier');
});
test('actual direct intake validation and immutable exact-key storage retain every identity/numeric pair; accepted public proposal removes identities',async()=>{
 const kv=new Map(),storage=new Storage();const env={ENABLED:'true',IP_SALT:'synthetic-offline-salt-'.repeat(3),ORIGIN:'https://intake.example',MAX_RECORDS:'10',MAX_STORED_BYTES:'1000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};
 const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(url,init)=>gate.fetch(new Request(url,init))})};
 const bytes=native.review.submissionJson,hash=await sha256(bytes);const response=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:bytes}),env);
 expect(response.status).toBe(202);expect((await response.json()).id).toBe(hash);
 const record=JSON.parse(kv.get('pending/v1/'+hash));expect(record.rawJSON).toBe(bytes);expect(record).toEqual(storage.data.get('record/'+hash));expect(await checkRecord(record)).toEqual(JSON.parse(bytes));
 for(const row of JSON.parse(bytes).evidence)expect(record.report.evidence.find(e=>e.sourceIdentifier===row.sourceIdentifier)).toEqual(row);
 const local=join(scratch,'review');await fs.mkdir(join(local,'pending'),{recursive:true});await fs.writeFile(join(local,'pending',hash+'.json'),JSON.stringify(record));await fs.writeFile(join(local,'snapshot.json'),JSON.stringify({commit:'synthetic-local-only',profiles:[]}));
 await expect(createProposal(local,hash)).rejects.toThrow(/accept/);await decideReport(local,hash,'accept');const proposal=await createProposal(local,hash);const exported=JSON.stringify(proposal);
 for(const token of [hash,'sourceReportHash','sourceIdentifier','"filename"','20300115','unfamiliar-','200video','201photo','inside'])expect(exported).not.toContain(token);
 expect(JSON.parse((await fs.readFile(join(local,'decisions.jsonl'),'utf8')).trim()).id).toBe(hash);
 expect(proposal.scannerReportedMeasurements.map(e=>[e.sizeBytes,e.durationSeconds,e.bitrateKbps,e.channel,e.mode])).toEqual(record.report.evidence.map(e=>[e.sizeBytes,e.durationSeconds,e.bitrateKbps,e.channel,e.mode]));
 expect(await evidenceHash(record.report)).toBe(proposal.numericEvidenceHash);expect(await fs.readFile(join(local,'pending',hash+'.json'),'utf8')).toBe(JSON.stringify(record));
 const evidence={identities:record.report.retention.retainedIdentities,exactPairs:record.report.retention.retainedMeasurements,kvKey:'pending/v1/'+hash,bodyBytes:Buffer.byteLength(bytes),publicIdentities:0,retention:record.report.retention,storedEvidence:record.report.evidence,publicEvidence:proposal.scannerReportedMeasurements};
 if(process.env.SCANNER_EVIDENCE_OUTPUT)writeFileSync(process.env.SCANNER_EVIDENCE_OUTPUT,JSON.stringify(evidence,null,2));
 console.log('PRIVATE_IDENTITY_ROUNDTRIP',JSON.stringify(evidence));
});
test('unknown safe grammars accepted; unsafe original names and partial/mismatched/duplicate identities rejected; legacy accepted',()=>{
 for(const name of ['new vendor+token2030.MP4','S_20300115_A.MP4','fresh-pattern.M4V','照片2030.jpg'])expect(safeMediaName(name)).toBe(true);
 for(const name of ['/host/a.MP4','../a.MP4','a\\b.MP4','a\nb.MP4','a\u0085b.MP4','a\u202eb.MP4','a:stream.MP4','._a.MP4','settings.ini','GPS.txt','x'.repeat(257)+'.MP4']){
  expect(safeMediaName(name)).toBe(false);const p=JSON.parse(native.review.submissionJson);p.evidence[0].filename=name;expect(()=>validate(p)).toThrow();
 }
 for(const mutate of [p=>delete p.evidence[0].filename,p=>p.evidence[0].folder='DCIM',p=>p.evidence[1].sourceIdentifier=p.evidence[0].sourceIdentifier,p=>p.retention.omittedIdentities++,p=>p.evidence[0].sourceIdentifier='/host/path']){const p=JSON.parse(native.review.submissionJson);mutate(p);expect(()=>validate(p)).toThrow();}
 const legacy=JSON.parse(native.review.submissionJson);delete legacy.retention;for(const e of legacy.evidence)for(const k of ['filename','folder','sourceIdentifier'])delete e[k];expect(validate(legacy)).toBe(legacy);
});
test('native unsafe original names remain anonymous with explicit counts, never normalized',()=>{
 const root=join(scratch,'unsafe');mkdirSync(root);writeFileSync(join(root,'unsafe\n2030.MP4'),media());
 const p=validate(JSON.parse(scan(root).review.submissionJson));expect(p.evidence[0]).toMatchObject({durationSeconds:0.2,bitrateKbps:240});expect(p.evidence[0].filename).toBeUndefined();expect(p.retention).toMatchObject({inventoriedIdentities:1,retainedIdentities:0,omittedIdentities:1,measuredFiles:1,retainedMeasurements:1,omittedMeasurements:0});
});
test('intake-unavailable structural budgets keep linked private local evidence rather than silently dropping names',()=>{
 const root=join(scratch,'many-folders');mkdirSync(root);for(let i=0;i<33;i++){const folder=join(root,'synthetic-'+i);mkdirSync(folder);writeFileSync(join(folder,'new-camera2030.MP4'),media());}
 const review=scan(root).review;expect(review.submissionJson).toBe('');const local=JSON.parse(review.privateJson);expect(local.privateEvidence).toHaveLength(24);expect(local.privateEvidence.every(e=>e.filename==='new-camera2030.MP4'&&e.folder.startsWith('folder-')&&e.sourceIdentifier)).toBe(true);expect(local.privateRetention).toMatchObject({inventoriedIdentities:33,retainedIdentities:24,omittedIdentities:9,retainedMeasurements:24,omittedMeasurements:9});expect(review.publicJson).not.toContain('new-camera2030');
},240000);
test('late minority codec keeps both linked durations through native and intake caps with explicit omissions',()=>{
 const root=join(scratch,'minority-budget');mkdirSync(root);
 for(let i=0;i<65;i++)writeFileSync(join(root,`2030_${String(i).padStart(5,'0')}.MP4`),media(i===64,i<63?'avc1':'hvc1'));
 const p=validate(JSON.parse(scan(root).review.submissionJson));
 expect(p.retention).toEqual({inventoriedIdentities:65,retainedIdentities:24,omittedIdentities:41,measuredFiles:65,retainedMeasurements:24,omittedMeasurements:41});
 for(const [i,duration] of [[63,0.2],[64,0.1]])expect(p.evidence.find(e=>e.filename===`2030_${String(i).padStart(5,'0')}.MP4`)).toMatchObject({codec:'hevc',durationSeconds:duration,bitrateKbps:240});
 expect(p.evidence.some(e=>e.codec==='h264')).toBe(true);
 expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(16384);
},240000);
test('native budget keeps small-card all-file pairs, late short outlier and honest full inventory omission counts',()=>{
 const root=join(scratch,'budget');mkdirSync(root);for(let i=0;i<70;i++)writeFileSync(join(root,`2030_${String(i).padStart(5,'0')}.MP4`),media(i===69));
 const paths=Array.from({length:70},(_,i)=>join(root,`2030_${String(i).padStart(5,'0')}.MP4`));const before=paths.map(path=>[createHash('sha256').update(readFileSync(path)).digest('hex'),statSync(path).mtimeMs]);
 const p=validate(JSON.parse(scan(root).review.submissionJson));expect(p.retention).toEqual({inventoriedIdentities:70,retainedIdentities:24,omittedIdentities:46,measuredFiles:70,retainedMeasurements:24,omittedMeasurements:46});expect(p.evidence.find(e=>e.filename==='2030_00069.MP4')).toMatchObject({durationSeconds:0.1,bitrateKbps:240});expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(16384);
 expect(paths.map(path=>[createHash('sha256').update(readFileSync(path)).digest('hex'),statSync(path).mtimeMs])).toEqual(before);
},240000);
