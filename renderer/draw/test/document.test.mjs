import assert from 'node:assert/strict';
import test from 'node:test';
import { createId, createNode, createDocument, createArtboard, validateDocument, assertDocument } from '../doc/schema.mjs';
import { DrawDocument, findNode } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { Selection } from '../doc/selection.mjs';
import { loadDocument, migrateDocument } from '../doc/migrate.mjs';
import { insertNode, removeNode, updateNode, moveNode, insertArtboard, removeArtboard, updateArtboard, updateDocument } from '../doc/commands.mjs';

function setup() {
  const group = createNode('group', { id: 'group' });
  const path = createNode('path', { id: 'path', subpaths: [{ closed: false, segments: [
    { p: [1, 2], in: [0, 0], out: [3, 4] }, { p: [5, 6], in: [-1, 0], out: [0, 0] },
  ] }] });
  const layer = createNode('layer', { id: 'layer', children: [group, path] });
  const doc = new DrawDocument(createDocument({ id: 'doc', layers: [layer] }));
  return { doc, history: new History(doc), layer, group, path };
}
const throwsUnchanged = (doc, history, command, pattern) => {
  const before = doc.serialize(), entries = history.entries;
  assert.throws(() => history.execute(command), pattern);
  assert.equal(doc.serialize(), before); assert.deepEqual(history.entries, entries);
};

test('defaults, stable ids, detached snapshots and indexed queries', () => {
  const ids = Array.from({ length: 1000 }, createId);
  assert.equal(new Set(ids).size, 1000); assert.ok(ids.every((id) => /^[\w-]{12}$/.test(id)));
  assert.throws(() => createNode('unknown'), /Unknown/);
  assert.deepEqual(validateDocument(createDocument()), []);
  assert.deepEqual(validateDocument(new DrawDocument().data), []);
  const { doc } = setup();
  assert.equal(doc.getNode('missing'), null); assert.equal(doc.locate('missing'), null);
  assert.equal(doc.getArtboard('missing'), null); assert.equal(doc.getArtboard(doc.data.artboards[0].id).width, 600);
  assert.equal(doc.locate('path').parentId, 'layer'); assert.equal(doc.locate('path').index, 1);
  assert.deepEqual(doc.locate('path').path, ['layers', 0, 'children', 1]);
  assert.deepEqual(doc.ancestors('path').map((n) => n.id), ['layer']);
  assert.deepEqual(doc.ancestors('missing'), []);
  assert.deepEqual(doc.descendants(null).map((n) => n.id), ['layer', 'group', 'path']);
  assert.deepEqual(doc.descendants('layer').map((n) => n.id), ['group', 'path']);
  assert.deepEqual(doc.descendants('missing'), []);
  assert.equal(findNode(doc.data, 'path').node, doc.getNode('path'));
  const json = doc.toJSON(); json.layers[0].children.length = 0;
  assert.equal(doc.descendants('layer').length, 2);
  assert.throws(() => { doc.getNode('path').name = 'direct edit'; }, TypeError);
  assert.throws(() => { doc.data.layers.push(createNode('layer')); }, TypeError);
  assert.equal(doc.isEditable('missing'), false);
});

test('commands insert, edit, reorder, reparent and delete while retaining identity', () => {
  const { doc, history } = setup(), initial = doc.serialize();
  const shape = createNode('shape', { id: 'shape' });
  history.execute(insertNode('group', shape)); shape.params.width = 999;
  assert.equal(doc.getNode('shape').params.width, 10);
  history.execute(updateNode('shape', { name: 'Test', data: { note: 'kept' } }));
  history.execute(moveNode('shape', 'layer', 0));
  assert.equal(doc.locate('shape').parentId, 'layer'); assert.equal(doc.locate('shape').index, 0);
  history.execute(moveNode('path', 'layer', 0));
  assert.equal(doc.locate('path').index, 0);
  history.execute(insertNode(null, createNode('layer', { id: 'second' }), 0));
  history.execute(moveNode('group', 'second'));
  history.execute(removeNode('shape'));
  assert.equal(doc.getNode('shape'), null);
  const final = doc.serialize();
  while (history.undo()) {}
  assert.equal(doc.serialize(), initial);
  while (history.redo()) {}
  assert.equal(doc.serialize(), final);
});

