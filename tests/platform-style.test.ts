// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {platformStyle} from '../src/platform-style';

afterEach(()=>{document.getElementById('platform-style-test')?.remove();document.body.replaceChildren();delete document.documentElement.dataset.platform;delete document.documentElement.dataset.theme;});

test.each([
  ['MacIntel','macos'],['Macintosh','macos'],['Darwin','macos'],
  ['Win32','windows'],['Win64','windows'],['Windows NT 10.0','windows'],
  ['Linux x86_64','linux'],['Linux aarch64','linux'],['','generic'],['FreeBSD amd64','generic'],
])('cosmetic platform hint %s maps to %s',(hint,expected)=>{expect(platformStyle(hint)).toBe(expected);});

test.each([
  ['macos','28px','6px','-apple-system'],
  ['windows','30px','4px','Segoe UI'],
  ['linux','32px','6px','Cantarell'],
])('%s uses compact platform-appropriate button geometry and system fonts',(platform,height,radius,font)=>{
  const style=document.createElement('style');style.id='platform-style-test';style.textContent=readFileSync('src/style.css','utf8');document.head.append(style);
  document.documentElement.dataset.platform=platform;const button=document.createElement('button');button.textContent='Check for updates';document.body.append(button);
  const computed=getComputedStyle(button);expect(computed.minHeight).toBe(height);expect(computed.borderRadius).toBe(radius);expect(getComputedStyle(document.documentElement).fontFamily).toContain(font);
});
