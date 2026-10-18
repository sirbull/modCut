/**
 * Send to Cut v1: one artboard as a canonical cut SVG in millimetres (viewBox units = mm, origin at the
 * artboard's top-left). Only plain <path> elements with hex fill/stroke and stroke widths in mm, which
 * Cut's existing SVG import turns into layers by color. Pure: the renderer supplies world matrices,
 * bounds and expanded shape geometry.
 */
import { isOutputNode } from '../doc/layers.mjs';
import { paintHex } from '../doc/paint.mjs';
import { gradientHex } from '../doc/gradient.mjs';
import { multiply } from '../doc/arrange.mjs';
import { hasTextLayout } from '../doc/text-layout.mjs';

export const ALL_ARTBOARDS = 'all';
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
 * @param geometry { worldMatrix(id), bounds(id) -> {x,y,width,height}, subpaths(id) -> local PathData for paths and shapes,
 *   blendSteps(id) -> a blend group's steps per key pair (optional),
 *   clip(subpaths, world, rect, filled) -> world PathData cut at `rect` (optional, for clipToBoard) }
 * @param options `outlines`: Map of node id -> outlined stroke PathData in the node's space (Outline Stroke).
 * @returns {{ svg, count, warnings: string[], skipped: { images, outside, empty } }}
 */
