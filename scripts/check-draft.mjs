// SPDX-License-Identifier: AGPL-3.0-only
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const repo=process.env.GITHUB_REPOSITORY,id=process.env.RELEASE_ID;
assert.match(repo??'',/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);assert.match(id??'',/^\d+$/);
const release=JSON.parse(execFileSync('gh',['api',`repos/${repo}/releases/${id}`],{encoding:'utf8'}));
assert.equal(release.draft,true,'Never auto-publish');
const asset=release.assets.find(a=>a.name==='latest.json');assert(asset,'latest.json missing');
const manifest=JSON.parse(execFileSync('gh',['api',`repos/${repo}/releases/assets/${asset.id}`,'-H','Accept: application/octet-stream'],{encoding:'utf8'}));
assert.equal(manifest.version,JSON.parse(readFileSync('package.json','utf8')).version);
for(const platform of ['darwin-aarch64','darwin-x86_64','windows-x86_64','linux-x86_64']){
 const value=manifest.platforms[platform];assert(value,`Missing ${platform}`);assert.equal(typeof value.signature,'string');assert(value.signature.length>40,'Missing updater signature');
 const url=new URL(value.url);assert.equal(url.protocol,'https:');assert.equal(url.host,'github.com');assert(url.pathname.startsWith(`/${repo}/releases/download/`));
 const name=decodeURIComponent(url.pathname.split('/').pop());assert(release.assets.some(a=>a.name===name),`Missing updater artifact ${name}`);
}
console.log('Draft latest.json read back; all four platform URLs, updater artifacts and signatures present. Maintainer must verify signatures/install behavior before manual publication.');
