// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline synthetic fixtures only. No credentials, owner records or provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{IntakeGate} from '../worker.js';
import {sha256,admissionHash} from '../schema.js';
import {checkRecord} from '../review.js';
import {Storage} from './storage.js';
const fixture=()=>({schemaVersion:1,owner:{manufacturer:'Synthetic',model:'Retention',channelCount:1,quality:'high'},evidence:[{channel:'front',mode:'normal',width:1920,height:1080,fps:30,bitrateKbps:10000,containerBitrateKbps:null,sizeBytes:10000000,durationSeconds:10,codec:'h264'}]});
const body=()=>JSON.stringify(fixture());
function setup(storage=new Storage(),kv=new Map()){
 const env={ENABLED:'true',IP_SALT:'s'.repeat(32),ADMIN_CONTROL_KEY:'synthetic-admin-key-'.repeat(3),ORIGIN:'https://intake.example',MAX_RECORDS:'1000',MAX_STORED_BYTES:'10000000',PENDING:{put:async(k,v)=>kv.set(k,v),delete:async k=>kv.delete(k)}};
 const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(url,init)=>gate.fetch(new Request(url,init))})};return {env,storage,kv,gate};
}
const call=(c,p,key)=>c.gate.fetch(new Request('https://internal/',{method:'POST',headers:key?{authorization:'Bearer '+key}:{},body:JSON.stringify(p)}));
const admin=(c,p)=>call(c,p,c.env.ADMIN_CONTROL_KEY);
const send=(c,raw=body(),ip='192.0.2.1')=>worker.fetch(new Request(c.env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip},body:raw}),c.env);
const control=c=>c.storage.data.get('control');
const records=c=>[...c.storage.data].filter(([k])=>k.startsWith('record/')).map(([,r])=>r);
async function settle(c){for(let i=0;i<100;i++){const r=await admin(c,{op:'admin-step'});if(r.status===200)return;assert.equal((await r.json()).error,'migration_in_progress');}assert.fail('bounded migration did not finish');}
async function repair(c){for(let i=0;i<100;i++){const r=await admin(c,{op:'admin-repair-mirrors'});assert.equal(r.status,200);if((await r.json()).repaired===0)return;}assert.fail('bounded repair did not finish');}
async function legacy(c,raw,at='2026-01-01T00:00:00Z'){
 const r={id:await sha256(raw),receivedAt:at,report:JSON.parse(raw),rawJSON:raw};c.storage.data.set('record/'+r.id,r);c.kv.set('pending/v1/'+r.id,JSON.stringify(r));return r;
}
const reclaim=ids=>({op:'admin-reclaim',ids,reason:'Reviewed synthetic abuse; independent archive verified',archiveConfirmed:true,confirm:'permanently-delete-reviewed-records'});
test('two-record quota whitespace/key/escape variants across reset preserve first bytes and matching client receipts',async()=>{
 const c=setup();c.env.MAX_RECORDS='2';const first=body()+'\n',hash=await sha256(first);assert.equal((await send(c,first)).status,202);const stored=structuredClone(records(c)[0]),bytes=control(c).bytes;
 const p=fixture(),variants=[body()+'  ',JSON.stringify(p,null,2),JSON.stringify({evidence:p.evidence,owner:p.owner,schemaVersion:1}),body().replace('Synthetic','\\u0053ynthetic'),body().replace('"fps":30','"fps":3.00e1')];
 for(const raw of variants){const r=await send(c,raw);assert.equal(r.status,202);assert.deepEqual(await r.json(),{id:await sha256(raw),status:'pending',duplicate:true});}
 control(c).hour--;assert.equal((await send(c,body()+'\n\n\n')).status,202);assert.equal(control(c).records,1);assert.equal(control(c).bytes,bytes);assert.equal(c.kv.size,1);assert.deepEqual(records(c)[0],stored);assert.equal(stored.id,hash);await checkRecord(stored);
 const second=fixture();second.owner.quality='low';assert.equal((await send(c,JSON.stringify(second))).status,202);control(c).hour--;const third=fixture();third.owner.quality='medium';const r=await send(c,JSON.stringify(third));assert.equal(r.status,429);assert.equal((await r.json()).error,'storage_capacity');assert.equal(control(c).records,2);
});
test('admission retains all settings, private identity, cohort relationships and exact numeric pairs',async()=>{
 const raw=body(),hash=await admissionHash(raw);
 for(const mutate of [p=>p.owner.firmware='2',p=>p.owner.quality='low',p=>p.owner.parkingMode='off',p=>p.owner.timeLapseFps=2,p=>p.contributor={dashcamTalkUsername:'Synthetic Other'},p=>p.evidence[0].durationSeconds=11,p=>p.evidence[0].sizeBytes++,p=>p.cohorts=[{id:'a',owner:{channelCount:1},evidenceIndices:[0]}]]){const p=fixture();mutate(p);assert.notEqual(await admissionHash(JSON.stringify(p)),hash);}
 assert.notEqual(await admissionHash(raw.replace('"fps":30','"fps":30.00000000000000001')),await admissionHash(raw.replace('"fps":30','"fps":30.00000000000000002')));
 const c=setup();for(const n of ['30.00000000000000001','30.00000000000000002'])assert.equal((await send(c,raw.replace('"fps":30','"fps":'+n))).status,202);assert.equal(control(c).records,2);
 const p=fixture();p.evidence.push({...p.evidence[0],sizeBytes:20000000,durationSeconds:20});const q=structuredClone(p);[q.evidence[0].durationSeconds,q.evidence[1].durationSeconds]=[q.evidence[1].durationSeconds,q.evidence[0].durationSeconds];assert.notEqual(await admissionHash(JSON.stringify(p)),await admissionHash(JSON.stringify(q)));
});
test('concurrent whitespace variants transactionally claim one slot and original record',async()=>{
 const c=setup();c.env.MAX_RECORDS='1';const rs=await Promise.all(Array.from({length:20},(_,i)=>send(c,body()+' '.repeat(i))));assert(rs.every(r=>r.status===202));const values=await Promise.all(rs.map(r=>r.json()));assert.equal(values.filter(v=>!v.duplicate).length,1);assert.equal(control(c).records,1);assert.equal(c.kv.size,1);assert.equal(control(c).bytes,Buffer.byteLength(JSON.stringify(records(c)[0])));
});
test('malformed flood exceeds old 500 budget without spending valid admission; fixed buckets and raw circuit breaker remain',async()=>{
 const c=setup();for(let i=0;i<600;i++)assert.equal((await send(c,'{','198.51.100.'+i)).status,400);assert.equal(control(c).attempts,0);assert.equal(control(c).rawAttempts,600);assert(Object.keys(control(c).rates).length<=256);assert.equal((await send(c)).status,202);assert.equal(control(c).attempts,1);
 control(c).rawAttempts=5000;const r=await send(c,body(),'203.0.113.9');assert.equal(r.status,429);assert.equal((await r.json()).error,'rate_limited');control(c).hour--;assert.equal((await send(c)).status,202);assert.equal(control(c).rawAttempts,1);
});
test('valid admission 500 and storage byte limits remain transactional; duplicates do not spend admission',async()=>{
 const c=setup();assert.equal((await send(c)).status,202);control(c).attempts=500;assert.equal((await send(c,body()+' ')).status,202);const p=fixture();p.owner.model='New';let r=await send(c,JSON.stringify(p));assert.equal(r.status,429);assert.equal((await r.json()).error,'rate_limited');assert.equal(control(c).records,1);control(c).hour--;control(c).bytes=+c.env.MAX_STORED_BYTES;r=await send(c,JSON.stringify(p));assert.equal((await r.json()).error,'storage_capacity');assert.equal(control(c).records,1);
});
test('bounded legacy migration survives restart, repairs counters, preserves old variants and earliest provenance',async()=>{
 let c=setup();const first=await legacy(c,body(),'2025-01-01T00:00:00Z');for(let i=1;i<105;i++)await legacy(c,body()+' '.repeat(i));c.storage.data.set('control',{hour:Math.floor(Date.now()/3600000),attempts:0,rates:{},tickets:{},records:9999,bytes:999999});
 let r=await send(c);assert.equal(r.status,503);assert.equal((await r.json()).error,'migration_in_progress');assert.equal(control(c).rebuild.records,50);
 c=setup(c.storage,c.kv);await settle(c);assert.equal(control(c).records,105);assert.equal(control(c).bytes,records(c).reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r)),0));assert.equal(records(c).length,105);
 const index=c.storage.data.get('semantic/'+await admissionHash(body()));assert.equal(index.id,first.id);r=await send(c,body()+' '.repeat(200));assert.equal(r.status,202);assert.equal((await r.json()).duplicate,true);assert.equal(control(c).records,105);assert.equal(c.kv.size,105);await repair(c);assert.equal([...c.storage.data.keys()].filter(k=>k.startsWith('mirror/')).length,0);
});
test('migration commit failure rolls back cursor/index/counters and resumes without data loss',async()=>{
 const c=setup();await legacy(c,body());c.storage.failCommit=true;assert.equal((await send(c)).status,500);assert.equal(control(c),undefined);assert.equal([...c.storage.data.keys()].filter(k=>k.startsWith('semantic/')).length,0);await settle(c);assert.equal(control(c).records,1);assert.equal((await send(c,body()+' ')).status,202);assert.equal(control(c).records,1);
});
test('admin operations deny absent/wrong/unconfigured auth and public injection before any mutation',async()=>{
 const c=setup();await send(c);const before=structuredClone([...c.storage.data]);for(const op of ['admin-reclaim','admin-reconcile','admin-step','admin-status','admin-repair-mirrors'])for(const key of [undefined,'wrong'])assert.equal((await call(c,{op},key)).status,403);assert.deepEqual([...c.storage.data],before);
 for(const route of ['/admin','/admin-reclaim','/internal','/'])assert.equal((await worker.fetch(new Request(c.env.ORIGIN+route,{method:'POST',headers:{authorization:'Bearer '+c.env.ADMIN_CONTROL_KEY},body:JSON.stringify(reclaim([records(c)[0].id]))}),c.env)).status,404);
 const key=c.env.ADMIN_CONTROL_KEY;delete c.env.ADMIN_CONTROL_KEY;assert.equal((await call(c,{op:'admin-status'},key)).status,403);
});
test('explicit reclamation requires archive attestation, exact IDs, reason and confirmation; retry idempotent',async()=>{
 const c=setup();c.env.MAX_RECORDS='1';await send(c);const id=records(c)[0].id;
 for(const change of [{archiveConfirmed:false},{confirm:'yes'},{reason:''},{ids:[id,id]},{ids:['bad']},{extra:true}])assert.equal((await admin(c,{...reclaim([id]),...change})).status,400);
 assert.equal(records(c).length,1);assert.equal((await admin(c,reclaim([id]))).status,200);await settle(c);assert.equal(control(c).records,0);assert.equal(control(c).bytes,0);assert.equal(c.kv.size,0);assert.equal((await admin(c,reclaim([id]))).status,200);await settle(c);assert.equal(control(c).records,0);const p=fixture();p.owner.model='Next';assert.equal((await send(c,JSON.stringify(p))).status,202);
});
test('reconcile repairs corrupt counters/index without deleting owner records; surviving legacy duplicate takes over',async()=>{
 const c=setup(),first=await legacy(c,body(),'2025-01-01T00:00:00Z'),second=await legacy(c,body()+' ');await settle(c);control(c).records=999;control(c).bytes=999999;await admin(c,{op:'admin-reconcile'});await settle(c);assert.equal(control(c).records,2);assert.equal(records(c).length,2);
 await admin(c,reclaim([first.id]));await settle(c);assert.equal(control(c).records,1);assert.equal((await send(c,body()+'\n')).status,202);assert.equal(control(c).records,1);assert.equal(c.storage.data.get('semantic/'+await admissionHash(body())).id,second.id);assert.equal(c.kv.has('pending/v1/'+first.id),false);
});
test('durable mirror repair handles put/delete failure and object restart, never resurrects reclaimed data',async()=>{
 let c=setup();const put=c.env.PENDING.put;c.env.PENDING.put=async()=>{throw Error('synthetic');};assert.equal((await send(c)).status,503);const id=records(c)[0].id,original=structuredClone(records(c)[0]);assert(c.storage.data.has('mirror/'+id));c=setup(c.storage,c.kv);await repair(c);assert.deepEqual(JSON.parse(c.kv.get('pending/v1/'+id)),original);
 c.env.PENDING.delete=async()=>{throw Error('synthetic');};assert.equal((await admin(c,reclaim([id]))).status,503);assert.equal(records(c).length,0);assert(c.kv.has('pending/v1/'+id));c=setup(c.storage,c.kv);await settle(c);await repair(c);assert.equal(c.kv.size,0);assert.equal(control(c).records,0);assert(!c.storage.data.has('mirror/'+id));void put;
});
test('serialized mirror put and concurrent reclamation cannot leave a stale KV owner copy',async()=>{
 const c=setup();let entered,release;const started=new Promise(r=>entered=r),blocked=new Promise(r=>release=r),put=c.env.PENDING.put;c.env.PENDING.put=async(...args)=>{entered();await blocked;return put(...args);};const pending=send(c);await started;const id=await sha256(body());const deletion=admin(c,reclaim([id]));release();assert.equal((await pending).status,202);assert.equal((await deletion).status,200);await settle(c);assert.equal(c.kv.size,0);assert.equal(control(c).records,0);
});
test('damaged legacy provenance blocks migration without deleting or blessing the record',async()=>{
 const c=setup(),r=await legacy(c,body());c.storage.data.get('record/'+r.id).rawJSON+='x';const before=structuredClone(records(c));const response=await send(c);assert.equal(response.status,503);assert.equal((await response.json()).error,'record_integrity_failure');assert.deepEqual(records(c),before);
});

