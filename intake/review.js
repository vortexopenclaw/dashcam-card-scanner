// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validate,sha256,HASH,MAX_BODY,readBytes,parse,safeFolderComponent} from './schema.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const norm=s=>s.toLowerCase().trim().replace(/\s+/g,' ');
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const sorted=a=>[...a].sort((a,b)=>stable(a).localeCompare(stable(b)));
// Project measurements explicitly; folderIndex is a location, not a measurement.
const measurementKeys=['channel','mode','width','height','fps','bitrateKbps','containerBitrateKbps','sizeBytes','durationSeconds','codec'];
export const evidenceHash=p=>sha256(stable(sorted(p.evidence.map(e=>Object.fromEntries(measurementKeys.map(k=>[k,e[k]]))))));
const observations=p=>[...p.evidence,...(p.structure?.observedLayouts||[])];
const channels=p=>[...new Set(observations(p).map(e=>e.channel))].sort();
// Resolve positional references before sorting; retain case-sensitive identities.
const layout=(p,entries)=>sorted([...new Map(entries.map(e=>{const v={folder:e.folderIndex===undefined?null:p.structure.folders[e.folderIndex].components,channel:e.channel,mode:e.mode};return [stable(v),v];})).values()]);
export const structureHash=p=>sha256(stable(p.structure?{...p.structure,folders:sorted(p.structure.folders.map(f=>({...f,extensions:sorted(f.extensions),filenameTemplates:sorted(f.filenameTemplates)}))),observedLayouts:layout(p,p.structure.observedLayouts)}:null));
export const cohort=p=>stable({timeLapseFps:p.owner.timeLapseFps??null,folders:p.structure?sorted(p.structure.folders.map(f=>f.components)):null,firmware:p.owner.firmware??null,channelCount:p.owner.channelCount,quality:p.owner.quality??null,parkingMode:p.owner.parkingMode??null,layout:layout(p,observations(p))});
function compareFolders(p,matches){
 const known=matches.flatMap(profile=>['driving_folders','parking_folders','other_folders'].flatMap(k=>(Array.isArray(profile.recording?.[k])?profile.recording[k]:[]).flatMap(f=>{
   if(typeof f?.path!=='string')return [];const parts=f.path.split('/');
   if(parts.length>8||!parts.every(c=>safeFolderComponent(c)&&!c.startsWith('folder-')))return [];
   return [{profileId:profile.id,components:parts,mode:f.mode}];
 })));
 return {folders:(p.structure?.folders||[]).map((f,folderIndex)=>({folderIndex,components:f.components,matches:known.filter(k=>stable(k.components)===stable(f.components)),status:f.components.some(c=>c.startsWith('folder-'))?'manual_alias':!known.length?'upstream_structured_folders_missing':known.some(k=>stable(k.components)===stable(f.components))?'known_path':'new_path_candidate'})),scope:'exact case-sensitive folder paths only; modes and filename patterns require manual comparison',filenameComparison:'manual_required; upstream regular expressions are never executed'};
}
export async function checkRecord(r){
 if(!HASH.test(r.id)||typeof r.rawJSON!=='string'||Buffer.byteLength(r.rawJSON)>MAX_BODY||await sha256(r.rawJSON)!==r.id)throw Error('Record integrity failed');
 const report=validate(parse(new TextEncoder().encode(r.rawJSON)));if(stable(report)!==stable(r.report))throw Error('Record envelope mismatch');return report;
}
export async function review(record,profiles,previous=[]){
 const p=await checkRecord(record), hash=await evidenceHash(p);
 const matches=profiles.filter(x=>norm(x.manufacturer)===norm(p.owner.manufacturer)&&norm(x.model)===norm(p.owner.model));
 const flags=[];if(!matches.length)flags.push('new_model_candidate');if(matches.length>1)flags.push('ambiguous_model_match');
 const same=[];for(const old of previous){if(old.id===record.id)continue;const q=await checkRecord(old);if(norm(q.owner.manufacturer)===norm(p.owner.manufacturer)&&norm(q.owner.model)===norm(p.owner.model))same.push({id:old.id,p:q,hash:await evidenceHash(q)});}
 const duplicates=same.filter(x=>p.evidence.length&&x.p.evidence.length&&x.hash===hash).map(x=>({id:x.id,sameCohort:cohort(x.p)===cohort(p)}));
 if(p.evidence.length){if(duplicates.some(x=>x.id))flags.push('duplicate_numeric_evidence');else flags.push('new_evidence_candidate');}else flags.push('insufficient_measurements');
 const dimensions={firmware:'new_firmware_candidate',channelCount:'new_channel_count_candidate',quality:'new_settings_candidate',parkingMode:'new_parking_mode_candidate',timeLapseFps:'new_cadence_candidate'};
 for(const [k,flag] of Object.entries(dimensions))if(same.length&&p.owner[k]!==undefined&&!same.some(x=>x.p.owner[k]===p.owner[k]))flags.push(flag);
 if(same.length&&!same.some(x=>stable(channels(x.p))===stable(channels(p))))flags.push('new_channel_layout_candidate');
 const conflicts=same.filter(x=>p.evidence.length&&x.p.evidence.length&&cohort(x.p)===cohort(p)&&x.hash!==hash).map(x=>x.id);
 if(conflicts.length)flags.push('possible_contradiction_or_measurement_variation');
 if(p.structure){const sh=await structureHash(p);const sameStructures=[];for(const x of same)if(x.p.structure&&await structureHash(x.p)===sh)sameStructures.push(x.id);flags.push(sameStructures.length?'duplicate_structural_evidence':'new_structure_candidate');}
 if(p.evidence.length&&p.evidence.some(e=>e.width===null||e.height===null||e.fps===null||e.sizeBytes===null||e.durationSeconds===null||e.bitrateKbps===null))flags.push('insufficient_measurements');
 if(['firmware','quality','parkingMode'].some(k=>p.owner[k]===undefined||p.owner[k]==='unknown')||observations(p).some(e=>e.channel==='unknown'||e.mode==='unknown'))flags.push('insufficient_metadata');
 if(p.owner.parkingMode==='off'&&observations(p).some(e=>e.mode==='parking'))flags.push('owner_measurement_contradiction');
 if(channels(p).filter(c=>c!=='unknown').length>p.owner.channelCount)flags.push('owner_channel_count_contradiction');
 const layout=channels(p);
 const variants=matches.flatMap(x=>(x.channel_variants||[]).map(v=>({profileId:x.id,...v})));
 const completeLayout=!layout.includes('unknown')&&layout.length===p.owner.channelCount;
 const knownLayouts=variants.filter(v=>v.channels===p.owner.channelCount&&stable([...(v.roles||[])].sort())===stable(layout));
 if(variants.length&&completeLayout)flags.push(knownLayouts.length?'canonical_channel_layout_known':'canonical_new_channel_layout_candidate');
 return {id:record.id,receivedAt:record.receivedAt,ownerAssertions:p.owner,scannerReportedMeasurements:p.evidence,scannerReportedStructure:p.structure??null,structureEvidenceHash:await structureHash(p),coverage:{scanCompleted:p.structure?.completed??null,mediaCount:p.structure?.mediaCount??null,sampleCount:p.evidence.length,pairedSampleCount:p.evidence.filter(e=>e.sizeBytes!==null&&e.durationSeconds!==null).length,metadataSampleCount:p.evidence.filter(e=>e.width!==null&&e.height!==null&&e.fps!==null).length,status:!p.evidence.length||!p.evidence.some(e=>e.width!==null&&e.height!==null&&e.fps!==null)?'insufficient_measurements':'sampled_not_exhaustive'},canonicalFolderComparison:compareFolders(p,matches),numericEvidenceHash:hash,cohort:JSON.parse(cohort(p)),canonicalMatches:matches.map(x=>({id:x.id,evidence:x.evidence,technicalFacts:x.technical_facts,channelVariants:x.channel_variants,parkingModes:x.recording?.parking_modes})),canonicalChannelComparison:{completeObservedLayout:completeLayout,knownLayouts,status:!variants.length?'upstream_layout_metadata_missing':!completeLayout?'insufficient_observed_channels':knownLayouts.length?'known_layout':'new_layout_candidate',scope:'layout only; does not establish firmware/settings/numeric measurement agreement'},canonicalNumericComparison:'not_normalized_in_upstream_schema; manual comparison required',flags,duplicateEvidence:duplicates,possibleConflicts:conflicts,sanitizedRawReport:p,warning:'Anonymous unverified submission. No automatic acceptance, merge, or public claim.'};
}
async function api(suffix,decode=true){
 const {CF_ACCOUNT_ID:account,CF_KV_NAMESPACE_ID:namespace}=process.env;
 if(!/^[a-f0-9]{32}$/.test(account||'')||!/^[a-f0-9]{32}$/.test(namespace||''))throw Error('Set explicit CF_ACCOUNT_ID and dedicated CF_KV_NAMESPACE_ID');
 let token=process.env.CF_API_TOKEN;
 if(!token&&process.env.CF_TOKEN_OP_REF){if(!process.env.CF_TOKEN_OP_REF.startsWith('op://'))throw Error('Invalid 1Password reference');token=execFileSync('op',['read',process.env.CF_TOKEN_OP_REF],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
 if(!token)throw Error('Set CF_API_TOKEN or CF_TOKEN_OP_REF');
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}${suffix}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(`Cloudflare HTTP ${r.status}`);const bytes=await readBytes(r,2000000);return decode?parse(bytes):bytes;
}
export async function pull(destination,maxPages=5,startCursor=''){
 if(typeof startCursor!=='string'||startCursor.length>4096)throw Error('Invalid cursor');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>20)throw Error('pages must be 1..20');
 await fs.mkdir(destination,{recursive:true,mode:0o700});let cursor=startCursor,count=0,quarantined=0;const seen=new Set();
 for(let i=0;i<maxPages;i++){
  const response=await api('/keys?'+new URLSearchParams({prefix:'pending/v1/',limit:'100',...(cursor?{cursor}:{})}));
  if(!response.success||!Array.isArray(response.result)||response.result.length>100)throw Error('Invalid list response');
  for(const key of response.result){if(!/^pending\/v1\/[a-f0-9]{64}$/.test(key.name)||seen.has(key.name))continue;seen.add(key.name);const id=key.name.slice(11),file=path.join(destination,id+'.json');
   try{await fs.access(file);continue;}catch{}
   // Network/auth failures remain fatal; malformed or oversized records are
   // quarantined. Never persist unvalidated payloads or exception/response text.
   let bytes,record;
   try{bytes=await api('/values/'+encodeURIComponent(key.name),false);}catch(e){if(e.message!=='payload_too_large')throw e;}
   try{if(!bytes)throw Error('Oversized record');record=parse(bytes);await checkRecord(record);if(record.id!==id)throw Error('Record key mismatch');}
   catch{
    const quarantine=path.join(destination,'quarantine');await fs.mkdir(quarantine,{recursive:true,mode:0o700});
    try{await fs.writeFile(path.join(quarantine,id+'.json'),JSON.stringify({id,reason:'invalid_record'}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
    quarantined++;continue;
   }
   await fs.writeFile(file,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});count++;
  }
  cursor=response.result_info?.cursor||'';if(!cursor)break;
 }
 return {downloaded:count,quarantined,hasMore:!!cursor,nextCursor:cursor||null,warning:'Bounded pull; resume with nextCursor. Invalid records excluded; inspect quarantine markers. No remote mutations.'};
}
async function records(dir){const out=[];for(const name of (await fs.readdir(dir)).sort()){if(/^[a-f0-9]{64}\.json$/.test(name))out.push(JSON.parse(await fs.readFile(path.join(dir,name),'utf8')));}return out;}
async function main(){
 const [cmd,...args]=process.argv.slice(2);const local=path.resolve(process.env.REVIEW_DATA_DIR||path.join(ROOT,'private'));await fs.mkdir(local,{recursive:true,mode:0o700});
 if(cmd==='snapshot'){
  const repo=path.join(ROOT,'canonical-source');
  try{await fs.access(repo);}catch{execFileSync('git',['clone','--depth','1','https://github.com/vortexopenclaw/dashcam-camera-profiles.git',repo],{stdio:'pipe'});}
  execFileSync('git',['-C',repo,'fetch','--depth','1','origin','HEAD'],{stdio:'pipe'});
  const git=(...a)=>execFileSync('git',['-C',repo,...a],{encoding:'utf8'}).trim();const commit=git('rev-parse','FETCH_HEAD');
  const names=git('ls-tree','-r','--name-only',commit,'profiles').split('\n').filter(x=>x.endsWith('.json'));
  const snapshot={source:'https://github.com/vortexopenclaw/dashcam-camera-profiles',commit,fetchedAt:new Date().toISOString(),profiles:names.map(n=>JSON.parse(git('show',`${commit}:${n}`)))};
  await fs.writeFile(path.join(local,'snapshot.json'),JSON.stringify(snapshot,null,2),{mode:0o600});console.log(JSON.stringify({commit,profiles:snapshot.profiles.length}));return;
 }
 if(cmd==='pull'){console.log(JSON.stringify(await pull(path.join(local,'pending'),+(args[0]||5),args[1]||'')));return;}
 if(!['review','decide','proposal'].includes(cmd)||!HASH.test(args[0]||''))throw Error('Usage: node review.js snapshot | pull [pages] | review ID | decide ID accept|reject|needs-info|duplicate | proposal ID');
 const all=await records(path.join(local,'pending')),record=all.find(x=>x.id===args[0]);if(!record)throw Error('Unknown local record');
 const snapshot=JSON.parse(await fs.readFile(path.join(local,'snapshot.json'),'utf8'));const result=await review(record,snapshot.profiles,all);
 const decisionFile=path.join(local,'decisions.jsonl');let history=[];try{history=(await fs.readFile(decisionFile,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(cmd==='decide'){if(!['accept','reject','needs-info','duplicate'].includes(args[1]))throw Error('Invalid decision');await fs.appendFile(decisionFile,JSON.stringify({id:record.id,decision:args[1],at:new Date().toISOString(),snapshotCommit:snapshot.commit,evidenceHash:result.numericEvidenceHash})+'\n',{mode:0o600});console.log('Local decision appended; pending record unchanged.');}
 else if(cmd==='proposal'){
  const latest=history.filter(x=>x.id===record.id).at(-1);
  if(latest?.decision!=='accept')throw Error('Local accept decision required');
  if(typeof snapshot.commit!=='string'||!snapshot.commit||latest.snapshotCommit!==snapshot.commit)throw Error('Current snapshot accept decision required; re-review and accept again');
  console.log(JSON.stringify({type:'anonymous-review-proposal',notPublished:true,sourceReportHash:record.id,snapshotCommit:snapshot.commit,ownerAssertions:result.ownerAssertions,scannerReportedMeasurements:result.scannerReportedMeasurements,scannerReportedStructure:result.scannerReportedStructure,structureEvidenceHash:result.structureEvidenceHash,coverage:result.coverage,canonicalFolderComparison:result.canonicalFolderComparison,canonicalChannelComparison:result.canonicalChannelComparison,numericEvidenceHash:result.numericEvidenceHash,caveat:'Unverified anonymous owner assertions and scanner measurements; manual review and explicit public publication approval required.'},null,2));
 }else console.log(JSON.stringify({...result,snapshotCommit:snapshot.commit,decisionHistory:history.filter(x=>x.id===record.id)},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Review failed. Check command, credentials, network, record integrity, and local snapshot. No secret or remote response details logged.');process.exitCode=1;});
