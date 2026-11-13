// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Native integration fixture: parent must run this under the shared heavy-job gate.
import {test,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker,{IntakeGate} from '../intake/worker.js';
import {Storage} from '../intake/test/storage.js';
import {checkRecord,anonymousProposal} from '../intake/review.js';
import {validate} from '../intake/schema.js';
import {mount} from '../src/ui';
import {webcrypto} from 'node:crypto';
function box(tag,body){const size=Buffer.alloc(4);size.writeUInt32BE(body.length+8);return Buffer.concat([size,Buffer.from(tag),body]);}
function video(){const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(1000,16);const hdlr=Buffer.alloc(12);hdlr.write('vide',8);const entry=Buffer.alloc(78);entry.writeUInt16BE(1920,24);entry.writeUInt16BE(1080,26);const stsd=Buffer.concat([Buffer.from([0,0,0,0,0,0,0,1]),box('avc1',entry)]);const stsz=Buffer.alloc(12);stsz.writeUInt32BE(1,4);stsz.writeUInt32BE(30,8);return Buffer.concat([box('moov',box('trak',box('mdia',Buffer.concat([box('mdhd',mdhd),box('hdlr',hdlr),box('minf',box('stbl',Buffer.concat([box('stsd',stsd),box('stsz',stsz)])))])))),box('mdat',Buffer.alloc(30))]);}
test('real-shaped structured log through normal native scan, prepared private envelope and exact receiving stored readback',async()=>{
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 const root=realpathSync(mkdtempSync(join(tmpdir(),'scanner-ddpai-log-')));
 try{
  for(const folder of ['front','inside','rear']){mkdirSync(join(root,'DCIM/200video',folder),{recursive:true});writeFileSync(join(root,'DCIM/200video',folder,'20300101120000_0001_0001.mp4'),video());}
  // Replay sanitized actual ANSI structure, never owner filenames/timestamps.
  mkdirSync(join(root,'DCIM/207log/ui'),{recursive:true});const lines=JSON.parse(readFileSync('tests/reference/ddpai-ansi-framing.json','utf8'));writeFileSync(join(root,'DCIM/207log/ui/ui_20300101120000_000.log'),lines.join('\n'));
  writeFileSync(join(root,'DCIM/200video/front/S_20300101120100_0001_0001.mp4'),video());
  writeFileSync(join(root,'DCIM/200video/rear/Q_20300101120100_0001_A.mp4'),video());
  const native=JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',root],{encoding:'utf8',timeout:240000}));
  expect(native.cameraRecognition.model).toBe('Z100 Master');expect(native.genericContext.channelEvidence.count).toBe(3);expect(native.genericContext.reviewSamples.some(s=>s.roleHint==='telephoto')).toBe(true);
  const bytes=native.review.submissionJson,p=JSON.parse(bytes);validate(p);expect(p.scan.componentMetadata).toEqual(native.report.componentMetadata);expect(p.scan.componentMetadataCoverage).toEqual(native.report.componentMetadataCoverage);expect(p.scan.componentMetadata).toHaveLength(6);expect(p.scan.componentMetadataCoverage.limited).toBe(false);expect(p.scan.componentMetadata[0]).toMatchObject({model:'Z100 Master',firmwareVersion:'8.0.0.23',sourceLine:1});
  for(const row of p.scan.componentMetadata.filter(r=>r.component!=='logging_device'))expect(row).toMatchObject({model:null,reportedModel:'DDPAI DR4004',firmwareVersion:'v9.0.0.17',identityEstablished:false});expect(p.owner.firmware).toBe('1.0');
  expect(p.evidence.find(e=>e.filename.startsWith('Q_'))).toMatchObject({channel:'rear',mode:'parking'});
  expect(native.genericContext.reviewSamples.find(s=>s.localName.startsWith('Q_')).modeEvidence).toMatchObject({context:'parking',parkingSubtype:'time-lapse',trigger:'unknown'});
  // Actual native output, not mocked parsing, drives the editable frontend.
  document.body.replaceChildren();localStorage.clear();const host=document.createElement('main');document.body.append(host);
  const report={...native.report,cameraRecognition:native.cameraRecognition,reviewSamples:native.genericContext.reviewSamples};
  const ui=mount(host,{invoke:async cmd=>cmd==='camera_catalog'?[]:cmd==='choose_source'?'/synthetic/card':cmd==='scan_source'?report:cmd==='preview_camera_context'?native.genericContext:null,listen:async()=>()=>{}});
  const settle=()=>new Promise(resolve=>setTimeout(resolve,0));await settle();ui.select.click();await settle();
  expect(ui.fields.model.value).toBe('Z100 Master');expect(ui.fields.firmware.value).toBe('');expect(host.textContent).toContain('DR4004');
  ui.fields.firmware.value='owner-current';ui.fields.firmware.dispatchEvent(new Event('input',{bubbles:true}));ui.choices.channelCount.value='4';ui.choices.channelCount.dispatchEvent(new Event('change',{bubbles:true}));ui.scan.click();await settle();
  expect(ui.fields.firmware.value).toBe('owner-current');expect(ui.choices.channelCount.value).toBe('4');expect(ui.choices.parkingMode.value).toBe('unknown');
  const storage=new Storage(),kv=new Map(),env={ENABLED:'true',IP_SALT:'s'.repeat(32),ORIGIN:'https://intake.example',MAX_RECORDS:'100',MAX_STORED_BYTES:'1000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(u,i)=>gate.fetch(new Request(u,i))})};
  const response=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:bytes}),env);expect(response.status).toBe(202);const receipt=await response.json(),stored=JSON.parse(kv.get('pending/v1/'+receipt.id));await checkRecord(stored);expect(stored.rawJSON).toBe(bytes);expect(stored.report.scan).toEqual(p.scan);expect(stored).toEqual(storage.data.get('record/'+receipt.id));
  for(const forbidden of ['wifi_pwd','wifi_ssid','sn_code','bt_info','<omitted>',root])expect(bytes).not.toContain(forbidden);
  for(const privateField of ['componentMetadata','207log','8.0.0.23','DR4004']){expect(native.review.publicJson).not.toContain(privateField);expect(JSON.stringify(anonymousProposal(stored.report))).not.toContain(privateField);}
 }finally{rmSync(root,{recursive:true,force:true});}
},240000);
