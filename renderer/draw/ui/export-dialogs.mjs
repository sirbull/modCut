/**
 * Export dialogs: per-format options for Export As, and Save PDF with presets and sections in the
 * manner of Illustrator's Adobe PDF dialog (General, Compression, Marks and Bleeds, Summary).
 */
import { enhanceNumberFields } from './number-field.mjs';
import { PDF_COMPATIBILITY, PDF_PRESETS, JPEG_QUALITY } from '../io/pdf.mjs';
import { exportTarget, parseRange } from '../io/export-plan.mjs';
import { EXPORT_RESOLUTIONS } from '../io/export.mjs';

let dialogId = 0;
const make = (tag, className, parent, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; parent?.append(el); return el; };
const option = (select, value, label) => { const o = new Option(label, value); select.append(o); return o; };
/** Labelled control: label text above (or beside, for checkboxes) the control. */
function control(parent, label, el, { inline = false, className = '' } = {}) {
  const wrap = make('label', `field draw-export-field${inline ? ' draw-export-field--inline' : ''} ${className}`.trim(), parent);
  const text = make('span', '', null, label);
  if (inline) wrap.append(el, text); else wrap.append(text, el);
  return wrap;
}
const checkbox = (parent, label, checked, name) => { const input = make('input'); input.type = 'checkbox'; input.checked = !!checked; input.name = name; control(parent, label, input, { inline: true }); return input; };
const select = (parent, label, entries, value, name) => {
  const el = make('select', 'select'); el.name = name;
  for (const [v, l] of entries) option(el, v, l);
  el.value = String(value); control(parent, label, el); return el;
};
const number = (parent, label, value, name, { min = 0, max, step = 'any', unit = '' } = {}) => {
  const el = make('input', 'input'); el.type = 'number'; el.name = name; el.value = String(value); el.min = String(min); if (max != null) el.max = String(max); el.step = String(step);
  const wrap = control(parent, label, el); if (unit) make('span', 'draw-export-unit', wrap, unit); return el;
};

/** Modal frame shared by the export dialogs; resolves with `read()` on submit, null on cancel. */
function frame({ title, className, submitLabel }) {
  const previous = document.activeElement, overlay = make('div', 'modal-overlay'), modal = make('div', `modal panel draw-export-dialog ${className}`, overlay);
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
  const header = make('div', 'panel__header', modal, title); header.id = `draw-export-${++dialogId}`; modal.setAttribute('aria-labelledby', header.id);
  const form = make('form', 'draw-export-form', make('div', 'panel__body', modal)); form.noValidate = true;
  const body = make('div', 'draw-export-body', form), error = make('p', 'draw-export-error', form); error.setAttribute('role', 'alert');
  const actions = make('div', 'modal-actions', form);
  const cancel = make('button', 'btn btn--ghost btn--sm', actions, 'Cancel'); cancel.type = 'button'; cancel.dataset.x = 'cancel';
  const submit = make('button', 'btn btn--primary btn--sm', actions, submitLabel); submit.type = 'submit';
  return { overlay, modal, form, body, error, actions, submit, open(read) {
    enhanceNumberFields(modal); document.body.append(overlay);
    return new Promise((resolve) => {
      const close = (value) => { overlay.remove(); if (previous?.isConnected) previous.focus(); resolve(value); };
      modal.addEventListener('keydown', (event) => {
        if (event.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(null); }
        if (event.key === 'Tab') {
          const items = [...modal.querySelectorAll('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)')].filter((el) => el.getClientRects().length);
          if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
          else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
        }
      });
      cancel.addEventListener('click', () => close(null));
      form.addEventListener('submit', (event) => { event.preventDefault(); try { close(read()); } catch (problem) { error.textContent = problem.message; } });
      setTimeout(() => modal.querySelector('select, input, button[type=submit]')?.focus());
    });
  } };
}
/** All / Range of artboards, as in Illustrator's Use Artboards. */
function rangeControls(parent, boards, { range = 'all', rangeText = '' } = {}) {
  const group = make('fieldset', 'draw-export-range', parent); make('legend', '', group, 'Artboards');
  const radios = {};
  for (const [value, label] of [['all', 'All'], ['range', 'Range:']]) {
    const input = make('input'); input.type = 'radio'; input.name = 'range'; input.value = value; input.checked = value === range; radios[value] = input;
    control(group, label, input, { inline: true });
  }
  const text = make('input', 'input draw-export-range__text', group); text.name = 'rangeText'; text.value = rangeText || (boards.length > 1 ? `1-${boards.length}` : '1');
  text.setAttribute('aria-label', 'Artboard range');
  const sync = () => { text.disabled = !radios.range.checked; };
  for (const r of Object.values(radios)) r.addEventListener('change', sync);
  text.addEventListener('focus', () => { radios.range.checked = true; sync(); });
  sync();
  return () => ({ range: radios.range.checked ? 'range' : 'all', rangeText: text.value, indices: radios.range.checked ? parseRange(text.value, boards.length) : boards.map((_, i) => i) });
}

