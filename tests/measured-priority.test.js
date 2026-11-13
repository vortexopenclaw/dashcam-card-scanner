// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,vi} from 'vitest';
import {mount} from '../src/ui';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
import worker,{IntakeGate} from '../intake/worker.js';
import {Storage} from '../intake/test/storage.js';
import {validate,sha256} from '../intake/schema.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const box=(s,...a)=>{const b=Buffer.concat(a);return Buffer.concat([u32(b.length+8),Buffer.from(s),b]);};
function media(i){const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(200+i,16);const hdlr=Buffer.alloc(24);hdlr.write('vide',8);const entry=Buffer.alloc(78);entry.writeUInt16BE(640,24);entry.writeUInt16BE(360,26);return Buffer.concat([box('moov',box('trak',box('mdia',box('mdhd',mdhd),box('hdlr',hdlr),box('minf',box('stbl',box('stsd',Buffer.alloc(4),u32(1),box('hvc1',entry)),box('stsz',Buffer.alloc(4),u32(1000+i),u32(6))))))),box('mdat',Buffer.alloc((1000+i)*6))]);}
test('photo-heavy card: every measured occurrence survives editable UI, native frozen payload and receiving exact storage',async()=>{
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 const scratch=mkdtempSync(join(realpathSync(tmpdir()),'measured-priority-'));let root=process.env.SCANNER_PRIVATE_CARD;
 try {
 if(!root){root=join(scratch,'card');mkdirSync(root);mkdirSync(join(root,'Photos'));mkdirSync(join(root,'Video'));for(let i=0;i<100;i++)writeFileSync(join(root,'Photos',`2030_${i}.JPG`),'synthetic');for(let i=0;i<23;i++)writeFileSync(join(root,'Video',`2030_${i}.MP4`),media(i));}
 const scan=labels=>JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',root],{encoding:'utf8',timeout:240000,maxBuffer:8e6,env:{...process.env,...(labels?{SCANNER_FIXTURE_LABELS:labels}:{})}}));
 const native=scan();let frozen;const labelsFile=join(scratch,'labels.json');const storage=new Storage(),kv=new Map();const env={ENABLED:'true',IP_SALT:'synthetic-offline-salt-'.repeat(3),ORIGIN:'https://intake.example',MAX_RECORDS:'10',MAX_STORED_BYTES:'1000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(url,init)=>gate.fetch(new Request(url,init))})};
 document.body.replaceChildren();localStorage.clear();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});const element=document.createElement('main');document.body.append(element);
 const invoke=vi.fn(async(cmd,args)=>{
 if(cmd==='camera_catalog')return [];if(cmd==='choose_source')return root;if(cmd==='scan_source')return {...native.report,cameraRecognition:native.cameraRecognition};
 if(cmd==='prepare_review'){writeFileSync(labelsFile,JSON.stringify(args.labels));frozen=scan(labelsFile);return frozen.review;}
 if(cmd==='submit_review'){expect(args.consent).toBe(true);const bytes=frozen.review.submissionJson;const response=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:bytes}),env);expect(response.status).toBe(202);return (await response.json()).id;}return null;
 });const ui=mount(element,{invoke,listen:async()=>()=>{}});await settle();ui.select.click();await settle();
 for(const [k,value] of Object.entries({manufacturer:process.env.SCANNER_PRIVATE_CARD?'DDPAI':'Synthetic',model:process.env.SCANNER_PRIVATE_CARD?'MINI3X':'Fixture',channelSetup:'standalone camera; physical role unknown',firmware:''})){ui.fields[k].value=value;ui.fields[k].dispatchEvent(new Event('input',{bubbles:true}));}
 ui.choices.channelCount.value='1';ui.choices.channelCount.dispatchEvent(new Event('change',{bubbles:true}));ui.submit.click();for(let i=0;i<20&&!invoke.mock.calls.some(c=>c[0]==='submit_review');i++)await settle();
 expect(invoke.mock.calls.some(c=>c[0]==='submit_review')).toBe(true);const bytes=frozen.review.submissionJson;const p=validate(JSON.parse(bytes));expect(p.retention.retainedMeasurements).toBe(23);expect(p.retention.omittedMeasurements).toBe(0);expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(16384);const rows=p.evidence.filter(e=>e.durationSeconds!==null);expect(rows.every(e=>e.codec==='hevc')).toBe(true);
 const measured=native.report.folders.flatMap(f=>f.samples.filter(s=>s.video).map(s=>({folder:f.path,filename:s.localName,v:s.video,size:s.fileSizeBytes})));expect(measured).toHaveLength(23);
 const tuple=e=>[e.sizeBytes,e.durationSeconds,e.width,e.height,e.fps,e.bitrateKbps,e.codec];
 const expected=measured.map(s=>JSON.stringify([s.size,s.v.durationSeconds,s.v.width,s.v.height,s.v.nominalFrameRate,s.v.videoBitrate/1000,s.v.codec])).sort();expect(rows.map(e=>JSON.stringify(tuple(e))).sort()).toEqual(expected);expect(new Set(rows.map(e=>e.sourceIdentifier)).size).toBe(23);expect(rows.every(e=>e.filename&&e.folder)).toBe(true);
 const hash=await sha256(bytes);for(let i=0;i<100&&!kv.has('pending/v1/'+hash);i++)await settle();const record=JSON.parse(kv.get('pending/v1/'+hash));expect(record.rawJSON).toBe(bytes);expect(record.report.evidence).toEqual(p.evidence);expect(record).toEqual(storage.data.get('record/'+hash));
 if(process.env.SCANNER_PRIVATE_OUTPUT)writeFileSync(process.env.SCANNER_PRIVATE_OUTPUT,JSON.stringify({native,frozen,record,parity:{measured:23,retained:23,omitted:0,bodyBytes:Buffer.byteLength(bytes),exactStoredReadback:true}},null,2),{mode:0o600});
 } finally {rmSync(scratch,{recursive:true,force:true});}
},240000);
