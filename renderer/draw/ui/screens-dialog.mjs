/**
 * Export for Screens, after Illustrator: artboard thumbnails to pick from, All or a range, a folder
 * with optional sub-folders, and rows of scale + suffix + format, each written for every artboard.
 */
import { frame, make, option, control, checkbox } from './export-dialogs.mjs';
import { parseRange, scalePpi, screensFilePath, SCREEN_SCALES } from '../io/export-plan.mjs';

/** Formats per row; JPEG rows carry their quality as in Illustrator. */
export const SCREEN_FORMATS = Object.freeze([
  { id: 'png', label: 'PNG', format: 'png' }, { id: 'jpg100', label: 'JPG 100', format: 'jpg', quality: 10 }, { id: 'jpg80', label: 'JPG 80', format: 'jpg', quality: 8 },
  { id: 'jpg50', label: 'JPG 50', format: 'jpg', quality: 5 }, { id: 'svg', label: 'SVG', format: 'svg' }, { id: 'pdf', label: 'PDF', format: 'pdf' }, { id: 'dxf', label: 'DXF', format: 'dxf' },
]);
const VECTOR = new Set(['svg', 'pdf', 'dxf']);
const SCREENS_KEY = 'modcut.draw.exportScreens';
let listId = 0;
// The main process trusts only folders chosen in its dialog during this run, so the folder is remembered per run.
let sessionFolder = '';

export function loadScreensSettings(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage?.getItem(SCREENS_KEY) ?? 'null'); return value && Array.isArray(value.rows) ? value : null; } catch { return null; }
}
/** "1-3, 5" for [0, 1, 2, 4]. */
export function compactRange(indices) {
  const parts = [], sorted = [...indices].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]; while (sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? `${start + 1}` : `${start + 1}-${sorted[i] + 1}`);
  }
  return parts.join(', ');
}

/**
 * `thumbnail(board)` returns an image URL; `chooseFolder(current)` resolves with a folder or null.
 * Resolves with {indices, folder, openAfter, subfolders: 'scale'|'format'|null, prefix, rows}, or null.
 */
