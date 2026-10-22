import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawRulerWorkflows(client) {
  const { evaluate } = client, { drag, click, mouse } = inputHelpers(client);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 200, height: 80, name: 'Ruler proof' });
  const workspace = body => evaluate(`(async()=>{const w=${active};${body}})()`);
  const action = id => workspace(`return w.handle(${JSON.stringify(id)});`);
  const screen = (x, y) => workspace(`const b=w.scope.view.element.getBoundingClientRect();return{x:b.x+${x},y:b.y+${y}};`);
  const project = (x, y) => workspace(`const b=w.scope.view.element.getBoundingClientRect(),p=w.scope.view.projectToView(new w.scope.Point(${x},${y}));return{x:b.x+p.x,y:b.y+p.y};`);
  const guides = () => workspace('return w.state.ui.rulerGuides??[];');
  const menu = '.draw-project[style*=block] .draw-context-menu:not(.draw-context-menu--submenu)';
  const open = async (x, y) => {
    const p = await screen(x, y);
    await client.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'right', buttons: 2, clickCount: 1 });
    await client.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'right', buttons: 0, clickCount: 1 });
  };
  const key = async (key, code, modifiers = 0) => {
    await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
    await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers }); await wait(30);
  };
  // Start from the keyboard, with a drawing tool active: ruler drags must never draw artwork.
  await workspace("w.setTool('rectangle');w.scope.view.element.focus();");
  const before = await workspace('return {document:JSON.stringify(w.state.snapshot()),history:w.state.history.entries.length,dirty:w.state.dirty};');
  await key('r', 'KeyR', process.platform === 'darwin' ? 4 : 2);
  assert.equal(await workspace('return w.state.ui.rulers;'), true);
  await open(160, 10);
  assert.equal(await evaluate(`document.querySelector('${menu}').getAttribute('aria-label')`), 'Ruler units');
  assert.equal(await evaluate(`document.querySelectorAll('${menu} [role=menuitemradio]').length`), 7);
  for (const unit of ['cm', 'in', 'px', 'pt', 'pc', '%', 'mm']) {
    if (unit !== 'cm') await open(unit === 'in' ? 10 : 160, unit === 'in' ? 160 : 10);
    await evaluate(`document.querySelector('${menu} [data-draw-context="ruler-unit-${unit}"]').click()`);
    assert.equal(await workspace('return w.state.ui.rulerUnit;'), unit);
    assert.equal(await workspace("return w.scope.project.getItem({name:'View rulers'}).lastChild.content;"), unit);
  }
  // Keyboard radio choice and Escape both use the shared menu keyboard behavior.
  await open(160, 10); await key('End', 'End'); await key('Enter', 'Enter');
  assert.equal(await workspace('return w.state.ui.rulerUnit;'), '%');
  await open(10, 160); await key('Escape', 'Escape');
  assert.equal(await evaluate(`!!document.querySelector('${menu}')`), false);
  await drag(await screen(160, 10), await project(50, 30));
  await drag(await screen(10, 160), await project(70, 50));
  let lines = await guides();
  assert.equal(lines.length, 2); assert.equal(lines[0].axis, 'y'); assert.equal(lines[1].axis, 'x');
  assert.ok(Math.abs(lines[0].value - 30) < .1); assert.ok(Math.abs(lines[1].value - 70) < .1);
  await drag(await project(100, 30), await project(100, 45));
  lines = await guides(); assert.ok(lines.some(g => g.axis === 'y' && Math.abs(g.value - 45) < .1));
  // A new guide is drawn to 50 %, shown live beside the line and in the status bar, and lets go when pulled past.
  const zoom = await workspace('return w.scope.view.zoom;'), toward = await screen(10, 160);
  await mouse('mouseMoved', toward); await mouse('mousePressed', toward, { buttons: 1 });
  const near = await project(100 + 3 / zoom, 60); await mouse('mouseMoved', near, { buttons: 1 });
  const live = await workspace(`const label=w.scope.project.getItem({name:'Ruler guide label'}),line=w.scope.project.getItem({name:'Ruler guides'}).lastChild;
    return {text:label.lastChild?.content,box:label.firstChild?.bounds.toJSON?.()??null,status:[...document.querySelectorAll('.draw-position')].find(e=>e.offsetParent).textContent,dash:line.dashArray.length,x:line.firstSegment.point.x};`);
  assert.equal(live.text, '50 %  ·  100.0 mm'); assert.equal(live.dash, 0);
  assert.match(live.status, /^Guide X {2}50 % · 100.0 mm · 3.937 in/);
  const rect = await workspace('return w.scope.view.element.getBoundingClientRect().toJSON();');
  const box = await workspace("const b=w.scope.project.getItem({name:'Ruler guide label'}).firstChild.bounds;return{x:b.x,y:b.y,w:b.width,h:b.height};");
  const px = near.x - rect.x, py = near.y - rect.y;
  assert.ok(box.x > live.x && !(px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h), 'label beside the line, off the pointer');
  await mouse('mouseMoved', await project(100 + 6 / zoom, 60), { buttons: 1 });
  assert.equal(await workspace("return w.state.ui.guideReadout.includes('snapped');"), true, 'still held while pushing a little');
  await mouse('mouseMoved', await project(100 + 20 / zoom, 60), { buttons: 1 });
  await mouse('mouseMoved', await project(98, 60), { buttons: 1 }); await mouse('mouseReleased', await project(98, 60));
  lines = await guides(); assert.ok(lines.some(g => g.axis === 'x' && Math.abs(g.value - 98) < .1), '49 % is reachable after pulling past 50 %');
  assert.doesNotMatch(await evaluate("[...document.querySelectorAll('.draw-position')].find(e=>e.offsetParent).textContent"), /Guide/);
  await drag(await project(98, 60), await screen(10, 160));
  // Ctrl/Cmd with + and − zoom, also where those keys sit on Minus and Slash (Norwegian layout).
  const mod = process.platform === 'darwin' ? 4 : 2;
  for (const [k, code, factor] of [['+', 'Minus', 1.25], ['-', 'Slash', .8], ['=', 'Equal', 1.25], ['-', 'Minus', .8]]) {
    const before = await workspace('return w.scope.view.zoom;'); await key(k, code, mod);
    assert.ok(Math.abs(await workspace('return w.scope.view.zoom;') / before - factor) < 1e-6, `Ctrl ${k} (${code})`);
  }
  await workspace('w.withScope(()=>w.renderer.fit());');
  // Escape cancels a new guide and restores the position of an existing guide.
  for (const start of [await screen(160, 10), await project(70, 60)]) {
    const saved = await guides();
    await mouse('mouseMoved', start); await mouse('mousePressed', start, { buttons: 1 });
    await mouse('mouseMoved', await project(110, 55), { buttons: 1 });
    await key('Escape', 'Escape'); await mouse('mouseReleased', await project(110, 55));
    assert.deepEqual(await guides(), saved);
  }
  await mouse('mouseMoved', await project(100, 40));
  assert.equal(await workspace("return w.scope.project.getItem({name:'Ruler pointer'}).children.length;"), 2);
  const markerPositions = await workspace("return w.scope.project.getItem({name:'Ruler pointer'}).children.map(p=>[p.firstSegment.point.x,p.firstSegment.point.y]);");
  const pointer = await workspace('const p=w.scope.view.projectToView(new w.scope.Point(100,40));return [p.x,p.y];');
  assert.ok(Math.abs(markerPositions[0][0] - pointer[0]) < 1); assert.ok(Math.abs(markerPositions[1][1] - pointer[1]) < 1);
  // Guides stay in project coordinates through zoom, pan and rotation, with readable fine-scale labels.
  await workspace("w.state.ui.rulerUnit='mm';w.withScope(()=>{w.scope.view.zoom=200;w.scope.view.center=[100,40];w.renderer.updateView();});");
  const labels = await workspace("return w.scope.project.getItem({name:'View rulers'}).children.filter(p=>p.data.rulerAxis==='x').map(p=>p.content);");
  assert.ok(labels.length >= 3); assert.ok(labels.some(label => label.includes('.')));
  await workspace('w.withScope(()=>{w.scope.view.zoom=4;w.scope.view.rotation=30;w.scope.view.center=[100,40];w.renderer.updateView();});');
  assert.equal(await workspace("return w.scope.project.getItem({name:'Ruler guides'}).children.length;"), 2);
  await workspace('w.withScope(()=>{w.scope.view.rotation=0;w.renderer.fit();});');
  // Drag each guide back to its ruler; a press/release within the ruler adds nothing.
  await drag(await project(70, 60), await screen(10, 160));
  await drag(await project(100, 45), await screen(160, 10));
  await click(await screen(160, 10)); assert.equal((await guides()).length, 0);
  const after = await workspace('return {document:JSON.stringify(w.state.snapshot()),history:w.state.history.entries.length,dirty:w.state.dirty};');
  assert.deepEqual(after, before);
  if (process.argv.includes('--screenshot')) {
    await drag(await screen(160, 10), await project(80, 30));
    await drag(await screen(10, 160), await project(70, 50));
    const start = await screen(10, 200); await mouse('mouseMoved', start); await mouse('mousePressed', start, { buttons: 1 });
    await mouse('mouseMoved', await project(101, 60), { buttons: 1 }); await wait(100);
    const { writeFile } = await import('node:fs/promises');
    const { data } = await client.command('Page.captureScreenshot', { format: 'png' });
    await writeFile('ruler-proof.png', Buffer.from(data, 'base64'));
    await mouse('mouseReleased', await project(101, 60));
  }
  await action('rulers');
  console.log('PASS Draw rulers: unit menus on both rulers, keyboard, adaptive zoom labels, pointer markers, guide creation/move/cancel/delete, rotated views and unchanged document/history');
}
