import { activeArtboard } from '../doc/artboards.mjs';
import { createGuideSnapper, guideReadout, guideReadoutText, guideSegment, rulerAt, rulerUnit, RULER_SIZE } from '../view/rulers.mjs';

/** Capture ruler gestures before drawing tools; guides belong only to this tab's view. */
export function createRulerInteractions(canvas, state, api) {
  const { scope, renderer, withScope } = api, controller = new AbortController();
  const events = { signal: controller.signal, capture: true };
  let drag = null; const snapper = createGuideSnapper();
  const screen = event => {
    const box = canvas.getBoundingClientRect();
    return new scope.Point((event.clientX - box.left) * scope.view.viewSize.width / box.width,
      (event.clientY - box.top) * scope.view.viewSize.height / box.height);
  };
  const ruler = p => rulerAt(p, scope.view.viewSize, state.ui?.rulers);
  const inside = p => p.x >= (state.ui?.rulers ? RULER_SIZE : 0) && p.y >= (state.ui?.rulers ? RULER_SIZE : 0)
    && p.x <= scope.view.viewSize.width && p.y <= scope.view.viewSize.height;
  function guideAt(p) {
    // Hidden or locked guides cannot be picked up; new ones can still be pulled from the rulers.
    if (!inside(p) || state.ui.guidesHidden || state.ui.guidesLocked) return null;
    let nearest = null, distance = 5;
    for (const guide of state.ui.rulerGuides ?? []) {
      const segment = guideSegment(scope, guide, state.ui?.rulers ? RULER_SIZE : 0);
      if (!segment) continue;
      const [a, b] = segment, delta = b.subtract(a);
      const t = Math.max(0, Math.min(1, p.subtract(a).dot(delta) / (delta.dot(delta) || 1)));
      const next = p.getDistance(a.add(delta.multiply(t)));
      if (next <= distance) { nearest = guide; distance = next; }
    }
    return nearest;
  }
  function draw(fn) { withScope(() => { fn(); renderer.requestDraw(); }); }
  function cancel() {
    if (!drag) return false;
    const pointerId = drag.pointerId; drag = null; state.ui.guideReadout = null;
    draw(() => renderer.viewGuides.setGuidePreview(null));
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    canvas.style.cursor = api.cursor(); api.status();
    return true;
  }
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function move(event) {
    const p = screen(event);
    if (drag) {
      if (event.pointerId !== drag.pointerId) return;
      stop(event);
      const world = scope.view.viewToProject(p), board = activeArtboard(state);
      // Alt drags freely; otherwise the guide is drawn to quarters, thirds and the middle until pulled past them.
      const { value, fraction } = snapper.snap(world[drag.axis] + drag.offset, board, drag.axis, scope.view.zoom, !event.altKey);
      drag.value = value;
      const guide = { axis: drag.axis, value }, unit = rulerUnit(state).id, { values } = guideReadout(guide, board);
      const first = values[unit] ? unit : 'mm', label = `${values[first]}  ·  ${first === '%' ? values.mm : values['%']}`;
      state.ui.guideReadout = guideReadoutText(guide, board, unit) + (fraction !== null ? '  (snapped)' : '');
      draw(() => {
        renderer.viewGuides.setPointer(p);
        renderer.viewGuides.setGuidePreview({ ...guide, source: drag.source, label, snapped: fraction !== null });
      });
      api.status(world);
      return;
    }
    if (state.ui?.rulers) draw(() => renderer.viewGuides.setPointer(p));
    if (event.buttons || api.busy()) return;
    const axis = ruler(p), guide = !['hand', 'zoom', 'rotate-view'].includes(api.tool()) && guideAt(p);
    if (axis || guide) {
      stop(event);
      canvas.style.cursor = axis === 'corner' ? 'default' : (guide?.axis ?? axis) === 'x' ? 'ew-resize' : 'ns-resize';
    }
  }
  canvas.addEventListener('pointerdown', event => {
    if (drag) { stop(event); return; }
    if (event.button !== 0 || api.busy()) return;
    const p = screen(event), axis = ruler(p);
    const source = !axis && !['hand', 'zoom', 'rotate-view'].includes(api.tool()) ? guideAt(p) : null;
    if (!axis && !source) return;
    stop(event); api.closeMenus(); canvas.focus({ preventScroll: true });
    if (axis === 'corner') return;
    const world = scope.view.viewToProject(p), guideAxis = source?.axis ?? axis;
    drag = { axis: guideAxis, source, offset: source ? source.value - world[guideAxis] : 0,
      value: source?.value ?? world[guideAxis], pointerId: event.pointerId };
    snapper.reset(source && { value: source.value, axis: source.axis, board: activeArtboard(state), pixel: scope.view.zoom });
    canvas.setPointerCapture(event.pointerId);
    move(event);
  }, events);
  canvas.addEventListener('pointermove', move, events);
  canvas.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    move(event); stop(event);
    const p = screen(event), finished = drag;
    state.ui.rulerGuides ??= [];
    if (finished.source) state.ui.rulerGuides = state.ui.rulerGuides.filter(guide => guide !== finished.source);
    if (inside(p)) state.ui.rulerGuides.push({ axis: finished.axis, value: finished.value });
    cancel();
  }, events);
  canvas.addEventListener('contextmenu', event => {
    if (!ruler(screen(event))) return;
    stop(event); cancel(); api.closeMenus();
    api.contextMenu(event.clientX, event.clientY, { rulerUnit: rulerUnit(state).id, onUnit: id => {
      state.ui.rulerUnit = id; withScope(() => renderer.updateView());
    } });
  }, events);
  canvas.addEventListener('dblclick', event => { const p = screen(event); if (ruler(p) || guideAt(p)) stop(event); }, events);
  for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if (drag && event.pointerId === drag.pointerId) { stop(event); cancel(); }
  }, events);
  canvas.addEventListener('pointerleave', () => draw(() => renderer.viewGuides.setPointer(null)), events);
  window.addEventListener('blur', () => { cancel(); draw(() => renderer.viewGuides.setPointer(null)); }, { signal: controller.signal });
  return { cancel, busy: () => !!drag, destroy() { cancel(); controller.abort(); } };
}
