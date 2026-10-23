import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createNode, validateDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { appearance } from '../geometry.mjs';
import { addStyleCommand, applyStyleCommands, graphicStyles, removeStyleCommand, styleFrom } from '../doc/graphic-styles.mjs';

test('a style is made from an object, stored, applied in one step and deleted', () => {
  const red = createNode('path', { appearance: appearance('#FF0000', '#0000FF', 2), opacity: .5 }), plain = createNode('path'), group = createNode('group', { children: [createNode('path')] });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { children: [red, plain, group] })] })), history = new History(doc);
  const style = styleFrom(doc.getNode(red.id), 'Red');
  history.execute(addStyleCommand(doc, style));
  assert.deepEqual(graphicStyles(doc).map((s) => s.name), ['[Default]', 'Red']);
  assert.deepEqual(validateDocument(doc.data), []);
  history.transaction('Apply Graphic Style', () => applyStyleCommands(doc, [plain.id, group.id], style).forEach((c) => history.execute(c)));
  assert.deepEqual(doc.getNode(plain.id).appearance, doc.getNode(red.id).appearance); assert.equal(doc.getNode(plain.id).opacity, .5);
  assert.deepEqual(doc.getNode(group.id).appearance.fills, [], 'A group keeps its own (empty) fills');
  history.undo(); assert.equal(doc.getNode(plain.id).opacity, 1, 'Applying is one undo step');
  history.execute(removeStyleCommand(doc, style.id)); assert.equal(graphicStyles(doc).length, 1);
  assert.throws(() => removeStyleCommand(doc, 'default'), /cannot be deleted/);
  assert.throws(() => styleFrom(createNode('image'), 'x'), /Select a path/);
});

test('export assets refer to nodes by id without clashing with them', () => {
  const path = createNode('path'), doc = createDocument({ layers: [createNode('layer', { children: [path] })] });
  doc.exportAssets = [{ id: 'asset-1', nodeId: path.id, name: 'Logo' }];
  assert.deepEqual(validateDocument(doc), []);
  doc.exportAssets[0].nodeId = '';
  assert.match(validateDocument(doc)[0].path, /exportAssets\.0\.nodeId/);
});
