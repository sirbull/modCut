/**
 * PDF/X-4 (D5): what pdf.mjs adds for a PDF/X-4:2008 file. The artwork stays DeviceRGB with live
 * transparency and layers, so the output intent is an RGB output profile: sRGB written as an ICC v2
 * output ('prtr') profile with Lab lookup tables, built here so no profile file has to ship. The XMP
 * packet carries the PDF/X version and the identifiers the standard asks for. Pure.
 */
export const PDFX_CONDITION = 'sRGB IEC61966-2.1';
export const PDFX_PROFILE_NAME = 'modCut sRGB output (ICC v2)';

const D50 = [0.9642, 1, 0.8249];
const TO_XYZ = [[0.4360747, 0.3850649, 0.1430804], [0.2225045, 0.7168786, 0.0606169], [0.0139322, 0.0971045, 0.7141733]];
// White for Lab: the sRGB matrix's own white, so RGB white is exactly L 100, a 0, b 0.
const WHITE = [0.96422, 1, 0.82521];
const TO_RGB = [[3.1338561, -1.6168667, -0.4906146], [-0.9787684, 1.9161415, 0.033454], [0.0719453, -0.2289914, 1.4052427]];
const linear = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gamma = (c) => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const times = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** sRGB (0..1) to CIE Lab under D50. */
export function rgbToLab(rgb) {
  const [x, y, z] = times(TO_XYZ, rgb.map(linear)).map((v, i) => v / WHITE[i]);
  const f = (t) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
/** CIE Lab (D50) to unclamped sRGB, so callers can tell when a colour is out of gamut. */
export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const g = (t) => t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);
  const xyz = [g(fx), L > 8 ? fy ** 3 : L / (24389 / 27), g(fz)].map((v, i) => v * WHITE[i]);
  return times(TO_RGB, xyz).map((c) => c < 0 ? -gamma(-c) : gamma(c));
}

/** Bytes of a big-endian ICC file built from parts. */
function writer() {
  const parts = []; let length = 0;
  const api = {
    u8: (...v) => { parts.push(Uint8Array.from(v)); length += v.length; return api; },
    u16: (v) => api.u8((v >> 8) & 255, v & 255),
    u32: (v) => api.u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255),
    s15: (v) => api.u32(Math.round(v * 65536) >>> 0),
    sig: (text) => api.u8(...[...text.padEnd(4)].map((c) => c.charCodeAt(0))),
    bytes: (b) => { parts.push(b); length += b.length; return api; },
    pad: () => { while (length % 4) api.u8(0); return api; },
    get length() { return length; },
    done: () => { const out = new Uint8Array(length); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; },
  };
  return api;
}
const ascii = (text) => Uint8Array.from([...text].map((c) => c.charCodeAt(0) & 127));
function textDescription(text) {
  const w = writer().sig('desc').u32(0).u32(text.length + 1).bytes(ascii(text)).u8(0).u32(0).u32(0).u16(0).u8(0);
  return w.bytes(new Uint8Array(67)).done();
}
/** A lut16Type tag: `fn` maps grid inputs (0..1 each) to outputs (0..1 each); tables are linear. */
function lut16(inputs, outputs, grid, fn) {
  const w = writer().sig('mft2').u32(0).u8(inputs, outputs, grid, 0);
  for (const v of [1, 0, 0, 0, 1, 0, 0, 0, 1]) w.s15(v);
  w.u16(2).u16(2);
  for (let i = 0; i < inputs; i++) w.u16(0).u16(65535);
  const point = new Array(inputs).fill(0), total = grid ** inputs;
  for (let n = 0; n < total; n++) {
    // The first input varies slowest.
    for (let i = 0, rest = n; i < inputs; i++) { const k = grid ** (inputs - 1 - i); point[i] = Math.floor(rest / k) / (grid - 1); rest %= k; }
    for (const v of fn(point)) w.u16(Math.round(clamp(v, 0, 1) * 65535));
  }
  for (let i = 0; i < outputs; i++) w.u16(0).u16(65535);
  return w.done();
}
// ICC v2 16-bit Lab: L 0..100 is 0..0xFF00, a and b -128..127.996 are 0..0xFFFF.
const decodeLab = ([l, a, b]) => [l * 65535 * 100 / 65280, a * 65535 / 256 - 128, b * 65535 / 256 - 128];
const encodeLab = ([L, a, b]) => [L * 65280 / 100 / 65535, (a + 128) * 256 / 65535, (b + 128) * 256 / 65535];

