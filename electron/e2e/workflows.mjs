import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inputHelpers, wait } from "./cdp.mjs";

const svg = (name, color, x = 2) => ({
  path: `/e2e/${name}.svg`, name: `${name}.svg`, ext: "svg",
  text: `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><rect x="${x}" y="3" width="30" height="20" fill="none" stroke="${color}"/></svg>`,
});
const illustratorSvg = (name, color) => ({
  path: `/e2e/${name}.svg`, name: `${name}.svg`, ext: "svg",
  text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 288 144"><!-- Generator: Adobe Illustrator 30.2.1 --><rect x="72" y="36" width="72" height="36" fill="none" stroke="${color}"/></svg>`,
});
const png = {
  path: "/e2e/photo.png", name: "photo.png", ext: "png",
  dataUrl: `data:image/png;base64,${readFileSync(new URL("../../assets/modcut_logo.png", import.meta.url)).toString("base64")}`,
};
const near = (a, b, epsilon = 0.03) => Math.abs(a - b) <= epsilon;
const zMachine = [{
  id: "dummy-z", name: "Dummy Z", driver: "Dummy", bedW: 600, bedH: 400, maxFeed: 12000,
  conn: { type: "usb", serial: "", baud: 115200 },
  zAxis: { enabled: true, min: -5, max: 3, feed: 250, globalOffset: 0.25 },
  adv: { flipX: false, flipY: true, home: "front-left" },
}];
const processProfiles = [{
  id: "cut-z-test", name: "Cut with focus offset", op: "Cut",
  power: 37, speed: 24, freq: 18000, zOffset: -1,
}];

