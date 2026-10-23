import assert from 'node:assert/strict';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, submitNewDrawDialog, rememberTabs, enterDraw } from './draw-test-helpers.mjs';
import { inlineReady, finishInline } from './draw-inline-helpers.mjs';

export async function runDrawTypeMenuWorkflows(client) {
  const {evaluate,command}=client,{click,drag,key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const until=async(expr,note)=>{for(let i=0;i<200;i++){if(await evaluate(`(async()=>(${expr}))()`))return;await wait(50);}assert.fail(note+': '+await evaluate("JSON.stringify([...document.querySelectorAll('.toast')].map(t=>t.textContent))"));};
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate,{preset:'custom',width:160,height:120,name:'Type menu proof'});
  const at=(x,y)=>evaluate(`(async()=>{const w=${active},b=w.state.document.data.artboards[0],p=w.scope.view.projectToView(new w.scope.Point(b.x+${x},b.y+${y})),r=w.scope.view.element.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};})()`);
  const handle=id=>evaluate(`(async()=>${active}.handle(${JSON.stringify(id)}))()`);
  const node=id=>evaluate(`(async()=>${active}.state.document.getNode('${id}'))()`);
  const text=id=>`${active}.state.document.getNode('${id}').content.runs.map(r=>r.text).join('')`;
  const box=id=>evaluate(`(async()=>{const w=${active},n=w.state.document.getNode('${id}'),g=n.layout.glyphs.find(g=>g.subpaths.length).subpaths[0].segments[0].p;const p=w.renderer.pointToWorld('${id}',g);return Array.isArray(p)?p:[p.x,p.y]})()`);
  const before=await evaluate(`(async()=>${active}.state.document.serialize())()`);

  // Change Case on the characters selected while typing, then on the whole selected object.
  await key('t');await click(await at(20,30));await until("!!document.querySelector('.draw-inline-text')",'Inline editor');
  await command('Input.insertText',{text:`hello world. don't stop`});await inlineReady(evaluate);
  const id=await evaluate(`(async()=>${active}.state.selection.ids[0])()`);
  await evaluate("(()=>{const el=document.querySelector('.draw-inline-text'),r=document.createRange(),t=document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode();r.setStart(t,0);r.setEnd(t,5);getSelection().removeAllRanges();getSelection().addRange(r);})()");await wait(30);
  await handle('case-upper');await until(`${text(id)}==="HELLO world. don't stop"`,'Uppercase selection');
  await finishInline(evaluate);await evaluate(`(async()=>{const w=${active};w.setTool('select');w.select(['${id}'])})()`);
  await handle('case-sentence');await until(`${text(id)}==="Hello world. Don't stop"`,'Sentence case');
  await handle('smart-punctuation');await until(`${text(id)}==="Hello world. Don’t stop"`,'Smart apostrophe');

  // Size and orientation reach the selected object.
  await handle('type-size-36');await until(`${active}.state.document.getNode('${id}').character.fontSize===36`,'Size 36 pt');

  // Point ↔ area keeps the glyphs where they are and reflows nothing.
  const pointBox=await box(id);
  await handle('type-to-area');await until(`${active}.state.document.getNode('${id}').kind==='area'`,'Area type');
  const areaBox=await box(id),areaNode=await node(id);
  assert.equal(areaNode.layout.lineWidths.length,1,'No re-wrap');assert.equal(areaNode.layout.overflow,false);
  assert.ok(Math.abs(areaBox[1]-pointBox[1])<.5&&Math.abs(areaBox[0]-pointBox[0])<.5,`Area text stays put: ${pointBox} → ${areaBox}`);
  await handle('type-to-point');await until(`${active}.state.document.getNode('${id}').kind==='point'`,'Point type');
  const backBox=await box(id);assert.ok(Math.abs(backBox[0]-pointBox[0])<.5&&Math.abs(backBox[1]-pointBox[1])<.5,`Point text stays put: ${pointBox} → ${backBox}`);
  assert.equal((await node(id)).frame,undefined,'The frame goes with area type');

  // Insert Special Character after the selected text's last character.
  await handle('insert-em-dash');await inlineReady(evaluate);await finishInline(evaluate);
  await until(`${text(id)}.endsWith('—')&&${text(id)}.startsWith('Hello')`,'Em dash at the end');

  await handle('type-vertical');await until(`${active}.state.document.getNode('${id}').paragraph.orientation==='vertical'`,'Vertical type');
  await handle('type-horizontal');await until(`!${active}.state.document.getNode('${id}').paragraph.orientation`,'Horizontal type');

  // Area text fills its frame with whole placeholder words; point text gets a phrase.
  await key('t');await drag(await at(20,60),await at(90,110));await inlineReady(evaluate);
  await command('Input.insertText',{text:'x'});await inlineReady(evaluate);
  const area=await evaluate(`(async()=>${active}.state.selection.ids[0])()`);await finishInline(evaluate);
  await evaluate(`(async()=>{const w=${active};w.setTool('select');w.select(['${area}'])})()`);
  await handle('fill-placeholder');await until(`${text(area)}.startsWith('Lorem ipsum dolor')`,'Placeholder');
  const filled=await node(area);assert.equal(filled.layout.overflow,false,'Placeholder fits');assert.ok(filled.layout.lineWidths.length>=3,'Placeholder fills the frame');
  await evaluate(`(async()=>${active}.select(['${id}']))()`);await handle('fill-placeholder');await until(`${text(id)}==='Lorem ipsum'`,'Point placeholder');

  for(let i=0;i<40&&await evaluate(`(async()=>${active}.state.document.serialize())()`)!==before;i++)await handle('undo');
  assert.equal(await evaluate(`(async()=>${active}.state.document.serialize())()`),before,'Every Type menu edit undoes');
  await restore();console.log('PASS Type menu: case, smart punctuation, size, orientation, point/area conversion, special characters, placeholder text and undo');
}