test('KV success followed by failed durable acknowledgement repeats safely after restart',async()=>{
 let c=setup();const transact=c.storage.transaction.bind(c.storage);let failAck=true;
 c.storage.transaction=fn=>transact(tx=>fn({...tx,delete:async k=>{if(k.startsWith('mirror/')&&failAck){failAck=false;throw Error('synthetic acknowledgement crash');}return tx.delete(k);}}));
 assert.equal((await send(c)).status,503);const r=structuredClone(records(c)[0]);assert.equal(c.kv.size,1);assert(c.storage.data.has('mirror/'+r.id));
 c=setup(c.storage,c.kv);await repair(c);assert.deepEqual(JSON.parse(c.kv.get('pending/v1/'+r.id)),r);assert(!c.storage.data.has('mirror/'+r.id));assert.equal(control(c).records,1);
});
test('new admission budget is enforced at exactly 500 transactionally committed distinct records',async()=>{
 const c=setup();for(let i=0;i<500;i++){const p=fixture();p.owner.model='Synthetic '+i;assert.equal((await send(c,JSON.stringify(p),'198.51.100.'+i)).status,202);}
 const p=fixture();p.owner.model='Synthetic overflow';const r=await send(c,JSON.stringify(p),'203.0.113.200');assert.equal(r.status,429);assert.equal((await r.json()).error,'rate_limited');assert.equal(control(c).attempts,500);assert.equal(control(c).records,500);
});
test('explicit administrator can archive/reclaim a damaged record that blocks reconciliation',async()=>{
 const c=setup(),r=await legacy(c,body());c.storage.data.get('record/'+r.id).rawJSON+='x';assert.equal((await send(c)).status,503);
 assert.equal((await admin(c,reclaim([r.id]))).status,200);await settle(c);await repair(c);assert.equal(control(c).records,0);assert.equal(control(c).bytes,0);assert.equal(c.kv.size,0);assert.equal((await send(c)).status,202);
});
test('legacy challenge still binds the current exact hash while semantic variants share storage',async t=>{
 const c=setup();c.env.TURNSTILE_SECRET='synthetic';c.env.TURNSTILE_SITE_KEY='synthetic';t.mock.method(globalThis,'fetch',async()=>Response.json({success:true,hostname:'intake.example',action:'scanner_upload'}));
 await send(c);const raw=body()+' ',headers={'content-type':'application/json','cf-connecting-ip':'192.0.2.1',origin:c.env.ORIGIN};
 const r=await worker.fetch(new Request(c.env.ORIGIN+'/ticket',{method:'POST',headers,body:JSON.stringify({hash:await sha256(raw),turnstile:'synthetic'})}),c.env);assert.equal(r.status,200);const ticket=(await r.json()).ticket;
 const submit=bytes=>worker.fetch(new Request(c.env.ORIGIN+'/submit',{method:'POST',headers:{...headers,authorization:'Bearer '+ticket},body:bytes}),c.env);
 assert.equal((await submit(body())).status,401);const accepted=await submit(raw);assert.equal(accepted.status,202);assert.deepEqual(await accepted.json(),{id:await sha256(raw),status:'pending',duplicate:true});assert.equal(control(c).records,1);assert.equal(c.kv.size,1);assert.equal((await submit(raw)).status,401);
});

test('invalid counters fail closed; reconciliation restores quota accounting without record deletion',async()=>{
 const c=setup();await send(c);control(c).records=-1;const failed=await send(c,body()+' ');assert.equal(failed.status,503);assert.equal((await failed.json()).error,'counter_repair_required');
 await admin(c,{op:'admin-reconcile'});await settle(c);assert.equal(control(c).records,1);assert.equal(control(c).bytes,Buffer.byteLength(JSON.stringify(records(c)[0])));assert.equal((await send(c,body()+' ')).status,202);
});
