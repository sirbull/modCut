import assert from "node:assert/strict";
import { wait } from "./cdp.mjs";
import { submitNewDrawDialog } from './draw-test-helpers.mjs';

export async function runDrawWorkflows({ evaluate }) {
  const before = await evaluate(`(() => {
    window.__cutScope = paper;
    return { design: paper.project.layers[1].exportJSON({asString:true}),
      zoom: paper.view.zoom, center: [paper.view.center.x, paper.view.center.y],
      layers: document.querySelector('#layers').innerHTML };
  })()`);
  await evaluate("document.querySelector('#workspaceToggle').click()");
  await wait(200);
  assert.deepEqual(await evaluate(`(() => {
    const canvas=document.querySelector('.draw-canvas'), r=canvas.getBoundingClientRect();
    return {mode:document.body.dataset.workspace, label:document.querySelector('#workspaceToggle span').textContent,
      visible:r.width>0&&r.height>0, cutHidden:getComputedStyle(document.querySelector('#stage')).visibility,
      cutScope:paper===window.__cutScope, canvases:document.querySelectorAll('canvas').length};
  })()`), {mode:'draw',label:'Cut',visible:true,cutHidden:'hidden',cutScope:true,canvases:2});
  await runDrawIconWorkflows({ evaluate });
  const menu = await evaluate("window.modcut.getE2EWorkspaceMenu()");
  assert.equal(menu.label, "Cut workspace");
  assert.equal(menu.file.find((item) => item.label === "Import…").accelerator, process.platform === 'darwin' ? 'Cmd+Shift+P' : 'Ctrl+Shift+P', "Draw imports into the current model through Place");
  assert.ok(menu.file.some(item => item.label === 'Open…'));
  assert.ok(menu.edit.every((a) => !a || ['Ctrl+K','Cmd+K','Ctrl+Z','Cmd+Z','Ctrl+Shift+Z','Cmd+Shift+Z'].includes(a)), "Draw editing accelerators belong to Draw history");
  for (const key of ["Backspace", "Enter", "Escape", "p", "m"]) {
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true}))`);
  }
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}))");
  await evaluate("document.querySelector('#workspaceToggle').click()");
  await wait();
  await runDrawKernelWorkflows({ evaluate });
  const after = await evaluate(`(() => ({design:paper.project.layers[1].exportJSON({asString:true}),
    zoom:paper.view.zoom,center:[paper.view.center.x,paper.view.center.y],
    layers:document.querySelector('#layers').innerHTML}))()`);
  assert.deepEqual(after, before, "Cut artwork, view and layer settings survive Draw and its keys");
  assert.equal((await evaluate("window.modcut.getE2EWorkspaceMenu()")).label, "Draw workspace");
  await evaluate("delete window.__cutScope");
  process.stdout.write("PASS Draw: canvas, menu and Cut isolation\n");
}

export async function runDrawTabWorkflows({ evaluate }) {
  // New preserves the current workspace; returning to an existing tab restores its mode.
  const originalTab = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate(`(() => {
    document.querySelector('#workspaceToggle').click();
    const isMac=/Mac/.test(navigator.platform);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',code:'KeyN',metaKey:isMac,ctrlKey:!isMac,bubbles:true,cancelable:true}));
  })()`);
  await submitNewDrawDialog(evaluate);
  assert.equal(await evaluate("document.body.dataset.workspace"), "draw");
  const newTab = await evaluate("document.querySelector('.doc-tab.is-active').dataset.tabId");
  await evaluate(`document.querySelector('[data-tab-id="${originalTab}"]').click()`);
  assert.equal(await evaluate("document.body.dataset.workspace"), "draw");
  assert.equal(await evaluate("document.querySelectorAll('.draw-canvas').length"), 2, "New Draw documents mount their own canvas");
  await evaluate("document.querySelector('#workspaceToggle').click()");
  await evaluate(`document.querySelector('[data-close-tab="${newTab}"]').click()`);
  await wait();
  process.stdout.write("PASS Draw: per-tab workspace and lazy mounting\n");
}

async function runDrawKernelWorkflows({ evaluate }) {
  const result = await evaluate(`(async () => {
    const { createGeometryKernel } = await import('./draw/geom/kernel.mjs');
    const logs = [], kernel = createGeometryKernel({ logger: (message) => logs.push(message) });
    const rectangle = (x) => [{ closed:true, segments:[[x,0],[x+10,0],[x+10,10],[x,10]].map(p => ({p,in:[0,0],out:[0,0]})) }];
    try {
      const flattened = await kernel.flatten(rectangle(0));
      const union = await kernel.boolean('unite', [rectangle(0),rectangle(5)]);
      const area = Math.abs(union.flat().reduce((sum,ring) => sum + ring.segments.reduce((a,s,i,all) => {
        const p=all[(i+1)%all.length].p; return a+s.p[0]*p[1]-p[0]*s.p[1];
      },0)/2,0));
      let code;
      try { await kernel.boolean('divide', []); } catch(error) { code=error.code; }
      const controller = new AbortController(); controller.abort();
      let aborted;
      try { await kernel.flatten(rectangle(0), .001, {signal:controller.signal}); } catch(error) { aborted=error.name; }
      const after = await kernel.flatten(rectangle(20));
      return { backend:kernel.backend.name, approximate:kernel.backend.approximate, points:flattened[0].points.length,
        area, code, aborted, after:after[0].points[0], logCount:logs.length };
    } finally { kernel.dispose(); }
  })()`);
  assert.deepEqual(result, {backend:'js',approximate:true,points:4,area:150,code:'NOT_IMPLEMENTED',aborted:'AbortError',after:[20,0],logCount:1});
  process.stdout.write('PASS Draw: real geometry Web Worker, flatten, union and error recovery\n');
}

async function runDrawIconWorkflows({ evaluate }) {
  const result = await evaluate(`(async () => {
    const {toolRegistry, iconHref} = await import('./draw/tools/registry.mjs');
    const host=document.createElement('div'); host.id='draw-icon-proof';
    host.style.cssText='position:fixed;left:-10000px;top:0;width:600px;color:var(--text)';
    document.body.append(host);
    try {
      for (const tool of toolRegistry.tools) {
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('width','24'); svg.setAttribute('height','24');
        const use=document.createElementNS('http://www.w3.org/2000/svg','use');
        use.setAttribute('href',iconHref(tool.id)); svg.append(use); host.append(svg);
      }
      let missing=[];
      for (let attempt=0;attempt<50;attempt++) {
        await new Promise(resolve=>setTimeout(resolve,20));
        missing=[...host.querySelectorAll('use')].filter(use=>{const b=use.getBBox();return !b.width||!b.height;});
        if (!missing.length) break;
      }
      return {count:toolRegistry.tools.length,missing:missing.map(use=>use.getAttribute('href').split('#')[1])};
    } finally {host.remove();}
  })()`);
  assert.deepEqual(result,{count:49,missing:[]},'Every tool sprite must render through its external SVG use reference');
  process.stdout.write('PASS Draw: 49 external SVG tool symbols render\n');
}
