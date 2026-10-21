import {test,expect} from 'vitest';
import {assetNames,rewriteManifest,label} from '../scripts/name-release-assets.mjs';
test('release downloads have plain platform names while updater support remains identifiable',()=>{
 const names=assetNames('0.1.8');expect(Object.keys(names)).toHaveLength(13);expect(new Set(Object.values(names)).size).toBe(13);
 expect(names['Dashcam.Card.Scanner_0.1.8_aarch64.dmg']).toBe('Dashcam-Card-Scanner-0.1.8-Mac-Apple-Silicon.dmg');
 expect(names['Dashcam.Card.Scanner_0.1.8_x64.dmg']).toBe('Dashcam-Card-Scanner-0.1.8-Mac-Intel.dmg');
 expect(names['Dashcam.Card.Scanner_0.1.8_x64-setup.exe']).toBe('Dashcam-Card-Scanner-0.1.8-Windows-x64.exe');
 expect(label(names['Dashcam.Card.Scanner_0.1.8_amd64.AppImage'])).toBe('Linux — AppImage');
 expect(label(names['Dashcam.Card.Scanner_0.1.8_x64-setup.exe.sig'])).toContain('Automatic update support');
});
test('renaming updates immutable manifest URLs and preserves exact updater signatures',()=>{
 const names=assetNames('0.1.8'),repo='vortexopenclaw/dashcam-card-scanner';
 const manifest={version:'0.1.8',platforms:{'windows-x86_64':{url:`https://github.com/${repo}/releases/download/v0.1.8/Dashcam.Card.Scanner_0.1.8_x64-setup.exe`,signature:'unchanged-signature'}}};
 const result=rewriteManifest(manifest,repo,'v0.1.8',names);expect(result.platforms['windows-x86_64'].url.endsWith('/Dashcam-Card-Scanner-0.1.8-Windows-x64.exe')).toBe(true);expect(result.platforms['windows-x86_64'].signature).toBe('unchanged-signature');expect(manifest.platforms['windows-x86_64'].url).toContain('x64-setup.exe');
 expect(rewriteManifest(result,repo,'v0.1.8',names)).toEqual(result);
 for(const url of ['https://evil.invalid/file.exe',`https://github.com/${repo}/releases/latest/download/file.exe`,`https://github.com/${repo}/releases/download/v0.1.8/unknown.exe`])expect(()=>rewriteManifest({version:'0.1.8',platforms:{windows:{url}}},repo,'v0.1.8',names)).toThrow();
});
