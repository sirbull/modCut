import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inputHelpers, wait } from './cdp.mjs';
import { enterDraw } from './draw-test-helpers.mjs';

export async function runWorkspaceLayoutWorkflows(client) {
  const { evaluate, command } = client;
  const { click, drag } = inputHelpers(client);
  for (let i = 0; i < 100; i++) {
    if (await evaluate("!!document.querySelector('.doc-tab.is-active')")) break;
    await wait(100);
  }
  const resize = async width => {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 880, deviceScaleFactor: 1, mobile: false });
    await wait(150);
  };
  const layout = () => evaluate(`(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width }; };
    return { wrapped:document.querySelector('.toolbar').classList.contains('toolbar--tabs-below'),
      actions:rect('.toolbar__actions'), options:rect('.toolbar__options'), tabs:rect('#docTabs'),
      tools:rect('.cut-tool-rail'), canvas:rect('#stage'), workspace:rect('#workspace'),
      active:rect('.doc-tab.is-active'), items:rect('#tabItems'), add:rect('#addTab'),
      scrolling:document.querySelector('#tabItems').scrollWidth > document.querySelector('#tabItems').clientWidth,
      overflow:document.documentElement.scrollWidth > innerWidth };
  })()`);
  const screenshot = async name => {
    const { data } = await command('Page.captureScreenshot', { format:'png' });
    await writeFile(join(tmpdir(), `modcut-layout-${name}.png`), Buffer.from(data, 'base64'));
  };
  const clickSelector = async selector => {
    const point = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await click(point);
  };
  await resize(1360);
  let geometry = await layout();
  assert.equal(geometry.wrapped, false, 'Cut puts a single document beside the app actions');
  assert.ok(geometry.tabs.left >= geometry.actions.right && geometry.tabs.right <= geometry.options.left);
  assert.ok(geometry.tools.right <= geometry.canvas.left && geometry.tools.top === geometry.canvas.top, 'Cut tools occupy the left rail');
  assert.equal(geometry.overflow, false);
  const compactTop = geometry.workspace.top;
  await screenshot('cut');

  // Exercise the moved controls through actual pointer input.
  await clickSelector('#tools [data-tool=rect]');
  const before = await evaluate('paper.project.layers[1].children.length');
  const canvas = geometry.canvas;
  await drag({x:canvas.left+120,y:canvas.top+120}, {x:canvas.left+210,y:canvas.top+180});
  assert.ok(await evaluate(`paper.project.layers[1].children.length > ${before}`), 'The relocated rectangle tool draws into Cut');
  await clickSelector('#zoomIn');
  await clickSelector('#zoomFit');
  await clickSelector('#selMode');
  assert.equal(await evaluate("document.querySelector('#selMode').textContent"), 'Mark whole');
  await clickSelector('#selMode');
  await clickSelector('#togglePanel');
  await wait(250);
  assert.equal(await evaluate("document.querySelector('#workspace').classList.contains('collapsed')"), true);
  assert.ok((await layout()).canvas.width > canvas.width, 'Collapsing the panel keeps the rail and expands the canvas');
  await clickSelector('#togglePanel');
  await wait(250);

  await enterDraw(evaluate);
  await wait(150);
  assert.equal((await layout()).wrapped, false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.cut-tool-rail')).visibility"), 'hidden');
  assert.ok(await evaluate("document.querySelector('.draw-tool-rail').getBoundingClientRect().width > 0"));
  await screenshot('draw');
  await resize(790);
  geometry = await layout();
  assert.equal(geometry.wrapped, true, 'Draw moves tabs below the actions when the window is narrow');
  assert.ok(geometry.tabs.top >= geometry.actions.bottom && geometry.tabs.top >= geometry.options.bottom);
  assert.ok(geometry.workspace.top > compactTop, 'The second row is only reserved when needed');
  assert.equal(geometry.overflow, false);
  await screenshot('draw-narrow');
  await resize(1360);
  assert.equal((await layout()).wrapped, false, 'Widening the window returns tabs to the top row');

  await clickSelector('#workspaceToggle');
  const original = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  for (let i = 0; i < 12; i++) await evaluate("document.querySelector('#addTab').click()");
  await wait(150);
  geometry = await layout();
  assert.equal(geometry.wrapped, true, 'Adding documents moves the entire strip to the second row');
  assert.equal(geometry.scrolling, true, 'Many documents scroll within the second row');
  assert.ok(geometry.active.left >= geometry.items.left - 1 && geometry.active.right <= geometry.items.right + 1, 'The active document stays visible');
  assert.ok(geometry.add.right <= 1360, 'New tab stays visible when the strip scrolls');
  await screenshot('many-tabs');
  const extra = await evaluate(`[...document.querySelectorAll('.doc-tab')].map(tab=>tab.dataset.tabId).filter(id=>id!==${JSON.stringify(original)})`);
  for (const id of extra) await evaluate(`document.querySelector('[data-close-tab="${id}"]').click()`);
  await wait(150);
  assert.equal((await layout()).wrapped, false, 'Closing documents frees the top row again');

  // Translated action widths must also participate in the fit calculation.
  await evaluate("document.querySelector('#settings').click()");
  await evaluate("(() => {const input=document.querySelector('[name=language]');input.value='nb';input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.modal form').requestSubmit();})()");
  await enterDraw(evaluate);
  await resize(790);
  assert.equal((await layout()).overflow, false, 'Norwegian controls fit the narrow header');
  await resize(1360);
  assert.equal((await layout()).wrapped, false, 'Localized tabs return to the top row too');
  await screenshot('draw-norwegian');
  await command('Emulation.clearDeviceMetricsOverride');
  process.stdout.write('PASS workspace layout: shared inline tabs, responsive second row, scrolling, Cut rail controls, Draw and Norwegian\n');
}
