/**
 * PLT (HP-GL/1) writer (D5): one artboard as plotter and cutter moves, 40 units per mm with y up and the
 * origin at the artboard's lower left. Curves are flattened within `tolerance` mm; each stroke colour (or
 * fill colour, without a stroke) gets its own pen, in order of first use (up to `pens`). Pure.
 */
import { flatItems, flattenSubpath } from './vector-model.mjs';

const UNITS = 40;
const key = (rgb) => rgb ? rgb.map((v) => Math.round(v * 255)).join(',') : 'none';
export function pltDocument(model, { tolerance = 0.025, pens = 8 } = {}) {
  const out = ['IN;', 'PA;'], pen = new Map(), warnings = [...model.warnings.filter((w) => !/Images are not included/.test(w))];
  const at = ([x, y]) => `${Math.round(x * UNITS)},${Math.round((model.height - y) * UNITS)}`;
  let current = 0, count = 0, images = 0, shared = 0;
  for (const layer of model.layers) for (const item of flatItems(layer.items)) {
    if (item.type === 'image') { images++; continue; }
    const colour = key(item.stroke?.rgb ?? item.fill?.rgb);
    if (!pen.has(colour)) { if (pen.size < pens) pen.set(colour, pen.size + 1); else shared++; }
    const number = pen.get(colour) ?? pens;
    if (number !== current) { out.push(`SP${number};`); current = number; }
    for (const sub of item.subpaths) {
      const points = flattenSubpath(sub, tolerance);
      if (points.length < 2) continue;
      if (sub.closed) points.push(points[0]);
      out.push(`PU${at(points[0])};`, `PD${points.slice(1).map(at).join(',')};`); count++;
    }
  }
  out.push('PU;', 'SP0;');
  if (images) warnings.push(`${images} image${images === 1 ? ' is' : 's are'} not part of PLT and ${images === 1 ? 'was' : 'were'} left out.`);
  if (shared) warnings.push(`More than ${pens} colours: the rest share pen ${pens}.`);
  return { text: out.join('\n') + '\n', warnings: [...new Set(warnings)], count, pens: pen.size };
}
