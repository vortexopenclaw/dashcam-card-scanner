// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,vi,beforeEach} from 'vitest';
import {mount,type Bridge} from '../src/ui';
import {parkingSuggestion,type TemporalParking} from '../src/parking-suggestions';
const settle=()=>new Promise(r=>setTimeout(r,0));
const change=(el:HTMLSelectElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const temporal=():TemporalParking=>({suggestion:'time_lapse_like',confidence:'likely',estimatedCaptureFps:3,inventoryComplete:true,temporalLimited:false,cohorts:[{recordingContext:'driving',suggestion:'continuous_like',confidence:'likely',adjacentPairs:8,estimatedCaptureFps:null},{recordingContext:'parking',suggestion:'time_lapse_like',confidence:'likely',adjacentPairs:12,estimatedCaptureFps:3}]});
beforeEach(()=>{document.body.replaceChildren();localStorage.clear();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
function setup(){
 let evidence:TemporalParking|undefined=temporal();
 const root=document.createElement('main');document.body.append(root);
 const invoke=vi.fn(async(cmd:string,args?:any):Promise<any>=>{if(cmd==='choose_source')return '/same/card';if(cmd==='scan_source')return {scannedFiles:24,sampledFiles:2,probeAttempts:24,probeFailures:0,entriesSeen:26,skipped:0,limited:false,cancelled:false,folders:[{path:'DCIM/Movie',fileCount:10,videos:[]},{path:'DCIM/Parking',fileCount:14,videos:[]}],cameraRecognition:{manufacturer:'Viofo',model:'A119M Pro',channelCount:1,channelSetup:'front'},parkingEvidence:{suggestion:'parking',temporal:evidence},reviewSamples:[{index:0,folderIndex:0,folder:'DCIM/Movie',filenameTemplate:'SEQUENCE.MP4',modeHint:'normal'},{index:1,folderIndex:1,folder:'DCIM/Parking',filenameTemplate:'SEQUENCE.MP4',modeHint:'parking'}]};if(cmd==='prepare_review')return {token:'test',publicJson:'{}',privateJson:'{}',submissionJson:JSON.stringify(args),payloadHash:(args.labels.suggestedFields?.length?'a':'b').repeat(64),warning:''};if(cmd==='submit_review')return 'a'.repeat(64);return null;});
 const ui=mount(root,{invoke,listen:async()=>()=>{}} as Bridge);
 const rate=root.querySelector<HTMLSelectElement>('select[data-frame-rate]')!;
 const payload=async()=>{ui.prepare.click();await settle();return invoke.mock.calls.filter(c=>c[0]==='prepare_review').at(-1)![1];};
 return {ui,root,rate,invoke,payload,setEvidence:(e:TemporalParking|undefined)=>{evidence=e;}};
}
test('mixed native driving and parking IPC prefills editable 3 fps without claiming confirmation',async()=>{
 const {ui,root,rate,payload}=setup();ui.select.click();await settle();expect(ui.choices.parkingMode.value).toBe('time-lapse');expect(rate.value).toBe('3');expect(rate.parentElement!.hidden).toBe(false);expect(root.querySelector('[data-parking-suggestion]')!.textContent).toContain('Likely time-lapse · approximately 3 fps');expect((await payload()).labels.suggestedFields).toEqual(['parkingMode','timeLapseFps']);expect(ui.humanReview.textContent).toContain('Suggested estimate (not owner-confirmed)');expect(ui.humanReview.textContent).not.toContain('Owner-reported parking setting: Time-Lapse');
 ui.settingsButton.click();await settle();ui.scannerButton.click();expect(rate.value).toBe('3');
});
test('explicit Unknown and independent manual cadence survive rescan; replacement resets both',async()=>{
 const {ui,rate,payload}=setup();ui.select.click();await settle();change(rate,'7');ui.scan.click();await settle();expect(rate.value).toBe('7');expect((await payload()).labels.suggestedFields).toEqual(['parkingMode']);change(ui.choices.parkingMode,'unknown');ui.scan.click();await settle();expect(ui.choices.parkingMode.value).toBe('unknown');expect((await payload()).labels.suggestedFields).toBeUndefined();ui.select.click();await settle();expect(ui.choices.parkingMode.value).toBe('time-lapse');expect(rate.value).toBe('3');expect((await payload()).labels.suggestedFields).toEqual(['parkingMode','timeLapseFps']);
});
test('editing even the same value removes only that provenance and updates submitted snapshot',async()=>{
 const {ui,rate,payload}=setup();ui.select.click();await settle();ui.submit.click();await settle();expect(ui.submit.textContent).toBe('Submitted ✓');expect((await payload()).labels.suggestedFields).toEqual(['parkingMode','timeLapseFps']);change(rate,'3');expect(ui.submit.disabled).toBe(false);expect((await payload()).labels.suggestedFields).toEqual(['parkingMode']);change(ui.choices.parkingMode,'time-lapse');expect((await payload()).labels.suggestedFields).toBeUndefined();
});
test('first explicit setup withholds unconfirmed global estimates, manual inheritance remains supported',async()=>{
 const {ui,payload,root}=setup();ui.select.click();await settle();ui.addGroup.click();let owner=(await payload()).annotations.cohorts[0].owner;expect(owner.parkingMode).toBe('unknown');expect(owner.timeLapseFps).toBeNull();expect(owner.suggestedFields).toBeUndefined();expect(root.textContent).toContain('Unconfirmed suggested parking');expect((await payload()).labels.suggestedFields).toBeUndefined();
});
test('event family is useful and visible but never invents a specific setting',async()=>{
 const {ui,setEvidence,root,rate,payload}=setup();const e=temporal();e.suggestion='event_like';e.confidence='possible';e.estimatedCaptureFps=null;e.cohorts[1].suggestion='event_like';e.cohorts[1].confidence='possible';setEvidence(e);ui.select.click();await settle();expect(root.querySelector('[data-parking-suggestion]')!.textContent).toContain('Possible event-like');expect(ui.choices.parkingMode.value).toBe('unknown');expect(rate.value).toBe('');expect((await payload()).labels.suggestedFields).toBeUndefined();
});
test.each([NaN,Infinity,-1,0,241])('invalid capture estimate %s never becomes cadence',async(value)=>{
 const {ui,setEvidence,rate,payload}=setup();const e=temporal();e.estimatedCaptureFps=value;setEvidence(e);ui.select.click();await settle();expect(rate.value).toBe('');expect((await payload()).labels.timeLapseFps).toBeNull();
});
test.each(['partial','capped','fewPairs','missing','conflict'])('%s scan clears stale automatic choices',async(kind)=>{
 const {ui,setEvidence,rate,payload}=setup();ui.select.click();await settle();const e=temporal();if(kind==='partial')e.inventoryComplete=false;if(kind==='capped')e.temporalLimited=true;if(kind==='fewPairs')e.cohorts[1].adjacentPairs=3;if(kind==='conflict')e.cohorts.push({...e.cohorts[1],suggestion:'event_like'});setEvidence(kind==='missing'?undefined:e);ui.scan.click();await settle();expect(rate.value).toBe('');expect(ui.choices.parkingMode.value).toBe('unknown');expect((await payload()).labels.suggestedFields).toBeUndefined();
});
test('identity changes clear automatic estimates and do not turn owner identity into authority',async()=>{
 const {ui,rate,payload}=setup();ui.select.click();await settle();ui.fields.model.value='Owner label';ui.fields.model.dispatchEvent(new Event('input',{bubbles:true}));expect(ui.choices.parkingMode.value).toBe('unknown');expect(rate.value).toBe('');ui.scan.click();await settle();expect(ui.choices.parkingMode.value).toBe('unknown');change(ui.choices.parkingMode,'time-lapse');change(rate,'7');ui.fields.manufacturer.value='Vantrue';ui.fields.manufacturer.dispatchEvent(new Event('input',{bubbles:true}));expect(rate.value).toBe('7');expect(ui.choices.parkingMode.value).toBe('time-lapse');expect((await payload()).labels.suggestedFields).toBeUndefined();
});
test.each([[2.345678,'2.346'],[1.0000001,'1']])('uncommon %s fps remains visible and reasonably rounded',async(value,expected)=>{
 const {ui,rate,setEvidence,payload}=setup();const e=temporal();e.estimatedCaptureFps=value as number;setEvidence(e);ui.select.click();await settle();expect(rate.value).toBe(expected);expect(rate.selectedOptions[0].textContent).toContain('Approximately');expect((await payload()).labels.timeLapseFps).toBe(Number(expected));
});
test('explicit Unknown cadence survives rescan independently from parking choice',async()=>{
 const {ui,rate,payload}=setup();ui.select.click();await settle();change(rate,'');ui.scan.click();await settle();expect(rate.value).toBe('');expect(ui.choices.parkingMode.value).toBe('time-lapse');expect((await payload()).labels.suggestedFields).toEqual(['parkingMode']);
});
test('qualified low-bitrate prefills only where a corresponding generic option exists',async()=>{
 const {ui,setEvidence,payload}=setup();const e=temporal();e.suggestion='low_bitrate_continuous_like';e.estimatedCaptureFps=null;e.cohorts[1].suggestion=e.suggestion;setEvidence(e);ui.select.click();await settle();expect(ui.choices.parkingMode.value).toBe('low-bitrate');expect((await payload()).labels.suggestedFields).toEqual(['parkingMode']);change(ui.choices.parkingMode,'low-bitrate');ui.fields.manufacturer.value='BlackVue';ui.fields.manufacturer.dispatchEvent(new Event('input',{bubbles:true}));expect(ui.choices.parkingMode.value).toBe('low-bitrate');expect(ui.choices.parkingMode.selectedOptions[0].textContent).toBe('Low Bitrate');expect((await payload()).labels.suggestedFields).toBeUndefined();
});
test('broad parking markers and malicious raw reasons are not a menu inference or renderer HTML',()=>{
 expect(parkingSuggestion(undefined).mode).toBeNull();const e={...temporal(),reason:'<img src=x onerror=alert(1)> /private/card'};expect(parkingSuggestion(e).text).not.toContain('/private');expect(parkingSuggestion(e).text).not.toContain('<img');
});
