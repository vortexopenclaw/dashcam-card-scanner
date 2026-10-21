// SPDX-License-Identifier: AGPL-3.0-or-later
// Talks only to the loopback listener of a separately provider-authenticated
// Wrangler remote preview. Never accepts a production/public administration URL.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MAX_BODY,readBytes,parse} from './schema.js';
export async function administer(payload,env=process.env){
 const name=env.INTAKE_ADMIN_KEY_ENV,port=env.INTAKE_ADMIN_LOCAL_PORT;
 if(!/^[A-Z][A-Z0-9_]{0,79}$/.test(name||'')||typeof env[name]!=='string'||env[name].length<32||!/^\d{1,5}$/.test(port||'')||+port<1024||+port>65535)throw Error('Explicit key environment name and loopback preview port required');
 if(!['admin-status','admin-reconcile','admin-step','admin-repair-mirrors','admin-reclaim'].includes(payload?.op))throw Error('Invalid operation');
 const request=async p=>{
  const r=await fetch('http://127.0.0.1:'+port+'/',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+env[name]},body:JSON.stringify(p),signal:AbortSignal.timeout(30000)});
  let result;try{result=parse(await readBytes(r,MAX_BODY));}catch{throw Error('Private maintenance response invalid');}
  if(r.status===503&&result.error==='migration_in_progress')return {migration:true};
  if(!r.ok)throw Error('Private maintenance request failed');return result;
 };
 let result=await request(payload);
 // State-changing commands are read back against the same object. Bounded steps
 // resume durable cursors; an interrupted run can be safely repeated.
 if(payload.op==='admin-reclaim'||payload.op==='admin-reconcile'||payload.op==='admin-step'){
  let complete=false;
  for(let i=0;i<500;i++){result=await request({op:'admin-step'});if(!result.migration){complete=true;break;}}
  if(!complete)throw Error('Reconciliation still in progress; resume admin-step');
  let repaired=false;
  for(let i=0;i<500;i++){const repair=await request({op:'admin-repair-mirrors'});if(repair.repaired===0){repaired=true;break;}}
  if(!repaired)throw Error('Mirror repair still in progress; resume admin-repair-mirrors');
  result=await request({op:'admin-status'});
 }
 return result;
}
async function main(){
 const [file,...rest]=process.argv.slice(2);if(!file||rest.length)throw Error('One explicit JSON plan file required');
 const handle=await fs.open(file,'r');let bytes;
 try{if((await handle.stat()).size>MAX_BODY)throw Error('Oversized plan');bytes=await handle.readFile();}finally{await handle.close();}
 const result=await administer(parse(bytes));console.log(JSON.stringify(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Private intake maintenance failed. Check explicit plan, provider-authenticated preview, selected key environment and target binding. No response or credential details logged.');process.exitCode=1;});
