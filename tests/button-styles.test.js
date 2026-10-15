// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {mount} from '../src/ui';
test('Mac-style controls are compact with wrapping, spaced action rows in both themes',()=>{
 document.body.replaceChildren();const style=document.createElement('style');style.textContent=readFileSync('src/style.css','utf8');document.head.append(style);
 const root=document.createElement('main');document.body.append(root);
 try{const ui=mount(root,{invoke:async()=>null,listen:async()=>()=>{}});for(const theme of ['light','dark']){document.documentElement.dataset.theme=theme;const button=getComputedStyle(ui.scan);expect(button.fontSize).toBe('13px');expect(button.fontWeight).toBe('500');expect(button.borderRadius).toBe('6px');expect(button.minHeight).toBe('28px');const row=getComputedStyle(ui.updateAction.parentElement);expect(row.display).toBe('flex');expect(row.gap).toBe('10px');expect(row.flexWrap).toBe('wrap');}}finally{style.remove();root.remove();}
});
