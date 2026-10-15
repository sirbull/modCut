/**
 * Pathfinder on Paper.js items with exact Bézier booleans (curves are kept, not polygonized).
 * Operands are world-space Path/CompoundPath items, ordered back to front. No DOM, no document access:
 * callers turn the returned subpaths into document nodes. Inputs are never mutated or inserted.
 */
export const SHAPE_MODES = Object.freeze(['unite', 'minusFront', 'intersect', 'exclude']);
export const PATHFINDERS = Object.freeze(['divide', 'trim', 'merge', 'crop', 'outline', 'minusBack']);
export const PATHFINDER_LABELS = Object.freeze({
  unite: 'Unite', minusFront: 'Minus Front', intersect: 'Intersect', exclude: 'Exclude',
  divide: 'Divide', trim: 'Trim', merge: 'Merge', crop: 'Crop', outline: 'Outline', minusBack: 'Minus Back',
});
const MIN_AREA = 1e-6;
const opts = { insert: false };

export function toSubpaths(item) {
  const parts = item.className === 'CompoundPath' ? item.children : [item];
  return parts.filter((p) => p.segments.length).map((p) => ({
    closed: p.closed,
    segments: p.segments.map((s) => ({ p: [s.point.x, s.point.y], in: [s.handleIn.x, s.handleIn.y], out: [s.handleOut.x, s.handleOut.y] })),
  }));
}
// Paper's results can mix ring orientations (Exclude does), so measure each ring's own area.
const size = (item) => item.children ? item.children.reduce((sum, c) => sum + Math.abs(c.area), 0) : Math.abs(item.area);
const empty = (item) => !item || size(item) < MIN_AREA;
const unite = (items) => items.reduce((a, b) => a ? a.unite(b, opts) : b.clone(opts), null);

/**
 * @param operands [{ id, item, fill }] back to front; `fill` is a hex used by Merge.
 * @returns {{ results: [{ subpaths, sourceId, kind: 'fill'|'outline' }], grouped: boolean }}
 */
export function runPathfinder(operands, op) {
  if (!SHAPE_MODES.includes(op) && !PATHFINDERS.includes(op)) throw new Error(`Unknown Pathfinder operation: ${op}`);
  if (operands.length < 2) throw new Error('Select at least two objects for Pathfinder.');
  for (const o of operands) o.item.closed = true;
  const items = operands.map((o) => o.item), back = operands[0], front = operands.at(-1);
  const out = [];
  const push = (item, sourceId, kind = 'fill') => { if (!empty(item)) out.push({ subpaths: toSubpaths(item), sourceId, kind }); };
  // Each operand minus everything in front of it (within `list`).
  const trimmed = (list = operands) => list.map((o, i) => {
    const above = unite(list.slice(i + 1).map((x) => x.item));
    return { ...o, piece: above ? o.item.subtract(above, opts) : o.item.clone(opts) };
  });
  if (op === 'unite') push(unite(items), front.id);
  else if (op === 'intersect') push(items.slice(1).reduce((a, b) => a.intersect(b, opts), items[0]), front.id);
  else if (op === 'exclude') push(items.slice(1).reduce((a, b) => a.exclude(b, opts), items[0]), front.id);
  else if (op === 'minusFront') push(back.item.subtract(unite(items.slice(1)), opts), back.id);
  else if (op === 'minusBack') push(front.item.subtract(unite(items.slice(0, -1)), opts), front.id);
  else if (op === 'trim') for (const t of trimmed()) push(t.piece, t.id);
  else if (op === 'crop') {
    // The front object is the boundary: keep what shows beneath it, then remove the boundary itself.
    for (const t of trimmed(operands.slice(0, -1))) push(t.piece.intersect(front.item, opts), t.id);
  } else if (op === 'merge') {
    // Trim, then join the visible pieces that share a fill color.
    const byFill = new Map();
    for (const t of trimmed()) { if (empty(t.piece)) continue; const key = t.fill ?? `none:${t.id}`; if (!byFill.has(key)) byFill.set(key, []); byFill.get(key).push(t); }
    for (const group of byFill.values()) push(unite(group.map((t) => t.piece)), group.at(-1).id);
  } else {
    // Divide (and Outline): every region bounded by the operands, owned by the frontmost operand covering it.
    let regions = [];
    operands.forEach((o, i) => {
      const next = [];
      for (const r of regions) {
        const inside = r.item.intersect(o.item, opts), outside = r.item.subtract(o.item, opts);
        if (!empty(outside)) next.push({ item: outside, sourceId: r.sourceId });
        if (!empty(inside)) next.push({ item: inside, sourceId: o.id });
      }
      const covered = unite(items.slice(0, i));
      const rest = covered ? o.item.subtract(covered, opts) : o.item.clone(opts);
      if (!empty(rest)) next.push({ item: rest, sourceId: o.id });
      regions = next;
    });
    for (const r of regions) push(r.item, r.sourceId, op === 'outline' ? 'outline' : 'fill');
  }
  return { results: out, grouped: PATHFINDERS.includes(op) };
}
