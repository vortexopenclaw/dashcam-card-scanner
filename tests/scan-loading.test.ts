// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {mount,type Bridge} from '../src/ui';
beforeEach(()=>{vi.useFakeTimers();document.body.replaceChildren();localStorage.clear();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{document.body.replaceChildren();vi.clearAllTimers();vi.useRealTimers();});
const report={scannedFiles:6,entriesSeen:10,probeAttempts:4,probeFailures:0,sampledFiles:4,limited:false,cancelled:false,skipped:0,folders:[{path:'DCIM/Movie',fileCount:6,videos:[]}]};
function setup(){
 const root=document.createElement('main');document.body.append(root);
 let resolve!:(value:unknown)=>void;let reject!:(error:Error)=>void;
 const pending=new Promise((r,j)=>{resolve=r;reject=j;});
 const handlers=new Map<string,(e:{payload:any})=>void>();
 const invoke=vi.fn(async(cmd:string)=>{if(cmd==='choose_source')return '/card';if(cmd==='scan_source')return pending;return null;});
 const ui=mount(root,{invoke,listen:async(event,handler)=>{handlers.set(event,handler);return ()=>{};}} as Bridge);
 const emit=(phase:string)=>handlers.get('scan-progress')!({payload:{phase,entries:10,files:6,probed:4}});
 return {root,ui,invoke,resolve,reject,emit};
}
test('active scan visibly loads with indeterminate progress, elapsed time and settings explanation',async()=>{
 const {ui,resolve,emit}=setup();expect(ui.scanLoading.hidden).toBe(true);ui.select.click();await vi.advanceTimersByTimeAsync(0);
 expect(ui.scanLoading.hidden).toBe(false);expect(ui.scanLoading.getAttribute('aria-busy')).toBe('true');expect(ui.status.classList.contains('scanning')).toBe(true);expect(ui.scanProgress.hasAttribute('value')).toBe(false);expect(ui.scanLoadingNote.textContent).toContain('Camera settings will appear');expect(ui.cancel.disabled).toBe(false);expect(ui.fields.model.closest('section')!.hidden).toBe(true);
 emit('Reading camera model');expect(ui.status.textContent).toBe('Identifying your camera…');expect(ui.scanLoadingNote.textContent).toContain('first scan may take about a minute');expect(ui.status.textContent).not.toMatch(/entries|probes/);
 await vi.advanceTimersByTimeAsync(5000);expect(ui.scanElapsed.textContent).toBe('Elapsed: 5 seconds');expect(ui.scanLoading.hidden).toBe(false);
 resolve(report);await vi.advanceTimersByTimeAsync(0);expect(ui.scanLoading.hidden).toBe(true);expect(ui.status.classList.contains('scanning')).toBe(false);expect(ui.cancel.disabled).toBe(true);expect(ui.fields.model.closest('section')!.hidden).toBe(false);expect(ui.status.textContent).toContain('Card scan complete');
 const elapsed=ui.scanElapsed.textContent;await vi.advanceTimersByTimeAsync(2000);expect(ui.scanElapsed.textContent).toBe(elapsed);emit('Reading camera model');expect(ui.status.textContent).toContain('Card scan complete');
});
test('cancellation stays visible while awaiting the native result and then clears loading',async()=>{
 const {ui,invoke,emit,resolve}=setup();ui.select.click();await vi.advanceTimersByTimeAsync(0);emit('Reading camera model');ui.cancel.click();expect(invoke).toHaveBeenCalledWith('cancel_scan');expect(ui.status.textContent).toContain('Cancelling scan');emit('Reading camera model');expect(ui.status.textContent).toContain('Cancelling scan');expect(ui.scanLoading.hidden).toBe(false);resolve({...report,cancelled:true});await vi.advanceTimersByTimeAsync(0);expect(ui.scanLoading.hidden).toBe(true);expect(ui.cancel.disabled).toBe(true);expect(ui.status.textContent).toContain('Scan cancelled');
});
test('scan errors stop loading and permit retry without stale model-phase feedback',async()=>{
 const {ui,reject,emit}=setup();ui.select.click();await vi.advanceTimersByTimeAsync(0);emit('Reading camera model');reject(Error('private internal scan detail'));await vi.advanceTimersByTimeAsync(0);expect(ui.scanLoading.hidden).toBe(true);expect(ui.status.classList.contains('scanning')).toBe(false);expect(ui.select.disabled).toBe(false);expect(ui.cancel.disabled).toBe(true);expect(ui.status.textContent).toContain('try again');expect(ui.status.textContent).not.toContain('private internal');emit('Reading camera model');expect(ui.status.textContent).not.toContain('Identifying');
});
test('Settings navigation preserves active loading and scan progress remains human readable',async()=>{
 const {ui,emit,resolve}=setup();ui.select.click();await vi.advanceTimersByTimeAsync(0);emit('walking');expect(ui.status.textContent).toBe('Scanning card… 6 files found.');ui.settingsButton.click();await vi.advanceTimersByTimeAsync(2000);ui.scannerButton.click();expect(ui.scanLoading.hidden).toBe(false);expect(ui.scanElapsed.textContent).toBe('Elapsed: 2 seconds');resolve(report);await vi.advanceTimersByTimeAsync(0);
});
