// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,vi} from 'vitest';
import {mount,type Bridge} from '../src/ui';
const settle=async()=>{await new Promise(r=>setTimeout(r,0));};
function setup(){
 document.body.replaceChildren();const root=document.createElement('main');document.body.append(root);
 const invoke=vi.fn(async(cmd:string)=>{if(cmd==='choose_source')return '/local/<img src=x onerror=alert(1)>';if(cmd==='scan_source')return {scannedFiles:2,entriesSeen:3,skipped:0,sampledFiles:1,probeAttempts:1,probeFailures:0,limited:false,cancelled:false,folders:[{path:'dcim',fileCount:2,videos:[{}]}]};if(cmd==='prepare_review')return {token:'review-token',publicJson:'{"model":"<img src=x onerror=alert(1)>"}',privateJson:'paired-local-data',submissionJson:'{"schemaVersion":1}',payloadHash:'a'.repeat(64),warning:'Review your labels.'};if(cmd==='submit_review')throw Error('Secure intake is not provisioned');return null;});
 const ui=mount(root,{invoke,listen:async()=>()=>{}} as Bridge);return {ui,invoke,root};
}
async function review(ui:ReturnType<typeof mount>){ui.select.click();await settle();ui.scan.click();await settle();ui.prepare.click();await settle();}
test('source and payload render as literal text, never executable HTML',async()=>{const {ui,root}=setup();await review(ui);expect(ui.source.textContent).toContain('<img');expect(ui.publicView.textContent).toContain('<img');expect(root.querySelector('img')).toBeNull();expect(ui.reviewPanel.hidden).toBe(false);});
test('no automatic submission; explicit consent and ticket required',async()=>{const {ui,invoke}=setup();await review(ui);expect(invoke.mock.calls.some(c=>c[0]==='submit_review')).toBe(false);expect(ui.submit.disabled).toBe(true);ui.consent.checked=true;ui.consent.dispatchEvent(new Event('change'));expect(ui.submit.disabled).toBe(true);ui.ticket.value='one-use-ticket-for-test';ui.ticket.dispatchEvent(new Event('input'));expect(ui.submit.disabled).toBe(false);ui.submit.click();await settle();expect(ui.status.textContent).toContain('not provisioned');expect(ui.ticket.value).toBe('');expect(ui.submit.disabled).toBe(true);});
test('editing owner labels invalidates review and clears consent/ticket',async()=>{const {ui}=setup();await review(ui);ui.consent.checked=true;ui.ticket.value='ticket';ui.fields.model.value='changed';ui.fields.model.dispatchEvent(new Event('input'));expect(ui.reviewPanel.hidden).toBe(true);expect(ui.consent.checked).toBe(false);expect(ui.ticket.value).toBe('');expect(ui.submit.disabled).toBe(true);});
test('cancel is a dedicated backend command',async()=>{const {ui,invoke}=setup();ui.cancel.disabled=false;ui.cancel.click();await settle();expect(invoke).toHaveBeenCalledWith('cancel_scan');});
test('changing constrained owner selections invalidates review',async()=>{const {ui}=setup();await review(ui);ui.choices.quality.value='maximum';ui.choices.quality.dispatchEvent(new Event('change'));expect(ui.reviewPanel.hidden).toBe(true);});
