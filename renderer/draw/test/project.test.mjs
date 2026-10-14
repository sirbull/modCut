import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECT_VERSION, validateProject, createProjectDraw } from '../io/project.mjs';
import { createDocument, createNode } from '../doc/schema.mjs';
import { insertNode, updateNode } from '../doc/commands.mjs';

test('legacy Cut projects remain unchanged and get independent empty Draw documents', () => {
  const project = { app: 'modCut', version: 3, design: 'unchanged Cut JSON', layers: [{ op: 'Cut' }] };
  const before = structuredClone(project);
  validateProject(project);
  const a = createProjectDraw(project.draw), b = createProjectDraw(project.draw);
  assert.deepEqual(project, before);
  assert.equal(a.document.data.layers[0].children.length, 0);
  assert.notEqual(a.document.data.id, b.document.data.id);
  assert.equal(a.dirty, false);
  for (const version of [undefined, 1, 2, 4]) validateProject({ app: 'modCut', version });
  assert.equal(PROJECT_VERSION, 4);
  assert.throws(() => validateProject({ app: 'wrong', version: 3 }), /Not a modCut/);
  for (const version of [0, 5, '4', 1.5]) assert.throws(() => validateProject({ app: 'modCut', version }), /newer version/);
});

test('v4 Draw roundtrip preserves geometry, assets and settings without undo or selection', () => {
  const state = createProjectDraw(createDocument({ assets: { fixture: { data: 'base64', mime: 'image/png' } },
    settings: { ...createDocument().settings, keyboardIncrement: 2 } }));
  const shape = createNode('shape', { id: 'shape', name: 'Fixture', params: { width: 25, height: 12 } });
  state.history.execute(insertNode(state.document.data.layers[0].id, shape));
  state.selection.set(['shape']);
  const snapshot = state.snapshot();
  assert.strictEqual(state.snapshot(), snapshot, 'unchanged snapshots reuse immutable model data');
  const restored = createProjectDraw(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored.snapshot(), snapshot);
  assert.equal(restored.dirty, false);
  assert.equal(restored.history.canUndo, false);
  assert.deepEqual(restored.selection.ids, []);
  assert.notStrictEqual(restored.document.data, snapshot);
  state.history.execute(updateNode('shape', { name: 'Changed' }));
  assert.equal(snapshot.layers[0].children[0].name, 'Fixture');
  assert.notStrictEqual(state.snapshot(), snapshot);
});

test('a save in flight marks only the captured state clean and prevents merging across it', () => {
  const state = createProjectDraw();
  const layer = state.document.data.layers[0].id;
  state.history.execute(updateNode(layer, { name: 'Written' }, { mergeKey: 'name' }));
  const commit = state.captureSavepoint();
  state.history.execute(updateNode(layer, { name: 'Later edit' }, { mergeKey: 'name' }));
  commit();
  assert.equal(state.dirty, true);
  assert.equal(state.history.entries.length, 2);
  state.history.undo();
  assert.equal(state.document.getNode(layer).name, 'Written');
  assert.equal(state.dirty, false);
  state.history.redo(); assert.equal(state.dirty, true);
  state.history.markSaved(); assert.equal(state.dirty, false);
});

test('recovery retains dirty Draw even though history is not persisted', () => {
  const state = createProjectDraw(createDocument(), { dirty: true });
  let notifications = 0;
  const unsubscribe = state.subscribe(() => notifications++);
  assert.equal(state.dirty, true); assert.equal(state.history.canUndo, false);
  const commit = state.captureSavepoint();
  assert.equal(state.dirty, true, 'a canceled/failed save must not clear the dirty marker');
  commit(); assert.equal(state.dirty, false); assert.equal(notifications, 1);
  unsubscribe();
});

test('invalid Draw is read-only and original quarantined data survives save and recovery', () => {
  const source = createDocument();
  source.layers[0].children.push({ id: 'bad', type: 'unknown', importantFutureData: ['keep'] });
  const state = createProjectDraw(source);
  assert.equal(state.document.readOnly, true);
  assert.match(state.warning, /original data.*preserved/);
  assert.ok(state.report.length);
  assert.deepEqual(state.snapshot(), source);
  assert.throws(() => state.history.execute(updateNode(state.document.data.layers[0].id, { name: 'Unsafe' })), /read-only/);
  assert.deepEqual(createProjectDraw(JSON.parse(JSON.stringify(state.snapshot()))).snapshot(), source);
});

test('unknown Draw versions are preserved verbatim with a compatibility warning', () => {
  const source = { version: 99, futureAssets: { special: 'base64' }, geometry: [1, 2, 3] };
  const state = createProjectDraw(source);
  assert.equal(state.document.readOnly, true);
  assert.match(state.warning, /cannot be edited in this version/);
  source.geometry.push(4);
  assert.deepEqual(state.snapshot().geometry, [1, 2, 3]);
});
