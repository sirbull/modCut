import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFileName, rasterSize, svgDocument, svgInner } from '../io/export.mjs';

test('export file names use the document and artboard names without unsafe characters', () => {
  assert.equal(exportFileName('Logo', { name: 'Artboard 1' }, 'svg'), 'Logo-Artboard 1.svg');
  assert.equal(exportFileName('a/b:c', { name: 'x?y' }, 'png', { single: true }), 'a b c.png');
  assert.equal(exportFileName('', null, 'jpg'), 'Untitled.jpg');
});

test('raster size follows the artboard in millimetres and refuses oversized images', () => {
  assert.deepEqual(rasterSize({ width: 25.4, height: 50.8 }, 300), { width: 300, height: 600 });
  assert.throws(() => rasterSize({ width: 2000, height: 10 }, 600), /lower resolution/);
  assert.throws(() => rasterSize({ width: 10, height: 10 }, 0), /resolution/);
});

test('an SVG document is sized in millimetres with an optional background', () => {
  const svg = svgDocument({ width: 100, height: 50.25 }, '<path d="M0 0"/>', { background: '#FFFFFF', title: 'A & B' });
  assert.match(svg, /width="100mm" height="50.25mm" viewBox="0 0 100 50.25"/);
  assert.match(svg, /<title>A &amp; B<\/title>/); assert.match(svg, /<rect width="100" height="50.25" fill="#FFFFFF"\/>/);
  assert.equal(svgInner('<svg x="1"><g/>\n</svg>'), '<g/>');
});
