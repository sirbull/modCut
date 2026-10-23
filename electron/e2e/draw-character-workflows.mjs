import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

import {inlineReady,inlineSet,finishInline} from './draw-inline-helpers.mjs';

/** D2.1e Character and Paragraph panels, Properties and control bar type fields. */
export async function runDrawCharacterWorkflows(client) {
  const {evaluate}=client,{drag,click,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:160,height:100,name:'Character proof'});
  const root='.draw-project[style*=block]';let fly=`${root} .draw-panel-window[data-draw-group=character]`;
  const until=async(expression,label)=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await wait(50);}assert.fail(`Timed out: ${label}: `+await evaluate("JSON.stringify({panels:[...document.querySelectorAll('.draw-panel-window')].map(p=>({html:p.outerHTML.slice(0,220),fields:[...p.querySelectorAll('[data-draw-field]')].map(x=>x.dataset.drawField)})),toasts:[...document.querySelectorAll('.toast')].map(t=>t.textContent)})"));};
  const node=id=>evaluate(`(async()=>(${active}.state.document.getNode('${id}')))()`);
  const applied=()=>evaluate(`(async()=>(${active}.state.history.entries.filter(e=>e.applied).length))()`);
  const set=async(selector,value)=>{if(selector.includes("font-family")){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);for(let i=0;i<100&&!await evaluate("document.querySelectorAll('.draw-font-result').length>0");i++)await wait(30);await evaluate(`(()=>{const i=document.querySelector('.draw-font-browser input');i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('input'));})()`);if(value==='No Such Font Family'){assert.equal(await evaluate("document.querySelectorAll('.draw-font-result').length"),0);await evaluate("document.querySelector('.draw-font-browser input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");return;}await evaluate(`document.querySelector('[data-font-family=${JSON.stringify(value)}]').click()`);await wait(30);return;}return evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});if(i.type==='checkbox')i.checked=${JSON.stringify(value)};else i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
  // Both families need Bold: the test changes family while Bold is still selected.
  const [familyA,familyB]=await evaluate("(async()=>{const f=await window.modcut.listSystemFonts(),has=(n,w)=>f.some(x=>x.family===n&&x.fontWeight===w&&x.fontStyle==='normal');const names=[...new Set(f.map(x=>x.family))].filter(n=>has(n,'normal')&&has(n,'bold'));const a=names[0];return [a,names.find(n=>n!==a)];})()");
  assert.ok(familyA&&familyB,'Two installed font families with Regular and Bold are needed');
  // Character and Paragraph can be configured before any artwork exists, with no dirty state or undo steps.
  const empty = await evaluate(`(async()=>${active}.state.document.serialize())()`);
  await evaluate(`(async()=>{const w=${active};w.select([]);w.handle('panel.character')})()`);
  await until(`!!document.querySelector('${fly} [data-draw-field=font-family]')`,'Character without selected text');
  await set(`${fly} [data-draw-field=font-family]`,familyA);
  await set(`${fly} [data-draw-field=font-weight]`,'bold');
  await set(`${fly} [data-draw-field=font-size]`,32);
  await set(`${fly} [data-draw-field=leading]`,40);
  await set(`${fly} [data-draw-field=tracking]`,75);
  await set(`${fly} [data-draw-field=all-caps]`,true);
  await set(`${fly} [data-draw-field=horizontal-scale]`,125);
  await evaluate(`(async()=>${active}.setTool('area-type'))()`);
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=prop-font-size]').value`),'32','Properties shows defaults for the text tool');
  await set(`${root} [data-draw-field=cb-font-size]`,30);
  assert.equal(await evaluate(`document.querySelector('${fly} [data-draw-field=font-size]').value`),'30','The control bar edits the same defaults');
  await set(`${root} [data-draw-field=prop-tracking]`,80);
  await evaluate(`(async()=>${active}.handle('panel.paragraph'))()`);fly=`${root} .draw-panel-window[data-draw-group=paragraph]`;
  await evaluate(`document.querySelector('${fly} [data-draw-paragraph=center]').click()`);
  await set(`${fly} [data-draw-field=left-indent]`,12);
  await set(`${fly} [data-draw-field=space-after]`,6);
  assert.equal(await applied(),0);assert.equal(await evaluate(`(async()=>${active}.state.dirty)()`),false);
  assert.equal(await evaluate(`(async()=>${active}.state.document.serialize())()`),empty);
  await evaluate(`document.querySelector('${fly} .draw-flyout__close').click();document.querySelector('${root} [data-draw-group=character] .draw-flyout__close')?.click()`);fly=`${root} .draw-panel-window[data-draw-group=character]`;
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()`);
  const ready=()=>inlineReady(evaluate);
  await drag(await at(12,12),await at(78,72));await ready();
  assert.deepEqual(await evaluate(`(async()=>{const u=${active}.state.ui;return [u.character.fontFamily,String(u.character.fontSize),String(u.character.leading),u.character.fontWeight,u.paragraph.alignment]})()`),[familyA,'30','40','bold','center']);
  await client.command('Input.insertText',{text:'Prepared ÆØÅ'});await ready();
  assert.notEqual(await evaluate(`(async()=>${active}.state.document.serialize())()`),empty,'Typing edits the document live');
  await finishInline(evaluate);
  await until(`(async()=>${active}.state.document.getNode(${active}.state.selection.ids[0])?.type==='text')()`,'prepared text inserted');
  const prepared=await evaluate(`(async()=>{const w=${active};return w.state.document.getNode(w.state.selection.ids[0])})()`);
  assert.equal(prepared.kind,'area');assert.equal(prepared.character.fontFamily,familyA);assert.equal(prepared.character.fontSize,30);
  assert.equal(prepared.character.fontWeight,'bold');assert.equal(prepared.character.leading,40);assert.equal(prepared.character.tracking,80);
  assert.equal(prepared.character.allCaps,true);assert.equal(prepared.character.horizontalScale,125);
  assert.deepEqual(prepared.paragraph,{alignment:'center',leftIndent:12,spaceAfter:6});
  assert.equal(prepared.content.runs[0].text,'Prepared ÆØÅ');assert.ok(prepared.layout.glyphs.length>0);assert.equal(prepared.layout.overflow,false);
  assert.equal(await applied(),1,'Preparing formatting adds no extra undo steps');
  await evaluate(`(async()=>{const w=${active};w.select([]);w.setTool('type')})()`);
  await click(await at(100,85));await ready();
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-field=prop-font-size]').value"),'30','Point text uses the same prepared settings');
  await finishInline(evaluate);
  await click(await at(100,85));await ready();
  assert.equal(await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-field=prop-font-size]').value"),'30','Cancel does not overwrite the defaults');
  await key('Escape');
  await evaluate(`(async()=>{const w=${active};w.setTool('select');w.handle('undo');w.select([])})()`);
  assert.equal(await evaluate(`(async()=>${active}.state.document.serialize())()`),empty,'Undo removes only the newly inserted text');
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

  assert.equal(await applied(),steps);assert.equal((await node(ids[0])).character.fontFamily,familyB);
  // Undo reverts only the last change.
  await evaluate(`(async()=>{${active}.handle('undo')})()`);assert.equal((await node(ids[0])).character.fontFamily,familyA);
  await evaluate(`(async()=>{${active}.handle('redo')})()`);
  // Paragraph: alignment for both selected texts in one step.
  await evaluate(`(async()=>{const w=${active};w.select(${JSON.stringify(ids)});})()`);
  await evaluate(`(async()=>${active}.handle('panel.paragraph'))()`);fly=`${root} .draw-panel-window[data-draw-group=paragraph]`;
  await until(`!!document.querySelector('${fly} [data-draw-paragraph=center]')`,'Paragraph tab');
  steps=await applied();
  await evaluate(`document.querySelector('${fly} [data-draw-paragraph=center]').click()`);
  await until(`(async()=>{const d=${active}.state.document;return ${JSON.stringify(ids)}.every(id=>d.getNode(id).paragraph.alignment==='center')})()`,'both texts centred');
  assert.equal(await applied(),steps+1,'One undo step for the whole selection');
  assert.equal(await evaluate(`document.querySelector('${fly} [data-draw-paragraph=center]').getAttribute('aria-pressed')`),'true');
  // Justify and indents: stored on the paragraph and shaped again, one undo step each.
  await evaluate(`document.querySelector('${fly} [data-draw-paragraph=justify]').click()`);
  await until(`(async()=>{const d=${active}.state.document;return ${JSON.stringify(ids)}.every(id=>d.getNode(id).paragraph.alignment==='justify')})()`,'justified');
  const beforeIndent=await node(ids[0]);
  await set(`${fly} [data-draw-field=left-indent]`,12);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').paragraph.leftIndent===12))()`,'left indent');
  const indented=await node(ids[0]),minX=l=>Math.min(...l.layout.glyphs.flatMap(g=>g.subpaths.flatMap(s=>s.segments.map(x=>x.p[0]))));
  assert.ok(Math.abs(minX(indented)-minX(beforeIndent)-12*25.4/72)<1e-6,'The left indent moves the text by 12 pt');
  await set(`${fly} [data-draw-field=space-after]`,6);
  await until(`(async()=>(${active}.state.document.getNode('${ids[0]}').paragraph.spaceAfter===6))()`,'space after');
  // The control bar size field applies to the selection as well.
  await set(`${root} .draw-control-bar [data-draw-field=cb-font-size]`,30);
  await until(`(async()=>{const d=${active}.state.document;return ${JSON.stringify(ids)}.every(id=>d.getNode(id).character.fontSize===30)})()`,'control bar size');
  // Saved, exported and sent text uses the new glyphs.
  assert.equal(await evaluate(`(async()=>{const w=${active},{createProjectDraw}=await import('./draw/io/project.mjs');return createProjectDraw(JSON.parse(w.state.document.serialize())).document.serialize()===w.state.document.serialize()})()`),true);
  const svg=await evaluate(`(async()=>{const w=${active};return w.exportBoard(w.state.ui.artboardId,'svg')})()`);assert.match(svg,/<path[\s>]/);
  await evaluate(`(async()=>{${active}.handle('cancel')})()`);
  await restore();
  console.log('PASS Draw Character and Paragraph: defaults without selection, shared panel/Properties/control bar settings, inherited area and point text, cancel and undo, Mod+T, selected text shaping, family and unknown family, paragraph formatting, save and export');
}
