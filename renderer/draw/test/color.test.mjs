import assert from 'node:assert/strict';
import test from 'node:test';
import { COLOR_MODES, colorFromValues, colorValues, hexToRgb, normalizeHex, rgbToHex } from '../doc/color.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { createDocument, createNode } from '../doc/schema.mjs';
import { updateNode } from '../doc/commands.mjs';

test('hex parsing and RGB round trips', () => {
  assert.equal(normalizeHex('abc'), '#AABBCC'); assert.equal(normalizeHex(' #00ac69 '), '#00AC69');
  assert.throws(() => normalizeHex('#12345'), /hex color/);
  assert.deepEqual(hexToRgb('#00AC69'), [0, 172, 105]); assert.equal(rgbToHex([0, 172, 105]), '#00AC69');
  assert.equal(rgbToHex([-5, 300, 12.6]), '#00FF0D');
});

test('every color mode converts to and from hex', () => {
  assert.deepEqual(colorValues('rgb', '#FF8000'), [255, 128, 0]);
  assert.deepEqual(colorValues('hsb', '#FF0000'), [0, 100, 100]);
  assert.deepEqual(colorValues('hsb', '#808080'), [0, 0, 50.2]);
  assert.deepEqual(colorValues('cmyk', '#000000'), [0, 0, 0, 100]);
  assert.deepEqual(colorValues('cmyk', '#00FFFF'), [100, 0, 0, 0]);
  assert.deepEqual(colorValues('gray', '#FFFFFF'), [0]); assert.deepEqual(colorValues('gray', '#000000'), [100]);
  for (const hex of ['#00AC69', '#071411', '#FFC800', '#4F80FF', '#FFFFFF', '#000000', '#7F3F1F']) {
    for (const mode of ['rgb', 'hsb', 'cmyk']) {
      const back = hexToRgb(colorFromValues(mode, colorValues(mode, hex)));
      hexToRgb(hex).forEach((v, i) => assert.ok(Math.abs(v - back[i]) <= 1, `${mode} ${hex}`));
    }
  }
  assert.equal(colorFromValues('hsb', [360, 100, 100]), '#FF0000');
  assert.equal(colorFromValues('gray', [50]), '#808080');
  assert.equal(colorFromValues('cmyk', [0, 0, 0, 0]), '#FFFFFF');
  assert.throws(() => colorFromValues('rgb', [256, 0, 0]), /R must be between 0 and 255/);
  assert.throws(() => colorFromValues('cmyk', [0, 0, 0]), /needs 4 values/);
  assert.throws(() => colorFromValues('lab', [0]), /Unknown/); assert.throws(() => colorValues('lab', '#000000'), /Unknown/);
  assert.equal(Object.keys(COLOR_MODES).length, 4);
});

test('merge-keyed transactions coalesce a live slider drag into one undo step', () => {
  const a = createNode('path', { id: 'a' }), b = createNode('path', { id: 'b' });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { id: 'l', children: [a, b] })] })), history = new History(doc);
  for (const opacity of [.9, .8, .7]) history.transaction('Opacity', () => ['a', 'b'].forEach((id) => history.execute(updateNode(id, { opacity }))), { mergeKey: 'slider' });
  assert.equal(history.entries.length, 1); assert.equal(doc.getNode('b').opacity, .7);
  history.undo(); assert.equal(doc.getNode('a').opacity, 1); assert.equal(doc.getNode('b').opacity, 1);
  history.redo(); assert.equal(doc.getNode('a').opacity, .7);
  history.transaction('Opacity', () => history.execute(updateNode('a', { opacity: .5 })), { mergeKey: 'slider' });
  assert.equal(history.entries.length, 2, 'Different nodes do not merge');
  history.transaction('Other', () => history.execute(updateNode('a', { opacity: .4 })));
  history.transaction('Other', () => history.execute(updateNode('a', { opacity: .3 })));
  assert.equal(history.entries.length, 4, 'Transactions without a mergeKey stay separate');
});
