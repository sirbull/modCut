import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnchorPoints, removeAnchorPoints, reverseSubpaths, averagePoints, joinSubpaths, closeSubpath, cleanUpTargets, mapSubpath } from '../geom/path-commands.mjs';
import { createNode, createDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { appearance } from '../geometry.mjs';

const seg = (p, i = [0, 0], o = [0, 0]) => ({ p, in: i, out: o });
const open = (...points) => ({ closed: false, segments: points.map((p) => seg(p)) });

test('Add Anchor Points halves every segment, including the closing one, without changing curves', () => {
  const square = { closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map((p) => seg(p)) };
  const result = addAnchorPoints(square);
  assert.equal(result.segments.length, 8); assert.deepEqual(result.segments[1].p, [5, 0]); assert.deepEqual(result.segments[7].p, [0, 5]);
  const curve = { closed: false, segments: [seg([0, 0], [0, 0], [0, 10]), seg([10, 0], [0, 10], [0, 0])] };
  const split = addAnchorPoints(curve);
  assert.equal(split.segments.length, 3); assert.deepEqual(split.segments[1].p, [5, 7.5], 'the curve midpoint');
  assert.deepEqual(split.segments[0].out, [0, 5]); assert.deepEqual(split.segments[2].in, [0, 5]);
});

test('Remove Anchor Points keeps the path whole; Reverse runs it backwards', () => {
  const tri = { closed: true, segments: [[0, 0], [10, 0], [10, 10], [0, 10]].map((p) => seg(p)) };
  const [removed] = removeAnchorPoints([tri], [{ subpath: 0, segment: 1 }]);
  assert.equal(removed.closed, true); assert.deepEqual(removed.segments.map((s) => s.p), [[0, 0], [10, 10], [0, 10]]);
  const [rev] = reverseSubpaths([open([0, 0], [5, 0], [9, 3])]);
  assert.deepEqual(rev.segments.map((s) => s.p), [[9, 3], [5, 0], [0, 0]]);
});

test('Average lines points up on one axis or both', () => {
  assert.deepEqual(averagePoints([[0, 0], [10, 4]], 'horizontal'), [[0, 2], [10, 2]]);
  assert.deepEqual(averagePoints([[0, 0], [10, 4]], 'vertical'), [[5, 0], [5, 4]]);
  assert.deepEqual(averagePoints([[0, 0], [10, 4]]), [[5, 2], [5, 2]]);
  assert.throws(() => averagePoints([]), /Select anchor/);
});

test('Join connects the nearest ends with the right direction and merges coincident ends', () => {
  const a = open([0, 0], [10, 0]), b = open([20, 0], [12, 0]);
  const joined = joinSubpaths(a, b);
  assert.deepEqual(joined.segments.map((s) => s.p), [[0, 0], [10, 0], [12, 0], [20, 0]], 'B is reversed so the path runs one way');
  const touching = joinSubpaths(open([0, 0], [10, 0]), open([10, 0], [10, 10]));
  assert.deepEqual(touching.segments.map((s) => s.p), [[0, 0], [10, 0], [10, 10]], 'coincident ends become one anchor');
  const chosen = joinSubpaths(open([0, 0], [10, 0]), open([20, 0], [12, 0]), { a: 'start', b: 'start' });
  assert.deepEqual(chosen.segments.map((s) => s.p), [[10, 0], [0, 0], [20, 0], [12, 0]], 'chosen endpoints meet even when others are nearer');
  assert.throws(() => joinSubpaths({ closed: true, segments: a.segments }, b), /open paths/);
  const closed = closeSubpath(open([0, 0], [10, 0], [10, 10], [0, 0]));
  assert.equal(closed.closed, true); assert.equal(closed.segments.length, 3);
});

test('paths can be mapped to another coordinate space', () => {
  assert.deepEqual(mapSubpath({ closed: false, segments: [seg([1, 2], [1, 0], [0, 1])] }, [2, 0, 0, 2, 10, 0]).segments[0], { p: [12, 4], in: [2, 0], out: [0, 2] });
});

test('Clean Up finds stray points, unpainted objects and empty text, but not clipping paths', () => {
  const stray = createNode('path', { id: 'stray', subpaths: [{ closed: false, segments: [seg([0, 0])] }], appearance: appearance(null, '#000000', 1) });
  const bare = createNode('path', { id: 'bare', subpaths: [open([0, 0], [1, 1])], appearance: appearance(null, null) });
  const fine = createNode('path', { id: 'fine', subpaths: [open([0, 0], [1, 1])], appearance: appearance(null, '#000000', 1) });
  const empty = createNode('text', { id: 'empty', content: { runs: [{ text: '  ' }] } });
  const mask = createNode('path', { id: 'mask', subpaths: [open([0, 0], [1, 1], [0, 1])], appearance: appearance(null, null) });
  const clip = createNode('group', { clip: true, children: [createNode('path', { subpaths: [open([0, 0], [2, 2])], appearance: appearance('#FF0000', null) }), mask] });
  const doc = new DrawDocument(createDocument({ layers: [createNode('layer', { children: [stray, bare, fine, empty, clip] })] }));
  assert.deepEqual(cleanUpTargets(doc).sort(), ['bare', 'empty', 'stray']);
});
