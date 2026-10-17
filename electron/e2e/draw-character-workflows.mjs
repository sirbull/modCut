import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.1e Character and Paragraph panels, Properties and control bar type fields. */
export async function runDrawCharacterWorkflows(client) {
  const {evaluate}=client,restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:160,height:100,name:'Character proof'});
  const root='.draw-project[style*=block]',fly=`${root} .draw-flyout`;
  const until=async(expression,label)=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${label}`);};
  const node=id=>evaluate(`(async()=>(${active}.state.document.getNode('${id}')))()`);
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const set=(selector,value)=>evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});if(i.type==='checkbox')i.checked=${JSON.stringify(value)};else i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  // Two installed families, the first with Bold.
  const [familyA,familyB]=await evaluate("(async()=>{const f=await window.modcut.listSystemFonts(),has=(n,w)=>f.some(x=>x.family===n&&x.fontWeight===w&&x.fontStyle==='normal');const names=[...new Set(f.map(x=>x.family))].filter(n=>has(n,'normal'));const a=names.find(n=>has(n,'bold'));return [a,names.find(n=>n!==a)];})()");
  assert.ok(familyA&&familyB,'Two installed font families are needed');
  const ids=await evaluate(`(async()=>{const w=${active},{pointText,textValues,DEFAULT_CHARACTER}=await import('./draw/doc/text.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),b=w.state.document.data.artboards[0],out=[];
    for(const [text,y] of [['Horten modCut',30],['Laser',70]]){const n=pointText([b.x+10,b.y+y],{text,...DEFAULT_CHARACTER,fontFamily:${JSON.stringify(familyA)},alignment:'left'});
      n.layout=await window.modcut.shapeText(textValues(n));n.character.fontPostscriptName=n.layout.font.postscriptName;w.state.history.execute(insertNode(w.state.document.data.layers[0].id,n));out.push(n.id);}
    w.select([out[0]]);return out;})()`);
  const first=await node(ids[0]);
  // Mod+T opens Character in the Type group, as in Illustrator.
  const mod=process.platform==='darwin'?'metaKey':'ctrlKey';
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',code:'KeyT',bubbles:true,cancelable:true,${mod}:true}))`);
  await until(`!document.querySelector('${fly}').hidden&&!!document.querySelector('${fly} [data-draw-field=font-size]')`,'Character panel from Mod+T');
  assert.ok(await evaluate(`!!document.querySelector('${root} [data-draw-field=prop-font-size]')`),'Properties shows Character for text');
  assert.ok(await evaluate(`!!document.querySelector('${root} .draw-control-bar [data-draw-field=cb-font-size]')`),'The control bar shows the font size');
  // Size: shaped again, one undo step, the line twice as wide.
  let steps=await applied();
  await set(`${fly} [data-draw-field=font-size]`,48);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.fontSize===48))()`,'font size applied');
  let n=await node(ids[0]);assert.ok(Math.abs(n.layout.lineWidths[0]-2*first.layout.lineWidths[0])<1e-6);assert.equal(await applied(),steps+1);
  // Tracking and All Caps change the shaped glyphs, never the content.
  await set(`${fly} [data-draw-field=tracking]`,100);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.tracking===100))()`,'tracking applied');
  const tracked=await node(ids[0]);assert.ok(tracked.layout.lineWidths[0]>n.layout.lineWidths[0]);
  await set(`${fly} [data-draw-field=all-caps]`,true);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.allCaps===true))()`,'All Caps applied');
  n=await node(ids[0]);assert.equal(n.content.runs[0].text,'Horten modCut');assert.notDeepEqual(n.layout.glyphs.map(g=>g.glyphId),tracked.layout.glyphs.map(g=>g.glyphId));
  // Horizontal scale widens the line; baseline shift and kerning are stored and shaped; each is one undo step.
  steps=await applied();const before=n.layout.lineWidths[0];
  await set(`${fly} [data-draw-field=horizontal-scale]`,150);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.horizontalScale===150))()`,'horizontal scale applied');
  n=await node(ids[0]);assert.ok(n.layout.lineWidths[0]>before*1.4,`Wider by the scale: ${n.layout.lineWidths[0]} vs ${before}`);assert.equal(await applied(),steps+1);
  await set(`${fly} [data-draw-field=baseline-shift]`,4);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.baselineShift===4))()`,'baseline shift applied');
  await set(`${fly} [data-draw-field=kerning]`,'none');
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.kerning==='none'))()`,'kerning applied');
  await evaluate(`(async()=>{${active}.handle('undo');${active}.handle('undo');${active}.handle('undo')})()`);
  n=await node(ids[0]);assert.deepEqual([n.character.horizontalScale,n.character.baselineShift,n.character.kerning],[undefined,undefined,undefined],'Three undo steps restore the defaults');
  // Weight picks the real Bold face; another family replaces the face.
  await set(`${fly} [data-draw-field=font-weight]`,'bold');
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.fontWeight==='bold'))()`,'Bold applied');
  const bold=await node(ids[0]);assert.notEqual(bold.character.fontPostscriptName,first.character.fontPostscriptName);
  await set(`${fly} [data-draw-field=font-family]`,familyB);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').character.fontFamily===${JSON.stringify(familyB)}))()`,'family applied');
  steps=await applied();
  await set(`${fly} [data-draw-field=font-family]`,'No Such Font Family');
  await until("[...document.querySelectorAll('.toast')].some(t=>/not installed/.test(t.textContent))",'unknown family is refused');
  assert.equal(await applied(),steps);assert.equal((await node(ids[0])).character.fontFamily,familyB);
  // Undo reverts only the last change.
  await evaluate(`(async()=>{${active}.handle('undo')})()`);assert.equal((await node(ids[0])).character.fontFamily,familyA);
  await evaluate(`(async()=>{${active}.handle('redo')})()`);
  // Paragraph: alignment for both selected texts in one step.
  await evaluate(`(async()=>{const w=${active};w.select(${JSON.stringify(ids)});})()`);
  await evaluate(`[...document.querySelectorAll('${fly} [role=tab]')].find(t=>t.textContent==='Paragraph').click()`);
  await until(`!!document.querySelector('${fly} [data-draw-paragraph=center]')`,'Paragraph tab');
  steps=await applied();
  await evaluate(`document.querySelector('${fly} [data-draw-paragraph=center]').click()`);
  await until(`(async()=>{const d=${active}.state.document;return ${JSON.stringify(ids)}.every(id=>d.getNode(id).paragraph.alignment==='center')})()`,'both texts centred');
  assert.equal(await applied(),steps+1,'One undo step for the whole selection');
  assert.equal(await evaluate(`document.querySelector('${fly} [data-draw-paragraph=center]').getAttribute('aria-pressed')`),'true');
  // The control bar size field applies to the selection as well.
  await set(`${root} .draw-control-bar [data-draw-field=cb-font-size]`,30);
  await until(`(async()=>{const d=${active}.state.document;return ${JSON.stringify(ids)}.every(id=>d.getNode(id).character.fontSize===30)})()`,'control bar size');
  // Saved, exported and sent text uses the new glyphs.
  assert.equal(await evaluate(`(async()=>{const w=${active},{createProjectDraw}=await import('./draw/io/project.mjs');return createProjectDraw(JSON.parse(w.state.document.serialize())).document.serialize()===w.state.document.serialize()})()`),true);
  const svg=await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`);assert.match(svg,/<path[\s>]/);
  await evaluate(`(async()=>{${active}.handle('cancel')})()`);
  await restore();
  console.log('PASS Draw Character and Paragraph: Mod+T, size, tracking, All Caps, horizontal scale, baseline shift, kerning, Bold face, family and unknown family, one undo step each, Paragraph alignment for several texts, Properties and control bar fields, save and export');
}
