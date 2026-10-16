import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connectToPage, inputHelpers, wait } from "./cdp.mjs";
import { enterDraw } from "./draw-test-helpers.mjs";

export async function runThemeWorkflows(client, port) {
  const theme = () => client.evaluate("document.documentElement.dataset.theme");
  const emulate = async (value) => {
    await client.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });
    // Media-query notifications arrive asynchronously, especially after native theme changes.
    for (let attempt = 0; attempt < 20; attempt++) {
      const expected = await client.evaluate("window.modcutTheme.preference");
      if (await theme() === (expected === "system" ? value : expected)) break;
      await wait(50);
    }
  };
  const preferences = async () => {
    await client.evaluate("document.getElementById('settings').click()");
    await wait(100);
    assert.equal(await client.evaluate("!!document.querySelector('[name=theme]')"), true);
  };
  const save = () => client.evaluate("document.querySelector('.modal form').requestSubmit()");
  const snapshot = async (name, page = client) => {
    const { data } = await page.command("Page.captureScreenshot", { format: "png" });
    await writeFile(`/tmp/modcut-${name}.png`, Buffer.from(data, "base64"));
  };

  for (let attempt = 0; attempt < 100; attempt++) {
    if (await client.evaluate("!!document.querySelector('.doc-tab.is-active')")) break;
    await wait(100);
  }
  assert.equal(await client.evaluate("window.modcutTheme.preference"), "system");
  await emulate("dark");
  assert.equal(await theme(), "dark");
  await snapshot("dark");
  await emulate("light");
  assert.equal(await theme(), "light");
  await snapshot("light");

  await preferences();
  assert.equal(await client.evaluate("document.querySelector('[name=theme]:checked').value"), "system");
  assert.equal(await client.evaluate("document.querySelectorAll('.field-segments input[type=radio]').length"), 3);
  assert.equal(await client.evaluate("document.querySelectorAll('.field-segments svg').length"), 3);
  assert.equal(await client.evaluate("document.querySelectorAll('.preferences-modal .field__description').length"), 9);
  await snapshot("light-preferences");
  await inputHelpers(client).key("ArrowRight");
  assert.equal(await client.evaluate("document.querySelector('[name=theme]:checked').value"), "light", "arrow keys navigate the three appearance options");
  assert.equal(await client.evaluate("window.modcutTheme.preference"), "light");
  assert.equal(await theme(), "light", "keyboard selection applies before Save");
  await save();
  await preferences();
  await client.evaluate("document.querySelector('[name=theme][value=dark]').click()");
  assert.equal(await theme(), "dark", "clicking Dark applies while Preferences remains open");
  assert.equal(await client.evaluate("localStorage.getItem('modcut_theme')"), "dark", "appearance saves immediately");
  await save();
  assert.equal(await theme(), "dark");
  await emulate("light");
  assert.equal(await theme(), "dark", "manual appearance overrides system changes");
  await preferences();
  await snapshot("dark-preferences");
  await client.evaluate("document.querySelector('[name=theme][value=light]').click(); document.querySelector('[data-x=cancel]').click()");
  assert.equal(await theme(), "light", "closing Preferences keeps the immediately applied appearance");
  await preferences();
  await client.evaluate("document.querySelector('[name=theme][value=dark]').click(); document.querySelector('[data-x=cancel]').click()");

  await client.command("Page.reload");
  await wait(800);
  assert.equal(await theme(), "dark", "saved theme survives reload");
  await client.evaluate(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    canvas.getContext('2d').fillRect(0,0,16,16);
    void window.modcut.openImageEditor({ dataUrl: canvas.toDataURL(), widthMm: 10, heightMm: 10, dpi: 300 });
  })()`);
  const editor = await connectToPage(port, "Advanced Editing for Engraving · modCut");
  try {
    assert.equal(await editor.evaluate("document.documentElement.dataset.theme"), "dark");
    assert.equal(await editor.evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(7, 20, 17)");
    await wait(300);
    await snapshot("dark-editor", editor);
    await client.evaluate("window.modcutTheme.setPreference('light')");
    await wait(150);
    assert.equal(await editor.evaluate("document.documentElement.dataset.theme"), "light", "open editor follows changes from the main window");
    await editor.evaluate("void window.modcut.finishImageEditor(null)");
  } finally { editor.socket.close(); }
  await preferences();
  await client.evaluate("document.querySelector('[name=theme][value=system]').click()");
  assert.equal(await client.evaluate("window.modcutTheme.preference"), "system", "System applies before Save");
  await save();
  assert.equal(await client.evaluate("window.modcutTheme.preference"), "system");
  await emulate("dark");
  assert.equal(await theme(), "dark", "system following can be restored");
  await client.evaluate("localStorage.setItem('modcut_theme','invalid')");
  await client.command("Page.reload");
  await wait(800);
  assert.equal(await client.evaluate("window.modcutTheme.preference"), "system", "invalid saved preferences fall back to system");
  const artwork = await client.evaluate(`(() => {
    paper.project.layers[1].activate();
    const path = new paper.Path.Rectangle(new paper.Rectangle(10, 10, 40, 30));
    path.strokeColor = 'black';
    return paper.project.layers[1].exportJSON({asString:true});
  })()`);
  await emulate("light");
  await emulate("dark");
  assert.equal(await client.evaluate("paper.project.layers[1].exportJSON({asString:true})"), artwork, "theme redraws preserve artwork and output colours");
  await enterDraw(client.evaluate);
  await wait(100);
  assert.equal(await client.evaluate("getComputedStyle(document.getElementById('drawWorkspace')).backgroundColor"), "rgb(20, 53, 47)");
  await snapshot("dark-draw");
  await preferences();
  assert.equal(await theme(), "dark", "Settings also works in Draw");
  await client.evaluate("document.querySelector('[data-x=cancel]').click()");
  await client.evaluate("document.getElementById('workspaceToggle').click()");
  await preferences();
  await client.evaluate("document.querySelector('[name=showGrid]').click()");
  assert.equal(await client.evaluate("paper.project.layers[0].children.length"), 1, "hiding the grid keeps the material plate");
  const zoomWithWheel = () => client.evaluate(`(() => {
    const before = paper.view.zoom;
    document.querySelector('.bed-canvas').dispatchEvent(new WheelEvent('wheel', {deltaY:-10,ctrlKey:true,bubbles:true,cancelable:true}));
    return paper.view.zoom / before;
  })()`);
  assert.ok(await zoomWithWheel() > 1, "normal wheel zoom direction");
  await client.evaluate("document.querySelector('[name=invertZoom]').click()");
  assert.ok(await zoomWithWheel() < 1, "reversed wheel zoom direction");
  await client.evaluate("document.querySelector('[name=tooltips]').click()");
  assert.equal(await client.evaluate("document.querySelector('[name=tooltipDelay]').disabled"), true);
  await client.evaluate("document.getElementById('zoomFit').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))");
  await wait(450);
  assert.equal(await client.evaluate("!!document.getElementById('appTooltip')"), false, "disabled tooltips stay hidden");
  await client.evaluate(`(() => {
    document.querySelector('[name=tooltips]').click();
    const delay = document.querySelector('[name=tooltipDelay]');
    delay.value = '350'; delay.dispatchEvent(new Event('change',{bubbles:true}));
    delay.closest('.field').scrollIntoView({block:'center'});
  })()`);
  await snapshot("dark-preferences-help");
  await client.evaluate("document.querySelector('[data-x=cancel]').click(); document.getElementById('zoomFit').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))");
  await wait(450);
  assert.equal(await client.evaluate("!!document.getElementById('appTooltip')"), true, "custom tooltip delay takes effect");
  await client.command("Page.reload");
  await wait(800);
  assert.equal(await client.evaluate("paper.project.layers[0].children.length"), 1, "grid visibility persists through reload and recovery");
  await preferences();
  assert.equal(await client.evaluate("document.querySelector('[name=invertZoom]').checked"), true);
  assert.equal(await client.evaluate("document.querySelector('[name=tooltipDelay]').value"), "350");
  await client.evaluate("document.querySelector('[data-x=cancel]').click()");
  console.log("PASS theme E2E: system changes, three-way appearance control, cancel, reload, image editor and cross-window synchronization");
}