/** Options for every Export As format except PDF. */
export function exportOptionsDialog({ format, boards, defaults = {} }) {
  const target = exportTarget(format), ui = frame({ title: `${target.label} Options`, className: 'draw-export-options', submitLabel: 'Export' });
  const readRange = rangeControls(ui.body, boards, defaults);
  const fields = {};
  if (format === 'png' || format === 'jpg' || format === 'webp' || format === 'tif') {
    fields.ppi = select(ui.body, 'Resolution', [...EXPORT_RESOLUTIONS.map((r) => [String(r), `${r} ppi${r === 72 ? ' (Screen)' : r === 150 ? ' (Medium)' : r === 300 ? ' (High)' : ''}`])], defaults.ppi ?? 150, 'ppi');
    // JPEG has no transparency; PNG and WebP keep it.
    fields.background = select(ui.body, 'Background', [...(format !== 'jpg' ? [['transparent', 'Transparent']] : []), ['white', 'White'], ['artboard', 'Artboard color']],
      format === 'jpg' && (defaults.background ?? 'white') === 'transparent' ? 'white' : defaults.background ?? (format !== 'jpg' ? 'transparent' : 'white'), 'background');
    if (format === 'tif') fields.compression = select(ui.body, 'Compression', [['packbits', 'PackBits (lossless)'], ['none', 'None']], defaults.compression ?? 'packbits', 'compression');
    if (format === 'jpg' || format === 'webp') fields.quality = number(ui.body, 'Quality (0–10)', defaults.quality ?? 8, 'quality', { min: 0, max: 10, step: 1 });
  }
  if (format === 'svg' || format === 'svgz') fields.precision = select(ui.body, 'Decimal places', [1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), String(n)]), defaults.precision ?? 4, 'precision');
  if (format === 'dxf') {
    fields.tolerance = select(ui.body, 'Curve accuracy', [['0.001', '0.001 mm (finest)'], ['0.01', '0.01 mm'], ['0.05', '0.05 mm'], ['0.1', '0.1 mm (smallest file)']], defaults.tolerance ?? 0.01, 'tolerance');
    make('p', 'draw-export-note', ui.body, 'Curves become polylines in millimetres; each layer becomes a DXF layer. Images are not part of DXF.');
  }
  if (format === 'ai') make('p', 'draw-export-note', ui.body, 'Saved as a PDF compatible Illustrator file: every artboard is a page and each layer stays a layer. Illustrator opens live effects and text as expanded artwork; modCut opens the file with everything still editable.');
  if (format === 'eps') make('p', 'draw-export-note', ui.body, 'EPS has no transparency: opacity and blending are ignored and images are placed on white.');
  if (boards.length > 1 && !target.multipage) make('p', 'draw-export-note', ui.body, 'Each artboard is saved as its own file, named after the artboard.');
  return ui.open(() => {
    const range = readRange(), values = { ...range };
    if (fields.ppi) values.ppi = Number(fields.ppi.value);
    if (fields.background) values.background = fields.background.value;
    if (fields.quality) { const q = Number(fields.quality.value); if (!(q >= 0 && q <= 10)) throw new Error('Use a JPEG quality from 0 to 10.'); values.quality = q; }
    if (fields.compression) values.compression = fields.compression.value;
    if (fields.precision) values.precision = Number(fields.precision.value);
    if (fields.tolerance) values.tolerance = Number(fields.tolerance.value);
    return values;
  });
}

