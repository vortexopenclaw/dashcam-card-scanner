// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {mount,type Bridge} from '../src/ui';
const hash='a'.repeat(64);
const settle=()=>vi.advanceTimersByTimeAsync(0);
const change=(el:HTMLSelectElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();document.body.replaceChildren();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();delete document.documentElement.dataset.theme;delete document.documentElement.dataset.platform;});
function setup(){
 const root=document.createElement('main');document.body.append(root);
 let report:any={scannedFiles:2,entriesSeen:2,skipped:0,sampledFiles:0,probeAttempts:0,probeFailures:0,limited:false,cancelled:false,folders:[],cameraRecognition:{manufacturer:'Viofo',model:'A229 Pro',channelCount:2,channelSetup:'front + rear',reason:'Synthetic model-specific evidence.'}};
 const invoke=vi.fn(async(cmd:string):Promise<any>=>{
  if(cmd==='choose_source')return '/synthetic/card';if(cmd==='scan_source')return report;
  if(cmd==='prepare_review')return {token:'synthetic',publicJson:'{}',privateJson:'{}',submissionJson:'{}',payloadHash:hash,warning:''};
  if(cmd==='submit_review')return hash;return null;
 });
 const ui=mount(root,{invoke,listen:async()=>()=>{}} as Bridge);
 return {root,ui,invoke,setReport:(value:any)=>report=value};
}
test('Choose card is primary before scanning; Submit alone is the primary workflow action after success',async()=>{
 const {root,ui,invoke}=setup();expect(ui.select.classList.contains('primary')).toBe(true);expect(ui.submission.hidden).toBe(true);expect(ui.cancel.hidden).toBe(true);
 ui.select.click();await settle();expect(root.querySelector('h1')?.textContent).toBe('About your camera');expect(ui.select.textContent).toBe('Change card…');
 expect(ui.select.classList.contains('primary')).toBe(false);expect(ui.submit.classList.contains('primary')).toBe(true);
 expect(ui.scan.classList.contains('primary')).toBe(false);expect(ui.prepare.classList.contains('primary')).toBe(false);expect(ui.cancel.hidden).toBe(true);
 expect(invoke.mock.calls.filter(c=>c[0]==='submit_review')).toHaveLength(0);
 ui.submit.click();await settle();expect(invoke).toHaveBeenCalledWith('submit_review',{token:'synthetic',consent:true});expect(ui.submit.textContent).toBe('Submitted ✓');
});
test('all ordinary controls are grouped without losing input identity; help is optional and suggestions explain editability',async()=>{
 const {root,ui}=setup();ui.select.click();await settle();
 expect(ui.manufacturerPick.closest('.camera-identity')).not.toBeNull();expect(ui.modelPick.closest('.camera-identity')).not.toBeNull();
 for(const control of [ui.fields.channelSetup,ui.fields.firmware,...Object.values(ui.choices)])expect(control.closest('.camera-settings')).not.toBeNull();
 expect([...root.querySelectorAll('.camera-settings>label')].map(l=>l.querySelector('input,select'))).toEqual([ui.choices.channelCount,ui.fields.channelSetup,ui.fields.firmware,ui.choices.quality,ui.choices.parkingMode,root.querySelector('[data-frame-rate]'),root.querySelector('input[type=checkbox]')]);
 const help=root.querySelector<HTMLDetailsElement>('.context-help')!;expect(help.open).toBe(false);expect(help.textContent).toContain('owner-reported');
 expect(root.querySelector('.suggestion-note')?.textContent).toContain('You can edit it. Synthetic model-specific evidence.');
 expect(ui.submission.textContent).toContain('No footage is uploaded');expect(ui.technical.open).toBe(false);
});
test.each(['cancelled','empty'])('%s scans keep choosing a card primary and cannot submit',async(kind)=>{
 const {ui,setReport}=setup();setReport({scannedFiles:kind==='empty'?0:2,cancelled:kind==='cancelled',folders:[],probeAttempts:0,probeFailures:0,skipped:0,sampledFiles:0});ui.select.click();await settle();expect(ui.select.classList.contains('primary')).toBe(true);expect(ui.submit.disabled).toBe(true);
});
test('layout disclosures and Settings preserve Other drafts and explicit mixed setup mode',async()=>{
 const {root,ui,invoke}=setup();ui.select.click();await settle();change(ui.choices.quality,'other');const custom=ui.choices.quality.parentElement!.querySelector('input')!;custom.value='Owner quality';custom.dispatchEvent(new Event('input',{bubbles:true}));
 const help=root.querySelector<HTMLDetailsElement>('.context-help')!;help.open=true;ui.settingsButton.click();await settle();ui.theme.value='dark';ui.theme.dispatchEvent(new Event('change'));ui.scannerButton.click();
 expect(custom.value).toBe('Owner quality');expect(help.open).toBe(true);ui.addGroup.click();expect((root.querySelector('.camera-settings') as HTMLElement).hidden).toBe(true);
 ui.prepare.click();await settle();const payload=(invoke.mock.calls as unknown as [string,any][]).filter(c=>c[0]==='prepare_review').at(-1)![1];expect(payload.annotations.cohorts[0].owner.qualityLabel).toBe('Owner quality');
 expect(ui.fields.model.closest('.camera-identity')).not.toBeNull();expect(ui.choices.quality.disabled).toBe(true);
});
test('unknown source replacement clears grouped suggestions without changing app preferences',async()=>{
 const {root,ui,setReport}=setup();ui.select.click();await settle();ui.addGroup.click();change(ui.theme,'dark');setReport({scannedFiles:1,folders:[],probeAttempts:0,probeFailures:0,skipped:0,sampledFiles:0});ui.select.click();await settle();
 expect(ui.fields.model.value).toBe('');expect(ui.choices.channelCount.value).toBe('Select count');expect(ui.groupForms.children).toHaveLength(0);expect(ui.theme.value).toBe('dark');expect((root.querySelector('.camera-settings') as HTMLElement).hidden).toBe(false);expect((root.querySelector('.suggestion-note') as HTMLElement).hidden).toBe(true);
});
test.each(['macos','windows','linux'])('%s keeps grouped structure, focus/state tokens and compact action controls in both themes',platform=>{
 const {root,ui}=setup();const style=document.createElement('style');style.textContent=readFileSync('src/style.css','utf8');document.head.append(style);
 try{document.documentElement.dataset.platform=platform;for(const theme of ['light','dark']){
  document.documentElement.dataset.theme=theme;expect(getComputedStyle(root.querySelector('.camera-grid')!).display).toBe('grid');
  expect(getComputedStyle(ui.scan).borderRadius).toBe(platform==='windows'?'4px':'6px');expect(getComputedStyle(ui.select.parentElement!).flexWrap).toBe('wrap');
  for(const token of ['--focus','--invalid','--space-3','--state-bg','--disabled-opacity'])expect(getComputedStyle(document.documentElement).getPropertyValue(token)).not.toBe('');
  expect(getComputedStyle(ui.scannerButton).width).toBe(getComputedStyle(ui.settingsButton).width);
 }}finally{style.remove();}
});