export function exportScreensDialog({ boards, thumbnail, chooseFolder, storage = globalThis.localStorage }) {
  const saved = loadScreensSettings(storage) ?? {};
  const ui = frame({ title: 'Export for Screens', className: 'draw-screens-dialog', submitLabel: 'Export Artboard' });
  const split = make('div', 'draw-screens', ui.body), left = make('div', 'draw-screens__boards', split), right = make('div', 'draw-screens__settings', split);
  make('div', 'draw-screens__tab', left, 'Artboards');
  const grid = make('div', 'draw-screens__grid', left); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Artboards to export');
  const footer = make('div', 'draw-screens__footer', left), count = make('span', 'draw-screens__count', footer);
  const clear = make('button', 'btn btn--ghost btn--sm', footer, 'Clear Selection'); clear.type = 'button';
  const picks = boards.map((board, index) => {
    const card = make('label', 'draw-screens__card', grid), box = make('span', 'draw-screens__thumb', card), img = make('img', '', box); img.alt = '';
    box.style.aspectRatio = String(Math.min(2, Math.max(.5, board.width / board.height)));
    const check = make('input', 'draw-screens__check', card); check.type = 'checkbox'; check.checked = true; check.dataset.board = String(index);
    check.setAttribute('aria-label', `${index + 1} ${board.name}`);
    const caption = make('span', 'draw-screens__name', card); make('span', 'draw-screens__number', caption, String(index + 1)); caption.append(document.createTextNode(board.name));
    return { board, check, img };
  });
  // Thumbnails render a few at a time so a document with many artboards opens at once.
  let next = 0, alive = true;
  const renderSome = () => {
    if (!alive) return;
    for (const end = Math.min(picks.length, next + 6); next < end; next++) {
      try { picks[next].img.src = thumbnail(picks[next].board); } catch { /* An artboard that cannot render keeps an empty frame. */ }
    }
    if (next < picks.length) setTimeout(renderSome, 16);
  };
  setTimeout(renderSome);

  // Select: All or Range; ticking thumbnails switches to Range and writes it.
  const selectBox = make('fieldset', 'draw-pdf-group', right); make('legend', '', selectBox, 'Select');
  const selRow = make('div', 'draw-screens__inline', selectBox), radios = {};
  for (const [value, label] of [['all', 'All'], ['range', 'Range:']]) { const r = make('input'); r.type = 'radio'; r.name = 'select'; r.value = value; radios[value] = r; control(selRow, label, r, { inline: true }); }
  radios.all.checked = true;
  const range = make('input', 'input draw-export-range__text', selRow); range.name = 'range'; range.value = boards.length > 1 ? `1-${boards.length}` : '1';
  range.setAttribute('aria-label', 'Artboard range'); range.disabled = true;
  // Export to
  const target = make('fieldset', 'draw-pdf-group', right); make('legend', '', target, 'Export to');
  const folderRow = make('div', 'draw-screens__folder', target), folder = make('input', 'input', folderRow);
  folder.name = 'folder'; folder.readOnly = true; folder.placeholder = 'Choose a folder'; folder.value = sessionFolder; folder.setAttribute('aria-label', 'Export folder');
  const browse = make('button', 'btn btn--ghost btn--sm', folderRow, 'Choose…'); browse.type = 'button';
  const openAfter = checkbox(target, 'Open location after export', saved.openAfter ?? true, 'openAfter');
  const subRow = make('div', 'draw-screens__inline', target), subfolders = checkbox(subRow, 'Create sub-folders by', saved.subfolders !== null, 'subfolders');
  const byRow = make('div', 'draw-screens__inline', subRow), by = {};
  for (const [value, label] of [['scale', 'Scale'], ['format', 'Format']]) { const r = make('input'); r.type = 'radio'; r.name = 'subfolderBy'; r.value = value; by[value] = r; control(byRow, label, r, { inline: true }); }
  by[saved.subfolders === 'format' ? 'format' : 'scale'].checked = true;
  // Formats: one row per scale/format; each row is written for every chosen artboard.
  const formats = make('fieldset', 'draw-pdf-group', right); make('legend', '', formats, 'Formats');
  const table = make('div', 'draw-screens__rows', formats), head = make('div', 'draw-screens__row draw-screens__row--head', table);
  for (const h of ['Scale', 'Suffix', 'Format', '']) make('span', '', head, h);
  const scales = make('datalist', '', formats); scales.id = `draw-screens-scales-${++listId}`;
  for (const s of SCREEN_SCALES) option(scales, s, s);
  const rows = [];
  function addRow({ scale = '1x', suffix = '', format = 'png' } = {}) {
    const row = make('div', 'draw-screens__row', table);
    const scaleInput = make('input', 'input', row); scaleInput.value = scale; scaleInput.setAttribute('list', scales.id); scaleInput.setAttribute('aria-label', 'Scale'); scaleInput.dataset.k = 'scale';
    const suffixInput = make('input', 'input', row); suffixInput.value = suffix; suffixInput.placeholder = 'None'; suffixInput.setAttribute('aria-label', 'Suffix'); suffixInput.dataset.k = 'suffix';
    const formatSelect = make('select', 'select', row); for (const f of SCREEN_FORMATS) option(formatSelect, f.id, f.label);
    formatSelect.value = SCREEN_FORMATS.some((f) => f.id === format) ? format : 'png'; formatSelect.setAttribute('aria-label', 'Format'); formatSelect.dataset.k = 'format';
    const remove = make('button', 'btn btn--ghost btn--sm draw-screens__remove', row, '×'); remove.type = 'button'; remove.setAttribute('aria-label', 'Remove format');
    const entry = { row, scaleInput, suffixInput, formatSelect };
    // Vector formats have no scale: they are written at the artboard's size in millimetres.
    const sync = () => { const vector = VECTOR.has(formatSelect.value); scaleInput.disabled = vector; if (vector) scaleInput.value = '1x'; };
    formatSelect.addEventListener('change', () => { sync(); update(); });
    remove.addEventListener('click', () => { if (rows.length === 1) return; rows.splice(rows.indexOf(entry), 1); row.remove(); update(); });
    rows.push(entry); sync(); update();
  }
  const add = make('button', 'btn btn--ghost btn--sm draw-screens__add', formats, '+ Add Scale'); add.type = 'button';
  add.addEventListener('click', () => {
    const n = rows.length + 1, last = rows.at(-1)?.formatSelect.value ?? 'png';
    addRow({ scale: `${n}x`, suffix: `@${n}x`, format: VECTOR.has(last) ? 'png' : last });
  });
  const prefix = make('input', 'input'); prefix.name = 'prefix'; prefix.value = saved.prefix ?? ''; control(right, 'Prefix', prefix);

  const chosen = () => picks.flatMap((p, i) => p.check.checked ? [i] : []);
  function update() {
    const n = chosen().length;
    count.textContent = `Selected: ${n}, Total export: ${n * rows.length}`;
    ui.submit.textContent = n > 1 ? 'Export Artboards' : 'Export Artboard'; ui.submit.disabled = !n;
    byRow.querySelectorAll('input').forEach((r) => { r.disabled = !subfolders.checked; });
  }
  const applyRange = () => {
    try {
      const set = new Set(radios.range.checked ? parseRange(range.value, boards.length) : boards.map((_, i) => i));
      picks.forEach((p, i) => { p.check.checked = set.has(i); }); ui.error.textContent = '';
    } catch (problem) { ui.error.textContent = problem.message; }
    update();
  };
  const toRange = (text) => { radios.range.checked = true; range.disabled = false; range.value = text; update(); };
  for (const r of Object.values(radios)) r.addEventListener('change', () => { range.disabled = !radios.range.checked; applyRange(); });
  range.addEventListener('input', applyRange);
  grid.addEventListener('change', () => toRange(compactRange(chosen())));
  clear.addEventListener('click', () => { picks.forEach((p) => { p.check.checked = false; }); toRange(''); });
  subfolders.addEventListener('change', update);
  // A corrected row clears the message about it.
  for (const type of ['input', 'change']) table.addEventListener(type, () => { ui.error.textContent = ''; });
  browse.addEventListener('click', async () => { const value = await chooseFolder(folder.value || undefined); if (value) { folder.value = value; ui.error.textContent = ''; } });
  for (const row of saved.rows?.length ? saved.rows : [{}]) addRow(row);

  return ui.open(() => {
    const indices = chosen();
    if (!indices.length) throw new Error('Select at least one artboard.');
    if (!folder.value) throw new Error('Choose a folder to export to.');
    const sub = subfolders.checked ? (by.format.checked ? 'format' : 'scale') : null, names = new Set();
    const list = rows.map(({ scaleInput, suffixInput, formatSelect }) => {
      const def = SCREEN_FORMATS.find((f) => f.id === formatSelect.value), scale = scaleInput.value.trim() || '1x';
      if (!VECTOR.has(def.id)) scalePpi(scale);
      // Rows that would write the same file names would overwrite each other.
      const name = screensFilePath({ board: { name: 'x' }, index: 0, suffix: suffixInput.value, scale, format: def.format, subfolders: sub });
      if (names.has(name)) throw new Error('Two format rows write the same files. Give one of them a suffix.');
      names.add(name);
      return { scale, suffix: suffixInput.value, format: def.id, target: def.format, quality: def.quality ?? null };
    });
    sessionFolder = folder.value;
    const settings = { openAfter: openAfter.checked, subfolders: sub, prefix: prefix.value,
      rows: list.map(({ scale, suffix, format }) => ({ scale, suffix, format })) };
    try { storage?.setItem(SCREENS_KEY, JSON.stringify(settings)); } catch { /* Remembered settings are a convenience; the export still runs. */ }
    return { ...settings, folder: folder.value, indices, rows: list };
  }).finally(() => { alive = false; });
}
