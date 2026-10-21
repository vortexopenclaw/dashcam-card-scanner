// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function assetNames(version){
 assert.match(version,/^\d+\.\d+\.\d+$/);
 const prefix=`Dashcam-Card-Scanner-${version}`;
 const names={
  [`Dashcam.Card.Scanner_${version}_aarch64.dmg`]:`${prefix}-Mac-Apple-Silicon.dmg`,
  [`Dashcam.Card.Scanner_${version}_x64.dmg`]:`${prefix}-Mac-Intel.dmg`,
  'Dashcam.Card.Scanner_aarch64.app.tar.gz':`${prefix}-Mac-Apple-Silicon-Update.app.tar.gz`,
  'Dashcam.Card.Scanner_x64.app.tar.gz':`${prefix}-Mac-Intel-Update.app.tar.gz`,
  [`Dashcam.Card.Scanner_${version}_x64-setup.exe`]:`${prefix}-Windows-x64.exe`,
  [`Dashcam.Card.Scanner_${version}_amd64.AppImage`]:`${prefix}-Linux-x64.AppImage`,
  [`Dashcam.Card.Scanner_${version}_amd64.deb`]:`${prefix}-Linux-Debian-Ubuntu-x64.deb`,
 };
 for(const [old,name] of Object.entries({...names}))if(!old.endsWith('.dmg'))names[old+'.sig']=name+'.sig';
 names['latest.json']='latest.json';return names;
}
export function label(name){
 if(name.endsWith('.sig')||name.endsWith('.tar.gz')||name==='latest.json')return `Automatic update support — ${name}`;
 if(name.endsWith('Mac-Apple-Silicon.dmg'))return 'Mac — Apple Silicon';
 if(name.endsWith('Mac-Intel.dmg'))return 'Mac — Intel';
 if(name.endsWith('.exe'))return 'Windows — installer';
 if(name.endsWith('.AppImage'))return 'Linux — AppImage';
 if(name.endsWith('.deb'))return 'Linux — Debian / Ubuntu package';
 throw Error('Unexpected asset');
}
export function rewriteManifest(manifest,repo,tag,names){
 assert.equal(manifest.version,tag.slice(1));
 const rewritten=structuredClone(manifest);
 for(const entry of Object.values(rewritten.platforms)){
  const url=new URL(entry.url);assert.equal(url.origin,'https://github.com');
  const prefix=`/${repo}/releases/download/${tag}/`;assert(url.pathname.startsWith(prefix));
  const old=decodeURIComponent(url.pathname.slice(prefix.length));
  const name=names[old]??(Object.values(names).includes(old)?old:null);assert(name,'Unknown update artifact');
  entry.url='https://github.com'+prefix+encodeURIComponent(name);
 }
 return rewritten;
}
function main(){
 const repo=process.env.GITHUB_REPOSITORY,id=process.env.RELEASE_ID;
 assert.match(repo??'',/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);assert.match(id??'',/^\d+$/);
 const api=(path,payload)=>JSON.parse(execFileSync('gh',['api',`repos/${repo}/${path}`,...(payload?['-X','PATCH','--input','-']:[])],{encoding:'utf8',...(payload?{input:JSON.stringify(payload)}:{})}));
 const release=api(`releases/${id}`);assert.equal(release.draft,true,'Never rename published assets');
 const version=JSON.parse(readFileSync('package.json','utf8')).version;assert.equal(release.tag_name,'v'+version);
 const names=assetNames(version),expected=new Set(Object.values(names));
 assert.equal(release.assets.length,expected.size);
 for(const asset of release.assets)assert(names[asset.name]||expected.has(asset.name),'Unknown release asset');
 const current=release.assets.find(a=>a.name==='latest.json');assert(current);
 const manifest=JSON.parse(execFileSync('gh',['api',`repos/${repo}/releases/assets/${current.id}`,'-H','Accept: application/octet-stream'],{encoding:'utf8'}));
 const rewritten=rewriteManifest(manifest,repo,release.tag_name,names);
 for(const asset of release.assets){const name=names[asset.name]??asset.name;api(`releases/assets/${asset.id}`,{name,label:label(name)});}
 const dir=mkdtempSync(join(tmpdir(),'scanner-release-names-'));
 try{const path=join(dir,'latest.json');writeFileSync(path,JSON.stringify(rewritten,null,2)+'\n');execFileSync('gh',['release','upload',release.tag_name,path,'--clobber','-R',repo],{stdio:'pipe'});}finally{rmSync(dir,{recursive:true,force:true});}
 const after=api(`releases/${id}`);assert.equal(after.draft,true);assert.deepEqual(new Set(after.assets.map(a=>a.name)),expected);
 const latest=after.assets.find(a=>a.name==='latest.json');
 const readback=JSON.parse(execFileSync('gh',['api',`repos/${repo}/releases/assets/${latest.id}`,'-H','Accept: application/octet-stream'],{encoding:'utf8'}));assert.deepEqual(readback,rewritten);
 console.log('Draft download names, platform labels and immutable updater URLs verified.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
