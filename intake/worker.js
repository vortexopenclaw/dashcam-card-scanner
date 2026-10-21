// SPDX-License-Identifier: AGPL-3.0-or-later
import {MAX_BODY,HASH,exact,validate,sha256,admissionHash,readBytes,parse} from './schema.js';
const TTL=300000;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
function configured(e,legacy=false){return e.ENABLED==='true'&&e.PENDING&&e.GATE&&e.IP_SALT?.length>=32&&(!legacy||(e.TURNSTILE_SECRET&&/^[A-Za-z0-9_-]+$/.test(e.TURNSTILE_SITE_KEY||'')))&&/^https:\/\/[a-z0-9.-]+$/.test(e.ORIGIN||'')&&Number.isInteger(+e.MAX_RECORDS)&&+e.MAX_RECORDS>0&&+e.MAX_RECORDS<=10000&&Number.isInteger(+e.MAX_STORED_BYTES)&&+e.MAX_STORED_BYTES>=MAX_BODY&&+e.MAX_STORED_BYTES<=100000000;}
async function gate(env,op,data){const r=await env.GATE.get(env.GATE.idFromName('scanner-intake-v1')).fetch('https://internal/',{method:'POST',body:JSON.stringify({op,...data})});const v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v;}
function page(env){
 const nonce=crypto.randomUUID().replaceAll('-','');
 const html=`<!doctype html><meta charset="utf-8"><title>Private scanner upload approval</title><h1>Approve one scanner report</h1><p id="instructions">Only approve the SHA-256 shown in your scanner. Ticket expires after five minutes. Copy it into the scanner; do not share it.</p><pre id="hash"></pre><div id="challenge"></div><pre id="ticket" tabindex="0"></pre><script nonce="${nonce}">
const fragment=location.hash.slice(1);history.replaceState(null,'','/challenge');
const app=fragment.match(/^app=1&hash=([a-f0-9]{64})&state=([a-f0-9]{64})$/);
const hash=app?app[1]:fragment;
const output=document.getElementById('ticket');
if(app)document.getElementById('instructions').textContent='Complete verification to submit the exact report you reviewed. This window closes automatically. Close it to cancel.';
document.getElementById('hash').textContent=/^[a-f0-9]{64}$/.test(hash)?hash:'Invalid hash';
let finished=false,working=false;
function finish(result){if(finished)return;finished=true;if(app){output.textContent='Returning to scanner…';location.replace('/app-complete#state='+app[2]+'&hash='+hash+'&'+result);}else{output.textContent=result.startsWith('ticket=')?result.slice(7):'Approval failed. Reload the challenge from your scanner to retry.';}}
window.ready=()=>{if(!/^[a-f0-9]{64}$/.test(hash)){output.textContent='Invalid hash';return;}turnstile.render('#challenge',{sitekey:'${env.TURNSTILE_SITE_KEY}',action:'scanner_upload','error-callback':()=>finish('error=challenge'),'expired-callback':()=>finish('error=expired'),callback:async token=>{if(finished||working)return;working=true;try{const r=await fetch('/ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash,turnstile:token})});const v=await r.json();if(!r.ok||typeof v.ticket!=='string'||!/^[a-f0-9]{64}$/.test(v.ticket)){finish('error=challenge');return;}finish('ticket='+v.ticket);}catch{finish('error=challenge');}}});};
</script><script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ready&render=explicit" async defer></script>`;
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; style-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`}});
}
export default {async fetch(req,env){try{
 const url=new URL(req.url); if(!['/challenge','/ticket','/submit','/submit-direct'].includes(url.pathname))return reply({error:'not_found'},404);
 if(!configured(env,url.pathname!=='/submit-direct'))return reply({error:'disabled_or_unconfigured'},503);
 if(url.origin!==env.ORIGIN||url.search)return reply({error:'invalid_origin_or_query'},403);
 if(url.pathname==='/challenge'&&req.method==='GET')return page(env);
 if(req.method!=='POST'||!['/ticket','/submit','/submit-direct'].includes(url.pathname))return reply({error:'method_not_allowed'},405);
 if(req.headers.get('content-type')!=='application/json')return reply({error:'invalid_content_type'},400);
 if(url.pathname==='/ticket'&&req.headers.get('origin')!==env.ORIGIN)return reply({error:'invalid_origin'},403);
 const ip=req.headers.get('cf-connecting-ip'); if(!ip)return reply({error:'missing_edge_ip'},403);
 const fingerprint=await sha256(env.IP_SALT+':'+Math.floor(Date.now()/86400000)+':'+ip);
 await gate(env,'attempt',{fingerprint,kind:url.pathname});
 const bytes=await readBytes(req,url.pathname==='/ticket'?4096:MAX_BODY);
 if(url.pathname==='/ticket'){
  const p=parse(bytes);exact(p,['hash','turnstile']);if(typeof p.hash!=='string'||p.hash.length!==64||!HASH.test(p.hash)||typeof p.turnstile!=='string'||!p.turnstile.length||p.turnstile.length>2048)throw Error('invalid_challenge');
  const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:p.turnstile}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Object.assign(Error('challenge_unavailable'),{status:503});const v=await r.json();
  if(v.success!==true||v.hostname!==new URL(env.ORIGIN).hostname||v.action!=='scanner_upload')return reply({error:'challenge_failed'},403);
  return reply(await gate(env,'issue',{hash:p.hash}));
 }
 const direct=url.pathname==='/submit-direct';
 const ticket=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!direct&&!ticket)return reply({error:'invalid_ticket'},401);
 const report=validate(parse(bytes)), hash=await sha256(bytes);
 const result=await gate(env,direct?'store-direct':'redeem',{...(direct?{}:{ticketHash:await sha256(ticket)}),hash,report,rawJSON:new TextDecoder().decode(bytes)});
 // Receipt identifies this client's exact prepared bytes, not the first record's
 // hash. Semantic retries do not create aliases or overwrite original provenance.
 return reply({id:hash,status:'pending',duplicate:result.duplicate},202);
 }catch(e){return reply({error:e.status?e.message:(e.message==='payload_too_large'?'payload_too_large':'invalid_request')},e.status||(e.message==='payload_too_large'?413:400));}}};
const fail=(message,status)=>Object.assign(Error(message),{status});
const sizeOf=r=>new TextEncoder().encode(JSON.stringify(r)).length;
const PAGE=50;
// A rebuild never removes accepted records. Admission is paused until the bounded
// cursor reaches the end, and partial counters are committed with that cursor.
async function rebuild(tx,s) {
 const m=s.rebuild;
 if(m.phase==='clear'){
  const keys=await tx.list({prefix:'semantic/',limit:PAGE});
  for(const key of keys.keys())await tx.delete(key);
  if(keys.size===PAGE)return false;
  m.phase='scan';m.cursor='';m.records=0;m.bytes=0;
 }
 const rows=await tx.list({prefix:'record/',startAfter:m.cursor||undefined,limit:PAGE});
 for(const [key,r] of rows){
  // Refuse to bless damaged legacy data. No raw record is altered or dropped.
  try{
   if(typeof r?.rawJSON!=='string'||new TextEncoder().encode(r.rawJSON).length>MAX_BODY||typeof r.receivedAt!=='string'||!Number.isFinite(Date.parse(r.receivedAt)))throw Error('invalid_record');
   const parsed=validate(parse(new TextEncoder().encode(r.rawJSON)));validate(r.report);
   if(key!=='record/'+r.id||await sha256(r.rawJSON)!==r.id||
      await admissionHash(JSON.stringify(parsed))!==await admissionHash(JSON.stringify(r.report)))throw Error('invalid_record');
  }catch{throw fail('record_integrity_failure',503);}
  const semantic='semantic/'+await admissionHash(r.rawJSON),first=await tx.get(semantic);
  if(!first||r.receivedAt<first.receivedAt||(r.receivedAt===first.receivedAt&&r.id<first.id))await tx.put(semantic,{id:r.id,receivedAt:r.receivedAt});
  await tx.put('mirror/'+r.id,{action:'put'});
  m.cursor=key;m.records++;m.bytes+=sizeOf(r);
 }
 if(rows.size===PAGE)return false;
 s.records=m.records;s.bytes=m.bytes;s.version=2;delete s.rebuild;return true;
}
export class IntakeGate {
 constructor(state,env){this.state=state;this.env=env;this.queue=Promise.resolve();}
 // Serialize KV side effects as well as transactions: an old in-flight put must
 // never race reclamation and resurrect a deleted record in the mirror.
 fetch(req){const job=this.queue.then(()=>this.handle(req));this.queue=job.catch(()=>{});return job;}
 async mirror(ids){
  for(const id of ids){
   const job=await this.state.storage.transaction(tx=>tx.get('mirror/'+id));if(!job)continue;
   const record=await this.state.storage.transaction(tx=>tx.get('record/'+id));
   if(job.action==='put'&&record)await this.env.PENDING.put('pending/v1/'+id,JSON.stringify(record));
   else await this.env.PENDING.delete('pending/v1/'+id);
   await this.state.storage.transaction(tx=>tx.delete('mirror/'+id));
  }
 }
 async handle(req){try{
 const p=parse(await readBytes(req,MAX_BODY*4)),now=Date.now(),admin=typeof p.op==='string'&&p.op.startsWith('admin-');
 // No public Worker route forwards this header or these operations. This second
 // boundary protects accidental binding exposure; the key is admin-only.
 if(admin&&(!this.env.ADMIN_CONTROL_KEY||this.env.ADMIN_CONTROL_KEY.length<32||
    req.headers.get('authorization')!=='Bearer '+this.env.ADMIN_CONTROL_KEY))return reply({error:'forbidden'},403);
 const out=await this.state.storage.transaction(async tx=>{
  const hour=Math.floor(now/3600000);
  let s=await tx.get('control')||{hour,attempts:0,rawAttempts:0,rates:{},tickets:{},records:0,bytes:0};
  if(s.hour!==hour){s.hour=hour;s.attempts=0;s.rawAttempts=0;s.rates={};}
  for(const [k,t] of Object.entries(s.tickets))if(t.expires<=now)delete s.tickets[k];
  if(p.op==='admin-reconcile')s.rebuild||={phase:'clear'};
  if(s.version!==2&&!s.rebuild)s.rebuild={phase:'clear'};
  if(s.rebuild&&!['admin-reclaim','admin-status','admin-repair-mirrors'].includes(p.op)){
   const done=await rebuild(tx,s);await tx.put('control',s);
   // Migration progress must survive a 503, not roll back with an exception.
   if(!done)return {blocked:true};
  }
  let result;
  if(p.op==='attempt'){
   if(!HASH.test(p.fingerprint)||!['/ticket','/submit','/submit-direct'].includes(p.kind))throw fail('invalid_operation',400);
   // Fixed deterministic buckets replace first-come occupancy of an IP map.
   // Collisions can throttle peers, but new IPs cannot fill an admission map.
   const key=p.fingerprint.slice(0,2)+':'+p.kind;
   if((s.rawAttempts||0)>=5000||(s.rates[key]||0)>=(p.kind==='/submit-direct'?60:10))throw fail('rate_limited',429);
   s.rawAttempts=(s.rawAttempts||0)+1;s.rates[key]=(s.rates[key]||0)+1;result={ok:true};
  }else if(p.op==='issue'){
   if(s.attempts>=500)throw fail('rate_limited',429);
   if(Object.keys(s.tickets).length>=128)throw fail('ticket_capacity',429);
   const ticket=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
   s.attempts++;s.tickets[await sha256(ticket)]={hash:p.hash,expires:now+TTL};result={ticket,expiresAt:new Date(now+TTL).toISOString()};
  }else if(p.op==='redeem'||p.op==='store-direct'){
   if(!Number.isSafeInteger(s.records)||s.records<0||!Number.isSafeInteger(s.bytes)||s.bytes<0)throw fail('counter_repair_required',503);
   if(p.op==='redeem'){const t=s.tickets[p.ticketHash];if(!t||t.hash!==p.hash)throw fail('invalid_ticket',401);}
   // The internal binding is not an authority to supply mismatched envelopes.
   const report=validate(parse(new TextEncoder().encode(p.rawJSON)));
   if(await sha256(p.rawJSON)!==p.hash||await admissionHash(JSON.stringify(report))!==await admissionHash(JSON.stringify(p.report)))throw fail('invalid_record',400);
   const semantic='semantic/'+await admissionHash(p.rawJSON),first=await tx.get(semantic);
   let record=await tx.get('record/'+p.hash);
   if(!record&&first)record=await tx.get('record/'+first.id);
   if(first&&!record||record&&'semantic/'+await admissionHash(record.rawJSON)!==semantic)throw fail('counter_repair_required',503);
   if(record&&!first)await tx.put(semantic,{id:record.id,receivedAt:record.receivedAt});
   const duplicate=!!record;
   if(!record){
    const candidate={id:p.hash,receivedAt:new Date(now).toISOString(),report,rawJSON:p.rawJSON},size=sizeOf(candidate);
    if(s.records>=+this.env.MAX_RECORDS||s.bytes+size>+this.env.MAX_STORED_BYTES)throw fail('storage_capacity',429);
    if(p.op==='store-direct'&&s.attempts>=500)throw fail('rate_limited',429);
    if(p.op==='store-direct')s.attempts++;
    record=candidate;s.records++;s.bytes+=size;await tx.put('record/'+p.hash,record);
    await tx.put(semantic,{id:record.id,receivedAt:record.receivedAt});
   }
   if(p.op==='redeem')delete s.tickets[p.ticketHash];
   await tx.put('mirror/'+record.id,{action:'put'});result={duplicate,mirrorIds:[record.id]};
  }else if(p.op==='admin-reclaim'){
   try{exact(p,['op','ids','reason','archiveConfirmed','confirm']);}catch{throw fail('invalid_admin_request',400);}
   if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>20||new Set(p.ids).size!==p.ids.length||!p.ids.every(id=>typeof id==='string'&&HASH.test(id))||
      p.confirm!=='permanently-delete-reviewed-records'||p.archiveConfirmed!==true||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>200)throw fail('invalid_admin_request',400);
   for(const id of p.ids){
    const r=await tx.get('record/'+id);
    if(r){await tx.delete('record/'+id);s.records--;s.bytes-=sizeOf(r);}
    // A retry, including after a crash, re-deletes any stale KV copy.
    await tx.put('mirror/'+id,{action:'delete'});
   }
   s.rebuild={phase:'clear'};
   await tx.put('admin-last',{at:new Date(now).toISOString(),ids:p.ids,reason:p.reason,archiveConfirmed:true});
   result={ok:true,reconciliationRequired:true,mirrorIds:p.ids};
  }else if(['admin-reconcile','admin-step','admin-status','admin-repair-mirrors'].includes(p.op)){
   try{exact(p,['op']);}catch{throw fail('invalid_admin_request',400);}
   result={ok:true,records:s.records,bytes:s.bytes,reconciliationRequired:!!s.rebuild};
   if(p.op==='admin-repair-mirrors')result.mirrorIds=[...(await tx.list({prefix:'mirror/',limit:PAGE})).keys()].map(k=>k.slice(7));
  }else throw fail('invalid_operation',400);
  await tx.put('control',s);return result;
 });
 if(out.blocked)return reply({error:'migration_in_progress'},503);
 if(out.mirrorIds){
  try{await this.mirror(out.mirrorIds);}catch{throw fail(p.op==='redeem'?'storage_unavailable_fresh_ticket_required':'storage_unavailable_retry_same_bytes',503);}
  out.repaired=out.mirrorIds.length;delete out.mirrorIds;
 }
 return reply(out);
 }catch(e){return reply({error:e.status?e.message:'internal_failure'},e.status||500);}}
}
