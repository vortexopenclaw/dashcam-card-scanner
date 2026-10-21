// SPDX-License-Identifier: AGPL-3.0-only
/** UI-only owner identity choices. These are NOT native recognition profiles.
 * Official product/support pages checked 2026-10-21. A listing is not proof of
 * availability in every region, recognition, installed channels or settings.
 * Only fixed single-camera models get a count suggestion; kits/expandable units
 * deliberately have no count here (even when their product name includes CH).
 */
export type ModelOption={id:string;manufacturer:string;model:string;source?:string;fixedSingleChannel?:boolean;provenance?:'official-catalog'|'owner-provided-prerelease'|'native-catalog'};
const models=(manufacturer:string,source:string,names:string[],single:string[]=[]):ModelOption[]=>names.map(model=>({id:`ui:${manufacturer}:${model}`,manufacturer,model,source,fixedSingleChannel:single.includes(model),provenance:'official-catalog'}));
export const modelOptions:ModelOption[]=[
 ...models('Viofo','https://www.viofo.com/pages/support-product',[
  'A119M Pro','A119 MINI 2','A119 V3','VS1','A229 Pro 1CH','A229 Plus 1CH','A329S 1CH',
  'A149 Pro Duo','T330 2CH','T330 3CH','T330W 2CH','T330W 3CH','T340 3CH','T340 4CH','T340W 3CH','T340WW 4CH','T340TW 4CH',
  'A329S 2CH','A329S 2CH IR','A329S 3CH','A329SW 2CH','A329SW 3CH','A329T 2CH','A329T 3CH','A329TC 3CH','A329TW 3CH','A329WW 3CH',
  'A229 Ultra-W 2CH','A229 Pro Tele 2CH','A229 Pro Tele 3CH','T330T 3CH','T330WW 3CH','T330TW 3CH',
 ],['A119M Pro','A119 MINI 2','A119 V3','VS1']),
 ...models('Vantrue','https://www.vantrue.com/collections/all-dash-cam',[
  'N5S','N4 Pro S','N4S','N2X','N5','N4 Pro',
 ]),
 ...models('Vantrue','https://www.vantrue.com/collections/only-front-dashcam',['E1','E1 Lite','E1 Pro'],['E1','E1 Lite','E1 Pro']),
 // Owner explicitly requested this upcoming model. The official front-only
 // collection independently verifies 1CH; its product page still says pre-order,
 // estimated shipping November 15–20. Never claim released/public availability.
 {id:'ui:Vantrue:E1 Pro S',manufacturer:'Vantrue',model:'E1 Pro S',provenance:'owner-provided-prerelease',fixedSingleChannel:true,source:'https://www.vantrue.com/collections/only-front-dashcam'},
 ...models('Thinkware','https://thinkware.com/global/dash-cam-comparison',[
  'U3000','U1000 Plus','ARC','Q1000','Q850','Q200','X800','F200 PRO','F790','X700','F70 PRO',
 ],['F70 PRO']),
 ...models('Thinkware','https://thinkware.com/global/product/u3000-pro',['U3000 PRO']),
 ...models('Vantrue','https://www.vantrue.com/products/s1-pro-max',['S1 Pro Max']),
 ...models('Vantrue','https://www.vantrue.com/products/sonnet-1-pro',['S1 Pro']),
 ...models('Thinkware','https://thinkware.com/global/product/u1000-pro',['U1000 PRO']),
 ...models('Thinkware','https://thinkware.com/global/product/q200-pro',['Q200 PRO']),
 ...models('BlackVue','https://blackvue.com/collections/dash-cam',[
  'ELITE 10-2CH','ELITE 10-1CH','ELITE 10 Cabin','ELITE 9-2CH','ELITE 8-2CH','ELITE 8-1CH',
  'DR970X-2CH LTE Plus II (NA)','DR970X-2CH LTE Plus II (GL)','DR970X-2CH LTE (GL)',
  'DR770X Box-3CH Pro','DR770X Box-3CH Truck Pro','DR770X Box-3CH DMS Pro',
 ]),
 // Separate Garmin cameras can sync in the phone app; that does not add recording
 // channels to one unit/card. Official X-series announcement specifies each lens.
 ...models('Garmin','https://www.garmin.com/en-US/newsroom/press-release/automotive/capture-detailed-eyewitness-video-with-the-new-garmin-dash-cam-x-series/',
  ['Dash Cam Mini 3','Dash Cam X110','Dash Cam X210','Dash Cam X310'],['Dash Cam Mini 3','Dash Cam X110','Dash Cam X210','Dash Cam X310']),
 ...models('Nextbase','https://nextbase.com/dash-cams/',['122','222','322GW','422GW','522GW','622GW','Piqo','iQ']),
 ...models('70mai','https://www.70mai.com/',[
  'T800','A900 Ultra','A900','A810 Lite','M310 Plus 4K','4K Omni','A810','M310','S500',
 ]),
 ...models('70mai','https://www.70mai.com/global/a510/',['A510']),
 ...models('Rexing','https://www.rexingusa.com/product/rexing-r4/',['R4']),
 ...models('Rexing','https://www.rexingusa.com/product/v1p-3/',['V1P 3rd Generation']),
 ...models('Rove','https://www.rovedashcam.com/products/rove-r2-4k-car-dashcam',['R2-4K'],['R2-4K']),
 ...models('Rove','https://www.rovedashcam.com/products/rove-r3-dash-cam-3-channel-built-in-wifi-gps-1440p-1080p-1080p-front-cabin-rear',['R3']),
 ...models('Wolfbox','https://wolfbox.com/pages/manual',['G900 PRO','G900TriPro','G850 PRO','G850 V02','G850','X5','X3','i17-3 V02','i07','i05','i03','D07S','D07PRO','D07','G930','G930 V02','G840S','G840H','G900','T10','G890']),
 ...models('Vueroid','https://vueroid.com/product/vueroid-d21-4k-2ch/',['D21 4K 2CH','S1 4K Infinite','S1 QHD Infinite','D20-Q2-PLUS','D20-F2','D20-F2E']),
 ...models('Vueroid','https://vueroid.com/product/d21-lte-fhd/',['D21 LTE FHD']),
];
const identity=(c:Pick<ModelOption,'manufacturer'|'model'>)=>`${c.manufacturer.trim().toLowerCase()}\0${c.model.trim().toLowerCase()}`;
/** Retain native IDs/exact report strings for existing identities, but NEVER copy
 * native maximum channel counts or setup strings into an owner observation. */
export function mergeModelOptions(native:Pick<ModelOption,'id'|'manufacturer'|'model'>[]):ModelOption[]{
 const result=new Map(modelOptions.map(c=>[identity(c),{...c}]));
 for(const c of native){const previous=result.get(identity(c));result.set(identity(c),{...previous,id:c.id,manufacturer:c.manufacturer,model:c.model,provenance:previous?.provenance||'native-catalog'});}
 return [...result.values()];
}
export function modelOptionLabel(c:ModelOption):string{return c.model;}
