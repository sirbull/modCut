import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, submitNewDrawDialog, rememberTabs } from './draw-test-helpers.mjs';

export async function runDrawArtboardUIWorkflows(client) {
  const {evaluate}=client,{click,drag,mouse,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const savedLayout=await evaluate("localStorage.getItem('modcut.draw.panel-layout')");
  const root='.draw-project[style*=block]';
  const command=id=>evaluate(`(async()=>(${active}.handle(${JSON.stringify(id)})))()`);
  const snapshot=()=>evaluate(`(async()=>(${active}.state.snapshot()))()`);
  const screen=([x,y])=>evaluate(`(async()=>{const w=${active},p=w.scope.view.projectToView(new w.scope.Point(${x},${y})),b=w.scope.view.element.getBoundingClientRect();return{x:b.x+p.x,y:b.y+p.y}})()`);
  const screenshot=async name=>{const s=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),name),Buffer.from(s.data,'base64'));};
  const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.001,`${actual} ≈ ${expected}`);
  try {
    await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
    await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Artboard controls'});
    await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
      const n=createNode('shape',{shape:'rect',params:{x:20,y:20,width:25,height:15},appearance:appearance('#ffffff','#071411',1)});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);})()`);
    await evaluate(`document.querySelector('${root} [data-draw-panel=stroke]').click()`);await wait(100);
    assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-stroke] svg').length`),9);
    assert.match(await evaluate(`document.querySelector('${root} [data-draw-panel=stroke] use').getAttribute('href')`),/#icon-stroke-weight$/);
    await evaluate(`document.querySelector('${root} [data-draw-stroke=cap-square]').click()`);
    assert.equal((await snapshot()).layers[0].children[0].appearance.strokes[0].cap,'square');
    await evaluate(`document.querySelector('${root} [data-draw-stroke=join-bevel]').click()`);
    assert.equal((await snapshot()).layers[0].children[0].appearance.strokes[0].join,'bevel');
    await evaluate(`document.querySelector('${root} [data-draw-field=stroke-profile]').previousElementSibling.querySelector('summary').focus()`);
    await client.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await client.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait(40);
    assert.equal(await evaluate(`document.querySelectorAll('${root} .draw-stroke-choices[open] .draw-stroke-choice svg').length`),7);
    await evaluate(`document.querySelectorAll('${root} .draw-stroke-choices[open] .draw-stroke-choice')[3].click()`);
    assert.ok((await snapshot()).layers[0].children[0].appearance.strokes[0].widthProfile?.length);
    await evaluate(`document.querySelector('${root} [data-draw-field=stroke-startArrow]').previousElementSibling.querySelector('summary').click()`);
    await evaluate(`document.querySelectorAll('${root} .draw-stroke-choices[open] .draw-stroke-choice')[2].click()`);
    assert.equal((await snapshot()).layers[0].children[0].appearance.strokes[0].startArrow.type,'triangle');
    await screenshot('modcut-stroke-icons.png');
    await command('deselect');
    await evaluate(`document.querySelector('${root} [data-draw-quick=artboards]').click()`);await wait(100);
    assert.equal(await evaluate(`(async()=>(${active}.state.ui.tool))()`),'artboard');
    assert.equal(await evaluate(`document.querySelector('${root} .draw-flyout').hidden`),true);
    assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-panel=artboards],${root} [data-draw-panel=asset-export]').length`),0);
    assert.ok(await evaluate(`document.querySelector('${root} [data-draw-dock=properties] [data-draw-new-artboard]').classList.contains('btn--primary')`));
    assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-field=artboard-width]').length`),1);
    assert.ok(await evaluate(`(()=>{const p=document.querySelector('${root} [data-draw-dock=properties] .draw-dock-body');return p.scrollWidth<=p.clientWidth+1})()`),'Artboard settings fit the dock width');
    // Keep the entire original board and its controls visible at a stable zoom.
    await evaluate(`(async()=>{const w=${active};w.scope.view.zoom=2;w.scope.view.center=[60,40];w.renderer.updateView()})()`);
    const original=(await snapshot()).artboards[0],node=(await snapshot()).layers[0].children[0];
    await screenshot('modcut-artboard-properties.png');
    for(const [side,x,y] of [['top',0,-100],['right',140,0],['bottom',0,100],['left',-140,0]]) {
      const p=await evaluate(`(async()=>{const w=${active},h=w.renderer.artboardAddHandles().find(h=>h.boardId==='${original.id}'&&h.direction==='${side}');return[h.point.x,h.point.y]})()`);
      await click(await screen(p));await wait(30);
      const data=await snapshot(),copy=data.artboards.at(-1);
      assert.equal(data.artboards.length,2);assert.equal(copy.x,x);assert.equal(copy.y,y);assert.equal(copy.width,120);assert.equal(copy.height,80);
      assert.equal(data.layers[0].children.length,2);assert.notEqual(data.layers[0].children[1].id,node.id);
      await command('undo');
    }
    // Any point along an edge resizes, without moving the artwork or exposing rotation.
    const before=await snapshot();
    await drag(await screen([0,30]),await screen([-10,30]));
    let board=(await snapshot()).artboards[0];near(board.x,-10);near(board.width,130);
    assert.deepEqual((await snapshot()).layers,before.layers);await command('undo');
    await drag(await screen([120,80]),await screen([135,90]));
    board=(await snapshot()).artboards[0];near(board.width,135);near(board.height,90);await command('undo');
    assert.notEqual(await evaluate(`(async()=>{const w=${active};return w.renderer.selectionHandle(new w.scope.Point(120+12/w.scope.view.zoom,-12/w.scope.view.zoom))})()`),'rotate');
    // Double-click the canvas label, commit a new name and undo it.
    const label=await evaluate(`(async()=>{const w=${active},b=w.renderer.artboardLabelBounds('${original.id}');return[b.center.x,b.center.y]})()`),labelScreen=await screen(label);
    await click(labelScreen);
    await client.command('Input.dispatchMouseEvent',{type:'mousePressed',x:labelScreen.x,y:labelScreen.y,button:'left',buttons:1,clickCount:2});
    await client.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:labelScreen.x,y:labelScreen.y,button:'left',buttons:0,clickCount:2});
    assert.ok(await evaluate("!!document.querySelector('.draw-artboard-rename')"));
    await evaluate("document.querySelector('.draw-artboard-rename').value='Renamed artboard'");await key('Enter');
    assert.equal((await snapshot()).artboards[0].name,'Renamed artboard');await command('undo');
    // Draw a new board on empty canvas and select the original again.
    await evaluate(`(async()=>{const w=${active};w.scope.view.zoom=1;w.scope.view.center=[100,60];w.renderer.updateView()})()`);
    await drag(await screen([180,110]),await screen([230,145]));
    board=(await snapshot()).artboards.at(-1);near(board.width,50);near(board.height,35);
    await click(await screen([50,40]));
    assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=artboard-name]').value`),original.name);
    // File owns Asset Export, and its existing export controls still open.
    const menu=await evaluate('window.modcut.getE2EWorkspaceMenu()');assert.ok(menu.file.some(item=>item.label==='Asset Export…'));
    assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Window','Asset Export')"),false);
    assert.equal(await evaluate("window.modcut.clickE2EMenuItem('File','Asset Export…')"),true);await wait(80);
    assert.ok(await evaluate(`!!document.querySelector('${root} .draw-panel-window[data-draw-group=asset-export]:not([hidden])')`));
    assert.ok(await evaluate(`!!document.querySelector('${root} [data-draw-asset-export]')`));
    await screenshot('modcut-asset-export-file.png');
    console.log('PASS Artboard UI: Stroke icons and previews, Properties CTA, four adjacent copies and undo, edge/corner resize, inline rename, drawing and picking artboards, File > Asset Export');
  } finally {
    await restore();
    await evaluate(savedLayout===null ? "localStorage.removeItem('modcut.draw.panel-layout')" : `localStorage.setItem('modcut.draw.panel-layout',${JSON.stringify(savedLayout)})`);
  }
}
