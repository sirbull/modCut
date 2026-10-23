import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inputHelpers, wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, submitNewDrawDialog, rememberTabs } from './draw-test-helpers.mjs';

const root = '.draw-project[style*=block]';
export async function runDrawColorWorkflows(client) {
  const {evaluate} = client, {drag} = inputHelpers(client), restore = await rememberTabs(evaluate);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const command = id => evaluate(`(async()=>${active}.handle('${id}'))()`);
  const until = async expression => { for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(40);}assert.fail(expression); };
  const shot = async name => writeFile(join(tmpdir(),name),Buffer.from((await client.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await enterDraw(evaluate); await click('#newDoc');
  await submitNewDrawDialog(evaluate,{preset:'custom',width:120,height:80,name:'Color picker proof'});
  const id = await evaluate(`(async()=>{const w=${active},{shapeFromDrag}=await import('./draw/tools/shapes.mjs'),{insertNode}=await import('./draw/doc/commands.mjs');
    const node=shapeFromDrag('rectangle',[20,20],[65,50],{fill:'#14DBAD',stroke:'#FF0049',strokeWidth:1});w.state.history.execute(insertNode(w.state.document.data.layers[0].id,node));w.select([node.id]);return node.id;})()`);
  const node = () => evaluate(`(async()=>${active}.state.document.getNode('${id}'))()`);
  const depth = () => evaluate(`(async()=>${active}.state.history.entries.filter(e=>e.applied).length)()`);
  const hex = paint => paint?.color ? '#'+paint.color.values.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('').toUpperCase() : null;
  const geometry = selector => evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`);
  const stroke = `${root} [data-paint=stroke]`, fill = `${root} [data-paint=fill]`;
  await click(stroke);
  assert.equal(await evaluate(`document.querySelector('${root} .draw-flyout').hidden`),true,'Single click does not open a panel');
  assert.equal(await evaluate("!!document.querySelector('.draw-color-dialog')"),false);
  assert.equal(await evaluate(`document.querySelector('${stroke}').getAttribute('aria-pressed')`),'true');
  const swapBox = await geometry(`${root} [data-paint-action=paint-swap]`), fillBox = await geometry(fill);
  assert.ok(swapBox.y < fillBox.y && swapBox.x > fillBox.x,'Swap is above and to the right');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${stroke}'),'::before').backgroundColor`),await evaluate(`getComputedStyle(document.querySelector('${root} .draw-tool-rail')).backgroundColor`),'Stroke has a hollow center');
  assert.match(await evaluate(`getComputedStyle(document.querySelector('${root} .draw-paint-mode-chip--paint-none')).backgroundImage`),/gradient/,'None has a visible red slash');
  await click(`${root} [data-paint-action=paint-swap]`);
  assert.deepEqual([hex((await node()).appearance.fills[0].paint),hex((await node()).appearance.strokes[0].paint)],['#FF0049','#14DBAD']);
  await command('undo');

  const original = await node(), initialDepth = await depth();
  const openPicker = async selector => {
    const box = await geometry(selector), point = {x:box.x+box.width/2,y:box.y+box.height/2};
    for (const clickCount of [1,2]) for (const type of ['mousePressed','mouseReleased'])
      await client.command('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount});
    await until("!!document.querySelector('.draw-color-dialog')");
  };
  await openPicker(stroke);
  const pickerLayout = await evaluate(`Object.fromEntries(['.draw-color-dialog','.draw-color-dialog__layout','.draw-color-dialog .draw-color-surface','.draw-color-dialog .draw-color-plane','.draw-color-dialog .draw-color-hue','.draw-color-dialog__controls'].map(s=>{const e=document.querySelector(s),b=e.getBoundingClientRect(),c=getComputedStyle(e);return [s,{width:b.width,height:b.height,columns:c.gridTemplateColumns,overflow:e.scrollWidth-e.clientWidth}]}))`);
  assert.ok(pickerLayout['.draw-color-dialog'].overflow < 2, JSON.stringify(pickerLayout));
  assert.ok(pickerLayout['.draw-color-dialog'].width <= 540 && pickerLayout['.draw-color-dialog'].height < 500,'The picker is compact');
  const hueBox = await geometry('.draw-color-dialog .draw-color-hue'), initialPlane = await geometry('.draw-color-dialog .draw-color-plane');
  assert.ok(hueBox.x >= initialPlane.x+initialPlane.width && hueBox.height > hueBox.width*5,'Hue is vertical, to the right of the color plane');
  assert.equal(await evaluate("document.querySelectorAll('[data-color-recent]').length"),0,'The picker starts without arbitrary preset colors');
  assert.equal(await evaluate("document.querySelector('.draw-color-dialog').getAttribute('aria-modal')"),'true');
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}))");
  assert.equal(await evaluate("document.activeElement.type"),'submit','Shift+Tab stays inside the dialog');
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate("document.activeElement.className"),'draw-color-plane','Tab wraps to the color plane');
  const planeSelector = '.draw-color-dialog .draw-color-plane';
  let box = await geometry(planeSelector);
  await drag({x:box.x+box.width*.2,y:box.y+box.height*.3},{x:box.x+box.width*.75,y:box.y+box.height*.25});
  assert.deepEqual(await node(),original,'Picker previews are detached from artwork');
  assert.equal(await depth(),initialDepth,'Preview adds no history');
  assert.ok(Math.abs(await evaluate("+document.querySelector('[data-color-channel=hsb-1]').value")-75)<1,'Plane updates saturation');
  await evaluate("(()=>{const hue=document.querySelector('.draw-color-dialog [data-color-hue]');hue.focus();hue.value='120';hue.dispatchEvent(new Event('input',{bubbles:true}));hue.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.equal(await evaluate("+document.querySelector('[data-color-channel=hsb-0]').value"),120,'Vertical hue updates HSB');
  await drag({x:hueBox.x+hueBox.width/2,y:hueBox.y+2},{x:hueBox.x+hueBox.width/2,y:hueBox.y+hueBox.height/2});
  assert.ok(Math.abs(await evaluate("+document.querySelector('[data-color-channel=hsb-0]').value")-180)<5,'Dragging the vertical hue track selects the matching hue');
  await shot('modcut-draw-color-dialog.png');
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await until("!document.querySelector('.draw-color-dialog')");
  assert.deepEqual(await node(),original,'Escape cancels without any document change');
  await openPicker(stroke);
  for (const [channel,value] of [['hsb-0',120],['hsb-1',100],['hsb-2',100]])
    await evaluate(`(()=>{const i=document.querySelector('[data-color-channel=${channel}]');i.value='${value}';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate("document.querySelector('[data-color-hex]').value"),'00FF00','HSB fields select green');
  await evaluate("(()=>{const i=document.querySelector('[data-color-hex]');i.value='3366FF';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.deepEqual(await evaluate("[0,1,2].map(i=>+document.querySelector('[data-color-channel=rgb-'+i+']').value)"),[51,102,255],'Hex synchronizes numeric fields');
  await evaluate("document.querySelector('.draw-color-dialog form').requestSubmit()");
  await until("!document.querySelector('.draw-color-dialog')");
  await wait(30);
  assert.equal(hex((await node()).appearance.strokes[0].paint),'#3366FF','OK commits stroke color');
  assert.equal(await depth(),initialDepth+1);
  await command('undo'); assert.deepEqual(await node(),original,'One undo restores the original stroke');

  await openPicker(stroke);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-color-recent]')].map(e=>e.dataset.colorRecent)"),['#3366FF'],'Only applied colors appear in Recent Colors');
  await click('[data-color-recent]');
  assert.equal(await evaluate("document.querySelector('[data-color-hex]').value"),'3366FF','Recent colors can be reused');
  await click('.draw-color-dialog [data-x=cancel]');
  assert.deepEqual(await node(),original,'Cancelled recent-color choice does not change artwork');

  // Control the screen API result so success, Escape, failure and teardown are deterministic.
  const nativeEyeDropper = await evaluate("typeof window.EyeDropper === 'function'");
  await evaluate(`(() => {
    window.__nativeEyeDropper=window.EyeDropper;
    window.EyeDropper=class { open({signal}) { return new Promise((resolve,reject)=>{
      window.__screenResolve=resolve; window.__screenReject=reject;
      signal.addEventListener('abort',()=>{window.__screenAborted=true;reject(new DOMException('Cancelled','AbortError'));},{once:true});
    }); } };
  })()`);
  await openPicker(stroke);
  await click('[data-color-eyedropper]');
  await until("!!window.__screenResolve");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.draw-color-dialog').parentElement).visibility"),'hidden','Sampling hides the dialog and dimming layer');
  assert.deepEqual(await node(),original,'Sampling never changes the artwork before OK');
  await evaluate("window.__screenResolve({sRGBHex:'#12ab34'})");
  await until("!document.querySelector('.draw-color-dialog').dataset.sampling");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.draw-color-dialog').parentElement).visibility"),'visible');
  assert.equal(await evaluate("document.querySelector('[data-color-hex]').value"),'12AB34','Sampled screen color updates the picker');
  assert.equal(await evaluate("document.activeElement.hasAttribute('data-color-eyedropper')"),true,'Focus returns to the pipette');
  await evaluate("document.querySelector('.draw-color-dialog form').requestSubmit()"); await wait(30);
  assert.equal(hex((await node()).appearance.strokes[0].paint),'#12AB34');
  await command('undo'); assert.deepEqual(await node(),original,'Sampled color also commits as one undo step');

  await openPicker(stroke);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-color-recent]')].map(e=>e.dataset.colorRecent)"),['#12AB34','#3366FF']);
  const beforeSample = await evaluate("document.querySelector('[data-color-hex]').value");
  await evaluate("delete window.__screenResolve"); await click('[data-color-eyedropper]'); await until("!!window.__screenResolve");
  await evaluate("window.__screenReject(new DOMException('Escape','AbortError'))");
  await until("!document.querySelector('.draw-color-dialog').dataset.sampling");
  assert.equal(await evaluate("document.querySelector('[data-color-hex]').value"),beforeSample,'Escape returns to the dialog with the previous color');
  assert.equal(await evaluate("document.querySelector('.draw-color-dialog__sampling-note').textContent"),'');
  await evaluate("delete window.__screenResolve"); await click('[data-color-eyedropper]'); await until("!!window.__screenResolve");
  await evaluate("window.__screenReject(new DOMException('Unavailable','NotAllowedError'))");
  await until("!document.querySelector('.draw-color-dialog').dataset.sampling");
  assert.ok(await evaluate("document.querySelector('.draw-color-dialog__sampling-note').textContent.length"),'Failures restore the dialog with an explanation');
  await evaluate("delete window.__screenResolve"); await click('[data-color-eyedropper]'); await until("!!window.__screenResolve");
  await click('.draw-color-dialog [data-x=cancel]');
  await until('window.__screenAborted === true');
  await evaluate("window.EyeDropper=window.__nativeEyeDropper;delete window.__nativeEyeDropper");
  // Allow the OS overlay check to be omitted where background windows cannot open it.
  const checkNativeEyeDropper = nativeEyeDropper && !process.argv.includes('--skip-native-eyedropper');
  if (checkNativeEyeDropper) {
    await openPicker(stroke);
    await click('[data-color-eyedropper]'); await wait(700);
    assert.equal(await evaluate("document.querySelector('.draw-color-dialog').dataset.sampling"),'true','Native screen pipette opens in Electron');
    await click('.draw-color-dialog [data-x=cancel]'); await wait(50);
  }

  await openPicker(stroke); await click('[data-color-none]');
  await evaluate("document.querySelector('.draw-color-dialog form').requestSubmit()"); await wait(30);
  assert.deepEqual((await node()).appearance.strokes,[],'Picker None removes the paint entry');
  assert.equal((await node()).opacity,1,'None never changes opacity');
  await command('undo');

  // Properties uses the same picker, including transparent fill/stroke and detached Cancel.
  for (const kind of ['fill','stroke']) {
    const entries = kind === 'fill' ? 'fills' : 'strokes', other = kind === 'fill' ? 'strokes' : 'fills';
    const before = await node(), beforeDepth = await depth();
    const prop = `${root} [data-draw-field=prop-${kind}]`;
    await click(prop); await until("!!document.querySelector('.draw-color-dialog')");
    assert.equal(await evaluate("document.querySelector('[data-color-none]').getAttribute('aria-label')"),'Transparent');
    assert.match(await evaluate("getComputedStyle(document.querySelector('[data-color-none]')).backgroundImage"),/135deg/,'The red slash rises from bottom left to top right');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-color-none]')).backgroundColor"),'rgb(255, 255, 255)');
    await click('[data-color-none]');
    assert.deepEqual(await node(),before,'Transparent preview leaves artwork untouched');
    await click('.draw-color-dialog [data-x=cancel]');
    assert.deepEqual(await node(),before,'Cancel preserves the paint');
    await click(prop); await until("!!document.querySelector('.draw-color-dialog')"); await click('[data-color-none]');
    await evaluate("document.querySelector('.draw-color-dialog form').requestSubmit()"); await wait(30);
    assert.deepEqual((await node()).appearance[entries],[],`Properties transparent removes ${kind}`);
    assert.deepEqual((await node()).appearance[other],before.appearance[other],'The other paint is retained');
    assert.equal((await node()).opacity,before.opacity,'Object opacity is retained');
    assert.equal(await depth(),beforeDepth+1,'Transparent is a single undo step');
    assert.equal(await evaluate(`document.querySelector('${prop}').classList.contains('is-none')`),true);
    await click(prop); await until("!!document.querySelector('.draw-color-dialog')");
    assert.equal(await evaluate("document.querySelector('[data-color-none]').getAttribute('aria-pressed')"),'true','Reopening preserves transparent selection');
    await click('.draw-color-dialog [data-x=cancel]');
    await command('undo'); assert.deepEqual(await node(),before,'Undo restores the paint');
  }
  await click(`${root} [data-paint-action=paint-none]`);
  assert.deepEqual((await node()).appearance.strokes,[],'Toolbar None removes stroke');
  assert.ok((await node()).appearance.fills.length,'The fill is retained');
  await command('undo');

  await command('panel.color');
  const panelBeforeNone = await node(), panelNoneDepth = await depth();
  await click(`${root} [data-draw-field=color-none]`);
  assert.deepEqual((await node()).appearance.strokes,[],'Color panel transparent removes the stroke');
  assert.deepEqual((await node()).appearance.fills,panelBeforeNone.appearance.fills,'Color panel transparent retains the fill');
  assert.equal(await depth(),panelNoneDepth+1);
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=color-none]').getAttribute('aria-pressed')`),'true');
  await shot('modcut-draw-color-transparent.png');
  await command('undo'); assert.deepEqual(await node(),panelBeforeNone,'Color panel transparent can be undone');
  assert.equal(await evaluate(`document.querySelector('${root} [data-draw-field=color-mode]').value`),'hsb','HSB is the default');
  const panelPlane = `${root} [data-draw-panel-body=color] .draw-color-plane`;
  const beforeDrag = await depth(); box = await geometry(panelPlane);
  await drag({x:box.x+box.width*.3,y:box.y+box.height*.25},{x:box.x+box.width*.8,y:box.y+box.height*.2});
  assert.equal(await depth(),beforeDrag+1,'A plane drag is one undo step');
  const firstColor = hex((await node()).appearance.strokes[0].paint);
  box = await geometry(panelPlane);
  await drag({x:box.x+box.width*.4,y:box.y+box.height*.5},{x:box.x+box.width*.6,y:box.y+box.height*.4});
  assert.equal(await depth(),beforeDrag+2,'Separate drags have separate undo steps');
  await command('undo'); assert.equal(hex((await node()).appearance.strokes[0].paint),firstColor);
  // Hue selection while white keeps the chosen hue for the next saturation drag.
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-field=color-hex]');i.value='FFFFFF';i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await evaluate(`(()=>{const i=document.querySelector('${root} [data-draw-panel-body=color] [data-color-hue]');i.focus();i.value='120';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate(`+document.querySelector('${root} [data-draw-panel-body=color] [data-color-hue]').value`),120,'Hue survives white');
  assert.equal(await evaluate(`+document.querySelector('${root} [data-draw-field=color-hsb-0]').value`),120,'HSB field retains the chosen hue too');
  box = await geometry(panelPlane); await drag({x:box.x+box.width*.95,y:box.y+2},{x:box.x+box.width-1,y:box.y+1});
  const green = (await node()).appearance.strokes[0].paint.color.values;
  assert.ok(green[1]>.95&&green[0]<.05&&green[2]<.05,'Saturating white uses the chosen hue');
  await shot('modcut-draw-color-surface-panel.png');
  await openPicker(`${root} [data-draw-field=color-picker]`);
  await click('.draw-color-dialog [data-x=cancel]');
  await command('deselect'); await click(fill); await click(`${root} [data-paint-action=paint-none]`);
  assert.equal(await evaluate(`(async()=>${active}.state.ui.fill)()`),null,'None also works for new artwork defaults');
  await restore();
  console.log(`PASS Draw color: compact dialog, transparent fill/stroke in Properties and Color, vertical hue, recent colors, screen pipette (native checked: ${checkNativeEyeDropper}), cancel, one-step commit and independent drag undo`);
}
