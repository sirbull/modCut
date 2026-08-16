import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import UTIF from "utif";
import { connectToPage, inputHelpers, wait } from "./cdp.mjs";

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
function buildPdfDataUrl(objects) {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
}
function pdfDataUrl() {
  const content = "0 0 0 rg\n0 0 72 36 re f\n";
  return buildPdfDataUrl([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 36] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ]);
}
function mixedPdfDataUrl() {
  const content = "0 0 0 RG\n4 w\n0 18 m 72 18 l S\nBT\n/F1 12 Tf\n10 5 Td\n(Hello) Tj\nET\n";
  return buildPdfDataUrl([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 36] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}
const tiffDataUrl = `data:image/tiff;base64,${Buffer.from(UTIF.encodeImage(new Uint8Array([
  0, 0, 0, 255, 255, 255, 255, 255,
]), 2, 1)).toString("base64")}`;
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

export async function runWorkflows(client, port) {
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

  await evaluate(`import('./ui.js').then(({openModal}) => {
    window.__conditionalFormResult = undefined;
    openModal({
      title: 'Conditional validation test',
      fields: [
        {key:'name',label:'Name',required:true,value:'New machine'},
        {key:'advanced',label:'Show advanced settings',type:'checkbox',value:false},
        {key:'timing',label:'Timing',type:'number',min:0.1,step:1,value:250,showIf:v=>v.advanced},
      ],
    }).then(value => { window.__conditionalFormResult = value; });
  })`);
  await wait();
  assert.deepEqual(await evaluate("(() => { const form=document.querySelector('.modal form'), timing=form.elements.timing; return {disabled:timing.disabled,valid:form.checkValidity()}; })()"), { disabled: true, valid: true }, "a hidden advanced field must not block native form validation");
  await evaluate("document.querySelector('.modal form').requestSubmit()");
  await wait();
  assert.equal(await evaluate("window.__conditionalFormResult?.timing"), 250, "hidden advanced defaults must still be retained on submit");

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
    await evaluate("document.activeElement?.blur(); window.focus()");
    await wait(100);
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}))");
    await wait(100);
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
  const dispatchToolClick = async (point) => evaluate(`(() => {
    const canvas = document.querySelector('.bed-canvas');
    const bounds = canvas.getBoundingClientRect();
    const projectPoint = paper.view.viewToProject(new paper.Point(
      ${JSON.stringify(point.x)} - bounds.left,
      ${JSON.stringify(point.y)} - bounds.top,
    ));
    const nativeEvent = { button: 0, clientX: ${JSON.stringify(point.x)}, clientY: ${JSON.stringify(point.y)}, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
    const toolEvent = { point: projectPoint, event: nativeEvent };
    paper.tool.onMouseMove(toolEvent);
    paper.tool.onMouseDown(toolEvent);
    paper.tool.onMouseUp(toolEvent);
  })()`);

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
    await dispatchToolClick(point);
    assert.equal(await evaluate("paper.project.layers[1].children[0]?.segments?.length || 0"), expectedSegments);
  };
  await addPenPoint(p2, 2);
  await addPenPoint(p3, 3);
  await key("Enter");
  assert.equal(await evaluate("paper.project.layers[1].children[0].segments.length"), 3);

  await evaluate("document.querySelector('[data-tool=node]').click()");
  await dispatchToolClick(p2);
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
  const beforeLateShift = await transformState();
  await mouse("mouseMoved", beforeLateShift.corner);
  await mouse("mousePressed", beforeLateShift.corner, { buttons: 1 });
  await mouse("mouseMoved", { x: beforeLateShift.corner.x + 35, y: beforeLateShift.corner.y + 4 }, { buttons: 1 });
  await client.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", modifiers: 8 });
  await mouse("mouseMoved", { x: beforeLateShift.corner.x + 70, y: beforeLateShift.corner.y + 18 }, { buttons: 1, modifiers: 8 });
  await mouse("mouseReleased", { x: beforeLateShift.corner.x + 70, y: beforeLateShift.corner.y + 18 }, { modifiers: 8 });
  await client.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft" });
  const lateShifted = await transformState();
  assert.ok(near(lateShifted.ratio, beforeLateShift.ratio), "Shift pressed during scaling must restore the drag-start aspect ratio");
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
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.clayer')].map(row=>row.dataset.layerKey)"), ["vector:#ff0000", "vector:#0000ff"], "new color layers must initially follow source order");
  assert.deepEqual(await evaluate("(() => { const rows=[...document.querySelectorAll('.clayer')]; return {topUp:rows[0].querySelector('[data-move-layer=up]').disabled,bottomDown:rows.at(-1).querySelector('[data-move-layer=down]').disabled}; })()"), { topUp: true, bottomDown: true }, "layer move buttons must stop at the top and bottom");
  await evaluate("document.querySelector('.clayer .toggle').click()");
  assert.equal(await evaluate("paper.project.layers[1].children.filter(item=>item.strokeColor?.toCSS(true)==='#ff0000').every(item=>!item.visible)"), true, "turning a layer off must hide its artwork");
  await evaluate("document.querySelector('.clayer .toggle').click()");
  assert.equal(await evaluate("paper.project.layers[1].children.filter(item=>item.strokeColor?.toCSS(true)==='#ff0000').every(item=>item.visible)"), true, "turning a layer on must show its artwork");
  await evaluate("document.querySelectorAll('.clayer')[1].querySelector('[data-move-layer=up]').click()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.clayer')].map(row=>row.dataset.layerKey)"), ["vector:#0000ff", "vector:#ff0000"], "moving a layer must update the fixed top-to-bottom job order");
  await evaluate("(() => { const select=document.querySelector('#pathOrder'); select.value='optimize'; select.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#simulate').click(); })()");
  await wait(200);
  assert.deepEqual(await evaluate("(() => { const colors=paper.project.layers.at(-1).children[0].children.map(path=>path.strokeColor?.toCSS(true)); return colors.filter((color,index)=>index===0 || color!==colors[index-1]); })()"), ["#0000ff", "#ff0000"], "path optimization must keep layers contiguous and respect their top-to-bottom order");
  await evaluate("document.querySelector('#simClose').click()");

  await evaluate("(() => { const row=[...document.querySelectorAll('.clayer')].find(item=>item.dataset.layerKey==='vector:#0000ff'),op=row.querySelector('.clayer__op'); op.value='Score'; op.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await evaluate("(() => { const row=[...document.querySelectorAll('.clayer')].find(item=>item.dataset.layerKey==='vector:#0000ff'),z=row.querySelector('[data-k=zOffset]'); z.value='0'; z.dispatchEvent(new Event('input',{bubbles:true})); const split=document.querySelector('#splitJobs'); split.checked=true; split.dispatchEvent(new Event('change',{bubbles:true})); })()");
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
  const rasterReadyDeadline = Date.now() + 15_000;
  let rasterReady = false;
  while (!rasterReady && Date.now() < rasterReadyDeadline) {
    rasterReady = await evaluate("paper.project.layers[1].children.some(item=>item.className==='Raster') && !document.querySelector('#bitmapSec').classList.contains('hidden')");
    if (!rasterReady) {
      const rasterHit = await evaluate("(() => { const item=paper.project.layers[1].children.find(candidate=>candidate.className==='Raster'); if(!item?.loaded) return null; const canvas=document.querySelector('.bed-canvas').getBoundingClientRect(),point=paper.view.projectToView(item.position); return {x:canvas.left+point.x,y:canvas.top+point.y}; })()");
      if (rasterHit) await click(rasterHit);
      else await wait(100);
    }
  }
  assert.equal(await evaluate("paper.project.layers[1].children.some(item=>item.className==='Raster')"), true);
  assert.equal(rasterReady, true, "the imported raster must finish loading and become the active bitmap selection");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-quality]')].some(note=>!note.classList.contains('is-warning') && note.textContent.includes('auto-adjusted'))"), true, "oversized raster output must show the automatic effective-DPI adjustment");
  await evaluate("(() => { const input=document.querySelector('.clayer--raster [data-k=dpi]'); input.value=100; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  assert.equal(await evaluate("[...document.querySelectorAll('.clayer--raster [data-quality]')].some(note=>!note.classList.contains('is-warning') && note.textContent.includes('at 100 DPI'))"), true, "reducing DPI must show effective unblocked output quality");
  await evaluate("(() => { const input=document.querySelector('#bmpBrightnessNum'); input.value=15; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.equal(await evaluate("paper.project.layers[1].children.find(item=>item.className==='Raster').data.rasterSettings.brightness"), 15);
  await evaluate("(() => { const input=document.querySelector('#bmpSharpenNum'); input.value=1.25; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.deepEqual(await evaluate("(() => { const raster=paper.project.layers[1].children.find(item=>item.className==='Raster'); return {slider:+document.querySelector('#bmpSharpen').value,recipe:raster.data.engravingRecipe?.adjustments?.enhanceAmount}; })()"), { slider: 1.25, recipe: 1.25 }, "the regular Sharpen control must persist in the non-destructive engraving recipe");
  await evaluate("(() => { const input=document.querySelector('#bmpDehazeNum'); input.value=40; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.deepEqual(await evaluate("(() => { const raster=paper.project.layers[1].children.find(item=>item.className==='Raster'); return {slider:+document.querySelector('#bmpDehaze').value,recipe:raster.data.engravingRecipe?.adjustments?.dehaze}; })()"), { slider: 40, recipe: 40 }, "the regular Dehaze control must persist in the non-destructive engraving recipe");

  const rasterWidthBeforeEditor = await evaluate("paper.project.layers[1].children.find(item=>item.className==='Raster').bounds.width");
  await evaluate("document.querySelector('#advancedImageEditor').click()");
  const imageEditor = await connectToPage(port, "Advanced Editing for Engraving · modCut");
  const editorReadyDeadline = Date.now() + 10_000;
  let editorReady = false;
  while (!editorReady && Date.now() < editorReadyDeadline) {
    try { editorReady = await imageEditor.evaluate("!!document.querySelector('#cropBox') && document.querySelector('#previewCanvas').width > 0 && document.querySelector('#previewSurface').getBoundingClientRect().width > 200"); } catch {}
    if (!editorReady) await wait(100);
  }
  assert.equal(editorReady, true, "advanced editor must open in its own loaded window");
  await imageEditor.evaluate(`(() => {
    const handle=document.querySelector('[data-handle=e]'),h=handle.getBoundingClientRect(),s=document.querySelector('#previewSurface').getBoundingClientRect();
    const x=h.left+h.width/2,y=h.top+h.height/2;
    handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:7,clientX:x,clientY:y,button:0,buttons:1}));
    window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:7,clientX:x-s.width*.2,clientY:y,button:0,buttons:1}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,clientX:x-s.width*.2,clientY:y,button:0}));
  })()`);
  await wait(100);
  assert.notEqual(await imageEditor.evaluate("document.querySelector('#cropPercent').textContent"), "100 × 100%", "dragging a crop edge must update the crop");
  await imageEditor.evaluate("[...document.querySelectorAll('.style-card')].find(button=>button.textContent.includes('Dots')).click()");
  assert.equal(await imageEditor.evaluate("document.querySelector('.style-card.is-active strong').textContent"), "Dots", "engraving style must update inside the editor");
  const advancedControls = await imageEditor.evaluate(`(() => {
    const detail=document.querySelector('#detailControl input[type=range]');
    detail.value=82; detail.dispatchEvent(new Event('input',{bubbles:true}));
    const brightness=[...document.querySelectorAll('#adjustmentControls .control')].find(row=>row.querySelector('label').textContent==='Brightness').querySelector('input[type=number]');
    brightness.value=-12; brightness.dispatchEvent(new Event('change',{bubbles:true}));
    const dehaze=[...document.querySelectorAll('#adjustmentControls .control')].find(row=>row.querySelector('label').textContent==='Dehaze').querySelector('input[type=number]');
    return {detail:+document.querySelector('#detailControl input[type=number]').value,brightness:+brightness.value,dehaze:+dehaze.value,hint:document.querySelector('#detailHint').textContent};
  })()`);
  assert.equal(advancedControls.detail, 82, "every engraving style must expose a synchronized detail control");
  assert.equal(advancedControls.brightness, -12, "tone controls must remain available alongside style controls");
  assert.equal(advancedControls.dehaze, 40, "Dehaze from regular adjustments must carry into the advanced editor");
  assert.equal(advancedControls.hint.includes("halftone cells/in"), true, "the detail control must explain its effective halftone density");
  try { await imageEditor.evaluate("document.querySelector('#applyButton').click()"); } catch {}
  imageEditor.socket.close();
  const recipeDeadline = Date.now() + 5_000;
  let appliedRecipe = null;
  while (!appliedRecipe && Date.now() < recipeDeadline) {
    appliedRecipe = await evaluate("(() => { const raster=paper.project.layers[1].children.find(item=>item.className==='Raster'); return raster?.data?.engravingRecipe || null; })()");
    if (!appliedRecipe) await wait(100);
  }
  assert.equal(appliedRecipe.style, "Dots", "Apply must persist the advanced recipe on the Paper.js raster");
  assert.equal(appliedRecipe.dots.detail, 82, "Apply must persist the selected style's detail level");
  assert.equal(appliedRecipe.adjustments.brightness, -12, "tone adjustments must persist in the same engraving recipe");
  assert.equal(appliedRecipe.adjustments.enhanceAmount, 1.25, "regular Sharpen must carry into the advanced editor and final laser recipe");
  assert.equal(appliedRecipe.adjustments.dehaze, 40, "regular Dehaze must carry into the advanced editor and final laser recipe");
  assert.ok(appliedRecipe.crop.width < 1, "Apply must persist the non-destructive crop rectangle");
  const croppedBoundsDeadline = Date.now() + 5_000;
  let croppedWidth = rasterWidthBeforeEditor;
  while (croppedWidth >= rasterWidthBeforeEditor && Date.now() < croppedBoundsDeadline) {
    croppedWidth = await evaluate("paper.project.layers[1].children.find(item=>item.className==='Raster').bounds.width");
    if (croppedWidth >= rasterWidthBeforeEditor) await wait(100);
  }
  assert.ok(croppedWidth < rasterWidthBeforeEditor, "applying crop must shrink the image bounds on the laser bed");

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

  const pdfPreview = await evaluate(`import('./pdfimport.js').then(module => module.pdfToArtwork(${JSON.stringify(pdfDataUrl())}, {dpi:72,maxPixels:1000000}).then(result => ({widthMm:result.widthMm,heightMm:result.heightMm,pageCount:result.pageCount,vectorPathCount:result.vectorPathCount,raster:!!result.rasterDataUrl,svg:result.svgText?.includes('<path')})))`);
  assert.ok(near(pdfPreview.widthMm, 25.4) && near(pdfPreview.heightMm, 12.7), "PDF import must retain the page's physical dimensions");
  assert.deepEqual({ pageCount: pdfPreview.pageCount, vectorPathCount: pdfPreview.vectorPathCount, raster: pdfPreview.raster, svg: pdfPreview.svg }, { pageCount: 1, vectorPathCount: 1, raster: false, svg: true }, "a vector-only PDF must stay editable without a duplicate raster");
  const mixedPdf = await evaluate(`import('./pdfimport.js').then(async module => { const result=await module.pdfToArtwork(${JSON.stringify(mixedPdfDataUrl())}, {dpi:72,maxPixels:1000000}); window.__mixedPdfRaster=result.rasterDataUrl; return {vectorPathCount:result.vectorPathCount,raster:!!result.rasterDataUrl}; })`);
  mixedPdf.linePixel = await evaluate(`(async()=>{const image=await new Promise((resolve,reject)=>{const element=new Image(); element.onload=()=>resolve(element); element.onerror=()=>reject(new Error('Raster preview could not be decoded')); element.src=window.__mixedPdfRaster;}),canvas=document.createElement('canvas'),context=canvas.getContext('2d'); canvas.width=image.width; canvas.height=image.height; context.drawImage(image,0,0); return [...context.getImageData(36,18,1,1).data];})()`);
  assert.equal(mixedPdf.vectorPathCount, 1, "a mixed PDF must expose its solid path as an editable vector");
  assert.equal(mixedPdf.raster, true, "a mixed PDF must retain text and images in a raster fallback");
  assert.equal(mixedPdf.linePixel.slice(0, 3).every(channel => channel > 245), true, "an extracted PDF vector must be omitted from the raster fallback to prevent double output");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([{ path: "/e2e/mixed.pdf", name: "mixed.pdf", ext: "pdf", dataUrl: mixedPdfDataUrl() }])}); document.querySelector('#add').click()`);
  let mixedLayers = [];
  const mixedLayerDeadline = Date.now() + 10_000;
  while (mixedLayers.length < 2 && Date.now() < mixedLayerDeadline) {
    mixedLayers = await evaluate("[...document.querySelectorAll('.clayer')].filter(row=>row.dataset.layerKey.endsWith(':#000000')).map(row=>({key:row.dataset.layerKey,kind:row.querySelector('.clayer__kind').textContent,op:row.querySelector('.clayer__op').value,choices:[...row.querySelector('.clayer__op').options].map(option=>option.value)}))");
    if (mixedLayers.length < 2) await wait(100);
  }
  assert.deepEqual(mixedLayers, [
    { key: "raster:#000000", kind: "Raster", op: "Engrave", choices: ["Engrave", "Ignore"] },
    { key: "vector:#000000", kind: "Vector", op: "Cut", choices: ["Cut", "Engrave", "Score", "Ignore"] },
  ], "same-color PDF raster and thick vector strokes must remain independently assignable process layers");
  const thickVectorEngrave = await evaluate("(() => { let row=[...document.querySelectorAll('.clayer')].find(item=>item.dataset.layerKey==='vector:#000000'),op=row.querySelector('.clayer__op'); op.value='Engrave'; op.dispatchEvent(new Event('change',{bubbles:true})); row=[...document.querySelectorAll('.clayer')].find(item=>item.dataset.layerKey==='vector:#000000'); return row.querySelector('[data-quality]').textContent; })()");
  const thickVectorRows = Number(thickVectorEngrave.match(/([0-9,]+) filled-vector scan lines/)?.[1].replaceAll(",", ""));
  assert.ok(thickVectorRows > 5, "Engrave quality must include multiple scan lines across an open vector stroke's painted width");
  await evaluate("(() => { const target='vector:#000000',keys=[...document.querySelectorAll('.clayer')].map(row=>row.dataset.layerKey).filter(key=>key!==target); for(const key of keys){const row=[...document.querySelectorAll('.clayer')].find(item=>item.dataset.layerKey===key),toggle=row?.querySelector('.toggle'); if(toggle?.getAttribute('aria-checked')==='true') toggle.click();} document.querySelector('#simulate').click(); })()");
  await wait(200);
  assert.ok(await evaluate("paper.project.layers.at(-1).children[0]?.children.length || 0") > 5, "simulation must contain multiple raster scan paths for the thick open vector stroke");
  await evaluate("document.querySelector('#simClose').click()");
  const tiffPreview = await evaluate(`import('./tiffimport.js').then(module => { const result=module.tiffToPng(${JSON.stringify(tiffDataUrl)}); return {frameCount:result.frameCount,png:result.dataUrl.startsWith('data:image/png;base64,')}; })`);
  assert.deepEqual(tiffPreview, { frameCount: 1, png: true }, "TIFF import must decode its first frame to a PNG raster");

  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([{ path: "/e2e/design.cdr", name: "design.cdr", ext: "cdr", kind: "unsupported", reason: "unsupported-format" }])}); document.querySelector('#add').click()`);
  await wait();
  assert.equal(await evaluate("document.querySelector('.message-modal .panel__header').textContent"), "Unsupported file format");
  assert.equal(await evaluate("document.querySelector('.message-modal').textContent.includes('SVG, SVGZ, DXF, PLT, HPGL') && document.querySelector('.message-modal').textContent.includes('MODCUT')"), true, "unsupported-format dialog must list supported vector, image and document formats");
  await evaluate("document.querySelector('.message-modal .modal-actions button').click()");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([{ path: "/e2e/legacy.ai", name: "legacy.ai", ext: "ai", kind: "unsupported", reason: "ai-not-pdf-compatible" }])}); document.querySelector('#add').click()`);
  await wait();
  assert.equal(await evaluate("document.querySelector('.message-modal .panel__header').textContent"), "Illustrator file is not PDF-compatible");
  assert.equal(await evaluate("document.querySelector('.message-modal').textContent.includes('Create PDF Compatible File') && document.querySelector('.message-modal').textContent.includes('Export As → SVG')"), true, "AI warning must explain both the compatible-AI and recommended SVG fixes");
  await evaluate("document.querySelector('.message-modal .modal-actions button').click()");

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