const PDF_PRESETS_KEY = 'modcut.draw.pdfPresets';
export function loadPdfPresets(storage = globalThis.localStorage) {
  try { const list = JSON.parse(storage?.getItem(PDF_PRESETS_KEY) ?? '[]'); return Array.isArray(list) ? list.filter((p) => p?.id && p.name && p.options) : []; } catch { return []; }
}
function storePdfPresets(list, storage = globalThis.localStorage) { try { storage?.setItem(PDF_PRESETS_KEY, JSON.stringify(list)); return true; } catch { return false; } }

/** The settings that define a preset, in a fixed shape, so a preset and the dialog compare equal. */
export function normalizePdfOptions(o) {
  return { version: o.version, preserveEditing: !!o.preserveEditing, thumbnails: !!o.thumbnails, viewAfter: !!o.viewAfter, layers: !!o.layers,
    downsample: o.downsample, ppi: Number(o.ppi), above: Number(o.above), imageCompression: o.imageCompression, jpegQuality: o.jpegQuality, compressArt: !!o.compressArt,
    marks: { trim: !!o.marks?.trim, registration: !!o.marks?.registration, pageInfo: !!o.marks?.pageInfo, weight: Number(o.marks?.weight ?? 0.25), offset: Number(o.marks?.offset ?? 2.117) },
    bleed: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, Number(o.bleed?.[side] ?? 0)])) };
}
/** Plain sentences describing PDF options, for the Summary section and tests. */
export function pdfSummary(o, boards) {
  const lines = [], warnings = [];
  lines.push(`Compatibility: ${PDF_COMPATIBILITY.find((c) => c.id === o.version)?.label ?? o.version}`);
  lines.push(`Pages: ${o.range === 'range' ? `artboards ${o.rangeText}` : `all ${boards.length} artboard${boards.length === 1 ? '' : 's'}`}`);
  lines.push(`Editing data: ${o.preserveEditing ? 'kept — modCut opens the PDF as an editable Draw document' : 'not kept'}`);
  lines.push(`Layers: ${o.layers ? 'top-level layers become PDF layers' : 'flattened'}`);
  lines.push(`Images: ${o.downsample === 'none' ? 'not downsampled' : `${o.downsample === 'average' ? 'average' : 'bicubic'} downsampling to ${o.ppi} ppi above ${o.above} ppi`}, ${o.imageCompression === 'jpeg' ? `JPEG (${o.jpegQuality})` : 'ZIP'} compression`);
  const marks = ['trim', 'registration', 'pageInfo'].filter((k) => o.marks?.[k]).map((k) => ({ trim: 'trim marks', registration: 'registration marks', pageInfo: 'page information' })[k]);
  lines.push(`Marks: ${marks.length ? marks.join(', ') : 'none'}`);
  const b = o.bleed ?? {}; lines.push(`Bleed: ${['top', 'bottom', 'left', 'right'].some((k) => b[k] > 0) ? `${b.top ?? 0} / ${b.bottom ?? 0} / ${b.left ?? 0} / ${b.right ?? 0} mm` : 'none'}`);
  if (o.layers && Number(o.version) < 1.5) warnings.push('PDF layers need Acrobat 6 (PDF 1.5) or later; layers will be flattened.');
  if (o.downsample !== 'none' && !(o.above >= o.ppi)) warnings.push('Images are downsampled only when above the threshold; it should be at least the target resolution.');
  if (o.preserveEditing) warnings.push('Keeping editing data makes the file larger, and it can contain artwork outside the artboards.');
  return { lines, warnings };
}

