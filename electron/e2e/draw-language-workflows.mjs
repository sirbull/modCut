import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** Phase 5: Preferences > Language switches menus and the window to Norwegian and back, leaving names people typed alone. */
export async function runDrawLanguageWorkflows(client) {
  const { evaluate } = client, restore = await rememberTabs(evaluate);
  const until = async (expression, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(40); } assert.fail(`Timed out: ${label}`); };
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 100, height: 60, name: 'Language proof' });
  const choose = async (value) => {
    await evaluate("document.querySelector('#settings').click()");
    await until("!!document.querySelector('.preferences-modal [name=language]')", 'Preferences');
    await evaluate(`(()=>{const s=document.querySelector('.preferences-modal [name=language]');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  const panelTabs = "[...document.querySelectorAll('.draw-project[style*=block] [data-draw-panel]')].map(b=>b.getAttribute('aria-label')).join('|')";

  if(process.argv.includes('--draw-language')) {
    assert.equal(await evaluate('document.documentElement.lang'),'en','A fresh profile starts in English');
    assert.ok((await evaluate('window.modcut.getE2EWorkspaceMenu()')).top.includes('Edit'),'Native menus also start in English');
  }

  await choose('nb');
  await until("(async()=>(await window.modcut.getE2EWorkspaceMenu()).top.includes('Rediger'))()", 'Norwegian menus');
  const menu = await evaluate('window.modcut.getE2EWorkspaceMenu()');
  assert.ok(menu.top.includes('Fil') && menu.top.includes('Objekt') && menu.top.includes('Effekt'), menu.top.join());
  assert.equal(await evaluate("document.documentElement.lang"), 'nb');
  await until("[...document.querySelectorAll('.preferences-modal .field > span')].some(s=>s.textContent==='Språk')", 'The open Preferences window is translated too');
  await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");
  assert.match(await evaluate(panelTabs), /Fargeprøver\|.*Strek · Fargeovergang · Gjennomsiktighet/, 'Panel names in Norwegian');
  assert.equal(await evaluate("document.querySelector('#workspaceToggle span').textContent"), 'Cut', 'The workspace name stays');
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active .doc-tab__title').textContent"), 'Language proof', 'The document name stays');
  // Text the app sets later is translated as it appears.
  await evaluate("document.querySelector('#file').translate=true;document.querySelector('#file').textContent='Untitled'");
  await until("document.querySelector('#file').textContent==='Uten navn'", 'New text is translated');

  await choose('en');
  await until("(async()=>(await window.modcut.getE2EWorkspaceMenu()).top.includes('Edit'))()", 'English menus again');
  await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");
  assert.match(await evaluate(panelTabs), /^Swatches\|.*Stroke · Gradient · Transparency/, 'Panel names back in English');
  assert.equal(await evaluate("document.querySelector('#file').textContent"), 'Untitled');
  await choose('system'); await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");
  await restore();
  console.log('PASS Draw language: Norwegian menus, panels, Preferences and later text, names left alone, back to English');
}
