import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** Recolor: Window opens the panel; the wheel turns every colour live, Ctrl scales, Shift moves one; rules, libraries, slider, Reset. */
export async function runDrawRecolorWorkflows(client) {
  const {evaluate}=client,{mouse}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const shots=process.env.MODCUT_E2E_SHOTS||tmpdir(),screenshot=async name=>{const s=await client.command('Page.captureScreenshot',{format:'png'});await writeFile(join(shots,name),Buffer.from(s.data,'base64'));};
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Recolor proof'});
  const root='.draw-project[style*=block]',fly=`${root} .draw-panel-window:not([hidden])`;
  const until=async(expression,label)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${label}`);};
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const ids=await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),b=w.state.document.data.artboards[0],ids=[];
    for(const [x,fill] of [[5,'#E03030'],[42,'#3060D0'],[79,'#F0C020']]){const n=shapeFromDrag('rectangle',[b.x+x,b.y+10],[b.x+x+34,b.y+60],{fill,stroke:'#000000',strokeWidth:1});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));ids.push(n.id);}
    w.select(ids);return ids;})()`);
  const fills=()=>evaluate(`(async()=>{const w=${active},{rgbHex}=await import('./draw/doc/recolor.mjs');return ${JSON.stringify(ids)}.map(id=>rgbHex(w.state.document.getNode(id).appearance.fills[0].paint.color.values));})()`);
  const stroke=()=>evaluate(`(async()=>{const w=${active},{rgbHex}=await import('./draw/doc/recolor.mjs');return rgbHex(w.state.document.getNode('${ids[0]}').appearance.strokes[0].paint.color.values);})()`);
  const handle=i=>evaluate(`(()=>{const r=document.querySelector('${fly} [data-draw-recolor-handle="${i}"] circle:last-child').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const wheel=()=>evaluate(`(()=>{const r=document.querySelector('${fly} [data-draw-recolor-wheel]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,radius:r.width/2}})()`);
  const original=await fills();
  // Window > Recolor opens the panel; one handle per colour (three fills and the black stroke).
  assert.equal(await evaluate("window.modcut.clickE2EMenuItem('Window','Recolor')"),true,'Recolor appears in Window');
  await until(`document.querySelectorAll('${fly} [data-draw-recolor-handle]').length===4`,'Recolor wheel handles');
  assert.equal(await evaluate(`document.querySelectorAll('${fly} [data-draw-recolor-color]').length`),4,'Prominent colours');
  await screenshot('modcut-recolor-panel.png');
  // Drag a colour round the wheel: every colour turns live, black stays, one undo step.
  const base=await evaluate(`Number(document.querySelector('${fly} .draw-recolor-handle.is-base').dataset.drawRecolorHandle)`);
  let c=await wheel(),h=await handle(base),steps=await applied();
  const turn=(p,deg)=>{const a=deg*Math.PI/180,dx=p.x-c.x,dy=p.y-c.y;return {x:c.x+dx*Math.cos(a)-dy*Math.sin(a),y:c.y+dx*Math.sin(a)+dy*Math.cos(a)};};
  await mouse('mouseMoved',h);await mouse('mousePressed',h,{buttons:1});
  await mouse('mouseMoved',turn(h,40),{buttons:1});
  const live=await fills();assert.ok(live.every((hex,i)=>hex!==original[i]),`Live while dragging: ${live}`);
  await screenshot('modcut-recolor-dragging.png');
  await mouse('mouseMoved',turn(h,90),{buttons:1});await mouse('mouseReleased',turn(h,90));
  const turned=await fills();assert.ok(turned.every((hex,i)=>hex!==original[i]),`Turned: ${turned}`);
  assert.equal(await stroke(),'#000000','Black has no hue and stays');assert.equal(await applied(),steps+1,'A wheel drag is one undo step');
  // Shift: only the dragged colour moves.
  // Colours are ordered by use: the black stroke (three times) first, then the fills.
  const other=[1,2,3].find(i=>i!==base);
  const before=await fills();h=await handle(other);
  await mouse('mouseMoved',h,{modifiers:8});await mouse('mousePressed',h,{buttons:1,modifiers:8});
  await mouse('mouseMoved',turn(h,-60),{buttons:1,modifiers:8});await mouse('mouseReleased',turn(h,-60),{modifiers:8});
  const single=await fills(),changed=single.map((hex,i)=>hex!==before[i]);
  assert.equal(changed.filter(Boolean).length,1,`Shift moves one colour: ${before} → ${single}`);
  // Ctrl: drag inward lowers saturation of every colour.
  const sat=async()=>evaluate(`(async()=>{const {hexWheel}=await import('./draw/doc/recolor.mjs');return (${JSON.stringify(await fills())}).map(h=>hexWheel(h)[1]);})()`);
  const satBefore=await sat();h=await handle(base);c=await wheel();
  const inward={x:c.x+(h.x-c.x)*.45,y:c.y+(h.y-c.y)*.45};
  await mouse('mouseMoved',h,{modifiers:2});await mouse('mousePressed',h,{buttons:1,modifiers:2});await mouse('mouseMoved',inward,{buttons:1,modifiers:2});await mouse('mouseReleased',inward,{modifiers:2});
  const satAfter=await evaluate(`(async()=>{const {hexWheel}=await import('./draw/doc/recolor.mjs');return (${JSON.stringify(await fills())}).map(h=>hexWheel(h)[1]);})()`);
  assert.ok(satAfter.every((s,i)=>s<satBefore[i]-.1),`Ctrl drag in lowers saturation: ${satBefore} → ${satAfter}`);
  // Harmony rule: Triad puts the colours on three hues; Reset brings the originals back.
  await evaluate(`document.querySelector('${fly} [data-draw-recolor=reset]').click()`);
  assert.deepEqual(await fills(),original,'Reset restores the colours');
  await evaluate(`document.querySelector('${fly} [data-draw-recolor-rule=complementary]').click()`);
  assert.ok(await evaluate(`document.querySelector('${fly} [data-draw-recolor-rule=complementary]').getAttribute('aria-pressed')==='true'`));
  const comp=await fills();assert.notDeepEqual(comp,original,'Complementary changes the colours');
  await screenshot('modcut-recolor-rule.png');
  // Library: every fill snaps to a Skintones colour; the wheel shows its regions.
  await evaluate(`(()=>{const s=document.querySelector('${fly} [data-draw-field=recolor-library]');s.value='skintones';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const {colors}=await evaluate("import('./draw/doc/recolor-libraries.mjs').then(m=>m.recolorLibrary('skintones'))");
  for(const hex of await fills())assert.ok(colors.includes(hex),`${hex} is a Skintones colour`);
  assert.ok(await evaluate(`document.querySelector('${fly} .draw-recolor-wheel canvas').classList.contains('is-library')`));
  await screenshot('modcut-recolor-library.png');
  await evaluate(`(()=>{const s=document.querySelector('${fly} [data-draw-field=recolor-library]');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  // Slider: darkens every colour live; brightness mode switches the slider to saturation.
  const bri=async()=>evaluate(`(async()=>{const {hexWheel}=await import('./draw/doc/recolor.mjs');return (${JSON.stringify(await fills())}).map(h=>hexWheel(h)[2]);})()`);
  const briBefore=await bri(),beforeSlider=await fills();steps=await applied();
  await evaluate(`(()=>{const s=document.querySelector('${fly} [data-draw-field=recolor-adjust]');s.focus();for(const v of [-20,-40,-60]){s.value=String(v);s.dispatchEvent(new Event('input',{bubbles:true}));}s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const briAfter=await bri();assert.ok(briAfter.every((b,i)=>b<briBefore[i]-.2),`Slider darkens: ${briBefore} → ${briAfter}`);
  assert.equal(await applied(),steps+1,'A slider drag is one undo step');
  await evaluate(`document.querySelector('${fly} [data-draw-recolor-mode=brightness]').click()`);
  assert.equal(await evaluate(`document.querySelector('${fly} [data-draw-field=recolor-adjust]').getAttribute('aria-label')`),'Adjust saturation');
  await screenshot('modcut-recolor-brightness.png');
  // Undo takes back the slider; the panel then starts over from the colours as they are.
  await evaluate(`(async()=>{${active}.state.history.undo();})()`);
  assert.deepEqual(await fills(),beforeSlider,'Undo takes back the slider');
  await until(`!!document.querySelector('${fly} [data-draw-recolor-rule=custom][aria-pressed=true]')`,'Panel restarts after undo');
  await restore();
}
