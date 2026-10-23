import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleAppearance, applySampleCommands, measure, groupSelectionTarget } from '../doc/tool-rules.mjs';
import { cutSubpath } from '../geom/path-commands.mjs';
import { createNode, createDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { appearance } from '../geometry.mjs';
import { measurementValue } from '../ui/measure-label.mjs';

const seg = (p, i = [0, 0], o = [0, 0]) => ({ p, in: i, out: o });
function setup() {
  const a = createNode('path', { id: 'a', appearance: appearance('#FF0000', '#0000FF', 2), opacity: .5, blendMode: 'multiply' });
  const b = createNode('path', { id: 'b', appearance: appearance(null, '#000000', .3) });
  const c = createNode('path', { id: 'c' }), inner = createNode('group', { id: 'inner', children: [c] }), outer = createNode('group', { id: 'outer', children: [inner] });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { id: 'L', children: [a, b, outer] })] }));
  return { doc, history: new History(doc) };
}

test('the Eyedropper copies fills, strokes, opacity and blending, also into groups', () => {
  const { doc, history } = setup(), sample = sampleAppearance(doc.getNode('a'));
  history.transaction('Eyedropper', () => applySampleCommands(doc, ['b', 'outer'], sample).forEach((c) => history.execute(c)));
  for (const id of ['b', 'c']) { const n = doc.getNode(id); assert.deepEqual(n.appearance, doc.getNode('a').appearance); assert.equal(n.opacity, .5); assert.equal(n.blendMode, 'multiply'); }
  assert.throws(() => sampleAppearance(doc.getNode('outer')), /samples paths/);
});

test('Measure gives distance, offsets and a counterclockwise angle', () => {
  assert.deepEqual(measure([0, 0], [3, -4]), { distance: 5, dx: 3, dy: -4, angle: 53.130102 });
  assert.equal(measure([0, 0], [-1, 0]).angle, 180); assert.equal(measure([1, 1], [1, 1]).distance, 0);
});

test('Measure formats distances in every supported document unit',()=>{
  for(const [mm,unit,expected] of [[25.4,'mm','25.40'],[25.4,'cm','2.54'],[25.4,'in','1.00'],[25.4,'px','96.00'],[25.4,'pt','72.00'],[25.4,'pc','6.00'],[0,'cm','0.00'],[-25.4,'in','-1.00']])
    assert.equal(measurementValue(mm,unit),expected);
});

test('Group Selection climbs one group level per click', () => {
  const { doc } = setup();
  assert.equal(groupSelectionTarget(doc, 'c', []), 'c');
  assert.equal(groupSelectionTarget(doc, 'c', ['c']), 'inner');
  assert.equal(groupSelectionTarget(doc, 'c', ['inner']), 'outer');
  assert.equal(groupSelectionTarget(doc, 'c', ['outer']), 'outer', 'stops below the layer');
  assert.equal(groupSelectionTarget(doc, 'c', ['inner'], 'outer'), 'inner', 'stays inside the isolated group');
});

test('Scissors opens a closed path at the cut and splits an open one in two', () => {
  const square = { closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map((p) => seg(p)) };
  const [opened] = cutSubpath(square, 0, .5);
  assert.equal(opened.closed, false); assert.deepEqual(opened.segments.map((s) => s.p), [[5, 0], [10, 0], [10, 10], [0, 10], [0, 0], [5, 0]]);
  const [atAnchor] = cutSubpath(square, 1, 0); assert.deepEqual(atAnchor.segments.map((s) => s.p), [[10, 0], [10, 10], [0, 10], [0, 0], [10, 0]]);
  const line = { closed: false, segments: [seg([0, 0]), seg([10, 0]), seg([20, 0])] };
  const parts = cutSubpath(line, 0, .5);
  assert.deepEqual(parts.map((p) => p.segments.map((s) => s.p)), [[[0, 0], [5, 0]], [[5, 0], [10, 0], [20, 0]]]);
  assert.deepEqual(cutSubpath(line, 0, 1).map((p) => p.segments.length), [2, 2], 'cut at the middle anchor');
  assert.throws(() => cutSubpath(line, 0, 0), /not at its end/);
  const curve = { closed: false, segments: [seg([0, 0], [0, 0], [0, 10]), seg([10, 0], [0, 10], [0, 0])] };
  const [left, right] = cutSubpath(curve, 0, .5); assert.deepEqual(left.segments.at(-1).p, [5, 7.5]); assert.deepEqual(right.segments[0].p, [5, 7.5]);
});
