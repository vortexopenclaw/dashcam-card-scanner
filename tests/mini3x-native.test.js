// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import worker,{IntakeGate} from '../intake/worker.js';
import {Storage} from '../intake/test/storage.js';
import {checkRecord,anonymousProposal} from '../intake/review.js';
import {validate} from '../intake/schema.js';
import {mount} from '../src/ui';
test.skipIf(!process.env.MINI3X_NATIVE_RECEIPT)('authorized real native scan to editable UI and exact local receiver storage',async()=>{
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 const native=JSON.parse(readFileSync(process.env.MINI3X_NATIVE_RECEIPT,'utf8'));
 expect(native.cameraRecognition.model).toBe('MINI3X');
 expect(native.report.scannedFiles).toBe(304);
 expect(native.report.metadataCoverage.measuredFiles).toBe(23);
 expect(native.report.componentMetadata).toHaveLength(5);
 for(const row of native.report.componentMetadata)expect(row).toMatchObject({component:'logging_device',model:'MINI3X',firmwareVersion:'v9.0.1.10',sourceKind:'ddpai_product_info'});
 const bytes=native.review.submissionJson,p=JSON.parse(bytes);validate(p);
 document.body.replaceChildren();localStorage.clear();const host=document.createElement('main');document.body.append(host);
 const report={...native.report,cameraRecognition:native.cameraRecognition,reviewSamples:native.genericContext.reviewSamples};
 const ui=mount(host,{invoke:async cmd=>cmd==='camera_catalog'?[]:cmd==='choose_source'?'/synthetic/card':cmd==='scan_source'?report:cmd==='preview_camera_context'?native.genericContext:null,listen:async()=>()=>{}});
 const settle=()=>new Promise(resolve=>setTimeout(resolve,0));await settle();ui.select.click();await settle();
 expect(ui.fields.model.value).toBe('MINI3X');expect(host.textContent).toContain('v9.0.1.10');
 expect(native.genericContext.reviewSamples.every(s=>s.roleHint!=='telephoto')).toBe(true);
 expect(p.evidence.length).toBeGreaterThan(0);expect(p.retention.measuredFiles).toBe(23);expect(p.retention.retainedMeasurements+p.retention.omittedMeasurements).toBe(23);expect(p.evidence.filter(e=>e.durationSeconds!==null).every(e=>e.codec==='hevc')).toBe(true);
 const storage=new Storage(),kv=new Map(),env={ENABLED:'true',IP_SALT:'s'.repeat(32),ORIGIN:'https://intake.example',MAX_RECORDS:'100',MAX_STORED_BYTES:'1000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};
 const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(u,i)=>gate.fetch(new Request(u,i))})};
 const response=await worker.fetch(new Request(env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:bytes}),env);expect(response.status).toBe(202);
 const receipt=await response.json(),stored=JSON.parse(kv.get('pending/v1/'+receipt.id));await checkRecord(stored);expect(stored.rawJSON).toBe(bytes);expect(stored.report).toEqual(p);expect(stored).toEqual(storage.data.get('record/'+receipt.id));
 for(const forbidden of ['password','uuid','chipsn','macaddr','/Volumes/'])expect(bytes).not.toContain(forbidden);
 expect(JSON.stringify(anonymousProposal(stored.report))).not.toContain('ddpai_product_info');
});
