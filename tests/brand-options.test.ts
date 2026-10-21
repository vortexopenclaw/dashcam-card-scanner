// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {brandOptions,settingCategory} from '../src/brand-options';

test('VIOFO Auto Event Detection is not mislabeled motion-only',()=>{
 expect(brandOptions('Viofo').parking).toContainEqual({value:'buffered',label:'Auto Event Detection'});
 expect(brandOptions('Viofo').parking.map(o=>o.label)).toEqual(['Unknown','Off','Auto Event Detection','Time-Lapse','Low Bitrate','Other']);
});
test('Vantrue N4 Pro S manual terminology preserves all four parking modes',()=>{
 expect(brandOptions('Vantrue').parking).toEqual([
  {value:'unknown',label:'Unknown'},{value:'off',label:'Off'},
  {value:'motion',label:'Motion Detection'},{value:'impact',label:'Collision Detection'},
  {value:'low-bitrate',label:'Low-Bitrate Recording'},{value:'time-lapse',label:'Low Frame Rate Recording'},
  {value:'other',label:'Other'},
 ]);
 // Picture enhancement modes are not fabricated bitrate tiers.
 expect(brandOptions('Vantrue').quality).toContainEqual({value:'vantrue-standard',label:'Standard',category:'other'});
 expect(brandOptions('Vantrue').quality).toContainEqual({value:'vantrue-platepix',label:'PlatePix',category:'other'});
});
test('Thinkware offers model-dependent radar and energy-saving terminology',()=>{
 const {parking}=brandOptions('Thinkware');
 for(const entry of [
  {value:'motion',label:'Motion Detection'},{value:'time-lapse',label:'TimeLapse'},
  {value:'low-power-impact',label:'Energy Saving Mode'},{value:'radar',label:'RADAR Parking Mode'},
 ])expect(parking).toContainEqual(entry);
});
test('BlackVue Extreme is a distinct category from Highest/maximum',()=>{
 expect(brandOptions('BlackVue').quality).toEqual([
  {value:'unknown',label:'Unknown'},{value:'normal',label:'Normal'},
  {value:'high',label:'High'},{value:'maximum',label:'Highest'},
  {value:'extreme',label:'Highest (Extreme)'},{value:'other',label:'Other'},
 ]);
 expect(brandOptions('BlackVue').parking).toContainEqual({value:'buffered',label:'Motion & Impact Detection'});
});
test('exact aliases ignore case/outer whitespace without guessing arbitrary brands',()=>{
 for(const [alias,brand] of [[' VIOFO ','Viofo'],['VANTRUE','Vantrue'],['thinkWARE','Thinkware'],['BLACKVUE','BlackVue'],['Blackview','BlackVue']]){
  expect(brandOptions(alias)).toEqual(brandOptions(brand));
 }
 for(const brand of ['', 'Unknown', 'Other', 'New manufacturer', 'Viofo clone', '__proto__', 'constructor']){
  expect(brandOptions(brand)).toEqual(brandOptions('Unlisted'));
 }
});
test('every list has capitalized labels, unique allowed values and editable escape hatches',()=>{
 const quality=new Set(['low','normal','medium','high','maximum','unknown','extreme','other']);
 const parking=new Set(['off','buffered','time-lapse','low-bitrate','motion','impact','low-power-impact','unknown','radar','other']);
 for(const brand of ['Viofo','Vantrue','Thinkware','BlackVue','Blackview','Unlisted']){
  const options=brandOptions(brand);
  for(const key of ['quality','parking'] as const){
   const list=options[key];
   expect(list[0]).toEqual({value:'unknown',label:'Unknown'});
   expect(list.at(-1)).toEqual({value:'other',label:'Other'});
   expect(new Set(list.map(o=>o.value)).size).toBe(list.length);
   for(const item of list){
    expect((key==='quality'?quality:parking).has(settingCategory(item))).toBe(true);
    expect(item.label).toMatch(/^[A-Z]/);
   }
  }
 }
});
test('returned suggestions can be edited without leaking into other cohorts or brands',()=>{
 for(const brand of ['Viofo','Vantrue','Thinkware','BlackVue','Unlisted']){
  const baseline=brandOptions(brand),edited=brandOptions(brand);
  edited.quality[0].label='Edited';edited.parking[0].value='other';
  edited.quality.push({value:'other',label:'Custom'});edited.parking.splice(1,1);
  expect(brandOptions(brand)).toEqual(baseline);
 }
});
