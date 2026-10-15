// SPDX-License-Identifier: AGPL-3.0-only
export type SettingOption = {value:string;label:string};
export type BrandOptions = {quality:SettingOption[];parking:SettingOption[]};

/**
 * Editable owner-report suggestions, NOT a model capability catalogue or detected
 * settings. Check the camera/firmware; not every model supports every suggestion.
 * Values are submission categories; labels preserve manufacturer terminology.
 * Callers should retain the chosen/custom label in qualityLabel/parkingModeLabel;
 * Other opens custom text, and Unknown must remain available. Nothing here sets
 * hardware settings or infers a setting from a measured video bitrate.
 *
 * Official sources consulted 2026-10-15:
 * Vantrue N4 Pro S English manual V1.7, Parking Mode / Record Setup:
 * https://vantrue-app.vantruecam.com/files/manuals/n4pros/Vantrue%20N4%20Pro%20S%20User%20Manual%20English.pdf
 * Motion Detection is buffered; Collision Detection has Quick Start/Power-Saving
 * variants, so its broad category is impact (not universally low-power-impact).
 * Low Frame Rate Recording maps to time-lapse, not a normal-driving frame rate.
 * Standard/PlatePix picture modes are not verified bitrate-quality tiers: keep
 * generic quality suggestions instead of inventing Vantrue bitrate settings.
 * VIOFO Auto Event Detection, Time-lapse and Low bitrate:
 * https://support.viofo.com/support/solutions/articles/19000109185-what-is-auto-event-detection-what-parking-mode-to-choose-
 * https://support.viofo.com/support/solutions/articles/19000109184-advanced-buffered-parking-mode
 * Auto Event Detection maps to buffered, not motion-only. Impact/G-sensor
 * behavior varies by model/firmware (the FAQ notes impact locking while recording);
 * do not promise independent impact wake-up or buffering on every VIOFO model.
 * Thinkware Motion Detection (motion + impact), TimeLapse, Energy Saving Mode:
 * https://support.thinkware.com/hc/en-us/articles/13991138264979-Selecting-a-Parking-Mode
 * RADAR Parking Mode is documented for U3000 / U3000 PRO, not all Thinkwares:
 * https://support.thinkware.com/hc/en-us/articles/21305282643859-RADAR-Parking-Mode
 * BlackVue DR970X-series manual, Video quality / Parking mode recording:
 * https://manual.blackvue.com/docs/dr970x/changing-settings/changing-settings-using-your-smartphone-android-ios-dr970x-series/
 * Highest (Extreme) is distinct from Highest; never collapse extreme to maximum.
 * Generic quality options for other brands are categories, NOT verified menus.
 */
const option = (value:string,label:string):SettingOption => ({value,label});
const unknown = () => option('unknown','Unknown');
const other = () => option('other','Other');
const genericQuality = ():SettingOption[] => [
 unknown(),option('low','Low'),option('normal','Normal'),option('medium','Medium'),
 option('high','High'),option('maximum','Maximum'),option('extreme','Extreme'),other(),
];
const genericParking = ():SettingOption[] => [
 option('buffered','Buffered'),option('time-lapse','Time-Lapse'),
 option('low-bitrate','Low-Bitrate'),option('motion','Motion Detection'),
 option('impact','Impact Detection'),option('low-power-impact','Low-Power Impact Detection'),
 option('radar','Radar Parking'),
];

/** Case-insensitive exact brand aliases only; arbitrary/typeable brands fall back. */
export function brandOptions(manufacturer:string):BrandOptions {
 const brand=manufacturer.trim().toLowerCase();
 let quality=genericQuality();
 let parking:SettingOption[];
 switch(brand){
  case 'viofo':
   parking=[option('buffered','Auto Event Detection'),option('time-lapse','Time-Lapse'),option('low-bitrate','Low Bitrate')];
   break;
  case 'vantrue':
   parking=[option('motion','Motion Detection'),option('impact','Collision Detection'),option('low-bitrate','Low-Bitrate Recording'),option('time-lapse','Low Frame Rate Recording')];
   break;
  case 'thinkware':
   parking=[option('motion','Motion Detection'),option('time-lapse','TimeLapse'),option('low-power-impact','Energy Saving Mode'),option('radar','RADAR Parking Mode')];
   break;
  case 'blackvue':
  case 'blackview': // Explicit voice-transcription alias; never displayed as a brand name.
   quality=[unknown(),option('normal','Normal'),option('high','High'),option('maximum','Highest'),option('extreme','Highest (Extreme)'),other()];
   parking=[option('buffered','Motion & Impact Detection'),option('time-lapse','Time Lapse')];
   break;
  default:
   parking=genericParking();
 }
 // Fresh arrays and objects on every call: editing one cohort cannot change another.
 return {quality,parking:[unknown(),option('off','Off'),...parking,other()]};
}
