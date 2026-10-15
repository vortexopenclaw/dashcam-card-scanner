// SPDX-License-Identifier: AGPL-3.0-only
export type ScanCoverage = {
  inventoryComplete?: boolean;
  issues?: Record<string, number>;
  metadataCoverage?: {recognizedFiles:number;inspectedFiles:number;measuredFiles:number;unsupportedFiles:number;complete:boolean;representativeSamplesLimited?:boolean};
};
type ScanResult=ScanCoverage & {scannedFiles:number;folders:unknown[];limited:boolean;cancelled:boolean;probeAttempts:number;probeFailures:number;sampledFiles:number};
const reasons:Record<string,string>={
  directory_enumeration_failed:'folders could not be listed',directory_entry_failed:'directory entries could not be read',
  unsafe_entry_name:'unsafe entries were excluded',entry_metadata_failed:'file details could not be read',
  directory_open_failed:'folders could not be opened',entry_resource_limit:'the exceptional file-count guard was reached',
  directory_resource_limit:'the exceptional folder-count guard was reached',directory_depth_limit:'folders exceeded the supported nesting depth',
  offline_placeholder_excluded:'offline files were excluded',video_open_failed:'video files could not be opened',
  video_metadata_failed:'video file details could not be read',video_read_failed:'video files could not be read',
  video_container_unsupported:'video containers could not be measured',video_header_unmeasured:'video headers could not be measured',
  metadata_cohort_limit:'the recording-variation evidence guard was reached',
};
export function describeScan(r:ScanResult,hasSetups=false):{summary:string;status:string} {
  const n=(v:number)=>Number.isFinite(v)&&v>=0?Math.floor(v).toLocaleString('en-US'):'0';
  const c=r.metadataCoverage;
  let summary=`${n(r.scannedFiles)} files · ${n(r.folders.length)} folders · `+(c
    ?`${n(c.inspectedFiles)} of ${n(c.recognizedFiles)} video files inspected · ${n(c.measuredFiles)} measured.`
    :`${n(Math.max(0,r.probeAttempts-r.probeFailures))} measured samples.`);
  const inventoryComplete=!r.cancelled&&!r.limited&&r.inventoryComplete!==false;
  const details=Object.entries(r.issues??{}).filter(([,count])=>Number.isFinite(count)&&count>0)
    .map(([code,count])=>`${n(count)}: ${reasons[code]??'additional scan issues'}`).join('; ');
  if(details)summary+=` Scan details — ${details}.`;
  if(c?.representativeSamplesLimited)summary+=` The report retains ${n(r.sampledFiles)} representative examples; this does not limit header inspection.`;
  let status=r.cancelled?'Scan cancelled. Rescan to finish inspecting the card.':!inventoryComplete
    ?'Scan incomplete. Some card entries could not be inspected; see the scan details below.'
    :c?.recognizedFiles===0?'Card scan complete. No video recordings were found.'
    :c&&!c.complete?'Card inventory complete. Some video metadata could not be measured; see the scan details below.'
    :'Card scan complete. Confirm your camera settings.';
  if(!r.cancelled&&hasSetups)status+=' Recording setups were kept. Reassign their recordings after this rescan.';
  if(!inventoryComplete&&!details&&!r.cancelled)summary+=' Some entries were not inspected; this older report does not identify why.';
  return {summary,status};
}
