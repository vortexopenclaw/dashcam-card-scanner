import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
test('Windows installer includes offline webview runtime rather than fetching prerequisites on the tester PC',()=>{
  expect(config.bundle.windows.webviewInstallMode).toEqual({type:'offlineInstaller',silent:true});
});
test('media inspection does not ship or invoke ffprobe or ffmpeg executables',()=>{
  const video=readFileSync(new URL('../src-tauri/src/video.rs',import.meta.url),'utf8');
  expect(video).not.toMatch(/Command::new\s*\(\s*"(?:ffprobe|ffmpeg)"/);
  expect(config.bundle.externalBin??[]).not.toEqual(expect.arrayContaining([expect.stringMatching(/ffprobe|ffmpeg/i)]));
});
