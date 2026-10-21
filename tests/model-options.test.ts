// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {beforeEach,test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {modelOptions,mergeModelOptions,modelOptionLabel} from '../src/model-options';
import {mount,type Bridge} from '../src/ui';
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const change=(el:HTMLSelectElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const input=(el:HTMLInputElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
const pickModel=(ui:ReturnType<typeof mount>,name:string)=>change(ui.modelPick,[...ui.modelPick.options].find(o=>o.textContent===name)!.value);
const hash='a'.repeat(64);
function setup(recognition?:Record<string,unknown>,native:unknown=[]){
 const root=document.createElement('main');document.body.append(root);
 const report={cameraRecognition:recognition,scannedFiles:1,folders:[],probeAttempts:0,probeFailures:0};
 const invoke=vi.fn(async(cmd:string,_args?:Record<string,unknown>):Promise<any>=>{
  if(cmd==='camera_catalog')return native;if(cmd==='choose_source')return '/synthetic/card';if(cmd==='scan_source')return report;
  if(cmd==='prepare_review')return {token:'test',publicJson:'{}',privateJson:'{}',submissionJson:'{}',payloadHash:hash,warning:''};
  if(cmd==='submit_review')return hash;return null;
 });
 return {ui:mount(root,{invoke,listen:async()=>()=>{}} as Bridge),invoke,report,root};
}
const prepared=(invoke:ReturnType<typeof vi.fn>)=>invoke.mock.calls.filter(c=>c[0]==='prepare_review').at(-1)![1] as any;
beforeEach(()=>{document.body.replaceChildren();localStorage.clear();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
test('UI roster has official source evidence, unique identities and no recognition data or maximum channel counts',()=>{
 const brands=new Set(modelOptions.map(c=>c.manufacturer));
 for(const brand of ['Viofo','Vantrue','Thinkware','BlackVue','Garmin','Nextbase','70mai','Rexing','Rove','Wolfbox','Vueroid'])expect(brands.has(brand)).toBe(true);
 expect(modelOptions.length).toBeGreaterThan(100);expect(new Set(modelOptions.map(c=>c.manufacturer.toLowerCase()+'|'+c.model.toLowerCase())).size).toBe(modelOptions.length);
 for(const c of modelOptions){expect(c.source).toMatch(/^https:\/\//);expect(c).not.toHaveProperty('patterns');expect(c).not.toHaveProperty('channelCount');expect(c).not.toHaveProperty('channelSetup');}
 const prerelease=modelOptions.find(c=>c.model==='E1 Pro S')!;expect(prerelease.provenance).toBe('owner-provided-prerelease');expect(prerelease.fixedSingleChannel).toBe(true);expect(modelOptionLabel(prerelease)).toBe('E1 Pro S');
});
test('merge deduplicates native identities case-insensitively, retains native IDs/exact strings, and never trusts their maximums',()=>{
 const merged=mergeModelOptions([{id:'native-single',manufacturer:'VANTRUE',model:'E1 Pro'},{id:'native-multi',manufacturer:'Vantrue',model:'N5S'}]);
 expect(merged.filter(c=>c.model==='E1 Pro')).toHaveLength(1);expect(merged.find(c=>c.model==='E1 Pro')).toMatchObject({id:'native-single',manufacturer:'VANTRUE',fixedSingleChannel:true});
 expect(merged.find(c=>c.id==='native-multi')?.fixedSingleChannel).toBe(false);
});
test.each(['WM1','VS1','A119 V3','A119 MINI','A119 MINI 2','A119M Pro'])('Viofo %s prefills a single front channel',async(model)=>{
 const {ui}=setup();await settle();ui.select.click();await settle();change(ui.manufacturerPick,'Viofo');pickModel(ui,model);expect(ui.choices.channelCount.value).toBe('1');expect(ui.fields.channelSetup.value).toBe('front');
});
test('verified single channel prefills; multicamera, native maximum and unknown models do not',async()=>{
 const {ui}=setup(undefined,[{id:'max',manufacturer:'Vantrue',model:'N5S',channelCount:4,channelSetup:'front + rear + cabin'}]);
 await settle();ui.select.click();await settle();change(ui.manufacturerPick,'Vantrue');pickModel(ui,'E1 Lite');expect(ui.choices.channelCount.value).toBe('1');expect(ui.fields.channelSetup.value).toBe('front');
 pickModel(ui,'N5S');expect(ui.choices.channelCount.value).toBe('Select count');expect(ui.fields.channelSetup.value).toBe('');
 pickModel(ui,'E1 Pro S');expect(ui.choices.channelCount.value).toBe('1');expect(ui.fields.model.value).toBe('E1 Pro S');
 change(ui.modelPick,'other');expect(ui.choices.channelCount.value).toBe('Select count');expect(ui.fields.channelSetup.value).toBe('');
 change(ui.manufacturerPick,'Viofo');pickModel(ui,'A329S 1CH');expect(ui.choices.channelCount.value).toBe('Select count');pickModel(ui,'A119 MINI 2');expect(ui.choices.channelCount.value).toBe('1');
});
test('explicit owner count/setup, including unknown, survive model changes, rescan and navigation until source replacement',async()=>{
 const {ui}=setup();await settle();ui.select.click();await settle();change(ui.manufacturerPick,'Vantrue');pickModel(ui,'E1');change(ui.choices.channelCount,'3');input(ui.fields.channelSetup,'owner setup');pickModel(ui,'E1 Lite');expect(ui.choices.channelCount.value).toBe('3');expect(ui.fields.channelSetup.value).toBe('owner setup');
 ui.scan.click();await settle();ui.settingsButton.click();await settle();ui.scannerButton.click();expect(ui.choices.channelCount.value).toBe('3');expect(ui.fields.channelSetup.value).toBe('owner setup');
 change(ui.choices.channelCount,'Select count');pickModel(ui,'E1 Pro');expect(ui.choices.channelCount.value).toBe('Select count');
 ui.select.click();await settle();change(ui.manufacturerPick,'Vantrue');pickModel(ui,'E1');expect(ui.choices.channelCount.value).toBe('1');
});
test.each([['E1 Lite','1'],['N5S','Select count']])('native exact identity %s without observed channels only gets a verified fixed-single suggestion',async(model,count)=>{
 const {ui}=setup({manufacturer:'Vantrue',model});ui.select.click();await settle();expect(ui.fields.model.value).toBe(model);expect(ui.choices.channelCount.value).toBe(count);
});
test('candidate-only recognition does not promote dropdown roster entries into an identified camera',async()=>{
 const {ui}=setup({manufacturer:'Vantrue',candidates:[{model:'E1 Lite'}]});ui.select.click();await settle();expect(ui.fields.model.value).toBe('');expect(ui.choices.channelCount.value).toBe('Select count');
});
test('native observed channels remain independent of model choice',async()=>{
 const {ui}=setup({manufacturer:'Vantrue',model:'N5S',channelCount:2,channelSetup:'front + rear'});ui.select.click();await settle();expect(ui.choices.channelCount.value).toBe('2');pickModel(ui,'N4S');expect(ui.choices.channelCount.value).toBe('2');expect(ui.fields.channelSetup.value).toBe('front + rear');
});
test('UI choices survive native catalog rejection without changing recognition evidence',async()=>{
 const root=document.createElement('main');document.body.append(root);const invoke=vi.fn(async(cmd:string)=>{if(cmd==='camera_catalog')throw Error('unavailable');return null;});const ui=mount(root,{invoke,listen:async()=>()=>{}} as Bridge);await settle();change(ui.manufacturerPick,'Garmin');pickModel(ui,'Dash Cam Mini 3');expect(ui.choices.channelCount.value).toBe('1');expect(invoke).toHaveBeenCalledWith('camera_catalog');expect(root.textContent).toContain('not a list of models the scanner can recognize');
});
test('late native catalog changes only option IDs, preserving selected UI identity, owner settings and prepared review',async()=>{
 let resolve!:(value:unknown)=>void;const pending=new Promise(r=>resolve=r);const {ui,invoke}=setup(undefined,pending);ui.select.click();await settle();change(ui.manufacturerPick,'Vantrue');pickModel(ui,'E1 Pro');change(ui.choices.channelCount,'2');input(ui.fields.channelSetup,'owner channels');change(ui.choices.quality,'vantrue-platepix');ui.prepare.click();await settle();expect(ui.reviewPanel.hidden).toBe(false);
 resolve([{id:'native-e1pro',manufacturer:'Vantrue',model:'E1 Pro',channelCount:1,channelSetup:'front'}]);await settle();expect(ui.modelPick.value).toBe('native-e1pro');expect(ui.fields.model.value).toBe('E1 Pro');expect(ui.choices.channelCount.value).toBe('2');expect(ui.fields.channelSetup.value).toBe('owner channels');expect(ui.choices.quality.value).toBe('vantrue-platepix');expect(ui.reviewPanel.hidden).toBe(false);expect(prepared(invoke).labels).toMatchObject({model:'E1 Pro',channelCount:2,quality:'other',qualityLabel:'PlatePix'});
});
test.each([['vantrue-standard','Standard'],['vantrue-platepix','PlatePix']])('%s round trips exact label through simple preview, groups and back without custom text or bitrate tier',async(value,label)=>{
 const {ui,invoke}=setup();ui.select.click();await settle();change(ui.manufacturerPick,'Vantrue');pickModel(ui,'E1 Pro S');change(ui.choices.quality,value);
 const custom=ui.choices.quality.parentElement!.querySelector('input')!;expect(custom.hidden).toBe(true);expect(custom.value).toBe('');ui.prepare.click();await settle();expect(prepared(invoke).labels).toMatchObject({quality:'other',qualityLabel:label});expect(ui.choices.quality.value).toBe(value);
 ui.addGroup.click();const quality=()=>ui.groupForms.querySelector<HTMLSelectElement>('[data-setting=quality]')!;expect(quality().value).toBe(value);expect(quality().parentElement!.querySelector('input')!.hidden).toBe(true);ui.prepare.click();await settle();expect(prepared(invoke).annotations.cohorts[0].owner).toMatchObject({quality:'other',qualityLabel:label});
 change(ui.manufacturerPick,'Vantrue');expect(quality().value).toBe(value);expect(quality().selectedOptions[0].textContent).toBe(label);
 change(quality(),'other');input(quality().parentElement!.querySelector('input')!,'custom quality');ui.prepare.click();await settle();expect(prepared(invoke).annotations.cohorts[0].owner).toMatchObject({quality:'other',qualityLabel:'custom quality'});
 change(quality(),value);expect(quality().parentElement!.querySelector('input')!.hidden).toBe(true);ui.prepare.click();await settle();expect(prepared(invoke).annotations.cohorts[0].owner.qualityLabel).toBe(label);
 ui.groupForms.querySelector('button')!.click();expect(ui.choices.quality.value).toBe(value);ui.prepare.click();await settle();expect(prepared(invoke).labels).toMatchObject({quality:'other',qualityLabel:label});
 change(ui.choices.quality,'other');input(custom,'arbitrary owner label');ui.prepare.click();await settle();expect(prepared(invoke).labels).toMatchObject({quality:'other',qualityLabel:'arbitrary owner label'});
});
test('incompatible manufacturer clears picture mode keys in ordinary and grouped controls, never sends hidden stale values',async()=>{
 const {ui,invoke}=setup();ui.select.click();await settle();change(ui.manufacturerPick,'Vantrue');change(ui.choices.quality,'vantrue-platepix');ui.addGroup.click();change(ui.manufacturerPick,'Viofo');ui.prepare.click();await settle();expect(prepared(invoke).labels.quality).toBe('unknown');expect(prepared(invoke).annotations.cohorts[0].owner).toMatchObject({quality:'unknown',qualityLabel:'Unknown'});
});
test('blank submit live region has no visual box; Sending/success/error keep accessible visible feedback in both themes',async()=>{
 const style=document.createElement('style');style.textContent=readFileSync('src/style.css','utf8');document.head.append(style);
 const {ui,invoke}=setup();await settle();ui.select.click();await settle();
 for(const theme of ['light','dark']){document.documentElement.dataset.theme=theme;expect(ui.submitResult.textContent).toBe('');expect(getComputedStyle(ui.submitResult).borderTopWidth).toBe('0px');expect(getComputedStyle(ui.submitResult).padding).toBe('0px');expect(getComputedStyle(ui.submitResult).display).not.toBe('none');}
 let resolve!:(value:string)=>void;const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>cmd==='submit_review'?new Promise<string>(r=>resolve=r):base(cmd,args));ui.submit.click();await settle();expect(ui.submitResult.textContent).toBe('Sending…');expect(ui.submitResult.getAttribute('role')).toBe('status');expect(ui.submitResult.getAttribute('aria-live')).toBe('polite');expect(ui.submitResult.hidden).toBe(false);expect(getComputedStyle(ui.submitResult).padding).toBe('15px');resolve(hash);await settle();expect(ui.submitResult.textContent).toContain('submitted');
 input(ui.fields.firmware,'new draft');expect(ui.submitResult.textContent).toBe('');invoke.mockImplementation(async(cmd,args)=>{if(cmd==='submit_review')throw Error('synthetic error');if(cmd==='prepare_review')return {...await base(cmd,args),payloadHash:'b'.repeat(64)};return base(cmd,args);});ui.submit.click();await settle();expect(ui.submitResult.textContent).toContain('Unable to confirm submission');expect(getComputedStyle(ui.submitResult).display).not.toBe('none');style.remove();delete document.documentElement.dataset.theme;
});
