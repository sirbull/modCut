import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, submitNewDrawDialog } from './draw-test-helpers.mjs';

/**
 * UI audit in a small window: clipped text in fields, menus, buttons and labels, cramped menus, and fields
 * side by side with different heights. Prints a JSON report and saves a screenshot per screen.
 * The window defaults to the app's minimum size. `--ui-audit-out=<dir>` chooses the screenshot folder,
 * `--ui-audit-size=1024x680` the window size, and `--ui-audit-strict` fails on any finding.
 */
export async function runUiAuditWorkflows(client, { out = join(tmpdir(), 'modcut-ui-audit'), strict = false, width = 900, height = 650 } = {}) {
  const { evaluate, command } = client;
  await mkdir(out, { recursive: true });
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await wait(300);
  const report = new Map();
  const shot = async name => { const { data } = await command('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, `${name}.png`), Buffer.from(data, 'base64')); };
  const audit = async (screen, selector) => {
    await wait(120);
    const found = await evaluate(`(${pageAudit})(${JSON.stringify(selector)})`);
    for (const issue of found) { const key = `${issue.kind} ${issue.el} ${issue.text ?? ''}`; if (!report.has(key)) report.set(key, { screen, ...issue }); }
    await shot(screen);
  };
  for (let i = 0; i < 100 && !await evaluate("!!document.querySelector('.doc-tab.is-active')"); i++) await wait(100);

  // Cut workspace and Preferences, page by page.
  await audit('cut', 'body');
  await evaluate("document.querySelector('#settings').click()");
  for (let i = 0; i < 50 && !await evaluate("!!document.querySelector('.preferences-modal .form-nav')"); i++) await wait(50);
  const sections = await evaluate("[...document.querySelectorAll('.preferences-modal .form-nav button, .preferences-modal .form-nav a')].map(b=>b.textContent.trim())");
  for (const [index, name] of sections.entries()) {
    await evaluate(`[...document.querySelectorAll('.preferences-modal .form-nav button, .preferences-modal .form-nav a')][${index}].click()`);
    await audit(`preferences-${index}-${name.replace(/\W+/g, '-').toLowerCase()}`, '.preferences-modal');
  }
  await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");

  // Draw: the New Document dialog, then a stroked, filled rectangle selected so Properties shows everything.
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  for (let i = 0; i < 50 && !await evaluate("!!document.querySelector('.modal-overlay form')"); i++) await wait(50);
  await audit('draw-new-document', '.modal-overlay');
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'UI audit' });
  await evaluate(`(async()=>{const w=${active},{createNode}=await import('./draw/doc/schema.mjs'),{insertNode}=await import('./draw/doc/commands.mjs'),{appearance}=await import('./draw/geometry.mjs');
    const b=w.state.document.data.artboards[0],L=w.state.document.data.layers[0].id;
    const n=createNode('path',{name:'A rectangle with a rather long name for the layers panel',subpaths:[{closed:true,segments:[[10,10],[60,10],[60,40],[10,40]].map(p=>({p:[b.x+p[0],b.y+p[1]],in:[0,0],out:[0,0]}))}],appearance:appearance('#FFFFFF','#071411',.5)});
    w.state.history.execute(insertNode(L,n));w.select([n.id]);})()`);
  await audit('draw-properties', '.draw-project[style*=block]');
  const panels = await evaluate("(async()=>(await import('./draw/panels/registry.mjs')).PANEL_DEFINITIONS.map(p=>p.id))()");
  for (const id of panels.filter(id => !['properties', 'layers', 'artboards'].includes(id))) {
    await evaluate(`(async()=>{${active}.handle('panel.${id}')})()`);
    await audit(`draw-panel-${id}`, '.draw-project[style*=block]');
    await evaluate("document.querySelectorAll('.draw-floating-panel').forEach(p=>p.querySelector('[aria-label^=Close]')?.click())");
  }
  await command('Emulation.clearDeviceMetricsOverride');

  const issues = [...report.values()];
  console.log(JSON.stringify(issues, null, 1));
  console.log(`UI audit: ${issues.length} finding(s) in a ${width}×${height} window; screenshots in ${out}`);
  if (strict && issues.length) throw new Error(`UI audit found ${issues.length} issue(s)`);
  return issues;
}

