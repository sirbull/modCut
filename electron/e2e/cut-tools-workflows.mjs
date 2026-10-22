import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { enterDraw } from './draw-test-helpers.mjs';

export async function runCutToolsWorkflows(client) {
  const { evaluate, command } = client;
  const { click, drag, key, mouse } = inputHelpers(client);
  for (let i = 0; i < 100 && !await evaluate("!!document.querySelector('.doc-tab.is-active')"); i++) await wait(100);
  const clickSelector = async selector => click(await evaluate(`(() => {
    const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`));
  const last = () => evaluate(`(() => {
    const p=paper.project.layers[1].children.at(-1),b=p.bounds;
    return {x:b.x,y:b.y,w:b.width,h:b.height,cx:b.center.x,cy:b.center.y,
      first:[p.firstSegment.point.x,p.firstSegment.point.y],last:[p.lastSegment.point.x,p.lastSegment.point.y]};
  })()`);
  const near = (a,b) => assert.ok(Math.abs(a-b)<.02, `${a} should equal ${b}`);
  // Chromium rounds pointer offsets to screen pixels before Paper receives them.
  const nearPointer = async (a,b) => assert.ok(Math.abs(a-b)<=await evaluate('1/paper.view.zoom'), `${a} should be within one pixel of ${b}`);
  const point = (x,y) => evaluate(`(() => {const c=document.querySelector('.bed-canvas').getBoundingClientRect();return {x:c.left+${x},y:c.top+${y}};})()`);
  const project = p => evaluate(`(() => {const c=document.querySelector('.bed-canvas').getBoundingClientRect(),p=paper.view.viewToProject(new paper.Point(${p.x}-c.left,${p.y}-c.top));return {x:p.x,y:p.y};})()`);
  const screen = p => evaluate(`(() => {const c=document.querySelector('.bed-canvas').getBoundingClientRect(),p=paper.view.projectToView(new paper.Point(${p[0]},${p[1]}));return {x:c.left+p.x,y:c.top+p.y};})()`);
  assert.equal(await evaluate("document.querySelectorAll('#tools [data-draw-tool]').length"),5,'Only existing tools appear, with rectangle and ellipse grouped');
  await clickSelector('#tools [data-tool=rect]');
  await drag(await point(120,120),await point(210,170),8);
  const square=await last();near(square.w,square.h);
  assert.equal(await evaluate("document.querySelector('#tools [data-tool=rect]').getAttribute('aria-pressed')"),'true');

  await key('v');
  const squareCenter=await screen([square.cx,square.cy]);
  await mouse('mousePressed',squareCenter,{buttons:1});
  await mouse('mouseMoved',{x:squareCenter.x+45,y:squareCenter.y+12},{buttons:1,modifiers:8});
  await mouse('mouseReleased',{x:squareCenter.x+45,y:squareCenter.y+12},{modifiers:8});
  const moved=await last();near(moved.cy,square.cy);assert.ok(moved.cx>square.cx,'Shift constrains Selection movement to one axis');
  const movedCenter=await screen([moved.cx,moved.cy]);
  await drag(movedCenter,{x:movedCenter.x+60,y:movedCenter.y+10},1);
  assert.equal(await evaluate('paper.project.layers[1].children.length'),2,'Alt-drag copies the selection');
  near(await evaluate('paper.project.layers[1].children[0].bounds.center.x'),moved.cx);

  await clickSelector('#tools .draw-tool-more');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.draw-tool-flyout [data-draw-tool]')].map(b=>b.dataset.drawTool)"),['ellipse']);
  await clickSelector('.draw-tool-flyout [data-draw-tool=ellipse]');
  const center=await point(330,210),centerMm=await project(center);
  await drag(center,await point(365,235),9);
  const circle=await last();near(circle.w,circle.h);await nearPointer(circle.cx,centerMm.x);await nearPointer(circle.cy,centerMm.y);
  assert.equal(await evaluate("document.querySelector('#tools [data-tool=ellipse]').getAttribute('aria-pressed')"),'true','The selected variant stays on the rail');
  await clickSelector('#tools [data-tool=ellipse]');
  await clickSelector('#tools [data-tool=ellipse]'); // ordinary clicks keep the same tool

  await key('m');
  assert.equal(await evaluate("document.querySelector('#tools [aria-pressed=true]').dataset.tool"),'rect');
  await key('l');
  assert.equal(await evaluate("document.querySelector('#tools [aria-pressed=true]').dataset.tool"),'ellipse','Ellipse uses Draw’s L shortcut');
  await key('\\');
  assert.equal(await evaluate("document.querySelector('#tools [aria-pressed=true]').dataset.tool"),'line');
  await drag(await point(410,300),await point(470,320),8);
  const line=await last();near(line.first[1],line.last[1]);

  await evaluate("document.querySelector('#units').value='cm';document.querySelector('#units').dispatchEvent(new Event('change',{bubbles:true}))");
  const origin=await point(240,340),originMm=await project(origin);
  await click(origin);
  assert.ok(await evaluate("!!document.querySelector('.draw-shape-dialog input[name=lineLength]')"));
  await evaluate("(() => {const form=document.querySelector('.draw-shape-dialog form');form.elements.lineLength.value='2.5';form.elements.angle.value='90';form.requestSubmit();})()");
  await wait();
  const exact=await last();await nearPointer(exact.first[0],originMm.x);await nearPointer(exact.first[1],originMm.y);near(exact.h,25);near(exact.w,0);
  await key('v');
  assert.equal(await evaluate("document.querySelector('#sel').textContent"),'1 selected','Switching tools keeps the selection');
  await key('a');
  assert.ok(await evaluate("paper.project.getItems({name:'path-anchor'}).length===2"),'Direct Selection shows the selected path’s anchors');
  const first=await screen(exact.first);
  await drag(first,{x:first.x+30,y:first.y+5},8);
  const edited=await last();near(edited.first[1],exact.first[1]);assert.ok(edited.first[0]>exact.first[0],'Shift constrains anchor movement');

  await key('m');
  const count=await evaluate('paper.project.layers[1].children.length');
  await mouse('mousePressed',await point(150,410),{buttons:1});
  await mouse('mouseMoved',await point(210,450),{buttons:1});
  await key('Escape');
  await mouse('mouseReleased',await point(210,450));
  assert.equal(await evaluate('paper.project.layers[1].children.length'),count,'Escape removes the uncommitted shape');
  await evaluate("(async()=>{const m=await import('./draw/keymap.mjs');m.setKeyOverrides({'tool.ellipse':['Shift+L']});window.dispatchEvent(new Event('modcut-shortcuts-change'));})()");
  await key('l');
  assert.equal(await evaluate("document.querySelector('#tools [aria-pressed=true]').dataset.tool"),'rect');
  await key('L',8);
  assert.equal(await evaluate("document.querySelector('#tools [aria-pressed=true]').dataset.tool"),'ellipse','Cut honors customized Draw tool shortcuts');
  await evaluate("(async()=>{const m=await import('./draw/keymap.mjs');m.setKeyOverrides({});window.dispatchEvent(new Event('modcut-shortcuts-change'));})()");

  await key('p');
  await click(await point(400,410));
  await click(await point(450,425),8);
  await key('Enter');
  const pen=await last();near(pen.first[1],pen.last[1]);
  await key('a');
  assert.equal(await evaluate("(async()=>{const {toolCursor}=await import('./draw/tools/cursors.mjs');return document.querySelector('.bed-canvas').style.cursor===toolCursor('direct-selection');})()"),true,'Cut uses the same custom cursor as Draw');

  await key('v');
  const cutStyle=await evaluate("(() => {const s=getComputedStyle(document.querySelector('#tools [data-draw-tool]'));return [s.width,s.height,s.borderRadius,s.color,s.backgroundColor];})()");
  const shot=await command('Page.captureScreenshot',{format:'png'});
  await writeFile(join(tmpdir(),'modcut-cut-tools.png'),Buffer.from(shot.data,'base64'));
  await enterDraw(evaluate);
  assert.deepEqual(await evaluate("(() => {const s=getComputedStyle(document.querySelector('#drawWorkspace .draw-tool-grid [data-draw-tool]'));return [s.width,s.height,s.borderRadius,s.color,s.backgroundColor];})()"),cutStyle,'Cut and Draw use identical tool button styles');
  process.stdout.write('PASS Cut tools: shared rail, variants, shortcuts, constrained and centered shapes, exact line placement, selection and cancel\n');
}
