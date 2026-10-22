import assert from 'node:assert/strict';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.3 gradients: Period applies one, the Gradient panel edits it, the Gradient tool drags it, export and Cut follow. */
export async function runDrawGradientWorkflows(client) {
  const {evaluate}=client,{drag,click,mouse}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Gradient proof'});
  await evaluate("localStorage.removeItem('modcut_recent_gradients')");
  const root='.draw-project[style*=block]',fly=`${root} .draw-panel-window:not([hidden])`;
  const until=async(expression,label)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${label} ${await evaluate(`(()=>{const f=document.querySelector('${fly}');return (f?.hidden)+' '+(f?.innerText??'').slice(0,400)+' ERR '+(document.querySelector('.toast,[role=alert]')?.textContent??'')})()`)}`);};
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const centre=selector=>evaluate(`(()=>{const r=document.querySelector('${fly} ${selector}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,width:r.width,bottom:r.bottom}})()`);
  const id=await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),b=w.state.document.data.artboards[0];
    const n=shapeFromDrag('rectangle',[b.x+10,b.y+10],[b.x+90,b.y+50],{fill:'#FF0000',stroke:null,strokeWidth:.5});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  const paint=()=>evaluate(`(async()=>(${active}.state.document.getNode('${id}').appearance.fills[0].paint))()`);
  const pixel=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],url=w.exportBoard(b.id,'png',{ppi:72});const img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return [...g.getImageData(Math.round(${x}/25.4*72),Math.round(${y}/25.4*72),1,1).data];})()`);
  // Period applies white to black across the object and opens the Gradient panel; one undo step.
  let steps=await applied();
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'.',code:'Period',bubbles:true,cancelable:true}))");
  await until(`!!document.querySelector('${fly} [data-draw-gradient-type=linear][aria-pressed=true]')`,'Gradient panel');
  let g=await paint();assert.equal(g.type,'linear');assert.equal(g.stops.length,2);assert.equal(await applied(),steps+1);
  const left=await pixel(12,30),right=await pixel(88,30);assert.ok(left[0]>230&&right[0]<25,`White to black: ${left} ${right}`);
  assert.match(await evaluate(`document.querySelector('${root} [data-draw-open=fill]').textContent`),/linear gradient/,'Properties names the gradient');
  // Recent shows the gradient just applied; Presets list the built-in gradients.
  assert.equal(await evaluate(`document.querySelectorAll('${fly} [data-draw-gradient-preset^=recent-]').length`),1,'One recent gradient');
  assert.ok(await evaluate(`document.querySelectorAll('${fly} [data-draw-gradient-preset^=preset-]').length`)>=8,'Preset tiles');
  // Panel: add a stop, colour it, reverse, then radial.
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-action=add]').click()`);
  g=await paint();assert.equal(g.stops.length,3);assert.equal(g.stops[1].offset,.5);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-stop="1"]').click()`);
  await evaluate(`(()=>{const c=document.querySelector('${fly} [data-draw-field=gradient-stop-color]');c.value='#ff0000';c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  g=await paint();assert.deepEqual(g.stops[1].color.values,[1,0,0]);
  const middle=await pixel(50,30);assert.ok(middle[0]>200&&middle[1]<40,`The red stop shows in the middle: ${middle}`);
  // Slider with the mouse: drag the red stop to 25 % (one undo step, live), click the bar at 75 % to add, drag a stop off to delete.
  let bar=await centre('.draw-gradient-bar'),marker=await centre('[data-draw-gradient-stop="1"]');
  steps=await applied();
  await mouse('mouseMoved',marker);await mouse('mousePressed',marker,{buttons:1});
  await mouse('mouseMoved',{x:bar.left+bar.width*.35,y:marker.y},{buttons:1});
  g=await paint();assert.ok(Math.abs(g.stops[1].offset-.35)<.03,`Live while dragging: ${g.stops[1].offset}`);
  await mouse('mouseMoved',{x:bar.left+bar.width*.25,y:marker.y},{buttons:1});await mouse('mouseReleased',{x:bar.left+bar.width*.25,y:marker.y});
  g=await paint();assert.ok(Math.abs(g.stops[1].offset-.25)<.03,`Dragged stop: ${g.stops[1].offset}`);assert.deepEqual(g.stops[1].color.values,[1,0,0]);
  assert.equal(await applied(),steps+1,'A stop drag is one undo step');
  await click({x:bar.left+bar.width*.75,y:bar.y});
  g=await paint();assert.equal(g.stops.length,4,'Clicking the bar adds a stop');assert.ok(g.stops.some(s=>Math.abs(s.offset-.75)<.03));
  marker=await centre('[data-draw-gradient-stop="2"]');steps=await applied();
  await mouse('mouseMoved',marker);await mouse('mousePressed',marker,{buttons:1});
  await mouse('mouseMoved',{x:marker.x,y:marker.y+60},{buttons:1});
  assert.ok(await evaluate(`!!document.querySelector('${fly} .draw-gradient-stop.is-removing')`),'Marked for removal while away from the bar');
  await mouse('mouseReleased',{x:marker.x,y:marker.y+60});
  g=await paint();assert.equal(g.stops.length,3,'Dragging a stop off deletes it');assert.equal(await applied(),steps+1);
  assert.ok(await evaluate(`document.querySelectorAll('${fly} [data-draw-gradient-preset^=recent-]').length`)>=2,'Drags reach Recent when they end');
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-action=reverse]').click()`);
  g=await paint();assert.deepEqual(g.stops[0].color.values,[0,0,0],'Reverse puts black first');
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-type=radial]').click()`);
  g=await paint();assert.equal(g.type,'radial');assert.equal(g.stops.length,3,'Type keeps the stops');
  // A preset of the same type keeps the vector; Sunset gives three stops.
  const before=g.origin;await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="Sunset"]').click()`);
  g=await paint();assert.equal(g.type,'linear');assert.equal(g.stops.length,3);assert.deepEqual(g.stops[0].color.values.map(v=>Math.round(v*255)),[255,230,0]);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="Ember"]').click()`);
  g=await paint();assert.equal(g.type,'radial');assert.deepEqual(g.origin,before,'Ember is fitted around the centre');
  // The Gradient tool: one drag sets a vertical gradient as one undo step.
  await evaluate(`(async()=>{${active}.setTool('gradient')})()`);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-type=linear]').click()`);
  steps=await applied();await drag(await at(50,12),await at(50,48));
  g=await paint();assert.equal(g.type,'linear');assert.ok(Math.abs(g.angle+90)<1,`Downwards drag: ${g.angle}`);assert.ok(Math.abs(g.length-36)<.5,`Length ${g.length}`);
  assert.equal(await applied(),steps+1,'The whole drag is one undo step');
  const top=await pixel(50,14),bottom=await pixel(50,46);assert.ok([0,1,2].reduce((sum,i)=>sum+Math.abs(top[i]-bottom[i]),0)>250,`The gradient now runs vertically: ${top} ${bottom}`);
  // Stroke gradients: within (across the box, the default), along and across the stroke, with the panel's Stroke buttons.
  await evaluate(`(async()=>{${active}.setTool('select')})()`);
  const line=await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs'),b=w.state.document.data.artboards[0];
    const look=appearance(null,'#00FF00',4);look.strokes[0].cap='butt';look.strokes[0].join='miter';
    const n=createNode('path',{subpaths:[{closed:false,segments:[[10,62],[110,62],[110,74],[10,74]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:look});
    w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));w.select([n.id]);return n.id;})()`);
  const strokePaint=()=>evaluate(`(async()=>(${active}.state.document.getNode('${line}').appearance.strokes[0].paint))()`);
  await evaluate(`document.querySelector('${fly} [data-draw-paint-target=stroke]').click()`);
  await until(`document.querySelector('${fly} [data-draw-paint-target=stroke]')?.getAttribute('aria-pressed')==='true'`,'Stroke target');
  assert.ok(await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="White, Black"]')&&!document.querySelector('${fly} [data-draw-gradient-stroke]')`),'No Stroke buttons before the stroke has a gradient');
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-preset][aria-label="White, Black"]').click()`);
  await until(`document.querySelector('${fly} [data-draw-gradient-stroke=within]')?.getAttribute('aria-pressed')==='true'`,'Within by default');
  const lum=p=>p[0]+p[1]+p[2];
  let topStart=await pixel(14,62),bottomEnd=await pixel(14,74);
  assert.ok(lum(topStart)>600&&lum(bottomEnd)>600,`Within: both left ends are white: ${topStart} ${bottomEnd}`);
  steps=await applied();await evaluate(`document.querySelector('${fly} [data-draw-gradient-stroke=along]').click()`);
  assert.equal((await strokePaint()).strokeMode,'along');assert.equal(await applied(),steps+1);
  topStart=await pixel(14,62);bottomEnd=await pixel(14,74);const corner=await pixel(108,68);
  assert.ok(lum(topStart)>600&&lum(bottomEnd)<120,`Along: white at the start, black at the end: ${topStart} ${bottomEnd}`);
  assert.ok(lum(corner)>200&&lum(corner)<560,`Along: grey halfway: ${corner}`);
  await evaluate(`document.querySelector('${fly} [data-draw-gradient-stroke=across]').click()`);
  assert.equal((await strokePaint()).strokeMode,'across');
  const upper=await pixel(50,60.7),lower=await pixel(50,63.3),far=await pixel(100,60.7);
  assert.ok(lum(upper)>500&&lum(lower)<250,`Across: the left edge is white, the right edge black: ${upper} ${lower}`);
  assert.ok(Math.abs(lum(upper)-lum(far))<60,`Across: the same along the stroke: ${upper} ${far}`);
  await evaluate(`document.querySelector('${fly} [data-draw-paint-target=fill]').click()`);
  await until(`document.querySelector('${fly} [data-draw-paint-target=fill]')?.getAttribute('aria-pressed')==='true'`,'Fill target');
  await evaluate(`(async()=>{const w=${active};w.select(['${line}'])})()`);
  assert.ok(await evaluate(`!document.querySelector('${fly} [data-draw-gradient-stroke]')`),'A fill without a gradient shows no Stroke buttons');
  await evaluate(`(async()=>{const w=${active};w.select(['${id}'])})()`);
  assert.ok(await evaluate(`[...document.querySelectorAll('${fly} [data-draw-gradient-stroke]')].every(b=>b.disabled)`),'Stroke buttons are for strokes only');
  // SVG keeps the gradient; Send to Cut uses the first stop as the layer colour.
  assert.match(await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`),/linearGradient/);
  assert.match(await evaluate(`(async()=>{const w=${active};return w.cutSvg(w.state.ui.artboardId).svg})()`),/fill="#FFF3B0"/);
  await evaluate(`(async()=>{const w=${active};w.setTool('select');w.handle('cancel')})()`);
  await restore();
  console.log('PASS Draw gradients: Period applies white to black with one undo step, Properties names it, Recent and Presets, panel stops (add, colour, mouse drag, click to add, drag off to delete, reverse), type buttons, stroke within/along/across with pixels, presets keep the vector, Gradient tool drag as one step, PNG pixels, SVG gradient, first stop for Cut');
}
