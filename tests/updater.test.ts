// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {mount,type Bridge} from '../src/ui';
const settle=()=>new Promise(r=>setTimeout(r,0));
function deferred<T>(){let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
beforeEach(()=>{document.body.replaceChildren();localStorage.clear();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>vi.useRealTimers());
const commandCalls=(invoke:ReturnType<typeof vi.fn>,cmd:string)=>invoke.mock.calls.filter(c=>c[0]===cmd);
test('startup checks exactly once without Settings or installing; banner Update installs and safely restarts',async()=>{
 vi.useFakeTimers();const {ui,invoke}=setup();expect(ui.updateBanner.hidden).toBe(true);expect(ui.select.disabled).toBe(false);
 await vi.advanceTimersByTimeAsync(500);expect(ui.settingsPanel.hidden).toBe(true);expect(commandCalls(invoke,'check_update')).toHaveLength(1);expect(commandCalls(invoke,'install_update')).toHaveLength(0);expect(ui.updateBanner.hidden).toBe(false);expect(ui.bannerStatus.textContent).toContain('0.1.3');expect(ui.bannerAction.textContent).toBe('Update');
 await vi.advanceTimersByTimeAsync(12000);expect(commandCalls(invoke,'check_update')).toHaveLength(1);
 ui.bannerAction.click();ui.settingsButton.click();ui.updateAction.click();await vi.advanceTimersByTimeAsync(0);
 expect(commandCalls(invoke,'install_update')).toEqual([['install_update',{version:'0.1.3',consent:true}]]);expect(commandCalls(invoke,'restart_app')).toEqual([['restart_app',{consent:true}]]);
});
test('startup source picker wins, check retries once idle and never replaces the scanned report',async()=>{
 vi.useFakeTimers();const {ui,invoke}=setup();const picker=deferred<unknown>();invoke.mockImplementation(async cmd=>cmd==='choose_source'?picker.promise:cmd==='scan_source'?{scannedFiles:1,folders:[],probeAttempts:0,probeFailures:0}:cmd==='check_update'?'0.1.5':null);
 ui.select.click();await vi.advanceTimersByTimeAsync(1500);expect(commandCalls(invoke,'check_update')).toHaveLength(0);picker.resolve('/card');await vi.advanceTimersByTimeAsync(250);
 expect(commandCalls(invoke,'check_update')).toHaveLength(1);expect(ui.source.textContent).toBe('/card');expect(ui.prepare.disabled).toBe(false);expect(ui.status.textContent).not.toContain('update');
 expect(ui.bannerStatus.textContent).toContain('any unsent report will be cleared');ui.bannerAction.click();await vi.advanceTimersByTimeAsync(0);expect(commandCalls(invoke,'install_update')).toHaveLength(1);expect(commandCalls(invoke,'restart_app')).toHaveLength(1);expect(ui.bannerAction.textContent).toBe('Restarting…');
});
test('an explicit early Settings check consumes the pending startup check even on network failure',async()=>{
 vi.useFakeTimers();const {ui,invoke}=setup();invoke.mockImplementation(async cmd=>{if(cmd==='check_update')throw Error('Offline');return null;});ui.settingsButton.click();await vi.advanceTimersByTimeAsync(5000);
 expect(commandCalls(invoke,'check_update')).toHaveLength(1);expect(ui.bannerAction.textContent).toBe('Retry update check');expect(ui.bannerStatus.textContent).toContain('Offline');expect(ui.bannerAction.disabled).toBe(false);
 invoke.mockImplementation(async()=>null);ui.bannerAction.click();await vi.advanceTimersByTimeAsync(0);expect(ui.updateBanner.hidden).toBe(true);expect(commandCalls(invoke,'install_update')).toHaveLength(0);
});
test('progress listener registration completes before startup native check',async()=>{
 vi.useFakeTimers();const root=document.createElement('main');document.body.append(root);const ready=deferred<()=>void>();const invoke=vi.fn(async()=>null);
 mount(root,{invoke,listen:async event=>event==='update-progress'?ready.promise:()=>{}} as Bridge);await vi.advanceTimersByTimeAsync(500);expect(commandCalls(invoke,'check_update')).toHaveLength(0);
 ready.resolve(()=>{});await vi.advanceTimersByTimeAsync(0);expect(commandCalls(invoke,'check_update')).toHaveLength(1);
});
test('automatic restart failure exposes shared retry without reinstallation',async()=>{
 const {ui,invoke}=setup();invoke.mockImplementation(async cmd=>{if(cmd==='check_update')return '0.1.5';if(cmd==='restart_app')throw Error('relaunch unavailable');return null;});ui.settingsButton.click();await settle();ui.updateAction.click();await settle();
 expect(ui.bannerAction.textContent).toBe('Restart to finish update');expect(ui.bannerStatus.textContent).toContain('relaunch unavailable');expect(ui.bannerAction.disabled).toBe(false);ui.bannerAction.click();await settle();expect(commandCalls(invoke,'install_update')).toHaveLength(1);expect(commandCalls(invoke,'check_update')).toHaveLength(1);expect(commandCalls(invoke,'restart_app')).toHaveLength(2);
});
function setup(){
 const root=document.createElement('main');document.body.append(root);
 const handlers=new Map<string,(e:{payload:any})=>void>();
 const invoke=vi.fn(async(cmd:string,_args?:Record<string,unknown>):Promise<unknown>=>{
  if(cmd==='app_version')return '0.1.2';if(cmd==='check_update')return '0.1.3';if(cmd==='choose_source')return '/card';
  if(cmd==='scan_source')return {scannedFiles:1,folders:[],probeAttempts:0,probeFailures:0};return null;
 });
 const ui=mount(root,{invoke,listen:async(event,handler)=>{handlers.set(event,handler);return ()=>{};}} as Bridge);
 const emit=(payload:unknown)=>handlers.get('update-progress')!({payload});
 const close=()=> (ui.settingsPanel.lastElementChild as HTMLButtonElement).click();
 return {ui,root,invoke,emit,close,handlers};
}
test('startup waits for direct upload; submitted report permits one-click restart',async()=>{
 vi.useFakeTimers();const {ui,invoke}=setup();const receipt='a'.repeat(64);const upload=deferred<string>();invoke.mockImplementation(async cmd=>{
  if(cmd==='choose_source')return '/card';if(cmd==='scan_source')return {scannedFiles:1,folders:[],probeAttempts:0,probeFailures:0};
  if(cmd==='prepare_review')return {token:'review-1',publicJson:'{}',privateJson:'{}',submissionJson:'{}',payloadHash:receipt,warning:''};
  if(cmd==='submit_review')return upload.promise;if(cmd==='check_update')return '0.1.5';return null;
 });
 ui.select.click();await vi.advanceTimersByTimeAsync(0);ui.fields.model.value='Owner model';ui.fields.model.dispatchEvent(new Event('input',{bubbles:true}));ui.submit.click();await vi.advanceTimersByTimeAsync(1000);
 expect(commandCalls(invoke,'submit_review')).toEqual([['submit_review',{token:'review-1',consent:true}]]);expect(commandCalls(invoke,'check_update')).toHaveLength(0);
 expect(ui.submit.textContent).toBe('Sending…');ui.settingsButton.click();expect(ui.updateAction.disabled).toBe(true);(ui.settingsPanel.lastElementChild as HTMLButtonElement).click();
 upload.resolve(receipt);await vi.advanceTimersByTimeAsync(250);expect(ui.submitResult.textContent).toBe('Report submitted. Thank you!');expect(commandCalls(invoke,'check_update')).toHaveLength(1);
 ui.bannerAction.click();await vi.advanceTimersByTimeAsync(0);expect(commandCalls(invoke,'restart_app')).toEqual([['restart_app',{consent:true}]]);
});
test('Settings and banner share one explicit install with progress and automatic safe restart',async()=>{
 const {ui,invoke,emit,close}=setup();const installing=deferred<unknown>();invoke.mockImplementation(async(cmd)=>cmd==='check_update'?'0.1.3':cmd==='install_update'?installing.promise:null);
 expect(invoke.mock.calls.filter(c=>c[0]==='check_update')).toHaveLength(0);
 ui.settingsButton.click();expect(ui.updateAction.textContent).toBe('Checking…');expect(ui.updateAction.disabled).toBe(true);await settle();
 expect(ui.runningVersion.textContent).toBe('Running version: 0.1.2');expect(ui.updateAction.textContent).toBe('Update to 0.1.3');expect(invoke.mock.calls.some(c=>c[0]==='install_update')).toBe(false);
 ui.updateAction.click();expect(invoke).toHaveBeenCalledWith('install_update',{version:'0.1.3',consent:true});expect(ui.select.disabled).toBe(true);
 emit({phase:'downloading',downloaded:25,total:100});expect(ui.updateProgress.value).toBe(25);expect(ui.updateStatus.textContent).toContain('25%');
 emit({phase:'checking',downloaded:0,total:null});expect(ui.updateAction.dataset.state).toBe('downloading');
 emit({phase:'installing',downloaded:100,total:100});expect(ui.updateAction.textContent).toBe('Installing…');
 emit({phase:'installed',downloaded:100,total:100});expect(ui.updateAction.disabled).toBe(true);
 expect(ui.bannerProgress.value).toBe(25);expect(ui.bannerStatus.textContent).toBe(ui.updateStatus.textContent);expect(ui.bannerAction.disabled).toBe(true);
 installing.resolve(null);await settle();expect(ui.updateAction.textContent).toBe('Restarting…');expect(ui.updateAction.disabled).toBe(true);expect(ui.updateProgress.hidden).toBe(true);
 close();ui.settingsButton.click();await settle();expect(invoke.mock.calls.filter(c=>c[0]==='check_update')).toHaveLength(1);expect(ui.bannerAction.textContent).toBe('Restarting…');
 expect(invoke).toHaveBeenCalledWith('restart_app',{consent:true});expect(invoke.mock.calls.filter(c=>c[0]==='restart_app')).toHaveLength(1);expect(ui.status.textContent).toBe('Ready.');
});
test('failed installation keeps visible retry and refreshes the signed target before retry',async()=>{
 const {ui,invoke}=setup();let target='0.1.3';invoke.mockImplementation(async(cmd)=>{if(cmd==='check_update')return target;if(cmd==='install_update')throw Error('Network interrupted');return null;});
 ui.settingsButton.click();await settle();ui.updateAction.click();await settle();expect(ui.updateAction.textContent).toBe('Retry update check');expect(ui.updateAction.hidden).toBe(false);expect(ui.updateStatus.textContent).toContain('Network interrupted');expect(ui.updateAction.disabled).toBe(false);
 target='0.1.4';ui.bannerAction.click();await settle();expect(ui.updateAction.textContent).toBe('Update to 0.1.4');expect(invoke.mock.calls.filter(c=>c[0]==='install_update')).toHaveLength(1);ui.updateAction.click();await settle();expect(invoke).toHaveBeenLastCalledWith('install_update',{version:'0.1.4',consent:true});
});
test('check errors and no-update remain actionable without automatic repeat checks',async()=>{
 const {ui,invoke,close}=setup();invoke.mockImplementation(async(cmd)=>{if(cmd==='check_update')throw Error('Offline');return null;});ui.settingsButton.click();await settle();expect(ui.updateAction.textContent).toBe('Retry update check');expect(ui.updateStatus.textContent).toContain('Offline');
 invoke.mockImplementation(async()=>null);ui.updateAction.click();await settle();expect(ui.updateStatus.textContent).toBe('No update available.');expect(ui.updateAction.textContent).toBe('Check for updates');close();ui.settingsButton.click();await settle();expect(invoke.mock.calls.filter(c=>c[0]==='check_update')).toHaveLength(2);
});
test('active scan prevents checks and installs; updater activity prevents scans',async()=>{
 const {ui,invoke}=setup();const scan=deferred<unknown>();invoke.mockImplementation(async(cmd)=>cmd==='choose_source'?'/card':cmd==='scan_source'?scan.promise:cmd==='check_update'?'0.1.3':null);
 ui.select.click();await settle();ui.settingsButton.click();expect(ui.updateAction.disabled).toBe(true);expect(invoke.mock.calls.some(c=>c[0]==='check_update')).toBe(false);ui.updateAction.click();expect(invoke.mock.calls.some(c=>c[0]==='check_update')).toBe(false);
 scan.resolve({scannedFiles:1,folders:[],probeAttempts:0,probeFailures:0});await settle();ui.updateAction.click();await settle();expect(ui.updateAction.textContent).toBe('Update to 0.1.3');
});
test('one Update click installs and restarts with unsent report and edited camera fields, without discard confirmation',async()=>{
 const {ui,invoke,root}=setup();ui.select.click();await settle();ui.fields.model.value='Unsent camera';ui.fields.model.dispatchEvent(new Event('input',{bubbles:true}));ui.settingsButton.click();await settle();expect(ui.updateStatus.textContent).toContain('any unsent report will be cleared');ui.updateAction.click();await settle();expect(commandCalls(invoke,'install_update')).toEqual([['install_update',{version:'0.1.3',consent:true}]]);expect(commandCalls(invoke,'restart_app')).toEqual([['restart_app',{consent:true}]]);expect(ui.bannerAction.textContent).toBe('Restarting…');expect(root.textContent).not.toContain('Restart anyway');
});
test('unsent report restart failure is retryable without repeating download or verification',async()=>{
 const {ui,invoke,close}=setup();const base=invoke.getMockImplementation()!;invoke.mockImplementation(async(cmd,args)=>{if(cmd==='restart_app')throw Error('Restart unavailable');return base(cmd,args);});ui.select.click();await settle();ui.settingsButton.click();await settle();ui.updateAction.click();await settle();expect(ui.updateAction.textContent).toBe('Restart to finish update');expect(ui.updateStatus.textContent).toContain('restart failed');close();ui.settingsButton.click();await settle();ui.bannerAction.click();await settle();expect(commandCalls(invoke,'install_update')).toHaveLength(1);expect(commandCalls(invoke,'check_update')).toHaveLength(1);expect(commandCalls(invoke,'restart_app')).toHaveLength(2);
});
test('only choose, submit and actionable updates use primary styling; action rows have one updater',async()=>{
 const {ui,root}=setup();expect(ui.select.classList.contains('primary')).toBe(true);expect(ui.prepare.classList.contains('primary')).toBe(false);expect(ui.submit.classList.contains('primary')).toBe(true);expect(ui.scan.classList.contains('primary')).toBe(false);expect(ui.updateAction.classList.contains('primary')).toBe(false);expect(ui.updateAction.parentElement?.className).toBe('actions');expect(ui.updateAction.parentElement?.querySelectorAll('button')).toHaveLength(1);expect(root.querySelector('button.primary')?.textContent).toBe('Choose card / folder');ui.settingsButton.click();await settle();expect(ui.updateAction.classList.contains('primary')).toBe(true);
});

test('unknown download size stays indeterminate, repeated clicks do not duplicate installs',async()=>{
 const {ui,invoke,emit}=setup();const install=deferred<unknown>();invoke.mockImplementation(async(cmd)=>cmd==='check_update'?'0.1.3':cmd==='install_update'?install.promise:null);ui.settingsButton.click();await settle();ui.updateAction.click();ui.updateAction.click();emit({phase:'downloading',downloaded:512,total:null});expect(ui.updateProgress.hasAttribute('value')).toBe(false);expect(ui.cancel.disabled).toBe(true);expect(invoke.mock.calls.filter(c=>c[0]==='install_update')).toHaveLength(1);install.resolve(null);await settle();
});