test('bad commands never change the document or history', () => {
  const { doc, history } = setup();
  for (const command of [
    insertNode('missing', createNode('path')), insertNode('path', createNode('path')),
    insertNode('group', createNode('path'), -1), insertNode('group', createNode('path'), 0.5),
    insertNode('group', createNode('path'), 2), insertNode('group', createNode('path', { id: 'path' })),
    insertNode(null, createNode('path')), moveNode('layer', 'group'), moveNode('group', 'group'),
    moveNode('group', 'path'), moveNode('path', 'missing'), removeNode('missing'), updateNode('missing', { name: 'x' }),
    updateNode('path', { opacity: 2 }), updateNode('path', { opacity: NaN }),
    updateNode('path', { transform: [1, 0, 0, 1, 5, 0] }),
    updateNode('path', { subpaths: [{ closed: true, segments: [{ p: [Infinity, 0], in: [0, 0], out: [0, 0] }] }] }),
    updateArtboard('missing', { width: 5 }), removeArtboard('missing'), removeArtboard(doc.data.artboards[0].id),
    updateArtboard(doc.data.artboards[0].id, { width: -1 }),
    updateDocument({ settings: { keyboardIncrement: -1 } }),
  ]) throwsUnchanged(doc, history, command);
  assert.throws(() => updateNode('path', { id: 'x' }), /Identity/);
  assert.throws(() => updateNode('path', { type: 'shape' }), /Identity/);
  assert.throws(() => updateNode('layer', { children: [] }), /Identity/);
  assert.throws(() => updateArtboard('x', { id: 'new' }), /immutable/);
  assert.throws(() => updateDocument({ version: 2 }), /Unsupported/);
  assert.throws(() => history.execute({}), /Command/);
  assert.throws(() => history.execute(null), /Command/);
});

test('artboard and document settings round trip through history', () => {
  const { doc, history } = setup(), initial = doc.serialize();
  const board = createArtboard({ id: 'board2', x: -30, width: 200, height: 100 });
  history.execute(insertArtboard(board, 0)); board.width = 999;
  assert.equal(doc.getArtboard('board2').width, 200);
  history.execute(updateArtboard('board2', { name: 'Second', width: 40 }));
  history.execute(insertArtboard(createArtboard({ id: 'board3' })));
  history.execute(removeArtboard('board2'));
  history.execute(updateDocument({ name: 'Logo', units: 'pt', colorMode: 'cmyk' }));
  while (history.undo()) {}
  assert.equal(doc.serialize(), initial);
});

test('locks, hidden ancestors and Layer controls', () => {
  const { doc, history } = setup();
  history.execute(updateNode('layer', { locked: true }));
  assert.equal(doc.isEditable('path'), false);
  throwsUnchanged(doc, history, updateNode('path', { name: 'no' }), /locked/);
  throwsUnchanged(doc, history, removeNode('path'), /locked/);
  throwsUnchanged(doc, history, insertNode('layer', createNode('path')), /locked/);
  history.execute(updateNode('layer', { locked: false, visible: false }));
  assert.equal(doc.isEditable('path'), false);
  history.execute(updateNode('layer', { visible: true }));
  assert.equal(doc.isEditable('path'), true);
});

test('transactions are nested, atomic and emit one change event', () => {
  const { doc, history } = setup(), initial = doc.serialize(), events = [];
  const unsubscribe = history.subscribe((event) => events.push(event));
  history.subscribe(() => { throw new Error('observer'); });
  history.transaction('Logo', () => {
    history.execute(updateNode('path', { name: 'Logo' }));
    history.transaction('Opacity', () => history.execute(updateNode('path', { opacity: .5 })));
  });
  assert.equal(events.length, 1); assert.deepEqual(events[0].nodeIds, ['path']);
  assert.equal(history.undoLabel, 'Logo'); assert.equal(history.redoLabel, null);
  assert.equal(history.entries.length, 1); assert.equal(history.dirty, true);
  assert.equal(history.undo(), true); assert.equal(doc.serialize(), initial);
  assert.equal(history.redoLabel, 'Logo'); assert.equal(history.entries[0].applied, false);
  assert.equal(history.redo(), true); assert.equal(doc.getNode('path').opacity, .5);
  const before = doc.serialize(), count = events.length;
  assert.throws(() => history.transaction('Failure', () => {
    history.execute(updateNode('path', { opacity: .2 }));
    history.transaction('Nested failure', () => { throw new Error('cancel'); });
  }), /cancel/);
  assert.equal(doc.serialize(), before); assert.equal(events.length, count);
  history.transaction('Empty', () => {}); assert.equal(events.length, count);
  assert.throws(() => history.transaction('Async', async () => {}), /synchronous/);
  assert.throws(() => history.transaction('Thenable', () => Promise.resolve()), /synchronous/);
  for (const action of ['undo', 'redo', 'clear', 'markSaved']) {
    assert.throws(() => history.transaction('Invalid', () => history[action]()), /inside a transaction/);
  }
  unsubscribe(); history.markSaved(); assert.equal(events.length, count);
});

