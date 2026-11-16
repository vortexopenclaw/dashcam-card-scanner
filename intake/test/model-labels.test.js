// SPDX-License-Identifier: AGPL-3.0-or-later
// Lightweight synthetic schema regressions; no Cargo or external I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validate} from '../schema.js';
const report=()=>({schemaVersion:1,owner:{manufacturer:'DDPAI',model:'Z100 Master (Main Unit)',channelCount:3},evidence:[],structure:{completed:true,fileCount:1,mediaCount:1,folders:[{components:['DCIM','200video','Front'],fileCount:1,mediaCount:1,extensions:[{extension:'mp4',mediaType:'video',count:1}],filenameTemplates:['unknown']}],observedLayouts:[]}});
test('parenthesized native model strings survive intake unchanged',()=>{
 for(const model of ['Z100 Master (Main Unit)','MINI3X (V3)','N3 Pro (V2)','DR970X-2CH LTE (GL)']){
  const p=report();p.owner.model=model;assert.equal(validate(p),p);assert.equal(p.owner.model,model);
 }
});
test('model punctuation admission does not widen firmware, manufacturer or path syntax',()=>{
 for(const [key,value] of [['manufacturer','DDPAI (test)'],['firmware','1.0 (test)'],['model','Z100/../../private'],['model','Z100\\private'],['model','Z100\n(private)'],['model','Z100 <script>'],['model','X'.repeat(65)]]){
  const p=report();p.owner[key]=value;assert.throws(()=>validate(p),/invalid_label/);
 }
});
