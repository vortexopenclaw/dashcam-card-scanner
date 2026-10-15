// SPDX-License-Identifier: AGPL-3.0-or-later
export const MAX_BODY = 16384;
export const HASH = /^[a-f0-9]{64}$/;
export function exact(o, required, optional=[]) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || required.some(k=>!Object.hasOwn(o,k)) || Object.keys(o).some(k=>![...required,...optional].includes(k))) throw Error('invalid_schema');
}
function label(s,n) { if(typeof s!=='string'||s.length>n||! /^[A-Za-z0-9]/.test(s)||/[^A-Za-z0-9 ._-]/.test(s)) throw Error('invalid_label'); }
function number(n,max,integer=false) { if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>max||(integer&&!Number.isInteger(n))) throw Error('invalid_number'); }
function choice(s,values) { if(!values.includes(s)) throw Error('invalid_enum'); }
const CHANNELS=['front','rear','interior','telephoto','left','right','unknown'];
const MODES=['normal','protected','parking','unknown'];
const FOLDERS=new Set('DCIM Movie Movies RO Parking Photo Photos Video Videos Normal Event Events Emergency Record Recording Front Rear Interior Telephoto Left Right Lock Locked Snapshot Snapshots Continuous Driving BlackVue INNOVV Garmin Thinkware VIOFO'.toLowerCase().split(' '));
const EXTENSIONS={video:['mp4','mov','m4v','avi','ts','mkv'],image:['jpg','jpeg','png'],other:['dat','bin','txt','log','nmea','srt','unknown']};
const STEMS=['YYYY_MMDD_HHMMSS_SEQUENCE','YYYYMMDD_HHMMSS_SEQUENCE','YYYYMMDD_HHMMSS','YYYY_MMDD_HHMMSS','SEQUENCE'];
const SHAPES=[/^(\d{4})_(\d{4})_(\d{6})_(\d+)$/, /^(\d{8})_(\d{6})_(\d+)$/, /^(\d{8})_(\d{6})$/, /^(\d{4})_(\d{4})_(\d{6})$/, /^(\d+)$/];
const SUFFIXES=['','F','R','I','T','PF','PR','PI','PT','_F','_R','_I','_T','_PF','_PR','_PI','_PT'];
const knownExtension=s=>typeof s==='string'&&Object.values(EXTENSIONS).flat().includes(s.toLowerCase());
export const safeFolderComponent=s=>typeof s==='string'&&!/[^A-Za-z0-9-]/.test(s)&&(FOLDERS.has(s.toLowerCase())||/^folder-(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-6])$/.test(s));
export function sanitizeFolderComponents(components,aliases=new Map()) {
  if(!Array.isArray(components)||components.length>8)throw Error('invalid_components');
  return components.map(s=>{if(typeof s!=='string'||!s||/[\/\\\x00-\x1f]/.test(s)||s==='.'||s==='..')throw Error('invalid_component');if(FOLDERS.has(s.toLowerCase()))return s;if(!aliases.has(s)){if(aliases.size>=256)throw Error('alias_capacity');aliases.set(s,'folder-'+(aliases.size+1));}return aliases.get(s);});
}
export function generalizeFilename(name) {
  if(typeof name!=='string'||name.length>256)return 'unknown';
  const m=/^([0-9_]+?)(_?(?:PF|PR|PI|PT|F|R|I|T))?\.([A-Za-z0-9]+)$/.exec(name);
  if(!m||!knownExtension(m[3])||m[3].toLowerCase()==='unknown')return 'unknown';
  const i=SHAPES.findIndex(r=>r.test(m[1]));return i<0?'unknown':STEMS[i]+(m[2]||'')+'.'+m[3];
}
function template(s){if(s==='unknown')return;const dot=typeof s==='string'?s.lastIndexOf('.'):-1;if(dot<0||!knownExtension(s.slice(dot+1))||s.slice(dot+1).toLowerCase()==='unknown'||!STEMS.some(stem=>SUFFIXES.some(suffix=>s.slice(0,dot)===stem+suffix)))throw Error('invalid_template');}
function count(n){if(!Number.isInteger(n)||n<0||n>10000000)throw Error('invalid_count');}
function array(a,min,max){if(!Array.isArray(a)||a.length<min||a.length>max)throw Error('invalid_array');}
function unique(a){if(new Set(a.map(x=>JSON.stringify(x))).size!==a.length)throw Error('duplicate_entry');}
function role(e){choice(e.channel,CHANNELS);choice(e.mode,MODES);}
function folderIndex(i,s){if(!s||!Number.isInteger(i)||i<0||i>=s.folders.length)throw Error('invalid_folder_index');}
function structure(s){
  exact(s,['completed','fileCount','mediaCount','folders','observedLayouts']);if(s.completed!==true)throw Error('incomplete_scan');count(s.fileCount);count(s.mediaCount);if(!s.mediaCount||s.mediaCount>s.fileCount)throw Error('invalid_totals');array(s.folders,1,32);unique(s.folders.map(f=>f.components));
  for(const f of s.folders){
    exact(f,['components','fileCount','mediaCount','extensions','filenameTemplates']);array(f.components,0,8);if(!f.components.every(safeFolderComponent))throw Error('invalid_component');count(f.fileCount);count(f.mediaCount);array(f.extensions,0,16);array(f.filenameTemplates,0,16);unique(f.filenameTemplates);f.filenameTemplates.forEach(template);unique(f.extensions.map(e=>e.extension));
    for(const e of f.extensions){exact(e,['extension','mediaType','count']);choice(e.mediaType,Object.keys(EXTENSIONS));if(typeof e.extension!=='string'||!EXTENSIONS[e.mediaType].includes(e.extension.toLowerCase()))throw Error('invalid_extension');number(e.count,10000000,true);}
    if(f.extensions.reduce((n,e)=>n+e.count,0)!==f.fileCount||f.extensions.filter(e=>e.mediaType!=='other').reduce((n,e)=>n+e.count,0)!==f.mediaCount)throw Error('invalid_totals');
  }
  for(const k of ['fileCount','mediaCount'])if(s.folders.reduce((n,f)=>n+f[k],0)!==s[k])throw Error('invalid_totals');
  array(s.observedLayouts,0,64);unique(s.observedLayouts.map(e=>[e.folderIndex,e.channel,e.mode]));for(const e of s.observedLayouts){exact(e,['folderIndex','channel','mode']);folderIndex(e.folderIndex,s);role(e);}
}
function settings(o,identity=false) {
  exact(o,identity?['manufacturer','model','channelCount']:['channelCount'],['firmware','quality','qualityLabel','parkingMode','parkingModeLabel','timeLapseFps']);
  if(identity){label(o.manufacturer,64);label(o.model,64);}number(o.channelCount,8,true);
  if(o.firmware!==undefined)label(o.firmware,32);
  if(o.quality!==undefined)choice(o.quality,['low','normal','medium','high','maximum','extreme','other','unknown']);
  if(o.parkingMode!==undefined)choice(o.parkingMode,['off','buffered','time-lapse','low-bitrate','motion','impact','low-power-impact','radar','other','unknown']);
  for(const [mode,key] of [['quality','qualityLabel'],['parkingMode','parkingModeLabel']]){
    const s=o[key];
    if(s!==undefined&&(typeof s!=='string'||s.length>80||s.trim()!==s||! /^[A-Za-z0-9][A-Za-z0-9 ()_+&/\-]*$/.test(s)))throw Error('invalid_setting_label');
    if(o[mode]==='other'&&s===undefined)throw Error('missing_setting_label');
  }
  if(o.timeLapseFps!==undefined)number(o.timeLapseFps,240);
}
export function validate(p) {
  exact(p,['schemaVersion','owner','evidence'],['structure','contributor','cohorts']);if(p.schemaVersion!==1)throw Error('invalid_version');
  settings(p.owner,true);
  if(p.contributor!==undefined){
    exact(p.contributor,['dashcamTalkUsername']);
    if(typeof p.contributor.dashcamTalkUsername!=='string'||! /^[A-Za-z0-9](?:[A-Za-z0-9 ._-]{0,38}[A-Za-z0-9])?$/.test(p.contributor.dashcamTalkUsername))throw Error('invalid_contributor');
  }
  if(p.structure!==undefined)structure(p.structure);
  array(p.evidence,0,24);if(!p.evidence.length&&!p.structure)throw Error('missing_evidence');
  for(const e of p.evidence){
    exact(e,['channel','mode','width','height','fps','bitrateKbps','containerBitrateKbps','sizeBytes','durationSeconds','codec'],['folderIndex']);role(e);choice(e.codec,['h264','hevc','av1','mjpeg','mpeg4','unknown']);
    for(const [k,max,int] of [['width',16384,true],['height',16384,true],['fps',240,false],['bitrateKbps',1000000,false],['containerBitrateKbps',1000000,false],['sizeBytes',1000000000000,true],['durationSeconds',86400,false]])if(e[k]!==null)number(e[k],max,int);
    if(e.folderIndex!==undefined)folderIndex(e.folderIndex,p.structure);
  }
  if(p.cohorts!==undefined){
    array(p.cohorts,1,16);unique(p.cohorts.map(c=>c.id));const used=new Set(),folders=new Set();
    for(const c of p.cohorts){
      exact(c,['id','evidenceIndices','owner'],['folderIndices']);
      if(typeof c.id!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(c.id))throw Error('invalid_cohort_id');
      settings(c.owner);array(c.evidenceIndices,0,24);unique(c.evidenceIndices);
      for(const i of c.evidenceIndices){if(!Number.isInteger(i)||i<0||i>=p.evidence.length||used.has(i))throw Error('invalid_evidence_partition');used.add(i);}
      if(c.folderIndices!==undefined){array(c.folderIndices,0,32);unique(c.folderIndices);for(const i of c.folderIndices){folderIndex(i,p.structure);folders.add(i);}}
      if(!c.evidenceIndices.length&&!c.folderIndices?.length)throw Error('empty_cohort');
    }
    if(used.size!==p.evidence.length)throw Error('invalid_evidence_partition');
    if(!p.evidence.length&&folders.size!==p.structure.folders.length)throw Error('incomplete_folder_coverage');
  }
  return p;
}
export async function sha256(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value==='string'?new TextEncoder().encode(value):value)), b=>b.toString(16).padStart(2,'0')).join(''); }
export async function readBytes(request,max=MAX_BODY) {
  if(Number(request.headers.get('content-length'))>max) throw Error('payload_too_large');
  if(!request.body) throw Error('missing_body');
  const reader=request.body.getReader(), chunks=[]; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>max) {await reader.cancel(); throw Error('payload_too_large');} chunks.push(value); }
  const out=new Uint8Array(size); let offset=0; for(const c of chunks){out.set(c,offset);offset+=c.length;} return out;
}
export function parse(bytes) {
  // TextDecoder otherwise strips a leading BOM, breaking exact-byte provenance.
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)throw Error('utf8_bom_not_allowed');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes), value=JSON.parse(text);
  // JSON.parse silently keeps the last duplicate key. Reject duplicates so the
  // retained exact bytes cannot hide overwritten forbidden/private fields.
  const stack=[]; const tokens=/"(?:[^"\\]|\\.)*"|[{}\[\]]/g; let m;
  while((m=tokens.exec(text))!==null){
    const token=m[0];
    if(token==='{')stack.push(new Set());else if(token==='[')stack.push(null);
    else if(token==='}'||token===']')stack.pop();
    else if(/^\s*:/.test(text.slice(tokens.lastIndex))){const key=JSON.parse(token),keys=stack.at(-1);if(keys?.has(key))throw Error('duplicate_json_key');keys?.add(key);}
  }
  return value;
}
