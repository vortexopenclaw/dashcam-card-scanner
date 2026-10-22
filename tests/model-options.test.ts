// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {beforeEach,test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {modelOptions,mergeModelOptions,modelOptionLabel} from '../src/model-options';
import {fixedSingleCapabilities} from '../src/fixed-single-capabilities';
import {mount,type Bridge} from '../src/ui';
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const change=(el:HTMLSelectElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const input=(el:HTMLInputElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
const pickModel=(ui:ReturnType<typeof mount>,name:string)=>change(ui.modelPick,[...ui.modelPick.options].find(o=>o.textContent===name)!.value);
const hash='a'.repeat(64);
const key=(c:{manufacturer:string;model:string})=>`${c.manufacturer.toLowerCase()}|${c.model.toLowerCase()}`;
test.each(fixedSingleCapabilities)('$manufacturer $model is selectable and prefills only one front channel',async capability=>{
 const option=modelOptions.find(c=>key(c)===key(capability))!;
 expect(option.fixedSingleChannel).toBe(true);expect(capability.sources.length).toBeGreaterThan(0);
 const {ui}=setup();await settle();ui.select.click();await settle();
 expect([...ui.manufacturerPick.options].some(o=>o.value===option.manufacturer)).toBe(true);
 change(ui.manufacturerPick,option.manufacturer);pickModel(ui,option.model);
 expect(ui.choices.channelCount.value).toBe('1');expect(ui.fields.channelSetup.value).toBe('front');
});
test.each(fixedSingleCapabilities.flatMap(c=>[c.model,...c.aliases||[]].map(model=>({...c,model}))))('$manufacturer $model native canonical/alias keeps exact report strings',capability=>{
 const native={id:'native-exact',manufacturer:capability.manufacturer.toUpperCase(),model:capability.model.toUpperCase()};
 const merged=mergeModelOptions([native]);
 expect(merged.find(c=>c.id===native.id)).toMatchObject({...native,fixedSingleChannel:true});
 expect(merged).toHaveLength(modelOptions.length);
});
test('coverage manifest accounts for every final research row and static positive identity',()=>{
 const coverage=JSON.parse(readFileSync('docs/model-capability-coverage.json','utf8'));
 expect(coverage.integratedPositiveCount).toBe(fixedSingleCapabilities.length);
 expect(coverage.positiveBrandCount).toBe(new Set(fixedSingleCapabilities.map(c=>c.manufacturer)).size);
 expect(coverage.deferredCount).toBe(coverage.excludedFromFixedSingle.length);
 expect(coverage.inputRows).toBe(coverage.deferredCount+fixedSingleCapabilities.length);
 expect(modelOptions.filter(c=>c.fixedSingleChannel)).toHaveLength(fixedSingleCapabilities.length);
});
test.each([
 ['Vueroid','S1 4K Infinite'],['Vueroid','S1 QHD Infinite'],['Vantrue','S1 Pro'],['Vantrue','S1 Pro Max'],
 ['Vantrue','S1 Pro 1CH'],['Vantrue','S1 Pro Max 1CH'],['Blueskysea','B4K'],['Miofive','S1'],
 ['Redtiger','F7NS'],['Redtiger','F8'],['Kenwood','DRV-A310W'],['Nexar','Beam2 mini'],
 ['BlackVue','DR750X-1CH Plus'],['BlackVue','ELITE 10-1CH'],['G1W','G1W-C'],['G1W','G1WC'],
])('%s %s cannot gain a fixed-single prefill through native membership',async(manufacturer,model)=>{
 const {ui}=setup(undefined,[{id:'negative-native',manufacturer,model,channelCount:1}]);await settle();ui.select.click();await settle();
 change(ui.manufacturerPick,manufacturer);pickModel(ui,model);
 expect(mergeModelOptions([{id:'negative-native',manufacturer,model}]).find(c=>c.id==='negative-native')?.fixedSingleChannel).not.toBe(true);
 expect(ui.choices.channelCount.value).toBe('Select count');expect(ui.fields.channelSetup.value).toBe('');
});
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
// Synthetic future native IPC identity only. The production catalog stays untouched.
const h1Native={id:'vueroid-h1',manufacturer:'Vueroid',model:'H1 QHD Infinite',channelCount:1,channelSetup:'front',aliases:['H1','H1 QHD']};
test('H1 native selector has one public default, keeps both S1 siblings, and does not infer owner channels',async()=>{
 const siblings=['S1 4K Infinite','S1 QHD Infinite'].map((model,i)=>({id:`s1-${i}`,manufacturer:'Vueroid',model}));
 const merged=mergeModelOptions([h1Native,...siblings]);
 expect(merged.filter(c=>c.id==='vueroid-h1')).toHaveLength(1);
 expect(merged.find(c=>c.id==='vueroid-h1')?.model).toBe('H1 QHD Infinite');
 for(const sibling of siblings)expect(merged.find(c=>c.id===sibling.id)?.model).toBe(sibling.model);
 const {ui,invoke}=setup(undefined,[h1Native,...siblings]);await settle();ui.select.click();await settle();
 change(ui.manufacturerPick,'Vueroid');
 expect([...ui.modelPick.options].filter(o=>o.textContent?.startsWith('H1'))).toHaveLength(1);
 pickModel(ui,'H1 QHD Infinite');expect(ui.fields.model.value).toBe('H1 QHD Infinite');
 expect(ui.choices.channelCount.value).toBe('Select count');expect(ui.fields.channelSetup.value).toBe('');
 change(ui.choices.channelCount,'2');input(ui.fields.channelSetup,'owner channels');input(ui.fields.firmware,'owner firmware');
 ui.scan.click();await settle();ui.settingsButton.click();await settle();ui.scannerButton.click();await settle();ui.prepare.click();await settle();
 expect(prepared(invoke).labels).toMatchObject({model:'H1 QHD Infinite',channelCount:2,channelSetup:'owner channels',firmware:'owner firmware'});
});
test.each(['H1','H1QHD','H1-QHD','H1 QHD','H1 QHD Infinite'])('H1 owner label %s remains exact through review and rescan',async model=>{
 const {ui,invoke}=setup({manufacturer:'Vueroid',model:'H1 QHD Infinite',channelCount:1,channelSetup:'front'},[h1Native]);
 await settle();ui.select.click();await settle();expect(ui.modelPick.value).toBe('vueroid-h1');
 change(ui.modelPick,'other');input(ui.fields.model,model);change(ui.choices.channelCount,'2');input(ui.fields.channelSetup,'owner channels');
 ui.scan.click();await settle();ui.prepare.click();await settle();
 expect(prepared(invoke).labels).toMatchObject({manufacturer:'Vueroid',model,channelCount:2,channelSetup:'owner channels'});
 expect(ui.fields.model.value).toBe(model);
});
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
test('Rove R2-4K Pro prefills one front channel',async()=>{
 const {ui}=setup();await settle();ui.select.click();await settle();change(ui.manufacturerPick,'Rove');pickModel(ui,'R2-4K Pro');expect(ui.choices.channelCount.value).toBe('1');expect(ui.fields.channelSetup.value).toBe('front');
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
 const {ui}=setup({manufacturer:'Vantrue',model:'N5S',channelCount:2,channelSetup:'front + rear'});ui.select.click();await settle();expect(ui.choices.channelCount.value).toBe('2');pickModel(ui,'N4S');expect(ui.choices.channelCount.value).toBe('2');expect(ui.fields.channelSetup.value).toBe('front + rear');pickModel(ui,'E1');expect(ui.choices.channelCount.value).toBe('2');expect(ui.fields.channelSetup.value).toBe('front + rear');
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
