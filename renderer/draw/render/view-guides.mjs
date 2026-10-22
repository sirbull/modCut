import { activeArtboard } from '../doc/artboards.mjs';
import { RULER_SIZE, guideSegment, rulerNumber, rulerScale, rulerTicks, rulerUnit } from '../view/rulers.mjs';

// View geometry stays outside the model, hit testing and artwork exports.
export function createViewGuides(scope, state, boards, overlay) {
  const grid = new scope.Group({ insert: false, name: 'View grid' });
  const rulers = new scope.Group({ insert: false, applyMatrix: false, name: 'View rulers' }); overlay.addChild(rulers);
  const guides = new scope.Group({ insert: false, applyMatrix: false, name: 'Ruler guides' }); overlay.addChild(guides);
  const markers = new scope.Group({ insert: false, applyMatrix: false, name: 'Ruler pointer' }); overlay.addChild(markers);
  const label = new scope.Group({ insert: false, applyMatrix: false, name: 'Ruler guide label' }); overlay.addChild(label);
  let pointer = null, preview = null, pointerColor = '#435A50';
  let previous = '';
  const line = (parent, from, to, color, width) => parent.addChild(new scope.Path.Line({ insert: false, from, to, strokeColor: color, strokeWidth: width }));
  const adaptive = (spacing, zoom) => spacing * Math.pow(2, Math.max(0, Math.ceil(Math.log2(8 / (spacing * zoom)))));
  function updatePointer() {
    markers.removeChildren(); markers.matrix = scope.view.matrix.inverted(); markers.bringToFront();
    if (!state.ui?.rulers || !pointer) return;
    const { width, height } = scope.view.viewSize, size = RULER_SIZE;
    if (pointer.x >= size && pointer.x <= width) line(markers, [pointer.x, 0], [pointer.x, size], pointerColor, 1);
    if (pointer.y >= size && pointer.y <= height) line(markers, [0, pointer.y], [size, pointer.y], pointerColor, 1);
  }
  // Solid guides one device pixel wide on whole pixels, so they stay crisp at every zoom level.
  function crisp([a, b]) {
    const ratio = scope.view.pixelRatio || 1, width = Math.max(1, Math.round(ratio)) / ratio;
    const pixel = v => (Math.round(v * ratio - width * ratio / 2) + width * ratio / 2) / ratio;
    if (Math.abs(a.x - b.x) < 1e-6) { const x = pixel(a.x); return [[x, a.y], [x, b.y], width]; }
    if (Math.abs(a.y - b.y) < 1e-6) { const y = pixel(a.y); return [[a.x, y], [b.x, y], width]; }
    return [a, b, width];
  }
  // The dragged guide's value beside the line, clear of the pointer and above all artwork.
  function updateLabel(segment) {
    label.removeChildren(); label.matrix = scope.view.matrix.inverted(); label.bringToFront();
    if (!preview?.label || !segment || !pointer) return;
    const [a, b] = segment, delta = b.subtract(a), inset = state.ui?.rulers ? RULER_SIZE : 0;
    const t = Math.max(0, Math.min(1, pointer.subtract(a).dot(delta) / (delta.dot(delta) || 1))), at = a.add(delta.multiply(t));
    const text = new scope.PointText({ insert: false, content: preview.label, fontSize: 11, fontFamily: 'Segoe UI, system-ui, sans-serif', fillColor: '#FFFFFF' });
    const w = Math.ceil(text.bounds.width) + 12, h = 20, { width, height } = scope.view.viewSize;
    let x, y;
    if (Math.abs(delta.x) < Math.abs(delta.y)) {
      x = at.x + 10; if (x + w > width - 4) x = at.x - 10 - w;
      y = pointer.y - 22 - h; if (y < inset + 4) y = pointer.y + 26;
    } else {
      y = at.y - 10 - h; if (y < inset + 4) y = at.y + 10;
      x = pointer.x + 22; if (x + w > width - 4) x = pointer.x - 22 - w;
    }
    x = Math.round(Math.max(inset + 4, Math.min(width - 4 - w, x))); y = Math.round(Math.max(inset + 4, Math.min(height - 4 - h, y)));
    label.addChild(new scope.Path.Rectangle({ insert: false, rectangle: [x, y, w, h], radius: 3, fillColor: preview.snapped ? '#006B5C' : '#1473E6' }));
    text.point = new scope.Point(x + 6, y + 14); label.addChild(text);
  }
  function updateGuides() {
    guides.removeChildren(); guides.matrix = scope.view.matrix.inverted();
    guides.bringToFront(); rulers.bringToFront();
    let previewSegment = null;
    for (const guide of [...(state.ui?.rulerGuides ?? []), ...(preview ? [preview] : [])]) {
      if (guide === preview?.source) continue;
      const segment = guideSegment(scope, guide, state.ui?.rulers ? RULER_SIZE : 0);
      if (!segment) continue;
      if (guide === preview) previewSegment = segment;
      const [from, to, width] = crisp(segment);
      line(guides, from, to, guide === preview && preview.snapped ? '#006B5C' : '#1473E6', width).data.rulerGuide = true;
    }
    updateLabel(previewSegment);
    updatePointer();
  }
  return {
    setPointer(point) { pointer = point; updatePointer(); },
    setGuidePreview(guide) { preview = guide; updateGuides(); },
    refreshGuides: updateGuides,
    update({ foreground = '#435A50', background = '#E7F5EF' } = {}) {
      const view = scope.view, board = activeArtboard(state), spacing = state.document.data.settings.grid;
      pointerColor = foreground;
      const unit = rulerUnit(state);
      const signature = JSON.stringify([view.matrix.values, view.viewSize, board, unit.id, state.ui?.grid, state.ui?.rulers, spacing, foreground, background]);
      if(state.ui?.grid)boards.addChild(grid);else grid.remove();
      updateGuides();
      if (signature === previous) return; previous = signature;
      grid.removeChildren(); rulers.removeChildren(); grid.visible = !!state.ui?.grid; rulers.visible = !!state.ui?.rulers;
      if (grid.visible) {
        const bounds = view.bounds, zoom = view.zoom;
        // Thin dense grids at extreme zoom levels, keeping grid alignment.
        const sx = adaptive(spacing.x, zoom), sy = adaptive(spacing.y, zoom);
        // Neutral grey stays visible over white artboards in both app themes.
        const color = new scope.Color('#808080'); color.alpha = .28;
        for (let x = board.x + Math.ceil((bounds.left - board.x) / sx) * sx; x <= bounds.right; x += sx) line(grid, [x, bounds.top], [x, bounds.bottom], color, .7 / zoom);
        for (let y = board.y + Math.ceil((bounds.top - board.y) / sy) * sy; y <= bounds.bottom; y += sy) line(grid, [bounds.left, y], [bounds.right, y], color, .7 / zoom);
      }
      if (!rulers.visible) return;
      // Screen coordinates keep the strips fixed while Rotate View is active.
      rulers.matrix = view.matrix.inverted();
      const { width, height } = view.viewSize, size = RULER_SIZE;
      for (const rectangle of [[0, 0, width, size], [0, 0, size, height]]) rulers.addChild(new scope.Path.Rectangle({ insert: false, rectangle, fillColor: background }));
      line(rulers, [0, size], [width, size], foreground, .5); line(rulers, [size, 0], [size, height], foreground, .5);
      for (const axis of ['x', 'y']) {
        const horizontal = axis === 'x', end = horizontal ? width : height;
        const scale = rulerScale(unit, board, axis);
        const at = p => (view.viewToProject(new scope.Point(...(horizontal ? [p, size] : [size, p])))[axis] - board[axis]) / scale;
        for (const { value, pixel, major: big } of rulerTicks(at(size), at(end), end - size)) {
          const p = size + pixel;
          line(rulers, horizontal ? [p, size] : [size, p], horizontal ? [p, size - (big ? 8 : 4)] : [size - (big ? 8 : 4), p], foreground, .7);
          if (big) {
            const point = horizontal ? [p + 3, 10] : [10, p - 3];
            const text = new scope.PointText({ insert: false, point, content: rulerNumber(value), fillColor: foreground, fontSize: 9, data: { rulerAxis: axis, rulerValue: value } });
            if (!horizontal) text.rotate(-90, new scope.Point(point));
            rulers.addChild(text);
          }
        }
        // The artboard's middle is always marked across the full ruler, whatever the unit or zoom.
        const first = at(size), slope = (at(end) - first) / (end - size), middle = board[horizontal ? 'width' : 'height'] / 2 / scale;
        const p = size + (middle - first) / slope;
        if (Number.isFinite(p) && p >= size && p <= end) {
          const [from, to, width] = crisp(horizontal ? [new scope.Point(p, 0), new scope.Point(p, size)] : [new scope.Point(0, p), new scope.Point(size, p)]);
          line(rulers, from, to, '#1473E6', width).data.rulerMiddle = axis;
          const c = horizontal ? from[0] : from[1], notch = horizontal ? [[c - 4, size], [c + 4, size], [c, size - 5]] : [[size, c - 4], [size, c + 4], [size - 5, c]];
          rulers.addChild(new scope.Path({ insert: false, segments: notch, closed: true, fillColor: '#1473E6' }));
        }
      }
      rulers.addChild(new scope.Path.Rectangle({ insert: false, rectangle: [0, 0, size, size], fillColor: background }));
      rulers.addChild(new scope.PointText({ insert: false, point: [3, 15], content: unit.id, fontSize: 9, fillColor: foreground }));
    },
    destroy() { grid.remove(); rulers.remove(); guides.remove(); markers.remove(); label.remove(); },
  };
}
