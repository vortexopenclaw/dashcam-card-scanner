// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect,afterAll} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync,chmodSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validate,generalizeFilename} from '../intake/schema.js';
const scratch=mkdtempSync(join(realpathSync(tmpdir()),'scanner-regression-'));
afterAll(()=>rmSync(scratch,{recursive:true,force:true}));
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const box=(kind,...parts)=>{const p=Buffer.concat(parts);return Buffer.concat([u32(p.length+8),Buffer.from(kind),p]);};
function fixture(){
 const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(200,16);
 const hdlr=Buffer.alloc(24);hdlr.write('vide',8);
 const entry=Buffer.alloc(78);entry.writeUInt16BE(640,24);entry.writeUInt16BE(360,26);
 const stsd=box('stsd',Buffer.alloc(4),u32(1),box('avc1',entry));
 const stsz=box('stsz',Buffer.alloc(4),u32(1000),u32(6));
 return Buffer.concat([box('ftyp',Buffer.from('isom'),u32(0),Buffer.from('isom')),box('moov',box('trak',box('mdia',box('mdhd',mdhd),box('hdlr',hdlr),box('minf',box('stbl',stsd,stsz))))),box('mdat',Buffer.alloc(6000))]);
}
const scan=card=>JSON.parse(execFileSync('cargo',['run','--quiet','--locked','--manifest-path','src-tauri/Cargo.toml','--example','scan_fixture','--',card],{encoding:'utf8',timeout:240000}));
test('mvex and moof before or after moov never expose initial-segment measurements',()=>{
 const original=fixture(),start=original.indexOf('moov')-4,size=original.readUInt32BE(start);
 const changed=box('moov',original.subarray(start+8,start+size),box('mvex'));
 for(const [kind,bytes] of [
  ['mvex',Buffer.concat([original.subarray(0,start),changed,original.subarray(start+size)])],
  ['moof-after',Buffer.concat([original,box('moof')])],
  ['moof-before',Buffer.concat([box('moof'),original])],
 ]){
  const card=join(scratch,kind);mkdirSync(card);writeFileSync(join(card,'000001F.mp4'),bytes);
  const result=scan(card);expect(result.report.probeFailures).toBe(1);expect(result.report.folders.flatMap(f=>f.videos)).toEqual([]);
  const body=JSON.parse(result.review.submissionJson);expect(validate(body)).toBe(body);
  expect(body.evidence[0]).toMatchObject({sizeBytes:bytes.length,durationSeconds:null,bitrateKbps:null,containerBitrateKbps:null,fps:null,width:null,height:null,codec:'unknown'});
 }
},240000);
test('M4V scanner, filename template and gateway schema round trip preserve video evidence and case',()=>{
 for(const ext of ['m4v','M4V']){
  const card=join(scratch,ext==='m4v'?'lowercase':'uppercase');mkdirSync(card);const name='20261015_131010_F.'+ext;writeFileSync(join(card,name),fixture());
  const result=scan(card),body=JSON.parse(result.review.submissionJson);expect(validate(body)).toBe(body);
  expect(result.report.probeAttempts).toBe(1);expect(result.report.probeFailures).toBe(0);
  expect(body.structure).toMatchObject({completed:true,fileCount:1,mediaCount:1});
  expect(body.structure.folders[0].extensions).toEqual([{extension:ext,mediaType:'video',count:1}]);
  expect(body.structure.folders[0].filenameTemplates).toEqual([generalizeFilename(name)]);expect(generalizeFilename(name)).toBe('YYYYMMDD_HHMMSS_F.'+ext);
  expect(body.evidence[0]).toMatchObject({durationSeconds:0.2,bitrateKbps:240,codec:'h264'});
 }
},240000);
test.skipIf(process.platform==='win32'||process.getuid?.()===0)('real unreadable subtree marks partial and blocks completed intake while preserving local export',()=>{
 const card=join(scratch,'unreadable');mkdirSync(card);writeFileSync(join(card,'000001F.mp4'),fixture());
 const hidden=join(card,'Private');mkdirSync(hidden);writeFileSync(join(hidden,'000002F.mp4'),fixture());chmodSync(hidden,0);
 try{
  expect(()=>readdirSync(hidden)).toThrow();
  const result=scan(card);expect(result.report.limited).toBe(true);expect(result.report.skipped).toBeGreaterThan(0);expect(result.report.scannedFiles).toBe(1);
  expect(result.review.submissionJson).toBe('');expect(result.review.warning).toContain('complete structural scan');expect(JSON.parse(result.review.publicJson).notes).toContain('bounded/partial: true');
 }finally{chmodSync(hidden,0o700);}
},240000);
