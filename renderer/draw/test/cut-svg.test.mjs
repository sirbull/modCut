import test from 'node:test';
import assert from 'node:assert/strict';
import { createNode, createDocument } from '../doc/schema.mjs';
import { DrawDocument } from '../doc/document.mjs';
import { appearance } from '../geometry.mjs';
import { artboardCutSvg, pathData } from '../io/cut-svg.mjs';

const square = (x, y, s, closed = true) => [{ closed, segments: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) }];
function setup() {
  const red = createNode('path', { id: 'red', subpaths: square(10, 10, 20), appearance: appearance(null, '#FF0000', .1) });
  const filled = createNode('path', { id: 'filled', subpaths: square(0, 0, 5), appearance: appearance('#000000', '#0000FF', .5) });
  const off = createNode('path', { id: 'off', subpaths: square(500, 500, 5), appearance: appearance(null, '#FF0000', 1) });
  const image = createNode('image', { id: 'img', assetId: 'a' });
  const hidden = createNode('path', { id: 'hid', visible: false, subpaths: square(1, 1, 1), appearance: appearance(null, '#FF0000', 1) });
  const template = createNode('layer', { id: 'T', template: true, children: [createNode('path', { id: 'ref', subpaths: square(1, 1, 1), appearance: appearance(null, '#00FF00', 1) })] });
  const doc = new DrawDocument(createDocument({ artboards: [{ id: 'B', name: 'Board', x: 5, y: 5, width: 100, height: 50, background: '#FFFFFF' }],
    layers: [template, createNode('layer', { id: 'L', children: [red, createNode('group', { id: 'G', transform: [2, 0, 0, 2, 40, 0], children: [filled] }), off, image, hidden] })], assets: { a: { mimeType: 'image/png', data: '', width: 1, height: 1 } } }));
  const worlds = { red: [1, 0, 0, 1, 0, 0], filled: [2, 0, 0, 2, 40, 0], off: [1, 0, 0, 1, 0, 0] };
  const geometry = {
    worldMatrix: (id) => worlds[id] ?? [1, 0, 0, 1, 0, 0],
    bounds: (id) => ({ red: { x: 10, y: 10, width: 20, height: 20 }, filled: { x: 40, y: 0, width: 10, height: 10 }, off: { x: 500, y: 500, width: 5, height: 5 }, ref: { x: 1, y: 1, width: 1, height: 1 } })[id],
    subpaths: (id) => doc.getNode(id).subpaths,
  };
  return { doc, geometry };
}

test('an artboard becomes a millimetre SVG of plain paths in artboard coordinates', () => {
  const { doc, geometry } = setup();
  const { svg, count, warnings, skipped } = artboardCutSvg(doc, 'B', geometry);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="100mm" height="50mm" viewBox="0 0 100 50">/);
  assert.equal(count, 2, 'red outline and the filled square; template, hidden and off-board objects are left out');
  assert.match(svg, /<path d="M5 5L25 5L25 25L5 25L5 5Z" fill="none" stroke="#ff0000" stroke-width="0.1"\/>/, 'shifted by the artboard origin');
  assert.match(svg, /d="M35 -5L45 -5L45 5L35 5L35 -5Z" fill="#000000" stroke="#0000ff" stroke-width="1"/, 'transform applied, stroke scaled');
  assert.deepEqual(skipped, { images: 1, outside: 1, empty: 0 });
  assert.ok(warnings.some((w) => /image/.test(w))); assert.ok(warnings.some((w) => /past the artboard/.test(w)));
  assert.throws(() => artboardCutSvg(doc, 'nope', geometry), /Choose an artboard/);
});

test('curves become cubic commands and open paths stay open', () => {
  const d = pathData([{ closed: false, segments: [{ p: [0, 0], in: [0, 0], out: [1, 0] }, { p: [2, 2], in: [0, -1], out: [0, 0] }] }], [1, 0, 0, 1, 0, 0]);
  assert.equal(d, 'M0 0C1 0 2 1 2 2');
});

test('copied objects become a cut SVG for pasting in Cut, sent whole wherever they are', () => {
  const { doc, geometry } = setup();
  const { count, svg, skipped, warnings } = artboardCutSvg(doc, 'B', geometry, { only: new Set(['G', 'off']) });
  assert.equal(count, 2, 'the group child and the off-board path; red is not copied');
  assert.doesNotMatch(svg, /stroke-width="0.1"/);
  assert.match(svg, /d="M495 495/, 'off-board objects keep their position relative to the artboard');
  assert.equal(skipped.outside, 0); assert.ok(!warnings.some((w) => /past the artboard/.test(w)));
});
