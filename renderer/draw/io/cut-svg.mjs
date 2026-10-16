/**
 * Send to Cut v1: one artboard as a canonical cut SVG in millimetres (viewBox units = mm, origin at the
 * artboard's top-left). Only plain <path> elements with hex fill/stroke and stroke widths in mm, which
 * Cut's existing SVG import turns into layers by color. Pure: the renderer supplies world matrices,
 * bounds and expanded shape geometry.
 */
import { isOutputNode } from '../doc/layers.mjs';
import { paintHex } from '../doc/paint.mjs';
import { multiply } from '../doc/arrange.mjs';
import { hasTextLayout } from '../doc/text-layout.mjs';

const fmt = (n) => { const v = Math.abs(n) < 5e-5 ? 0 : n; return String(Number(v.toFixed(4))); };
const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];
const vector = ([a, b, c, d], [x, y]) => [a * x + c * y, b * x + d * y];
const shown = (list) => (list ?? []).filter((e) => !e.hidden);
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (a, b) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.width <= b.x + b.width + 1e-6 && a.y + a.height <= b.y + b.height + 1e-6;

/** SVG path data for subpaths in local coordinates, mapped through `m`. */
export function pathData(subpaths, m) {
  const parts = [];
  for (const sub of subpaths) {
    const s = sub.segments; if (!s?.length) continue;
    const P = s.map((seg) => apply(m, seg.p)), I = s.map((seg) => vector(m, seg.in)), O = s.map((seg) => vector(m, seg.out));
    let d = `M${fmt(P[0][0])} ${fmt(P[0][1])}`;
    const curve = (i, j) => {
      const straight = !O[i][0] && !O[i][1] && !I[j][0] && !I[j][1];
      d += straight ? `L${fmt(P[j][0])} ${fmt(P[j][1])}`
        : `C${fmt(P[i][0] + O[i][0])} ${fmt(P[i][1] + O[i][1])} ${fmt(P[j][0] + I[j][0])} ${fmt(P[j][1] + I[j][1])} ${fmt(P[j][0])} ${fmt(P[j][1])}`;
    };
    for (let i = 0; i + 1 < s.length; i++) curve(i, i + 1);
    if (sub.closed) { if (s.length > 1) curve(s.length - 1, 0); d += 'Z'; }
    parts.push(d);
  }
  return parts.join('');
}

/**
 * @param geometry { worldMatrix(id), bounds(id) -> {x,y,width,height}, subpaths(id) -> local PathData for paths and shapes }
 * @returns {{ svg, count, warnings: string[], skipped: { images, outside, empty } }}
 */
export function artboardCutSvg(doc, boardId, geometry, { only = null } = {}) {
  const board = doc.getArtboard(boardId);
  if (!board) throw new Error('Choose an artboard to send.');
  // `only`: copied objects and their descendants, sent whole wherever they are, for pasting in Cut.
  const picked = (id) => !only || only.has(id) || doc.ancestors(id).some((a) => only.has(a.id));
  const onBoard = (box) => !!box && (!!only || intersects(box, board));
  const toBoard = [1, 0, 0, 1, -board.x, -board.y], elements = [], skipped = { images: 0, outside: 0, empty: 0 };
  let partly = 0, stacked = 0, openFilled = 0, textCount = 0;
  const errors=[];
  function emit(node,subpaths,box) {
    if (!onBoard(box)) { skipped.outside++; return; }
    if (!only && !inside(box, board)) partly++;
    const fills = shown(node.appearance?.fills), strokes = shown(node.appearance?.strokes);
    if (fills.length > 1 || strokes.length > 1) stacked++;
    const fill = paintHex(fills[0]), stroke = paintHex(strokes[0]);
    if (!fill && !stroke) { skipped.empty++; return; }
    if (fill && subpaths.some((p) => !p.closed)) openFilled++;
    const m = multiply(toBoard, geometry.worldMatrix(node.id)), d = pathData(subpaths, m);
    if (!d) { skipped.empty++; return; }
    // Stroke widths are in local units unless the node stores world millimetres (strokeScaling: false).
    const scale = node.strokeScaling === false ? 1 : Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const attrs = [`d="${d}"`, `fill="${fill ?? 'none'}"`];
    if (fill && node.fillRule === 'evenodd') attrs.push('fill-rule="evenodd"');
    if (stroke) attrs.push(`stroke="${stroke}"`, `stroke-width="${fmt((strokes[0].width ?? 0) * scale)}"`);
    else attrs.push('stroke="none"');
    elements.push(`  <path ${attrs.join(' ')}/>`);
  }
  for (const original of doc.descendants(null)) {
    if (original.children || !isOutputNode(doc, original.id) || !picked(original.id)) continue;
    if (original.type === 'image') { skipped.images++; continue; }
    if (original.type === 'text') {
      const node=geometry.resolvedText?.(original.id)??original,box=geometry.bounds(node.id);
      if(!onBoard(box)){skipped.outside++;continue;}
      if(!hasTextLayout(node)){errors.push('Text needs a resolved font before sending. Open Edit Text and choose an available font.');continue;}
      if(node.layout.overflow){errors.push(node.kind==='onPath'?'Text does not fit on its path. Shorten the text or use a longer path before sending to Cut.':'Text overflows its frame. Enlarge the frame before sending to Cut.');continue;}
      textCount++;
      for(const glyph of node.layout.glyphs)if(glyph.subpaths.length)emit(node,glyph.subpaths,geometry.glyphBounds?.(node.id,glyph.subpaths)??box);
    } else if (original.type === 'path' || original.type === 'shape')emit(original,geometry.subpaths(original.id)??[],geometry.bounds(original.id));
  }
  const warnings = [];
  if (skipped.images) warnings.push(`${skipped.images} image${skipped.images === 1 ? ' is' : 's are'} not sent yet (Send to Cut v2).`);
  if (partly) warnings.push(`${partly} object${partly === 1 ? ' extends' : 's extend'} past the artboard and ${partly === 1 ? 'is' : 'are'} sent whole.`);
  if (stacked) warnings.push(`${stacked} object${stacked === 1 ? ' has' : 's have'} several fills or strokes; only the first of each is sent.`);
  if (openFilled) warnings.push(`${openFilled} open path${openFilled === 1 ? ' has' : 's have'} a fill; Cut follows the open line.`);
  const W = fmt(board.width), H = fmt(board.height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n${elements.join('\n')}\n</svg>\n`;
  return { svg, count: elements.length, warnings, skipped, errors:[...new Set(errors)], textCount };
}
