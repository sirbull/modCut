/**
 * PDF writer for Draw (vector). Pure: takes artwork models from vector-model.mjs and returns bytes.
 *
 * One page per artboard. Artwork is drawn in millimetres under a single page transform, so paths keep
 * their curves. Group opacity and blending use transparency groups; images carry an alpha soft mask.
 * Top-level layers can become PDF layers (optional content, PDF 1.5+). The trim box is the artboard,
 * the bleed box adds bleed, and the media box leaves room for printer's marks.
 */
import { multiply, straight } from './vector-model.mjs';

export const PDF_COMPATIBILITY = Object.freeze([
  { id: '1.4', label: 'Acrobat 5 (PDF 1.4)' }, { id: '1.5', label: 'Acrobat 6 (PDF 1.5)' },
  { id: '1.6', label: 'Acrobat 7 (PDF 1.6)' }, { id: '1.7', label: 'Acrobat 8 (PDF 1.7)' },
]);
/** Option sets in the spirit of Illustrator's Adobe PDF presets. */
export const PDF_PRESETS = Object.freeze([
  { id: 'default', name: '[modCut Default]', description: 'Use these settings when you plan to open the PDF in modCut again, or when the final use of the file is unknown. Editing data is kept, images are not downsampled.',
    options: { version: '1.6', preserveEditing: true, thumbnails: true, layers: true, viewAfter: false, downsample: 'none', ppi: 300, above: 450, imageCompression: 'zip', jpegQuality: 'maximum', compressArt: true, marks: {}, bleed: null } },
  { id: 'print', name: '[High Quality Print]', description: 'For printing on desktop printers and proofers. Images above 450 ppi are downsampled to 300 ppi; editing data is not kept.',
    options: { version: '1.6', preserveEditing: false, thumbnails: false, layers: false, viewAfter: false, downsample: 'bicubic', ppi: 300, above: 450, imageCompression: 'zip', jpegQuality: 'maximum', compressArt: true, marks: {}, bleed: null } },
  { id: 'press', name: '[Press Quality]', description: 'For prepress printing: trim marks, 3 mm bleed and images at 300 ppi.',
    options: { version: '1.6', preserveEditing: false, thumbnails: false, layers: false, viewAfter: false, downsample: 'bicubic', ppi: 300, above: 450, imageCompression: 'zip', jpegQuality: 'maximum', compressArt: true, marks: { trim: true }, bleed: { top: 3, bottom: 3, left: 3, right: 3 } } },
  { id: 'smallest', name: '[Smallest File Size]', description: 'For on-screen display, e-mail and the web. Images are downsampled to 100 ppi and JPEG compressed.',
    options: { version: '1.6', preserveEditing: false, thumbnails: false, layers: false, viewAfter: false, downsample: 'bicubic', ppi: 100, above: 150, imageCompression: 'jpeg', jpegQuality: 'medium', compressArt: true, marks: {}, bleed: null } },
]);
export const JPEG_QUALITY = Object.freeze({ maximum: .95, high: .85, medium: .7, low: .5, minimum: .3 });
export const MARK_LENGTH = 5;

const K = 72 / 25.4;
const num = (v) => { const s = (Math.round(v * 10000) / 10000).toString(); return s === '-0' ? '0' : s; };
const pt = (mm) => num(mm * K);
const latin1 = (text) => { const out = new Uint8Array(text.length); for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 255; return out; };
const BLEND = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'ColorDodge',
  'color-burn': 'ColorBurn', 'hard-light': 'HardLight', 'soft-light': 'SoftLight', difference: 'Difference', exclusion: 'Exclusion', hue: 'Hue',
  saturation: 'Saturation', color: 'Color', luminosity: 'Luminosity' };
/** A PDF text string: literal for printable ASCII, UTF-16BE otherwise. */
export function pdfString(text) {
  text = String(text ?? '');
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  let hex = 'FEFF';
  for (const ch of text) { const code = ch.codePointAt(0);
    if (code > 0xffff) { const v = code - 0x10000; hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 1023)).toString(16).padStart(4, '0'); }
    else hex += code.toString(16).padStart(4, '0'); }
  return `<${hex.toUpperCase()}>`;
}
const pdfName = (text) => '/' + String(text).replace(/[^A-Za-z0-9_.-]/g, (c) => `#${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
const date = (d) => { const p = (n) => String(n).padStart(2, '0'); return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`; };
/** WinAnsi text for Helvetica marks; characters outside Latin-1 become '?'. */
const ansi = (text) => `(${[...String(text)].map((c) => c.charCodeAt(0) < 256 ? c : '?').join('').replace(/[\\()]/g, (c) => `\\${c}`)})`;

