// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {beforeAll,afterAll,expect,test,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mount,type Bridge} from '../src/ui';
import {validate} from '../intake/schema.js';
let scratch:string;let native:any;
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const change=(e:HTMLSelectElement,value:string)=>{e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
beforeAll(()=>{
 scratch=mkdtempSync(join(tmpdir(),'scanner-z100-flow-'));
 for(const folder of ['front','inside','rear'])mkdirSync(join(scratch,'DCIM/200video',folder),{recursive:true});
 for(const folder of ['front','inside'])writeFileSync(join(scratch,'DCIM/200video',folder,'S_20300101120100_0001_0001.mp4'),'synthetic header-unavailable video');
 native=JSON.parse(execFileSync('cargo',['run','--quiet','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',scratch,'--z100'],{encoding:'utf8',timeout:240000}));
},240000);
afterAll(()=>{if(scratch)rmSync(scratch,{recursive:true,force:true});});
test('actual native preview drives editable picker, observed channels, mode review, rescan, submission and deselection',async()=>{
 document.body.replaceChildren();localStorage.clear();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 const root=document.createElement('main');document.body.append(root);
 const report={...native.report,cameraRecognition:native.cameraRecognition,reviewSamples:native.genericContext.reviewSamples};
 const invoke=vi.fn(async(cmd:string,args?:any)=>cmd==='camera_catalog'?JSON.parse(readFileSync('src-tauri/assets/camera-catalog.json','utf8')).cameras:cmd==='choose_source'?'/synthetic':cmd==='scan_source'?report:cmd==='preview_camera_context'?(args.mainUnit?native.mainContext:native.genericContext):cmd==='prepare_review'?{...native.review,payloadHash:'a'.repeat(64),submissionAvailable:true}:cmd==='submit_review'?'a'.repeat(64):null);
 const ui=mount(root,{invoke,listen:async()=>()=>{}} as Bridge);await settle();ui.select.click();await settle();
 expect(ui.fields.model.value).toBe('');expect(ui.manufacturerPick.value).toBe('DDPAI');expect(ui.choices.channelCount.value).toBe('Select count');
 change(ui.manufacturerPick,'DDPAI');expect([...ui.modelPick.options].some(o=>o.value==='ddpai-z100-master-main')).toBe(true);
 change(ui.modelPick,'ddpai-z100-master-main');await settle();
 expect(root.textContent).toContain('Manually selected');expect(root.textContent).toContain('not a separately recording accessory');
 expect(ui.choices.channelCount.value).toBe('2');expect(ui.fields.channelSetup.value).toBe('front + telephoto');
 expect(ui.choices.parkingMode.value).toBe('unknown'); // per-file S_ evidence does not label the entire mixed card
 expect(root.querySelector<HTMLSelectElement>('select[data-frame-rate]')!.value).toBe('');
 ui.prepare.click();await settle();expect(ui.humanReview.textContent).toContain('time-lapse');expect(ui.humanReview.textContent).toContain('telephoto');
 ui.scan.click();await settle();expect(ui.choices.channelCount.value).toBe('2');
 ui.submit.click();await settle();expect(invoke.mock.calls.some(c=>c[0]==='submit_review')).toBe(true);
 const outgoing=invoke.mock.calls.filter(c=>c[0]==='prepare_review').at(-1)![1];expect(outgoing.labels).toMatchObject({manufacturer:'DDPAI',model:'Z100 Master - Main Unit',channelCount:2,timeLapseFps:null});
 change(ui.modelPick,'other');await settle();expect(ui.fields.channelSetup.value).toBe('');expect(ui.choices.channelCount.value).toBe('Select count');
 change(ui.modelPick,'ddpai-z100-master-main');await settle();change(ui.choices.channelCount,'3');ui.fields.channelSetup.value='Owner custom setup';ui.fields.channelSetup.dispatchEvent(new Event('input',{bubbles:true}));
 change(ui.manufacturerPick,'other');await settle();expect(ui.choices.channelCount.value).toBe('3');expect(ui.fields.channelSetup.value).toBe('Owner custom setup');
});
test('native submission survives actual gateway admission and stored-record readback',async()=>{
 const {default:worker,IntakeGate}=await import('../intake/worker.js');
 const {Storage}=await import('../intake/test/storage.js');
 const {webcrypto}=await import('node:crypto');
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 const records=new Map();const storage=new Storage();
 const env:any={ENABLED:'true',IP_SALT:'s'.repeat(32),ORIGIN:'https://intake.example',MAX_RECORDS:'100',MAX_STORED_BYTES:'1000000',PENDING:{put:async(k:string,v:string)=>records.set(k,v),delete:async(k:string)=>records.delete(k)}};
 const gate=new IntakeGate({storage},env);env.GATE={idFromName:(x:string)=>x,get:()=>({fetch:(url:string,init:any)=>gate.fetch(new Request(url,init))})};
 const response=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:native.review.submissionJson}),env);
 expect(response.status).toBe(202);const receipt=await response.json();
 const stored=JSON.parse(records.get('pending/v1/'+receipt.id));expect(stored.rawJSON).toBe(native.review.submissionJson);
 expect(stored.report.evidence).toEqual(JSON.parse(native.review.submissionJson).evidence);
 expect(stored.report.structure.folders.some((f:any)=>f.components.includes('inside'))).toBe(true);
});
test('real native submission retains physical channel and parking context without inventing cadence or exposing source',()=>{
 const body=JSON.parse(native.review.submissionJson);expect(validate(body)).toBe(body);
 expect(body.evidence).toEqual(expect.arrayContaining([expect.objectContaining({channel:'front',mode:'parking'}),expect.objectContaining({channel:'telephoto',mode:'unknown'})]));
 expect(body.owner.timeLapseFps).toBeUndefined();expect(native.review.submissionJson).not.toContain(scratch);expect(native.review.submissionJson).not.toContain('20300101');
 expect(body.structure.folders.some((f:any)=>f.components.includes('inside'))).toBe(true);
});
