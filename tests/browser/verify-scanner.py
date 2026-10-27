#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Render the actual mount with an isolated synthetic bridge; never invoke native IPC.
Start `npm run dev -- --port 4177 --strictPort`, then run this with Playwright,
Pillow and Chrome installed: python3 tests/browser/verify-scanner.py OUTPUT_DIRECTORY.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
results = []
def capture(page, name):
    # Capture in a tall viewport: Chrome's beyond-viewport tiling can repeat
    # composited content after a resize. Width stays fixed; below-fold content
    # is shown explicitly, not claimed to fit a normal-height window.
    previous = page.viewport_size
    height = max(previous['height'], page.evaluate('document.documentElement.scrollHeight'))
    page.set_viewport_size({'width': previous['width'], 'height': height + 128})
    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    page.wait_for_timeout(150)
    page.screenshot(path=str(out / name), full_page=False)
    # Detect Chrome capture corruption instead of accepting repeated fixture chrome.
    from PIL import Image
    image = Image.open(out / name).convert('RGB')
    yellow_rows = [y for y in range(image.height) if image.getpixel((0, y)) == (255, 227, 166)]
    assert not yellow_rows or max(yellow_rows) < 64, f'Repeated fixture banner in {name}'
    page.set_viewport_size(previous)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    for platform in ['macos', 'windows', 'linux']:
        for theme in ['light', 'dark']:
            page = browser.new_page(viewport={'width': 1180, 'height': 960}, color_scheme=theme)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1:4177/') else route.abort())
            page.goto('http://127.0.0.1:4177/tests/browser/scanner.html')
            page.wait_for_function('!!window.fixture')
            page.evaluate('(platform)=>document.documentElement.dataset.platform=platform', platform)
            page.wait_for_function('!fixture.ui.select.disabled')
            assert page.evaluate('fixture.ui.select.classList.contains("primary")')
            if platform == 'macos':
                capture(page, f'{platform}-{theme}-initial.png')
            page.evaluate('fixture.ui.select.click()')
            page.wait_for_function('!fixture.ui.submit.disabled')
            assert not page.evaluate('fixture.ui.select.classList.contains("primary")')
            assert page.evaluate('fixture.ui.submit.classList.contains("primary")')
            assert page.locator('h1').inner_text() == 'About your camera'
            assert 'You can edit it.' in page.locator('.suggestion-note').first.inner_text()
            assert not page.evaluate('fixture.calls.some(c=>c.cmd==="submit_review")')
            for width in [1180, 960, 959, 800, 760, 390]:
                page.set_viewport_size({'width': width, 'height': 960})
                dimensions = page.evaluate('''()=>{
                  const u=fixture.ui, rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}, style=e=>getComputedStyle(e);
                  return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,manufacturer:rect(u.manufacturerPick),model:rect(u.modelPick),count:rect(u.choices.channelCount),setup:rect(u.fields.channelSetup),scannerNav:rect(u.scannerButton),settingsNav:rect(u.settingsButton),navMargins:[style(u.scannerButton).marginLeft,style(u.settingsButton).marginLeft],radius:style(u.scan).borderRadius,theme:document.documentElement.dataset.theme,platform:document.documentElement.dataset.platform,submit:rect(u.submit),emptyStatus:{height:rect(u.submitResult).height,padding:style(u.submitResult).padding,border:style(u.submitResult).borderWidth},grid:style(document.querySelector('.camera-grid')).gridTemplateColumns};
                }''')
                assert dimensions['scrollWidth'] <= width, dimensions
                assert dimensions['theme'] == theme
                assert dimensions['platform'] == platform
                assert dimensions['radius'] == ('4px' if platform == 'windows' else '6px')
                assert dimensions['navMargins'] == ['0px', '0px']
                assert abs(dimensions['scannerNav']['width'] - dimensions['settingsNav']['width']) < 1
                assert dimensions['emptyStatus']['height'] == 0
                if width >= 960:
                    assert abs(dimensions['manufacturer']['y'] - dimensions['model']['y']) < 1
                    assert dimensions['model']['x'] > dimensions['manufacturer']['x']
                    assert abs(dimensions['count']['y'] - dimensions['setup']['y']) < 1
                else:
                    assert dimensions['model']['y'] > dimensions['manufacturer']['y']
                    assert abs(dimensions['model']['x'] - dimensions['manufacturer']['x']) < 1
                if width in [1180, 390]:
                    label = 'desktop' if width == 1180 else 'narrow'
                    capture(page, f'{platform}-{theme}-{label}.png')
                results.append(dimensions)
            page.set_viewport_size({'width': 1180, 'height': 960})
            # Focus remains visible, and settings navigation leaves mounted controls/draft intact.
            page.evaluate('fixture.ui.fields.firmware.value="Synthetic owner draft";fixture.ui.fields.firmware.dispatchEvent(new Event("input",{bubbles:true}))')
            page.locator('.context-help summary').click()
            page.evaluate('window.savedModel=fixture.ui.modelPick;fixture.ui.settingsButton.click()')
            page.wait_for_function('!fixture.ui.updateAction.disabled')
            if platform == 'macos':
                capture(page, f'{platform}-{theme}-settings.png')
            page.evaluate('fixture.ui.scannerButton.click()')
            assert page.evaluate('fixture.ui.modelPick===savedModel && fixture.ui.fields.firmware.value==="Synthetic owner draft" && document.querySelector(".context-help").open')
            page.locator('.context-help summary').click()
            page.evaluate('fixture.ui.select.focus()')
            page.keyboard.press('Tab')
            assert page.evaluate('getComputedStyle(document.activeElement).outlineStyle') != 'none'
            # Synthetic busy/cancel controls, authoritative result, and dedupe.
            page.evaluate('fixture.setDelay(true);fixture.ui.scan.click()')
            page.wait_for_function('!fixture.ui.cancel.hidden')
            assert page.evaluate('fixture.ui.select.disabled && fixture.ui.submit.disabled && !fixture.ui.cancel.disabled')
            if platform == 'macos':
                capture(page, f'{platform}-{theme}-busy.png')
            page.evaluate('fixture.finishScan();fixture.setDelay(false)')
            page.wait_for_function('!fixture.ui.submit.disabled')
            assert page.evaluate('fixture.ui.cancel.hidden && fixture.ui.fields.firmware.value==="Synthetic owner draft"')
            if platform == 'macos':
                page.evaluate('fixture.setOutcome("error");fixture.ui.submit.click()')
                page.wait_for_function('!fixture.ui.submit.disabled')
                assert 'Unable to confirm' in page.evaluate('fixture.ui.submitResult.textContent')
                capture(page, f'{platform}-{theme}-error.png')
            page.evaluate('fixture.setOutcome("success");fixture.ui.submit.click()')
            page.wait_for_function('fixture.ui.submit.textContent==="Submitted ✓"')
            assert page.evaluate('fixture.ui.submit.disabled && fixture.ui.submitResult.textContent==="Report submitted. Thank you!"')
            assert page.evaluate('fixture.calls.filter(c=>c.cmd==="submit_review").every(c=>c.args.consent===true)')
            if platform == 'macos':
                capture(page, f'{platform}-{theme}-submitted.png')
            before = page.evaluate('fixture.calls.filter(c=>c.cmd==="submit_review").length')
            page.evaluate('fixture.ui.submit.click();fixture.ui.settingsButton.click();fixture.ui.scannerButton.click();fixture.ui.submit.click()')
            assert page.evaluate('fixture.calls.filter(c=>c.cmd==="submit_review").length') == before
            # Mixed setup preserves its mode; source replacement restores unknown ordinary fields.
            page.evaluate('fixture.ui.addGroup.click()')
            assert page.locator('.camera-settings').is_hidden()
            page.evaluate('fixture.setRecognized(false);fixture.ui.select.click()')
            page.wait_for_function('!fixture.ui.submit.disabled')
            assert page.evaluate('fixture.ui.fields.model.value==="" && fixture.ui.choices.channelCount.value==="Select count" && fixture.ui.groupForms.children.length===0')
            assert not errors, errors
            page.close()
    browser.close()
(out / 'browser-verification.json').write_text(json.dumps(results, indent=2))
print(f'PASS: {len(results)} responsive/theme/platform combinations; actual mount, local synthetic bridge only.')
print('PASS: hierarchy, equal navigation, focus, no horizontal overflow, help/draft retention, busy controls, mixed mode, unknown replacement, explicit consent, receipt and dedupe.')
print(f'Screenshots and computed layout results: {out}')
