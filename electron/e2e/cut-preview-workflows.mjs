import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { wait } from "./cdp.mjs";

// Cut, Score and Engrave shapes in one SVG, each in its own colour layer.
const artwork = {
  path: "/e2e/process-preview.svg", name: "process-preview.svg", ext: "svg",
  text: `<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="50mm" viewBox="0 0 120 50">
    <rect x="5" y="5" width="30" height="30" fill="none" stroke="#ff0000"/>
    <rect x="45" y="5" width="30" height="30" fill="none" stroke="#0000ff"/>
    <circle cx="100" cy="20" r="15" fill="#000000"/></svg>`,
};

export async function runCutPreviewWorkflows(client, { screenshot = null } = {}) {
  const { evaluate } = client;
  await evaluate(`localStorage.clear(); location.reload()`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { if (await evaluate("document.readyState === 'complete' && !!document.querySelector('.doc-tab.is-active') && !!window.paper?.project")) break; } catch {}
    await wait(100);
  }
  await wait(300);
  await evaluate(`window.modcut.setE2EImportResult(${JSON.stringify(artwork)})`);
  await evaluate("document.querySelector('#import').click()");
  await wait(600);
  const setOp = (key, op) => evaluate(`(() => { const select=document.querySelector('.clayer[data-layer-key="${key}"] .clayer__op'); select.value='${op}'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await setOp("vector:#ff0000", "Cut");
  await setOp("vector:#0000ff", "Score");
  await setOp("vector:#000000", "Engrave");
  const cutZ = await evaluate(`+document.querySelector('.clayer[data-layer-key="vector:#ff0000"] [data-k=zOffset]').value`);
  assert.notEqual(cutZ, 0, "the default material gives Cut layers a focus offset");

  // Simulation never blocks on focus: Z does not change the XY path it shows.
  await evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove()); document.querySelector('#simulate').click()");
  await wait(800);
  assert.equal(await evaluate("document.querySelectorAll('.toast--err').length"), 0, await evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')"));
  assert.equal(await evaluate("document.querySelector('#simbar').classList.contains('hidden')"), false, "simulation must start on the Dummy machine despite focus offsets");
  await evaluate("document.querySelector('#simClose').click()");

  // Process preview: off by default, toggled from the toolbar, remembered.
  assert.equal(await evaluate("document.querySelector('#processPreview').checked"), false);
  assert.equal(await evaluate("document.querySelector('#previewLegend').classList.contains('hidden')"), true);
  await evaluate("document.querySelector('#processPreview').click()");
  await wait(200);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('modcut_preferences')).processPreview"), true, "the preview switch is remembered");
  assert.equal(await evaluate("document.querySelector('#previewLegend').classList.contains('hidden')"), false, "the legend explains the preview colours");
  await evaluate("paper.view.update()");
  if (screenshot) {
    const shot = await client.command("Page.captureScreenshot", { format: "png" });
    await writeFile(screenshot, Buffer.from(shot.data, "base64"));
  }
  // The real artwork keeps its colours; only the drawing is projected.
  assert.deepEqual(await evaluate("paper.project.layers[1].getItems({recursive:true,match:i=>i.className==='Path'}).map(i=>[i.strokeColor?.toCSS(true)??null,i.fillColor?.toCSS(true)??null,i.strokeScaling])"),
    [["#ff0000", null, true], ["#0000ff", null, true], [null, "#000000", true]]);
  // Screen pixels at each shape's outline show the preview colours.
  const pixel = (expr) => evaluate(`(() => { const p=paper.view.projectToView(${expr}),c=document.querySelector('.bed-canvas'),r=window.devicePixelRatio||1,d=c.getContext('2d').getImageData(Math.round(p.x*r),Math.round(p.y*r),1,1).data; return [d[0],d[1],d[2]]; })()`);
  const items = "paper.project.layers[1].getItems({recursive:true,match:i=>i.className==='Path'})";
  const cutPixel = await pixel(`${items}[0].bounds.leftCenter`);
  const enPixel = await pixel(`${items}[2].bounds.center`);
  assert.ok(cutPixel[0] > 180 && cutPixel[1] < 90, `cut lines are red, got ${cutPixel}`);
  assert.ok(Math.abs(enPixel[0] - 0x4d) < 12 && Math.abs(enPixel[2] - 0x4d) < 12, `engraving is gray, got ${enPixel}`);

  // A layer switched to Ignore disappears from the preview.
  await setOp("vector:#000000", "Ignore");
  await evaluate("paper.view.update()");
  const ignored = await pixel(`${items}[2].bounds.center`);
  assert.ok(Math.abs(ignored[0] - 0x4d) > 20 || Math.abs(ignored[1] - 0x4d) > 20, `ignored artwork is not shown as engraved, got ${ignored}`);
  await evaluate("document.querySelector('#processPreview').click()");
  assert.equal(await evaluate("document.querySelector('#previewLegend').classList.contains('hidden')"), true);
}
