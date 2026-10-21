// SPDX-License-Identifier: AGPL-3.0-or-later
// PRIVATE preview-only bridge. Never add routes or enable workers.dev. Wrangler's
// authenticated remote preview attaches the existing production DO binding.
import {MAX_BODY,readBytes,parse} from './schema.js';
const response=(error,status)=>Response.json({error},{status,headers:{'cache-control':'no-store'}});
export default {async fetch(req,env){
 if(!env.ADMIN_CONTROL_KEY||env.ADMIN_CONTROL_KEY.length<32||req.headers.get('authorization')!=='Bearer '+env.ADMIN_CONTROL_KEY)return response('forbidden',403);
 const url=new URL(req.url);
 if(url.pathname!=='/'||url.search||req.method!=='POST'||req.headers.get('content-type')!=='application/json')return response('invalid_admin_request',400);
 try{
  const bytes=await readBytes(req,MAX_BODY),p=parse(bytes);
  if(!['admin-status','admin-reconcile','admin-step','admin-repair-mirrors','admin-reclaim'].includes(p.op))return response('invalid_admin_request',400);
  return await env.GATE.get(env.GATE.idFromName('scanner-intake-v1')).fetch('https://internal/',{method:'POST',headers:{authorization:'Bearer '+env.ADMIN_CONTROL_KEY},body:JSON.stringify(p)});
 }catch{return response('admin_unavailable',503);}
}};
