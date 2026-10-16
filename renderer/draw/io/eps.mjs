/**
 * EPS writer (PostScript Level 2) for one artboard. Pure: takes a model from vector-model.mjs.
 * Curves stay curves. PostScript has no transparency, so opacity is ignored and image alpha is
 * composited onto white; `warnings` says so when it matters.
 */
import { flatItems, straight } from './vector-model.mjs';

const K = 72 / 25.4;
const num = (v) => { const s = (Math.round(v * 10000) / 10000).toString(); return s === '-0' ? '0' : s; };
const text = (t) => String(t ?? '').replace(/[^\x20-\x7e]/g, '?');

export function epsDocument(model, { title = model.name, now = new Date() } = {}) {
  const W = model.width * K, H = model.height * K, warnings = [...model.warnings], out = [];
  out.push('%!PS-Adobe-3.0 EPSF-3.0', `%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}`, `%%HiResBoundingBox: 0 0 ${num(W)} ${num(H)}`,
    `%%Title: ${text(title || 'Untitled')}`, '%%Creator: modCut Draw', `%%CreationDate: ${now.toISOString()}`, '%%LanguageLevel: 2', '%%Pages: 1', '%%EndComments',
    '%%BeginProlog', '/m {moveto} bind def /l {lineto} bind def /c {curveto} bind def /h {closepath} bind def', '%%EndProlog', '%%Page: 1 1',
    'save', `[${num(K)} 0 0 ${num(-K)} 0 ${num(H)}] concat`);
  let translucent = false;
  for (const layer of model.layers) {
    out.push(`%%modCut layer: ${text(layer.name)}`);
    for (const item of flatItems(layer.items)) {
      if (item.opacity < 1 || item.blend !== 'normal' || (item.fill && item.fill.alpha < 1) || (item.stroke && item.stroke.alpha < 1)) translucent = true;
      if (item.type === 'image') {
        const { width, height, rgba } = item, hex = [];
        for (let i = 0; i < rgba.length; i += 4) {
          const a = rgba[i + 3] / 255;
          for (let k = 0; k < 3; k++) hex.push(Math.round(rgba[i + k] * a + 255 * (1 - a)).toString(16).padStart(2, '0'));
          if (rgba[i + 3] < 255) translucent = true;
        }
        out.push('gsave', `[${item.matrix.map(num).join(' ')}] concat`, '/DeviceRGB setcolorspace',
          `<< /ImageType 1 /Width ${width} /Height ${height} /BitsPerComponent 8 /Decode [0 1 0 1 0 1] /ImageMatrix [${width} 0 0 ${height} 0 0] /DataSource currentfile /ASCIIHexDecode filter >> image`);
        for (let i = 0; i < hex.length; i += 36) out.push(hex.slice(i, i + 36).join(''));
        out.push('>', 'grestore');
        continue;
      }
      const path = ['newpath'];
      for (const sub of item.subpaths) {
        const s = sub.segments; path.push(`${num(s[0].p[0])} ${num(s[0].p[1])} m`);
        const count = sub.closed ? s.length : s.length - 1;
        for (let i = 0; i < count; i++) { const a = s[i], b = s[(i + 1) % s.length]; path.push(straight(a, b) ? `${num(b.p[0])} ${num(b.p[1])} l` : `${[...a.out, ...b.in, ...b.p].map(num).join(' ')} c`); }
        if (sub.closed) path.push('h');
      }
      out.push('gsave', path.join(' '));
      if (item.fill) out.push(`${item.fill.rgb.map(num).join(' ')} setrgbcolor`, item.stroke ? `gsave ${item.fillRule === 'evenodd' ? 'eofill' : 'fill'} grestore` : item.fillRule === 'evenodd' ? 'eofill' : 'fill');
      if (item.stroke) {
        const st = item.stroke;
        out.push(`${st.rgb.map(num).join(' ')} setrgbcolor ${num(st.width)} setlinewidth ${{ butt: 0, round: 1, square: 2 }[st.cap] ?? 0} setlinecap ${{ miter: 0, round: 1, bevel: 2 }[st.join] ?? 0} setlinejoin ${num(Math.max(1, st.miter))} setmiterlimit`,
          `[${st.dash.some((n) => n > 0) ? st.dash.map(num).join(' ') : ''}] ${num(st.dashOffset)} setdash stroke`);
      }
      out.push('grestore');
    }
  }
  out.push('restore', 'showpage', '%%Trailer', '%%EOF', '');
  if (translucent) warnings.push('EPS has no transparency: opacity and blending are ignored and images are placed on white.');
  return { text: out.join('\n'), warnings };
}
