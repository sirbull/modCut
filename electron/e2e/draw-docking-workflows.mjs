import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawDockingWorkflows(client) {
  const {evaluate,command}=client,{mouse,drag,click,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const stored=await evaluate("localStorage.getItem('modcut.draw.panel-layout')"),root='.draw-project[style*=block]';
  const state=()=>evaluate(`(async()=>structuredClone(${active}.state.ui.panelLayout))()`);
  const handle=id=>evaluate(`(async()=>(${active}.handle('${id}')))()`);
  const box=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const point=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`);const b=await box(selector);return{x:b.x+b.width/2,y:b.y+b.height/2};};
  const dock=id=>`${root} .draw-dock-column [data-draw-dock="${id}"]`;
  const heading=id=>`${dock(id)} ${['properties','layers'].includes(id)?'.draw-dock-header':'.draw-flyout__tab'}`;
  const rail=id=>`${root} .draw-panel-rail [data-draw-panel="${id}"]`;
  const shape=()=>evaluate(`(async()=>JSON.stringify(${active}.state.snapshot()))()`);
  const column=async index=>{const id=(await state()).columns[index].id;return `${root} [data-draw-dock-column="${id}"]`;};
  const shot=async name=>{const s=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),name),Buffer.from(s.data,'base64'));};
  const drop=async (start,end,kind)=>{
    await mouse('mouseMoved',start);await mouse('mousePressed',start,{buttons:1});await mouse('mouseMoved',end,{buttons:1});
    if(kind)assert.equal(await evaluate(`(()=>{const l=document.querySelector('${root} .draw-panel-drop-line');return l.hidden?null:l.dataset.dropKind})()`),kind,'A docking line previews the exact destination before release');
    if(kind)await shot(`modcut-dock-preview-${kind}.png`);
    await mouse('mouseReleased',end);await wait(100);
  };
  try {
    await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");await submitNewDrawDialog(evaluate,{name:'Docking proof'});
    await handle('workspace-reset');await wait(100);const original=await shape();
    await click(await point(rail('stroke')));
    let layers=await box(dock('layers'));
    await drop(await point(`${root} .draw-flyout[data-draw-group=stroke] .draw-flyout__tab`),{x:layers.x+layers.width/2,y:layers.y+2},'dock');
    assert.deepEqual((await state()).columns.map(c=>c.panels),[['properties','stroke','layers']]);
    assert.ok((await box(dock('stroke'))).height>80);
    const strokeBefore=await box(dock('stroke')),layersBefore=await box(dock('layers'));
    const separator=`${root} .draw-dock-splitter[aria-label="Resize Stroke and Layers"]`,grip=await point(separator);
    await drag(grip,{x:grip.x,y:grip.y+35});
    assert.ok((await box(dock('stroke'))).height>strokeBefore.height+25);assert.ok((await box(dock('layers'))).height<layersBefore.height-25);
    await shot('modcut-docked-stack.png');

    // A vertical edge creates a new, permanently open column beside Properties/Layers.
    let c=await box(await column(0));
    await drop(await point(heading('stroke')),{x:c.x+2,y:c.y+c.height/2},'column');
    assert.deepEqual((await state()).columns.map(c=>c.panels),[['stroke'],['properties','layers']]);
    const iconRail=await box(`${root} .draw-panel-rail`);
    await drop(await point(heading('stroke')),{x:iconRail.x-2,y:iconRail.y+iconRail.height/2},'column');
    assert.equal((await state()).columns[0].side,'before-rail','The Illustrator-style edge before the icon rail accepts a full-height column');
    await shot('modcut-docked-stroke-column.png');
    c=await box(await column(0));
    await drop(await point(rail('color')),{x:c.x+c.width/2,y:c.y+c.height-20},'dock');
    assert.deepEqual((await state()).columns[0].panels,['stroke','color']);
    const color=await box(dock('color'));
    await drop(await point(heading('properties')),{x:color.x+color.width/2,y:color.y+2},'dock');
    assert.deepEqual((await state()).columns.map(c=>c.panels),[['stroke','properties','color'],['layers']]);
    assert.equal(await evaluate(`document.querySelectorAll('${root} [data-draw-dock=properties]').length`),1,'Properties moves its existing controls');
    assert.equal(await evaluate(`document.querySelectorAll('${root} [role=tree]').length`),1,'Layers has one live tree');

    const stage=await box(`${root} .draw-stage`),free={x:stage.x+45,y:stage.y+55};
    await drop(await point(heading('layers')),free);
    assert.ok((await state()).floating.layers);assert.equal((await state()).columns.length,1);
    await click(await point(`${root} .draw-floating-panel[data-draw-group=layers] [aria-label="Dock panel"]`));
    assert.equal((await state()).floating.layers,undefined);assert.equal((await state()).columns[0].panels.at(-1),'layers');
    c=await box(await column(0));
    await drop(await point(heading('layers')),{x:c.x+c.width-2,y:c.y+c.height/2},'column');
    assert.deepEqual((await state()).columns.map(c=>c.panels),[['stroke','properties','color'],['layers']]);
    await click(await point(`${dock('stroke')} [aria-label="Collapse to icons"]`));
    assert.ok((await state()).rail.includes('stroke'));assert.ok(!(await state()).dock.includes('stroke'));
    await click(await point(rail('stroke')));await click(await point(`${root} .draw-flyout[data-draw-group=stroke] [aria-label="Dock panel"]`));
    assert.equal((await state()).columns[1].panels.at(-1),'stroke','Dock keeps the panel open instead of returning it to an icon');

    // Column width, cancellation, and saved workspaces retain the complete layout.
    const beforeWidth=(await state()).columns[0].width,edge=await point(`${await column(0)} > .draw-dock-column-resizer`);
    await drag(edge,{x:edge.x-35,y:edge.y});assert.ok((await state()).columns[0].width>beforeWidth+25);
    const beforeCancel=await state(),start=await point(heading('color'));
    await mouse('mouseMoved',start);await mouse('mousePressed',start,{buttons:1});await mouse('mouseMoved',free,{buttons:1});await key('Escape');await mouse('mouseReleased',free);
    assert.deepEqual(await state(),beforeCancel);
    assert.equal(await shape(),original,'Panel positioning does not edit the drawing');
    await evaluate(`(async()=>{const w=${active},m=await import('./draw/ui/workspaces.mjs');w.dockProof=m.captureWorkspace(w.state.ui,'Dock proof');})()`);
    const saved=await state();await handle('workspace-reset');
    await evaluate(`(async()=>{const w=${active},m=await import('./draw/ui/workspaces.mjs');m.applyWorkspace(w.state.ui,w.dockProof);w.handle('deselect');})()`);
    assert.deepEqual(await state(),saved);await shot('modcut-docked-columns.png');
    await evaluate("document.querySelector('#newDoc').click()");await submitNewDrawDialog(evaluate,{name:'Restored docks'});
    assert.deepEqual(await state(),saved,'New documents restore the saved columns, order, heights and widths');
    await command('Emulation.setDeviceMetricsOverride',{width:900,height:650,deviceScaleFactor:1,mobile:false});await wait(150);
    const canvas=await box(`${root} .draw-stage`);assert.ok(canvas.width>=170,'The drawing area retains space on smaller screens');
    await shot('modcut-docked-small.png');await command('Emulation.clearDeviceMetricsOverride');
    console.log('PASS panel docking: insertion preview, stacked panels, independent columns, movable Properties/Layers, height and width resize, icon collapse, pin, cancellation and workspace persistence');
  } finally {
    await command('Emulation.clearDeviceMetricsOverride');await handle('workspace-reset');await restore();
    await evaluate(stored===null?"localStorage.removeItem('modcut.draw.panel-layout')":`localStorage.setItem('modcut.draw.panel-layout',${JSON.stringify(stored)})`);
  }
}
