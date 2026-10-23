import test from 'node:test';
import assert from 'node:assert/strict';
import { envelopeMapping, envelopeSides, envelopeSubpaths } from '../geom/envelope.mjs';

const seg = (p, i = [0, 0], o = [0, 0]) => ({ p, in: i, out: o });
const rect = (x, y, w, h, reverse = false) => { const s = [seg([x, y]), seg([x + w, y]), seg([x + w, y + h]), seg([x, y + h])]; return { closed: true, segments: reverse ? s.reverse() : s }; };
const round = (p) => p.map((v) => Math.round(v * 1000) / 1000);
const box = { x: 0, y: 0, width: 10, height: 10 };

test('an envelope the shape of a box maps the artwork box onto it, whichever way the outline runs', () => {
  for (const reverse of [false, true]) {
    const map = envelopeMapping(box, rect(100, 50, 40, 20, reverse));
    assert.deepEqual(round(map([0, 0])), [100, 50]); assert.deepEqual(round(map([10, 10])), [140, 70]);
    assert.deepEqual(round(map([5, 5])), [120, 60]); assert.deepEqual(round(map([10, 0])), [140, 50]);
  }
});

test('the sides of a curved envelope are followed exactly; the inside blends between them', () => {
  // A box whose top bows up by 10 at its middle (a quadratic-like curve through the top anchor's handles).
  const arch = { closed: true, segments: [seg([0, 10]), seg([0, 0], [0, 0], [10, -13.333]), seg([30, 0], [-10, -13.333], [0, 0]), seg([30, 10])] };
  const sides = envelopeSides(arch);
  assert.deepEqual(round(sides.top(0)), [0, 0]); assert.deepEqual(round(sides.top(1)), [30, 0]);
  assert.ok(sides.top(.5)[1] < -9.9, `The top bows up: ${sides.top(.5)}`);
  assert.deepEqual(round(sides.bottom(.5)), [15, 10]);
  const map = envelopeMapping(box, arch);
  assert.ok(map([5, 0])[1] < -9.9); assert.deepEqual(round(map([5, 10])), [15, 10]);
  const top = envelopeSubpaths([{ closed: false, segments: [seg([0, 0]), seg([10, 0])] }], map, box)[0];
  assert.ok(top.segments.length >= 8, 'A straight line becomes a bent row of pieces');
  assert.ok(Math.min(...top.segments.map((s) => s.p[1])) < -9.5);
  assert.throws(() => envelopeSides({ closed: false, segments: arch.segments }), /closed path/);
});

test('an envelope group is valid with a path or shape on top, and not together with a clip, blend or mask', async () => {
  const { createDocument, createNode, validateDocument } = await import('../doc/schema.mjs');
  const art = createNode('path', { subpaths: [rect(0, 0, 10, 10)] }), top = createNode('shape', { shape: 'ellipse', params: { x: 0, y: 0, width: 20, height: 10 } });
  const doc = (group) => { const d = createDocument(); d.layers[0].children = [group]; return validateDocument(d); };
  assert.deepEqual(doc(createNode('group', { envelope: {}, children: [art, top] })), []);
  assert.match(doc(createNode('group', { envelope: {}, children: [top, createNode('group', { children: [] })] }))[0].message, /path or shape on top/);
  assert.match(doc(createNode('group', { envelope: {}, clip: true, children: [art, top] }))[0].message, /cannot also be/);
});

test('a warp envelope needs no shape on top, and its warp settings are checked', async () => {
  const { createDocument, createNode, validateDocument } = await import('../doc/schema.mjs');
  const art = createNode('path', { subpaths: [rect(0, 0, 10, 10)] });
  const doc = (group) => { const d = createDocument(); d.layers[0].children = [group]; return validateDocument(d); };
  const warp = { style: 'arch', bend: 50, horizontal: 0, vertical: 0, orientation: 'horizontal' };
  assert.deepEqual(doc(createNode('group', { envelope: { warp }, children: [art] })), []);
  assert.match(doc(createNode('group', { envelope: { warp: { ...warp, style: 'spiral' } }, children: [art] }))[0].message, /Invalid Warp/);
});
