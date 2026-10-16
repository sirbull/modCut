import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { wait } from './cdp.mjs';
import { submitNewDrawDialog, enterDraw } from './draw-test-helpers.mjs';

const activeState = `(await import('./draw/index.mjs')).getDrawWorkspace(document.querySelector('.draw-project[data-tab-id="'+document.querySelector('.doc-tab.is-active').dataset.tabId+'"]')).state`;
const snapshot = (evaluate) => evaluate(`(async()=>(${activeState}.snapshot()))()`);
const dirty = (evaluate) => evaluate("!!document.querySelector('.doc-tab.is-active .doc-tab__dirty')");

async function until(check, message) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await wait(50); }
  throw new Error(message);
}

async function openProject(evaluate, path, project) {
  const before = await evaluate("({id:document.querySelector('.doc-tab.is-active').dataset.tabId,mode:document.body.dataset.workspace})");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify({ path, name: path.split(/[\\/]/).pop(), kind: 'document', text: JSON.stringify(project) })})`);
  await evaluate("document.querySelector('#import').click()");
  await until(() => evaluate(`document.querySelector('.doc-tab.is-active .doc-tab__title').textContent === ${JSON.stringify(path.split(/[\\/]/).pop())} && (${JSON.stringify(before.mode)} !== 'draw' || document.querySelector('.doc-tab.is-active').dataset.tabId !== ${JSON.stringify(before.id)})`), 'Project open did not finish');
}

async function save(evaluate, path) {
  // Wait for the completed IPC save before reading. Polling readFile can hold a
  // Windows file handle open during the atomic rename and cause EPERM.
  await evaluate(`new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Project save did not complete'));},10000);
    const observer=new MutationObserver(records=>{
      for(const record of records) for(const node of record.addedNodes) {
        const text=node.textContent||'';
        if(text.includes('Document saved.')||text.includes('Save failed:')) {
          clearTimeout(timer);observer.disconnect();
          if(text.includes('Save failed:')) reject(new Error(text)); else resolve(true);
          return;
        }
      }
    });
    observer.observe(document.querySelector('#toasts'),{childList:true,subtree:true});
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',code:'KeyS',metaKey:/Mac/.test(navigator.platform),ctrlKey:!/Mac/.test(navigator.platform),bubbles:true,cancelable:true}));
  })`);
  const data = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(data.version, 4);
  assert.equal(await dirty(evaluate), false);
  return data;
}

export async function runProjectWorkflows({ evaluate }, directory) {
  const path = join(directory, 'draw-roundtrip.modcut');
  const design = await evaluate("paper.project.layers[1].exportJSON({asString:true})");
  const legacy = { app: 'modCut', version: 3, design, filename: 'roundtrip', mappingMode: 'color', layers: [], units: 'cm' };
  await writeFile(path, JSON.stringify(legacy));
  await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate);
  await openProject(evaluate, path, legacy);
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"), design, 'v3 Cut geometry survives opening');
  await enterDraw(evaluate);
  const empty = await snapshot(evaluate);
  assert.equal(empty.layers[0].children.length, 0);
  const savedEmpty = await save(evaluate, path);
  assert.deepEqual(savedEmpty.draw, empty, 'saving with no drawing persists an empty document');
  await openProject(evaluate, path, savedEmpty);
  assert.deepEqual(await snapshot(evaluate), empty, 'empty Draw roundtrip preserves IDs and defaults');
  assert.equal(await dirty(evaluate), false);

  // Model commands exercise the IO boundary before visible drawing tools exist.
  await evaluate(`(async()=>{
    const state=${activeState}, {createNode}=await import('./draw/doc/schema.mjs'), {insertNode}=await import('./draw/doc/commands.mjs');
    const {roundCorners}=await import('./draw/geom/corners.mjs'),source={closed:true,segments:[[30,5],[50,5],[50,25],[30,25]].map(p=>({p,in:[0,0],out:[0,0]}))};
    state.history.transaction('Roundtrip artwork',()=>{
      state.history.execute(insertNode(state.document.data.layers[0].id,createNode('shape',{id:'persisted-shape',name:'Roundtrip shape',params:{width:25,height:12}})));
      state.history.execute(insertNode(state.document.data.layers[0].id,createNode('path',{id:'persisted-corners',name:'Live corners',strokeScaling:false,subpaths:[roundCorners(source,[0,1,2,3],2)]})));
    });
  })()`);
  assert.equal(await dirty(evaluate), true, 'Draw-only edits mark the project dirty');
  await evaluate('window.close()');
  await until(() => evaluate("!!document.querySelector('[data-x=cancel]')"), 'Native close must guard Draw-only edits');
  await evaluate("document.querySelector('[data-x=cancel]').click()");
  await evaluate(`(async()=>{${activeState}.history.undo()})()`);
  assert.equal(await dirty(evaluate), false, 'Draw undo reaches the saved boundary');
  await evaluate(`(async()=>{${activeState}.history.redo()})()`);
  const savedShape = await save(evaluate, path);
  assert.deepEqual(savedShape.draw.layers[0].children[1].subpaths[0].cornerData.radii,[2,2,2,2],'Real project saving retains editable live corner data');
  assert.equal(savedShape.draw.layers[0].children[1].strokeScaling,false,'The explicit world-mm stroke policy survives file IO and recovery');
  await openProject(evaluate, path, savedShape);
  assert.deepEqual(await snapshot(evaluate), savedShape.draw, 'nonempty Draw roundtrip preserves its model');
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"), savedShape.design);

  await evaluate("(()=>{const units=document.querySelector('#units');units.value='mm';units.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.equal(await dirty(evaluate), true, 'Cut settings remain dirty independently of Draw history');
  assert.equal(await evaluate(`(async()=>(${activeState}.dirty))()`), false);
  await save(evaluate, path);

  const futurePath = join(directory, 'future-draw.modcut');
  const future = { ...savedShape, workspace: 'draw', draw: { version: 99, futureContent: { geometry: [1, 2, 3] } } };
  await writeFile(futurePath, JSON.stringify(future));
  await openProject(evaluate, futurePath, future);
  assert.equal(await evaluate(`(async()=>(${activeState}.document.readOnly))()`), true);
  assert.match(await evaluate('document.body.textContent'), /cannot be edited in this version/);
  assert.deepEqual((await save(evaluate, futurePath)).draw, future.draw, 'unknown Draw data survives actual file saving');
  await openProject(evaluate, path, JSON.parse(await readFile(path, 'utf8')));

  // Continuous editing must not starve the maximum two-second recovery interval.
  const continuousTabId = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await wait(600);
  await evaluate(`(async()=>{
    const state=${activeState}, {updateNode}=await import('./draw/doc/commands.mjs');
    let tick=0; window.__drawEdits=setInterval(()=>state.history.execute(updateNode('persisted-shape',{name:'Continuous '+(++tick)},{mergeKey:'name'})),100);
  })()`);
  try {
    await wait(2400);
    const recovery = await evaluate('window.modcut.readRecovery().then(JSON.parse)');
    const tab = recovery.tabs.find(tab => tab.id === continuousTabId);
    assert.match(tab.session.draw.layers[0].children[0].name, /^Continuous /, 'recovery runs while edits continue');
  } finally { await evaluate('clearInterval(window.__drawEdits);delete window.__drawEdits'); }

  const firstTabId = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const firstDraw = await snapshot(evaluate);
  await evaluate("document.querySelector('#newDoc').click();if(document.body.dataset.workspace==='cut')document.querySelector('#workspaceToggle').click()");
  await submitNewDrawDialog(evaluate);
  await evaluate(`(async()=>{
    const state=${activeState}, {updateNode}=await import('./draw/doc/commands.mjs');
    state.history.execute(updateNode(state.document.data.layers[0].id,{name:'Recovered inactive document'}));
  })()`);
  const secondTabId = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  const secondDraw = await snapshot(evaluate);
  // Native Quit must also guard an inactive Draw-only dirty project.
  await evaluate("window.modcut.requestE2EQuit()");
  await until(() => evaluate("!!document.querySelector('[data-x=cancel]')"), 'Quit did not guard inactive Draw changes');
  assert.match(await evaluate("document.querySelector('[data-save-work-hint]').textContent"), /draw-roundtrip/);
  await evaluate("document.querySelector('[data-x=cancel]').click()");
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"), secondTabId);
  await until(async () => {
    const payload = await evaluate('window.modcut.readRecovery().then(text=>text&&JSON.parse(text))');
    return payload?.tabs.find(tab => tab.id === secondTabId)?.session.drawDirty;
  }, 'Recovery did not capture both Draw documents after canceling Quit');
  process.stdout.write('PASS Draw: v3/v4 IO, empty/nonempty roundtrip, dirty guards, inactive tabs and continuous autosave\n');
  return { firstTabId, secondTabId, firstDraw, secondDraw, path };
}

export async function verifyProjectRecovery({ evaluate }, expected) {
  await until(() => evaluate(`document.querySelector('.doc-tab.is-active')?.dataset.tabId === ${JSON.stringify(expected.secondTabId)} && document.body.dataset.workspace === 'draw'`), 'Recovered app did not initialize');
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId"), expected.secondTabId);
  assert.equal(await evaluate('document.body.dataset.workspace'), 'draw');
  assert.deepEqual(await snapshot(evaluate), expected.secondDraw);
  assert.equal(await dirty(evaluate), true);
  await evaluate(`document.querySelector('[data-tab-id="${expected.firstTabId}"]').click()`);
  assert.equal(await evaluate('document.body.dataset.workspace'), 'draw');
  assert.deepEqual(await snapshot(evaluate), expected.firstDraw);
  assert.equal(await dirty(evaluate), true);
  await save(evaluate, expected.path);
  assert.equal(await dirty(evaluate), false, 'saving recovered Draw clears its recovered dirty marker');
  process.stdout.write('PASS Draw: actual process crash/relaunch preserves both Draw models, modes and dirty state\n');
}
