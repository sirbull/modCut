import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inputHelpers, wait } from "./cdp.mjs";

const svg = (name, color, x = 2) => ({
  path: `/e2e/${name}.svg`, name: `${name}.svg`, ext: "svg",
  text: `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><rect x="${x}" y="3" width="30" height="20" fill="none" stroke="${color}"/></svg>`,
});
const png = {
  path: "/e2e/photo.png", name: "photo.png", ext: "png",
  dataUrl: `data:image/png;base64,${readFileSync(new URL("../../assets/modcut_logo.png", import.meta.url)).toString("base64")}`,
};
const near = (a, b, epsilon = 0.03) => Math.abs(a - b) <= epsilon;

export async function runWorkflows(client) {
  const { evaluate } = client;
  const { click, drag, key, mouse } = inputHelpers(client);
  await evaluate("localStorage.clear(); location.reload()");
  await wait(800);
  const canvas = await evaluate("(() => { const r=document.querySelector('.bed-canvas').getBoundingClientRect(); return {left:r.left,top:r.top}; })()");
  const p1 = { x: canvas.left + 220, y: canvas.top + 175 };
  const p2 = { x: canvas.left + 330, y: canvas.top + 235 };
  const p3 = { x: canvas.left + 440, y: canvas.top + 175 };

  await evaluate("document.querySelector('[data-tool=pen]').click()");
  await click(p1);
  await mouse("mouseMoved", p2);
  assert.equal(await evaluate("paper.project.getItems({name:'pen-preview'}).length"), 1, "Pen must show a live preview");
  await click(p2); await click(p3); await key("Enter");
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

  const r1 = { x: canvas.left + 520, y: canvas.top + 175 };
  const r2 = { x: canvas.left + 680, y: canvas.top + 255 };
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

  const artworkBeforeImport = await evaluate("paper.project.layers[1].exportJSON({asString:true})");
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify(svg("replacement", "#ff0000"))})`);
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

  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify([svg("added", "#0000ff", 5), png])})`);
  const beforeAdd = await evaluate("paper.project.layers[1].children.length");
  await evaluate("document.querySelector('#add').click()");
  await wait(400);
  assert.ok((await evaluate("paper.project.layers[1].children.length")) > beforeAdd, "Add must append instead of replace");
  assert.equal(await evaluate("paper.project.layers[1].children.some(item=>item.className==='Raster')"), true);
  assert.equal(await evaluate("document.querySelector('#bitmapSec').classList.contains('hidden')"), false);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-quality]')].some(note=>note.classList.contains('is-warning') && note.textContent.includes('Output blocked'))"), true, "oversized raster output must show a visible blocking warning");
  await evaluate("(() => { const input=document.querySelector('.clayer--raster [data-k=dpi]'); input.value=100; input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  assert.equal(await evaluate("[...document.querySelectorAll('.clayer--raster [data-quality]')].some(note=>!note.classList.contains('is-warning') && note.textContent.includes('at 100 DPI'))"), true, "reducing DPI must show effective unblocked output quality");
  await evaluate("(() => { const input=document.querySelector('#bmpBrightnessNum'); input.value=15; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()");
  assert.equal(await evaluate("paper.project.layers[1].children.find(item=>item.className==='Raster').data.rasterSettings.brightness"), 15);

  await wait(700);
  const recovery = await evaluate("window.modcut.readRecovery().then(JSON.parse)");
  assert.equal(recovery.tabs.length, 2);
  assert.equal(recovery.tabs.some((tab) => tab.dirty), true);

  await evaluate("window.close()");
  await wait(200);
  assert.equal(await evaluate("document.querySelector('[data-x=cancel]') !== null"), true, "native window close must ask about dirty tabs");
  await evaluate("document.querySelector('[data-x=cancel]').click()");
  await wait();
  assert.equal(await evaluate("document.querySelectorAll('.doc-tab').length"), 2, "Cancel must keep the window and tabs open");
  await evaluate("window.modcut.requestE2EQuit()");
  await wait(200);
  assert.equal(await evaluate("document.querySelector('[data-x=cancel]') !== null"), true, "application Quit must guard dirty tabs too");
  await evaluate("document.querySelector('[data-x=cancel]').click()");
  return { tabCount: 2 };
}

export async function verifyRecoveredSession(client, expected) {
  await wait(900);
  assert.equal(await client.evaluate("document.querySelectorAll('.doc-tab').length"), expected.tabCount);
  assert.equal(await client.evaluate("[...document.querySelectorAll('.toast')].some(toast=>toast.textContent.includes('Recovered'))"), true);
  assert.equal(await client.evaluate("paper.project.layers[1].children.length > 0"), true);
  await client.evaluate("window.modcut.clearRecovery()");
}
