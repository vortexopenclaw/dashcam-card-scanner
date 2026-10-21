// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,vi,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {mount,type Bridge} from '../src/ui';
const hash='a'.repeat(64);
const settle=async()=>{await new Promise(r=>setTimeout(r,0));};
const input=(el:HTMLInputElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
beforeEach(()=>{document.body.replaceChildren();localStorage.clear();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
function setup(){
 const root=document.createElement('main');document.body.append(root);
 const listeners=new Map<string,(e:{payload:any})=>void>();let tokenNumber=0;
 const report={scannedFiles:2,entriesSeen:3,skipped:0,sampledFiles:2,probeAttempts:2,probeFailures:0,limited:false,cancelled:false,folders:[{path:'Movie',fileCount:2,videos:[{}]}],reviewSamples:[{index:0,folderIndex:0,folder:'Movie',filenameTemplate:'NORMAL.MP4',modeHint:'normal',roleHint:'front',video:{codec:'h264',width:1920,height:1080,nominalFrameRate:29.97002997,videoBitrate:12123456,durationSeconds:60.012345}},{index:1,folderIndex:0,folder:'Movie',filenameTemplate:'UNKNOWN.MP4'}]};
 const invoke=vi.fn(async(cmd:string,_args?:Record<string,unknown>):Promise<any>=>{if(cmd==='choose_source')return '/local/<img src=x onerror=alert(1)>';if(cmd==='scan_source')return report;if(cmd==='prepare_review')return {token:`review-${++tokenNumber}`,publicJson:'{"model":"<img src=x onerror=alert(1)>"}',privateJson:'paired-local-data',submissionJson:'{"schemaVersion":1}',payloadHash:hash,warning:'Review your labels.'};if(cmd==='submit_review')return hash;return null;});
 const ui=mount(root,{invoke,listen:async(event,handler)=>{listeners.set(event,handler);return ()=>listeners.delete(event);}} as Bridge);
 const emit=(event:string,payload:unknown)=>listeners.get(event)!({payload});
 return {ui,invoke,root,emit,report};
}
async function scan(ui:ReturnType<typeof mount>){ui.select.click();await settle();}
async function preview(ui:ReturnType<typeof mount>){await scan(ui);ui.prepare.click();await settle();}
async function submit(ui:ReturnType<typeof mount>){ui.submit.click();await settle();}
const calls=(invoke:ReturnType<typeof vi.fn>,name:string)=>invoke.mock.calls.filter(c=>c[0]===name);
test('source and payload render as literal text, never executable HTML',async()=>{const {ui,root}=setup();await preview(ui);expect(ui.source.textContent).toContain('<img');expect(ui.publicView.textContent).toContain('<img');expect(root.querySelector('img')).toBeNull();expect(ui.reviewPanel.hidden).toBe(false);});
test('scan → camera/settings → Submit prepares exact current fields and verifies in-app, without a required preview',async()=>{
 const {ui,invoke,root,emit}=setup();await scan(ui);expect(calls(invoke,'prepare_review')).toHaveLength(0);expect(calls(invoke,'submit_review')).toHaveLength(0);
 input(ui.fields.model,'Current camera');ui.choices.parkingMode.value='time-lapse';ui.choices.parkingMode.dispatchEvent(new Event('change'));await submit(ui);
 expect(ui.prepare.closest('details')!.open).toBe(false);expect(ui.technical.open).toBe(false);expect(ui.more.open).toBe(false);
 expect(calls(invoke,'prepare_review')[0][1]).toMatchObject({labels:{model:'Current camera',settings:'',parkingMode:'time-lapse'},annotations:{cohorts:[],assignmentsRequired:false}});
 expect(invoke).toHaveBeenCalledWith('begin_verification',{token:'review-1'});expect(calls(invoke,'submit_review')).toHaveLength(0);
 expect(ui.submit.disabled).toBe(true);expect(root.querySelector('input[type=password]')).toBeNull();expect(ui.submission.querySelector('input')).toBeNull();expect(root.textContent).not.toMatch(/I reviewed the exact|One-use verification ticket|Verify in browser|Recording \/ parking \/ quality settings/);
 expect(ui.fields.settings).toBeUndefined();expect(ui.choices.quality.parentElement!.textContent).toContain('Video Bitrate / Quality');expect(ui.choices.parkingMode.parentElement!.firstChild!.textContent).toBe('Parking mode');expect(ui.choices.channelCount.parentElement!.firstChild!.textContent).toBe('Channel count');expect(ui.submission.textContent).toContain('No footage is uploaded');
 emit('verification-complete',{token:'review-1',ticket:'one-use-ticket'});await settle();
 expect(invoke).toHaveBeenCalledWith('submit_review',{token:'review-1',consent:true,ticket:'one-use-ticket'});expect(ui.status.textContent).toContain('Server confirmed receipt: '+hash);
 emit('verification-complete',{token:'review-1',ticket:'one-use-ticket'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(1);
});
test('preview and navigation never upload, and a later Submit always prepares fresh bytes',async()=>{
 const {ui,invoke,emit}=setup();await preview(ui);ui.settingsButton.click();await settle();(ui.settingsPanel.lastElementChild as HTMLButtonElement).click();expect(ui.reviewPanel.hidden).toBe(false);expect(calls(invoke,'begin_verification')).toHaveLength(0);expect(calls(invoke,'submit_review')).toHaveLength(0);
 await submit(ui);expect(calls(invoke,'prepare_review')).toHaveLength(2);emit('verification-complete',{token:'review-1',ticket:'stale'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(0);emit('verification-complete',{token:'review-2',ticket:'fresh'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(1);
});
test.each(['model','firmware','username','quality','assignment'])('editing %s invalidates approval; late events are ignored',async(key)=>{
 const {ui,invoke,emit}=setup();await scan(ui);if(key==='assignment'){ui.addGroup.click();const pick=ui.sampleList.querySelector<HTMLSelectElement>('[data-sample="0"]')!;pick.value='1';pick.dispatchEvent(new Event('change'));}await submit(ui);
 if(key==='quality'){ui.choices.quality.value='high';ui.choices.quality.dispatchEvent(new Event('change'));}
 else if(key==='assignment'){const pick=ui.sampleList.querySelector<HTMLSelectElement>('[data-sample="0"]')!;pick.value='';pick.dispatchEvent(new Event('change'));}
 else input(key==='username'?ui.username:ui.fields[key],'Changed');
 expect(ui.reviewPanel.hidden).toBe(true);expect(ui.submit.disabled).toBe(false);emit('verification-complete',{token:'review-1',ticket:'stale'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(0);
});
test('replacement source and rescan reject outstanding verification events',async()=>{
 const {ui,invoke,emit}=setup();await scan(ui);await submit(ui);await scan(ui);emit('verification-complete',{token:'review-1',ticket:'stale'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(0);await submit(ui);ui.scan.click();await settle();emit('verification-complete',{token:'review-2',ticket:'stale'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(0);
});
test('unchanged-field check also rejects changes without an input event',async()=>{const {ui,invoke,emit}=setup();await scan(ui);await submit(ui);ui.fields.model.value='Unsignalled change';emit('verification-complete',{token:'review-1',ticket:'stale'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(0);});
test('double Submit and duplicate completion while uploading do not send twice; success waits for receipt',async()=>{
 const {ui,invoke,emit}=setup();let resolve!:(value:string)=>void;const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>cmd==='submit_review'?new Promise<string>(r=>resolve=r):base(cmd,args));await scan(ui);ui.submit.click();ui.submit.click();await settle();ui.submit.click();expect(calls(invoke,'prepare_review')).toHaveLength(1);
 emit('verification-complete',{token:'review-1',ticket:'one-use'});emit('verification-complete',{token:'review-1',ticket:'one-use'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(1);expect(ui.status.textContent).not.toContain('Server confirmed');expect(ui.submit.disabled).toBe(true);expect(ui.select.disabled).toBe(true);resolve(hash);await settle();expect(ui.status.textContent).toContain('Server confirmed receipt: '+hash);
});
test.each(['verification-cancelled','verification-failed'])('%s permits a fresh explicit retry, not an automatic upload',async(event)=>{
 const {ui,invoke,emit}=setup();await scan(ui);await submit(ui);emit(event,{token:'unrelated'});expect(ui.submit.disabled).toBe(true);emit(event,{token:'review-1'});expect(ui.status.textContent).toContain('retry');expect(ui.submit.disabled).toBe(false);expect(calls(invoke,'submit_review')).toHaveLength(0);await submit(ui);emit('verification-complete',{token:'review-1',ticket:'old'});expect(calls(invoke,'submit_review')).toHaveLength(0);emit('verification-complete',{token:'review-2',ticket:'new'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(1);
});
test('verification startup errors permit explicit retry',async()=>{
 const {ui,invoke}=setup();const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>{if(cmd==='begin_verification')throw Error('window unavailable');return base(cmd,args);});await scan(ui);await submit(ui);expect(ui.status.textContent).toContain('window unavailable');expect(ui.submit.disabled).toBe(false);await submit(ui);expect(calls(invoke,'begin_verification')).toHaveLength(2);expect(calls(invoke,'submit_review')).toHaveLength(0);
});
test.each([null,'','different-digest'])('missing or mismatched receipt %s is not success and requires re-verification',async(receipt)=>{
 const {ui,invoke,emit}=setup();const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>cmd==='submit_review'?receipt:base(cmd,args));await scan(ui);await submit(ui);emit('verification-complete',{token:'review-1',ticket:'used'});await settle();expect(ui.status.textContent).toContain('No valid server receipt');expect(ui.status.textContent).not.toContain('Server confirmed');expect(ui.submit.disabled).toBe(false);emit('verification-complete',{token:'review-1',ticket:'used'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(1);await submit(ui);expect(calls(invoke,'begin_verification')).toHaveLength(2);
});
test('failed upload discards the ticket and retries with a new verification',async()=>{
 const {ui,invoke,emit}=setup();const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>{if(cmd==='submit_review')throw Error('offline');return base(cmd,args);});await scan(ui);await submit(ui);emit('verification-complete',{token:'review-1',ticket:'used'});await settle();expect(ui.status.textContent).toContain('offline');emit('verification-complete',{token:'review-1',ticket:'used'});expect(calls(invoke,'submit_review')).toHaveLength(1);await submit(ui);expect(calls(invoke,'begin_verification')).toHaveLength(2);
});
test('sample modes use only native hints, not global owner parking; display rounded measurements',async()=>{
 const {ui}=setup();await scan(ui);ui.choices.parkingMode.value='time-lapse';ui.choices.parkingMode.dispatchEvent(new Event('change'));ui.prepare.click();await settle();const detail=ui.humanReview.querySelector('details')!;expect(detail.open).toBe(false);expect(detail.textContent).toContain('owner-reported context');expect(detail.textContent).toContain('Recording mode: normal · Channel role: front');expect(detail.textContent).toContain('Recording mode: unknown · Channel role: unknown');expect(detail.textContent).toContain('12.12 Mbps');expect(detail.textContent).toContain('29.97 playback fps');expect(detail.textContent).toContain('60 seconds');expect(detail.textContent).not.toContain('Recording mode: time-lapse');
});
test('late preparation after an edit is discarded before opening verification',async()=>{
 const {ui,invoke}=setup();let resolve!:(value:unknown)=>void;const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>cmd==='prepare_review'?new Promise(r=>resolve=r):base(cmd,args));await scan(ui);ui.submit.click();await settle();input(ui.fields.model,'Changed during preparation');resolve({token:'stale',publicJson:'{}',submissionJson:'{}',privateJson:'{}',payloadHash:'hash',warning:''});await settle();expect(calls(invoke,'begin_verification')).toHaveLength(0);expect(calls(invoke,'submit_review')).toHaveLength(0);expect(ui.reviewPanel.hidden).toBe(true);expect(ui.submit.disabled).toBe(false);
});
test('completion before begin_verification resolves keeps upload busy until receipt',async()=>{
 const {ui,invoke,emit}=setup();let opened!:()=>void;let uploaded!:(value:string)=>void;const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>cmd==='begin_verification'?new Promise<void>(r=>opened=r):cmd==='submit_review'?new Promise<string>(r=>uploaded=r):base(cmd,args));await scan(ui);ui.submit.click();await settle();emit('verification-complete',{token:'review-1',ticket:'ticket'});opened();await settle();expect(ui.submit.disabled).toBe(true);expect(ui.select.disabled).toBe(true);ui.submit.click();expect(calls(invoke,'prepare_review')).toHaveLength(1);uploaded(hash);await settle();expect(ui.status.textContent).toContain('Server confirmed receipt');
});
test('Settings navigation preserves pending consent but blocks update work until verification ends',async()=>{
 const {ui,invoke,emit}=setup();await scan(ui);await submit(ui);ui.settingsButton.click();await settle();expect(ui.settingsPanel.hidden).toBe(false);expect(calls(invoke,'check_update')).toHaveLength(0);expect(ui.updateAction.disabled).toBe(true);(ui.settingsPanel.lastElementChild as HTMLButtonElement).click();emit('verification-complete',{token:'review-1',ticket:'ticket'});await settle();expect(calls(invoke,'submit_review')).toHaveLength(1);
});
test('local exports stay optional and use prepared native tokens without uploading',async()=>{
 const {ui,invoke}=setup();await preview(ui);const save=ui.more.querySelector('button')!;save.click();await settle();expect(invoke).toHaveBeenCalledWith('export_review',{token:'review-1',kind:'public'});expect(calls(invoke,'submit_review')).toHaveLength(0);expect(calls(invoke,'begin_verification')).toHaveLength(0);
});
test('body/report CSS enables selection and limits opt-outs to chrome',()=>{
 const css=readFileSync('src/style.css','utf8');expect(css).toContain('body{user-select:text;-webkit-user-select:text}');expect(css).toContain('input,textarea,pre{user-select:text;-webkit-user-select:text}');expect(css).toContain('button,summary,select,.brand-icon{user-select:none;-webkit-user-select:none}');
});
test('cancel scan remains a dedicated backend command',async()=>{const {ui,invoke}=setup();ui.cancel.disabled=false;ui.cancel.click();await settle();expect(invoke).toHaveBeenCalledWith('cancel_scan');});