test('history coalesces edits and protects saved-state boundaries and redo branches', () => {
  const { doc, history } = setup();
  const nudge = (x) => updateNode('path', { name: String(x) }, { label: 'Nudge', mergeKey: 'path:name' });
  history.execute(nudge(1)); history.execute(nudge(2)); history.execute(nudge(3));
  assert.equal(history.entries.length, 1); assert.equal(history.undoLabel, 'Nudge');
  history.undo(); assert.equal(doc.getNode('path').name, ''); assert.equal(history.dirty, false);
  history.redo(); assert.equal(doc.getNode('path').name, '3');
  history.markSaved(); assert.equal(history.dirty, false);
  history.execute(nudge(4)); assert.equal(history.entries.length, 2);
  history.undo(); assert.equal(history.dirty, false);
  history.redo(); assert.equal(history.dirty, true);
  history.undo(); history.execute(updateNode('path', { name: 'branch' }));
  assert.equal(history.canRedo, false); assert.equal(history.redo(), false);
  history.clear(); assert.equal(history.canUndo, false); assert.equal(history.undo(), false); assert.equal(history.dirty, true);
  history.markSaved(); history.clear(); assert.equal(history.dirty, false);
  history.execute(nudge(5)); history.execute(updateNode('path', { opacity: .7 }, { mergeKey: 'path:name' }));
  assert.equal(history.entries.length, 2, 'different patch paths cannot merge');
});

test('custom commands cannot leave partial state after failed do, undo or redo', () => {
  const { doc, history } = setup(), original = doc.serialize();
  throwsUnchanged(doc, history, { label: 'Bad do', do(d) { d._edit((data) => { data.name = 'oops'; }); throw new Error('failed'); }, undo() {} }, /failed/);
  throwsUnchanged(doc, history, { label: 'Async', async do() {}, undo() {} }, /synchronous/);
  throwsUnchanged(doc, history, { label: 'Thenable', do() { return Promise.resolve(); }, undo() {} }, /synchronous/);
  let redoFailure = false;
  history.execute({ label: 'Custom', nodeIds: ['path'], do(d) { if (redoFailure) throw new Error('redo'); d._edit((data) => { data.name = 'custom'; }); }, undo(d) { d._edit((data) => { data.name = 'partial'; }); throw new Error('undo'); } });
  const current = doc.serialize(); assert.throws(() => history.undo(), /undo/); assert.equal(doc.serialize(), current); assert.equal(history.canUndo, true);
  assert.notEqual(current, original);
  const other = setup();
  other.history.execute({ label: 'Redo fails', do(d) { if (redoFailure) throw new Error('redo'); d._edit((data) => { data.name = 'custom'; }); }, undo(d) { d._edit((data) => { data.name = 'Untitled'; }); } });
  other.history.undo(); redoFailure = true;
  assert.throws(() => other.history.redo(), /redo/); assert.equal(other.doc.data.name, 'Untitled'); assert.equal(other.history.canRedo, true);
});

