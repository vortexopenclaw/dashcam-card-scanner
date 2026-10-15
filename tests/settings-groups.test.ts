// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,vi,beforeEach} from 'vitest';
import {mount,type Bridge} from '../src/ui';
import {followTheme,loadSettings,saveSettings} from '../src/settings';
const settle=()=>new Promise(r=>setTimeout(r,0));
beforeEach(()=>{localStorage.clear();document.body.replaceChildren();});
test('scan-review-submit is primary; Settings-only theme, secondary save and collapsed technical detail',async()=>{
 const {ui,root}=setup(false);expect(ui.theme.closest('section')).toBe(ui.settingsPanel);expect(ui.settingsPanel.hidden).toBe(true);expect(root.lastElementChild?.tagName).toBe('DETAILS');expect(root.lastElementChild?.textContent).toContain('About scanning');expect(root.textContent).not.toContain('Scan read-only');
 await scan(ui);ui.prepare.click();await settle();expect(ui.submissionStatus.textContent).toContain('Online submission is currently unavailable');expect(ui.submit.disabled).toBe(true);expect(ui.verification.hidden).toBe(true);expect(ui.technical.open).toBe(false);expect(ui.more.open).toBe(false);expect(ui.more.textContent).toContain('Keep a local copy or share manually if online submission is unavailable');expect(ui.more.querySelector('button')?.textContent).toBe('Save report to file…');expect(ui.humanReview.textContent).toContain('4 files');expect(ui.humanReview.querySelector('pre')).toBeNull();
 ui.consent.checked=true;ui.ticket.value='ticket';ui.ticket.dispatchEvent(new Event('input'));expect(ui.submit.disabled).toBe(true);
});
function setup(submissionAvailable?:boolean){
 const root=document.createElement('main');document.body.append(root);
 const video={codec:'h264',width:1920,height:1080,nominalFrameRate:30,videoBitrate:12000000};
 const report={scannedFiles:4,entriesSeen:5,skipped:0,sampledFiles:4,probeAttempts:4,probeFailures:0,limited:false,cancelled:false,folders:[{path:'DCIM/Movie',fileCount:4,videos:[video]}],reviewSamples:[0,1,2,3].map(index=>({index,folderIndex:0,folder:'DCIM/Movie',localName:`PRIVATE-${index}.MP4`,filenameTemplate:index<2?'SEQUENCEF.MP4':'SEQUENCEPF.MP4',video}))};
 const invoke=vi.fn(async(cmd:string)=>{if(cmd==='choose_source')return '/local/card';if(cmd==='scan_source')return report;if(cmd==='prepare_review')return {submissionAvailable,token:'new',publicJson:'{}',privateJson:'{}',submissionJson:'{"schemaVersion":1}',payloadHash:'a'.repeat(64),warning:'bounded'};return null;});
 const ui=mount(root,{invoke,listen:async()=>()=>{}} as Bridge);return {ui,root,invoke};
}
async function scan(ui:ReturnType<typeof mount>){ui.select.click();await settle();ui.scan.click();await settle();}
function change(el:HTMLSelectElement,value:string){el.value=value;el.dispatchEvent(new Event('change'));}
test('default system theme follows OS changes; explicit theme ignores OS; cleanup removes listener',()=>{
 expect(loadSettings().theme).toBe('system');let listener=()=>{};const media={matches:false,addEventListener:vi.fn((_n:string,fn:()=>void)=>listener=fn),removeEventListener:vi.fn()} as unknown as MediaQueryList;
 const doc=document.createElement('html');let stop=followTheme('system',doc,media);expect(doc.dataset.theme).toBe('light');Object.assign(media,{matches:true});listener();expect(doc.dataset.theme).toBe('dark');stop();expect(media.removeEventListener).toHaveBeenCalled();
 stop=followTheme('light',doc,media);listener();expect(doc.dataset.theme).toBe('light');stop();
});
test('settings persist only theme and username, corrupted/blocked storage fails safely',()=>{
 saveSettings({theme:'dark',username:'TestUser',secret:'never'} as never);expect(loadSettings()).toEqual({theme:'dark',username:'TestUser'});expect(Object.keys(JSON.parse(localStorage.getItem(localStorage.key(0)!)!)).sort()).toEqual(['theme','username']);localStorage.setItem(localStorage.key(0)!,'broken');expect(loadSettings()).toEqual({theme:'system',username:''});expect(saveSettings({theme:'light',username:''},{setItem:()=>{throw Error('blocked')}} as unknown as Storage)).toBe(false);
});
test('full sidebar branding, settings and local username reuse never pre-opt in',()=>{
 const first=setup();expect(first.root.querySelector('aside')?.textContent).toContain('Dashcam Card Scanner');first.ui.settingsButton.click();expect(first.ui.settingsPanel.hidden).toBe(false);change(first.ui.theme,'dark');first.ui.username.value='PrivateUser';first.ui.username.dispatchEvent(new Event('input'));const next=setup();expect(next.ui.username.value).toBe('PrivateUser');expect(next.ui.theme.value).toBe('dark');expect(next.ui.includeUsername.checked).toBe(false);
});
test('mixed 2CH/3CH sample membership is explicit disjoint and settings never applied to whole card',async()=>{
 const {ui,root,invoke}=setup();await scan(ui);expect(ui.sampleList.textContent).toContain('4 unassigned');expect(ui.sampleList.querySelectorAll('article')).toHaveLength(2);ui.addGroup.click();ui.addGroup.click();
 change(root.querySelector('[data-group="1"][data-setting="channelCount"]')!,'2');change(root.querySelector('[data-group="2"][data-setting="channelCount"]')!,'3');change(root.querySelector('[data-group="1"][data-setting="parkingMode"]')!,'time-lapse');
 const rate=ui.groupForms.querySelector<HTMLInputElement>('input[type=number]')!;rate.value='1';rate.dispatchEvent(new Event('input'));
 for(const index of [0,1,2,3])change(ui.sampleList.querySelector(`[data-sample="${index}"]`)! ,index<2?'1':'2');
 expect(ui.sampleList.textContent).toContain('0 unassigned');expect(ui.choices.parkingMode.disabled).toBe(true);ui.prepare.click();await settle();
 const args=(invoke.mock.calls as unknown as [string,any][]).find(c=>c[0]==='prepare_review')![1];expect(args.annotations.cohorts.map((c:any)=>c.evidenceIndices)).toEqual([[0,1],[2,3]]);expect(args.annotations.cohorts.map((c:any)=>c.owner.channelCount)).toEqual([2,3]);expect(args.annotations.cohorts[0].owner.timeLapseFps).toBe(1);expect(JSON.stringify(args)).not.toContain('PRIVATE-');expect(args.annotations.contributor).toBeNull();
 ui.consent.checked=true;ui.ticket.value='stale-ticket';change(ui.sampleList.querySelector('[data-sample="0"]')!,'2');expect(ui.reviewPanel.hidden).toBe(true);expect(ui.consent.checked).toBe(false);expect(ui.ticket.value).toBe('');
});
test('username inclusion requires explicit checkbox and edits clear review/consent/ticket',async()=>{
 const {ui,invoke}=setup();ui.username.value='PrivateUser';ui.username.dispatchEvent(new Event('input'));await scan(ui);ui.prepare.click();await settle();let calls=invoke.mock.calls as unknown as [string,any][];expect(calls.filter(c=>c[0]==='prepare_review').at(-1)![1].annotations.contributor).toBeNull();
 ui.includeUsername.checked=true;ui.includeUsername.dispatchEvent(new Event('change'));expect(ui.reviewPanel.hidden).toBe(true);ui.prepare.click();await settle();expect(calls.filter(c=>c[0]==='prepare_review').at(-1)![1].annotations.contributor).toEqual({dashcamTalkUsername:'PrivateUser'});
 ui.consent.checked=true;ui.ticket.value='old';ui.username.value='Changed';ui.username.dispatchEvent(new Event('input'));expect(ui.includeUsername.checked).toBe(false);expect(ui.reviewPanel.hidden).toBe(true);expect(ui.consent.checked).toBe(false);expect(ui.ticket.value).toBe('');
});
