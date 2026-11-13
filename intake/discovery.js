// SPDX-License-Identifier: AGPL-3.0-only
// Private generic declarations. This vocabulary and grammar mirror native discovery.
// Self-contained so identical bytes load in both receiving modules.
function exact(value,required,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))throw Error('invalid_discovery_keys');
}
const groups={manufacturer:'manufacturer make vendor brand',model:'model model_name camera_model device_model product_model dev_model rear_model inside_model front_model rc_model',firmware:'firmware firmware_version fw_version fw soft_version software_version rear_version inside_version micom_version',build:'build build_version version hardware_version',setting:'resolution width height fps frame_rate bitrate quality hdr parking_mode time_lapse codec'};
export const discoveryReasons=['file_limit','byte_limit','oversize','unsupported_format','invalid_encoding','malformed','unsafe_value','read_error','changed_source','observation_limit'];
export function safeDiscoveryValue(value,key){const field=Object.keys(groups).find(f=>groups[f].split(' ').includes(key));return Boolean(field&&validTechnical(field,key,value));}
export function validTechnical(field,key,s){
 if(typeof s!=='string'||!s.length||s.length>80||s.trim()!==s||/[^\x20-\x7e]/.test(s)||!groups[field]?.split(' ').includes(key))return false;
 const lower=s.toLowerCase();
 if(/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)[0-9.]+$/.test(s))return false;
 if(['password','passwd','secret','token','@','http','www.','wifi','ssid','gps','serial','latitude','longitude','address','credential','canary','email'].some(x=>lower.includes(x)))return false;
 if(['model','manufacturer'].includes(field)&&/(?:[0-9]{7,}|[A-Fa-f0-9]{12,})/.test(s))return false;
 if(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/.test(s)&&!['firmware','build'].includes(field))return false;
 if(field==='manufacturer')return /^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(s);
 if(field==='model')return /^[A-Za-z0-9][A-Za-z0-9._()+-]{0,31}(?: [A-Za-z0-9][A-Za-z0-9._()+-]{0,23}){0,3}$/.test(s)&&s.split(' ').some(t=>/[A-Za-z]/.test(t)&&/[0-9]/.test(t));
 if(['firmware','build'].includes(field))return /^[vV]?[0-9]{1,4}(?:\.[0-9]{1,6}){1,5}(?:[_+-][A-Za-z0-9.-]{1,32})?$/.test(s);
 if(key==='resolution')return /^[1-9][0-9]{1,4}[xX][1-9][0-9]{1,4}$/.test(s);
 const numeric=(max,integer=false)=>/^\+?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(s)&&Number(s)>0&&Number(s)<=max&&(!integer||Number.isInteger(Number(s)));
 if(['width','height'].includes(key))return /^\+?[0-9]+$/.test(s)&&numeric(16384,true);
 if(['fps','frame_rate','time_lapse'].includes(key))return numeric(240);
 if(key==='bitrate')return /^\+?[0-9]+$/.test(s)&&numeric(1000000000,true);
 return ({quality:['low','normal','medium','high','maximum','extreme'],hdr:['on','off','auto','0','1'],parking_mode:['on','off','buffered','time-lapse','low-bitrate','motion','impact','radar'],codec:['h264','h265','hevc','av1','mjpeg','mpeg4']}[key]||[]).includes(lower);
}
const count=(n,max=10000000)=>{if(!Number.isSafeInteger(n)||n<0||n>max)throw Error('invalid_discovery_count');};
// Validate before projection: no raw/support-path extensions survive this boundary.
export function validDiscovery(value){if(value===undefined)return true;try{validateDiscovery(value);return true;}catch{return false;}}
export function projectDiscovery(value){if(value===undefined)return undefined;validateDiscovery(value);return JSON.parse(JSON.stringify(value));}
export function validateDiscovery(d){
 exact(d,['version','sources','observations','coverage']);if(d.version!==1)throw Error('invalid_discovery_version');
 for(const a of [d.sources,d.observations])if(!Array.isArray(a)||a.length>128)throw Error('invalid_discovery_array');
 const ids=new Set();for(const s of d.sources){exact(s,['id','format','encoding','sizeBytes']);if(!/^support-[1-9][0-9]{0,7}$/.test(s.id)||ids.has(s.id))throw Error('invalid_discovery_source');ids.add(s.id);if(!['json','ini','key_value','xml','framed_json','binary','tar','jpeg','isobmff','unknown'].includes(s.format)||!['utf8','utf16le','utf16be','binary','unknown'].includes(s.encoding))throw Error('invalid_discovery_format');count(s.sizeBytes,65536);}
 for(const o of d.observations){exact(o,['sourceId','field','key','value','line','record','scope']);if(!ids.has(o.sourceId)||o.scope!=='unbound'||!validTechnical(o.field,o.key,o.value))throw Error('invalid_discovery_observation');count(o.line);if(!o.line&&d.sources.find(s=>s.id===o.sourceId)?.format!=='json')throw Error('invalid_discovery_line');count(o.record);}
 const c=d.coverage;exact(c,['inventoriedCandidates','inspectedFiles','uninspectedFiles','retainedObservations','omittedObservations','bytesRead','limited','multipleModelValues','reasons']);
 for(const k of ['inventoriedCandidates','inspectedFiles','uninspectedFiles','retainedObservations','omittedObservations','bytesRead'])count(c[k]);count(c.inspectedFiles,256);count(c.bytesRead,4194304);
 exact(c.reasons,[],discoveryReasons);Object.values(c.reasons).forEach(n=>count(n));
 if(typeof c.limited!=='boolean'||typeof c.multipleModelValues!=='boolean'||c.inspectedFiles+c.uninspectedFiles!==c.inventoriedCandidates||c.retainedObservations!==d.observations.length||d.sources.length>c.inspectedFiles||d.sources.some(s=>Number(s.id.slice(8))>c.inventoriedCandidates)||((c.omittedObservations||c.uninspectedFiles||Object.values(c.reasons).some(n=>n>0))&&!c.limited)||new Set(d.observations.filter(o=>o.field==='model').map(o=>o.value)).size>1&&!c.multipleModelValues)throw Error('invalid_discovery_coverage');
}