test('selection supports anchors, named selections, pruning and detached results', () => {
  const { doc, history } = setup(), selection = new Selection(doc);
  selection.set(['path', 'path', 'missing']); assert.deepEqual(selection.ids, ['path']);
  const ids = selection.ids; ids.push('fake'); assert.deepEqual(selection.ids, ['path']);
  selection.save('Objects');
  selection.setAnchors([{ nodeId: 'path', subpath: 0, segment: 1 }, { nodeId: 'path', subpath: 0, segment: -1 },
    { nodeId: 'path', subpath: 3, segment: 0 }, { nodeId: 'group', subpath: 0, segment: 0 }, { nodeId: 'missing', subpath: 0, segment: 0 }]);
  assert.equal(selection.anchors.length, 1); assert.deepEqual(selection.ids, ['path']);
  const anchors = selection.anchors; anchors[0].segment = 100;
  assert.equal(selection.anchors[0].segment, 1);
  selection.save('Anchors'); selection.clear(); assert.deepEqual(selection.anchors, []);
  assert.equal(selection.restore('missing'), false); assert.equal(selection.restore('Anchors'), true);
  history.execute(updateNode('layer', { locked: true })); assert.deepEqual(selection.ids, []); assert.deepEqual(selection.anchors, []);
  history.undo(); selection.restore('Objects'); history.execute(removeNode('path')); assert.deepEqual(selection.ids, []);
  assert.deepEqual(selection.savedNames, ['Objects', 'Anchors']); assert.equal(selection.deleteSaved('Objects'), true);
});

test('migration, safe defaults, quarantine and read-only loading preserve original input', () => {
  const { doc } = setup(), original = doc.serialize();
  const loaded = loadDocument(original);
  assert.equal(loaded.safeMode, false); assert.deepEqual(loaded.report, []); assert.equal(loaded.document.serialize(), original);
  for (const input of [null, [], '3', 'null']) assert.throws(() => migrateDocument(input), /Expected Draw/);
  assert.throws(() => migrateDocument('{'), SyntaxError);
  for (const version of [0, 2, '1']) assert.throws(() => migrateDocument({ version }), /Unsupported Draw version/);
  const draft = doc.toJSON(); delete draft.version; delete draft.layers[0].visible; delete draft.settings.grid.y;
  delete draft.settings.snapping.point; delete draft.artboards[0].background;
  const repaired = loadDocument(draft);
  assert.equal(repaired.safeMode, false); assert.ok(repaired.report.length >= 5); assert.equal(repaired.document.data.settings.grid.y, 10);
  assert.equal(draft.version, undefined); assert.equal(draft.layers[0].visible, undefined);
  const bad = doc.toJSON(); bad.layers[0].children[1].subpaths[0].segments[0].p[0] = NaN;
  bad.artboards[0].width = -2; bad.units = 'bad';
  const safe = loadDocument(bad);
  assert.equal(safe.safeMode, true); assert.ok(safe.report.length >= 3);
  assert.equal(safe.document.getNode('path'), null); assert.ok(safe.document.getNode('group'));
  assert.equal(safe.document.data.units, 'mm'); assert.equal(safe.document.data.artboards.length, 1);
  assert.ok(Number.isNaN(safe.source.layers[0].children[1].subpaths[0].segments[0].p[0]));
  assert.equal(bad.artboards[0].width, -2); assert.deepEqual(validateDocument(safe.document.data), []);
  assert.throws(() => new History(safe.document).execute(updateDocument({ name: 'unsafe' })), /safe mode/);
  const brokenReference = doc.toJSON(); brokenReference.layers[0].children.push(createNode('trace', { sourceImageId: 'missing' }));
  assert.equal(loadDocument(brokenReference).safeMode, true);
  const missing = loadDocument({ version: 1 }); assert.equal(missing.safeMode, false); assert.ok(missing.report.length);
  const unknown = doc.toJSON(); unknown.layers[0].children.push({ id: 'unknown', type: 'alien' });
  assert.equal(loadDocument(unknown).safeMode, true);
  const noArrays = doc.toJSON(); noArrays.layers = null; noArrays.artboards = null;
  assert.equal(loadDocument(noArrays).safeMode, true);
});

