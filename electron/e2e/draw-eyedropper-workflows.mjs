import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawEyedropperWorkflows(client) {
  const {evaluate}=client,{mouse,click}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const ring=()=>evaluate(`(()=>{const r=document.querySelector('.draw-eyedropper-preview:not([hidden])');return r?{sample:r.dataset.sampledColor,current:r.dataset.currentColor}:null;})()`);
  const shift=down=>client.command('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:down?8:0});
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};})()`);
  const node=id=>evaluate(`(async()=>${active}.state.document.getNode('${id}'))()`);
  try {
    await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
    await submitNewDrawDialog(evaluate,{preset:'custom',width:140,height:90,name:'Eyedropper proof'});
    const ids=await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{defaultGradient}=await import('./draw/doc/gradient.mjs'),b=w.state.document.data.artboards[0];
      const source=shapeFromDrag('rectangle',[b.x+10,b.y+10],[b.x+70,b.y+40],{fill:'#FF0000',stroke:'#00FFFF',strokeWidth:2});
      source.appearance.fills[0].paint=defaultGradient({x:b.x+10,y:b.y+10,width:60,height:30},{stops:[{offset:0,color:{space:'rgb',values:[1,0,0]}},{offset:1,color:{space:'rgb',values:[0,0,1]}}]});source.opacity=.8;
      const target=shapeFromDrag('rectangle',[b.x+90,b.y+10],[b.x+120,b.y+40],{fill:'#00AA00',stroke:'#FF8800',strokeWidth:3});
      for(const n of [source,target])w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([target.id]);w.setTool('eyedropper');w.state.ui.paintFocus='fill';return {source:source.id,target:target.id};})()`);
    await wait(100);
    const gradientPoint=await at(40,25),before=await node(ids.target);
    await mouse('mouseMoved',gradientPoint);assert.equal(await ring(),null,'No ring without Shift');
    await shift(true);await wait(40);
    const preview=await ring();assert.ok(preview,'Pressing Shift over a stationary pointer shows the ring');
    assert.equal(preview.current.toUpperCase(),'#00AA00');
    const rgb=preview.sample.slice(1).match(/../g).map(v=>parseInt(v,16));
    assert.ok(rgb[0]>100&&rgb[2]>100&&rgb[1]<80,'Gradient preview samples its displayed intermediate colour and opacity');
    assert.deepEqual(await node(ids.target),before,'Hovering never edits the target');
    const shot=await client.command('Page.captureScreenshot',{format:'png'});
    await writeFile(join(tmpdir(),'modcut-eyedropper-ring.png'),Buffer.from(shot.data,'base64'));
    await click(gradientPoint,8);
    let target=await node(ids.target);
    const hex=await evaluate(`(async()=>{const {paintHex}=await import('./draw/doc/paint.mjs');return paintHex(${active}.state.document.getNode('${ids.target}').appearance.fills[0]).toUpperCase();})()`);
    assert.equal(hex,preview.sample,'Shift applies exactly the previewed colour as a solid fill');
    assert.deepEqual(target.appearance.strokes,before.appearance.strokes);assert.equal(target.opacity,before.opacity);assert.equal(target.blendMode,before.blendMode);
    assert.equal(target.appearance.fills[0].paint.type,'solid');
    await mouse('mouseMoved',await at(10,25),{modifiers:8});
    const strokeSample=await ring();assert.ok(strokeSample.sample.startsWith('#33'),'A cyan stroke at 80% opacity is sampled over white');
    await evaluate(`(async()=>{${active}.state.ui.paintFocus='stroke'})()`);
    const fill=target.appearance.fills;
    await click(await at(10,25),8);target=await node(ids.target);
    assert.deepEqual(target.appearance.fills,fill,'Sampling into Stroke leaves Fill intact');assert.equal(target.appearance.strokes[0].width,3,'Sampling a colour does not copy source stroke width');
    await mouse('mouseMoved',await at(80,70),{modifiers:8});assert.equal((await ring()).sample,'#FFFFFF','Blank artboard samples white');
    await shift(false);assert.equal(await ring(),null,'Releasing Shift hides the ring without pointer movement');
    await click(gradientPoint);target=await node(ids.target);
    const source=await node(ids.source);assert.deepEqual(target.appearance,source.appearance);assert.equal(target.opacity,source.opacity,'Ordinary click retains full appearance copying');
    await shift(true);await mouse('mouseMoved',gradientPoint,{modifiers:8});assert.ok(await ring());
    await evaluate(`(async()=>${active}.setTool('select'))()`);assert.equal(await ring(),null,'Changing tools immediately removes the ring');
    await evaluate(`(async()=>{const w=${active};w.setTool('eyedropper');w.select([]);w.state.ui.paintFocus='fill';})()`);
    await mouse('mouseMoved',await at(80,70),{modifiers:8});await click(await at(80,70),8);
    assert.equal(await evaluate(`(async()=>${active}.state.ui.fill)()`),'#FFFFFF','Shift samples the artboard with no selection, without requiring an object');
    await mouse('mouseMoved',{x:5,y:5},{modifiers:8});assert.equal(await ring(),null,'Leaving the canvas hides the ring');
    await mouse('mouseMoved',gradientPoint,{modifiers:8});assert.ok(await ring());
    await evaluate("window.dispatchEvent(new Event('blur'))");assert.equal(await ring(),null,'Losing focus clears the ring');
    console.log('PASS Eyedropper: Shift ring, stationary modifier changes, gradient/stroke/background sampling, focused paint only, normal appearance copying, tool changes, leave and blur');
  } finally {await shift(false);await restore();}
}