export async function runWorkflows(client) {
  const { evaluate } = client;
  const { click, drag, key, mouse } = inputHelpers(client);
  const rightClick = async (point) => {
    await evaluate(`(() => { const canvas=document.querySelector('.bed-canvas'),r=canvas.getBoundingClientRect(),event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:${point.x},clientY:${point.y}}); Object.defineProperties(event,{offsetX:{value:${point.x}-r.left},offsetY:{value:${point.y}-r.top}}); canvas.dispatchEvent(event); })()`);
    await wait();
  };
  await evaluate(`localStorage.clear(); localStorage.setItem("modcut_machines", ${JSON.stringify(JSON.stringify(zMachine))}); localStorage.setItem("modcut_process_profiles", ${JSON.stringify(JSON.stringify(processProfiles))}); location.reload()`);
  const readyDeadline = Date.now() + 10_000;
  let canvas = null;
  while (!canvas && Date.now() < readyDeadline) {
    try {
      canvas = await evaluate("(() => { const el=document.querySelector('.bed-canvas'); if (document.readyState !== 'complete' || !el || !window.paper?.project || paper.project.layers.length < 2 || !document.querySelector('.doc-tab.is-active')) return null; const r=el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? {left:r.left,top:r.top,width:r.width,height:r.height} : null; })()");
    } catch {}
    if (!canvas) await wait(100);
  }
  assert.ok(canvas, "modCut canvas must be ready after reload");
  await wait(300);
  assert.equal(await evaluate("document.querySelector('#splitJobs').checked"), false, "split by operation must be off by default");

  const zoomBeforeShortcut = await evaluate("paper.view.zoom");
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'+',metaKey:true,bubbles:true,cancelable:true}))");
  assert.ok((await evaluate("paper.view.zoom")) > zoomBeforeShortcut, "Cmd/Ctrl++ must zoom in");
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'-',metaKey:true,bubbles:true,cancelable:true}))");

  let shapeSteps = null;
  for (let attempt = 1; attempt <= 3 && !shapeSteps; attempt++) {
    await evaluate("window.focus(); document.querySelector('[data-tool=rect]').click()");
    await click({ x: canvas.left + canvas.width * 0.45, y: canvas.top + canvas.height * 0.45 });
    await wait(150);
    shapeSteps = await evaluate("(() => { const w=document.querySelector('input[name=w]'),h=document.querySelector('input[name=h]'); return w&&h ? {wStep:w.step,hStep:h.step} : null; })()");
  }
  assert.deepEqual(shapeSteps, { wStep: "0.01", hStep: "0.01" }, "exact shape dimensions must allow decimals");
  await evaluate("(() => { const form=document.querySelector('.modal form'); form.elements.w.value='12.34'; form.elements.h.value='5.67'; form.requestSubmit(); })()");
  await wait();
  const exactShape = await evaluate("(() => { const item=paper.project.layers[1].children.at(-1),b=item.bounds,c=document.querySelector('.bed-canvas').getBoundingClientRect(),v=paper.view.projectToView(b.topCenter); return {w:b.width,h:b.height,hit:{x:c.left+v.x,y:c.top+v.y}}; })()");
  assert.ok(near(exactShape.w, 123.4) && near(exactShape.h, 56.7), "a shape created from decimal centimetre dimensions must keep the exact size");
  assert.deepEqual(await evaluate("(() => ({op:document.querySelector('.clayer__op').value,power:+document.querySelector('[data-k=power]').value,speed:+document.querySelector('[data-k=speed]').value,freq:+document.querySelector('[data-k=freq]').value,z:+document.querySelector('[data-k=zOffset]').value}))()"), { op: "Cut", power: 100, speed: 50, freq: 500, z: -1.5 }, "new Cut layers must use the workshop defaults");
  await evaluate("(() => { const op=document.querySelector('.clayer__op'); op.value='Score'; op.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.deepEqual(await evaluate("(() => ({power:+document.querySelector('[data-k=power]').value,speed:+document.querySelector('[data-k=speed]').value,freq:+document.querySelector('[data-k=freq]').value,z:+document.querySelector('[data-k=zOffset]').value}))()"), { power: 15, speed: 100, freq: 500, z: 3 }, "Score layers must use the workshop defaults");
  for (let attempt = 1; attempt <= 3 && await evaluate("paper.project.layers[1].children.length > 0"); attempt++) {
    await evaluate("window.focus()");
    await key("Backspace");
  }
  assert.equal(await evaluate("paper.project.layers[1].children.length"), 0, "Backspace must delete a newly created and automatically selected shape");
  await key("z", 4);
  await rightClick(exactShape.hit);
  assert.equal(await evaluate("document.querySelector('.ctx-menu [data-act=delete]').textContent.includes('Delete object')"), true, "an object's context menu must offer Delete object");
  await evaluate("document.querySelector('.ctx-menu [data-act=delete]').click()");
  assert.equal(await evaluate("paper.project.layers[1].children.length"), 0, "Delete object must remove the selected object");

  const p1 = { x: canvas.left + canvas.width * 0.2, y: canvas.top + canvas.height * 0.3 };
  const p2 = { x: canvas.left + canvas.width * 0.35, y: canvas.top + canvas.height * 0.42 };
  const p3 = { x: canvas.left + canvas.width * 0.5, y: canvas.top + canvas.height * 0.3 };

  let penPreviewCount = 0;
  for (let attempt = 1; attempt <= 3 && !penPreviewCount; attempt++) {
    await evaluate("window.focus(); document.querySelector('[data-tool=pen]').click()");
    await click(p1);
    await mouse("mouseMoved", { x: p1.x + 12, y: p1.y + 8 });
    await mouse("mouseMoved", p2);
    const previewDeadline = Date.now() + 1_000;
    while (!penPreviewCount && Date.now() < previewDeadline) {
      penPreviewCount = await evaluate("paper.project.getItems({name:'pen-preview'}).length");
      if (!penPreviewCount) await wait(50);
    }
    if (!penPreviewCount) {
      await key("Escape");
      await wait(150);
    }
  }
  assert.equal(penPreviewCount, 1, "Pen must show a live preview");
  const addPenPoint = async (point, expectedSegments) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await click(point);
      const count = await evaluate("paper.project.layers[1].children[0]?.segments?.length || 0");
      if (count >= expectedSegments) return;
      await wait(100);
    }
  };
  await addPenPoint(p2, 2);
  await addPenPoint(p3, 3);
  await key("Enter");
  assert.equal(await evaluate("paper.project.layers[1].children[0].segments.length"), 3);

  await evaluate("document.querySelector('[data-tool=node]').click()");
  await click(p2);
  assert.equal(await evaluate("paper.project.getItems({name:'selected-anchor'}).length"), 1);
  await key("Backspace");
  assert.equal(await evaluate("paper.project.layers[1].children[0].segments.length"), 2);
  await key("z", 4);

  await evaluate("document.querySelector('#addTab').click()");
  assert.equal(await evaluate("document.querySelectorAll('.doc-tab').length"), 2);
  assert.equal(await evaluate("paper.project.layers[1].children.length"), 0, "new tab must have an independent empty design");
  await evaluate("document.querySelector('[data-tab-id=\"1\"]').click()");
  assert.equal(await evaluate("paper.project.layers[1].children[0].segments.length"), 3, "switching back must restore tab one");

  const r1 = { x: canvas.left + canvas.width * 0.58, y: canvas.top + canvas.height * 0.3 };
  const r2 = { x: canvas.left + canvas.width * 0.76, y: canvas.top + canvas.height * 0.46 };
  await evaluate("document.querySelector('[data-tool=rect]').click()");
  await drag(r1, r2);
  await evaluate("document.querySelector('[data-tool=select]').click()");
  await click({ x: (r1.x + r2.x) / 2, y: r1.y });
  const transformState = () => evaluate(`(() => {
    const item=paper.project.layers[1].children.at(-1), b=item.bounds, c=document.querySelector('.bed-canvas').getBoundingClientRect(), v=paper.view.projectToView(b.bottomRight);
    return {ratio:b.width/b.height,cx:b.center.x,cy:b.center.y,corner:{x:c.left+v.x,y:c.top+v.y}};
  })()`);
  const initial = await transformState();
  await client.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", modifiers: 8 });
  await drag(initial.corner, { x: initial.corner.x + 75, y: initial.corner.y + 18 }, 8);
  await client.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft" });
  const shifted = await transformState();
  assert.ok(near(shifted.ratio, initial.ratio), "Shift must preserve aspect ratio");
  await key("z", 4);
  await click({ x: (r1.x + r2.x) / 2, y: r1.y });
  const beforeAlt = await transformState();
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Alt',altKey:true,bubbles:true}))");
  await client.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Alt", code: "AltLeft", modifiers: 1 });
  await drag(beforeAlt.corner, { x: beforeAlt.corner.x + 55, y: beforeAlt.corner.y + 25 }, 1);
  await client.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Alt", code: "AltLeft" });
  await evaluate("window.dispatchEvent(new KeyboardEvent('keyup',{key:'Alt',bubbles:true}))");
  const alt = await transformState();
  assert.ok(near(alt.cx, beforeAlt.cx) && near(alt.cy, beforeAlt.cy), "Alt must scale around the center");

  await key("a", 4);
  await key("g", 4);
  const selectedGroup = await evaluate("(() => { const item=paper.project.layers[1].children[0],path=item.getItems({recursive:true,match:child=>child.className==='Path'})[0],c=document.querySelector('.bed-canvas').getBoundingClientRect(),v=paper.view.projectToView(path.segments[0].point); return {isGroup:item.className==='Group' && item.data.modcutGroup,hit:{x:c.left+v.x,y:c.top+v.y}}; })()");
  assert.equal(selectedGroup.isGroup, true, "the test artwork must be grouped");
  await rightClick(selectedGroup.hit);
  assert.equal(await evaluate("document.querySelector('.ctx-menu [data-act=delete]').textContent.includes('Delete group')"), true, "a group's context menu must offer Delete group");
  await evaluate("document.querySelector('.ctx-menu [data-act=delete]').click()");
  assert.equal(await evaluate("paper.project.layers[1].children.length"), 0, "Delete group must remove the entire group");
  await key("z", 4);
  await key("a", 4);
  await key("g", 12);

  assert.equal(await evaluate("document.querySelector('[data-k=zOffset]').disabled"), false, "Focus offset must be available for a Z-enabled machine profile");
  await evaluate("(() => { const select=document.querySelector('[data-profile]'); select.value='cut-z-test'; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.deepEqual(await evaluate("(() => ({power:+document.querySelector('[data-k=power]').value,speed:+document.querySelector('[data-k=speed]').value,z:+document.querySelector('[data-k=zOffset]').value,profile:document.querySelector('[data-profile]').value}))()"), { power: 37, speed: 24, z: -1, profile: "cut-z-test" }, "a named process profile must apply all output settings together");
  assert.equal(await evaluate("document.querySelector('.clayer__z-hint').textContent.includes('Z -0.75 mm')"), true, "machine and layer focus offsets must be shown as one resulting Z position");
  await evaluate("(() => { const input=document.querySelector('[data-k=power]'); input.value=38; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  assert.equal(await evaluate("document.querySelector('[data-profile]').value"), "custom", "manual changes must detach the layer from its named profile");
  await evaluate("(() => { const select=document.querySelector('[data-profile]'); select.value='cut-z-test'; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await evaluate("document.querySelector('#connect').click()");
  const connectionDeadline = Date.now() + 5_000;
  let connected = false;
  while (!connected && Date.now() < connectionDeadline) {
    connected = await evaluate("document.querySelector('#connText').textContent.includes('dry run')");
    if (!connected) await wait(100);
  }
  assert.equal(connected, true);
  await evaluate("(() => { const input=document.querySelector('[data-k=freq]'); input.value=''; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  assert.equal(await evaluate("document.querySelector('[data-k=freq]').value"), "", "frequency must remain empty while the user edits it");
  await evaluate("document.querySelector('#sendBtn').click()");
  await wait();
  assert.equal(await evaluate("[...document.querySelectorAll('.toast')].some(toast=>toast.textContent.includes('Frequency is required'))"), true, "an empty frequency must block sending with a clear message");
  await evaluate("(() => { const input=document.querySelector('[data-k=freq]'); input.value='500'; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await evaluate("document.querySelector('#sendBtn').click()");
  const jobDeadline = Date.now() + 5_000;
  let started = false;
  while (!started && Date.now() < jobDeadline) {
    started = await evaluate("[...document.querySelectorAll('.toast')].some(toast=>toast.textContent.includes('started'))");
    if (!started) await wait(100);
  }
  assert.equal(started, true, "a focus-adjusted Z job must pass renderer and sidecar validation");

  const artworkBeforeImport = await evaluate("paper.project.layers[1].exportJSON({asString:true})");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify(illustratorSvg("replacement", "#ff0000"))})`);
  await evaluate("document.querySelector('#import').click()");
  await wait();
  const prompt = await evaluate("[...document.querySelectorAll('.modal-actions button')].map(button=>({text:button.textContent.trim(),primary:button.classList.contains('btn--primary')}))");
  assert.deepEqual(prompt.map((item) => item.text), ["Don't Save", "Cancel", "Save"]);
  assert.equal(prompt[2].primary, true);
  await evaluate("document.querySelector('[data-x=cancel]').click()");
  assert.equal(await evaluate("paper.project.layers[1].exportJSON({asString:true})"), artworkBeforeImport, "Cancel must preserve current artwork exactly");
  await evaluate("document.querySelector('#import').click()");
  await wait();
  await evaluate("document.querySelector('[data-x=discard]').click()");
  await wait(250);
  assert.equal(await evaluate("document.querySelector('#file').textContent.includes('replacement.svg')"), true);
  const importedIllustratorBounds = await evaluate("(() => { const b=paper.project.layers[1].children[0].bounds; return {x:b.x,y:b.y,w:b.width,h:b.height}; })()");
  assert.ok(near(importedIllustratorBounds.w, 25.4) && near(importedIllustratorBounds.h, 12.7), "Illustrator artwork must retain its physical size instead of expanding to the artboard");
  assert.ok(near(importedIllustratorBounds.x, 274.6) && near(importedIllustratorBounds.y, 187.3), "Illustrator artwork must retain its position inside the centered artboard");
  await evaluate("document.querySelector('#simulate').click()");
  await wait(200);
  assert.equal(await evaluate("paper.project.layers.at(-1).children[0].children.some(path=>path.strokeColor?.toCSS(true)==='#ff0000')"), true, "simulation paths must retain their source layer color");
  await evaluate("document.querySelector('#simClose').click()");

  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([svg("added", "#0000ff", 5)])})`);
  const beforeAdd = await evaluate("paper.project.layers[1].children.length");
  await evaluate("document.querySelector('#add').click()");
  await wait(400);
  assert.ok((await evaluate("paper.project.layers[1].children.length")) > beforeAdd, "Add must append instead of replace");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.clayer')].map(row=>row.dataset.layerKey)"), ["#ff0000", "#0000ff"], "new color layers must initially follow source order");
  assert.deepEqual(await evaluate("(() => { const rows=[...document.querySelectorAll('.clayer')]; return {topUp:rows[0].querySelector('[data-move-layer=up]').disabled,bottomDown:rows.at(-1).querySelector('[data-move-layer=down]').disabled}; })()"), { topUp: true, bottomDown: true }, "layer move buttons must stop at the top and bottom");
  await evaluate("document.querySelector('.clayer .toggle').click()");
  assert.equal(await evaluate("paper.project.layers[1].children.filter(item=>item.strokeColor?.toCSS(true)==='#ff0000').every(item=>!item.visible)"), true, "turning a layer off must hide its artwork");
  await evaluate("document.querySelector('.clayer .toggle').click()");
  assert.equal(await evaluate("paper.project.layers[1].children.filter(item=>item.strokeColor?.toCSS(true)==='#ff0000').every(item=>item.visible)"), true, "turning a layer on must show its artwork");
  await evaluate("document.querySelectorAll('.clayer')[1].querySelector('[data-move-layer=up]').click()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.clayer')].map(row=>row.dataset.layerKey)"), ["#0000ff", "#ff0000"], "moving a layer must update the fixed top-to-bottom job order");
  await evaluate("(() => { const select=document.querySelector('#pathOrder'); select.value='optimize'; select.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#simulate').click(); })()");
  await wait(200);
  assert.deepEqual(await evaluate("paper.project.layers.at(-1).children[0].children.map(path=>path.strokeColor?.toCSS(true))"), ["#0000ff", "#ff0000"], "path optimization must keep layers contiguous and respect their top-to-bottom order");
  await evaluate("document.querySelector('#simClose').click()");

  await evaluate("(() => { const row=[...document.querySelectorAll('.clayer')].find(item=>item.dataset.layerKey==='#0000ff'),op=row.querySelector('.clayer__op'); op.value='Score'; op.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await evaluate("(() => { const row=[...document.querySelectorAll('.clayer')].find(item=>item.dataset.layerKey==='#0000ff'),z=row.querySelector('[data-k=zOffset]'); z.value='0'; z.dispatchEvent(new Event('input',{bubbles:true})); const split=document.querySelector('#splitJobs'); split.checked=true; split.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.equal(await evaluate("localStorage.getItem('modcut_split_by_operation')"), "true", "split by operation must persist as a user preference");
  await evaluate("document.querySelector('#sendBtn').click()");
  const splitDeadline = Date.now() + 5_000;
  let splitCompleted = false;
  while (!splitCompleted && Date.now() < splitDeadline) {
    splitCompleted = await evaluate("[...document.querySelectorAll('.toast')].some(toast=>toast.textContent.includes('2 separate files') && toast.textContent.includes('completed'))");
    if (!splitCompleted) await wait(100);
  }
  assert.equal(splitCompleted, true, "split mode must send separate Score and Cut files as one ordered sequence");

  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([png])})`);
  await evaluate("document.querySelector('#add').click()");
  await wait(400);
  assert.equal(await evaluate("paper.project.layers[1].children.some(item=>item.className==='Raster')"), true);
  assert.equal(await evaluate("document.querySelector('#bitmapSec').classList.contains('hidden')"), false);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-quality]')].some(note=>note.classList.contains('is-warning') && note.textContent.includes('Output blocked'))"), true, "oversized raster output must show a visible blocking warning");
  await evaluate("(() => { const input=document.querySelector('.clayer--raster [data-k=dpi]'); input.value=100; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  assert.equal(await evaluate("[...document.querySelectorAll('.clayer--raster [data-quality]')].some(note=>!note.classList.contains('is-warning') && note.textContent.includes('at 100 DPI'))"), true, "reducing DPI must show effective unblocked output quality");
  await evaluate("(() => { const input=document.querySelector('#bmpBrightnessNum'); input.value=15; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.equal(await evaluate("paper.project.layers[1].children.find(item=>item.className==='Raster').data.rasterSettings.brightness"), 15);

  const droppedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect x="1" y="1" width="18" height="8" fill="none" stroke="#00aa00"/></svg>`;
  await evaluate(`(() => {
    const transfer=new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(droppedSvg)}], 'dropped.svg', {type:'image/svg+xml'}));
    window.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  })()`);
  assert.equal(await evaluate("!document.querySelector('#dropOverlay').classList.contains('hidden')"), true, "dragging files over the editor must show the drop target");
  const beforeDrop = await evaluate("paper.project.layers[1].children.length");
  await evaluate(`(() => {
    const transfer=new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(droppedSvg)}], 'dropped.svg', {type:'image/svg+xml'}));
    window.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  })()`);
  await wait(400);
  assert.ok((await evaluate("paper.project.layers[1].children.length")) > beforeDrop, "a dropped vector must be appended to the active project");
  assert.equal(await evaluate("document.querySelector('#dropOverlay').classList.contains('hidden')"), true, "the drop target must close after the drop");

  await evaluate(`(() => {
    const documentData={app:'modCut',version:2,design:paper.project.layers[1].exportJSON({asString:true}),filename:'dropped-project',mappingMode:'color',layers:[],units:'cm'};
    const transfer=new DataTransfer();
    transfer.items.add(new File([JSON.stringify(documentData)], 'dropped-project.modcut', {type:'application/json'}));
    window.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  })()`);
  await wait(400);
  assert.equal(await evaluate("document.querySelectorAll('.doc-tab').length"), 3, "a dropped project must open in a new tab");
  assert.equal(await evaluate("document.querySelector('.doc-tab.is-active .doc-tab__title').textContent"), "dropped-project.modcut");
  assert.equal(await evaluate("document.querySelector('#file').textContent.includes('*')"), false, "a dropped project must open cleanly");

  await wait(700);
  const recovery = await evaluate("window.modcut.readRecovery().then(JSON.parse)");
  assert.equal(recovery.tabs.length, 3);
  assert.equal(recovery.tabs.some((tab) => tab.dirty), true);

  await evaluate("window.close()");
  await wait(200);
  assert.equal(await evaluate("document.querySelector('[data-x=cancel]') !== null"), true, "native window close must ask about dirty tabs");
  await evaluate("document.querySelector('[data-x=cancel]').click()");
  await wait();
  assert.equal(await evaluate("document.querySelectorAll('.doc-tab').length"), 3, "Cancel must keep the window and tabs open");
  await evaluate("window.modcut.requestE2EQuit()");
  await wait(200);
  assert.equal(await evaluate("document.querySelector('[data-x=cancel]') !== null"), true, "application Quit must guard dirty tabs too");
  await evaluate("document.querySelector('[data-x=cancel]').click()");
  return { tabCount: 3 };
}

export async function verifyRecoveredSession(client, expected) {
  await wait(900);
  assert.equal(await client.evaluate("document.querySelectorAll('.doc-tab').length"), expected.tabCount);
  assert.equal(await client.evaluate("[...document.querySelectorAll('.toast')].some(toast=>toast.textContent.includes('Recovered'))"), true);
  assert.equal(await client.evaluate("paper.project.layers[1].children.length > 0"), true);
  await client.evaluate("window.modcut.clearRecovery()");
}
