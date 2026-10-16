import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, artboardFilePath, targetForPath, scalePpi, screensFilePath } from '../io/export-plan.mjs';
import { PDF_PRESETS } from '../io/pdf.mjs';
import { normalizePdfOptions, pdfSummary } from '../ui/export-dialogs.mjs';

test('artboard ranges accept lists and spans and refuse what is not in the document', () => {
  assert.deepEqual(parseRange('1-3, 5', 6), [0, 1, 2, 4]);
  assert.deepEqual(parseRange('3-1;2', 3), [0, 1, 2]);
  assert.throws(() => parseRange('', 3), /Enter artboard numbers/);
  assert.throws(() => parseRange('2-x', 3), /not an artboard number/);
  assert.throws(() => parseRange('4', 3), /artboards 1–3/);
});

test('several artboards are written beside the chosen file with their names', () => {
  assert.equal(artboardFilePath('C:\\out\\Logo.png', { name: 'Front' }, 0), 'C:\\out\\Logo-Front.png');
  assert.equal(artboardFilePath('/out/v1.2/Logo', { name: 'a/b' }, 1), '/out/v1.2/Logo-a b');
  assert.equal(artboardFilePath('/out/Logo.svg', { name: '' }, 2), '/out/Logo-Artboard 3.svg');
  assert.equal(targetForPath('x.JPEG').id, 'jpg'); assert.equal(targetForPath('x.dxf').id, 'dxf'); assert.equal(targetForPath('x.ai'), null);
});

test('screen scales and file paths follow Export for Screens', () => {
  assert.equal(scalePpi('2x'), 144); assert.equal(scalePpi('300 ppi'), 300); assert.throws(() => scalePpi('big'), /2x or 300 ppi/);
  const board = { name: 'Icon' };
  assert.equal(screensFilePath({ board, index: 0, prefix: 'app-', suffix: '@2x', scale: '2x', format: 'png', subfolders: 'scale' }), '2x/app-Icon@2x.png');
  assert.equal(screensFilePath({ board, index: 0, format: 'svg', scale: '2x', subfolders: 'scale' }), 'Icon.svg', 'Vector files have no scale folder');
  assert.equal(screensFilePath({ board, index: 0, format: 'pdf', subfolders: 'format' }), 'PDF/Icon.pdf');
});

test('a preset and the same settings from the dialog compare equal; summaries name what changes', () => {
  const preset = PDF_PRESETS.find((p) => p.id === 'press').options;
  const fromDialog = { ...preset, marks: { trim: true, registration: false, pageInfo: false, weight: 0.25, offset: 2.117 }, range: 'all', indices: [0] };
  assert.deepEqual(normalizePdfOptions(fromDialog), normalizePdfOptions(preset));
  const { lines, warnings } = pdfSummary({ ...preset, version: '1.4', layers: true, range: 'all' }, [{}, {}]);
  assert.ok(lines.includes('Pages: all 2 artboards')); assert.ok(lines.includes('Marks: trim marks')); assert.ok(lines.includes('Bleed: 3 / 3 / 3 / 3 mm'));
  assert.ok(warnings.some((w) => /PDF 1.5/.test(w)));
});
