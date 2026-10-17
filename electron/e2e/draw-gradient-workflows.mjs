import assert from 'node:assert/strict';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.3 gradients: Period applies one, the Gradient panel edits it, the Gradient tool drags it, export and Cut follow. */
export async function runDrawGradientWorkflows(client) {
  const {evaluate}=client,{drag}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Gradient proof'});
  const root='.draw-project[style*=block]',fly=`${root} .draw-flyout`;
  const until=async(expression,label)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${label}`);};
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const id=await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),b=w.state.document.data.artboards[0];
    const n=shapeFromDrag('rectangle',[b.x+10,b.y+10],[b.x+90,b.y+50],{fill:'#FF0000',stroke:null,strokeWidth:.5});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  const paint=()=>evaluate(`(async()=>(${active}.state.document.getNode('${id}').appearance.fills[0].paint))()`);
  const pixel=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:72});const img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return [...g.getImageData(Math.round(${x}/25.4*72),Math.round(${y}/25.4*72),1,1).data];})()`);
  // Period applies white to black across the object and opens the Gradient panel; one undo step.
  let steps=await applied();
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'.',code:'Period',bubbles:true,cancelable:true}))");
  await until(`!document.querySelector('${fly}').hidden&&!!document.querySelector('${fly} [data-draw-field=gradient-type]')`,'Gradient panel');
  let g=await paint();assert.equal(g.type,'linear');assert.equal(g.stops.length,2);assert.equal(await applied(),steps+1);
  const left=await pixel(12,30),right=await pixel(88,30);assert.ok(left[0]>230&&right[0]<25,`White to black: ${left} ${right}`);
  assert.match(await evaluate(`document.querySelector('${root} [data-draw-open=fill]').textContent`),/linear gradient/,'Properties names the gradient');
  // Panel: add a stop, colour it, reverse, then radial.
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-action=add]').click()`);
  g=await paint();assert.equal(g.stops.length,3);assert.equal(g.stops[1].offset,.5);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-stop="1"]').click()`);
  await evaluate(`(()=>{const c=document.querySelector('${fly} [data-draw-field=gradient-stop-color]');c.value='#ff0000';c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  g=await paint();assert.deepEqual(g.stops[1].color.values,[1,0,0]);
  const middle=await pixel(50,30);assert.ok(middle[0]>200&&middle[1]<40,`The red stop shows in the middle: ${middle}`);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-action=reverse]').click()`);
  g=await paint();assert.deepEqual(g.stops[0].color.values,[0,0,0],'Reverse puts black first');
  await evaluate(`(()=>{const s=document.querySelector('${fly} [data-draw-field=gradient-type]');s.value='radial';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  g=await paint();assert.equal(g.type,'radial');
  // The Gradient tool: one drag sets a vertical gradient as one undo step.
  await evaluate(`(async()=>{${active}.setTool('gradient')})()`);
  await evaluate(`(()=>{const s=document.querySelector('${fly} [data-draw-field=gradient-type]');s.value='linear';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  steps=await applied();await drag(await at(50,12),await at(50,48));
  g=await paint();assert.equal(g.type,'linear');assert.ok(Math.abs(g.angle+90)<1,`Downwards drag: ${g.angle}`);assert.ok(Math.abs(g.length-36)<.5,`Length ${g.length}`);
  assert.equal(await applied(),steps+1,'The whole drag is one undo step');
  const top=await pixel(50,14),bottom=await pixel(50,46);assert.ok(Math.abs(top[0]-bottom[0])>150||Math.abs(top[2]-bottom[2])>150,`The gradient now runs vertically: ${top} ${bottom}`);
  // SVG keeps the gradient; Send to Cut uses the first stop as the layer colour.
  assert.match(await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`),/linearGradient/);
  assert.match(await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId).svg})()`),/fill="#000000"/);
  await evaluate(`(async()=>{const w=${active};w.setTool('select');w.handle('cancel')})()`);
  await restore();
  console.log('PASS Draw gradients: Period applies white to black with one undo step, Properties names it, panel stops (add, colour, reverse), radial, Gradient tool drag as one step, PNG pixels, SVG gradient, first stop for Cut');
}
