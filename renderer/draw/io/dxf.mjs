/**
 * DXF writer (AutoCAD R12, ASCII) for one artboard, in millimetres with y up and the origin at the
 * artboard's bottom-left. Pure: takes a model from vector-model.mjs. Every subpath becomes a POLYLINE
 * (curves flattened within `tolerance` mm) on a DXF layer named after the Draw layer, coloured with
 * the nearest AutoCAD colour of its stroke, or of its fill. Images are not part of DXF.
 */
import { flatItems, flattenSubpath } from './vector-model.mjs';

const num = (v) => { const s = (Math.round(v * 1e6) / 1e6).toString(); return s === '-0' ? '0' : s; };
// AutoCAD Color Index entries 1–9 with their RGB values; 7 is black on a white sheet.
const ACI = [[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [0, 0, 0]], [8, [128, 128, 128]], [9, [192, 192, 192]]];
export function aciColor(rgb) {
  if (!rgb) return 7;
  const c = rgb.map((v) => v * 255);
  return ACI.reduce((best, [index, v]) => { const d = (c[0] - v[0]) ** 2 + (c[1] - v[1]) ** 2 + (c[2] - v[2]) ** 2; return d < best[1] ? [index, d] : best; }, [7, Infinity])[0];
}
/** R12 layer names allow letters, digits, $, - and _ only; names stay unique. */
export function dxfLayerNames(names) {
  const used = new Set();
  return names.map((name) => {
    const base = (String(name).replace(/[^A-Za-z0-9$_-]+/g, '_').replace(/^_+|_+$/g, '') || 'LAYER').slice(0, 31).toUpperCase();
    let candidate = base, n = 2; while (used.has(candidate)) candidate = `${base.slice(0, 28)}_${n++}`;
    used.add(candidate); return candidate;
  });
}

export function dxfDocument(model, { tolerance = 0.01 } = {}) {
  const lines = [], pair = (code, value) => lines.push(String(code), String(value)), H = model.height;
  const names = dxfLayerNames(model.layers.map((layer) => layer.name)), warnings = [...model.warnings];
  pair(0, 'SECTION'); pair(2, 'HEADER'); pair(9, '$ACADVER'); pair(1, 'AC1009'); pair(9, '$INSUNITS'); pair(70, 4);
  pair(9, '$EXTMIN'); pair(10, 0); pair(20, 0); pair(9, '$EXTMAX'); pair(10, num(model.width)); pair(20, num(H)); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, 1); pair(0, 'LTYPE'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, 0); pair(0, 'ENDTAB');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, names.length + 1);
  for (const name of ['0', ...names]) { pair(0, 'LAYER'); pair(2, name); pair(70, 0); pair(62, 7); pair(6, 'CONTINUOUS'); }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  let count = 0, images = 0;
  model.layers.forEach((layer, index) => {
    for (const item of flatItems(layer.items)) {
      if (item.type === 'image') { images++; continue; }
      const color = aciColor(item.stroke?.rgb ?? item.fill?.rgb);
      for (const sub of item.subpaths) {
        const points = flattenSubpath(sub, tolerance);
        if (points.length < 2) continue;
        pair(0, 'POLYLINE'); pair(8, names[index]); pair(62, color); pair(66, 1); pair(10, 0); pair(20, 0); pair(30, 0); pair(70, sub.closed ? 1 : 0);
        for (const [x, y] of points) { pair(0, 'VERTEX'); pair(8, names[index]); pair(10, num(x)); pair(20, num(H - y)); pair(30, 0); }
        pair(0, 'SEQEND'); pair(8, names[index]); count++;
      }
    }
  });
  pair(0, 'ENDSEC'); pair(0, 'EOF');
  if (images) warnings.push(`${images} image${images === 1 ? ' is' : 's are'} not part of DXF and ${images === 1 ? 'was' : 'were'} left out.`);
  return { text: lines.join('\r\n') + '\r\n', warnings: [...new Set(warnings.filter((w) => !/Images are not included/.test(w)))], count };
}
