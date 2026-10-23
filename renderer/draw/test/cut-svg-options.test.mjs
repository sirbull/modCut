import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { createNode } from '../doc/schema.mjs';
import { insertNode, updateDocument } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';
import { artboardCutSvg } from '../io/cut-svg.mjs';

const seg = (p) => ({ p, in: [0, 0], out: [0, 0] });
function setup(lines) {
  const doc = new DrawDocument(), history = new History(doc), layer = doc.data.layers[0].id, board = doc.data.artboards[0];
  for (const [points, color] of lines) history.execute(insertNode(layer, createNode('path', { subpaths: [{ closed: false, segments: points.map(([x, y]) => seg([board.x + x, board.y + y])) }], appearance: appearance(null, color, .2) })));
  const box = (id) => { const pts = doc.getNode(id).subpaths[0].segments.map((s) => s.p), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }; };
  return { doc, board, geometry: { bounds: box, worldMatrix: () => [1, 0, 0, 1, 0, 0], subpaths: (id) => doc.getNode(id).subpaths } };
}

test('duplicates are reported, and left out when asked', () => {
  const { doc, board, geometry } = setup([[[[10, 10], [20, 10]], '#FF0000'], [[[10, 10], [20, 10]], '#FF0000'], [[[10, 20], [20, 20]], '#FF0000']]);
  const kept = artboardCutSvg(doc, board.id, geometry);
  assert.equal(kept.count, 3); assert.equal(kept.duplicates, 1); assert.match(kept.warnings.join(' '), /cut twice/);
  const left = artboardCutSvg(doc, board.id, geometry, { dedupe: true });
  assert.equal(left.count, 2); assert.match(left.warnings.join(' '), /left out/);
});

test('tiny segments and the node count are reported', () => {
  const { doc, board, geometry } = setup([[[[10, 10], [10.02, 10], [20, 10]], '#000000']]);
  const result = artboardCutSvg(doc, board.id, geometry);
  assert.equal(result.tiny, 1); assert.equal(result.nodes, 3); assert.match(result.warnings.join(' '), /shorter than 0\.05 mm/);
});

test('outlined strokes are sent as filled areas, and cutting at the artboard uses the clip callback', () => {
  const { doc, board, geometry } = setup([[[[10, 10], [20, 10]], '#0000FF'], [[[-10, 30], [20, 30]], '#00FF00']]);
  const [first, second] = doc.data.layers[0].children.map((n) => n.id);
  const outlines = new Map([[first, [{ closed: true, segments: [[board.x + 10, board.y + 9.9], [board.x + 20, board.y + 9.9], [board.x + 20, board.y + 10.1], [board.x + 10, board.y + 10.1]].map(seg) }]]]);
  let clipped = 0;
  const clip = (subpaths) => { clipped++; return subpaths.map((s) => ({ ...s, segments: s.segments.map((g) => ({ ...g, p: [Math.max(board.x, g.p[0]), g.p[1]] })) })); };
  const result = artboardCutSvg(doc, board.id, { ...geometry, clip }, { outlines, clipToBoard: true });
  assert.match(result.svg, /fill="#0000ff" stroke="none"/);
  assert.equal(clipped, 1, 'Only the object past the edge is cut');
  assert.match(result.warnings.join(' '), /cut at the artboard edge/);
  assert.doesNotMatch(result.svg, /M-/);
});

test('images are sent as engraving rasters with centre, size and rotation on the artboard', () => {
  const doc = new DrawDocument(), history = new History(doc), layer = doc.data.layers[0].id, board = doc.data.artboards[0];
  history.execute(updateDocument({ assets: { a1: { mimeType: 'image/png', data: 'AAAA', width: 96, height: 48 } } }));
  const r = Math.SQRT1_2;
  history.execute(insertNode(layer, createNode('image', { assetId: 'a1', width: 20, height: 10, transform: [r, r, -r, r, board.x + 50, board.y + 20] })));
  const id = doc.data.layers[0].children[0].id;
  const result = artboardCutSvg(doc, board.id, { bounds: () => ({ x: board.x + 40, y: board.y + 20, width: 20, height: 20 }), worldMatrix: () => doc.getNode(id).transform, subpaths: () => [] });
  assert.equal(result.images.length, 1); assert.equal(result.count, 0);
  const [image] = result.images;
  assert.match(image.dataUrl, /^data:image\/png;base64,AAAA$/);
  assert.ok(Math.abs(image.width - 20) < 1e-9 && Math.abs(image.height - 10) < 1e-9);
  assert.ok(Math.abs(image.rotation - 45) < 1e-9);
  assert.ok(Math.abs(image.x - (50 + r * 10 - r * 5)) < 1e-9 && Math.abs(image.y - (20 + r * 10 + r * 5)) < 1e-9);
  assert.equal(result.warnings.length, 0);
});

test('all artboards go as one send laid out as in the document, leaving out art between them', async () => {
  const { insertArtboard } = await import('../doc/commands.mjs'), { createArtboard } = await import('../doc/schema.mjs');
  const { doc, board, geometry } = setup([[[[10, 10], [20, 10]], '#FF0000']]);
  const history = new History(doc);
  history.execute(insertArtboard(createArtboard({ x: board.x + board.width + 50, y: board.y, width: 100, height: 50 })));
  const second = doc.data.artboards[1], layer = doc.data.layers[0].id;
  history.execute(insertNode(layer, createNode('path', { subpaths: [{ closed: false, segments: [[second.x + 10, second.y + 10], [second.x + 30, second.y + 10]].map(seg) }], appearance: appearance(null, '#0000FF', .2) })));
  history.execute(insertNode(layer, createNode('path', { subpaths: [{ closed: false, segments: [[board.x + board.width + 10, board.y + 10], [board.x + board.width + 20, board.y + 10]].map(seg) }], appearance: appearance(null, '#00FF00', .2) })));
  const result = artboardCutSvg(doc, 'all', geometry);
  assert.equal(result.count, 2, 'The line between the artboards stays out');
  assert.match(result.svg, new RegExp(`width="${board.width + 50 + 100}mm"`));
  assert.match(result.svg, new RegExp(`M${board.width + 50 + 10} 10`), 'The second artboard keeps its place to the right');
});