/** Save PDF: preset, compatibility and sections. Resolves with the options, or null. */
export function pdfOptionsDialog({ boards, defaults = null, storage = globalThis.localStorage }) {
  const ui = frame({ title: 'Save PDF', className: 'draw-pdf-dialog', submitLabel: 'Save PDF' });
  let custom = loadPdfPresets(storage);
  const all = () => [...PDF_PRESETS, ...custom];
  const start = defaults ?? { preset: 'default', ...PDF_PRESETS[0].options, range: 'all', rangeText: '' };
  const top = make('div', 'draw-pdf-top', ui.body);
  const presetSelect = make('select', 'select'); presetSelect.name = 'preset';
  control(top, 'PDF Preset', presetSelect, { className: 'draw-pdf-preset' });
  const savePreset = make('button', 'btn btn--ghost btn--sm draw-pdf-save-preset', top, 'Save Preset…'); savePreset.type = 'button';
  const versionSelect = make('select', 'select'); versionSelect.name = 'version';
  for (const c of PDF_COMPATIBILITY) option(versionSelect, c.id, c.label);
  versionSelect.value = start.version;
  control(top, 'Compatibility', versionSelect);
  const presetName = make('div', 'draw-pdf-preset-name', top); presetName.hidden = true;
  const nameInput = make('input', 'input', presetName); nameInput.placeholder = 'Preset name'; nameInput.setAttribute('aria-label', 'Preset name');
  const nameOk = make('button', 'btn btn--secondary btn--sm', presetName, 'Save'); nameOk.type = 'button';

  const split = make('div', 'draw-pdf-split', ui.body), nav = make('div', 'draw-pdf-nav', split), pages = make('div', 'draw-pdf-pages', split);
  nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-orientation', 'vertical'); nav.setAttribute('aria-label', 'PDF settings');
  const sections = {};
  for (const [id, label] of [['general', 'General'], ['compression', 'Compression'], ['marks', 'Marks and Bleeds'], ['summary', 'Summary']]) {
    const tab = make('button', 'draw-pdf-tab', nav, label); tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.dataset.section = id;
    const page = make('section', 'draw-pdf-page', pages); page.setAttribute('role', 'tabpanel'); make('h3', 'draw-pdf-heading', page, label);
    tab.id = `${ui.modal.querySelector('.panel__header').id}-${id}`; page.setAttribute('aria-labelledby', tab.id);
    sections[id] = { tab, page };
  }
  const show = (id) => { for (const [key, { tab, page }] of Object.entries(sections)) { tab.setAttribute('aria-selected', String(key === id)); tab.tabIndex = key === id ? 0 : -1; page.hidden = key !== id; } if (id === 'summary') renderSummary(); };
  nav.addEventListener('click', (event) => { const id = event.target.closest('[data-section]')?.dataset.section; if (id) show(id); });
  nav.addEventListener('keydown', (event) => {
    const ids = Object.keys(sections), at = ids.indexOf(document.activeElement?.dataset.section), step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step && at >= 0) { event.preventDefault(); const id = ids[(at + step + ids.length) % ids.length]; show(id); sections[id].tab.focus(); }
  });

  // General
  const g = sections.general.page;
  const description = make('textarea', 'input draw-pdf-description'); description.readOnly = true; description.rows = 4; control(g, 'Description', description);
  const readRange = rangeControls(g, boards, start);
  const optionsBox = make('fieldset', 'draw-pdf-options', g); make('legend', '', optionsBox, 'Options');
  const el = {
    preserveEditing: checkbox(optionsBox, 'Preserve modCut editing capabilities', start.preserveEditing, 'preserveEditing'),
    thumbnails: checkbox(optionsBox, 'Embed page thumbnails', start.thumbnails, 'thumbnails'),
    viewAfter: checkbox(optionsBox, 'View PDF after saving', start.viewAfter, 'viewAfter'),
    layers: checkbox(optionsBox, 'Create PDF layers from top-level layers', start.layers, 'layers'),
  };
  // Compression
  const c = sections.compression.page, images = make('fieldset', 'draw-pdf-group', c); make('legend', '', images, 'Bitmap images');
  const sampleRow = make('div', 'draw-pdf-row', images);
  el.downsample = select(sampleRow, 'Downsampling', [['none', 'Do Not Downsample'], ['average', 'Average Downsampling To'], ['bicubic', 'Bicubic Downsampling To']], start.downsample, 'downsample');
  el.ppi = number(sampleRow, 'Resolution', start.ppi, 'ppi', { min: 9, max: 2400, step: 1, unit: 'ppi' });
  el.above = number(sampleRow, 'For images above', start.above, 'above', { min: 9, max: 4800, step: 1, unit: 'ppi' });
  const compressRow = make('div', 'draw-pdf-row', images);
  el.imageCompression = select(compressRow, 'Compression', [['zip', 'ZIP'], ['jpeg', 'JPEG']], start.imageCompression, 'imageCompression');
  el.jpegQuality = select(compressRow, 'Image quality', Object.keys(JPEG_QUALITY).map((k) => [k, k[0].toUpperCase() + k.slice(1)]), start.jpegQuality, 'jpegQuality');
  el.compressArt = checkbox(c, 'Compress text and line art', start.compressArt, 'compressArt');
  // Marks and Bleeds
  const mk = sections.marks.page, marksBox = make('fieldset', 'draw-pdf-group', mk); make('legend', '', marksBox, 'Marks');
  const marksGrid = make('div', 'draw-pdf-marks', marksBox), markChecks = make('div', '', marksGrid), markValues = make('div', '', marksGrid);
  el.allMarks = checkbox(markChecks, 'All printer’s marks', false, 'allMarks');
  el.trim = checkbox(markChecks, 'Trim marks', start.marks?.trim, 'trim');
  el.registration = checkbox(markChecks, 'Registration marks', start.marks?.registration, 'registration');
  el.pageInfo = checkbox(markChecks, 'Page information', start.marks?.pageInfo, 'pageInfo');
  el.weight = select(markValues, 'Trim mark weight', [['0.125', '0.125 pt'], ['0.25', '0.25 pt'], ['0.5', '0.50 pt']], start.marks?.weight ?? 0.25, 'weight');
  el.offset = number(markValues, 'Offset', start.marks?.offset ?? 2.117, 'offset', { min: 0, max: 72, unit: 'mm' });
  const bleedBox = make('fieldset', 'draw-pdf-group', mk); make('legend', '', bleedBox, 'Bleeds');
  const bleedGrid = make('div', 'draw-pdf-bleed', bleedBox), bleed = start.bleed ?? {};
  for (const side of ['top', 'bottom', 'left', 'right']) el[`bleed-${side}`] = number(bleedGrid, side[0].toUpperCase() + side.slice(1), bleed[side] ?? 0, `bleed-${side}`, { min: 0, max: 72, unit: 'mm' });
  const link = make('button', 'btn btn--ghost btn--sm draw-pdf-link', bleedBox, 'Same bleed on all sides'); link.type = 'button';
  link.setAttribute('aria-pressed', String(new Set(['top', 'bottom', 'left', 'right'].map((s) => bleed[s] ?? 0)).size === 1));
  // Summary
  const summary = make('div', 'draw-pdf-summary', sections.summary.page);

  const read = () => {
    const range = readRange(), num = (input, label, min, max) => { const v = Number(input.value); if (!(v >= min && v <= max)) throw new Error(`${label} must be between ${min} and ${max}.`); return v; };
    return { preset: presetSelect.value, version: versionSelect.value, ...range,
      preserveEditing: el.preserveEditing.checked, thumbnails: el.thumbnails.checked, viewAfter: el.viewAfter.checked, layers: el.layers.checked,
      downsample: el.downsample.value, ppi: num(el.ppi, 'Resolution', 9, 2400), above: num(el.above, 'The downsampling threshold', 9, 4800),
      imageCompression: el.imageCompression.value, jpegQuality: el.jpegQuality.value, compressArt: el.compressArt.checked,
      marks: { trim: el.trim.checked, registration: el.registration.checked, pageInfo: el.pageInfo.checked, weight: Number(el.weight.value), offset: num(el.offset, 'Offset', 0, 72) },
      bleed: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((s) => [s, num(el[`bleed-${s}`], 'Bleed', 0, 72)])) };
  };
  const settings = (values) => JSON.stringify(normalizePdfOptions(values));
  let applying = false;
  function apply(preset) {
    applying = true;
    const o = preset.options; versionSelect.value = o.version;
    for (const key of ['preserveEditing', 'thumbnails', 'viewAfter', 'layers', 'compressArt']) el[key].checked = !!o[key];
    for (const key of ['downsample', 'imageCompression', 'jpegQuality']) el[key].value = o[key];
    el.ppi.value = String(o.ppi); el.above.value = String(o.above);
    for (const key of ['trim', 'registration', 'pageInfo']) el[key].checked = !!o.marks?.[key];
    el.weight.value = String(o.marks?.weight ?? 0.25); el.offset.value = String(o.marks?.offset ?? 2.117);
    for (const side of ['top', 'bottom', 'left', 'right']) el[`bleed-${side}`].value = String(o.bleed?.[side] ?? 0);
    applying = false; sync();
  }
  function fillPresets(selected) {
    presetSelect.replaceChildren();
    for (const p of PDF_PRESETS) option(presetSelect, p.id, p.name);
    for (const p of custom) option(presetSelect, p.id, p.name);
    presetSelect.value = selected;
  }
  function sync() {
    el.ppi.disabled = el.above.disabled = el.downsample.value === 'none';
    el.jpegQuality.disabled = el.imageCompression.value !== 'jpeg';
    el.layers.disabled = Number(versionSelect.value) < 1.5;
    el.allMarks.checked = el.trim.checked && el.registration.checked && el.pageInfo.checked;
    el.weight.disabled = !el.trim.checked;
    if (applying) return;
    // A changed setting marks the preset as modified, as Illustrator does.
    const preset = all().find((p) => p.id === presetSelect.value.replace(/:modified$/, ''));
    let values; try { values = read(); } catch { return; }
    const modified = preset && settings(preset.options) !== settings(values);
    const base = preset?.id ?? 'default';
    [...presetSelect.options].filter((o) => o.value.endsWith(':modified')).forEach((o) => o.remove());
    if (modified) { option(presetSelect, `${base}:modified`, `${preset.name} (Modified)`); presetSelect.value = `${base}:modified`; }
    else presetSelect.value = base;
    description.value = preset?.description ?? 'Custom settings.';
  }
  function renderSummary() {
    let values; try { values = read(); } catch (problem) { summary.replaceChildren(make('p', 'draw-export-error', null, problem.message)); return; }
    const { lines, warnings } = pdfSummary(values, boards);
    const list = make('ul', 'draw-pdf-summary__list'); for (const line of lines) make('li', '', list, line);
    const notes = make('ul', 'draw-pdf-summary__warnings'); for (const w of warnings) make('li', '', notes, w);
    summary.replaceChildren(list, ...(warnings.length ? [make('h4', '', null, 'Warnings'), notes] : []));
  }
  presetSelect.addEventListener('change', () => { const p = all().find((x) => x.id === presetSelect.value.replace(/:modified$/, '')); if (p) { apply(p); presetSelect.value = p.id; description.value = p.description ?? ''; } });
  el.allMarks.addEventListener('change', () => { for (const key of ['trim', 'registration', 'pageInfo']) el[key].checked = el.allMarks.checked; sync(); });
  link.addEventListener('click', () => { const on = link.getAttribute('aria-pressed') !== 'true'; link.setAttribute('aria-pressed', String(on)); if (on) for (const side of ['bottom', 'left', 'right']) el[`bleed-${side}`].value = el['bleed-top'].value; sync(); });
  ui.form.addEventListener('input', (event) => {
    if (link.getAttribute('aria-pressed') === 'true' && event.target.name?.startsWith('bleed-')) for (const side of ['top', 'bottom', 'left', 'right']) el[`bleed-${side}`].value = event.target.value;
    if (event.target !== nameInput && event.target !== presetSelect) sync();
  });
  ui.form.addEventListener('change', (event) => { if (event.target !== presetSelect && event.target !== nameInput) sync(); });
  savePreset.addEventListener('click', () => { presetName.hidden = false; nameInput.value = ''; nameInput.focus(); });
  const storePreset = () => {
    const name = nameInput.value.trim(); if (!name) { ui.error.textContent = 'Name the preset.'; return; }
    let values; try { values = read(); } catch (problem) { ui.error.textContent = problem.message; return; }
    const { preset, range, rangeText, indices, ...options } = values, id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    custom = [...custom.filter((p) => p.id !== id), { id, name, description: 'Saved settings.', options }];
    if (!storePdfPresets(custom, storage)) { ui.error.textContent = 'Could not save the preset.'; return; }
    fillPresets(id); presetName.hidden = true; ui.error.textContent = ''; sync();
  };
  nameOk.addEventListener('click', storePreset);
  nameInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); storePreset(); } });

  fillPresets(all().some((p) => p.id === start.preset) ? start.preset : 'default');
  if (!defaults) apply(all().find((p) => p.id === presetSelect.value)); else sync();
  show('general');
  return ui.open(() => { const values = read(); return { ...values, preset: values.preset.replace(/:modified$/, '') }; });
}

// Building blocks shared with the Export for Screens dialog.
export { frame, make, option, control, checkbox };