/** Page margins in millimetres: bleed, and room for marks beyond it. */
export function pageMargins({ marks = {}, bleed = null } = {}) {
  const b = { top: 0, bottom: 0, left: 0, right: 0, ...(bleed ?? {}) }, any = marks.trim || marks.registration || marks.pageInfo;
  const offset = marks.offset ?? 2.117, side = (key) => any ? Math.max(offset, b[key]) + MARK_LENGTH + (key === 'bottom' && marks.pageInfo ? 4 : 1) : b[key];
  return { bleed: b, margin: { top: side('top'), bottom: side('bottom'), left: side('left'), right: side('right') } };
}

/**
 * @param pages [{model, thumbnail?:{width,height,rgb}}]
 * @param options see PDF_PRESETS; plus compress(bytes)→bytes (Flate), title, documentName, date, attachment {name,bytes,mime},
 *   metadata (an XMP packet) and artBox (each page's art box is the artboard)
 */
export function pdfDocument(pages, options = {}) {
  const { version = '1.6', compress = null, compressArt = true, layers: wantLayers = true, title = '', documentName = title, marks = {}, bleed = null,
    attachment = null, metadata = null, artBox = false, now = new Date() } = options;
  if (!pages.length) throw new Error('Choose at least one artboard.');
  const objects = [];
  const reserve = () => { objects.push(null); return objects.length; };
  const set = (id, body) => { objects[id - 1] = body; return id; };
  const add = (body) => set(reserve(), body);
  const stream = (dict, bytes, { flate = true } = {}) => {
    let data = typeof bytes === 'string' ? latin1(bytes) : bytes, filter = dict.match(/\/Filter/) ? '' : null;
    if (flate && compress && filter === null) { data = compress(data); filter = ' /Filter /FlateDecode'; }
    return { dict: `<< ${dict}${filter ?? ''} /Length ${data.length} >>`, data };
  };
  const useLayers = wantLayers && Number(version) >= 1.5;
  const resources = { gs: new Map(), xobject: new Map(), properties: new Map(), font: false };
  const resourcesId = reserve();
  const gsName = (fillAlpha, strokeAlpha, blend) => {
    const key = `${num(fillAlpha)}|${num(strokeAlpha)}|${blend}`;
    if (!resources.gs.has(key)) resources.gs.set(key, { name: `GS${resources.gs.size}`, id: add(`<< /Type /ExtGState /ca ${num(fillAlpha)} /CA ${num(strokeAlpha)} /BM /${BLEND[blend] ?? 'Normal'} >>`) });
    return resources.gs.get(key).name;
  };
  const layerOCG = new Map();
  const ocName = (layerName) => {
    if (!layerOCG.has(layerName)) {
      const id = add(`<< /Type /OCG /Name ${pdfString(layerName)} >>`), name = `OC${layerOCG.size}`;
      layerOCG.set(layerName, { id, name }); resources.properties.set(name, id);
    }
    return layerOCG.get(layerName).name;
  };
  function image(item) {
    const { width, height, rgba, jpeg = null } = item, rgb = new Uint8Array(width * height * 3), alpha = new Uint8Array(width * height);
    let opaque = true;
    for (let i = 0, j = 0, k = 0; i < rgba.length; i += 4) { rgb[j++] = rgba[i]; rgb[j++] = rgba[i + 1]; rgb[j++] = rgba[i + 2]; alpha[k++] = rgba[i + 3]; if (rgba[i + 3] !== 255) opaque = false; }
    const base = `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8`;
    const mask = opaque ? '' : ` /SMask ${add(stream(`${base} /ColorSpace /DeviceGray`, alpha))} 0 R`;
    const body = jpeg ? stream(`${base} /ColorSpace /DeviceRGB /Filter /DCTDecode${mask}`, jpeg, { flate: false }) : stream(`${base} /ColorSpace /DeviceRGB${mask}`, rgb);
    const name = `Im${resources.xobject.size}`; resources.xobject.set(name, add(body)); return name;
  }
  /** Content operators for items, drawn in artboard millimetres with y down. */
  function content(items) {
    const ops = [];
    for (const item of items) {
      const blend = item.blend ?? 'normal';
      if (item.type === 'group') {
        const inner = content(item.children);
        if (item.opacity >= 1 && blend === 'normal') { ops.push(inner); continue; }
        // Opacity applies to the group as a whole: draw it as a transparency group form.
        const name = `Fm${resources.xobject.size}`;
        resources.xobject.set(name, add(stream(`/Type /XObject /Subtype /Form /BBox [-100000 -100000 100000 100000] /Resources ${resourcesId} 0 R /Group << /S /Transparency /I false /K false >>`, inner, { flate: compressArt })));
        ops.push(`q /${gsName(item.opacity, item.opacity, blend)} gs /${name} Do Q`);
      } else if (item.type === 'image') {
        const m = multiply(item.matrix, [1, 0, 0, -1, 0, 1]), name = image(item), gs = item.opacity < 1 || blend !== 'normal' ? `/${gsName(item.opacity, item.opacity, blend)} gs ` : '';
        ops.push(`q ${gs}${m.map(num).join(' ')} cm /${name} Do Q`);
      } else if (item.type === 'path') {
        const { fill, stroke } = item, parts = ['q'];
        const fa = (fill?.alpha ?? 1) * item.opacity, sa = (stroke?.alpha ?? 1) * item.opacity;
        if (fa < 1 || sa < 1 || blend !== 'normal') parts.push(`/${gsName(fa, sa, blend)} gs`);
        if (fill) parts.push(`${fill.rgb.map(num).join(' ')} rg`);
        if (stroke) {
          parts.push(`${stroke.rgb.map(num).join(' ')} RG ${num(stroke.width)} w ${{ butt: 0, round: 1, square: 2 }[stroke.cap] ?? 0} J ${{ miter: 0, round: 1, bevel: 2 }[stroke.join] ?? 0} j ${num(Math.max(1, stroke.miter))} M`);
          if (stroke.dash.length && stroke.dash.some((n) => n > 0)) parts.push(`[${stroke.dash.map(num).join(' ')}] ${num(stroke.dashOffset)} d`);
        }
        for (const sub of item.subpaths) {
          const s = sub.segments; parts.push(`${num(s[0].p[0])} ${num(s[0].p[1])} m`);
          const count = sub.closed ? s.length : s.length - 1;
          for (let i = 0; i < count; i++) {
            const a = s[i], b = s[(i + 1) % s.length];
            parts.push(straight(a, b) ? `${num(b.p[0])} ${num(b.p[1])} l` : `${[...a.out, ...b.in, ...b.p].map(num).join(' ')} c`);
          }
          if (sub.closed) parts.push('h');
        }
        const even = item.fillRule === 'evenodd' ? '*' : '';
        parts.push(fill && stroke ? `B${even}` : fill ? `f${even}` : 'S', 'Q');
        ops.push(parts.join('\n'));
      }
    }
    return ops.join('\n');
  }
  function markOps(model, index) {
    const weight = (marks.weight ?? .25) / K, offset = marks.offset ?? 2.117, { bleed: b } = pageMargins({ marks, bleed });
    const W = model.width, H = model.height, ops = [`q 0 0 0 RG 0 0 0 rg ${num(weight)} w`];
    if (marks.trim) {
      const line = (x1, y1, x2, y2) => ops.push(`${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
      for (const [x, sx] of [[0, -1], [W, 1]]) for (const [y, sy] of [[0, -1], [H, 1]]) {
        const ox = Math.max(offset, sx < 0 ? b.left : b.right), oy = Math.max(offset, sy < 0 ? b.top : b.bottom);
        line(x + sx * ox, y, x + sx * (ox + MARK_LENGTH), y); line(x, y + sy * oy, x, y + sy * (oy + MARK_LENGTH));
      }
    }
    if (marks.registration) {
      const target = (cx, cy) => { const r = 1.5, k = .5523 * r;
        ops.push(`${num(cx + r)} ${num(cy)} m ${num(cx + r)} ${num(cy + k)} ${num(cx + k)} ${num(cy + r)} ${num(cx)} ${num(cy + r)} c ${num(cx - k)} ${num(cy + r)} ${num(cx - r)} ${num(cy + k)} ${num(cx - r)} ${num(cy)} c ${num(cx - r)} ${num(cy - k)} ${num(cx - k)} ${num(cy - r)} ${num(cx)} ${num(cy - r)} c ${num(cx + k)} ${num(cy - r)} ${num(cx + r)} ${num(cy - k)} ${num(cx + r)} ${num(cy)} c S`,
          `${num(cx - 2.5)} ${num(cy)} m ${num(cx + 2.5)} ${num(cy)} l S ${num(cx)} ${num(cy - 2.5)} m ${num(cx)} ${num(cy + 2.5)} l S`); };
      const d = (key) => Math.max(offset, b[key]) + MARK_LENGTH / 2;
      target(W / 2, -d('top')); target(W / 2, H + d('bottom')); target(-d('left'), H / 2); target(W + d('right'), H / 2);
    }
    if (marks.pageInfo) {
      resources.font = true;
      const info = `${documentName || 'Untitled'}  ${model.name || `Artboard ${index + 1}`}  ${now.toISOString().slice(0, 16).replace('T', ' ')}  Page ${index + 1}`;
      ops.push(`BT /F1 2.117 Tf 1 0 0 -1 ${num(Math.max(offset, b.left))} ${num(H + Math.max(offset, b.bottom) + MARK_LENGTH + 2.5)} Tm ${ansi(info)} Tj ET`);
    }
    ops.push('Q'); return ops.length > 2 ? ops.join('\n') : '';
  }

  const catalogId = reserve(), pagesId = reserve(), pageIds = [];
  pages.forEach(({ model, thumbnail }, index) => {
    const { bleed: b, margin: mg } = pageMargins({ marks, bleed });
    const pw = model.width + mg.left + mg.right, ph = model.height + mg.top + mg.bottom;
    const body = [`${num(K)} 0 0 ${num(-K)} ${pt(mg.left)} ${pt(model.height + mg.top)} cm`];
    for (const layer of model.layers) {
      const inner = content(layer.items);
      body.push(useLayers ? `/OC /${ocName(layer.name)} BDC\n${inner}\nEMC` : inner);
    }
    const marksOps = markOps(model, index); if (marksOps) body.push(marksOps);
    const contentsId = add(stream('', body.join('\n'), { flate: compressArt }));
    const box = (l, t, r, bt) => `[${pt(mg.left - l)} ${pt(mg.bottom - bt)} ${pt(mg.left + model.width + r)} ${pt(mg.bottom + model.height + t)}]`;
    const thumb = thumbnail ? ` /Thumb ${add(stream(`/Width ${thumbnail.width} /Height ${thumbnail.height} /ColorSpace /DeviceRGB /BitsPerComponent 8`, thumbnail.rgb))} 0 R` : '';
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pt(pw)} ${pt(ph)}] /BleedBox ${box(b.left, b.top, b.right, b.bottom)} /TrimBox ${box(0, 0, 0, 0)}${artBox ? ` /ArtBox ${box(0, 0, 0, 0)}` : ''} /Resources ${resourcesId} 0 R /Contents ${contentsId} 0 R /Group << /S /Transparency /CS /DeviceRGB >>${thumb} >>`));
  });
  set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const dict = (map) => `<< ${[...map].map(([name, id]) => `/${name} ${id} 0 R`).join(' ')} >>`;
  const gsMap = new Map([...resources.gs.values()].map(({ name, id }) => [name, id]));
  set(resourcesId, `<< /ProcSet [/PDF /ImageC /ImageB /Text] /ExtGState ${dict(gsMap)} /XObject ${dict(resources.xobject)} /Properties ${dict(resources.properties)}${resources.font ? ` /Font << /F1 ${add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')} 0 R >>` : ''} >>`);
  let extra = '';
  if (useLayers && layerOCG.size) {
    const refs = [...layerOCG.values()].map(({ id }) => `${id} 0 R`).join(' ');
    extra += ` /OCProperties << /OCGs [${refs}] /D << /Name (Layers) /Order [${refs}] /ON [${refs}] >> >> /PageMode /UseOC`;
  }
  if (attachment) {
    const file = add(stream(`/Type /EmbeddedFile /Subtype ${pdfName(attachment.mime ?? 'application/octet-stream')} /Params << /Size ${attachment.bytes.length} >>`, attachment.bytes));
    const spec = add(`<< /Type /Filespec /F ${pdfString(attachment.name)} /UF ${pdfString(attachment.name)} /EF << /F ${file} 0 R >> /Desc (modCut Draw document) >>`);
    extra += ` /Names << /EmbeddedFiles << /Names [${pdfString(attachment.name)} ${spec} 0 R] >> >>`;
  }
  // XMP is read by other programs before the page tree, so it stays uncompressed and UTF-8.
  if (metadata) extra += ` /Metadata ${add(stream('/Type /Metadata /Subtype /XML', new TextEncoder().encode(metadata), { flate: false }))} 0 R`;
  set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${extra} >>`);
  const infoId = add(`<< /Title ${pdfString(title || documentName || 'Untitled')} /Creator (modCut Draw) /Producer (modCut) /CreationDate ${pdfString(date(now))} /ModDate ${pdfString(date(now))} >>`);

  // Serialise with a cross-reference table.
  const chunks = [], offsets = []; let length = 0;
  const push = (part) => { const bytes = typeof part === 'string' ? latin1(part) : part; chunks.push(bytes); length += bytes.length; };
  push(`%PDF-${version}\n%\xe2\xe3\xcf\xd3\n`);
  objects.forEach((body, i) => {
    offsets.push(length);
    if (typeof body === 'string') push(`${i + 1} 0 obj\n${body}\nendobj\n`);
    else { push(`${i + 1} 0 obj\n${body.dict}\nstream\n`); push(body.data); push('\nendstream\nendobj\n'); }
  });
  // The file identifier only needs to differ between files: time, size and object count.
  const xref = length, id = [now.getTime(), length, objects.length, Math.floor(Math.random() * 2 ** 32)].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length); let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