let cached = null;
/** The sRGB output profile (ICC v2, class prtr, RGB data, Lab connection space). */
export function srgbOutputProfile({ grid = 17, now = new Date(2026, 0, 1) } = {}) {
  if (cached && grid === 17) return cached;
  const tags = [
    ['desc', textDescription(PDFX_PROFILE_NAME)],
    ['cprt', writer().sig('text').u32(0).bytes(ascii('No copyright, use freely')).u8(0).done()],
    ['wtpt', (() => { const w = writer().sig('XYZ ').u32(0); D50.forEach((v) => w.s15(v)); return w.done(); })()],
    ['A2B0', lut16(3, 3, grid, (rgb) => encodeLab(rgbToLab(rgb)))],
    ['B2A0', lut16(3, 3, grid, (lab) => labToRgb(decodeLab(lab)).map((c) => clamp(c, 0, 1)))],
    ['gamt', lut16(3, 1, grid, (lab) => [labToRgb(decodeLab(lab)).every((c) => c >= -0.002 && c <= 1.002) ? 0 : 1])],
  ];
  const tableSize = 4 + 12 * tags.length, offsets = []; let at = 128 + tableSize;
  for (const [, body] of tags) { offsets.push(at); at += body.length; at += (4 - at % 4) % 4; }
  const w = writer().u32(at).u32(0).u32(0x02100000).sig('prtr').sig('RGB ').sig('Lab ');
  for (const v of [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), 0, 0, 0]) w.u16(v);
  w.sig('acsp').u32(0).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0); // platform, flags, maker, model, attributes
  D50.forEach((v) => w.s15(v)); w.u32(0).bytes(new Uint8Array(44));
  w.u32(tags.length); tags.forEach(([sig, body], i) => w.sig(sig).u32(offsets[i]).u32(body.length));
  for (const [, body] of tags) { w.bytes(body); w.pad(); }
  const out = w.done();
  if (grid === 17) cached = out;
  return out;
}

/** Why `options` cannot make a PDF/X-4 file, as sentences (empty when they can). */
export function pdfxProblems(options = {}) {
  const problems = [];
  if (!['1.6', '1.7'].includes(String(options.version ?? '1.6'))) problems.push('PDF/X-4 needs Acrobat 7 (PDF 1.6) or later.');
  if (options.attachment || options.preserveEditing) problems.push('PDF/X-4 does not allow attached files; turn off Preserve modCut editing capabilities.');
  if (options.marks?.pageInfo) problems.push('PDF/X-4 needs embedded fonts; turn off Page information.');
  return problems;
}

const xml = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
/** XMP packet for a PDF/X-4 file. */
export function pdfxMetadata({ title = 'Untitled', now = new Date() } = {}) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="modCut">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(title)}</rdf:li></rdf:Alt></dc:title>
   <xmp:CreatorTool>modCut Draw</xmp:CreatorTool>
   <xmp:CreateDate>${iso(now)}</xmp:CreateDate>
   <xmp:ModifyDate>${iso(now)}</xmp:ModifyDate>
   <xmp:MetadataDate>${iso(now)}</xmp:MetadataDate>
   <xmpMM:DocumentID>uuid:${uuid()}</xmpMM:DocumentID>
   <xmpMM:InstanceID>uuid:${uuid()}</xmpMM:InstanceID>
   <xmpMM:VersionID>1</xmpMM:VersionID>
   <xmpMM:RenditionClass>default</xmpMM:RenditionClass>
   <pdf:Producer>modCut</pdf:Producer>
   <pdf:Trapped>False</pdf:Trapped>
   <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
