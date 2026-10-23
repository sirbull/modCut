import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawMeasureWorkflows(client) {
  const {evaluate}=client,{mouse,drag}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};})()`);
  const badge=()=>evaluate(`(()=>{const b=document.querySelector('.draw-project[style*=block] .draw-measure-label'),r=b.getBoundingClientRect();return {text:b.textContent,hidden:b.hidden,x:r.x,y:r.y,width:r.width,height:r.height,side:b.dataset.side};})()`);
  const snapshot=()=>evaluate(`(async()=>JSON.stringify(${active}.state.document.data))()`);
  try {
    await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
    await submitNewDrawDialog(evaluate,{preset:'custom',units:'cm',width:14,height:9,name:'Measure proof'});
    await evaluate(`(async()=>${active}.setTool('measure'))()`);
    await wait(150);
    const before=await snapshot(),a=await at(20,30),b=await at(80,30);
    await mouse('mouseMoved',a);await mouse('mousePressed',a,{buttons:1});await mouse('mouseMoved',b,{buttons:1});
    assert.equal((await badge()).text,'6.00 cm','Length updates while dragging, in document units');
    await mouse('mouseReleased',b);await wait(40);
    const initial=await badge();assert.equal(initial.hidden,false);assert.ok(initial.y>b.y,'Horizontal measurements start below the line');
    await mouse('mouseMoved',{x:initial.x+initial.width/2,y:initial.y+initial.height/2});
    const flipped=await badge();assert.notEqual(flipped.side,initial.side);assert.ok(flipped.y+flipped.height<b.y,'Hover moves the badge across the measurement line');
    await wait(80);assert.equal((await badge()).side,flipped.side,'The label stays put after the pointer leaves its old position');
    await mouse('mouseMoved',{x:flipped.x+flipped.width/2,y:flipped.y+flipped.height/2});assert.equal((await badge()).side,initial.side,'Hovering the new position moves the badge back');
    assert.equal(await snapshot(),before,'Measuring and hovering leave the document unchanged');
    const shot=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-measure-label.png'),Buffer.from(shot.data,'base64'));
    const oldX=(await badge()).x;
    await evaluate(`(async()=>{const w=${active};w.scope.view.zoom*=1.2;w.scope.view.center=w.scope.view.center.add([3,2]);w.resize();})()`);
    assert.notEqual((await badge()).x,oldX,'Badge follows zoom and pan');assert.equal((await badge()).text,'6.00 cm');
    await evaluate(`(async()=>{const w=${active},{updateDocument}=await import('./draw/doc/commands.mjs');w.state.history.execute(updateDocument({units:'in'}));})()`);
    assert.equal((await badge()).text,'2.36 in','Existing measurement follows document unit changes');
    await evaluate(`(async()=>${active}.handle('undo'))()`);assert.equal((await badge()).text,'6.00 cm');
    await drag(await at(40,20),await at(40,70));
    const vertical=await badge(),mid=await at(40,45);assert.equal(vertical.text,'5.00 cm');assert.ok(vertical.x>mid.x,'Vertical measurements start beside the line');
    await mouse('mouseMoved',{x:vertical.x+vertical.width/2,y:vertical.y+vertical.height/2});
    const opposite=await badge();assert.ok(opposite.x+opposite.width<mid.x,'Vertical measurements jump to the other side too');
    await evaluate(`(async()=>{const w=${active};w.scope.view.rotation=35;w.resize();})()`);assert.equal((await badge()).text,'5.00 cm','Rotation preserves measured length');
    await evaluate(`(async()=>${active}.setTool('select'))()`);assert.equal((await badge()).hidden,true,'Changing tools clears the badge');
    console.log('PASS Measure: live length, document units, hover switches sides without flicker, horizontal/vertical lines, zoom, pan, rotation and tool cleanup');
  } finally {await restore();}
}
