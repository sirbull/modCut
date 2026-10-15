import assert from 'node:assert/strict';
import test from 'node:test';
import { createNode, createDocument, validateDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { updateNode } from '../doc/commands.mjs';
import { LAYER_COLORS, ROOT_CONTEXT, collectCommands, deleteLayerCommands, dropTarget, isOutputNode, layerContext, layerOptionsPatch,
  moveCommand, newLayer, nodeContext, releaseCommands, soloUpdates } from '../doc/layers.mjs';

function setup() {
  const a = createNode('path', { id: 'a' }), b = createNode('path', { id: 'b' }), c = createNode('path', { id: 'c' });
  const image = createNode('image', { id: 'image', assetId: 'asset' });
  const sub = createNode('layer', { id: 'sub', name: 'Sub', children: [c] });
  const bottom = createNode('layer', { id: 'bottom', name: 'Bottom', children: [a, b, sub] });
  const top = createNode('layer', { id: 'top', name: 'Top', children: [image] });
  const doc = new DrawDocument(createDocument({ layers: [bottom, top], assets: { asset: { mimeType: 'image/png', data: '', width: 1, height: 1 } } }));
  return { doc, history: new History(doc) };
}
const run = (history, label, commands) => history.transaction(label, () => commands.forEach((c) => history.execute(c)));

test('new layers cycle identification colors and names', () => {
  const { doc } = setup();
  const layer = newLayer(doc);
  assert.equal(layer.name, 'Layer 4'); assert.equal(layer.color, LAYER_COLORS[3]); assert.equal(layer.template, false);
});

test('template, print, preview and image dimming are inherited from layers', () => {
  const { doc, history } = setup();
  assert.deepEqual(nodeContext(doc, 'missing'), ROOT_CONTEXT);
  assert.equal(nodeContext(doc, 'image').dim, 1); assert.equal(nodeContext(doc, 'c').template, false);
  history.execute(updateNode('top', layerOptionsPatch(doc.getNode('top'), { template: true })));
  const top = doc.getNode('top');
  assert.equal(top.locked, true); assert.equal(top.printable, false); assert.equal(top.dimImages, true);
  assert.deepEqual(nodeContext(doc, 'image'), { template: true, printable: false, outline: false, dim: .5, color: top.color });
  assert.equal(isOutputNode(doc, 'image'), false); assert.equal(isOutputNode(doc, 'a'), true);
  history.execute(updateNode('bottom', layerOptionsPatch(doc.getNode('bottom'), { preview: false, dimImages: true, dimImagesTo: 20 })));
  assert.equal(nodeContext(doc, 'c').outline, true); assert.equal(nodeContext(doc, 'c').dim, .2);
  history.execute(updateNode('sub', { printable: false }));
  assert.equal(isOutputNode(doc, 'c'), false);
  history.execute(updateNode('a', { visible: false }));
  assert.equal(isOutputNode(doc, 'a'), false); assert.equal(isOutputNode(doc, 'missing'), false);
  // A template parent forces its sublayers to preview even when they request Outline.
  const parent = layerContext(ROOT_CONTEXT, { type: 'layer', template: true, printable: true, color: '#000000' });
  assert.equal(layerContext(parent, { type: 'layer', template: false, printable: true, preview: false, color: '#FFFFFF' }).outline, false);
  assert.equal(layerContext(parent, { type: 'path' }), parent);
  assert.deepEqual(validateDocument(doc.toJSON()), []);
  const invalid = doc.toJSON(); invalid.layers[0].preview = 'no';
  assert.ok(validateDocument(invalid).some((e) => e.path === '$.layers.0.preview'));
});

test('Layer Options patches are minimal and reject invalid values', () => {
  const { doc } = setup(), layer = doc.getNode('bottom');
  assert.deepEqual(layerOptionsPatch(layer, { name: '  ', color: layer.color, locked: false }), {});
  assert.deepEqual(layerOptionsPatch(layer, { name: 'Art', color: '#ff4f4f' }), { name: 'Art', color: '#FF4F4F' });
  assert.equal(layerOptionsPatch(layer, { template: true, dimImages: false }).dimImages, true, 'Template dims images by default');
  assert.equal(layerOptionsPatch({ ...layer, dimImages: true }, { template: true, dimImages: false }).dimImages, false);
  assert.throws(() => layerOptionsPatch(layer, { dimImagesTo: 101 }), /between 0 and 100/);
  assert.throws(() => layerOptionsPatch(layer, { color: 'red' }), /valid layer color/);
  const template = { ...layer, template: true, locked: true, printable: false, preview: true };
  assert.deepEqual(layerOptionsPatch(template, { template: true, locked: false, printable: true }), { locked: false });
  assert.deepEqual(layerOptionsPatch(template, { template: false, locked: false, printable: true }), { template: false, locked: false, printable: true });
});

test('solo visibility toggles other top-level layers in one step', () => {
  const { doc, history } = setup();
  assert.deepEqual(soloUpdates(doc, 'top'), [['bottom', false]]);
  run(history, 'Solo', soloUpdates(doc, 'top').map(([id, visible]) => updateNode(id, { visible })));
  assert.deepEqual(soloUpdates(doc, 'top'), [['bottom', true]]);
  assert.deepEqual(soloUpdates(doc, 'bottom'), [['bottom', true], ['top', false]]);
});

test('drop targets follow the top-first panel order and refuse invalid moves', () => {
  const { doc, history } = setup();
  assert.deepEqual(dropTarget(doc, 'a', 'b', 'above'), { parentId: 'bottom', index: 1 });
  assert.equal(dropTarget(doc, 'a', 'b', 'below'), null, 'No-op move');
  assert.deepEqual(dropTarget(doc, 'b', 'a', 'below'), { parentId: 'bottom', index: 0 });
  assert.deepEqual(dropTarget(doc, 'a', 'top', 'inside'), { parentId: 'top', index: 1 });
  assert.equal(dropTarget(doc, 'a', 'top', 'above'), null, 'Artwork cannot become a top-level layer');
  assert.equal(dropTarget(doc, 'bottom', 'c', 'inside'), null, 'A layer cannot move into its descendant');
  assert.equal(dropTarget(doc, 'a', 'b', 'inside'), null); assert.equal(dropTarget(doc, 'a', 'a', 'above'), null);
  assert.equal(dropTarget(doc, 'missing', 'a', 'above'), null);
  assert.deepEqual(dropTarget(doc, 'bottom', 'top', 'above'), { parentId: null, index: 1 });
  history.execute(moveCommand(doc, 'a', 'c', 'above'));
  assert.deepEqual(doc.getNode('sub').children.map((n) => n.id), ['c', 'a']);
  assert.equal(moveCommand(doc, 'a', 'a', 'above'), null);
  history.undo(); assert.deepEqual(doc.getNode('bottom').children.map((n) => n.id), ['a', 'b', 'sub']);
});

test('delete, collect and release are single undoable transactions', () => {
  const { doc, history } = setup(), before = doc.serialize();
  history.execute(updateNode('sub', { locked: true }));
  run(history, 'Delete Layer', deleteLayerCommands(doc, 'sub'));
  assert.equal(doc.getNode('c'), null); history.undo(); assert.equal(doc.getNode('sub').locked, true); history.undo();
  assert.throws(() => deleteLayerCommands(doc, 'a'), /Choose a layer/);
  const single = new DrawDocument(createDocument());
  assert.throws(() => deleteLayerCommands(single, single.data.layers[0].id), /at least one layer/);
  history.execute(updateNode('bottom', { locked: true }));
  assert.throws(() => deleteLayerCommands(doc, 'sub'), /parent layer/); history.undo();

  const { layer, commands } = collectCommands(doc, ['b', 'a']);
  run(history, 'Collect in New Layer', commands);
  assert.deepEqual(doc.getNode('bottom').children.map((n) => n.id), [layer.id, 'sub']);
  assert.deepEqual(doc.getNode(layer.id).children.map((n) => n.id), ['a', 'b']);
  history.undo(); assert.equal(doc.serialize(), before);
  assert.throws(() => collectCommands(doc, []), /Select objects/);
  assert.throws(() => collectCommands(doc, ['a', 'image']), /one layer/);
  assert.throws(() => collectCommands(doc, ['bottom']), /one layer/);

  const { created, commands: release } = releaseCommands(doc, 'bottom');
  run(history, 'Release to Layers', release);
  assert.equal(created.length, 2);
  assert.deepEqual(doc.getNode('bottom').children.map((n) => n.id), [created[0].id, created[1].id, 'sub']);
  assert.deepEqual(created.map((l) => doc.getNode(l.id).children[0].id), ['a', 'b']);
  history.undo(); assert.equal(doc.serialize(), before);
  assert.throws(() => releaseCommands(doc, 'a'), /Choose a layer/);
  assert.throws(() => releaseCommands(doc, 'sub2'), /Choose a layer/);
  run(history, 'Release', releaseCommands(doc, 'sub').commands);
  assert.throws(() => releaseCommands(doc, 'sub'), /no objects/);
});
