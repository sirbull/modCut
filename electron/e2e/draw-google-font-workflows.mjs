import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers,wait } from './cdp.mjs';
import { activeDraw as active,enterDraw,rememberTabs,submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawGoogleFontWorkflows(client) {
  const {evaluate,command}=client,{key}=inputHelpers(client),restore=await rememberTabs(evaluate);
  const until=async(expr,note)=>{for(let i=0;i<1000;i++){if(await evaluate(expr))return;await wait(50);}assert.fail(note+': '+await evaluate("JSON.stringify({error:[...document.querySelectorAll('.toast')].map(t=>t.textContent),fontStatus:document.querySelector('.draw-font-browser [role=status]')?.textContent,editor:document.querySelector('.draw-inline-text')?.outerHTML})"));};
  const ready=()=>until("document.querySelector('.draw-inline-text')?.dataset.textReady==='true'",'Shaped Google text');
  await enterDraw(evaluate);await evaluate("document.querySelector('#newDoc').click()");await submitNewDrawDialog(evaluate,{preset:'custom',width:140,height:100,name:'Google Fonts inline proof'});
  await evaluate(`(async()=>{const w=${active};w.setTool('type');w.handle('tool-dialog')})()`);
  await until("!!document.querySelector('.draw-inline-text')",'Inline editor');await command('Input.insertText',{text:'Google ÆØÅ'});await ready();
  await evaluate("(()=>{const el=document.querySelector('.draw-inline-text'),r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);})()");await wait(30);
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-field=prop-font-family]').click()");
  await evaluate("document.querySelector('.draw-font-tabs [data-font-source=google]').click()");
  await until("document.querySelector('.draw-font-browser [role=status]')?.textContent.includes('families')",'Google catalog');
  assert.ok(await evaluate("parseInt(document.querySelector('.draw-font-browser [role=status]').textContent)>1900"));
  await evaluate("(()=>{const s=document.querySelector('.draw-font-browser input');s.value='Lora';s.dispatchEvent(new Event('input'));})()");
  await until("!!document.querySelector('[data-font-family=Lora]')",'A family other than Roboto');
  assert.equal(await evaluate("document.querySelector('[data-font-family=Lora] .draw-font-specimen').textContent"),'Google ÆØÅ');
  await evaluate("document.querySelector('[data-font-family=Lora]').click()");
  await until("!document.querySelector('.draw-font-browser')",'Download selection');await ready();
  const node=await evaluate(`(async()=>{const w=${active};return w.state.document.getNode(w.state.selection.ids[0])})()`);
  assert.equal(node.character.fontSource,'google');assert.equal(node.character.fontFamily,'Lora');assert.match(node.character.googleFont.sha256,/^[a-f0-9]{64}$/);
  assert.ok(node.character.googleFont.license.length>100);assert.ok(node.layout.glyphs.length>0);
  await evaluate("(()=>{const details=document.querySelector('.draw-project[style*=block] .draw-dock-body .draw-font-options');details.open=true;})()");
  await until("!!document.querySelector('.draw-project[style*=block] [data-font-axis=wght]')",'Variable font settings in Properties');
  await evaluate("(()=>{const el=document.querySelector('.draw-project[style*=block] [data-font-axis=wght]');el.focus();el.value='650';el.dispatchEvent(new Event('input',{bubbles:true}));})()");await ready();
  assert.equal(await evaluate(`(async()=>${active}.state.document.getNode('${node.id}').character.fontAxes.wght)()`),650);
  await evaluate("document.activeElement.blur()");
  await until("document.querySelector('.draw-inline-text span')?.style.fontFamily.includes('modcut-font-')",'Real Google font loaded into caret/selection overlay');
  await evaluate("(()=>{const el=document.querySelector('.draw-project[style*=block] [data-draw-field=prop-font-size]');el.focus();el.value='36';el.dispatchEvent(new Event('input',{bubbles:true}));})()");await ready();
  assert.equal(await evaluate(`(async()=>${active}.state.document.getNode('${node.id}').character.fontSize)()`),36);
  const proof=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'modcut-google-fonts-inline.png'),Buffer.from(proof.data,'base64'));
  await evaluate(`(async()=>${active}.handle('cancel'))()`);await until("!document.querySelector('.draw-inline-text')",'Finish editing');
  assert.equal(await evaluate(`(async()=>{const w=${active},{createProjectDraw}=await import('./draw/io/project.mjs');return createProjectDraw(JSON.parse(w.state.document.serialize())).document.serialize()===w.state.document.serialize()})()`),true);
  assert.ok(await evaluate(`(async()=>{const w=${active},cut=w.cutSvg(w.state.ui.artboardId);return cut.textCount===1&&!cut.errors.length&&!/<text[\\s>]/.test(cut.svg)})()`));
  // Source switch stays in the same dropdown, with a working installed family preview.
  await evaluate("document.querySelector('.draw-project[style*=block] [data-draw-field=prop-font-family]').click();document.querySelector('[data-font-source=system]').click()");
  await until("!!document.querySelector('[data-font-family=Arial]')",'Installed source switch');
  assert.equal(await evaluate("document.querySelector('[data-font-family=Arial] .draw-font-specimen').textContent"),'Lorem Ipsum');
  await evaluate("document.querySelector('[data-font-family=Arial]').click()");await until(`(async()=>${active}.state.document.getNode('${node.id}').character.fontFamily==='Arial')()`,'Installed font applied');
  await restore();console.log('PASS Google Fonts inline: full searchable catalog, Lora download/license, real preview, live size, portable save/export, installed source switch');
}
