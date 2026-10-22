import test from 'node:test';
import assert from 'node:assert/strict';
import { addFreeformPoint, defaultFreeform, freeformColorAt, freeformCss, freeformFrom, freeformPixels, insertLinePoint, isFreeform, lineSegments,
  removeFreeformPoint, setFreeformMode, stopsFromFreeform, updateFreeformPoint } from '../doc/freeform.mjs';
import { changeGradient, colorHex, defaultGradient, gradientHex, isAnyGradient, isGradient } from '../doc/gradient.mjs';
import { appearance } from '../geometry.mjs';
import { createDocument, createNode, validateDocument } from '../doc/schema.mjs';

const box = { x: 0, y: 0, width: 100, height: 60 };
const soft = (Math.hypot(100, 60) * .1) ** 2;
const hex = (c) => '#' + c.values.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const two = () => updateFreeformPoint(updateFreeformPoint({ type: 'freeform', mode: 'points', points: [{ position: [10, 30], color: { space: 'rgb', values: [1, 0, 0] } }, { position: [90, 30], color: { space: 'rgb', values: [0, 0, 1] } }], lines: [] }, 0, {}), 1, {});

test('default freeform: four points inset in the box, from given colours', () => {
  const g = defaultFreeform(box);
  assert.ok(isFreeform(g) && isAnyGradient(g) && !isGradient(g));
  assert.deepEqual(g.points.map((p) => p.position), [[15, 9], [85, 9], [85, 51], [15, 51]]);
  const from = freeformFrom(defaultGradient(box), box);
  assert.equal(colorHex(from.points[0].color), '#FFFFFF'); assert.equal(colorHex(from.points[3].color), '#000000');
  assert.equal(gradientHex(from), '#FFFFFF');
  assert.deepEqual(stopsFromFreeform(from).map((s) => colorHex(s.color)), ['#FFFFFF', '#000000']);
  assert.match(freeformCss(g), /^radial-gradient\(circle at 15% 15%/);
});

test('colours blend between points, and spread keeps a point solid around it', () => {
  const g = two();
  const near = freeformColorAt(g, [12, 30], { soft }), mid = freeformColorAt(g, [50, 30], { soft });
  assert.ok(near.values[0] > .9 && near.values[2] < .1, `near red: ${near.values}`);
  assert.ok(Math.abs(mid.values[0] - mid.values[2]) < 1e-9, 'equal halfway');
  const wide = updateFreeformPoint(g, 0, { spread: 30 }), solid = freeformColorAt(wide, [35, 30], { soft });
  assert.ok(solid.values[0] > .95, `inside the spread it is nearly pure red: ${solid.values}`);
  assert.ok(freeformColorAt(wide, [60, 30], { soft }).values[0] > freeformColorAt(g, [60, 30], { soft }).values[0], 'the spread pushes red further');
  const faded = updateFreeformPoint(g, 1, { opacity: 0 });
  assert.ok(freeformColorAt(faded, [90, 30], { soft }).alpha < .1, 'per-point opacity');
  assert.equal(updateFreeformPoint(g, 0, { spread: 0 }).points[0].spread, undefined);
  assert.throws(() => updateFreeformPoint(g, 0, { spread: -1 }), /spread/);
  assert.throws(() => updateFreeformPoint(g, 5, {}), /Choose a point/);
});

test('lines: smooth curves through their points carry the colour along them', () => {
  let g = setFreeformMode(two(), 'lines');
  ({ gradient: g } = addFreeformPoint(g, [50, 50], box, { after: 0 }));
  assert.deepEqual(g.lines, [[0, 2]], 'a new point starts a line from the selected one');
  ({ gradient: g } = addFreeformPoint(g, [90, 10], box, { after: 2 }));
  assert.deepEqual(g.lines, [[0, 2, 3]], 'and continues it');
  g = updateFreeformPoint(g, 2, { color: '#00FF00' });
  const segments = lineSegments(g, 8); assert.equal(segments.length, 16);
  assert.deepEqual(segments[0].a, [10, 30]); assert.deepEqual(segments.at(-1).b, [90, 10]);
  const onLine = freeformColorAt(g, segments[8].a, { soft: 1, segments });
  assert.ok(onLine.values[1] > .8, `green where the line passes its point: ${onLine.values}`);
  assert.deepEqual(lineSegments(setFreeformMode(g, 'points')), [], 'Points mode ignores the lines');
  const inserted = insertLinePoint(g, 2, 3, [70, 30], box);
  assert.deepEqual(inserted.gradient.lines, [[0, 2, 4, 3]]);
  const removed = removeFreeformPoint(inserted.gradient, 2);
  assert.deepEqual(removed.lines, [[0, 3, 2]], 'removing closes the gap and renumbers');
  assert.throws(() => removeFreeformPoint({ ...g, points: g.points.slice(0, 1), lines: [] }, 0), /at least one point/);
});

test('pixels and validation', () => {
  const g = two(), px = freeformPixels(g, box, 50);
  assert.deepEqual([px.width, px.height, px.data.length], [50, 30, 50 * 30 * 4]);
  assert.ok(px.data[(15 * 50 + 2) * 4] > 200 && px.data[(15 * 50 + 47) * 4 + 2] > 200, 'red left, blue right');
  const look = changeGradient(appearance('#FF0000', null), 'fill', setFreeformMode(g, 'lines'));
  const doc = (l) => createDocument({ layers: [createNode('layer', { children: [createNode('path', { appearance: l })] })] });
  assert.deepEqual(validateDocument(doc(look)), []);
  look.fills[0].paint.lines = [[0, 7]];
  assert.ok(validateDocument(doc(look)).some((e) => /lines/.test(e.path)));
  look.fills[0].paint.lines = []; look.fills[0].paint.points = [];
  assert.ok(validateDocument(doc(look)).some((e) => /points/.test(e.path)));
});
