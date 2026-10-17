import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { createNode } from '../doc/schema.mjs';
import { insertNode } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';
import { pointText } from '../doc/text.mjs';
import { documentInfo } from '../doc/document-info.mjs';

test('Document Info counts objects, anchors, open paths and fonts', () => {
  const doc = new DrawDocument(), history = new History(doc), layer = doc.data.layers[0].id, seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
  history.execute(insertNode(layer, createNode('path', { subpaths: [{ closed: false, segments: [[0, 0], [5, 5], [9, 0]].map(seg) }], appearance: appearance(null, '#000000') })));
  const text = pointText([0, 0], { text: 'Hi there', fontFamily: 'Arial', fontSize: 12, leading: 14, fontWeight: 'normal', fontStyle: 'normal', alignment: 'left',
    runs: [{ text: 'Hi', character: { fontWeight: 'bold' } }, { text: ' there' }] });
  history.execute(insertNode(layer, text));
  const info = documentInfo(doc);
  assert.deepEqual(info.objects, [{ label: 'Paths', count: 1 }, { label: 'Text objects', count: 1 }]);
  assert.equal(info.anchors, 3); assert.equal(info.openPaths, 1);
  assert.deepEqual(info.fonts.map((f) => `${f.family} ${f.weight} ${f.count}`), ['Arial normal 1', 'Arial bold 1']);
  assert.equal(documentInfo(doc, [text.id]).objects.length, 1, 'Selection only');
});
