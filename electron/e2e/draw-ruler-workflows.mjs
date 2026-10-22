import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, submitNewDrawDialog } from './draw-test-helpers.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_SMART_GUIDES } from '../../renderer/preferences.mjs';

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
  await runDrawViewToggleWorkflows(client);
  await runSmartGuideWorkflows(client);
  console.log('PASS Draw rulers: unit menus on both rulers, keyboard, adaptive zoom labels, pointer markers, guide creation/move/cancel/delete, rotated views and unchanged document/history');
}

/** Inspect real pointer gestures before release: settings must affect the live canvas. */
async function runSmartGuideWorkflows(client) {
  const {evaluate}=client,{drag,mouse}=inputHelpers(client);
  const workspace=body=>evaluate(`(async()=>{const w=${active};${body}})()`);
  const project=(x,y)=>workspace(`const b=w.scope.view.element.getBoundingClientRect(),p=w.scope.view.projectToView(new w.scope.Point(${x},${y}));return{x:b.x+p.x,y:b.y+p.y};`);
  const root='.draw-project[style*=block]',saved=await evaluate("localStorage.getItem('modcut_preferences')");
  const applied=()=>workspace('return w.state.history.entries.filter(e=>e.applied).length;'),history=await applied();
  const snapshot=async name=>{const {data}=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`modcut-smart-guides-${name}.png`),Buffer.from(data,'base64'));};
  const open=async()=>{
    await workspace("w.handle('deselect');");
    for(let i=0;i<30;i++){if(await evaluate(`!!document.querySelector('${root} [data-draw-quick=smart-guides-preferences]')`))break;await wait(40);}
    await evaluate(`document.querySelector('${root} [data-draw-quick=smart-guides-preferences]').click()`);
    for(let i=0;i<50;i++){if(await evaluate("!!document.querySelector('.preferences-modal [name=smartGuideColor]')"))break;await wait(40);}
    assert.equal(await evaluate("document.querySelector('.preferences-modal .form-nav [aria-current=page]')?.textContent"),'Smart Guides');
  };
  const configure=async changes=>{
    await open();
    await evaluate(`(()=>{for(const [key,value] of Object.entries(${JSON.stringify(changes)})){const el=document.querySelector('.preferences-modal [name='+key+']');if(el.type==='checkbox'){if(el.checked!==value)el.click();}else{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}})()`);
    await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");
  };
  await configure({smartGuideColor:'#c026d3',smartGuideTolerance:12,smartGuideAlignment:true,smartGuideHighlight:true,smartGuideMeasurements:true,smartGuideSpacing:true});
  await open();
  assert.equal(await evaluate("document.querySelectorAll('.smart-guide-settings [role=switch]').length"),4);
  assert.equal(await evaluate("document.querySelector('[name=smartGuideColor]').value"),'#c026d3');
  assert.equal(await evaluate("document.querySelector('[name=smartGuideTolerance]').value"),'12');
  await snapshot('preferences');await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");
  await open();
  await evaluate("(()=>{const lang=document.querySelector('[name=language]');lang.value='nb';lang.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait(80);
  assert.equal(await evaluate("document.querySelector('.preferences-modal .form-nav [aria-current=page]').textContent"),'Smarte hjelpelinjer');
  assert.match(await evaluate("document.querySelector('.smart-guide-settings').textContent"),/Objektmarkering/);
  await snapshot('preferences-nb');
  await evaluate("(()=>{const lang=document.querySelector('[name=language]');lang.value='en';lang.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.preferences-modal [data-x=cancel]').click();})()");
  await workspace("if(w.state.document.data.settings.snapping.point)w.handle('snap-point');if(w.state.document.data.settings.snapping.grid)w.handle('snap-grid');if(!w.state.document.data.settings.smartGuides)w.handle('smart-guides');w.setTool('rectangle');");
  for(const [x,y] of [[20,20],[100,20],[65,50]])await drag(await project(x,y),await project(x+20,y+20));
  await workspace("w.setTool('select');w.handle('deselect');");
  const documentBefore=await workspace('return JSON.stringify(w.state.document.toJSON());');
  await mouse('mouseMoved',await project(25,25));
  assert.ok(await workspace("return w.scope.project.getItem({name:'Smart guide highlights'})?.children.some(c=>c.strokeColor?.toCSS(true)==='#c026d3');"),'hover outline uses the chosen colour');
  await snapshot('highlight');
  const zoom=await workspace('return w.scope.view.zoom;'),off=6/zoom;
  const begin=async(x,y)=>{await mouse('mouseMoved',await project(75,60));await mouse('mousePressed',await project(75,60),{buttons:1});await mouse('mouseMoved',await project(x,y),{buttons:1});};
  const live=()=>workspace(`const g=w.scope.project.getItem({name:'Smart guide preview'});return {box:g?.firstChild.bounds.toJSON(),x:g?.firstChild.bounds.x,y:g?.firstChild.bounds.y,spacing:g?.children.filter(c=>c.data.smartSpacing).length,measurements:g?.children.filter(c=>c.data.smartMeasurement).map(c=>c.content),dashes:g?.children.filter(c=>c.dashArray?.length).length,color:g?.firstChild.strokeColor.toCSS(true)};`);
  const cancel=async()=>{await client.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await client.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await mouse('mouseReleased',await project(70,30));};
  await begin(70+off,30+off);let view=await live();
  assert.ok(Math.abs(view.x-60)<.01&&Math.abs(view.y-20)<.01,JSON.stringify(view));
  assert.equal(view.spacing,2);assert.ok(view.measurements.length>=3);assert.equal(view.color,'#c026d3');
  // The artwork itself moves live, painted, and the original is hidden until release.
  const moving=await workspace(`const id=w.state.selection.ids[0],g=w.scope.project.getItem({name:'Transform preview'}),clone=g?.children.find(c=>c.data.nodeId===id);
    const originals=w.scope.project.getItems({match:i=>i.data.nodeId===id&&i.isInserted()&&!i.isDescendant(g)&&i.visible});
    return {bounds:clone&&{x:clone.bounds.x,y:clone.bounds.y},fill:!!clone?.fillColor,stroke:!!clone?.strokeColor,originals:originals.length};`);
  assert.ok(moving.bounds&&Math.abs(moving.bounds.x-60)<.01&&Math.abs(moving.bounds.y-20)<.01,JSON.stringify(moving));
  assert.ok(moving.fill||moving.stroke,'the live copy keeps its paint');assert.equal(moving.originals,0,'the original hides while dragging');
  await snapshot('drag');
  assert.equal(await workspace('return JSON.stringify(w.state.document.toJSON());'),documentBefore,'live overlays do not edit the model');
  // A second move in the same gesture refreshes the live measurement.
  await mouse('mouseMoved',await project(70+off/2,30+off/2),{buttons:1});assert.equal((await live()).spacing,2);await cancel();
  await configure({smartGuideHighlight:false,smartGuideMeasurements:false,smartGuideSpacing:false});
  await mouse('mouseMoved',await project(25,25));
  assert.ok(!await workspace("return w.scope.project.getItem({name:'Smart guide highlights'})?.children.length;"));
  await begin(70+off,30+off);view=await live();
  assert.ok(Math.abs(view.x-(60+off))<.01&&Math.abs(view.y-20)<.01,JSON.stringify(view));
  assert.equal(view.spacing,0);assert.equal(view.measurements.length,0);assert.ok(view.dashes>0);await cancel();
  await configure({smartGuideAlignment:false});
  await begin(70+off,30+off);view=await live();assert.ok(Math.abs(view.y-(20+off))<.01,JSON.stringify(view));assert.equal(view.dashes,0);await cancel();
  await configure({smartGuideAlignment:true,smartGuideTolerance:2});
  await begin(70+off,30+off);view=await live();assert.ok(Math.abs(view.y-(20+off))<.01,JSON.stringify(view));await cancel();
  await configure({smartGuideTolerance:12,smartGuideSpacing:true,smartGuideMeasurements:true,smartGuideHighlight:true});
  await begin(70+off,30+off);await mouse('mouseReleased',await project(70+off,30+off));
  const placed=await workspace('const b=w.renderer.selectionBounds();return {x:b.x,y:b.y};');
  assert.ok(Math.abs(placed.x-60)<.01&&Math.abs(placed.y-20)<.01,JSON.stringify(placed));
  await workspace("w.handle('undo');");
  // The document master switch disables all Smart Guide feedback, even with preferences on.
  await workspace("w.handle('smart-guides');");
  await begin(70+off,30+off);view=await live();assert.equal(view.spacing,0);assert.equal(view.measurements.length,0);assert.equal(view.dashes,0);await cancel();
  // Restore app preferences through the page, and undo the fixture's document edits.
  const original={...DEFAULT_SMART_GUIDES,...JSON.parse(saved)};await configure(Object.fromEntries(Object.keys(DEFAULT_SMART_GUIDES).map(k=>[k,original[k]])));
  while(await applied()>history)await workspace("w.handle('undo');");
  console.log('PASS Smart Guides: direct Preferences navigation, persisted switches/colour/tolerance, hover outlines, live alignment/equal spacing/measurements, independent switches and master toggle');
}

