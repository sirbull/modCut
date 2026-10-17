import assert from 'node:assert/strict';
import test from 'node:test';
import { changeStroke } from '../doc/paint.mjs';
import { arrowShapes } from '../geom/arrows.mjs';
import { appearance } from '../geometry.mjs';
import { createDocument, createNode, validateDocument } from '../doc/schema.mjs';

const defaults = { stroke: '#071411', strokeWidth: .5 };

test('Stroke panel edits are validated and keep other strokes', () => {
  const base = appearance('#FFFFFF', '#071411', .5);
  let next = changeStroke(base, { width: 2, cap: 'square', join: 'bevel', miterLimit: 10 }, defaults);
  assert.deepEqual([next.strokes[0].width, next.strokes[0].cap, next.strokes[0].join, next.strokes[0].miterLimit], [2, 'square', 'bevel', 10]);
  assert.equal(base.strokes[0].width, .5, 'The original is not mutated');
  next = changeStroke(next, { dash: [2, 1, '', null] }, defaults);
  assert.deepEqual(next.strokes[0].dash, { array: [2, 1], offset: 0 });
  assert.equal(changeStroke(next, { dash: null }, defaults).strokes[0].dash, undefined);
  next = changeStroke(next, { startArrow: { type: 'triangle', scale: 1.5 }, endArrow: { type: 'bar', scale: 1 } }, defaults);
  assert.deepEqual(next.strokes[0].startArrow, { type: 'triangle', scale: 1.5 });
  assert.equal(changeStroke(next, { endArrow: null }, defaults).strokes[0].endArrow, undefined);
  const noStroke = changeStroke(appearance('#FFFFFF', null), { width: 1 }, defaults);
  assert.equal(noStroke.strokes.length, 1, 'A stroke is created from the default color');
  assert.throws(() => changeStroke(appearance('#FFFFFF', null), { width: 1 }, { stroke: null }), /stroke color/);
  for (const [props, message] of [[{ width: -1 }, /Weight/], [{ cap: 'flat' }, /cap/], [{ join: 'x' }, /corner/], [{ miterLimit: .5 }, /Limit/],
    [{ dash: [0, 0] }, /greater than zero/], [{ dash: [1, -1] }, /zero or more/], [{ dash: [1, 1, 1, 1, 1, 1, 1] }, /zero or more/],
    [{ startArrow: { type: 'triangle', scale: 0 } }, /scale/], [{ endArrow: { type: 'star', scale: 1 } }, /scale/], [{ align: 'inside' }, /Unsupported/]]) {
    assert.throws(() => changeStroke(base, props, defaults), message);
  }
  const doc = createDocument({ layers: [createNode('layer', { children: [createNode('path', { appearance: next })] })] });
  assert.deepEqual(validateDocument(doc), []);
  doc.layers[0].children[0].appearance.strokes[0].startArrow = { type: 'star', scale: 1 };
  doc.layers[0].children[0].appearance.strokes[0].dash = { array: [-1] };
  assert.deepEqual(validateDocument(doc).map((e) => e.path.split('.').slice(-2).join('.')).sort(), ['array.0', 'startArrow.type']);
});

test('arrowheads extend from the path end along the outward tangent', () => {
  const close = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));
  const [triangle] = arrowShapes([10, 0], [2, 0], 1, { type: 'triangle', scale: 1 });
  assert.equal(triangle.kind, 'polygon'); close(triangle.points[0], [12, 0]); close(triangle.points[1], [8, 1.8]);
  close(arrowShapes([0, 0], [0, -1], 1, { type: 'arrow', scale: 1 })[0].points[1], [0, -2]);
  assert.deepEqual(arrowShapes([1, 1], [1, 0], 1, { type: 'circle', scale: 2 }), [{ kind: 'circle', center: [1, 1], radius: 2.8 }]);
  assert.equal(arrowShapes([0, 0], [1, 0], 1, { type: 'square', scale: 1 })[0].points.length, 4);
  close(arrowShapes([0, 0], [1, 0], 1, { type: 'bar', scale: 1 })[0].points[0], [0, 2]);
  assert.deepEqual(arrowShapes([0, 0], [0, 0], 1, { type: 'bar', scale: 1 }), []);
  assert.deepEqual(arrowShapes([0, 0], [1, 0], 1, null), []);
  assert.throws(() => arrowShapes([0, 0], [1, 0], 1, { type: 'star', scale: 1 }), /Unknown/);
});
test('width profiles are stored sorted, a uniform one is removed, and the schema checks them', () => {
  const base = appearance(null, '#071411', 1);
  const next = changeStroke(base, { widthProfile: [{ t: 1, left: 0, right: 0 }, { t: 0, left: .5, right: .5 }] }, defaults);
  assert.deepEqual(next.strokes[0].widthProfile.map((p) => p.t), [0, 1]);
  assert.equal(changeStroke(next, { widthProfile: [{ t: 0, left: .5, right: .5 }] }, defaults).strokes[0].widthProfile, undefined);
  assert.equal(changeStroke(next, { widthProfile: null }, defaults).strokes[0].widthProfile, undefined);
  const doc = createDocument({ layers: [createNode('layer', { children: [createNode('path', { appearance: next })] })] });
  assert.deepEqual(validateDocument(doc), []);
  doc.layers[0].children[0].appearance.strokes[0].widthProfile[0].t = 2;
  assert.match(validateDocument(doc)[0].path, /widthProfile\.0\.t$/);
});
