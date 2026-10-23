import assert from 'node:assert/strict';

/** Exercise the actual dialog with isolated storage, without changing the open document. */
export async function runDrawDocumentPresetWorkflows({evaluate}) {
  const dialog='.draw-document-dialog';
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(`${dialog} ${selector}`)}).click()`);
  const values=()=>evaluate(`(()=>{const f=document.querySelector('${dialog} form');return [Number(f.elements.width.value),Number(f.elements.height.value)];})()`);
  const set=(name,value)=>evaluate(`(()=>{const f=document.querySelector('${dialog} form'),i=f.elements[${JSON.stringify(name)}];i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const open=()=>evaluate(`(async()=>{const {newDocumentDialog}=await import('./draw/ui/dialogs.mjs');window.__presetResult=newDocumentDialog({name:'Test bed',width:600,height:400},{storage:window.__presetStorage});return true;})()`);
  await evaluate(`(()=>{const data=new Map();window.__presetStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};})()`);
  try {
    await open();
    await click('[data-category=print]');
    await click('[data-orientation=landscape]');
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('${dialog} .draw-preset-card__preview > span')).every(p=>p.getBoundingClientRect().width>p.getBoundingClientRect().height)`),'Landscape updates every print thumbnail');
    await click('[data-preset=a4]');assert.deepEqual(await values(),[297,210]);
    await click('[data-preset=a5]');assert.deepEqual(await values(),[210,148]);
    await click('[data-tab=saved]');await click('[data-tab=templates]');
    await click('[data-preset=a4]');assert.deepEqual(await values(),[297,210],'Landscape survives browsing and selecting another template');
    await click('[data-orientation=portrait]');assert.deepEqual(await values(),[210,297]);
    await click('[data-preset=a5]');assert.deepEqual(await values(),[148,210]);
    await set('width',320);await click('[data-preset=a4]');assert.deepEqual(await values(),[210,297],'Manual dimensions clear the orientation override');
    await set('name','Wide template');await set('width',480);await set('height',120);await set('count',3);await set('layout','row');await set('spacing',12);await set('ppi',150);
    await click('[data-x=save-template]');
    assert.equal(await evaluate(`document.querySelector('${dialog} [data-tab=saved]').getAttribute('aria-selected')`),'true');
    const saved=await evaluate(`JSON.parse(window.__presetStorage.getItem('modcut_draw_document_templates'))`);
    assert.equal(saved.length,1);assert.equal(saved[0].name,'Wide template');
    assert.deepEqual([saved[0].width,saved[0].height,saved[0].count,saved[0].layout,saved[0].spacing,saved[0].ppi],[480,120,3,'row',12,150]);
    const ratio=await evaluate(`(()=>{const r=document.querySelector('${dialog} .draw-preset-card__preview > span').getBoundingClientRect();return r.width/r.height;})()`);
    assert.ok(Math.abs(ratio-4)<.02,'Saved thumbnail matches the exact 4:1 aspect ratio');
    assert.ok(await evaluate(`(()=>{const s=document.querySelector('${dialog} [data-x=save-template]').getBoundingClientRect(),c=document.querySelector('${dialog} [data-x=cancel]').getBoundingClientRect();return s.right<c.left;})()`),'Save button sits to the left of the dialog actions');
    await click('[data-x=save-template]');
    assert.equal(await evaluate(`JSON.parse(window.__presetStorage.getItem('modcut_draw_document_templates')).length`),1,'Saving the same name updates its template');
    await click('[data-x=cancel]');await open();await click('[data-tab=saved]');
    await evaluate(`document.querySelector('${dialog} [data-preset^="template-"]').click()`);
    assert.deepEqual(await values(),[480,120],'Saved dimensions persist when reopening');
    assert.equal(await evaluate(`document.querySelector('${dialog} form').elements.count.value`),'3');
    await evaluate(`document.querySelector('${dialog} form').requestSubmit()`);
    const doc=await evaluate('(async()=>await window.__presetResult)()');
    assert.equal(doc.artboards.length,3);assert.deepEqual([doc.artboards[0].width,doc.artboards[0].height],[480,120]);
  } finally {
    await evaluate(`document.querySelector('${dialog} [data-x=cancel]')?.click();delete window.__presetStorage;delete window.__presetResult;`);
  }
}
