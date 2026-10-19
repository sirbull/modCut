import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectToPage, inputHelpers, wait } from './cdp.mjs';
import { activeDraw, enterDraw } from './draw-test-helpers.mjs';

export async function runBackgroundWorkflows(client, port) {
  const ready = async () => {
    for (let i = 0; i < 100; i++) {
      if (await client.evaluate("!!document.querySelector('.doc-tab.is-active')")) return;
      await wait(50);
    }
    assert.fail('The workspace did not load');
  };
  const preferences = async () => {
    await client.evaluate("document.getElementById('settings').click()");
    for (let i = 0; i < 100; i++) {
      if (await client.evaluate("!!document.querySelector('[name=background]')")) return;
      await wait(50);
    }
    assert.fail('Preferences did not open');
  };
  const pick = (value) => client.evaluate(`document.querySelector('[name=background][value="${value}"]').click()`);
  const close = () => client.evaluate("document.querySelector('[data-x=cancel]').click()");
  const snapshot = async (name) => {
    const { data } = await client.command('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(tmpdir(), `modcut-background-${name}.png`), Buffer.from(data, 'base64'));
  };
  await ready();
  assert.equal(await client.evaluate('window.modcutTheme.background'), 'green');
  await client.evaluate("window.modcutTheme.setPreference('light')");
  const artwork = await client.evaluate(`(() => {
    paper.project.layers[1].activate();
    const path = new paper.Path.Rectangle(new paper.Rectangle(10, 10, 40, 30));
    path.strokeColor = 'black'; path.fillColor = 'red';
    return paper.project.layers[1].exportJSON({asString:true});
  })()`);
  await preferences();
  // Exercise real keyboard navigation as well as pointer activation.
  await client.evaluate("document.querySelector('[name=background]:checked').focus()");
  await inputHelpers(client).key('ArrowRight');
  assert.equal(await client.evaluate('window.modcutTheme.background'), 'white');
  assert.equal(await client.evaluate("getComputedStyle(document.getElementById('stage')).backgroundColor"), 'rgb(255, 255, 255)');
  await close();
  await enterDraw(client.evaluate);
  await client.evaluate(`(async()=>{
    const workspace=${activeDraw}, {shapeFromDrag}=await import('./draw/tools/shapes.mjs'), {insertNode}=await import('./draw/doc/commands.mjs');
    const node=shapeFromDrag('rectangle',[20,20],[65,50],{fill:'#FFCC00',stroke:'#000000',strokeWidth:1});
    workspace.state.history.execute(insertNode(workspace.state.document.data.layers[0].id,node));
  })()`);
  const drawDocument = await client.evaluate(`(async()=>JSON.stringify((${activeDraw}).state.document.toJSON()))()`);
  await preferences();
  for (const [background, appearance, surface, workspace] of [
    ['white', 'light', 'rgb(255, 255, 255)', 'rgb(238, 238, 238)'],
    ['light-gray', 'light', 'rgb(229, 229, 229)', 'rgb(215, 215, 215)'],
    ['gray', 'dark', 'rgb(85, 85, 85)', 'rgb(72, 72, 72)'],
    ['dark-gray', 'dark', 'rgb(40, 40, 40)', 'rgb(32, 32, 32)'],
  ]) {
    await pick(background);
    assert.equal(await client.evaluate('document.documentElement.dataset.theme'), appearance);
    assert.equal(await client.evaluate("localStorage.getItem('modcut_background')"), background, 'Background saves immediately');
    assert.equal(await client.evaluate("getComputedStyle(document.querySelector('.draw-tool-rail')).backgroundColor"), surface);
    assert.equal(await client.evaluate("getComputedStyle(document.querySelector('.draw-stage')).backgroundColor"), workspace);
    const contrast = await client.evaluate(`(() => {
      const luminance = color => {
        const [r,g,b] = color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
        return .2126*r + .7152*g + .0722*b;
      };
      const ratio = (a,b) => (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      return ['.field__description', '.form-section', '.btn--primary', '.btn--ghost', '.draw-tool-rail .draw-icon-button'].map(selector => {
        const element = document.querySelector(selector), style = getComputedStyle(element);
        let parent = element, background = style.backgroundColor;
        while (background === 'rgba(0, 0, 0, 0)' && parent.parentElement) { parent = parent.parentElement; background = getComputedStyle(parent).backgroundColor; }
        // Primary buttons use a gradient; check both endpoints below.
        if (selector === '.btn--primary') {
          const root = getComputedStyle(document.documentElement);
          const rgb = token => { const h=root.getPropertyValue(token).trim(); return 'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(',')+')'; };
          return Math.min(...['--brand-fill','--brand-fill-top'].map(token=>ratio(luminance(style.color),luminance(rgb(token)))));
        }
        return ratio(luminance(style.color), luminance(background));
      });
    })()`);
    assert.ok(contrast.every(value => value >= 4.5), `Rendered text and button contrast in ${background}: ${contrast}`);
    assert.equal(await client.evaluate("document.querySelector('[name=theme]').disabled"), true, 'System/Light/Dark only applies to Green');
    assert.equal(await client.evaluate(`(async()=>JSON.stringify((${activeDraw}).state.document.toJSON()))()`), drawDocument, 'Draw geometry and colours are preserved');
    assert.equal(await client.evaluate('paper.project.layers[1].exportJSON({asString:true})'), artwork, 'Cut artwork and output colours are preserved');
    await snapshot(`${background}-preferences`);
  }
  await close();
  await snapshot('dark-gray-draw');
  await client.command('Page.reload');
  await ready();
  assert.equal(await client.evaluate('window.modcutTheme.background'), 'dark-gray', 'Background survives closing Preferences and reloading');
  await preferences();
  assert.equal(await client.evaluate("document.querySelector('[name=background]:checked').value"), 'dark-gray');
  await pick('green');
  assert.equal(await client.evaluate("document.querySelector('[name=theme]').disabled"), false);
  assert.equal(await client.evaluate('window.modcutTheme.preference'), 'light', 'Returning to Green restores the previous theme');
  await pick('gray');
  await close();
  await client.evaluate(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    canvas.getContext('2d').fillRect(0,0,16,16);
    void window.modcut.openImageEditor({ dataUrl: canvas.toDataURL(), widthMm: 10, heightMm: 10, dpi: 300 });
  })()`);
  const editor = await connectToPage(port, 'Advanced Editing for Engraving · modCut');
  try {
    assert.equal(await editor.evaluate('document.documentElement.dataset.background'), 'gray', 'New editor inherits background');
    assert.equal(await editor.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(96, 96, 96)');
    await preferences();
    await pick('light-gray');
    for (let i = 0; i < 30 && await editor.evaluate('window.modcutTheme.background') !== 'light-gray'; i++) await wait(50);
    assert.equal(await editor.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(238, 238, 238)', 'Open editor follows background changes');
    assert.equal(await editor.evaluate('document.documentElement.dataset.theme'), 'light');
    await close();
    await editor.evaluate('void window.modcut.finishImageEditor(null)');
  } finally { editor.socket.close(); }
  console.log('PASS background E2E: keyboard, five palettes, Cut/Draw artwork, persistence and image editor synchronization');
}
