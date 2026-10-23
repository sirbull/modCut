/**
 * The gradient annotator (Gradient tool, D2.3): the gradient's vector drawn on the object, with the
 * origin (circle), the end (square), one marker per stop and, for radial gradients, the dashed circle
 * it reaches. For a freeform gradient: its points, its lines (Lines mode) and, round the selected
 * point, a dashed ring whose handle sets the spread. Geometry lives in the object's own coordinates;
 * `toWorld(id)` gives its matrix and `inside(id, point)` tells whether a world point is on the object.
 */
import { colorHex, gradientVector, isGradient } from '../doc/gradient.mjs';
import { isFreeform, lineSegments } from '../doc/freeform.mjs';

const INK = '#071411', HALO = '#FFFFFF', ACTIVE = '#1473E6';

export function createGradientAnnotator(scope, layer, state, toWorld, inside = () => false) {
  const group = new scope.Group({ insert: false, name: 'Gradient annotator' }); layer.addChild(group);
  let target = () => null, shown = null;
  // The annotated fill or stroke: `{ id, kind, gradient }` of the first painted object, or null.
  function current() {
    if (state.ui?.tool !== 'gradient' || state.document.readOnly) return null;
    const t = target(), node = t && state.document.getNode(t.id), matrix = t && toWorld(t.id);
    const entry = node?.appearance && (t.kind === 'stroke' ? node.appearance.strokes : node.appearance.fills)[0];
    return matrix && (isGradient(entry?.paint) || (isFreeform(entry?.paint) && t.kind === 'fill')) ? { ...t, gradient: entry.paint, matrix } : null;
  }
  function geometry(info) {
    const { origin, destination } = gradientVector(info.gradient), m = info.matrix;
    const a = new scope.Point(origin).transform(m), b = new scope.Point(destination).transform(m);
    // Stop markers sit 12 px beside the line, so none hides under a handle.
    const d = b.subtract(a), side = d.length > 0 ? new scope.Point(-d.y, d.x).normalize(12 / scope.view.zoom) : new scope.Point(0, 12 / scope.view.zoom);
    const at = (offset) => a.add(d.multiply(offset));
    return { a, b, at, marker: (offset) => at(offset).add(side) };
  }
  // Freeform geometry in world coordinates: points, the selected point's ring and handle, and line segments.
  function freeform(info) {
    const g = info.gradient, m = info.matrix, scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const points = g.points.map((p) => new scope.Point(p.position).transform(m)), selected = Math.min(state.ui.gradientStop ?? 0, g.points.length - 1);
    // The ring shows the spread, and never gets smaller than a size you can grab.
    const ring = Math.max((g.points[selected].spread ?? 0) * scale, 18 / scope.view.zoom), handle = points[selected].add(new scope.Point(0, ring));
    const segments = lineSegments(g).map((s) => ({ ...s, wa: new scope.Point(s.a).transform(m), wb: new scope.Point(s.b).transform(m) }));
    return { g, points, selected, ring, handle, segments, scale };
  }
  function drawFreeform(info, add, removing) {
    const z = scope.view.zoom, { g, points, selected, ring, handle, segments } = freeform(info);
    for (const s of segments) add(new scope.Path.Line({ from: s.wa, to: s.wb, strokeColor: HALO, strokeWidth: 3.5 / z, strokeCap: 'round' }));
    for (const s of segments) add(new scope.Path.Line({ from: s.wa, to: s.wb, strokeColor: INK, strokeWidth: 1.4 / z, strokeCap: 'round' }));
    add(new scope.Path.Circle({ center: points[selected], radius: ring, strokeColor: HALO, strokeWidth: 3 / z }));
    add(new scope.Path.Circle({ center: points[selected], radius: ring, strokeColor: INK, strokeWidth: 1 / z, dashArray: [3 / z, 3 / z] })).data.gradientRing = true;
    add(new scope.Path.Circle({ center: handle, radius: 4.5 / z, fillColor: HALO, strokeColor: INK, strokeWidth: 1.2 / z }));
    add(new scope.Path.Circle({ center: handle, radius: 1.6 / z, fillColor: INK }));
    g.points.forEach((point, i) => {
      const on = i === selected;
      const ring = add(new scope.Path.Circle({ center: points[i], radius: (on ? 7.5 : 6) / z, fillColor: HALO, strokeColor: on ? ACTIVE : INK, strokeWidth: (on ? 2.4 : 1.2) / z }));
      const dot = add(new scope.Path.Circle({ center: points[i], radius: (on ? 4.5 : 3.5) / z, fillColor: colorHex(point.color) ?? '#000000', strokeColor: INK, strokeWidth: .8 / z }));
      if (removing === i) { ring.opacity = dot.opacity = .35; ring.dashArray = [2 / z, 2 / z]; }
    });
  }
  function hitFreeform(info, p) {
    const z = scope.view.zoom, { g, points, selected, handle, segments } = freeform(info), base = { id: info.id, kind: info.kind };
    const local = () => { const q = p.transform(info.matrix.inverted()); return [q.x, q.y]; };
    let best = null;
    points.forEach((q, index) => { const d = q.getDistance(p); if (d <= 8 / z && (!best || d < best.d)) best = { d, index }; });
    if (best) return { ...base, part: 'point', index: best.index };
    if (handle.getDistance(p) <= 7 / z) return { ...base, part: 'spread', index: selected };
    for (const s of segments) {
      const v = s.wb.subtract(s.wa), len2 = v.dot(v), t = len2 > 0 ? Math.min(1, Math.max(0, p.subtract(s.wa).dot(v) / len2)) : 0;
      if (s.wa.add(v.multiply(t)).getDistance(p) <= 5 / z) return { ...base, part: 'segment', from: s.from, to: s.to, position: local() };
    }
    if (inside(info.id, p)) return { ...base, part: 'inside', position: local(), selected, mode: g.mode };
    return null;
  }
  return {
    setTarget(fn) { target = fn ?? (() => null); },
    update({ removing = null } = {}) {
      group.removeChildren(); shown = current(); if (!shown) return;
      group.bringToFront();
      const add = (item) => { item.remove(); group.addChild(item); return item; };
      if (isFreeform(shown.gradient)) { drawFreeform(shown, add, removing); return; }
      const z = scope.view.zoom, { a, b, at, marker: markerAt } = geometry(shown), g = shown.gradient, selected = Math.min(state.ui.gradientStop ?? 0, g.stops.length - 1);
      if (g.type === 'radial') add(new scope.Path.Circle({ center: a, radius: a.getDistance(b), strokeColor: INK, strokeWidth: 1 / z, dashArray: [4 / z, 3 / z] }));
      add(new scope.Path.Line({ from: a, to: b, strokeColor: HALO, strokeWidth: 4 / z }));
      add(new scope.Path.Line({ from: a, to: b, strokeColor: INK, strokeWidth: 1.5 / z }));
      add(new scope.Path.Circle({ center: a, radius: 5 / z, fillColor: HALO, strokeColor: INK, strokeWidth: 1.2 / z })).data.gradientHandle = 'origin';
      add(new scope.Path.Rectangle({ point: b.subtract(4 / z), size: 8 / z, fillColor: INK, strokeColor: HALO, strokeWidth: 1 / z })).data.gradientHandle = 'end';
      g.stops.forEach((stop, i) => {
        const p = markerAt(stop.offset), r = (i === selected ? 6 : 5) / z;
        add(new scope.Path.Line({ from: at(stop.offset), to: p, strokeColor: INK, strokeWidth: 1 / z }));
        const marker = add(new scope.Path.Circle({ center: p, radius: r, fillColor: colorHex(stop.color) ?? '#000000', strokeColor: i === selected ? ACTIVE : INK, strokeWidth: (i === selected ? 2.4 : 1.4) / z }));
        if (removing === i) { marker.opacity = .35; marker.dashArray = [2 / z, 2 / z]; }
        add(new scope.Path.Circle({ center: p, radius: r + 1.5 / z, strokeColor: HALO, strokeWidth: 1 / z }));
      });
    },
    /**
     * What is under `point` (world): a stop, the end, the origin or the line (with its offset), or null.
     * Stop markers sit beside the line, so the first and last stop stay apart from the handles.
     * Freeform: a point, the spread handle, a line segment or the inside of the object (with the place).
     */
    hit(point) {
      const info = current(); if (!info) return null;
      if (isFreeform(info.gradient)) return hitFreeform(info, new scope.Point(point));
      const z = scope.view.zoom, { a, b, at, marker } = geometry(info), p = new scope.Point(point), g = info.gradient;
      const base = { id: info.id, kind: info.kind };
      let best = null;
      g.stops.forEach((stop, index) => { const d = marker(stop.offset).getDistance(p); if (d <= 7 / z && (!best || d < best.d)) best = { d, index }; });
      if (best) return { ...base, part: 'stop', index: best.index };
      if (b.getDistance(p) <= 7 / z) return { ...base, part: 'end' };
      if (a.getDistance(p) <= 7 / z) return { ...base, part: 'origin' };
      const v = b.subtract(a), len2 = v.dot(v); if (!(len2 > 0)) return null;
      const t = p.subtract(a).dot(v) / len2;
      if (t > 0 && t < 1 && at(t).getDistance(p) <= 5 / z) return { ...base, part: 'line', offset: t };
      return null;
    },
    /** Offset along the vector for a world point, and its distance from the line in screen pixels. */
    project(point) {
      const info = current(); if (!info || isFreeform(info.gradient)) return null;
      const { a, b, at } = geometry(info), p = new scope.Point(point), v = b.subtract(a), len2 = v.dot(v);
      const t = len2 > 0 ? Math.min(1, Math.max(0, p.subtract(a).dot(v) / len2)) : 0;
      return { offset: t, distance: at(t).getDistance(p) * scope.view.zoom };
    },
    /** Freeform: the spread (the object's own units) of a ring from the selected point out to `point`. */
    spreadAt(point) {
      const info = current(); if (!info || !isFreeform(info.gradient)) return null;
      const { points, selected, scale } = freeform(info);
      return points[selected].getDistance(new scope.Point(point)) / scale;
    },
    destroy() { group.remove(); },
  };
}