/** Runs in the page: what in `selector` does not fit or does not line up. */
function pageAudit(selector) {
  const ctx = document.createElement('canvas').getContext('2d'), issues = [];
  // Visually hidden labels (1px, for screen readers) are not shown text.
  const shown = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && !e.closest('[hidden], details:not([open]) > :not(summary)'); };
  const minContent = e => { const before = e.style.width; e.style.width = 'min-content'; const w = e.getBoundingClientRect().width; e.style.width = before; return Math.round(w); };
  const name = e => {
    const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const tag = e.dataset?.drawField ?? e.getAttribute('name') ?? e.getAttribute('aria-label');
    return `${e.parentElement?.className && typeof e.parentElement.className === 'string' ? e.parentElement.className.split(' ')[0] + ' > ' : ''}${e.tagName.toLowerCase()}${cls}${tag ? `[${tag}]` : ''}`;
  };
  // Lines of the element's own text, from where the browser laid out its glyph boxes.
  const lines = e => {
    const tops = new Set();
    for (const node of e.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top / 4));
    }
    return tops.size;
  };
  const textWidth = (text, style) => { ctx.font = style.font; return ctx.measureText(text).width; };
  const inner = (e, s) => e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  const control = e => e.matches('select, input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=hidden]), textarea');
  const page = document.scrollingElement;
  if (page.scrollWidth > page.clientWidth + 1) issues.push({ kind: 'page-scroll', el: 'document (horizontal)', text: `${page.scrollWidth}>${page.clientWidth}` });
  if (page.scrollHeight > page.clientHeight + 1) issues.push({ kind: 'page-scroll', el: 'document (vertical)', text: `${page.scrollHeight}>${page.clientHeight}` });
  // The canvas keeps most of a Draw window; a narrow one means a column went to the wrong track.
  for (const stage of document.querySelectorAll('.draw-project[style*=block] .draw-stage')) {
    const w = stage.getBoundingClientRect().width;
    if (w > 0 && w < innerWidth * .4) issues.push({ kind: 'canvas-narrow', el: 'draw-stage', text: `${Math.round(w)}px of ${innerWidth}` });
  }
  for (const root of document.querySelectorAll(selector)) {
    for (const e of root.querySelectorAll('*')) {
      if (!shown(e)) continue;
      const s = getComputedStyle(e);
      if (e.tagName === 'SELECT') {
        const text = e.selectedOptions[0]?.text ?? '', need = textWidth(text, s), have = inner(e, s) - 18;
        if (need > have + 1) issues.push({ kind: 'select-clipped', el: name(e), text, need: Math.ceil(need), have: Math.floor(have) });
        const room = e.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom), line = parseFloat(s.fontSize) * 1.15;
        if (room < line) issues.push({ kind: 'select-cramped', el: name(e), text, room, line: Math.ceil(line) });
      } else if (control(e) && e.tagName === 'INPUT' && (e.type === 'number' || !e.value)) {
        // A name typed by the user may scroll; numbers and placeholders must fit.
        const text = e.value || e.placeholder || '', need = textWidth(text, s), have = inner(e, s) - (e.type === 'number' && s.appearance !== 'textfield' ? 14 : 0);
        if (text && need > have + 1) issues.push({ kind: 'input-clipped', el: name(e), text, need: Math.ceil(need), have: Math.floor(have) });
      } else if (!control(e) && e.childElementCount === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && s.overflowX !== 'visible') {
        issues.push({ kind: s.textOverflow === 'ellipsis' ? 'text-ellipsis' : 'text-clipped', el: name(e), text: e.textContent.trim().slice(0, 60) });
      } else if (e.tagName === 'BUTTON' && e.scrollWidth > e.clientWidth + 1) {
        issues.push({ kind: 'button-clipped', el: name(e), text: e.textContent.trim().slice(0, 60) });
      }
      // A one-line control or label that wraps has run out of room.
      if (e.matches('button, .btn, label > span, .fn-label') && !e.querySelector('br') && lines(e) > 1)
        issues.push({ kind: 'text-wrapped', el: name(e), text: e.textContent.trim().slice(0, 60) });
      // Shown content past the window edge (the outermost such element only).
      const r = e.getBoundingClientRect();
      if (r.right > innerWidth + 1 && r.left < innerWidth && !(e.parentElement && e.parentElement.getBoundingClientRect().right > innerWidth + 1))
        issues.push({ kind: 'past-window', el: name(e), text: `${Math.round(r.right)}>${innerWidth}, min-content ${minContent(e)}` });
      // A panel or dialog body should not need sideways scrolling.
      if (['auto', 'scroll'].includes(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.clientHeight > 40)
        issues.push({ kind: 'horizontal-scroll', el: name(e), text: `${e.scrollWidth}>${e.clientWidth}` });
    }
    // Fields and menus that share a row should share a height.
    const rows = new Map();
    for (const e of root.querySelectorAll('select, input, button')) {
      if (!shown(e) || !(control(e) || e.matches('.draw-select, .select')) ) continue;
      const row = e.parentElement?.closest('div, label, fieldset'), r = e.getBoundingClientRect();
      const host = row?.parentElement ?? row; if (!host) continue;
      const list = rows.get(host) ?? []; list.push({ e, r }); rows.set(host, list);
    }
    for (const list of rows.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(a.r.top + a.r.height / 2 - (b.r.top + b.r.height / 2)) < 8 && Math.abs(a.r.height - b.r.height) > 1)
        issues.push({ kind: 'row-mismatch', el: `${name(a.e)} (${Math.round(a.r.height)}px) ~ ${name(b.e)} (${Math.round(b.r.height)}px)` });
    }
  }
  return issues;
}