test('seeded property test: undo and redo 1,000 mixed commands reproduce exact documents', () => {
  const { doc, history } = setup(), initial = doc.serialize();
  let seed = 0x5eed1234, counter = 0;
  const counts = [0, 0, 0, 0, 0, 0], states = [initial];
  const random = (max) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let i = 0; i < 1000; i++) {
    const nodes = doc.descendants('layer').filter((node) => node.id.startsWith('random'));
    const node = nodes[random(Math.max(nodes.length, 1))];
    const operation = node ? random(6) : 0;
    counts[operation]++;
    switch (operation) {
      case 0: history.execute(insertNode(random(2) ? 'layer' : 'group', createNode('shape', { id: `random${counter++}`, params: { width: random(300) + 1, height: random(200) + 1 } }))); break;
      case 1: history.execute(removeNode(node.id)); break;
      case 2: history.execute(updateNode(node.id, { opacity: random(101) / 100 })); break;
      case 3: history.execute(moveNode(node.id, random(2) ? 'layer' : 'group', 0)); break;
      case 4: history.transaction('Random pair', () => { history.execute(updateNode(node.id, { name: `Shape ${i}` })); history.execute(updateNode(node.id, { transform: [1, 0, 0, 1, random(400) - 200, random(400) - 200] })); }); break;
      case 5: history.execute(updateArtboard(doc.data.artboards[0].id, { width: random(1000) + 1 })); break;
    }
    states.push(doc.serialize());
  }
  assert.ok(counts.every((count) => count > 0), `All command categories must be exercised: ${counts}`);
  const final = doc.serialize(); assert.equal(history.entries.length, 1000);
  for (let i = 999; i >= 0; i--) { assert.equal(history.undo(), true); assert.equal(doc.serialize(), states[i]); }
  assert.equal(doc.serialize(), initial); assert.equal(history.dirty, false);
  for (let i = 0; i < 1000; i++) { assert.equal(history.redo(), true); assert.equal(doc.serialize(), states[i + 1]); }
  assert.equal(doc.serialize(), final); assert.deepEqual(validateDocument(doc.data), []);
});

test('appearance, gradients, embedded assets and all node variants validate without rendering', () => {
  const data = createDocument({ assets: { bitmap: { mime: 'image/png', data: 'embedded' } } });
  const gradient = { type: 'linear', stops: [
    { offset: 0, color: { space: 'rgb', values: [1, 0, 0] }, opacity: 1, midpoint: .5 },
    { offset: 1, color: { space: 'cmyk', values: [0, 1, 0, 0] } },
  ], origin: [0, 0], angle: 45, length: 20, aspect: 1 };
  const appearance = { fills: [{ paint: gradient, opacity: 1, blendMode: 'normal', effects: [] }],
    strokes: [{ paint: { type: 'solid', color: { space: 'gray', values: [.5] } }, width: .2,
      opacity: .8, blendMode: 'normal', effects: [], miterLimit: 4, cap: 'round', join: 'bevel', align: 'center' }], effects: [] };
  data.layers[0].children.push(
    createNode('shape', { id: 'shape', appearance, params: { width: 10, height: 20, angle: -90 } }),
    createNode('image', { id: 'image', assetId: 'bitmap', crop: { x: .1, y: .2, width: .5, height: .4 } }),
    createNode('text', { id: 'text' }),
    createNode('trace', { sourceImageId: 'image' }),
    createNode('blend', { a: 'shape', b: 'text' }),
    createNode('compoundPath', { children: [createNode('path')] }),
  );
  assert.deepEqual(validateDocument(data), []);
  const doc = new DrawDocument(data), history = new History(doc);
  const before = doc.serialize();
  history.execute(updateNode('shape', { appearance: { ...appearance, fills: [{ ...appearance.fills[0], paint: { type: 'none' } }] } }));
  history.undo(); assert.equal(doc.serialize(), before);
  const image = createNode('image', { assetId: 'bitmap' });
  data.layers[0].children.push(image); assert.deepEqual(validateDocument(data), []);
});

