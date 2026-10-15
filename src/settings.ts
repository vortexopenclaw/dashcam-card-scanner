// SPDX-License-Identifier: AGPL-3.0-only
export type Theme='system'|'light'|'dark';
export type Settings={theme:Theme;username:string};
const key='dashcam-card-scanner.settings.v1';
export function loadSettings(storage?:Storage):Settings {
  try {const value=JSON.parse((storage??localStorage).getItem(key)||'{}');return {theme:['system','light','dark'].includes(value.theme)?value.theme:'system',username:typeof value.username==='string'?value.username.slice(0,40):''};} catch {return {theme:'system',username:''};}
}
export function saveSettings(value:Settings,storage?:Storage){try{(storage??localStorage).setItem(key,JSON.stringify({theme:value.theme,username:value.username}));return true;}catch{return false;}}
export function followTheme(theme:Theme,doc:HTMLElement=document.documentElement,media=window.matchMedia?.('(prefers-color-scheme: dark)')) {
  const apply=()=>{doc.dataset.theme=theme==='system'?(media?.matches?'dark':'light'):theme;doc.style.colorScheme=doc.dataset.theme;};
  apply();media?.addEventListener('change',apply);return ()=>media?.removeEventListener('change',apply);
}
