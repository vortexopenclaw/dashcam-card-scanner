// SPDX-License-Identifier: AGPL-3.0-only
export type Bridge = {invoke:<T>(cmd:string,args?:Record<string,unknown>)=>Promise<T>;listen:<T>(event:string,handler:(e:{payload:T})=>void)=>Promise<()=>void>};
type Report={scannedFiles:number;entriesSeen:number;skipped:number;sampledFiles:number;probeAttempts:number;probeFailures:number;limited:boolean;cancelled:boolean;folders:{path:string;fileCount:number;videos:unknown[]}[]};
type Review={token:string;publicJson:string;submissionJson:string;privateJson:string;payloadHash:string;warning:string};
export function mount(root:HTMLElement,bridge:Bridge) {
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',parent:HTMLElement=root)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;};
  element('p','VORTEX RADAR • OPEN SOURCE • AGPLv3').className='eyebrow';
  element('h1','Dashcam Card Scanner');
  element('p','Help document dashcam recording formats without uploading your footage. Independent of Dashcam Offloader.');
  const intro=element('section');element('h2','Read-only, local by default',intro);
  element('p','This app never copies media or writes to your card. No original filenames, dates, source paths, GPS, config contents or device identifiers are included in scan data. Unknown folders get anonymous labels. No contacts are requested.',intro);
  element('p','Metadata engine: built-in bounded MP4/MOV/M4V (ISO BMFF) parser. No ffprobe is bundled or used. Other formats and unavailable measurements are reported, never invented. This is not a card-health or continuity test.',intro);
  const select=element('button','Choose card / folder');const source=element('p','No folder selected (path stays local).');source.className='source';
  const actions=element('div');actions.className='actions';const scan=element('button','Scan read-only',actions);scan.disabled=true;const cancel=element('button','Cancel',actions);cancel.disabled=true;
  const status=element('p','Ready.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const summary=element('p');
  const labels=element('section');element('h2','Owner-reported labels',labels);element('p','Not scanner-verified. Label this card’s configuration, not your personal identity. Do not enter contacts, serials, paths, locations or passwords. Mixed settings must be described as mixed.',labels);
  const fields:Record<string,HTMLInputElement>={};
  for(const [key,text,max,required] of [['manufacturer','Manufacturer',100,true],['model','Model',100,true],['channelSetup','Channel setup (e.g. front + rear)',200,true],['firmware','Firmware (optional)',100,false],['settings','Recording / parking / quality settings (optional)',600,false]] as const){
    const label=element('label',text+(required?' *':''),labels);const input=element('input','',label);input.type='text';input.maxLength=max;input.required=required;input.autocomplete='off';fields[key]=input;
  }
  const choices:Record<string,HTMLSelectElement>={};
  for(const [key,title,options] of [['channelCount','Owner-reported channel count',['Select count','1','2','3','4','5','6','7','8']],['quality','Owner-reported quality',['unknown','low','normal','medium','high','maximum']],['parkingMode','Owner-reported parking mode',['unknown','off','buffered','time-lapse','low-bitrate','motion','impact','low-power-impact']]] as const){const label=element('label',title,labels);const select=element('select','',label);for(const value of options){const option=element('option',value,select);option.value=value;}choices[key]=select;}
  const cadenceLabel=element('label','Owner-reported time-lapse capture fps (optional; NOT video playback fps)',labels);const cadence=element('input','',cadenceLabel);cadence.type='number';cadence.min='0.01';cadence.max='240';cadence.step='any';
  const prepare=element('button','Prepare exact data review');prepare.disabled=true;
  const reviewPanel=element('section');reviewPanel.hidden=true;element('h2','Review before export or submission',reviewPanel);const warning=element('p','',reviewPanel);
  element('h3','Public JSON — schema 1.0 aggregates',reviewPanel);const publicView=element('pre','',reviewPanel);publicView.tabIndex=0;
  element('h3','Private paired evidence — local export only',reviewPanel);const pairedView=element('pre','',reviewPanel);pairedView.tabIndex=0;
  element('h3','Secure intake v1 — exact outgoing JSON (structure + individual samples)',reviewPanel);const privateView=element('pre','',reviewPanel);privateView.tabIndex=0;
  const hashView=element('p','',reviewPanel);
  const exports=element('div','',reviewPanel);exports.className='actions';const publicExport=element('button','Export public JSON…',exports);const privateExport=element('button','Export private paired evidence…',exports);
  element('p','Export creates a new file you select outside the scanned source. Existing files are never overwritten. Export does not submit or publish anything.',reviewPanel);
  const consentLabel=element('label','',reviewPanel);const consent=element('input','',consentLabel);consent.type='checkbox';element('span','I reviewed the exact secure-intake payload and agree to send it to Vortex Radar for research review and possible publication of anonymous evidence. My IP is visible to the service provider.',consentLabel);
  const challenge=element('button','Get browser verification ticket',reviewPanel);
  const ticketLabel=element('label','One-use verification ticket (never stored)',reviewPanel);const ticket=element('input','',ticketLabel);ticket.type='password';ticket.autocomplete='off';ticket.maxLength=4096;
  const submit=element('button','Submit reviewed evidence',reviewPanel);submit.disabled=true;
  element('p','Submissions require browser verification and a one-use ticket bound to this exact payload. If the intake gateway is not provisioned, submission fails closed; exports remain available.',reviewPanel);
  const updateSection=element('section');element('h2','App updates',updateSection);element('p','Only official signature-verified updates can be installed. This review build has no official verification key yet; updates fail closed. Platform signing / notarization is not provisioned.',updateSection);
  const check=element('button','Check for signed update',updateSection);const install=element('button','Install reviewed update',updateSection);install.hidden=true;
  let review:Review|null=null;let report:Report|null=null;let busy=false;let version:string|null=null;
  const invalidate=()=>{review=null;reviewPanel.hidden=true;consent.checked=false;ticket.value='';submit.disabled=true;};
  const eligible=()=>!!review && !!review.submissionJson && consent.checked && ticket.value.trim().length>0;
  consent.addEventListener('change',()=>submit.disabled=!eligible());ticket.addEventListener('input',()=>submit.disabled=!eligible());
  Object.values(fields).forEach(f=>f.addEventListener('input',invalidate));Object.values(choices).forEach(f=>f.addEventListener('change',invalidate));cadence.addEventListener('input',invalidate);
  const setBusy=(value:boolean)=>{busy=value;select.disabled=value;scan.disabled=value || source.dataset.selected!=='yes';cancel.disabled=!value;prepare.disabled=value || !report || report.cancelled || report.scannedFiles===0;Object.values(fields).forEach(f=>f.disabled=value);Object.values(choices).forEach(f=>f.disabled=value);cadence.disabled=value;publicExport.disabled=value;privateExport.disabled=value;submit.disabled=value||!eligible();challenge.disabled=value;check.disabled=value;install.disabled=value;};
  const run=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);try{await fn();}catch(e){status.textContent=String(e);}finally{setBusy(false);}};
  select.onclick=()=>run(async()=>{const path=await bridge.invoke<string|null>('choose_source');if(path){invalidate();report=null;source.textContent=path;source.dataset.selected='yes';summary.textContent='';status.textContent='Folder selected. Path is local only.';}});
  scan.onclick=()=>run(async()=>{invalidate();report=null;status.textContent='Scanning metadata…';const result=await bridge.invoke<Report>('scan_source');report=result;summary.textContent=`${result.scannedFiles} files • ${result.folders.length} folders • ${result.probeAttempts-result.probeFailures}/${result.probeAttempts} measured video samples • ${result.sampledFiles-result.probeAttempts} unsupported video samples • ${result.skipped} skipped. ${result.limited?'Partial scan: safety limit reached.':''}`;status.textContent=result.cancelled?'Scan cancelled. Scan again before review.':'Scan complete. Add labels and prepare a review.';});
  cancel.onclick=()=>{void bridge.invoke('cancel_scan').catch(e=>status.textContent=String(e));status.textContent='Cancellation requested; waiting for current bounded read.';};
  prepare.onclick=()=>run(async()=>{invalidate();const values={...Object.fromEntries(Object.entries(fields).map(([key,f])=>[key,f.value])),channelCount:choices.channelCount.value==='Select count'?0:Number(choices.channelCount.value),quality:choices.quality.value,parkingMode:choices.parkingMode.value,timeLapseFps:cadence.value?Number(cadence.value):null};review=await bridge.invoke<Review>('prepare_review',{labels:values});publicView.textContent=review.publicJson;privateView.textContent=review.submissionJson || 'No valid bounded intake envelope. See warning; local exports remain available.';pairedView.textContent=review.privateJson;hashView.textContent='Payload SHA-256: '+review.payloadHash;warning.textContent=review.warning;reviewPanel.hidden=false;status.textContent='Review both formats below. No data has been sent.';});
  for(const [button,kind] of [[publicExport,'public'],[privateExport,'private']] as const)button.onclick=()=>run(async()=>{if(!review)return;const saved=await bridge.invoke<boolean>('export_review',{token:review.token,kind});status.textContent=saved?'Export saved outside source. Nothing submitted.':'Export cancelled.';});
  challenge.onclick=()=>run(async()=>{if(!review)return;const result=await bridge.invoke<string>('begin_verification',{token:review.token});status.textContent=result;});
  submit.onclick=()=>run(async()=>{if(!review||!eligible())return;const oneUseTicket=ticket.value.trim();ticket.value='';const id=await bridge.invoke<string>('submit_review',{token:review.token,consent:consent.checked,ticket:oneUseTicket});invalidate();status.textContent=`Server confirmed receipt: ${id}. Evidence awaits maintainer review; it is not automatically published.`;});
  check.onclick=()=>run(async()=>{version=await bridge.invoke<string|null>('check_update');install.hidden=!version;install.textContent=version?`Install signed version ${version}`:'Install update';status.textContent=version?`Update ${version} available. Install only after approval; restart the app after installation.`:'No update available.';});
  install.onclick=()=>run(async()=>{if(!version)return;await bridge.invoke('install_update',{version,consent:true});status.textContent='Verified update installed. Close and reopen the app.';install.hidden=true;});
  void bridge.listen<{phase:string;entries:number;files:number;probed:number}>('scan-progress',({payload:p})=>{status.textContent=`${p.phase}: ${p.entries} entries, ${p.files} files, ${p.probed} video probes.`;}).catch(e=>status.textContent=`Progress unavailable: ${String(e)}`);
  return {fields,status,source,choices,scan,prepare,select,submit,consent,ticket,publicView,privateView,reviewPanel,challenge,cancel};
}
