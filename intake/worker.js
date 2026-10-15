// SPDX-License-Identifier: AGPL-3.0-or-later
import {MAX_BODY,HASH,exact,validate,sha256,readBytes,parse} from './schema.js';
const TTL=300000;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
function configured(e){return e.ENABLED==='true'&&e.PENDING&&e.GATE&&e.IP_SALT?.length>=32&&e.TURNSTILE_SECRET&&/^[A-Za-z0-9_-]+$/.test(e.TURNSTILE_SITE_KEY||'')&&/^https:\/\/[a-z0-9.-]+$/.test(e.ORIGIN||'')&&Number.isInteger(+e.MAX_RECORDS)&&+e.MAX_RECORDS>0&&+e.MAX_RECORDS<=10000&&Number.isInteger(+e.MAX_STORED_BYTES)&&+e.MAX_STORED_BYTES>=MAX_BODY&&+e.MAX_STORED_BYTES<=100000000;}
async function gate(env,op,data){const r=await env.GATE.get(env.GATE.idFromName('scanner-intake-v1')).fetch('https://internal/',{method:'POST',body:JSON.stringify({op,...data})});const v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v;}
function page(env){
 const nonce=crypto.randomUUID().replaceAll('-','');
 const html=`<!doctype html><meta charset="utf-8"><title>Private scanner upload approval</title><h1>Approve one scanner report</h1><p>Only approve the SHA-256 shown in your scanner. Ticket expires after five minutes. Copy it into the scanner; do not share it.</p><pre id="hash"></pre><div id="challenge"></div><pre id="ticket" tabindex="0"></pre><p><a href="https://github.com/vortexopenclaw/dashcam-card-scanner/tree/main/intake" rel="noreferrer">Open-source submission service</a></p><script nonce="${nonce}">
const hash=location.hash.slice(1);history.replaceState(null,'','/challenge');document.getElementById('hash').textContent=hash;
window.ready=()=>{if(!/^[a-f0-9]{64}$/.test(hash)){document.getElementById('ticket').textContent='Invalid hash';return;}turnstile.render('#challenge',{sitekey:'${env.TURNSTILE_SITE_KEY}',action:'scanner_upload',callback:async token=>{const r=await fetch('/ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash,turnstile:token})});const v=await r.json();document.getElementById('ticket').textContent=r.ok?v.ticket:('Approval failed: '+v.error);}});};
</script><script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ready&render=explicit" async defer></script>`;
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; style-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`}});
}
export default {async fetch(req,env){try{
 const url=new URL(req.url); if(!['/challenge','/ticket','/submit'].includes(url.pathname))return reply({error:'not_found'},404);
 if(!configured(env))return reply({error:'disabled_or_unconfigured'},503);
 if(url.origin!==env.ORIGIN||url.search)return reply({error:'invalid_origin_or_query'},403);
 if(url.pathname==='/challenge'&&req.method==='GET')return page(env);
 if(req.method!=='POST'||!['/ticket','/submit'].includes(url.pathname))return reply({error:'method_not_allowed'},405);
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
 const ticket=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!ticket)return reply({error:'invalid_ticket'},401);
 const report=validate(parse(bytes)), hash=await sha256(bytes);
 const result=await gate(env,'redeem',{ticketHash:await sha256(ticket),hash,report,rawJSON:new TextDecoder().decode(bytes)});
 // Immutable DO record is authoritative. Retrying with a fresh ticket repairs a failed KV mirror write.
 try { await env.PENDING.put('pending/v1/'+hash,JSON.stringify(result.record)); }
 catch { throw Object.assign(Error('storage_unavailable_fresh_ticket_required'),{status:503}); }
 return reply({id:hash,status:'pending',duplicate:result.duplicate},202);
 }catch(e){return reply({error:e.status?e.message:(e.message==='payload_too_large'?'payload_too_large':'invalid_request')},e.status||(e.message==='payload_too_large'?413:400));}}};
export class IntakeGate {
 constructor(state,env){this.state=state;this.env=env;}
 async fetch(req){try{const p=await req.json();const now=Date.now();const out=await this.state.storage.transaction(async tx=>{
  let s=await tx.get('control')||{hour:Math.floor(now/3600000),attempts:0,rates:{},tickets:{},records:0,bytes:0};
  if(s.hour!==Math.floor(now/3600000)){s.hour=Math.floor(now/3600000);s.attempts=0;s.rates={};}
  for(const [k,t] of Object.entries(s.tickets))if(t.expires<=now)delete s.tickets[k];
  let result;
  if(p.op==='attempt'){
   const key=p.fingerprint+':'+p.kind;
   if(s.attempts>=500||Object.keys(s.rates).length>=256&&!Object.hasOwn(s.rates,key)||(s.rates[key]||0)>=10)throw Object.assign(Error('rate_limited'),{status:429});
   s.attempts++;s.rates[key]=(s.rates[key]||0)+1;result={ok:true};
  }else if(p.op==='issue'){
   if(Object.keys(s.tickets).length>=128)throw Object.assign(Error('ticket_capacity'),{status:429});
   const ticket=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
   s.tickets[await sha256(ticket)]={hash:p.hash,expires:now+TTL};result={ticket,expiresAt:new Date(now+TTL).toISOString()};
  }else if(p.op==='redeem'){
   const t=s.tickets[p.ticketHash];if(!t||t.hash!==p.hash)throw Object.assign(Error('invalid_ticket'),{status:401});
   const key='record/'+p.hash;let record=await tx.get(key);const duplicate=!!record;
   if(!record){
    const candidate={id:p.hash,receivedAt:new Date(now).toISOString(),report:p.report,rawJSON:p.rawJSON};
    const size=new TextEncoder().encode(JSON.stringify(candidate)).length;
    if(s.records>=+this.env.MAX_RECORDS||s.bytes+size>+this.env.MAX_STORED_BYTES)throw Object.assign(Error('storage_capacity'),{status:429});
    record=candidate;s.records++;s.bytes+=size;await tx.put(key,record);
   }
   delete s.tickets[p.ticketHash];result={record,duplicate};
  }else throw Error('invalid_operation');
  await tx.put('control',s);return result;
 });return reply(out);}catch(e){return reply({error:e.status?e.message:'internal_failure'},e.status||500);}}
}
