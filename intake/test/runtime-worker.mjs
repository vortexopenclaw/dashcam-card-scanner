// SPDX-License-Identifier: AGPL-3.0-or-later
// TEST-ONLY workerd harness, never a deployment entrypoint. Allows synthetic
// storage seeding/readback to exercise real SQLite transactions in IntakeGate.
import worker,{IntakeGate} from '../worker.js';
export default worker;
export class RuntimeGate extends IntakeGate {
 async fetch(req){
  if(new URL(req.url).pathname!=='/test-storage')return super.fetch(req);
  const p=await req.json();
  const result=await this.state.storage.transaction(async tx=>{
   if(p.op==='put'){await tx.put(p.key,p.value);return true;}
   if(p.op==='get')return await tx.get(p.key)??null;
   throw Error('Invalid test operation');
  });
  return Response.json(result);
 }
}
