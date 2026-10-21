// SPDX-License-Identifier: AGPL-3.0-or-later
// Optional local workerd acceptance. Explicit external Miniflare module path;
// no Cloudflare account, credentials, network service or persisted owner data.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sha256} from '../schema.js';
if(!process.env.INTAKE_MINIFLARE_MODULE)throw Error('Set INTAKE_MINIFLARE_MODULE to a locally installed miniflare ESM entry');
const {Miniflare}=await import(process.env.INTAKE_MINIFLARE_MODULE);
const key='synthetic-local-runtime-admin-key-only';
const mf=new Miniflare({cf:false,modules:true,modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs']}],scriptPath:fileURLToPath(new URL('./runtime-worker.mjs',import.meta.url)),compatibilityDate:'2026-07-01',kvNamespaces:['PENDING'],durableObjects:{GATE:{className:'RuntimeGate',useSQLite:true}},bindings:{ENABLED:'true',IP_SALT:'s'.repeat(32),ADMIN_CONTROL_KEY:key,ORIGIN:'https://intake.example',MAX_RECORDS:'2',MAX_STORED_BYTES:'100000'}});
const report={schemaVersion:1,owner:{manufacturer:'Synthetic',model:'Workerd',channelCount:1},evidence:[{channel:'front',mode:'normal',width:1920,height:1080,fps:30,bitrateKbps:10000,containerBitrateKbps:null,sizeBytes:10000000,durationSeconds:10,codec:'h264'}]},raw=JSON.stringify(report);
const send=body=>mf.dispatchFetch('https://intake.example/submit-direct',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body});
try{
 const ns=await mf.getDurableObjectNamespace('GATE'),id=ns.idFromName('scanner-intake-v1'),stub=ns.get(id),kv=await mf.getKVNamespace('PENDING');
 const storageCall=async p=>(await stub.fetch('https://internal/test-storage',{method:'POST',body:JSON.stringify(p)})).json();
 const storage={put:(key,value)=>storageCall({op:'put',key,value}),get:key=>storageCall({op:'get',key})};
 const admin=p=>stub.fetch('https://internal/',{method:'POST',headers:{authorization:'Bearer '+key},body:JSON.stringify(p)});
 // Real SQLite-backed transactional legacy migration, preserving two old copies.
 for(const body of [raw,raw+' ']){const r={id:await sha256(body),receivedAt:'2026-01-01T00:00:00Z',report,rawJSON:body};await storage.put('record/'+r.id,r);}
 const first=await storage.get('record/'+await sha256(raw));
 let r=await send(raw+'\n');assert.equal(r.status,202);assert.deepEqual(await r.json(),{id:await sha256(raw+'\n'),status:'pending',duplicate:true});assert.equal((await storage.get('control')).records,2);
 const other=JSON.stringify({...report,owner:{...report.owner,model:'Other'}});r=await send(other);assert.equal(r.status,429);assert.equal((await r.json()).error,'storage_capacity');
 assert.equal((await stub.fetch('https://internal/',{method:'POST',body:JSON.stringify({op:'admin-reclaim',ids:[first.id]})})).status,403);
 r=await admin({op:'admin-reclaim',ids:[first.id],archiveConfirmed:true,reason:'Reviewed synthetic archive only',confirm:'permanently-delete-reviewed-records'});assert.equal(r.status,200);
 assert.equal((await admin({op:'admin-step'})).status,200);assert.equal((await storage.get('control')).records,1);assert.equal(await kv.get('pending/v1/'+first.id),null);
 assert.equal((await send(other)).status,202);assert.equal((await storage.get('control')).records,2);
 for(let i=0;i<3;i++){r=await admin({op:'admin-repair-mirrors'});assert.equal(r.status,200);if(!(await r.json()).repaired)break;}
 const keys=await kv.list({prefix:'pending/v1/'});assert.equal(keys.keys.length,2);assert.equal(await storage.get('record/'+first.id),null);
 // Exercise actual multi-page SQLite scan and persisted cursor, not only mocks.
 for(let i=0;i<51;i++){const report2={...report,owner:{...report.owner,model:'Legacy '+i}},body=JSON.stringify(report2),record={id:await sha256(body),receivedAt:'2026-01-01T00:00:00Z',report:report2,rawJSON:body};await storage.put('record/'+record.id,record);}
 r=await admin({op:'admin-reconcile'});assert.equal(r.status,503);assert.equal((await r.json()).error,'migration_in_progress');assert.equal((await storage.get('control')).rebuild.records,50);
 r=await admin({op:'admin-step'});assert.equal(r.status,200);assert.equal((await storage.get('control')).records,53);
 const before=await storage.get('control');before.hour--;await storage.put('control',before);r=await send(JSON.stringify({...report,owner:{...report.owner,model:'Over quota after reset'}}));assert.equal(r.status,429);assert.equal((await r.json()).error,'storage_capacity');assert.equal((await storage.get('control')).records,53);
 console.log('PASS workerd SQLite bounded migration (53 retained), semantic receipt, quota/reset, admin auth, explicit reclamation, counter repair and KV repair');
}finally{await mf.dispose();}
