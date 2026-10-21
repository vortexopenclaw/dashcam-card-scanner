// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic offline fixtures only. No real owner/card data or live requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{IntakeGate} from '../worker.js';
import {sha256,MAX_BODY} from '../schema.js';
import {checkRecord} from '../review.js';
const fixture=()=>({schemaVersion:1,owner:{manufacturer:'Synthetic',model:'Direct',channelCount:1},evidence:[{channel:'front',mode:'normal',width:1920,height:1080,fps:30,bitrateKbps:10000,containerBitrateKbps:null,sizeBytes:10000000,durationSeconds:10,codec:'h264'}]});
class Storage {
 constructor(){this.data=new Map();this.queue=Promise.resolve();}
 transaction(fn){const run=async()=>{const copy=new Map(structuredClone([...this.data]));const result=await fn({get:async k=>structuredClone(copy.get(k)),put:async(k,v)=>copy.set(k,structuredClone(v))});this.data=copy;return result;};const job=this.queue.then(run);this.queue=job.catch(()=>{});return job;}
}
function setup(){const storage=new Storage(),kv=new Map();const env={ENABLED:'true',IP_SALT:'s'.repeat(32),ORIGIN:'https://intake.example',MAX_RECORDS:'1000',MAX_STORED_BYTES:'10000000',PENDING:{put:async(k,v)=>kv.set(k,v)}};const gate=new IntakeGate({storage},env);env.GATE={idFromName:x=>x,get:()=>({fetch:(url,init)=>gate.fetch(new Request(url,init))})};return {env,storage,kv};}
const body=()=>JSON.stringify(fixture());
const send=(c,bytes=body(),ip='192.0.2.1',route='/submit-direct')=>worker.fetch(new Request(c.env.ORIGIN+route,{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip},body:bytes}),c.env);
test('direct needs no ticket or Turnstile configuration; immutable private exact-byte receipt',async()=>{
 const c=setup(),bytes=body()+'\n',hash=await sha256(bytes);let r=await send(c,bytes);assert.equal(r.status,202);assert.deepEqual(await r.json(),{id:hash,status:'pending',duplicate:false});
 const first=c.kv.get('pending/v1/'+hash),record=JSON.parse(first);assert.equal(record.rawJSON,bytes);await checkRecord(record);assert(!first.includes('192.0.2.1'));assert.deepEqual(c.storage.data.get('control').tickets,{});
 r=await send(c,bytes);assert.equal(r.status,202);assert.equal((await r.json()).duplicate,true);assert.equal(c.kv.get('pending/v1/'+hash),first);assert.equal(c.storage.data.get('control').records,1);
 for(const route of ['/pending','/pending/v1/'+hash,'/record/'+hash])assert.equal((await worker.fetch(new Request(c.env.ORIGIN+route),c.env)).status,404);
 assert.equal((await worker.fetch(new Request(c.env.ORIGIN+'/challenge'),c.env)).status,503);
});
test('direct malformed, duplicate JSON keys, private fields, invalid UTF8, BOM and oversize never store',async()=>{
 const privateReport=fixture();privateReport.paths=['private'];const nested=fixture();nested.owner.serial='private';
 const invalid=['{',body().replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'),JSON.stringify(privateReport),JSON.stringify(nested),'\ufeff'+body(),new Uint8Array([0xff]),' '.repeat(MAX_BODY+1)];
 for(const bytes of invalid){const c=setup();const r=await send(c,bytes);assert.equal(r.status,typeof bytes==='string'&&bytes.length>MAX_BODY?413:400);assert.equal(c.kv.size,0);assert.equal(c.storage.data.get('control').records,0);assert.equal([...c.storage.data.keys()].filter(k=>k.startsWith('record/')).length,0);}
});
test('direct stream and declared length limits reject before report storage',async()=>{
 const c=setup();
 for(const streamed of [false,true]){
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8000));controller.enqueue(new Uint8Array(9000));controller.close();}});
  const req=new Request(c.env.ORIGIN+'/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1','content-length':streamed?'2':'999999'},body:streamed?stream:'{}',...(streamed?{duplex:'half'}:{})});
  assert.equal((await worker.fetch(req,c.env)).status,413);assert.equal(c.kv.size,0);assert.equal(c.storage.data.get('control').records,0);
 }
});
test('several distinct direct card reports work without legacy secrets',async()=>{
 const c=setup();c.env.TURNSTILE_SECRET='';c.env.TURNSTILE_SITE_KEY='invalid key';
 for(let i=0;i<5;i++){const report=fixture();report.owner.model='Synthetic '+i;assert.equal((await send(c,JSON.stringify(report))).status,202);}
 assert.equal(c.kv.size,5);assert.equal(c.storage.data.get('control').records,5);assert.deepEqual(c.storage.data.get('control').tickets,{});
});
test('concurrent direct duplicates store one authoritative immutable record',async()=>{
 const c=setup(),bytes=body();const rs=await Promise.all(Array.from({length:8},()=>send(c,bytes)));assert(rs.every(r=>r.status===202));const results=await Promise.all(rs.map(r=>r.json()));assert.equal(results.filter(r=>!r.duplicate).length,1);assert.equal(c.kv.size,1);assert.equal(c.storage.data.get('control').records,1);
 const record=JSON.parse([...c.kv.values()][0]);assert.deepEqual(record,c.storage.data.get('record/'+record.id));
});
test('direct per-IP 60 and shared global 500 attempts per hour; counters bounded',async()=>{
 const c=setup();for(let i=0;i<60;i++)assert.equal((await send(c)).status,202);assert.equal((await send(c)).status,429);assert.equal(c.storage.data.get('control').attempts,60);
 const d=setup();for(let i=0;i<500;i++)assert.equal((await send(d,body(),'192.0.2.'+(1+Math.floor(i/60)))).status,202);assert.equal((await send(d,body(),'192.0.2.99')).status,429);assert.equal(d.storage.data.get('control').attempts,500);assert(Object.keys(d.storage.data.get('control').rates).length<=256);
 const e=setup();for(let i=0;i<256;i++)assert.equal((await send(e,'{','198.51.100.'+i)).status,400);assert.equal((await send(e,'{','203.0.113.1')).status,429);assert.equal(Object.keys(e.storage.data.get('control').rates).length,256);
 const control=e.storage.data.get('control');control.hour--;assert.equal((await send(e)).status,202);assert.equal(e.storage.data.get('control').attempts,1);
});
test('direct count/byte capacity allows duplicate recovery but no new reports',async()=>{
 const c=setup();c.env.MAX_RECORDS='1';assert.equal((await send(c)).status,202);const first=[...c.kv.values()][0],other=fixture();other.owner.model='Other';assert.equal((await send(c,JSON.stringify(other))).status,429);assert.equal((await send(c)).status,202);assert.equal([...c.kv.values()][0],first);
 const d=setup();await send(d,'{');d.storage.data.get('control').bytes=+d.env.MAX_STORED_BYTES;assert.equal((await send(d)).status,429);assert.equal(d.kv.size,0);assert.equal(d.storage.data.get('control').records,0);
});
test('direct transient KV failure retries exact bytes without ticket and repairs original record',async()=>{
 const c=setup(),bytes=body(),hash=await sha256(bytes),put=c.env.PENDING.put;let fail=true;c.env.PENDING.put=async(...args)=>{if(fail){fail=false;throw Error('synthetic');}return put(...args);};assert.equal((await send(c,bytes)).status,503);assert.equal(c.kv.size,0);const original=structuredClone(c.storage.data.get('record/'+hash));const r=await send(c,bytes);assert.equal(r.status,202);assert.equal((await r.json()).duplicate,true);assert.deepEqual(JSON.parse(c.kv.get('pending/v1/'+hash)),original);assert.equal(c.storage.data.get('control').records,1);
});
test('direct still fails closed on origin, enable, bindings, quotas, content type and methods',async()=>{
 for(const [key,value] of [['ENABLED','false'],['IP_SALT','short'],['GATE',null],['PENDING',null],['MAX_RECORDS','10001'],['MAX_STORED_BYTES','1']]){const c=setup();c.env[key]=value;assert.equal((await send(c)).status,503);}
 const c=setup();assert.equal((await send(c,body(),'192.0.2.1','/submit-direct?x=1')).status,403);
 for(const method of ['GET','PUT','DELETE'])assert.equal((await worker.fetch(new Request(c.env.ORIGIN+'/submit-direct',{method}),c.env)).status,405);
 for(const headers of [{'content-type':'text/plain','cf-connecting-ip':'192.0.2.1'},{'content-type':'application/json'}])assert.equal((await worker.fetch(new Request(c.env.ORIGIN+'/submit-direct',{method:'POST',headers,body:body()}),c.env)).status,headers['cf-connecting-ip']?400:403);
});
