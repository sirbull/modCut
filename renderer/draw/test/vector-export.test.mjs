import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import paper from 'paper';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { artworkModel, flattenSubpath, modelBounds } from '../io/vector-model.mjs';
import { pdfDocument, pdfString, pageMargins } from '../io/pdf.mjs';
import { epsDocument } from '../io/eps.mjs';
import { AI_OPTIONS, aiMetadata, hasTransparency } from '../io/ai.mjs';
import { dxfDocument, aciColor, dxfLayerNames } from '../io/dxf.mjs';

const board = { x: 10, y: 20, width: 100, height: 50, name: 'Front' };
function artwork() {
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(200, 200));
  const root = new scope.Group({ insert: false });
  const cut = new scope.Group({ insert: false }); cut.data.nodeId = 'layer-cut';
  const rect = new scope.Path.Rectangle({ point: [20, 30], size: [40, 20], insert: false });
  rect.strokeColor = new scope.Color(1, 0, 0); rect.strokeWidth = .5; rect.dashArray = [2, 1];
  const circle = new scope.Path.Circle({ center: [80, 45], radius: 5, insert: false });
  circle.fillColor = new scope.Color(0, 0, 1, .5);
  cut.addChildren([rect, circle]);
  const engrave = new scope.Group({ insert: false }); engrave.data.nodeId = 'layer-engrave'; engrave.opacity = .4;
  const ring = new scope.CompoundPath({ children: [new scope.Path.Circle({ center: [40, 60], radius: 6, insert: false }), new scope.Path.Circle({ center: [40, 60], radius: 3, insert: false })], insert: false });
  ring.fillColor = new scope.Color(0, .5, 0); ring.fillRule = 'evenodd'; ring.blendMode = 'multiply';
  engrave.addChild(ring);
  root.addChildren([cut, engrave]);
  return root;
}
const names = { 'layer-cut': 'Cut lines', 'layer-engrave': 'Engrave' };
const model = () => artworkModel(artwork(), board, { layerName: (id) => names[id] });

test('the vector model is in artboard millimetres with layers, paint and curves', () => {
  const m = model();
  assert.deepEqual(m.layers.map((l) => l.name), ['Cut lines', 'Engrave']);
  const [rect, circle] = m.layers[0].items[0].children;
  assert.deepEqual(rect.subpaths[0].segments[0].p.map(Math.round), [10, 30]);
  assert.deepEqual(rect.stroke.rgb, [1, 0, 0]); assert.equal(rect.stroke.width, .5); assert.deepEqual(rect.stroke.dash, [2, 1]); assert.equal(rect.fill, null);
  assert.equal(circle.fill.alpha, .5); assert.equal(circle.subpaths[0].closed, true);
  assert.notDeepEqual(circle.subpaths[0].segments[0].out, circle.subpaths[0].segments[0].p, 'Curves keep their handles');
  const group = m.layers[1].items[0];
  assert.equal(group.opacity, .4); assert.equal(group.children[0].fillRule, 'evenodd'); assert.equal(group.children[0].blend, 'multiply');
  assert.deepEqual(modelBounds(m).map(Math.round), [10, 10, 75, 46]);
});

test('curves flatten within the tolerance', () => {
  const circle = model().layers[0].items[0].children[1].subpaths[0];
  const points = flattenSubpath(circle, .01);
  assert.ok(points.length > 32);
  for (const [x, y] of points) assert.ok(Math.abs(Math.hypot(x - 70, y - 25) - 5) < .02, 'Every point lies on the circle');
});

test('PDF: one page per artboard, mm page size, curves, transparency, layers and embedded document', async () => {
  const bytes = pdfDocument([{ model: model() }, { model: { ...model(), name: 'Back' } }], { compress: (b) => new Uint8Array(deflateSync(b)), title: 'Logo', layers: true,
    attachment: { name: 'Logo.modcut-draw.json', bytes: new TextEncoder().encode('{"a":1}'), mime: 'application/json' } });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), '%PDF-1.6');
  const pdf = await getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false }).promise;
  assert.equal(pdf.numPages, 2);
  const page = await pdf.getPage(1), [x0, y0, x1, y1] = page.view;
  assert.ok(Math.abs(x1 - x0 - 100 * 72 / 25.4) < .01 && Math.abs(y1 - y0 - 50 * 72 / 25.4) < .01, 'Page is the artboard size');
  const config = await pdf.getOptionalContentConfig();
  assert.deepEqual([...config].map(([, group]) => group.name), ['Cut lines', 'Engrave']);
  const attachments = await pdf.getAttachments();
  assert.equal(new TextDecoder().decode(attachments['Logo.modcut-draw.json'].content), '{"a":1}');
  assert.equal((await pdf.getMetadata()).info.Title, 'Logo');
  const ops = await page.getOperatorList();
  assert.ok(ops.fnArray.length > 10, 'Page has drawing operators');
  await pdf.destroy();
});

