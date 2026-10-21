// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {mount} from '../src/ui';
for(const [platform,radius,height] of [['macos','6px','28px'],['windows','4px','30px'],['linux','6px','32px']]){
 test(`${platform} controls are compact with wrapping, spaced action rows in both themes`,()=>{
  const previousPlatform=document.documentElement.dataset.platform;
  const previousTheme=document.documentElement.dataset.theme;
  document.body.replaceChildren();const style=document.createElement('style');style.textContent=readFileSync('src/style.css','utf8');document.head.append(style);
  const root=document.createElement('main');document.body.append(root);
  try{
   const ui=mount(root,{invoke:async()=>null,listen:async()=>()=>{}});
   // Mount detects the host OS. Exercise each CSS variant explicitly on every runner.
   document.documentElement.dataset.platform=platform;
   for(const theme of ['light','dark']){
    document.documentElement.dataset.theme=theme;const button=getComputedStyle(ui.scan);
    expect(button.fontSize).toBe('13px');expect(button.fontWeight).toBe('500');expect(button.borderRadius).toBe(radius);expect(button.minHeight).toBe(height);
    const row=getComputedStyle(ui.updateAction.parentElement);expect(row.display).toBe('flex');expect(row.gap).toBe('10px');expect(row.flexWrap).toBe('wrap');
    ui.updateBanner.hidden=false;const bannerButton=getComputedStyle(ui.bannerAction);expect(bannerButton.borderRadius).toBe(radius);expect(bannerButton.minHeight).toBe(height);const bannerRow=getComputedStyle(ui.bannerAction.parentElement);expect(bannerRow.display).toBe('flex');expect(bannerRow.gap).toBe('10px');expect(bannerRow.flexWrap).toBe('wrap');
   }
  }finally{
   style.remove();root.remove();
   if(previousPlatform===undefined)delete document.documentElement.dataset.platform;else document.documentElement.dataset.platform=previousPlatform;
   if(previousTheme===undefined)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=previousTheme;
  }
 });
}