export function artboardCutSvg(doc, boardId, geometry, { only = null, clipToBoard = false, outlines = null, dedupe = false } = {}) {
  // 'all': every artboard in one send, laid out as in the document (the rectangle around them all).
  const boards = boardId === ALL_ARTBOARDS ? doc.data.artboards : [doc.getArtboard(boardId)].filter(Boolean);
  if (!boards.length) throw new Error('Choose an artboard to send.');
  const board = boards.length === 1 ? boards[0] : (() => {
    const x = Math.min(...boards.map((b) => b.x)), y = Math.min(...boards.map((b) => b.y));
    return { id: ALL_ARTBOARDS, name: 'All artboards', x, y, width: Math.max(...boards.map((b) => b.x + b.width)) - x, height: Math.max(...boards.map((b) => b.y + b.height)) - y };
  })();
  // `only`: copied objects and their descendants, sent whole wherever they are, for pasting in Cut.
  const picked = (id) => !only || only.has(id) || doc.ancestors(id).some((a) => only.has(a.id));
  const onBoard = (box) => !!box && (!!only || boards.some((b) => intersects(box, b)));
  const toBoard = [1, 0, 0, 1, -board.x, -board.y], elements = [], skipped = { images: 0, outside: 0, empty: 0 };
  let partly = 0, clipped = 0, stacked = 0, openFilled = 0, textCount = 0, tiny = 0, duplicates = 0, nodes = 0, skewed = 0, maskedImages = 0;
  const images = [];
  const errors=[], seen = new Set();
  // Segments shorter than this make the laser stall and burn; Clean Up or Simplify removes them. Glyphs are exempt.
  const TINY = .05;
  function countTiny(subpaths, m, text) {
    for (const sub of subpaths) {
      const points = sub.segments.map((seg) => apply(m, seg.p)), n = points.length;
      nodes += n;
      if (!text) for (let i = 0; i < (sub.closed ? n : n - 1); i++) { const a = points[i], b = points[(i + 1) % n]; if (n > 1 && Math.hypot(a[0] - b[0], a[1] - b[1]) < TINY) tiny++; }
    }
  }
  /** One <path>; with `cut`, the geometry is first cut at the artboard edge. Returns the next insertion index. */
  function push(node, subpaths, { fill, stroke, width, rule }, at, cut) {
    const world = geometry.worldMatrix(node.id), m = multiply(toBoard, world);
    let d;
    if (cut) {
      // Each artboard cuts its own part, so art between artboards is left out as on a single one.
      const parts = boards.flatMap((b) => geometry.clip(subpaths, world, b, !!fill) ?? []);
      if (!parts?.length) { skipped.empty++; return at; }
      d = pathData(parts, toBoard); countTiny(parts, toBoard, node.type === 'text');
    } else { d = pathData(subpaths, m); if (d) countTiny(subpaths, m, node.type === 'text'); }
    if (!d) { skipped.empty++; return at; }
    // Stroke widths are in local units unless the node stores world millimetres (strokeScaling: false).
    const scale = node.strokeScaling === false ? 1 : Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const attrs = [`d="${d}"`, `fill="${fill ?? 'none'}"`];
    if (fill && rule === 'evenodd') attrs.push('fill-rule="evenodd"');
    if (stroke) attrs.push(`stroke="${stroke}"`, `stroke-width="${fmt((width ?? 0) * scale)}"`);
    else attrs.push('stroke="none"');
    const element = `  <path ${attrs.join(' ')}/>`;
    // The same path twice would be cut twice.
    if (seen.has(element)) { duplicates++; if (dedupe) return at; }
    seen.add(element); elements.splice(at, 0, element); return at + 1;
  }
  function emit(node,subpaths,box,at=elements.length) {
    if (!onBoard(box)) { skipped.outside++; return; }
    const outside = !only && !boards.some((b) => inside(box, b)), cut = outside && clipToBoard && !!geometry.clip;
    if (outside && !cut) partly++; if (cut) clipped++;
    const fills = shown(node.appearance?.fills), strokes = shown(node.appearance?.strokes);
    if (fills.length > 1 || strokes.length > 1) stacked++;
    // A gradient is one laser layer: its first stop's colour.
    const fill = paintHex(fills[0]) ?? gradientHex(fills[0]?.paint), stroke = paintHex(strokes[0]) ?? gradientHex(strokes[0]?.paint);
    if (!fill && !stroke) { skipped.empty++; return; }
    if (fill && subpaths.some((p) => !p.closed)) openFilled++;
    // Outline Stroke: the stroke is sent as the filled area it paints, above the fill.
    const outline = stroke && outlines?.get(node.id);
    if (outline) {
      if (fill) at = push(node, subpaths, { fill, rule: node.fillRule }, at, cut);
      if (outline.length) push(node, outline, { fill: stroke, rule: 'nonzero' }, at, cut);
      return;
    }
    push(node, subpaths, { fill, stroke, width: strokes[0]?.width, rule: node.fillRule }, at, cut);
  }
  // A clipping path that keeps its paint (Draw Inside) is filled under the clipped objects and stroked above them.
  const clipStart = new Map();
  // Blend steps are sent as the paths they draw, between their keys (just before the upper key).
  const blendBefore = new Map();
  const solid = (rgb, extra = {}) => ({ paint: { type: 'solid', color: { space: 'rgb', values: rgb } }, ...extra });
  for (const original of doc.descendants(null)) {
    if (original.type === 'group' && original.blend && isOutputNode(doc, original.id) && geometry.blendSteps)
      for (const pair of geometry.blendSteps(original.id)) blendBefore.set(pair.before, { group: original, steps: pair.steps });
    const blend = blendBefore.get(original.id);
    if (blend && picked(blend.group.id)) {
      const world = geometry.worldMatrix(blend.group.id);
      for (const { subpaths, look } of blend.steps) {
        const pts = subpaths.flatMap((sp) => sp.segments.map((g) => apply(world, g.p)));
        if (!pts.length) continue;
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        emit({ id: blend.group.id, type: 'path', fillRule: look.fillRule, appearance: { fills: look.fill ? [solid(look.fill)] : [], strokes: look.stroke && look.width > 0 ? [solid(look.stroke, { width: look.width })] : [] } }, subpaths, box);
      }
    }
    if (original.type === 'group' && original.clip) clipStart.set(original.children.at(-1)?.id, elements.length);
    if (original.children || !isOutputNode(doc, original.id) || !picked(original.id)) continue;
    if (original.type === 'image') {
      // Images go to Cut as engraving rasters: centre, size and rotation on the artboard, in mm.
      const asset = doc.data.assets?.[original.assetId], box = geometry.bounds(original.id);
      if (original.reference || !asset?.data) { skipped.images++; continue; }
      if (!onBoard(box)) { skipped.outside++; continue; }
      if (!only && !boards.some((b) => inside(box, b))) partly++;
      const w = original.width ?? asset.width * 25.4 / 96, h = original.height ?? asset.height * 25.4 / 96;
      const m = multiply(toBoard, geometry.worldMatrix(original.id)), x = vector(m, [w, 0]), y = vector(m, [0, h]);
      if (Math.abs(x[0] * y[0] + x[1] * y[1]) > 1e-6 * Math.hypot(...x) * Math.hypot(...y) || x[0] * y[1] - x[1] * y[0] < 0) skewed++;
      if (doc.ancestors(original.id).some((a) => a.type === 'group' && a.clip)) maskedImages++;
      const [cx, cy] = apply(m, [w / 2, h / 2]);
      images.push({ assetId: original.assetId, ...(original.crop ? { crop: { ...original.crop } } : {}), dataUrl: `data:${asset.mimeType ?? 'image/png'};base64,${asset.data}`, x: cx, y: cy, width: Math.hypot(...x), height: Math.hypot(...y), rotation: Math.atan2(x[1], x[0]) * 180 / Math.PI });
      continue;
    }
    if (original.type === 'text') {
      const node=geometry.resolvedText?.(original.id)??original,box=geometry.bounds(node.id);
      if(!onBoard(box)){skipped.outside++;continue;}
      if(!hasTextLayout(node)){errors.push('Text needs a resolved font before sending. Open Edit Text and choose an available font.');continue;}
      if(node.layout.overflow){errors.push(node.kind==='onPath'?'Text does not fit on its path. Shorten the text or use a longer path before sending to Cut.':'Text overflows its frame. Enlarge the frame before sending to Cut.');continue;}
      textCount++;
      for(const glyph of node.layout.glyphs)if(glyph.subpaths.length)emit(node,glyph.subpaths,geometry.glyphBounds?.(node.id,glyph.subpaths)??box);
    } else if (original.type === 'path' || original.type === 'shape') {
      const subpaths = geometry.subpaths(original.id) ?? [], box = geometry.bounds(original.id);
      if (clipStart.has(original.id) && shown(original.appearance?.fills).length && shown(original.appearance?.strokes).length) {
        emit({ ...original, appearance: { ...original.appearance, strokes: [] } }, subpaths, box, clipStart.get(original.id));
        emit({ ...original, appearance: { ...original.appearance, fills: [] } }, subpaths, box);
      } else emit(original, subpaths, box, clipStart.has(original.id) && shown(original.appearance?.fills).length ? clipStart.get(original.id) : elements.length);
    }
  }
  const warnings = [];
  if (skipped.images) warnings.push(`${skipped.images} reference image${skipped.images === 1 ? ' is' : 's are'} not sent.`);
  if (skewed) warnings.push(`${skewed} image${skewed === 1 ? ' is' : 's are'} skewed or flipped; Cut gets ${skewed === 1 ? 'it' : 'them'} rotated and scaled only.`);
  if (maskedImages) warnings.push(`${maskedImages} image${maskedImages === 1 ? ' is' : 's are'} inside a clipping mask and ${maskedImages === 1 ? 'is' : 'are'} sent whole.`);
  if (partly) warnings.push(`${partly} object${partly === 1 ? ' extends' : 's extend'} past the artboard and ${partly === 1 ? 'is' : 'are'} sent whole.`);
  if (clipped) warnings.push(`${clipped} object${clipped === 1 ? ' is' : 's are'} cut at the artboard edge.`);
  if (tiny) warnings.push(`${tiny} segment${tiny === 1 ? ' is' : 's are'} shorter than 0.05 mm. Object > Path > Clean Up or Simplify can remove them.`);
  if (duplicates) warnings.push(dedupe ? `${duplicates} duplicate path${duplicates === 1 ? ' is' : 's are'} left out so nothing is cut twice.` : `${duplicates} path${duplicates === 1 ? ' is' : 's are'} exactly on top of another and will be cut twice.`);
  if (stacked) warnings.push(`${stacked} object${stacked === 1 ? ' has' : 's have'} several fills or strokes; only the first of each is sent.`);
  if (openFilled) warnings.push(`${openFilled} open path${openFilled === 1 ? ' has' : 's have'} a fill; Cut follows the open line.`);
  const W = fmt(board.width), H = fmt(board.height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n${elements.join('\n')}\n</svg>\n`;
  return { svg, count: elements.length, images, warnings, skipped, errors:[...new Set(errors)], textCount, nodes, duplicates, tiny };
}
