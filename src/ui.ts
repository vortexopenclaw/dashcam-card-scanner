// SPDX-License-Identifier: AGPL-3.0-only
import {submissionErrorMessage} from './submission-errors';
import {brandOptions,settingCategory} from './brand-options';
import {mergeModelOptions,modelOptionLabel,type ModelOption} from './model-options';
import {platformStyle} from './platform-style';
import {describeScan,type ScanCoverage} from './scan-summary';
import {loadSettings,saveSettings,followTheme,type Theme} from './settings';
export type Bridge = {invoke:<T>(cmd:string,args?:Record<string,unknown>)=>Promise<T>;listen:<T>(event:string,handler:(e:{payload:T})=>void)=>Promise<()=>void>};
type ReviewSample={index:number;folderIndex:number;folder:string;localName?:string;roleHint?:string|null;modeHint?:string|null;filenameTemplate:string;sizeBytes?:number;video?:{codec:string;width:number;height:number;nominalFrameRate:number|null;videoBitrate:number|null;fileSizeBytes?:number;durationSeconds?:number}|null};
type Cohort={id:string;evidenceIndices:number[];folderIndices:number[];owner:{channelCount:number;firmware?:string;quality?:string;qualityLabel?:string;parkingMode?:string;parkingModeLabel?:string;timeLapseFps?:number|null}};
type Camera={id:string;manufacturer:string;model:string;channelCount:number;channelSetup:string};
type Report=ScanCoverage & {cameraRecognition?:(Partial<Camera>&{reason?:string;candidates?:Partial<Camera>[]});reviewSamples?:ReviewSample[];scannedFiles:number;entriesSeen:number;skipped:number;sampledFiles:number;probeAttempts:number;probeFailures:number;limited:boolean;cancelled:boolean;folders:{path:string;fileCount:number;videos:unknown[]}[]};
type Review={token:string;publicJson:string;submissionJson:string;privateJson:string;payloadHash:string;warning:string;submissionAvailable?:boolean};
export function mount(root:HTMLElement,bridge:Bridge) {
  document.documentElement.dataset.platform=platformStyle(navigator.platform||navigator.userAgent);
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',parent:HTMLElement=root)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;};
  const preferences=loadSettings();let stopTheme=followTheme(preferences.theme);
  const sidebar=element('aside');sidebar.className='sidebar';element('div','◉',sidebar).className='brand-icon';element('strong','Dashcam Card Scanner',sidebar);
  const scannerButton=element('button','Scanner',sidebar);scannerButton.type='button';scannerButton.setAttribute('aria-current','page');
  const settingsButton=element('button','Settings',sidebar);settingsButton.type='button';
  const settingsPanel=element('section');settingsPanel.hidden=true;settingsPanel.className='settings-panel';settingsPanel.setAttribute('aria-label','Settings');element('h2','Settings',settingsPanel);element('p','Built by Vortex Radar.',settingsPanel);
  const themeLabel=element('label','Appearance',settingsPanel);const theme=element('select','',themeLabel);for(const [value,title] of [['system','Match system (default)'],['light','Light'],['dark','Dark']]){const o=element('option',title,theme);o.value=value;}theme.value=preferences.theme;
  const usernameLabel=element('label','DashCamTalk username (optional)',settingsPanel);const username=element('input','',usernameLabel);username.maxLength=40;username.autocomplete='off';username.value=preferences.username;
  element('p','Helps Vortex Radar identify your submission and credit your contribution.',settingsPanel);
  const settingsStatus=element('p','',settingsPanel);const closeSettings=element('button','Done',settingsPanel);let savedScroll=0;const mainScreen=element('div');mainScreen.className='main-screen';const showSettings=(show:boolean)=>{if(show===!settingsPanel.hidden)return;if(show)savedScroll=window.scrollY;settingsPanel.hidden=!show;mainScreen.hidden=show;settingsButton.setAttribute('aria-expanded',String(show));if(show){settingsButton.setAttribute('aria-current','page');scannerButton.removeAttribute('aria-current');}else{scannerButton.setAttribute('aria-current','page');settingsButton.removeAttribute('aria-current');}try{window.scrollTo(0,show?0:savedScroll);}catch{}if(show&&updateState==='idle'&&!busy)void checkForUpdate();if(!show)renderUpdate();if(show){const heading=settingsPanel.querySelector('h2')!;heading.tabIndex=-1;heading.focus({preventScroll:true});}};settingsButton.onclick=()=>showSettings(true);scannerButton.onclick=()=>showSettings(false);closeSettings.onclick=()=>showSettings(false);
  theme.onchange=()=>{preferences.theme=theme.value as Theme;stopTheme();stopTheme=followTheme(preferences.theme);settingsStatus.textContent=saveSettings(preferences)?'Appearance saved locally.':'Unable to save preferences on this computer.';};
  element('h1','Dashcam Card Scanner');
  element('p','Help document dashcam recording formats without uploading your footage. Independent of Dashcam Offloader.');
  const intro=element('details');intro.className='about';element('summary','About scanning & privacy',intro);
  element('p','Scanning never copies media or writes to your card. Filenames appear only in local review, not saved reports or submissions. Source paths, dates, GPS, config contents and device identifiers are excluded. Unknown folders get anonymous labels. An optional forum username is included only in the private submission you review and approve.',intro);
  element('p','The built-in reader measures supported MP4, MOV and M4V recordings. Other formats and unavailable measurements are reported, never invented. This is not a card-health or continuity test.',intro);
  const select=element('button','Choose card / folder');const source=element('p','No folder selected (path stays local).');source.className='source';
  const actions=element('div');actions.className='actions';const scan=element('button','Rescan',actions);scan.disabled=true;const cancel=element('button','Cancel',actions);cancel.disabled=true;
  const status=element('p','Ready.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const scanLoading=element('div');scanLoading.className='scan-loading';scanLoading.hidden=true;
  const scanProgress=element('progress','',scanLoading);scanProgress.setAttribute('aria-label','Scanning card');
  const scanLoadingNote=element('p','Camera settings will appear when the scan finishes.',scanLoading);
  const scanElapsed=element('p','',scanLoading);scanElapsed.setAttribute('role','timer');scanElapsed.setAttribute('aria-live','off');
  let scanActive=false;let scanModelReading=false;let scanCancelling=false;let scanStarted=0;let scanTimer:number|undefined;
  const setScanLoading=(active:boolean)=>{scanActive=active;scanLoading.hidden=!active;scanLoading.setAttribute('aria-busy',String(active));status.classList.toggle('scanning',active);cancel.disabled=!active;if(scanTimer!==undefined){window.clearInterval(scanTimer);scanTimer=undefined;}if(active){scanStarted=Date.now();scanModelReading=false;scanCancelling=false;scanLoadingNote.textContent='Camera settings will appear when the scan finishes.';scanElapsed.textContent='Elapsed: 0 seconds';scanTimer=window.setInterval(()=>{if(!root.isConnected){setScanLoading(false);return;}const seconds=Math.max(0,Math.floor((Date.now()-scanStarted)/1000));scanElapsed.textContent=`Elapsed: ${seconds} ${seconds===1?'second':'seconds'}`;},1000);}};
  const summary=element('p');
  const labels=element('section');labels.hidden=true;element('h2','About your camera',labels);element('p','Confirm what you know. These settings are owner-reported, not proof that every recording used the same settings. Normal, parking, and event recordings from one setup need only the fields below. Use optional multiple recording setups only if you changed cameras or settings on this card.',labels);
  const recognitionNote=element('p','',labels);recognitionNote.hidden=true;
  const fallback=element('div','',labels);
  const fields:Record<string,HTMLInputElement>={};
  for(const [key,text,max,required] of [['manufacturer','Manufacturer',100,true],['model','Model',100,true],['channelSetup','Channel setup (e.g. front + rear)',200,true],['firmware','Firmware (optional)',100,false]] as const){
    const label=element('label',text+(required?' *':''),['manufacturer','model'].includes(key)?labels:fallback);const input=element('input','',label);input.type='text';input.maxLength=max;input.required=required;input.autocomplete='off';fields[key]=input;
  }
  const choices:Record<string,HTMLSelectElement>={};
  for(const [key,title,options] of [['channelCount','Channel count',['Select count','1','2','3','4','5','Other']],['quality','Video Bitrate / Quality',['unknown','low','normal','medium','high','maximum']],['parkingMode','Parking mode',['unknown','off','buffered','time-lapse','low-bitrate','motion','impact','low-power-impact']]] as const){const label=element('label',title,labels);const select=element('select','',label);for(const value of options){const option=element('option',value.charAt(0).toUpperCase()+value.slice(1),select);option.value=value;}choices[key]=select;}
  const addFrameRates=(select:HTMLSelectElement,value='')=>{element('option','Unknown',select).value='';for(const rate of [...Array.from({length:10},(_,i)=>i+1),15])element('option',`${rate} fps`,select).value=String(rate);if(value&&!Array.from(select.options).some(o=>o.value===value))element('option',`${value} fps`,select).value=value;select.value=value;};
  const cadenceLabel=element('label','Time-lapse frame rate',labels);const cadence=element('select','',cadenceLabel);cadence.setAttribute('data-frame-rate','true');addFrameRates(cadence);
  fallback.append(...Object.values(choices).map(c=>c.parentElement!),cadenceLabel);labels.append(fallback);
  const customChannels=element('input','',choices.channelCount.parentElement!);customChannels.type='number';customChannels.min='1';customChannels.max='8';customChannels.hidden=true;customChannels.setAttribute('aria-label','Other channel count');customChannels.oninput=()=>invalidate();
  const customQuality=element('input','',choices.quality.parentElement!);const customParking=element('input','',choices.parkingMode.parentElement!);for(const input of [customQuality,customParking]){input.maxLength=80;input.hidden=true;input.placeholder='Describe the setting';input.oninput=()=>invalidate();}
  const qualityNote=element('p','Standard and PlatePix are owner-reported picture/quality modes, not bitrate tiers. Options vary by camera and firmware.',choices.quality.parentElement!);qualityNote.hidden=true;
  const otherTimelapseLabel=element('label','',labels);const otherTimelapse=element('input','',otherTimelapseLabel);otherTimelapse.type='checkbox';element('span','This custom parking mode records time-lapse',otherTimelapseLabel);
  const updateConditional=()=>{customChannels.hidden=choices.channelCount.value!=='Other';customQuality.hidden=choices.quality.value!=='other';customParking.hidden=choices.parkingMode.value!=='other';otherTimelapseLabel.hidden=customParking.hidden;cadenceLabel.hidden=choices.parkingMode.value!=='time-lapse'&&!(choices.parkingMode.value==='other'&&otherTimelapse.checked);};
  for(const choice of Object.values(choices))choice.addEventListener('change',updateConditional);otherTimelapse.onchange=()=>{updateConditional();invalidate();};updateConditional();
  const qualityCategory=(value:string)=>{const option=brandOptions(fields.manufacturer.value).quality.find(o=>o.value===value);return option?settingCategory(option):value;};
  const selectedLabel=(key:'quality'|'parkingMode')=>choices[key].value==='other'?(key==='quality'?customQuality:customParking).value.trim():choices[key].selectedOptions[0]?.textContent||'Unknown';
  const refreshBrand=()=>{qualityNote.hidden=fields.manufacturer.value.trim().toLowerCase()!=='vantrue';const options=brandOptions(fields.manufacturer.value);for(const [key,list] of [['quality',options.quality],['parkingMode',options.parking]] as const){const previous=choices[key].value;choices[key].replaceChildren();for(const item of list)element('option',item.label,choices[key]).value=item.value;choices[key].value=list.some(o=>o.value===previous)?previous:'unknown';}updateConditional();};
  // Keep exact values for reports; expose text entry only for an unlisted camera.
  const manufacturerPick=element('select','',fields.manufacturer.parentElement!);manufacturerPick.setAttribute('aria-label','Choose a known manufacturer');fields.manufacturer.before(manufacturerPick);fields.manufacturer.placeholder='Enter manufacturer';
  const modelPick=element('select','',fields.model.parentElement!);modelPick.setAttribute('aria-label','Choose a known model');fields.model.before(modelPick);fields.model.placeholder='Enter model';let catalog:ModelOption[]=mergeModelOptions([]);
  element('p','Model choices are owner-report labels, not a list of models the scanner can recognize. Channel count stays unknown unless observed, confirmed by you, or suggested for a verified fixed single-channel model.',fields.model.parentElement!);
  let channelOwnerEdited=false;let suggestedChannels=false;let suggestedSetup=false;
  choices.channelCount.addEventListener('change',()=>{channelOwnerEdited=true;suggestedChannels=false;});customChannels.addEventListener('input',()=>{channelOwnerEdited=true;suggestedChannels=false;});fields.channelSetup.addEventListener('input',()=>suggestedSetup=false);
  const suggestSingleChannel=(camera?:ModelOption)=>{if(!channelOwnerEdited&&(choices.channelCount.value==='Select count'||suggestedChannels)){choices.channelCount.value=camera?.fixedSingleChannel?'1':'Select count';customChannels.value='';suggestedChannels=!!camera?.fixedSingleChannel;}if(!fields.channelSetup.value||suggestedSetup){fields.channelSetup.value=camera?.fixedSingleChannel?'front':'';suggestedSetup=!!camera?.fixedSingleChannel;}};
  const alphabetical=(a:string,b:string)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true});
  const syncCameraInputs=()=>{fields.manufacturer.hidden=manufacturerPick.value!=='other';fields.model.hidden=modelPick.value!=='other';};
  const refreshModels=()=>{modelPick.replaceChildren();element('option','Choose a known model…',modelPick).value='';for(const camera of catalog.filter(c=>c.manufacturer.toLowerCase()===fields.manufacturer.value.toLowerCase()).sort((a,b)=>alphabetical(a.model,b.model)))element('option',modelOptionLabel(camera),modelPick).value=camera.id;element('option','Other — enter model',modelPick).value='other';modelPick.value=catalog.find(c=>c.manufacturer.toLowerCase()===fields.manufacturer.value.toLowerCase()&&c.model===fields.model.value)?.id||(fields.model.value?'other':'');syncCameraInputs();};
  const refreshManufacturers=()=>{manufacturerPick.replaceChildren();element('option','Choose a manufacturer…',manufacturerPick).value='';const brands=new Map<string,string>();for(const brand of ['Viofo','BlackVue','Thinkware','Vantrue','Nextbase','Garmin','70mai',...catalog.map(c=>c.manufacturer)])if(!brands.has(brand.toLowerCase()))brands.set(brand.toLowerCase(),brand);for(const brand of [...brands.values()].sort(alphabetical))element('option',brand,manufacturerPick).value=brand;element('option','Other — enter manufacturer',manufacturerPick).value='other';manufacturerPick.value=Array.from(manufacturerPick.options).find(o=>o.value.toLowerCase()===fields.manufacturer.value.toLowerCase())?.value||(fields.manufacturer.value?'other':'');syncCameraInputs();};
  manufacturerPick.onchange=()=>{if(manufacturerPick.value==='other'){fields.manufacturer.value='';suggestSingleChannel();refreshBrand();refreshModels();renderGroups();syncCameraInputs();fields.manufacturer.focus();invalidate();ownerEdited=true;}else{fields.manufacturer.value=manufacturerPick.value;fields.manufacturer.dispatchEvent(new Event('input',{bubbles:true}));syncCameraInputs();}};
  modelPick.onchange=()=>{if(modelPick.value==='other'){fields.model.value='';suggestSingleChannel();syncCameraInputs();fields.model.focus();invalidate();ownerEdited=true;return;}const camera=catalog.find(c=>c.id===modelPick.value);fields.model.value=camera?.model||'';suggestSingleChannel(camera);updateConditional();syncCameraInputs();fields.model.dispatchEvent(new Event('input',{bubbles:true}));};
  fields.manufacturer.addEventListener('input',()=>{suggestSingleChannel();refreshBrand();refreshModels();renderGroups();});
  void bridge.invoke<Camera[]>('camera_catalog').then(result=>{catalog=mergeModelOptions(Array.isArray(result)?result:[]);refreshManufacturers();refreshModels();}).catch(()=>{});refreshManufacturers();refreshModels();refreshBrand();
  fallback.append(otherTimelapseLabel);
  const groupPanel=element('details');groupPanel.hidden=true;element('summary','Optional: multiple recording setups',groupPanel);
  element('p','Use this only if you changed cameras or recording settings on this card. Normal, parking, and event footage from the same setup do not need separate setups. Otherwise, the ordinary camera fields above are enough. The first setup starts with your current settings.',groupPanel);
  const setupNotice=element('p','Recording setups below replace the ordinary settings fields; there are no separate whole-card settings. Assign each sampled recording to the setup that actually produced it. Do not split normal and parking footage unless settings changed. Removing all setups returns to the ordinary fields.',groupPanel);setupNotice.hidden=true;
  const groupControls=element('div','',groupPanel);groupControls.className='actions';const addGroup=element('button','Add recording setup',groupControls);const groupForms=element('div','',groupPanel);
  const sampleDetails=element('details','',groupPanel);sampleDetails.hidden=true;element('summary','Sample details and setup assignment',sampleDetails);
  element('p','Bounded samples only — not complete card or setup coverage. Folder, suffix, codec, resolution, and playback fps are technical hints, not proof of exact models or parking subtypes. Protected files are not automatically parking. Local filenames below never leave this app.',sampleDetails);
  const sampleList=element('div','',sampleDetails);
  let cohorts:Cohort[]=[];let assignments=new Map<number,string>();
  const renderSamples=()=>{sampleList.replaceChildren();if(!cohorts.length)return;const samples=report?.reviewSamples||[];if(!samples.length){element('p','No individual video samples available. Folder inventory remains reviewable.',sampleList);return;}
    const buckets=new Map<string,ReviewSample[]>();for(const s of samples){const v=s.video;const signature=`${s.folder} · ${s.filenameTemplate} · ${v?`${v.codec} ${v.width}×${v.height} · ${v.nominalFrameRate??'unknown'} playback fps`:'metadata unavailable'}`;buckets.set(signature,[...(buckets.get(signature)||[]),s]);}
    element('p',`${samples.length} selected samples • ${buckets.size} sample sets • ${samples.filter(s=>!assignments.has(s.index)).length} unassigned`,sampleList).className='sample-summary';
    for(const [signature,items] of buckets){const card=element('article','',sampleList);card.className='candidate';element('h3',signature,card);const batch=element('select','',card);batch.setAttribute('aria-label','Assign these samples to a recording setup');for(const [value,title] of [['','Choose recording setup…'],...cohorts.map(c=>[c.id,`Setup ${c.id}`])])element('option',title,batch).value=value;batch.onchange=()=>{for(const sample of items){if(batch.value)assignments.set(sample.index,batch.value);else assignments.delete(sample.index);}invalidate();renderSamples();};for(const s of items){const row=element('label',`Sample ${s.index+1}${s.localName?' — '+s.localName+' (local only)':''}`,card);const pick=element('select','',row);pick.dataset.sample=String(s.index);for(const [value,title] of [['','Unassigned — choose recording setup'],...cohorts.map(c=>[c.id,`Setup ${c.id}`])]){const o=element('option',title,pick);o.value=value;}pick.value=assignments.get(s.index)||'';pick.onchange=()=>{if(pick.value)assignments.set(s.index,pick.value);else assignments.delete(s.index);invalidate();renderSamples();};}}
  };
  const renderGroups=()=>{fallback.hidden=cohorts.length>0;setupNotice.hidden=!cohorts.length;sampleDetails.hidden=!cohorts.length;groupForms.replaceChildren();for(const c of cohorts){const form=element('fieldset','',groupForms);element('legend',`Setup ${c.id} — owner-reported settings`,form);
    const groupOptions=brandOptions(fields.manufacturer.value);if(fields.manufacturer.value.trim().toLowerCase()==='vantrue')element('p','Standard and PlatePix are owner-reported picture/quality modes, not bitrate tiers. Options vary by camera and firmware.',form);
    for(const [key,options] of [['quality',groupOptions.quality],['parkingMode',groupOptions.parking]] as const){if(c.owner[key]&&!options.some(option=>option.value===c.owner[key])){c.owner[key]='unknown';c.owner[key==='quality'?'qualityLabel':'parkingModeLabel']='Unknown';if(key==='parkingMode')c.owner.timeLapseFps=null;}}
    for(const [key,title,options] of [['channelCount','Channel count',[{value:'unknown',label:'Unknown'},...['1','2','3','4','5'].map(value=>({value,label:value})),{value:'other',label:'Other'}]],['quality','Video Bitrate / Quality',groupOptions.quality],['parkingMode','Parking mode',groupOptions.parking]] as const){const label=element('label',title,form);const choice=element('select','',label);choice.dataset.group=c.id;choice.dataset.setting=key;for(const option of options)element('option',option.label,choice).value=option.value;choice.value=key==='channelCount'&&c.owner.channelCount>5?'other':String(c.owner[key]||'unknown');
      const custom=element('input','',label);custom.maxLength=80;custom.hidden=choice.value!=='other';custom.placeholder=key==='channelCount'?'Channel count':'Describe the setting';if(key==='channelCount'){custom.type='number';custom.min='1';custom.max='8';custom.value=c.owner.channelCount>5?String(c.owner.channelCount):'';}else custom.value=c.owner[key==='quality'?'qualityLabel':'parkingModeLabel']||'';
      choice.onchange=()=>{custom.hidden=choice.value!=='other';if(key==='channelCount')c.owner.channelCount=choice.value==='other'?Number(custom.value):choice.value==='unknown'?0:Number(choice.value);else{c.owner[key]=choice.value;c.owner[key==='quality'?'qualityLabel':'parkingModeLabel']=choice.value==='other'?custom.value.trim():choice.selectedOptions[0]?.textContent||'Unknown';if(key==='parkingMode'){if(choice.value!=='time-lapse')c.owner.timeLapseFps=null;renderGroups();}}invalidate();};
      custom.oninput=()=>{if(key==='channelCount')c.owner.channelCount=Number(custom.value);else c.owner[key==='quality'?'qualityLabel':'parkingModeLabel']=custom.value.trim();invalidate();};
    }
    const firmLabel=element('label','Firmware (optional)',form);const firm=element('input','',firmLabel);firm.maxLength=32;firm.value=c.owner.firmware||'';firm.oninput=()=>{c.owner.firmware=firm.value;invalidate();};
    const customLapseLabel=element('label','',form);customLapseLabel.hidden=c.owner.parkingMode!=='other';const customLapse=element('input','',customLapseLabel);customLapse.type='checkbox';customLapse.checked=c.owner.parkingMode==='other'&&c.owner.timeLapseFps!=null;element('span','This custom parking mode records time-lapse',customLapseLabel);
    const rateLabel=element('label','Time-lapse frame rate',form);const rate=element('select','',rateLabel);rate.setAttribute('data-frame-rate','true');addFrameRates(rate,c.owner.timeLapseFps?.toString()||'');rateLabel.hidden=c.owner.parkingMode!=='time-lapse'&&!customLapse.checked;rate.onchange=()=>{c.owner.timeLapseFps=rate.value?Number(rate.value):null;invalidate();};customLapse.onchange=()=>{rateLabel.hidden=!customLapse.checked;if(!customLapse.checked){c.owner.timeLapseFps=null;rate.value='';}invalidate();};
    const remove=element('button','Remove setup',form);remove.onclick=()=>{cohorts=cohorts.filter(x=>x!==c);for(const [i,id] of assignments)if(id===c.id)assignments.delete(i);invalidate();renderGroups();renderSamples();};
  }addGroup.disabled=cohorts.length>=16;setBusy(busy);};
  addGroup.onclick=()=>{ownerEdited=true;const id=String(Array.from({length:16},(_,i)=>i+1).find(i=>!cohorts.some(c=>c.id===String(i)))||16);const first=cohorts.length===0;cohorts.push({id,evidenceIndices:[],folderIndices:[],owner:first?{channelCount:choices.channelCount.value==='Other'?Number(customChannels.value):Number(choices.channelCount.value)||0,firmware:fields.firmware.value,quality:choices.quality.value,qualityLabel:selectedLabel('quality'),parkingMode:choices.parkingMode.value,parkingModeLabel:selectedLabel('parkingMode'),timeLapseFps:!cadenceLabel.hidden&&cadence.value?Number(cadence.value):null}:{channelCount:0,quality:'unknown',parkingMode:'unknown'}});invalidate();renderGroups();renderSamples();};
  const optionalPreview=element('details');optionalPreview.hidden=true;element('summary','Optional: report preview and local copies',optionalPreview);
  const prepare=element('button','Preview report',optionalPreview);prepare.disabled=true;
  const reviewPanel=element('section','',optionalPreview);reviewPanel.hidden=true;element('h2','Your report',reviewPanel);const humanReview=element('div','',reviewPanel);const submissionStatus=element('p','',reviewPanel);
  const technical=element('details','',reviewPanel);element('summary','Technical details — exact data for review',technical);const warning=element('p','',technical);
  element('h3','Public report — aggregate JSON',technical);const publicView=element('pre','',technical);publicView.tabIndex=0;
  element('h3','Detailed local measurements — paired evidence JSON',technical);const pairedView=element('pre','',technical);pairedView.tabIndex=0;
  element('h3','Private submission — exact outgoing JSON',technical);const privateView=element('pre','',technical);privateView.tabIndex=0;
  const hashView=element('p','',technical);
  const more=element('details','',reviewPanel);element('summary','More options',more);element('p','Keep a local copy or share manually if online submission is unavailable. Saved reports do not submit or publish anything. Choose a new file outside your card; existing files are never overwritten. Your saved DashCamTalk username is excluded.',more);
  const exports=element('div','',more);exports.className='actions';const publicExport=element('button','Save report to file…',exports);const privateExport=element('button','Save detailed measurements…',exports);
  const submission=element('div');submission.hidden=true;
  const disclosure=element('p','Submit sends metadata only to Vortex Radar for research review. No footage is uploaded.',submission);disclosure.className='submission-disclosure';
  const submitActions=element('div','',submission);submitActions.className='submission-actions';
  const submit=element('button','Submit',submitActions);submit.disabled=true;
  const submitResult=element('p','',submitActions);submitResult.setAttribute('role','status');submitResult.setAttribute('aria-live','polite');submitResult.setAttribute('aria-atomic','true');
  const updateSection=element('section');element('h2','App updates',updateSection);element('p','Check for the latest official app release.',updateSection);
  const runningVersion=element('p','Running version: loading…',updateSection);const updateActions=element('div','',updateSection);updateActions.className='actions';const updateAction=element('button','Check for updates',updateActions);const updateProgress=element('progress','',updateSection);updateProgress.hidden=true;updateProgress.setAttribute('aria-label','Update download progress');
  const updateStatus=element('p','',updateSection);updateStatus.setAttribute('role','status');settingsPanel.append(updateSection,closeSettings);for(const child of Array.from(root.children)){if(child!==sidebar&&child!==settingsPanel&&child!==mainScreen)mainScreen.append(child);}mainScreen.append(intro);
  const updateBanner=element('section','',mainScreen);updateBanner.className='update-banner';updateBanner.hidden=true;updateBanner.setAttribute('aria-label','App update');mainScreen.prepend(updateBanner);
  const bannerStatus=element('p','',updateBanner);bannerStatus.setAttribute('role','status');const bannerActions=element('div','',updateBanner);bannerActions.className='actions';const bannerAction=element('button','Update',bannerActions);const bannerProgress=element('progress','',updateBanner);bannerProgress.setAttribute('aria-label','Update download progress');bannerProgress.hidden=true;
  let startupCheckPending=true;
  let review:Review|null=null;let report:Report|null=null;let busy=false;let version:string|null=null;
  let revision=0;let submitting=false;
  const submittedHashes=new Set<string>();const submittedSnapshots=new Set<string>();
  type UpdateState='idle'|'checking'|'available'|'downloading'|'installing'|'installed'|'current'|'error';
  let updateState:UpdateState='idle';let restartPending=false;let submittedReport=false;
  const updateWorking=()=>['checking','downloading','installing'].includes(updateState)||restartPending;
  const renderUpdate=()=>{
    updateAction.textContent=restartPending?'Restarting…':({idle:'Check for updates',checking:'Checking…',available:`Update to ${version}`,downloading:'Downloading…',installing:'Installing…',installed:'Restart to finish update',current:'Check for updates',error:'Retry update check'}[updateState]);
    updateAction.classList.toggle('primary',updateState==='available'||updateState==='installed');updateAction.dataset.state=updateState;
    updateProgress.hidden=updateState!=='downloading';updateSection.setAttribute('aria-busy',String(updateWorking()));
    // Both surfaces reflect the same state and invoke the same action handler.
    updateBanner.hidden=['idle','current'].includes(updateState);bannerStatus.textContent=updateStatus.textContent;
    bannerAction.textContent=updateState==='available'?'Update':updateAction.textContent;bannerAction.dataset.state=updateState;
    bannerAction.classList.toggle('primary',updateState==='available'||updateState==='installed');
    bannerProgress.hidden=updateProgress.hidden;bannerProgress.max=updateProgress.max;
    if(updateProgress.hasAttribute('value'))bannerProgress.value=updateProgress.value;else bannerProgress.removeAttribute('value');
    updateBanner.setAttribute('aria-busy',String(updateWorking()));setBusy(busy);
  };
  void bridge.invoke<string>('app_version').then(value=>{runningVersion.textContent=typeof value==='string'&&value?`Running version: ${value}`:'Running version unavailable.';}).catch(()=>{runningVersion.textContent='Running version unavailable.';});
  const invalidate=()=>{revision++;submittedReport=!!report&&submittedSnapshots.has(currentSnapshot());review=null;submitResult.textContent=submittedReport?'Report submitted. Thank you!':'';reviewPanel.hidden=true;if(updateState==='installed')renderUpdate();else setBusy(busy);};
  username.oninput=()=>{preferences.username=username.value;invalidate();settingsStatus.textContent=saveSettings(preferences)?'Username saved locally.':'Unable to save preferences on this computer.';};
  Object.values(fields).forEach(f=>f.addEventListener('input',invalidate));Object.values(choices).forEach(f=>f.addEventListener('change',invalidate));cadence.addEventListener('change',invalidate);
  const setBusy=(value:boolean)=>{busy=value;value=value||submitting||updateWorking();labels.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select').forEach(e=>e.disabled=value);groupPanel.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('input,select,button').forEach(e=>e.disabled=value);addGroup.disabled=value||cohorts.length>=16;username.disabled=value;select.disabled=value;scan.disabled=value || source.dataset.selected!=='yes';cancel.disabled=!scanActive||submitting;prepare.disabled=value || !report || report.cancelled || report.scannedFiles===0;Object.entries(fields).forEach(([k,f])=>f.disabled=value||(cohorts.length>0&&!['manufacturer','model'].includes(k)));Object.values(choices).forEach(f=>f.disabled=value||cohorts.length>0);cadence.disabled=value||cohorts.length>0;publicExport.disabled=value;privateExport.disabled=value;submit.disabled=value||submittedReport||!report||report.cancelled||report.scannedFiles===0||review?.submissionAvailable===false;submit.textContent=submitting?'Sending…':submittedReport?'Submitted ✓':'Submit';updateAction.disabled=value;bannerAction.disabled=updateAction.disabled;};
  const showHumanReview=()=>{humanReview.replaceChildren();element('h3',`${fields.manufacturer.value||'Unknown manufacturer'} ${fields.model.value||'Unknown model'}`,humanReview);element('p',`${report?.scannedFiles??0} files in ${report?.folders.length??0} folders. ${report?.reviewSamples?.length??report?.sampledFiles??0} bounded video samples; this does not establish coverage of every recording or configuration.`,humanReview);
    for(const c of cohorts){element('h3',`Setup ${c.id} · ${c.owner.channelCount?c.owner.channelCount+' channels':'channel count unknown'}`,humanReview);element('p',`Owner-reported: firmware ${c.owner.firmware||'unknown'} · quality ${c.owner.qualityLabel||c.owner.quality||'unknown'} · parking ${c.owner.parkingModeLabel||c.owner.parkingMode||'unknown'} · capture cadence ${c.owner.timeLapseFps??'unknown'} fps. Samples: ${(report?.reviewSamples||[]).filter(s=>assignments.get(s.index)===c.id).map(s=>s.index+1).join(', ')||'none'}.`,humanReview);}
    if(!cohorts.length)element('p',`Owner-reported: ${choices.channelCount.value} channels · quality ${choices.quality.selectedOptions[0]?.textContent} · parking ${choices.parkingMode.selectedOptions[0]?.textContent}. These settings are not verified across every recording.`,humanReview);
    const rounded=(n:number|null|undefined,digits=1)=>typeof n==='number'&&Number.isFinite(n)?Number(n.toFixed(digits)).toLocaleString():'unknown';
    const samplesDetail=element('details','',humanReview);element('summary','Sample measurements',samplesDetail);
    element('p','Parking mode above is owner-reported context, not a measured recording mode. Sample mode and channel hints below come only from native recording evidence.',samplesDetail);
    const measured=element('ul','',samplesDetail);for(const s of report?.reviewSamples||[]){const v=s.video;const ownerParking=cohorts.length?cohorts.find(c=>c.id===assignments.get(s.index))?.owner.parkingModeLabel:selectedLabel('parkingMode');element('li',`Sample ${s.index+1}: ${s.folder} · ${rounded(s.sizeBytes??v?.fileSizeBytes,0)} bytes / ${rounded(v?.durationSeconds)} seconds · ${v?`${v.codec} ${v.width}×${v.height}, ${rounded(v.nominalFrameRate,2)} playback fps, ${rounded(v.videoBitrate==null?null:v.videoBitrate/1_000_000,2)} Mbps video bitrate`:'measurements unavailable'}. Recording mode: ${s.modeHint||'unknown'} · Channel role: ${s.roleHint||'unknown'}. Owner-reported parking setting: ${ownerParking||'not provided'}.`,measured);}
    element('p',username.value.trim()?`Contributor: ${username.value.trim()}`:'No DashCamTalk username included.',humanReview);
    submissionStatus.textContent=submittedReport?'Report submitted. Thank you!':review?.submissionAvailable===false?'Online submission is currently unavailable: it is not enabled in this build. You can still review your report. More options lets you keep a local copy or share manually.':!review?.submissionJson?'This report is not ready for online submission. Confirm your camera settings; unknown data can remain in your local report. See Technical details for any other limits.':'Ready to submit. Technical details and local copies are optional.';
  };
  const run=async(fn:()=>Promise<void>)=>{if(busy||submitting||updateWorking())return;setBusy(true);try{await fn();}catch{(settingsPanel.hidden?status:settingsStatus).textContent='Unable to complete this action. Please try again.';}finally{setBusy(false);}};
  let ownerEdited=false;labels.addEventListener('input',()=>ownerEdited=true);labels.addEventListener('change',()=>ownerEdited=true);
  // Choosing a source is replacement, even at the same mount path. Rescan alone retains owner intent.
  const resetSource=()=>{channelOwnerEdited=false;suggestedChannels=false;suggestedSetup=false;invalidate();report=null;ownerEdited=false;cohorts=[];assignments.clear();for(const field of Object.values(fields))field.value='';for(const input of [customChannels,customQuality,customParking,cadence])input.value='';otherTimelapse.checked=false;choices.channelCount.value='Select count';choices.quality.value='unknown';choices.parkingMode.value='unknown';manufacturerPick.value='';refreshBrand();refreshModels();labels.hidden=true;recognitionNote.hidden=true;recognitionNote.textContent='';groupPanel.hidden=true;optionalPreview.hidden=true;submission.hidden=true;groupPanel.open=false;sampleDetails.open=false;summary.textContent='';humanReview.replaceChildren();publicView.textContent='';privateView.textContent='';pairedView.textContent='';hashView.textContent='';warning.textContent='';technical.open=false;more.open=false;renderGroups();renderSamples();};
  const scanSource=async()=>{invalidate();report=null;submittedReport=false;assignments.clear();renderSamples();setScanLoading(true);status.textContent='Scanning card…';try{const result=await bridge.invoke<Report>('scan_source');report=result;const recognition=result.cameraRecognition;const suggestions=(recognition?.candidates||[]).map(c=>c.model).filter(Boolean);recognitionNote.hidden=!recognition;recognitionNote.textContent=recognition?.model?`Detected ${recognition.manufacturer||''} ${recognition.model}. Confirm the suggestion below.`:suggestions.length?`These card patterns are shared by ${suggestions.join(', ')}. Choose your model below; the files do not uniquely identify it.`:recognition?.reason||'';labels.hidden=false;groupPanel.hidden=false;optionalPreview.hidden=false;submission.hidden=false;if(!ownerEdited&&result.cameraRecognition){const c=result.cameraRecognition;for(const k of ['manufacturer','model','channelSetup'] as const)if(c[k])fields[k].value=c[k]!;if(c.channelCount){choices.channelCount.value=c.channelCount<=5?String(c.channelCount):'Other';customChannels.value=String(c.channelCount);}refreshBrand();refreshManufacturers();refreshModels();if(!c.channelCount&&c.model)suggestSingleChannel(catalog.find(camera=>camera.id===modelPick.value));}renderGroups();renderSamples();const messages=describeScan(result,cohorts.length>0);summary.textContent=messages.summary;status.textContent=messages.status;}finally{setScanLoading(false);}};
  select.onclick=()=>run(async()=>{const path=await bridge.invoke<string|null>('choose_source');if(path){resetSource();source.textContent=path;source.dataset.selected='yes';await scanSource();}});
  scan.onclick=()=>run(scanSource);
  cancel.onclick=()=>{scanCancelling=true;void bridge.invoke('cancel_scan').catch(()=>{status.textContent='Unable to cancel yet. Please try again.';scanCancelling=false;});status.textContent='Cancelling scan… Waiting for the current file.';};
  const outgoing=()=>{const values={settings:'',...Object.fromEntries(Object.entries(fields).map(([key,f])=>[key,f.value])),channelCount:choices.channelCount.value==='Other'?Number(customChannels.value):choices.channelCount.value==='Select count'?0:Number(choices.channelCount.value),quality:qualityCategory(choices.quality.value),qualityLabel:selectedLabel('quality'),parkingMode:choices.parkingMode.value,parkingModeLabel:selectedLabel('parkingMode'),timeLapseFps:!cadenceLabel.hidden&&cadence.value?Number(cadence.value):null};const groups=cohorts.map(c=>({...c,owner:{...c.owner,quality:qualityCategory(c.owner.quality||'unknown')},evidenceIndices:(report?.reviewSamples||[]).filter(s=>assignments.get(s.index)===c.id).map(s=>s.index),folderIndices:[...new Set((report?.reviewSamples||[]).filter(s=>assignments.get(s.index)===c.id).map(s=>s.folderIndex))]})); return {labels:values,annotations:{cohorts:groups,assignmentsRequired:cohorts.length>0,contributor:username.value.trim()?{dashcamTalkUsername:username.value.trim()}:null}};};
  const prepareCurrent=async()=>{if(cohorts.some(c=>(c.owner.quality==='other'&&!c.owner.qualityLabel?.trim())||(c.owner.parkingMode==='other'&&!c.owner.parkingModeLabel?.trim()))){status.textContent='Describe each Other setting before submitting.';if(submitting)submitResult.textContent=status.textContent;return null;}if(!cohorts.length&&((choices.quality.value==='other'&&!customQuality.value.trim())||(choices.parkingMode.value==='other'&&!customParking.value.trim()))){status.textContent='Describe the Other setting before submitting.';if(submitting)submitResult.textContent=status.textContent;return null;}
    const currentRevision=revision;const payload=outgoing();const snapshot=JSON.stringify(payload);
    const prepared=await bridge.invoke<Review>('prepare_review',payload);
    if(currentRevision!==revision||snapshot!==JSON.stringify(outgoing()))return null;
    review=prepared;submittedReport=submittedHashes.has(review.payloadHash);publicView.textContent=review.publicJson;privateView.textContent=review.submissionJson||'No valid bounded intake envelope. See warning; local exports remain available.';pairedView.textContent=review.privateJson;hashView.textContent='Payload SHA-256: '+review.payloadHash;warning.textContent=review.warning;showHumanReview();reviewPanel.hidden=false;
    submittedReport=submittedHashes.has(review.payloadHash);if(submittedReport)submitResult.textContent='Report submitted. Thank you!';else if(!submitting)submitResult.textContent='';
    return {token:review.token,snapshot,hash:review.payloadHash,revision:currentRevision};
  };
  prepare.onclick=()=>{void run(async()=>{if(await prepareCurrent())status.textContent='Report preview ready. Nothing has been sent.';});};
  for(const [button,kind] of [[publicExport,'public'],[privateExport,'private']] as const)button.onclick=()=>run(async()=>{if(!review)return;const saved=await bridge.invoke<boolean>('export_review',{token:review.token,kind});status.textContent=saved?'Export saved outside source. Nothing submitted.':'Export cancelled.';});
  // Keep submission history in memory only; the native payload hash is authoritative.
  const currentSnapshot=()=>JSON.stringify({report,payload:outgoing()});
  submit.onclick=()=>{if(submitting||submittedReport)return;void run(async()=>{
    submitting=true;submitResult.textContent='Sending…';setBusy(true);
    let submissionPhase:'prepare'|'submit'='prepare';
    try{
      const prepared=await prepareCurrent();if(!prepared||!review){if(!submitResult.textContent||submitResult.textContent==='Sending…')submitResult.textContent='Report changed or needs attention. Confirm your settings and click Submit again.';return;}
      if(submittedHashes.has(prepared.hash)){submittedReport=true;submitResult.textContent='Report submitted. Thank you!';return;}
      if(review.submissionAvailable===false||!review.submissionJson){submitResult.textContent=submissionStatus.textContent;return;}
      if(!/^[a-f0-9]{64}$/.test(prepared.hash))throw Error('Invalid prepared report');
      const snapshot=currentSnapshot();
      submissionPhase='submit';
      const receipt=await bridge.invoke<string>('submit_review',{token:prepared.token,consent:true});
      if(typeof receipt!=='string'||receipt!==prepared.hash)throw Error('Invalid receipt');
      submittedHashes.add(prepared.hash);submittedSnapshots.add(snapshot);
      if(prepared.revision!==revision||prepared.snapshot!==JSON.stringify(outgoing())){submitResult.textContent='Previous report submitted. Current settings have changed; click Submit to send an updated report.';return;}
      submittedReport=true;submitResult.textContent='Report submitted. Thank you!';submissionStatus.textContent=submitResult.textContent;
    }catch(error){submitResult.textContent=submissionErrorMessage(error,submissionPhase);}
    finally{submitting=false;setBusy(busy);}
  });};
  const checkForUpdate=async()=>{
    if(busy||submitting||updateWorking()||updateState==='installed')return;
    startupCheckPending=false;version=null;updateState='checking';updateStatus.textContent='Checking for updates…';renderUpdate();
    try{await updateProgressReady;version=await bridge.invoke<string|null>('check_update');updateState=version?'available':'current';updateStatus.textContent=version?`Version ${version} is available. Update installs and restarts automatically; any unsent report will be cleared.`:'No update available.';}
    catch(e){version=null;updateState='error';updateStatus.textContent=`Unable to check for updates: ${String(e)}. Retry when ready.`;}
    renderUpdate();
  };
  const performUpdate=async()=>{
    if(busy||submitting||updateWorking())return;
    if(updateState==='installed'){
      restartPending=true;updateStatus.textContent='Restarting to finish the update…';renderUpdate();
      try{await bridge.invoke('restart_app',{consent:true});}
      catch(e){restartPending=false;updateStatus.textContent=`Version ${version} is installed, but restart failed: ${String(e)}. Try restarting again.`;renderUpdate();}
      return;
    }
    if(updateState!=='available'){await checkForUpdate();return;}
    const target=version;if(!target)return;
    updateState='downloading';updateProgress.removeAttribute('value');updateStatus.textContent=`Downloading version ${target}…`;renderUpdate();
    try{await bridge.invoke('install_update',{version:target,consent:true});updateState='installed';updateStatus.textContent=`Version ${target} installed. The running version above stays unchanged until you restart. Restart to finish the update.`;}
    catch(e){version=null;updateState='error';updateStatus.textContent=`Update failed: ${String(e)}. Retry to check for updates again.`;}
    renderUpdate();
    // One explicit Update click authorizes installation and restart, including clearing an unsent report.
    if(updateState==='installed')await performUpdate();
  };
  updateAction.onclick=performUpdate;bannerAction.onclick=performUpdate;
  const updateProgressReady=bridge.listen<{phase:string;downloaded:number;total:number|null}>('update-progress',({payload:p})=>{
    if(!['downloading','installing'].includes(updateState))return;
    if(p.phase==='downloading'&&updateState==='downloading'){
      if(Number.isFinite(p.total)&&p.total!>0&&Number.isFinite(p.downloaded)){updateProgress.max=p.total!;updateProgress.value=Math.max(0,Math.min(p.downloaded,p.total!));updateStatus.textContent=`Downloading version ${version}: ${Math.floor(updateProgress.value/updateProgress.max*100)}%`;}
      else{updateProgress.removeAttribute('value');updateStatus.textContent=`Downloading version ${version}…`;}
    }else if(p.phase==='installing'){updateState='installing';updateStatus.textContent=`Installing version ${version}…`;}
    // Only the resolved install command confirms success; ignore unknown phases.
    renderUpdate();
  });
  // Observe registration failures even when the owner closes the app before checking.
  void updateProgressReady.catch(()=>{});
  const startupCheck=()=>{
    if(!root.isConnected||!startupCheckPending)return;
    // A source picker/scan wins the startup race. Do not lose the check.
    if(busy||submitting||polling||updateWorking()){window.setTimeout(startupCheck,250);return;}
    void checkForUpdate();
  };
  window.setTimeout(startupCheck,500);
  for(const button of [select,submit])button.classList.add('primary');
  void bridge.listen<{phase:string;entries:number;files:number;probed:number}>('scan-progress',({payload:p})=>{if(!scanActive||scanCancelling)return;if(/camera|model/i.test(p.phase)){if(status.textContent!=='Identifying your camera…')status.textContent='Identifying your camera…';if(!scanModelReading){scanModelReading=true;scanLoadingNote.textContent='Camera settings will appear when this finishes. The first scan may take about a minute.';}}else{const message=Number.isFinite(p.files)&&p.files>0?`Scanning card… ${p.files.toLocaleString()} files found.`:'Scanning card…';if(status.textContent!==message)status.textContent=message;}}).catch(e=>status.textContent=`Progress unavailable: ${String(e)}`);
  let knownCards=new Set<string>();let discoveryReady=false;let polling=false;
  const discover=async()=>{if(polling||busy||updateWorking()||document.hidden||!root.isConnected)return;polling=true;try{const result=await bridge.invoke<{id:string;label:string;path:string}[]>('discover_cards');const cards=Array.isArray(result)?result:[];const added=cards.filter(c=>!knownCards.has(c.id));knownCards=new Set(cards.map(c=>c.id));if((discoveryReady?added:cards).length===1&&!report&&!ownerEdited&&!review&&source.dataset.selected!=='yes'&&!busy&&!mainScreen.hidden){await run(async()=>{const path=await bridge.invoke<string>('select_discovered_card',{id:added[0].id});resetSource();source.textContent=path;source.dataset.selected='yes';await scanSource();});}discoveryReady=true;}catch{}finally{polling=false;}};
  void discover();const poll=window.setInterval(()=>{if(!root.isConnected)window.clearInterval(poll);else void discover();},4000);
  return {fields,status,scanLoading,scanProgress,scanLoadingNote,scanElapsed,source,choices,scan,prepare,select,submit,publicView,privateView,reviewPanel,cancel,theme,username,manufacturerPick,modelPick,scannerButton,settingsButton,settingsPanel,updateAction,updateStatus,updateProgress,runningVersion,updateBanner,bannerAction,bannerStatus,bannerProgress,addGroup,sampleList,groupForms,humanReview,submissionStatus,submitResult,technical,more,submission};
}
