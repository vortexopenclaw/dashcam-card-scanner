// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Native integration fixture: parent must run this under the shared heavy-job gate.
import {test,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker,{IntakeGate} from '../intake/worker.js';
import {Storage} from '../intake/test/storage.js';
import {checkRecord,anonymousProposal} from '../intake/review.js';
import {validate} from '../intake/schema.js';
import {validateDiscovery} from '../intake/discovery.js';
import {mount} from '../src/ui';
import {webcrypto} from 'node:crypto';
function box(tag,body){const size=Buffer.alloc(4);size.writeUInt32BE(body.length+8);return Buffer.concat([size,Buffer.from(tag),body]);}
function video(){const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(1000,16);const hdlr=Buffer.alloc(12);hdlr.write('vide',8);const entry=Buffer.alloc(78);entry.writeUInt16BE(1920,24);entry.writeUInt16BE(1080,26);const stsd=Buffer.concat([Buffer.from([0,0,0,0,0,0,0,1]),box('avc1',entry)]);const stsz=Buffer.alloc(12);stsz.writeUInt32BE(1,4);stsz.writeUInt32BE(30,8);return Buffer.concat([box('moov',box('trak',box('mdia',Buffer.concat([box('mdhd',mdhd),box('hdlr',hdlr),box('minf',box('stbl',Buffer.concat([box('stsd',stsd),box('stsz',stsz)])))])))),box('mdat',Buffer.alloc(30))]);}
test('generic native discovery -> editable review -> HTTP admission -> exact stored readback',async()=>{
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scanner-discovery-')));
 try{
  const corpus=JSON.parse(readFileSync('tests/reference/generic-discovery-synthetic.json','utf8'));
  for(const f of corpus.files){const p=join(root,f.path);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,f.encoding==='utf16le'?Buffer.concat([Buffer.from([255,254]),Buffer.from(f.text,'utf16le')]):f.text);}
  writeFileSync(join(root,'recording.mp4'),video());
  const native=JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',root],{encoding:'utf8',timeout:240000}));
  const d=native.report.discovery;expect(d.coverage.inventoriedCandidates).toBe(corpus.files.length+1);expect(d.coverage.inspectedFiles).toBe(corpus.files.length+1);expect(d.coverage.multipleModelValues).toBe(true);
  validateDiscovery(d);
  const peerPath=join(process.cwd(),'../ddpai-log-offloader/workers/feedback/discovery.js');
  if(existsSync(peerPath)){
   // Node loads the actual second receiver, not a duplicated test implementation.
   execFileSync(process.execPath,['--input-type=module','-e',`import {validateDiscovery} from ${JSON.stringify(peerPath)};validateDiscovery(JSON.parse(process.argv[1]));`,JSON.stringify(d)]);
  }
  if(process.env.SCANNER_DISCOVERY_FIXTURE)writeFileSync(process.env.SCANNER_DISCOVERY_FIXTURE,JSON.stringify(d));
  for(const value of ['Future-BV9','Future-VF9','Future-VT9','Rear-VT2','Unknown-X9','Rear-X2','Unknown-Log9','Unknown-U16'])expect(d.observations.some(o=>o.value===value)).toBe(true);
  expect(d.observations.some(o=>o.value==='Hidden-X1'||o.value==='Hidden-X2'||o.value==='PlatePix')).toBe(false);
  expect(d.observations.filter(o=>['version','hardware_version'].includes(o.key)).every(o=>o.field==='build'&&o.scope==='unbound')).toBe(true);
  expect(d.sources.map(s=>s.format)).toEqual(expect.arrayContaining(['ini','json','framed_json','xml','isobmff']));expect(d.sources.some(s=>s.encoding==='utf16le')).toBe(true);
  const bytes=native.review.submissionJson,p=JSON.parse(bytes);validate(p);expect(p.scan.discovery).toEqual(d);expect(p.owner).toMatchObject({manufacturer:'Synthetic',model:'Fixture',firmware:'1.0'});
  for(const forbidden of ['CANARY','wifi_pwd','owner=','unfamiliar','vantrue-menu-style',root,'rawLog'])expect(bytes).not.toContain(forbidden);
  document.body.replaceChildren();localStorage.clear();const host=document.createElement('main');document.body.append(host);let report={...native.report,cameraRecognition:native.cameraRecognition,reviewSamples:native.genericContext.reviewSamples};
  const ui=mount(host,{invoke:async cmd=>cmd==='camera_catalog'?[]:cmd==='choose_source'?'/synthetic/card':cmd==='scan_source'?report:cmd==='preview_camera_context'?native.genericContext:null,listen:async()=>()=>{}});
  const settle=()=>new Promise(resolve=>setTimeout(resolve,0));await settle();ui.select.click();await settle();
  const panel=host.querySelector('[data-discovery]');expect(panel.hidden).toBe(false);expect(panel.textContent).toContain('Future-VT9');expect(panel.textContent).toContain('identity is ambiguous');expect(ui.fields.model.value).not.toContain('Future');expect(ui.fields.firmware.value).toBe('');
  ui.fields.model.value='Owner-Label';ui.fields.model.dispatchEvent(new Event('input',{bubbles:true}));ui.fields.firmware.value='Owner-current';ui.fields.firmware.dispatchEvent(new Event('input',{bubbles:true}));ui.scan.click();await settle();expect(ui.fields.model.value).toBe('Owner-Label');expect(ui.fields.firmware.value).toBe('Owner-current');
  const zeroRoot=join(root,'coverage-only');mkdirSync(zeroRoot);writeFileSync(join(zeroRoot,'recording.mp4'),video());writeFileSync(join(zeroRoot,'opaque-data'),Buffer.alloc(65537));
  const zero=JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',zeroRoot],{encoding:'utf8',timeout:240000}));validate(JSON.parse(zero.review.submissionJson));expect(zero.report.discovery.observations).toEqual([]);expect(zero.report.discovery.coverage).toMatchObject({inventoriedCandidates:2,inspectedFiles:1,uninspectedFiles:1,retainedObservations:0,limited:true});
  report={...zero.report,cameraRecognition:zero.cameraRecognition,reviewSamples:zero.genericContext.reviewSamples};
  ui.scan.click();await settle();expect(panel.hidden).toBe(false);expect(panel.textContent).toContain('0 observations retained');expect(panel.textContent).toContain('oversize: 1');expect(panel.textContent).not.toContain('Future-VT9');
  delete report.discovery;ui.select.click();await settle();expect(panel.hidden).toBe(true);
  const storage=new Storage(),kv=new Map(),env={ENABLED:'true',IP_SALT:'s'.repeat(32),ORIGIN:'https://intake.example',MAX_RECORDS:'100',MAX_STORED_BYTES:'1000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(u,i)=>gate.fetch(new Request(u,i))})};
  const response=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:bytes}),env);expect(response.status).toBe(202);const receipt=await response.json(),stored=JSON.parse(kv.get('pending/v1/'+receipt.id));await checkRecord(stored);expect(stored.rawJSON).toBe(bytes);expect(stored.report.scan.discovery).toEqual(d);expect(stored).toEqual(storage.data.get('record/'+receipt.id));
  const zeroResponse=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.2'},body:zero.review.submissionJson}),env);expect(zeroResponse.status).toBe(202);const zeroReceipt=await zeroResponse.json(),zeroStored=JSON.parse(kv.get('pending/v1/'+zeroReceipt.id));await checkRecord(zeroStored);expect(zeroStored.rawJSON).toBe(zero.review.submissionJson);expect(zeroStored.report.scan.discovery).toEqual(zero.report.discovery);expect(zeroStored).toEqual(storage.data.get('record/'+zeroReceipt.id));
  expect(native.review.publicJson).not.toContain('discovery');expect(native.review.publicJson).not.toContain('Future-VT9');
  const stripped=JSON.stringify(anonymousProposal({report:stored.report,nested:[{discovery:d},d,d.observations[0]]}));for(const forbidden of ['discovery','Future-VT9','support-1','sourceId'])expect(stripped).not.toContain(forbidden);
 }finally{rmSync(root,{recursive:true,force:true});}
},240000);
