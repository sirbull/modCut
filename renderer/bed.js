// The bed, on Paper.js. Project coordinates are millimetres (1 unit = 1 mm).
// - Space (or middle mouse) + drag = pan (hand cursor), tracked in absolute pixels
//   so it never judders.
// - Left drag on empty = marquee select. Click a shape = select it. Shift adds.
// - A selected set shows a transform box: drag inside = move, corner/edge handles =
//   scale, the top knob = rotate. Only drawn shapes are highlighted.
// Imported SVGs are flattened into the design layer so scale/rotate about a
// project-space anchor is always correct (no nested group transforms to fight).

const MM_PER_PX = 25.4 / 96;

export function createBed(stage, { bedWmm = 600, bedHmm = 400 } = {}) {
  const paper = window.paper;
  const canvas = document.createElement("canvas");
  canvas.className = "bed-canvas";
  stage.append(canvas);
  paper.setup(canvas);
  const view = paper.view;
  const P = (x, y) => new paper.Point(x, y);

  const bedLayer = new paper.Layer();
  const designLayer = new paper.Layer();
  const uiLayer = new paper.Layer(); // transform box + handles (guides)
  const simLayer = new paper.Layer(); // simulation ghost/trail/dot (kept off uiLayer so overlay redraws don't wipe it)
  const selected = new Set();
  let coordsCb = null, selectionCb = null, contextCb = null, spaceDown = false, changeCb = null, designAngle = 0;
  let gridX = 10, gridY = 10;                 // grid spacing in mm
  let currentTool = "select";                 // select | node | pen | rect | ellipse | line
  let pathOrder = "optimize";                 // "optimize" | "nearby" | "layer"
  let drawSizeCb = null, drawClickCb = null, toolResetCb = null;
  let drawColor = "#000000", drawWidth = 0.5; // style for new shapes
  let penPath = null, nodeHit = null, nodeEditItem = null;

  // --- bed + grid ---------------------------------------------------------
  function drawBed() {
    bedLayer.activate();
    bedLayer.removeChildren();
    const plate = new paper.Path.Rectangle(P(0, 0), new paper.Size(bedWmm, bedHmm));
    plate.fillColor = "white";
    plate.strokeColor = "#00AC69";
    plate.strokeWidth = 0.6;
    plate.guide = true;
    plate.shadowColor = new paper.Color(0.09, 0.13, 0.11, 0.18);
    plate.shadowBlur = 6;
    plate.shadowOffset = P(0, 3);
    let i = 0;
    for (let x = 0; x <= bedWmm + 0.001; x += gridX) gridLine([x, 0], [x, bedHmm], i++ % 5 === 0);
    i = 0;
    for (let y = 0; y <= bedHmm + 0.001; y += gridY) gridLine([0, y], [bedWmm, y], i++ % 5 === 0);
    designLayer.activate();
  }
  function gridLine(a, b, major) {
    const l = new paper.Path.Line(P(...a), P(...b));
    l.strokeColor = major ? "#CFE6DC" : "#E7F5EF";
    l.strokeWidth = major ? 0.4 : 0.2;
    l.guide = true;
  }
  function sizeCanvas() {
    const r = stage.getBoundingClientRect();
    view.viewSize = new paper.Size(r.width || 800, r.height || 600);
  }
  function fit() {
    sizeCanvas();
    view.zoom = Math.min(view.viewSize.width / (bedWmm * 1.1), view.viewSize.height / (bedHmm * 1.1)) || 1;
    view.center = P(bedWmm / 2, bedHmm / 2);
    drawOverlay();
  }
  function setBedSize(w, h) { bedWmm = w; bedHmm = h; drawBed(); fit(); }
  function setGrid(x, y) { gridX = Math.max(0.5, x || 10); gridY = Math.max(0.5, y || 10); drawBed(); view.update(); }
  function setTool(t) {
    if (nodeEditItem) { nodeEditItem.fullySelected = false; nodeEditItem = null; }
    if (penPath) finishPen();
    currentTool = t; clearSel(); emitSel(); setCursor(cursorForTool(t)); view.update();
  }
  function setPathOrder(o) { pathOrder = o; }
  window.addEventListener("resize", sizeCanvas);
  // NB: initial sizeCanvas/drawBed/fit run at the very end of createBed — fit()
  // calls drawOverlay(), which touches `handles` (declared below). Running it here
  // would hit that `let` in its temporal dead zone and throw, killing the app.

  const DEFAULT_RASTER_SETTINGS = { brightness: 0, contrast: 0, threshold: 128, gamma: 1, invert: false };

  // --- import (flattened into designLayer) --------------------------------
  const notifyChange = () => changeCb && changeCb();
  function clearDesign() {
    designLayer.removeChildren();
    selected.clear();
    designAngle = 0;
    emitSel();
    drawOverlay();
    view.update();
    notifyChange();
  }
  function flattenInto(item, layer) {
    for (const child of item.children.slice()) {
      if (child.className === "Group") flattenInto(child, layer);
      else layer.addChild(child);
    }
  }
  function releaseClipping(item) {
    if (!item) return;
    if (item.clipMask) { item.remove(); return; }
    if ("clipped" in item) item.clipped = false;
    if (item.children) for (const child of item.children.slice()) releaseClipping(child);
  }
  function loadSVG(node, wMm) {
    pushHistory();
    designLayer.activate();
    const before = new Set(designLayer.children);
    const g = paper.project.importSVG(node, { expandShapes: true, insert: true });
    releaseClipping(g);
    const sf = wMm && g.bounds.width ? wMm / g.bounds.width : MM_PER_PX;
    g.scale(sf, g.bounds.topLeft);
    g.position = P(bedWmm / 2, bedHmm / 2);
    if (g.className === "Group") { flattenInto(g, designLayer); g.remove(); } // single-shape SVGs import as a Path
    clearSel();
    for (const it of designLayer.children) if (!before.has(it) && isSelectableItem(it)) addSel(it);
    designAngle = 0;
    emitSel();
    view.update();
    notifyChange();
    return getDesign();
  }
  function loadImage(dataUrl, wMm) {
    pushHistory();
    designLayer.activate();
    const raster = new paper.Raster({ source: dataUrl, position: P(bedWmm / 2, bedHmm / 2) });
    raster.data.modcutRaster = true;
    raster.data.originalDataUrl = dataUrl;
    raster.data.rasterSettings = { ...DEFAULT_RASTER_SETTINGS };
    raster.smoothing = false;
    raster.onLoad = () => {
      if (wMm && raster.width) raster.scale(wMm / raster.width);
      raster.position = P(bedWmm / 2, bedHmm / 2);
      applyRasterSettings(raster);
      clearSel();
      addSel(raster);
      emitSel();
      view.update();
      notifyChange();
    };
  }
  function getDesign() {
    if (!designLayer.children.length) return null;
    const b = designLayer.bounds;
    return { wMm: b.width, hMm: b.height, xMm: b.x, yMm: b.y };
  }
  // distinct colors currently on the bed (import + drawn shapes)
  function getColors() {
    const map = new Map();
    for (const it of laserItems()) {
      const hex = it.className === "Raster" ? "#000000" : (css(it.strokeColor) || css(it.fillColor) || "#000000");
      map.set(hex, (map.get(hex) || 0) + 1);
    }
    return [...map.entries()].map(([color, count]) => ({ color, count }));
  }
  function makeShape(type, a, b) {
    designLayer.activate();
    let item;
    if (type === "ellipse") item = new paper.Path.Ellipse(new paper.Rectangle(a, b));
    else if (type === "line") item = new paper.Path.Line(a, b); // real endpoints, not the bbox diagonal
    else item = new paper.Path.Rectangle(new paper.Rectangle(a, b));
    item.strokeColor = drawColor;
    item.strokeWidth = drawWidth;
    item.fillColor = null;
    return item;
  }
  function addShape(type, wMm, hMm) {
    pushHistory();
    const w = Math.max(0.5, wMm), h = Math.max(0.5, hMm), cx = bedWmm / 2, cy = bedHmm / 2;
    if (type === "line") makeShape("line", P(cx - w / 2, cy), P(cx + w / 2, cy));
    else makeShape(type, P(cx - w / 2, cy - h / 2), P(cx + w / 2, cy + h / 2));
    view.update(); notifyChange();
  }
  // --- style (color + stroke width) for new shapes and the selection --------
  function setDrawStyle(color, width) { if (color) drawColor = color; if (width != null) drawWidth = width; }
  function applyStyle(color, width) {
    const roots = selected.size ? [...selected] : (nodeEditItem ? [nodeEditItem] : []);
    const targets = roots.flatMap((it) => vectorTargets(it));
    if (!targets.length) return;
    pushHistory();
    for (const it of targets) { if (color) it.strokeColor = color; if (width != null) it.strokeWidth = width; }
    if (color) drawColor = color; if (width != null) drawWidth = width;
    drawOverlay(); view.update(); notifyChange();
  }
  function getStyle() {
    const root = [...selected][0] || nodeEditItem;
    const it = firstLaserIn(root, isVectorItem) || root;
    if (it) return { color: css(it.strokeColor) || css(it.fillColor) || "#000000", width: it.strokeWidth || drawWidth };
    return { color: drawColor, width: drawWidth };
  }

  const isLaserItem = (it) =>
    (it.className === "Path" || it.className === "CompoundPath" || it.className === "Raster") &&
    !(it.parent && it.parent.className === "CompoundPath");
  const isVectorItem = (it) => it.className === "Path" || it.className === "CompoundPath";
  const isUserGroup = (it) => it && it.className === "Group" && it.data && it.data.modcutGroup;
  const isSelectableItem = (it) => isLaserItem(it) || isUserGroup(it);
  const laserItems = () => designLayer.getItems({ recursive: true, match: isLaserItem });
  const selectable = () => designLayer.children.filter(isSelectableItem);
  function firstLaserIn(it, match = () => true) {
    if (!it) return null;
    if (isLaserItem(it) && match(it)) return it;
    if (it.children) for (const child of it.children) {
      const found = firstLaserIn(child, match);
      if (found) return found;
    }
    return null;
  }
  function vectorTargets(it, out = []) {
    if (!it) return out;
    if (isVectorItem(it)) out.push(it);
    else if (it.children) for (const child of it.children) vectorTargets(child, out);
    return out;
  }
  function toSelectable(it) {
    let cur = it, top = null, group = null;
    while (cur && cur !== designLayer && cur.layer === designLayer) {
      if (isUserGroup(cur)) group = cur;
      if (cur.parent === designLayer && isSelectableItem(cur)) top = cur;
      cur = cur.parent;
    }
    return group || top;
  }
  function toEditableVector(it) {
    let cur = it;
    while (cur && cur !== designLayer && cur.layer === designLayer) {
      if (cur.className === "CompoundPath") return cur;
      if (cur.className === "Path") return cur.parent?.className === "CompoundPath" ? cur.parent : cur;
      cur = cur.parent;
    }
    return null;
  }

  // --- selection + transform overlay --------------------------------------
  // Selection is tracked in the Set only; the transform box (drawOverlay) is the
  // sole visual — we deliberately do NOT set item.selected (that draws every node
  // handle and looks like clutter).
  function clearSel() { selected.clear(); }
  function addSel(it) { selected.add(it); }
  function emitSel() { selectionCb && selectionCb(selected.size); drawOverlay(); }
  let selectionMode = "design"; // "design" = whole design, "element" = single shapes
  function setSelectionMode(m) { selectionMode = m; clearSel(); emitSel(); }
  // Whole-design selection = EVERY item on the layer (paths, text, rasters), so a
  // move/scale/rotate can never leave part of the design behind.
  function selectAllItems() { clearSel(); for (const it of selectable()) addSel(it); }

  // --- undo / redo (round-trips the design layer through Paper JSON) -------
  const undoStack = [], redoStack = [];
  function snapshot() { return designLayer.children.length ? designLayer.exportJSON({ asString: true }) : ""; }
  function restoreFrom(s) {
    designLayer.removeChildren(); selected.clear();
    if (s) {
      designLayer.activate();
      if (/^\s*</.test(s)) {
        const g = paper.project.importSVG(s, { expandShapes: true, insert: true });
        if (g && g.className === "Group") { flattenInto(g, designLayer); g.remove(); }
      } else {
        designLayer.importJSON(s);
      }
    }
    for (const child of designLayer.children.slice()) releaseClipping(child);
    reprocessRasters();
    drawOverlay(); view.update(); notifyChange();
  }
  function pushHistory() { undoStack.push(snapshot()); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restoreFrom(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restoreFrom(redoStack.pop()); }
  function resetHistory() { undoStack.length = 0; redoStack.length = 0; }
  function exportDesign() { return snapshot(); }
  function importDesign(s) {
    designLayer.removeChildren();
    selected.clear();
    designAngle = 0;
    if (s) {
      designLayer.activate();
      if (/^\s*</.test(s)) {
        const g = paper.project.importSVG(s, { expandShapes: true, insert: true });
        if (g && g.className === "Group") { flattenInto(g, designLayer); g.remove(); }
      } else {
        designLayer.importJSON(s);
      }
    }
    for (const child of designLayer.children.slice()) releaseClipping(child);
    resetHistory();
    reprocessRasters();
    emitSel();
    drawOverlay();
    view.update();
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
  function normalizeRasterSettings(settings = {}) {
    return {
      brightness: clamp(settings.brightness ?? DEFAULT_RASTER_SETTINGS.brightness, -100, 100),
      contrast: clamp(settings.contrast ?? DEFAULT_RASTER_SETTINGS.contrast, -100, 100),
      threshold: clamp(settings.threshold ?? DEFAULT_RASTER_SETTINGS.threshold, 0, 255),
      gamma: clamp(settings.gamma ?? DEFAULT_RASTER_SETTINGS.gamma, 0.2, 3),
      invert: !!settings.invert,
    };
  }
  function applyRasterSettings(raster) {
    if (!raster || raster.className !== "Raster") return;
    const original = raster.data.originalDataUrl || (typeof raster.toDataURL === "function" ? raster.toDataURL() : null);
    if (!original) return;
    const settings = normalizeRasterSettings(raster.data.rasterSettings);
    raster.data.rasterSettings = settings;
    const token = (raster.data.renderToken || 0) + 1;
    raster.data.renderToken = token;
    const img = new Image();
    img.onload = () => {
      if (!raster.data || raster.data.renderToken !== token) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, c.width, c.height);
      const data = image.data;
      const contrast = settings.contrast * 2.55;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      const brightness = settings.brightness * 2.55;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 8) {
          data[i] = data[i + 1] = data[i + 2] = 255;
          continue;
        }
        let gray = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        gray = factor * (gray - 128) + 128 + brightness;
        gray = 255 * Math.pow(clamp(gray, 0, 255) / 255, 1 / settings.gamma);
        const bw = gray >= settings.threshold ? 255 : 0;
        const v = settings.invert ? 255 - bw : bw;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
      raster.setImageData(image);
      raster.smoothing = false;
      view.update();
    };
    img.src = original;
  }
  function reprocessRasters() {
    for (const raster of laserItems().filter((it) => it.className === "Raster" && it.data?.originalDataUrl)) {
      applyRasterSettings(raster);
    }
  }
  function selectedRaster() {
    for (const it of selected) {
      const raster = firstLaserIn(it, (x) => x.className === "Raster" && x.data?.modcutRaster);
      if (raster) return raster;
    }
    return null;
  }
  let rasterEditOpen = false;
  function beginRasterEdit() { if (selectedRaster() && !rasterEditOpen) { pushHistory(); rasterEditOpen = true; } }
  function endRasterEdit() { if (rasterEditOpen) { rasterEditOpen = false; notifyChange(); } }
  function getRasterSettings() {
    const raster = selectedRaster();
    return raster ? normalizeRasterSettings(raster.data.rasterSettings) : null;
  }
  function updateRasterSettings(partial) {
    const raster = selectedRaster();
    if (!raster) return null;
    if (!rasterEditOpen) beginRasterEdit();
    raster.data.rasterSettings = normalizeRasterSettings({ ...raster.data.rasterSettings, ...partial });
    applyRasterSettings(raster);
    notifyChange();
    return getRasterSettings();
  }
  function resetRasterSettings() {
    const raster = selectedRaster();
    if (!raster) return null;
    beginRasterEdit();
    raster.data.rasterSettings = { ...DEFAULT_RASTER_SETTINGS };
    applyRasterSettings(raster);
    endRasterEdit();
    return getRasterSettings();
  }

  function selectionBounds() {
    let r = null;
    for (const it of selected) r = r ? r.unite(it.bounds) : it.bounds.clone();
    return r;
  }
  let handles = [];
  function drawOverlay() {
    uiLayer.removeChildren();
    handles = [];
    const b = selectionBounds();
    if (!b) { view.update(); return; }
    uiLayer.activate();
    const sw = 1 / view.zoom, hs = 4 / view.zoom;
    const box = new paper.Path.Rectangle(b);
    box.strokeColor = "#006B5C"; box.strokeWidth = sw; box.dashArray = [4 * sw, 3 * sw]; box.guide = true;
    const pts = { tl: b.topLeft, tr: b.topRight, br: b.bottomRight, bl: b.bottomLeft, tc: b.topCenter, bc: b.bottomCenter, lc: b.leftCenter, rc: b.rightCenter };
    const opp = { tl: "br", tr: "bl", br: "tl", bl: "tr", tc: "bc", bc: "tc", lc: "rc", rc: "lc" };
    for (const k in pts) {
      const p = pts[k];
      const h = new paper.Path.Rectangle(new paper.Rectangle(p.x - hs, p.y - hs, hs * 2, hs * 2));
      h.fillColor = "white"; h.strokeColor = "#006B5C"; h.strokeWidth = sw; h.guide = true;
      handles.push({ type: "scale", key: k, pos: p, anchor: pts[opp[k]] });
    }
    const rp = b.topCenter.subtract(P(0, 20 / view.zoom));
    const line = new paper.Path.Line(b.topCenter, rp);
    line.strokeColor = "#006B5C"; line.strokeWidth = sw; line.guide = true;
    const rh = new paper.Path.Circle(rp, hs);
    rh.fillColor = "#006B5C"; rh.guide = true;
    handles.push({ type: "rotate", pos: rp });
    designLayer.activate();
    view.update();
  }
  const handleAt = (pt) => handles.find((h) => pt.getDistance(h.pos) <= 7 / view.zoom) || null;

  // --- hover cursors ------------------------------------------------------
  const SCALE_CURSORS = { tl: "nwse-resize", br: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", tc: "ns-resize", bc: "ns-resize", lc: "ew-resize", rc: "ew-resize" };
  const ARROW_PATH = "M4 2 L4 19 L8.4 14.7 L11.1 21 L13.9 19.8 L11.2 13.5 L17 13.5 Z";
  const arrowCursor = (fill, stroke) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='${ARROW_PATH}' fill='${fill}' stroke='${stroke}' stroke-width='1.8' stroke-linejoin='round'/></svg>`)}") 4 2, default`;
  const SELECT_CURSOR = arrowCursor("#111111", "#ffffff");
  const NODE_CURSOR = arrowCursor("#ffffff", "#111111");
  const DRAW_CURSOR = "crosshair";
  const ROT_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#071411' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 11a9 9 0 0 1 15-6l3 3'/><path d='M21 3v5h-5'/><path d='M21 13a9 9 0 0 1-15 6l-3-3'/><path d='M3 21v-5h5'/></svg>";
  const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROT_SVG)}") 11 11, grab`;
  const cursorForTool = (tool) => tool === "select" ? SELECT_CURSOR : tool === "node" ? NODE_CURSOR : DRAW_CURSOR;
  function updateCursor(pt) {
    if (spaceDown) return; // grab already set on keydown
    if (currentTool !== "select") { setCursor(cursorForTool(currentTool)); return; }
    const h = handleAt(pt);
    if (h && selected.size) { setCursor(h.type === "rotate" ? ROTATE_CURSOR : SCALE_CURSORS[h.key] || "default"); return; }
    const b = selectionBounds();
    if (b && b.contains(pt)) { setCursor(SELECT_CURSOR); return; }
    const hit = paper.project.hitTest(pt, { fill: true, stroke: true, tolerance: 5 / view.zoom, match: (r) => r.item && r.item.layer === designLayer });
    setCursor(hit ? SELECT_CURSOR : SELECT_CURSOR);
  }

  // --- pan (native, absolute pixel tracking = no judder) ------------------
  let pan = null;
  const setCursor = (c) => (canvas.style.cursor = c);
  window.addEventListener("keydown", (e) => { if (e.code === "Space" && !spaceDown) { spaceDown = true; if (!pan) setCursor("grab"); } });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { spaceDown = false; if (!pan) setCursor(cursorForTool(currentTool)); } });
  window.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === "Escape") && currentTool === "pen" && penPath) finishPen(); });
  canvas.addEventListener("dblclick", () => { if (currentTool === "pen" && penPath) finishPen(); });
  canvas.addEventListener("pointerdown", (e) => {
    if (!(spaceDown || e.button === 1)) return;
    pan = { sx: e.clientX, sy: e.clientY, cx: view.center.x, cy: view.center.y };
    setCursor("grabbing");
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pan) return;
    view.center = P(pan.cx - (e.clientX - pan.sx) / view.zoom, pan.cy - (e.clientY - pan.sy) / view.zoom);
  });
  const endPan = (e) => { if (!pan) return; pan = null; setCursor(spaceDown ? "grab" : cursorForTool(currentTool)); try { canvas.releasePointerCapture(e.pointerId); } catch {} };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);

  // --- select / move / scale / rotate / marquee (Paper tool) --------------
  const tool = new paper.Tool();
  let mode = null, moveItems = null, marquee = null, downPt = null;
  let anchor = null, scaleKey = null, lastVec = null, lastAngle = null;
  let preDrag = null, dragChanged = false;
  let drawStart = null, drawPreview = null, drawMoved = false, preDraw = null;

  // Finish a drag-drawn shape but STAY in the tool (user switches tools themselves).
  function endDrawTool() { drawStart = null; drawPreview = null; drawSizeCb && drawSizeCb(null); toolResetCb && toolResetCb(); }

  // --- pen tool (bezier) --------------------------------------------------
  function finishPen() {
    if (!penPath) return;
    if (penPath.segments.length < 2) penPath.remove();
    else { undoStack.push(preDraw); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; }
    penPath = null; // stay in the pen tool, ready for the next path
    notifyChange(); toolResetCb && toolResetCb();
  }
  function onPenDown(e) {
    if (!penPath) { designLayer.activate(); penPath = new paper.Path({ strokeColor: drawColor, strokeWidth: drawWidth, fillColor: null }); preDraw = snapshot(); }
    if (penPath.segments.length > 1 && e.point.getDistance(penPath.firstSegment.point) < 8 / view.zoom) { penPath.closed = true; finishPen(); return; }
    penPath.add(e.point); view.update();
  }
  function onPenDrag(e) {
    if (!penPath || !penPath.lastSegment) return;
    const seg = penPath.lastSegment;
    seg.handleOut = e.point.subtract(seg.point);   // click-drag pulls a bezier handle
    seg.handleIn = seg.handleOut.multiply(-1);
    view.update();
  }
  // --- node edit tool -----------------------------------------------------
  function onNodeDown(e) {
    const hr = paper.project.hitTest(e.point, { segments: true, handles: true, stroke: true, fill: true, tolerance: 8 / view.zoom, match: (r) => r.item && r.item.layer === designLayer });
    if (hr) {
      const it = toEditableVector(hr.item) || hr.item;
      if (nodeEditItem && nodeEditItem !== it) nodeEditItem.fullySelected = false;
      clearSel(); emitSel();
      nodeEditItem = it; it.fullySelected = true;
      nodeHit = hr.type === "segment" ? { seg: hr.segment, kind: "point" }
        : hr.type === "handle-in" ? { seg: hr.segment, kind: "in" }
        : hr.type === "handle-out" ? { seg: hr.segment, kind: "out" } : null;
      preDrag = snapshot(); dragChanged = false;
    } else if (nodeEditItem) { nodeEditItem.fullySelected = false; nodeEditItem = null; nodeHit = null; }
    view.update();
  }
  function onNodeDrag(e) {
    if (!nodeHit) return;
    dragChanged = true;
    const s = nodeHit.seg;
    if (nodeHit.kind === "point") s.point = s.point.add(e.delta);
    else if (nodeHit.kind === "in") s.handleIn = s.handleIn.add(e.delta);
    else s.handleOut = s.handleOut.add(e.delta);
    view.update();
  }
  function onNodeUp() {
    if (dragChanged && preDrag != null) { undoStack.push(preDrag); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; notifyChange(); }
    preDrag = null; dragChanged = false; nodeHit = null;
  }

  tool.onMouseDown = (e) => {
    if (spaceDown || e.event.button !== 0) return; // pan owns space/middle
    if (currentTool === "pen") return onPenDown(e);
    if (currentTool === "node") return onNodeDown(e);
    if (currentTool !== "select") { drawStart = e.point; drawMoved = false; drawPreview = null; preDraw = snapshot(); return; }
    const h = handleAt(e.point);
    if (h && selected.size) {
      preDrag = snapshot(); dragChanged = false;
      if (h.type === "scale") { mode = "scale"; anchor = h.anchor; scaleKey = h.key; lastVec = e.point.subtract(anchor); }
      else { mode = "rotate"; anchor = selectionBounds().center; lastAngle = e.point.subtract(anchor).angle; }
      return;
    }
    // drag anywhere inside the selection box = move (LightBurn-style)
    const selBounds = selectionBounds();
    if (selBounds && selBounds.contains(e.point)) { mode = "move"; moveItems = [...selected]; preDrag = snapshot(); dragChanged = false; return; }
    const hit = paper.project.hitTest(e.point, { fill: true, stroke: true, tolerance: 5 / view.zoom, match: (r) => r.item && r.item.layer === designLayer });
    if (hit) {
      const it = toSelectable(hit.item);
      if (it) {
        if (selectionMode === "design") selectAllItems();
        else if (e.event.shiftKey) selected.has(it) ? selected.delete(it) : addSel(it);
        else if (!selected.has(it)) { clearSel(); addSel(it); }
        emitSel();
        mode = "move"; moveItems = [...selected]; preDrag = snapshot(); dragChanged = false;
        return;
      }
    }
    if (!e.event.shiftKey) { clearSel(); emitSel(); }
    mode = "marquee"; downPt = e.point; marquee = null;
  };
  tool.onMouseMove = (e) => { coordsCb && coordsCb(e.point.x, e.point.y); updateCursor(e.point); };
  tool.onMouseDrag = (e) => {
    if (pan) return;
    coordsCb && coordsCb(e.point.x, e.point.y);
    if (currentTool === "pen") return onPenDrag(e);
    if (currentTool === "node") return onNodeDrag(e);
    if (currentTool !== "select" && drawStart) {
      drawMoved = true;
      if (drawPreview) drawPreview.remove();
      drawPreview = makeShape(currentTool, drawStart, e.point); // real endpoints (fixes the line tool)
      const b = drawPreview.bounds;
      drawSizeCb && drawSizeCb(b.width, b.height, e.event.clientX, e.event.clientY);
      return;
    }
    if (mode === "move") { dragChanged = true; for (const it of moveItems) it.position = it.position.add(e.delta); drawOverlay(); return; }
    if (mode === "scale") {
      dragChanged = true;
      const cur = e.point.subtract(anchor);
      let sx = lastVec.x ? cur.x / lastVec.x : 1, sy = lastVec.y ? cur.y / lastVec.y : 1;
      if (scaleKey === "tc" || scaleKey === "bc") sx = 1;
      if (scaleKey === "lc" || scaleKey === "rc") sy = 1;
      if (e.event.shiftKey && sx !== 1 && sy !== 1) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx) * s; sy = Math.sign(sy) * s; }
      for (const it of selected) it.scale(sx, sy, anchor);
      lastVec = cur; drawOverlay(); return;
    }
    if (mode === "rotate") {
      dragChanged = true;
      const ang = e.point.subtract(anchor).angle;
      for (const it of selected) it.rotate(ang - lastAngle, anchor);
      lastAngle = ang; drawOverlay(); return;
    }
    if (mode === "marquee") {
      if (marquee) marquee.remove();
      uiLayer.activate();
      marquee = new paper.Path.Rectangle(new paper.Rectangle(downPt, e.point));
      marquee.strokeColor = "#006B5C"; marquee.strokeWidth = 1 / view.zoom;
      marquee.dashArray = [4 / view.zoom, 3 / view.zoom];
      marquee.fillColor = new paper.Color(0.18, 0.49, 0.31, 0.08); marquee.guide = true;
      designLayer.activate();
    }
  };
  tool.onMouseUp = (e) => {
    if (currentTool === "pen") return;          // pen commits via click / dbl-click / Enter / Esc
    if (currentTool === "node") return onNodeUp(e);
    if (currentTool !== "select" && drawStart) {
      if (drawMoved && drawPreview && (drawPreview.bounds.width > 0.5 || drawPreview.bounds.height > 0.5)) {
        undoStack.push(preDraw); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; // commit the drawn shape
      } else {
        drawPreview && drawPreview.remove();           // a click (no drag) -> ask app for exact size
        drawClickCb && drawClickCb(currentTool);
      }
      endDrawTool();
      notifyChange();
      return;
    }
    if (mode === "marquee") {
      const rect = new paper.Rectangle(downPt, e.point);
      if (marquee) { marquee.remove(); marquee = null; }
      if (rect.width > 0.5 || rect.height > 0.5) {
        if (selectionMode === "design") { if (selectable().some((it) => rect.intersects(it.bounds))) selectAllItems(); }
        else for (const it of selectable()) if (rect.intersects(it.bounds)) addSel(it);
      }
      emitSel();
    }
    if ((mode === "move" || mode === "scale" || mode === "rotate") && dragChanged && preDrag != null) {
      undoStack.push(preDrag); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0;
    }
    preDrag = null; dragChanged = false;
    mode = null; moveItems = null;
    notifyChange();
  };

  function zoomAt(offsetX, offsetY, factor) {
    const vp = P(offsetX, offsetY);
    const before = view.viewToProject(vp);
    view.zoom = Math.max(0.05, Math.min(60, view.zoom * factor));
    view.center = view.center.add(before.subtract(view.viewToProject(vp)));
  }
  function wheelPanDelta(e) {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? Math.max(view.viewSize.width, view.viewSize.height) : 1;
    return P(e.deltaX * unit, e.deltaY * unit);
  }
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { // trackpad pinch reports ctrl+wheel in Chromium; cmd/ctrl+wheel is mouse zoom.
      zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.01));
    } else {
      view.center = view.center.add(wheelPanDelta(e).divide(view.zoom));
    }
    drawOverlay();
  }, { passive: false });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const pt = view.viewToProject(P(e.offsetX, e.offsetY));
    const hit = paper.project.hitTest(pt, { fill: true, stroke: true, tolerance: 5 / view.zoom, match: (r) => r.item && r.item.layer === designLayer });
    const it = hit && toSelectable(hit.item);
    if (it && !selected.has(it)) {
      if (!e.shiftKey) clearSel();
      addSel(it);
      emitSel();
    }
    contextCb && contextCb({ x: e.clientX, y: e.clientY, hasSelection: selected.size > 0, canUngroup: canUngroup() });
  });

  // --- geometry stats for time estimation ---------------------------------
  function geometryStats() {
    const map = new Map();
    for (const it of laserItems()) {
      const hex = it.className === "Raster" ? "#000000" : (css(it.strokeColor) || css(it.fillColor) || "#000000");
      const cur = map.get(hex) || { length: 0, area: 0 };
      cur.length += it.className === "Raster" ? 0 : (it.length || 0);
      cur.area += it.className === "Raster" ? Math.abs(it.bounds.area || 0) : Math.abs(it.area || 0);
      map.set(hex, cur);
    }
    return map;
  }
  const css = (c) => (c ? c.toCSS(true) : null);

  // --- position (whole design) --------------------------------------------
  const items = () => designLayer.children.slice();
  const REF = (b, k) => ({ tl: b.topLeft, tc: b.topCenter, tr: b.topRight, lc: b.leftCenter, c: b.center, rc: b.rightCenter, bl: b.bottomLeft, bc: b.bottomCenter, br: b.bottomRight }[k] || b.topLeft);
  function getRect() {
    if (!designLayer.children.length) return null;
    const b = designLayer.bounds;
    return { x: b.x, y: b.y, w: b.width, h: b.height, angle: designAngle };
  }
  function refX(key) { const b = designLayer.bounds; return REF(b, key); }
  function applyRect(key, x, y, w, h) {
    if (!designLayer.children.length) return;
    pushHistory();
    let b = designLayer.bounds, anchor = REF(b, key);
    const sx = w > 0 && b.width ? w / b.width : 1, sy = h > 0 && b.height ? h / b.height : 1;
    if (sx !== 1 || sy !== 1) { for (const it of items()) it.scale(sx, sy, anchor); b = designLayer.bounds; }
    const d = P(x, y).subtract(REF(b, key));
    for (const it of items()) it.position = it.position.add(d);
    view.update(); drawOverlay(); notifyChange();
  }
  function applyAngle(deg) {
    if (!designLayer.children.length) return;
    pushHistory();
    const c = designLayer.bounds.center;
    for (const it of items()) it.rotate(deg - designAngle, c);
    designAngle = deg; view.update(); drawOverlay(); notifyChange();
  }
  // reference point coordinates for the position readout (respects the 9-dot)
  function getRef(key) { const p = designLayer.children.length ? REF(designLayer.bounds, key) : null; return p && { x: p.x, y: p.y }; }

  // --- grouping, arrange, clipboard ---------------------------------------
  const stackSort = (arr) => arr.slice().sort((a, b) => a.index - b.index);
  function selectedItems() { return stackSort([...selected].filter((it) => it && it.parent)); }
  function canUngroup() { return selectedItems().some(isUserGroup); }
  function selectAll() { selectAllItems(); emitSel(); return selected.size > 0; }
  function deleteSelection() {
    const roots = selectedItems();
    if (!roots.length) return false;
    pushHistory();
    roots.forEach((it) => it.remove());
    clearSel();
    emitSel(); view.update(); notifyChange();
    return true;
  }
  function groupSelected() {
    const roots = selectedItems();
    if (roots.length < 2) return false;
    pushHistory();
    const index = Math.min(...roots.map((it) => it.index));
    const group = new paper.Group();
    group.data.modcutGroup = true;
    designLayer.insertChild(index, group);
    for (const it of roots) group.addChild(it);
    clearSel(); addSel(group); emitSel(); view.update(); notifyChange();
    return true;
  }
  function ungroupSelected() {
    const groups = selectedItems().filter(isUserGroup);
    if (!groups.length) return false;
    pushHistory();
    clearSel();
    for (const group of groups) {
      const parent = group.parent || designLayer;
      const index = group.index;
      const kids = group.children.slice();
      kids.forEach((child, i) => { parent.insertChild(index + i, child); addSel(child); });
      group.remove();
    }
    emitSel(); view.update(); notifyChange();
    return true;
  }
  function arrangeSelected(action) {
    const roots = selectedItems();
    if (!roots.length) return false;
    pushHistory();
    if (action === "top") roots.forEach((it) => it.bringToFront());
    else if (action === "bottom") roots.slice().reverse().forEach((it) => it.sendToBack());
    else if (action === "up") roots.slice().reverse().forEach((it) => {
      const next = it.nextSibling;
      if (next) it.insertAbove(next);
    });
    else if (action === "down") roots.forEach((it) => {
      const prev = it.previousSibling;
      if (prev) it.insertBelow(prev);
    });
    drawOverlay(); view.update(); notifyChange();
    return true;
  }

  let clipboardJSON = null;
  let pasteStep = 0;
  function copySelection() {
    const roots = selectedItems();
    if (!roots.length) return false;
    clipboardJSON = JSON.stringify(roots.map((it) => it.exportJSON({ asString: false })));
    pasteStep = 0;
    return true;
  }
  function pasteSelection({ inPlace = false } = {}) {
    if (!clipboardJSON) return false;
    let defs;
    try { defs = JSON.parse(clipboardJSON); } catch { return false; }
    pushHistory();
    clearSel();
    const offset = inPlace ? P(0, 0) : P(8 * (pasteStep + 1), 8 * (pasteStep + 1));
    for (const def of defs) {
      designLayer.activate();
      const item = designLayer.importJSON(def);
      if (item && item.className === "Layer" && item.children?.length) {
        for (const child of item.children.slice()) {
          designLayer.addChild(child);
          child.position = child.position.add(offset);
          if (isSelectableItem(child)) addSel(child);
        }
        item.remove();
      } else if (item) {
        item.position = item.position.add(offset);
        if (isSelectableItem(item)) addSel(item);
      }
    }
    if (!inPlace) pasteStep++;
    reprocessRasters();
    emitSel(); view.update(); notifyChange();
    return true;
  }
  function duplicateSelection() {
    if (!copySelection()) return false;
    return pasteSelection({ inPlace: false });
  }

  // --- simulation (red dot tracing the real toolpath) ---------------------
  function itemsForColor(color) {
    const all = laserItems();
    return color ? all.filter((it) => (it.className === "Raster" ? "#000000" : css(it.strokeColor) || css(it.fillColor)) === color) : all;
  }
  function vectorSeg(it, sp, out) {
    if (it.className === "CompoundPath") { for (const c of it.children) vectorSeg(c, sp, out); return; }
    if (typeof it.getPointAt !== "function" || !it.length) return;
    const len = it.length, step = Math.max(0.5, len / 400), pts = [];
    for (let d = 0; d < len; d += step) pts.push(it.getPointAt(d));
    pts.push(it.getPointAt(Math.max(0, len - 1e-3)));
    if (it.closed && it.firstSegment) pts.push(it.firstSegment.point);
    if (pts.length) out.push({ pts, speed: sp.speed, power: sp.power, freq: sp.freq, op: sp.op });
  }
  function rasterImageScan(it, sp, out) {
    const b = it.bounds;
    if (!b.width || !b.height) return;
    let image;
    try { image = it.getImageData(); } catch { return; }
    const { width, height, data } = image;
    if (!width || !height) return;
    let interval = 25.4 / Math.max(1, sp.dpi || 300);
    if (b.height / interval > 500) interval = b.height / 500;
    const rows = [];
    for (let y = b.bottom; y >= b.top; y -= interval) rows.push(y);
    if (!sp.bottomUp) rows.reverse();
    let flip = false;
    for (const y of rows) {
      const py = Math.max(0, Math.min(height - 1, Math.floor(((y - b.top) / b.height) * height)));
      const runs = [];
      let start = null;
      for (let px = 0; px < width; px++) {
        const i = (py * width + px) * 4;
        const dark = data[i + 3] > 8 && data[i] < 128;
        if (dark && start == null) start = px;
        if ((!dark || px === width - 1) && start != null) {
          const end = dark && px === width - 1 ? px + 1 : px;
          runs.push([start, end]);
          start = null;
        }
      }
      for (const [aPx, cPx] of runs) {
        let a = P(b.left + (aPx / width) * b.width, y);
        let c = P(b.left + (cPx / width) * b.width, y);
        if (flip) { const t = a; a = c; c = t; }
        out.push({ pts: [a, c], speed: sp.speed, power: sp.power, freq: sp.freq, dpi: sp.dpi, dither: sp.dither, op: "Engrave" });
      }
      flip = !flip;
    }
  }
  function rasterScan(it, sp, out) {
    if (it.className === "Raster") { rasterImageScan(it, sp, out); return; }
    const b = it.bounds; if (!b.height) return;
    let interval = 25.4 / Math.max(1, sp.dpi || 300);
    if (b.height / interval > 200) interval = b.height / 200; // cap rows for preview perf
    const ys = [];
    for (let y = b.bottom; y >= b.top; y -= interval) ys.push(y);
    if (!sp.bottomUp) ys.reverse();
    let flip = false;
    for (const y of ys) {
      const line = new paper.Path.Line(P(b.left - 1, y), P(b.right + 1, y));
      const xs = (it.getIntersections(line) || []).map((i) => i.point.x).sort((a, c) => a - c);
      line.remove();
      for (let k = 0; k + 1 < xs.length; k += 2) {
        let a = P(xs[k], y), c = P(xs[k + 1], y);
        if (flip) { const t = a; a = c; c = t; }
        out.push({ pts: [a, c], speed: sp.speed, power: sp.power, freq: sp.freq, dpi: sp.dpi, dither: sp.dither, op: "Engrave" });
      }
      flip = !flip;
    }
  }
  // Collect segments grouped per source shape (keeps a shape's paths together).
  function collectSegs(specs) {
    const groups = [];
    for (const sp of specs) for (const it of itemsForColor(sp.color)) {
      const g = [];
      sp.op === "Engrave" ? rasterScan(it, sp, g) : vectorSeg(it, sp, g);
      if (g.length) groups.push(g);
      if (groups.length > 5000) break;
    }
    return groups;
  }
  const segStart = (s) => s.pts[0];
  const segEnd = (s) => s.pts[s.pts.length - 1];
  const dist = (a, b) => a.getDistance(b);
  function orderNearest(segs, allowReverse) {
    if (segs.length > 4000) return segs; // too many to optimize cheaply — leave as-is
    const rest = segs.slice(), out = [];
    let cur = P(0, 0);
    while (rest.length) {
      let bi = 0, brev = false, bd = Infinity;
      for (let i = 0; i < rest.length; i++) {
        const ds = dist(cur, segStart(rest[i]));
        if (ds < bd) { bd = ds; bi = i; brev = false; }
        if (allowReverse) { const de = dist(cur, segEnd(rest[i])); if (de < bd) { bd = de; bi = i; brev = true; } }
      }
      const s = rest.splice(bi, 1)[0];
      if (brev) s.pts = s.pts.slice().reverse();
      out.push(s); cur = segEnd(s);
    }
    return out;
  }
  function orderSegs(specs) {
    const groups = collectSegs(specs);
    if (pathOrder === "color") return groups.flat();
    if (pathOrder === "nearby") { // keep each shape whole; order shapes by proximity
      const rest = groups.slice(), out = [];
      let cur = P(0, 0);
      while (rest.length) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < rest.length; i++) { const d = dist(cur, segStart(rest[i][0])); if (d < bd) { bd = d; bi = i; } }
        const g = rest.splice(bi, 1)[0];
        out.push(...g); cur = segEnd(g[g.length - 1]);
      }
      return out;
    }
    return orderNearest(groups.flat(), true); // "optimize": fewest head moves
  }
  function buildMoves(segs) {
    const moves = [];
    let prev = null;
    for (const s of segs) {
      if (!s.pts.length) continue;
      if (prev) moves.push({ a: prev, b: s.pts[0], speed: 300, burn: false }); // travel
      for (let i = 1; i < s.pts.length; i++) moves.push({ a: s.pts[i - 1], b: s.pts[i], speed: s.speed, burn: true, op: s.op });
      prev = s.pts[s.pts.length - 1];
    }
    return moves;
  }

  function loadRasterImageData(raster) {
    const src = raster.data?.originalDataUrl || (typeof raster.toDataURL === "function" ? raster.toDataURL() : null);
    if (!src) {
      try { return Promise.resolve(raster.getImageData()); } catch { return Promise.resolve(null); }
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = () => {
        try { resolve(raster.getImageData()); } catch { resolve(null); }
      };
      img.src = src;
    });
  }
  function grayscaleForRaster(image, settings) {
    const gray = new Float32Array(image.width * image.height);
    const data = image.data;
    const s = normalizeRasterSettings(settings);
    const contrast = s.contrast * 2.55;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const brightness = s.brightness * 2.55;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] < 8) { gray[p] = 255; continue; }
      let g = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      g = factor * (g - 128) + 128 + brightness;
      gray[p] = 255 * Math.pow(clamp(g, 0, 255) / 255, 1 / s.gamma);
    }
    return { gray, settings: s };
  }
  function ditherMask(gray, width, height, settings, dither) {
    const mask = new Uint8Array(width * height);
    const threshold = settings.threshold;
    const invert = settings.invert;
    const type = String(dither || "Jarvis").toLowerCase();
    const mark = (idx, black) => (mask[idx] = invert ? (black ? 0 : 1) : (black ? 1 : 0));
    if (type.includes("bayer")) {
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const t = threshold + (bayer[(y & 3) * 4 + (x & 3)] - 7.5) * 10;
        mark(idx, gray[idx] < t);
      }
      return mask;
    }
    const work = new Float32Array(gray);
    const kernels = type.includes("floyd")
      ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]
      : type.includes("stucki")
        ? [[1, 0, 8 / 42], [2, 0, 4 / 42], [-2, 1, 2 / 42], [-1, 1, 4 / 42], [0, 1, 8 / 42], [1, 1, 4 / 42], [2, 1, 2 / 42], [-2, 2, 1 / 42], [-1, 2, 2 / 42], [0, 2, 4 / 42], [1, 2, 2 / 42], [2, 2, 1 / 42]]
        : [[1, 0, 7 / 48], [2, 0, 5 / 48], [-2, 1, 3 / 48], [-1, 1, 5 / 48], [0, 1, 7 / 48], [1, 1, 5 / 48], [2, 1, 3 / 48], [-2, 2, 1 / 48], [-1, 2, 3 / 48], [0, 2, 5 / 48], [1, 2, 3 / 48], [2, 2, 1 / 48]];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = clamp(work[idx], 0, 255);
      const next = old < threshold ? 0 : 255;
      mark(idx, next === 0);
      const err = old - next;
      for (const [dx, dy, weight] of kernels) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) work[ny * width + nx] += err * weight;
      }
    }
    return mask;
  }
  async function rasterDitherScan(it, sp, out) {
    const image = await loadRasterImageData(it);
    if (!image) return rasterImageScan(it, sp, out);
    const b = it.bounds;
    if (!b.width || !b.height) return;
    const { gray, settings } = grayscaleForRaster(image, it.data?.rasterSettings);
    const mask = ditherMask(gray, image.width, image.height, settings, sp.dither);
    let interval = 25.4 / Math.max(1, sp.dpi || 300);
    if (b.height / interval > 1200) interval = b.height / 1200;
    const rows = [];
    for (let y = b.bottom; y >= b.top; y -= interval) rows.push(y);
    if (!sp.bottomUp) rows.reverse();
    let flip = false;
    for (const y of rows) {
      const py = Math.max(0, Math.min(image.height - 1, Math.floor(((y - b.top) / b.height) * image.height)));
      let start = null;
      const runs = [];
      for (let px = 0; px < image.width; px++) {
        const dark = mask[py * image.width + px] === 1;
        if (dark && start == null) start = px;
        if ((!dark || px === image.width - 1) && start != null) {
          runs.push([start, dark && px === image.width - 1 ? px + 1 : px]);
          start = null;
        }
      }
      for (const [aPx, cPx] of runs) {
        let a = P(b.left + (aPx / image.width) * b.width, y);
        let c = P(b.left + (cPx / image.width) * b.width, y);
        if (flip) { const t = a; a = c; c = t; }
        out.push({ pts: [a, c], speed: sp.speed, power: sp.power, freq: sp.freq, dpi: sp.dpi, dither: sp.dither, op: "Engrave" });
      }
      flip = !flip;
    }
  }
  async function collectJobSegs(specs) {
    const groups = [];
    for (const sp of specs) for (const it of itemsForColor(sp.color)) {
      const g = [];
      if (sp.op === "Engrave" && it.className === "Raster") await rasterDitherScan(it, sp, g);
      else sp.op === "Engrave" ? rasterScan(it, sp, g) : vectorSeg(it, sp, g);
      if (g.length) groups.push(g);
      if (groups.length > 10000) break;
    }
    return groups;
  }
  async function orderJobSegs(specs) {
    const groups = await collectJobSegs(specs);
    if (pathOrder === "color") return groups.flat();
    if (pathOrder === "nearby") {
      const rest = groups.slice(), out = [];
      let cur = P(0, 0);
      while (rest.length) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < rest.length; i++) { const d = dist(cur, segStart(rest[i][0])); if (d < bd) { bd = d; bi = i; } }
        const g = rest.splice(bi, 1)[0];
        out.push(...g); cur = segEnd(g[g.length - 1]);
      }
      return out;
    }
    return orderNearest(groups.flat(), true);
  }
  const fmt = (n) => (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
  const feedFromPct = (pct, maxFeed = 12000) => Math.round((Math.max(1, Math.min(100, pct || 1)) / 100) * maxFeed);
  const powerToS = (power) => Math.round(Math.max(0, Math.min(100, power || 0)) * 10);
  async function buildGcodeJob(specs, { maxFeed = 12000 } = {}) {
    const segs = await orderJobSegs(specs);
    const lines = [
      "; Generated by modCut",
      "G21 ; millimeters",
      "G90 ; absolute positioning",
      "M5",
    ];
    let burnMoves = 0;
    for (const seg of segs) {
      if (!seg.pts || seg.pts.length < 2) continue;
      const start = seg.pts[0];
      lines.push(`G0 X${fmt(start.x)} Y${fmt(start.y)}`);
      lines.push(`M4 S${powerToS(seg.power)} ; ${seg.op} ${Math.round(seg.power || 0)}% power`);
      const feed = feedFromPct(seg.speed, maxFeed);
      for (let i = 1; i < seg.pts.length; i++) {
        const p = seg.pts[i];
        lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} F${feed}`);
        burnMoves++;
      }
      lines.push("M5");
    }
    lines.push("G0 X0 Y0");
    return { lines, opCount: specs.length, segmentCount: segs.length, burnMoves };
  }
  let sim = null;
  function startSim(specs) {
    stopSim();
    clearSel(); emitSel();
    const segs = orderSegs(specs);
    const moves = buildMoves(segs);
    if (!moves.length) return null;
    // ghost: the whole toolpath as thin grey lines; the real design is hidden
    simLayer.activate();
    const ghost = new paper.Group();
    for (const s of segs) { const p = new paper.Path(s.pts); p.strokeColor = "#c7ccc8"; p.strokeWidth = 0.35; p.guide = true; ghost.addChild(p); }
    const trail = new paper.Group();
    const dot = new paper.Path.Circle(moves[0].a, 2.2);
    dot.fillColor = new paper.Color("#e11"); dot.strokeColor = "white"; dot.strokeWidth = 0.35; dot.guide = true;
    designLayer.visible = false;
    designLayer.activate();
    sim = { moves, i: 0, t: 0, mult: 1, dot, ghost, trail, playing: true, cb: null, trailN: 0 };
    view.onFrame = (ev) => { if (sim && sim.playing) simStep(ev.delta); };
    return {
      setMult: (m) => { if (sim) sim.mult = m; },
      toggle: () => { if (!sim) return false; sim.playing = !sim.playing; return sim.playing; },
      stop: stopSim,
      onProgress: (cb) => { if (sim) sim.cb = cb; },
    };
  }
  function addTrail(mv) {
    if (sim.trailN > 8000) return;
    const l = new paper.Path.Line(mv.a, mv.b);
    l.strokeColor = mv.op === "Engrave" ? "#555" : "#111"; // engrave fills in; a cut leaves a black line
    l.strokeWidth = mv.op === "Engrave" ? 0.4 : 0.6;
    l.strokeCap = "round"; l.guide = true;
    sim.trail.addChild(l); sim.trailN++;
  }
  function simStep(dt) {
    let budget = dt * sim.mult; // seconds of machine time this frame
    while (budget > 0 && sim.i < sim.moves.length) {
      const mv = sim.moves[sim.i], len = mv.a.getDistance(mv.b) || 1e-4, dur = len / Math.max(1, mv.speed), remain = dur * (1 - sim.t);
      if (budget >= remain) { budget -= remain; sim.i++; sim.t = 0; sim.dot.position = mv.b; if (mv.burn) addTrail(mv); }
      else { sim.t += budget / dur; budget = 0; sim.dot.position = mv.a.add(mv.b.subtract(mv.a).multiply(sim.t)); }
    }
    if (sim.cb) sim.cb(Math.min(1, sim.i / sim.moves.length));
    if (sim.i >= sim.moves.length) sim.playing = false;
    view.update();
  }
  function stopSim() {
    if (!sim) return;
    simLayer.removeChildren();
    designLayer.visible = true;
    view.onFrame = null; sim = null; view.update();
  }

  sizeCanvas(); drawBed(); fit(); setCursor(cursorForTool(currentTool)); // safe now: everything above is initialized

  return {
    loadSVG, loadImage, clear: clearDesign, setBedSize,
    zoomIn: () => { view.zoom = Math.min(60, view.zoom * 1.25); drawOverlay(); },
    zoomOut: () => { view.zoom = Math.max(0.05, view.zoom / 1.25); drawOverlay(); },
    fit,
    onCoords: (cb) => (coordsCb = cb),
    onSelection: (cb) => (selectionCb = cb),
    onChange: (cb) => (changeCb = cb),
    getDesign, geometryStats, getRect, getRef, applyRect, applyAngle, startSim, stopSim, buildGcodeJob,
    setSelectionMode, undo, redo, resetHistory, exportDesign, importDesign,
    groupSelected, ungroupSelected, arrangeSelected, copySelection, pasteSelection, duplicateSelection,
    canUngroup, selectAll, deleteSelection,
    setGrid, setTool, setPathOrder, getColors, addShape,
    setDrawStyle, applyStyle, getStyle,
    getRasterSettings, beginRasterEdit, updateRasterSettings, endRasterEdit, resetRasterSettings,
    onDrawSize: (cb) => (drawSizeCb = cb),
    onDrawClick: (cb) => (drawClickCb = cb),
    onToolReset: (cb) => (toolResetCb = cb),
    onContextMenu: (cb) => (contextCb = cb),
  };
}