test('PDF bleed and marks enlarge the media box around the trim box', async () => {
  const marks = { trim: true, registration: true, pageInfo: true, offset: 2, weight: .25 }, bleed = { top: 3, bottom: 3, left: 3, right: 3 };
  const { margin } = pageMargins({ marks, bleed });
  assert.equal(margin.left, 3 + 5 + 1); assert.equal(margin.bottom, 3 + 5 + 4);
  const bytes = pdfDocument([{ model: model() }], { compress: null, marks, bleed, version: '1.4', layers: true });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.match(text, /\/TrimBox \[25\.5118 34\.0157 308\.9764 175\.748\]/);
  assert.match(text, /\/Helvetica/); assert.doesNotMatch(text, /OCProperties/, 'PDF 1.4 has no layers');
  const pdf = await getDocument({ data: bytes }).promise;
  assert.equal(pdf.numPages, 1); await pdf.destroy();
});

test('PDF images carry an alpha soft mask', async () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]);
  const m = { width: 10, height: 10, name: '', layers: [{ name: 'Art', items: [{ type: 'image', opacity: 1, blend: 'normal', matrix: [4, 0, 0, 2, 1, 1], width: 2, height: 1, rgba }] }], warnings: [] };
  const bytes = pdfDocument([{ model: m }], { compress: (b) => new Uint8Array(deflateSync(b)) });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.match(text, /\/SMask \d+ 0 R/);
  const pdf = await getDocument({ data: bytes }).promise; await pdf.getPage(1); await pdf.destroy();
});

test('PDF strings handle non-ASCII as UTF-16', () => {
  assert.equal(pdfString('A (b)'), '(A \\(b\\))');
  assert.equal(pdfString('Å'), '<FEFF00C5>');
});

test('EPS keeps curves in points and warns about transparency', () => {
  const { text, warnings } = epsDocument(model());
  assert.match(text, /^%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 284 142\n/);
  assert.match(text, / c\b/); assert.match(text, /eofill/); assert.match(text, /\[2 1\] 0 setdash stroke/);
  assert.ok(warnings.some((w) => /no transparency/.test(w)));
});

test('DXF writes R12 polylines per layer in millimetres with y up', () => {
  const { text, count } = dxfDocument(model());
  assert.equal(count, 4);
  assert.match(text, /AC1009/); assert.match(text, /\r\nCUT_LINES\r\n/); assert.match(text, /\r\nENGRAVE\r\n/);
  // The rectangle's top-left (10, 10 from the artboard top) is y = 40 from the bottom.
  assert.match(text, /VERTEX\r\n8\r\nCUT_LINES\r\n10\r\n10\r\n20\r\n40\r\n/);
  assert.equal(aciColor([1, 0, 0]), 1); assert.equal(aciColor([0, 0, 0]), 7); assert.equal(aciColor(null), 7);
  assert.deepEqual(dxfLayerNames(['A b', 'A b', '']), ['A_B', 'A_B_2', 'LAYER']);
});

test('AI: a PDF compatible Illustrator file with XMP, art box, layers and the Draw document', async () => {
  const m = model(), metadata = aiMetadata({ title: 'Logo & Co', pages: [board], transparency: hasTransparency([m]), now: new Date('2026-10-17T10:00:00Z') });
  assert.match(metadata, /<illustrator:Type>Document<\/illustrator:Type>/); assert.match(metadata, /Logo &amp; Co/);
  assert.match(metadata, /<xmpTPg:HasVisibleTransparency>True</); assert.match(metadata, /<stDim:w>100<\/stDim:w>/);
  assert.equal(hasTransparency([{ layers: [{ items: [{ type: 'path', opacity: 1, blend: 'normal' }] }] }]), false);
  const bytes = pdfDocument([{ model: m }], { ...AI_OPTIONS, compress: (b) => new Uint8Array(deflateSync(b)), title: 'Logo', metadata, artBox: true,
    attachment: { name: 'modcut-draw.json', bytes: new TextEncoder().encode('{"a":1}'), mime: 'application/json' } });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.match(text, /\/ArtBox \[/); assert.match(text, /\/Metadata \d+ 0 R/); assert.match(text, /illustrator:Type/, 'The XMP is stored uncompressed');
  const pdf = await getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false }).promise;
  assert.equal((await pdf.getMetadata()).metadata.get('xmp:creatortool'), 'modCut Draw');
  assert.deepEqual([...(await pdf.getOptionalContentConfig())].map(([, group]) => group.name), ['Cut lines', 'Engrave']);
  assert.ok((await pdf.getAttachments())['modcut-draw.json']);
  await pdf.destroy();
});
