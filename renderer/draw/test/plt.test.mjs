import test from 'node:test';
import assert from 'node:assert/strict';
import { pltDocument } from '../io/plt.mjs';
import { hpglToSvg } from '../../hpglimport.js';

const square = (x, y, s, rgb) => ({ type: 'path', opacity: 1, blend: 'normal', fill: null, stroke: { rgb, width: .1 }, subpaths: [{ closed: true, segments: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map((p) => ({ p, in: p, out: p })) }] });
const model = { width: 100, height: 50, warnings: [], layers: [{ name: 'Cut', items: [square(10, 10, 20, [1, 0, 0]), square(50, 10, 10, [0, 0, 1]), square(70, 10, 5, [1, 0, 0])] }] };

test('PLT: 40 units per mm, y up, one pen per colour, closed shapes return to the start', () => {
  const { text, count, pens } = pltDocument(model);
  assert.equal(count, 3); assert.equal(pens, 2);
  assert.match(text, /^IN;\nPA;\nSP1;\nPU400,1600;\nPD1200,1600,1200,800,400,800,400,1600;/);
  assert.equal((text.match(/SP2;/g) ?? []).length, 1); assert.match(text, /SP1;\nPU2800,1600;/, 'Back to pen 1 for the third square');
  assert.match(text, /PU;\nSP0;\n$/);
});
test('PLT round trip through the HP-GL importer keeps sizes in mm', () => {
  const svg = hpglToSvg(pltDocument(model).text).svgText ?? hpglToSvg(pltDocument(model).text);
  assert.match(String(svg), /<svg/);
  assert.match(String(svg), /width="65(\.0+)?mm"|viewBox="[\d.\- ]*65/, 'From x 10 to 75 mm');
});