test('schema reports malformed JSON, topology, coordinates and appearance at precise paths', () => {
  const invalid = (mutate, match) => {
    const data = createDocument(); mutate(data);
    const errors = validateDocument(data); assert.ok(errors.length, 'invalid input must be rejected');
    if (match) assert.ok(errors.some((error) => error.path.includes(match)), JSON.stringify(errors));
    assert.throws(() => assertDocument(data), TypeError);
  };
  assert.ok(validateDocument(null).length); assert.ok(validateDocument(3).length);
  invalid((d) => { d.data = d; }, '$.data');
  invalid((d) => { d.extra = new Date(); }, '$.extra');
  invalid((d) => { d.extra = undefined; }, '$.extra');
  invalid((d) => { d.extra = () => {}; }, '$.extra');
  invalid((d) => { d.version = 2; }, '$.version');
  invalid((d) => { d.id = ''; }, '$.id');
  invalid((d) => { d.assets = null; }, '$.assets');
  invalid((d) => { d.layers = null; }, '$.layers');
  invalid((d) => { d.layers = [null]; }, '$.layers.0');
  invalid((d) => { d.settings = null; }, '$.settings');
  invalid((d) => { d.artboards = [null]; }, '$.artboards.0');
  invalid((d) => { d.layers[0].transform = [1, 2]; }, '.transform');
  invalid((d) => { d.layers[0].appearance = null; }, '.appearance');
  invalid((d) => { d.layers[0].children = [createNode('path', { children: [] })]; }, '.children');
  invalid((d) => { d.layers[0].children = [createNode('compoundPath', { children: [createNode('shape')] })]; });
  invalid((d) => { d.layers[0].children = [createNode('shape', { params: null })]; }, '.params');
  invalid((d) => { d.layers[0].children = [createNode('shape', { params: { width: 'bad' } })]; }, '.params.width');
  invalid((d) => { d.layers[0].children = [createNode('path', { subpaths: [null] })]; }, '.subpaths.0');
  invalid((d) => { d.layers[0].children = [createNode('path', { subpaths: [{ closed: true, segments: [null] }] })]; }, '.segments.0');
  invalid((d) => { d.layers[0].children = [createNode('text', { content: null })]; }, '.content');
  invalid((d) => { d.layers[0].children = [createNode('image')]; }, '.assetId');
  invalid((d) => { d.assets.a = {}; d.layers[0].children = [createNode('image', { assetId: 'a', crop: { x: .5, y: 0, width: 1, height: 1 } })]; }, '.crop');
  invalid((d) => { d.layers[0].children = [createNode('blend')]; });
  invalid((d) => { d.layers[0].children = [createNode('trace', { sourceImageId: d.layers[0].id })]; });
  for (const paint of [null, { type: 'solid', color: null }, { type: 'solid', color: { space: 'bad', values: [] } },
    { type: 'radial', stops: [null] }, { type: 'linear', stops: [], origin: [0, 0], length: 0, aspect: -1, angle: 0 }]) {
    invalid((d) => { d.layers[0].appearance.fills = [{ paint, opacity: 1, blendMode: 'normal', effects: [] }]; });
  }
  invalid((d) => { d.layers[0].appearance.fills = [null]; });
  invalid((d) => { d.layers[0].appearance.strokes = [{ paint: { type: 'none' }, opacity: 1, blendMode: 'normal', effects: [], width: -1, miterLimit: 0, cap: 'bad', join: 'bad', align: 'bad' }]; });
});

test('loader rejects cyclic/non-JSON source before attempting recursive repair', () => {
  const cyclic = createDocument(); cyclic.layers[0].children.push(cyclic.layers[0]);
  assert.throws(() => loadDocument(cyclic), /Cyclic/);
  assert.throws(() => loadDocument({ version: 1, value: new Date() }), /plain JSON/);
  const badSettings = createDocument(); badSettings.settings = null;
  assert.equal(loadDocument(badSettings).safeMode, true);
  const noName = createDocument(); noName.name = undefined;
  assert.throws(() => loadDocument(noName), /JSON data/);
});

test('safe mode and repair also handle arbitrary stable string ids and malformed root data', () => {
  const data = createDocument();
  data.layers[0].children.push(createNode('trace', { id: 'trace.with.dots', sourceImageId: 'missing' }));
  const safe = loadDocument(data);
  assert.equal(safe.safeMode, true); assert.equal(safe.document.getNode('trace.with.dots'), null);
  assert.throws(() => { safe.document.readOnly = false; }, TypeError);
  assert.throws(() => loadDocument({ version: 1, extra: NaN }), /Cannot recover/);
});

test('coalescing failures retain the edit as a separate undo step', () => {
  const { doc, history } = setup();
  const first = updateNode('path', { name: 'first' });
  first.merge = () => { throw new Error('merge failed'); };
  history.execute(first); history.execute(updateNode('path', { name: 'second' }));
  assert.equal(doc.getNode('path').name, 'second'); assert.equal(history.entries.length, 2);
  history.undo(); assert.equal(doc.getNode('path').name, 'first');
  history.undo(); assert.equal(doc.getNode('path').name, '');
});
