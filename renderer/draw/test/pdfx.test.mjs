import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfDocument, PDF_PRESETS } from '../io/pdf.mjs';
import { labToRgb, pdfxProblems, rgbToLab, srgbOutputProfile } from '../io/pdfx.mjs';
import { normalizePdfOptions, pdfSummary } from '../ui/export-dialogs.mjs';

const square = { width: 40, height: 30, name: 'Card', warnings: [], layers: [{ name: 'Art', items: [{ type: 'path', opacity: .5, blend: 'multiply', fillRule: 'nonzero',
  fill: { rgb: [1, 0, 0], alpha: 1 }, stroke: null, subpaths: [{ closed: true, segments: [[5, 5], [35, 5], [35, 25], [5, 25]].map((p) => ({ p, in: [0, 0], out: [0, 0] })) }] }] }] };
const text = (bytes) => Buffer.from(bytes).toString('latin1');

test('sRGB and Lab convert both ways under D50', () => {
  assert.deepEqual(rgbToLab([1, 1, 1]).map((v) => Math.round(v * 100) / 100), [100, 0, 0]);
  assert.deepEqual(rgbToLab([0, 0, 0]).map((v) => Math.round(v)), [0, 0, 0]);
  for (const rgb of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [.2, .5, .8], [.9, .9, .1]])
    labToRgb(rgbToLab(rgb)).forEach((c, i) => assert.ok(Math.abs(c - rgb[i]) < 1e-4, `${rgb} round trip`));
  assert.ok(labToRgb([50, 120, -120]).some((c) => c < 0 || c > 1), 'Lab outside sRGB comes back out of range');
});

test('the output profile is a well formed ICC v2 output profile with Lab tables', () => {
  const icc = srgbOutputProfile(), view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength), sig = (at) => text(icc.slice(at, at + 4));
  assert.equal(view.getUint32(0), icc.length);
  assert.equal(view.getUint32(8), 0x02100000);
  assert.deepEqual([sig(12), sig(16), sig(20), sig(36)], ['prtr', 'RGB ', 'Lab ', 'acsp']);
  const count = view.getUint32(128), tags = {};
  for (let i = 0; i < count; i++) { const at = 132 + i * 12; tags[sig(at)] = { offset: view.getUint32(at + 4), size: view.getUint32(at + 8) }; }
  assert.deepEqual(Object.keys(tags).sort(), ['A2B0', 'B2A0', 'cprt', 'desc', 'gamt', 'wtpt']);
  for (const { offset, size } of Object.values(tags)) { assert.equal(offset % 4, 0); assert.ok(offset + size <= icc.length); }
  assert.equal(sig(tags.A2B0.offset), 'mft2');
  const a2b = tags.A2B0.offset, grid = icc[a2b + 10], clut = a2b + 52 + 2 * 2 * 3;
  assert.equal(tags.A2B0.size, 52 + 2 * 2 * 3 + grid ** 3 * 3 * 2 + 2 * 2 * 3);
  // The last grid point is RGB white: L 100 (0xFF00), a and b 0 (0x8000).
  const white = clut + (grid ** 3 - 1) * 6;
  assert.deepEqual([view.getUint16(white), view.getUint16(white + 2), view.getUint16(white + 4)], [0xFF00, 0x8000, 0x8000]);
});

test('PDF/X-4: output intent with the embedded profile, X-4 metadata, Trapped and trim box', async () => {
  const bytes = pdfDocument([{ model: square }], { ...PDF_PRESETS.find((p) => p.id === 'pdfx4').options, compress: (b) => new Uint8Array(deflateSync(b)), title: 'Card' });
  const raw = text(bytes);
  assert.ok(raw.startsWith('%PDF-1.6'));
  assert.match(raw, /\/OutputIntents \[<< \/Type \/OutputIntent \/S \/GTS_PDFX \/OutputConditionIdentifier \(Custom\) \/OutputCondition \(sRGB IEC61966-2.1\)/);
  assert.match(raw, /\/Trapped \/False/);
  assert.match(raw, /<pdfxid:GTS_PDFXVersion>PDF\/X-4<\/pdfxid:GTS_PDFXVersion>/);
  assert.match(raw, /<xmpMM:DocumentID>uuid:[0-9a-f-]{36}<\/xmpMM:DocumentID>/);
  assert.match(raw, /\/TrimBox/); assert.doesNotMatch(raw, /\/ArtBox|\/EmbeddedFiles|\/Font/);
  const profileId = raw.match(/\/DestOutputProfile (\d+) 0 R/)[1], body = raw.match(new RegExp(`\\n${profileId} 0 obj\\n<< /N 3 /Alternate /DeviceRGB /Filter /FlateDecode /Length (\\d+) >>\\nstream\\n`));
  assert.ok(body, 'The profile is an ICCBased stream');
  const start = body.index + body[0].length, icc = inflateSync(bytes.slice(start, start + Number(body[1])));
  assert.deepEqual(new Uint8Array(icc), srgbOutputProfile());
  const pdf = await getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false }).promise;
  assert.equal(pdf.numPages, 1);
  const { info } = await pdf.getMetadata(); assert.equal(info.Title, 'Card');
});

test('PDF/X-4 refuses attachments, page information and old compatibility', () => {
  assert.throws(() => pdfDocument([{ model: square }], { standard: 'x4', attachment: { name: 'a.json', bytes: new Uint8Array(1) } }), /attached files/);
  assert.throws(() => pdfDocument([{ model: square }], { standard: 'x4', marks: { pageInfo: true } }), /embedded fonts/);
  assert.throws(() => pdfDocument([{ model: square }], { standard: 'x4', version: '1.4' }), /PDF 1.6/);
  assert.deepEqual(pdfxProblems({ version: '1.7' }), []);
  const preset = PDF_PRESETS.find((p) => p.id === 'pdfx4').options;
  assert.equal(normalizePdfOptions(preset).standard, 'x4'); assert.equal(normalizePdfOptions(PDF_PRESETS[0].options).standard, 'none');
  const { lines, warnings } = pdfSummary({ ...preset, preserveEditing: true, range: 'all' }, [{}]);
  assert.ok(lines.includes('Standard: PDF/X-4:2008, sRGB output intent')); assert.ok(warnings.some((w) => /attached files/.test(w)));
});
