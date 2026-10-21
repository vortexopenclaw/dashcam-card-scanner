// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import bridge from '../admin-bridge.js';
import {administer} from '../admin-cli.js';
const key='synthetic-private-administration-'.repeat(2);
const env={ADMIN_CONTROL_KEY:key,GATE:{idFromName:n=>n,get:()=>({fetch:async(url,init)=>Response.json({url,payload:JSON.parse(init.body),auth:init.headers.authorization})})}};
const req=(p={},authorization='Bearer '+key)=>new Request('https://private-preview/',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(p)});
test('private bridge requires its own key and restricts operations, path and method',async()=>{
 for(const token of [null,'Bearer wrong'])assert.equal((await bridge.fetch(req({op:'admin-status'},token),env)).status,403);
 assert.equal((await bridge.fetch(req({op:'admin-status'}),{...env,ADMIN_CONTROL_KEY:undefined})).status,403);
 for(const op of ['attempt','store-direct','redeem','issue','delete','admin-unknown'])assert.equal((await bridge.fetch(req({op}),env)).status,400);
 const r=await bridge.fetch(req({op:'admin-status'}),env);assert.equal(r.status,200);const result=await r.json();assert.equal(result.url,'https://internal/');assert.deepEqual(result.payload,{op:'admin-status'});assert.equal(result.auth,'Bearer '+key);
 assert.equal((await bridge.fetch(new Request('https://private-preview/other',{method:'POST',headers:{authorization:'Bearer '+key}}),env)).status,400);
});
test('checked-in bridge has no public routes, workers.dev or version preview URL',async()=>{
 const text=await fs.readFile(new URL('../wrangler.admin.example.toml',import.meta.url),'utf8');assert.match(text,/workers_dev = false/);assert.match(text,/preview_urls = false/);assert(!/^routes?\s*=/m.test(text));assert.match(text,/REPLACE_WITH_EXACT_EXISTING_INTAKE_SCRIPT_NAME/);
});
test('admin CLI uses only selected key and fixed loopback origin, refuses redirects and bounds auth failures',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url,init)=>{calls++;assert.equal(url,'http://127.0.0.1:8791/');assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,'Bearer '+key);return Response.json({ok:true,records:4,bytes:123});});
 const options={INTAKE_ADMIN_KEY_ENV:'SYNTHETIC_KEY',SYNTHETIC_KEY:key,INTAKE_ADMIN_LOCAL_PORT:'8791'};
 for(const invalid of [{INTAKE_ADMIN_KEY_ENV:undefined},{INTAKE_ADMIN_KEY_ENV:'CF_API_TOKEN'},{INTAKE_ADMIN_LOCAL_PORT:'https://public.example'},{INTAKE_ADMIN_LOCAL_PORT:'80'},{SYNTHETIC_KEY:'short'}])await assert.rejects(administer({op:'admin-status'},{...options,...invalid}));assert.equal(calls,0);
 assert.deepEqual(await administer({op:'admin-status'},options),{ok:true,records:4,bytes:123});assert.equal(calls,1);
 t.mock.method(globalThis,'fetch',async()=>new Response('PRIVATE-UPSTREAM-DIAGNOSTIC',{status:403}));await assert.rejects(administer({op:'admin-status'},options),e=>!e.message.includes('PRIVATE-UPSTREAM-DIAGNOSTIC'));
});
test('admin CLI reads back reconciliation and drains durable repair queue after explicit reclamation',async t=>{
 const ops=[],responses=[{ok:true,reconciliationRequired:true},{error:'migration_in_progress'},{ok:true,reconciliationRequired:false},{repaired:50},{repaired:0},{ok:true,records:3,bytes:789}];
 t.mock.method(globalThis,'fetch',async(url,init)=>{const p=JSON.parse(init.body);ops.push(p.op);const data=responses.shift();return Response.json(data,{status:data.error?503:200});});
 const result=await administer({op:'admin-reclaim',ids:['a'.repeat(64)],confirm:'permanently-delete-reviewed-records',archiveConfirmed:true,reason:'synthetic reviewed archive'},{INTAKE_ADMIN_KEY_ENV:'SYNTHETIC_KEY',SYNTHETIC_KEY:key,INTAKE_ADMIN_LOCAL_PORT:'8791'});
 assert.deepEqual(ops,['admin-reclaim','admin-step','admin-step','admin-repair-mirrors','admin-repair-mirrors','admin-status']);assert.deepEqual(result,{ok:true,records:3,bytes:789});assert.equal(responses.length,0);
});