/** Properties with nothing selected: Ruler & Grids, Guides and Snap Options toggles, and what each one does. */
export async function runDrawViewToggleWorkflows(client) {
  const { evaluate } = client, { drag, mouse } = inputHelpers(client);
  const workspace = body => evaluate(`(async()=>{const w=${active};${body}})()`);
  const action = id => workspace(`w.handle(${JSON.stringify(id)});`);
  const screen = (x, y) => workspace(`const b=w.scope.view.element.getBoundingClientRect();return{x:b.x+${x},y:b.y+${y}};`);
  const project = (x, y) => workspace(`const b=w.scope.view.element.getBoundingClientRect(),p=w.scope.view.projectToView(new w.scope.Point(${x},${y}));return{x:b.x+p.x,y:b.y+p.y};`);
  const root = '.draw-project[style*=block]';
  // The rows show only with nothing selected, as in Illustrator.
  const toggle = async id => { await action('deselect'); await evaluate(`document.querySelector('${root} [data-draw-view="${id}"]').click()`); };
  // The panel redraws after the change; wait for it, then report what the button says.
  const pressed = async (id, expected) => { let value; for (let i = 0; i < 25; i++) { value = await evaluate(`document.querySelector('${root} [data-draw-view="${id}"]')?.getAttribute('aria-pressed')`); if (value === expected) break; await wait(40); } return `${id}:${value}`; };
  const applied = () => workspace('return w.state.history.entries.filter(e=>e.applied).length;'), history = await applied();
  await action('deselect'); await workspace("w.state.ui.rulerGuides=[];w.setTool('select');w.withScope(()=>w.renderer.updateView());");
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${root} .draw-view-toggles__label')].map(e=>e.textContent)`), ['Ruler & Grids', 'Guides', 'Snap Options']);
  assert.equal(await evaluate(`document.querySelectorAll('${root} .draw-view-toggle svg').length`), 8);
  assert.match(await evaluate(`document.querySelector('${root} [data-draw-view=rulers]').dataset.tooltip`), /^Rulers \((Ctrl|Cmd)\+R\)$/);
  // Rulers and the transparency grid are this view's; the button shows the state.
  await toggle('rulers'); assert.equal(await workspace('return w.state.ui.rulers;'), true); assert.equal(await pressed('rulers', 'true'), 'rulers:true');
  await toggle('transparency-grid'); assert.equal(await pressed('transparency-grid', 'true'), 'transparency-grid:true');
  const checker = await workspace("const g=w.scope.project.getItem({name:'Transparency grid'}),a=w.state.document.data.artboards[0];const r=g.children[0].bounds;return {n:g.children.length,inBoards:!!g.parent,b:{x:r.x,width:r.width},a:{x:a.x,width:a.width}};");
  assert.equal(checker.n, 1); assert.ok(checker.inBoards, 'drawn under the artwork');
  assert.ok(Math.abs(checker.b.width - checker.a.width) < .01 && Math.abs(checker.b.x - checker.a.x) < .01, 'covers the artboard ' + JSON.stringify(checker));
  // Hidden and locked guides cannot be picked up; shown again, they are where they were.
  await drag(await screen(10, 160), await project(60, 40));
  const guides = () => workspace('return JSON.stringify(w.state.ui.rulerGuides);'), lineCount = () => workspace("return w.scope.project.getItem({name:'Ruler guides'}).children.length;");
  const placed = await guides(); assert.equal(await lineCount(), 1, placed + ' ' + await workspace("return JSON.stringify(w.scope.project.getItem({name:'Ruler guides'}).children.map(c=>[c.className,c.data]));"));
  await toggle('guides'); assert.equal(await pressed('guides', 'false'), 'guides:false'); assert.equal(await lineCount(), 0, 'hidden');
  await drag(await project(60, 40), await project(90, 40)); assert.equal(await guides(), placed, 'a hidden guide stays put');
  await toggle('guides'); assert.equal(await lineCount(), 1);
  await toggle('guides-lock'); assert.equal(await pressed('guides-lock', 'true'), 'guides-lock:true');
  if (process.argv.includes('--screenshot')) {
    const clip = await evaluate(`(()=>{const e=document.querySelector('${root} .draw-view-toggles');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x-8,y:r.y-8,width:r.width+16,height:r.height+16,scale:2};})()`);
    const { writeFile } = await import('node:fs/promises');
    const { data } = await client.command('Page.captureScreenshot', { format: 'png', clip });
    await writeFile('view-toggles-panel.png', Buffer.from(data, 'base64'));
  }
  await drag(await project(60, 40), await project(90, 40)); assert.equal(await guides(), placed, 'a locked guide stays put');
  await toggle('guides-lock');
  // Snap to Grid (10 mm): a rectangle drawn between grid lines lands on them, live while dragging.
  const last = () => workspace('const l=w.state.document.data.layers.at(-1).children.at(-1);const b=w.renderer.bounds(l.id);return {id:l.id,x:b.x,y:b.y,w:b.width,h:b.height};');
  const near = (a, b) => Math.abs(a - b) < .05;
  await toggle('snap-grid'); assert.equal(await pressed('snap-grid', 'true'), 'snap-grid:true');
  await workspace("w.setTool('rectangle');");
  await mouse('mouseMoved', await project(13, 12)); await mouse('mousePressed', await project(13, 12), { buttons: 1 });
  await mouse('mouseMoved', await project(30, 30), { buttons: 1 }); await mouse('mouseMoved', await project(47, 38), { buttons: 1 });
  if (process.argv.includes('--screenshot')) {
    const { writeFile } = await import('node:fs/promises');
    const { data } = await client.command('Page.captureScreenshot', { format: 'png' });
    await writeFile('view-toggles-proof.png', Buffer.from(data, 'base64'));
  }
  await mouse('mouseReleased', await project(47, 38));
  let box = await last(); assert.ok(near(box.x, 10) && near(box.y, 10) && near(box.w, 40) && near(box.h, 30), JSON.stringify(box));
  // Moving with the grid on: the box's corner goes to the grid.
  await workspace("w.setTool('select');"); await drag(await project(30, 25), await project(43, 31));
  box = await last(); assert.ok(near(box.x, 20) && near(box.y, 20), JSON.stringify(box));
  // Snap to Point: a new rectangle starts on the first one's corner, and a guide catches its other corner.
  // Snap to Point is on in new documents, as in Illustrator.
  await toggle('snap-grid'); assert.equal(await pressed('snap-point', 'true'), 'snap-point:true');
  await workspace("w.setTool('rectangle');");
  const zoom = await workspace('return w.scope.view.zoom;'), off = 2 / zoom;
  await mouse('mouseMoved', await project(20 + off, 20 - off)); await mouse('mousePressed', await project(20 + off, 20 - off), { buttons: 1 });
  await mouse('mouseMoved', await project(60 + off * 2, 44), { buttons: 1 });
  assert.ok(await workspace('return w.scope.project.getItems({match:i=>i.dashArray?.length&&i.strokeColor?.toCSS(true)===\'#006b5c\'}).length>0;'), 'the snap shows as guide lines while dragging');
  await mouse('mouseReleased', await project(60 + off * 2, 44));
  box = await last(); assert.ok(near(box.x, 20) && near(box.y, 20) && near(box.x + box.w, 60) && near(box.y + box.h, 44), JSON.stringify(box));
  await toggle('snap-point'); assert.equal(await pressed('snap-point', 'false'), 'snap-point:false');
  await toggle('transparency-grid'); await toggle('rulers');
  assert.equal(await workspace("return !!w.scope.project.getItem({name:'Transparency grid'})?.parent;"), false);
  await workspace("w.state.ui.rulerGuides=[];w.setTool('select');w.withScope(()=>w.renderer.updateView());");
  while (await applied() > history) await action('undo');
  console.log('PASS Draw view toggles: Properties rows, rulers, transparency grid, hidden and locked guides, snap to grid (draw and move) and snap to point with live guide lines');
}
