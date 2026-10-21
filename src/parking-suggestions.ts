// SPDX-License-Identifier: AGPL-3.0-only
/** Native whole-inventory IPC only. Owner model choices never create authority. */
export type TemporalParking={suggestion:string|null;confidence:string;estimatedCaptureFps:number|null;inventoryComplete:boolean;temporalLimited:boolean;cohorts:{recordingContext:string;suggestion:string|null;confidence:string;adjacentPairs:number;estimatedCaptureFps:number|null}[]};
export function parkingSuggestion(t?:TemporalParking|null){
 const empty={text:'',mode:null as string|null,fps:null as number|null};
 if(!t||!t.inventoryComplete||t.temporalLimited||!['likely','possible'].includes(t.confidence))return empty;
 const reasons:Record<string,string>={time_lapse_like:'Adjacent parking recordings consistently cover more capture time than playback time.',low_bitrate_continuous_like:'Parking recordings have continuous timing and a comparable lower-bitrate baseline.',event_like:'Irregular parking bursts suggest event-triggered recording; the exact trigger and buffering remain unknown.',continuous_like:'Adjacent parking recordings have continuous timing; the exact parking setting remains unknown.'};
 const family=t.suggestion||'';
 if(!reasons[family])return empty;
 const parking=t.cohorts.filter(c=>c.recordingContext==='parking'&&c.adjacentPairs>=4&&c.suggestion===family&&['likely','possible'].includes(c.confidence));
 if(!parking.length)return empty;
 // A coherent parking family may coexist with ordinary driving cohorts.
 if(t.cohorts.some(c=>c.recordingContext==='parking'&&c.adjacentPairs>=4&&c.suggestion&&c.suggestion!==family))return empty;
 const raw=t.estimatedCaptureFps;
 const valid=typeof raw==='number'&&Number.isFinite(raw)&&raw>0&&raw<=240;
 const fps=valid?Number(raw.toPrecision(4)):null;
 const safeFps=fps!==null&&fps>0&&fps<=240?fps:null;
 const title:Record<string,string>={time_lapse_like:'time-lapse',low_bitrate_continuous_like:'low-bitrate continuous recording',event_like:'event-like recording',continuous_like:'continuous recording'};
 const mode=t.confidence==='likely'?(family==='time_lapse_like'?'time-lapse':family==='low_bitrate_continuous_like'?'low-bitrate':null):null;
 return {text:`${t.confidence==='likely'?'Likely':'Possible'} ${title[family]}${family==='time_lapse_like'&&safeFps!==null?' · approximately '+safeFps+' fps':''}. ${reasons[family]} Suggested estimate, not a confirmed setting. You can edit the fields below.`,mode,fps:mode==='time-lapse'?safeFps:null};
}
