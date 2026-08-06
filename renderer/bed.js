import {
  DEFAULT_RASTER_SETTINGS,
  ditherMask,
  grayscaleImageData,
  grayscaleRuns,
  normalizeRasterSettings,
  posterizeGray,
  tintGray,
} from "./raster-processing.mjs";
import { itemLayerColor, setItemLayerColor } from "./layer-model.mjs";

// The bed, on Paper.js. Project coordinates are millimetres (1 unit = 1 mm).
// - Space (or middle mouse) + drag = pan (hand cursor), tracked in absolute pixels
//   so it never judders.
// - Left drag on empty = marquee select. Click a shape = select it. Shift adds.
// - A selected set shows a transform box: drag inside = move, corner/edge handles =
//   scale, the top knob = rotate. Only drawn shapes are highlighted.
// Imported SVGs are flattened into the design layer so scale/rotate about a
// project-space anchor is always correct (no nested group transforms to fight).

const MM_PER_PX = 25.4 / 96;

export function engraveStrategy(item) {
  if (item?.className === "Raster") return "raster";
  const alpha = item?.fillColor == null ? 0 : Number(item.fillColor.alpha ?? 1);
  const hasVisibleFill = Number.isFinite(alpha) && alpha > 0.001;
  if (item?.className === "CompoundPath") return hasVisibleFill ? "raster" : "trace";
  return item?.closed && hasVisibleFill ? "raster" : "trace";
}

export function createBed(stage, { bedWmm = 600, bedHmm = 400 } = {}) {
  const paper = window.paper;
  const canvas = document.createElement("canvas");
  canvas.className = "bed-canvas";
  stage.append(canvas);
  const groupNav = document.createElement("div");
  groupNav.className = "group-nav hidden";
  groupNav.innerHTML = `<button type="button" class="group-nav__back" title="Leave group">←</button><span class="group-nav__path"></span>`;
  stage.append(groupNav);
  paper.setup(canvas);
  const view = paper.view;
  const P = (x, y) => new paper.Point(x, y);

  const bedLayer = new paper.Layer();
  const designLayer = new paper.Layer();
  const penLayer = new paper.Layer(); // live pen preview, anchors and bezier handles
  const uiLayer = new paper.Layer(); // transform box + handles (guides)
  const simLayer = new paper.Layer(); // simulation ghost/trail/dot (kept off uiLayer so overlay redraws don't wipe it)
  const selected = new Set();
  const selectedSegments = new Set();
  let activeGroup = null;
  const focusOpacity = new Map();
  let coordsCb = null, selectionCb = null, contextCb = null, spaceDown = false, altDown = false, shiftDown = false, changeCb = null, designAngle = 0;
  let gridX = 10, gridY = 10;                 // grid spacing in mm
  let currentTool = "select";                 // select | node | pen | rect | ellipse | line
  let pathOrder = "optimize";                 // "optimize" | "nearby" | "layer"
  let drawSizeCb = null, drawClickCb = null, toolResetCb = null;
  let drawColor = "#000000", drawWidth = 0.5; // style for new shapes
  let penPath = null, penHoverPoint = null, penEndpointHover = null, penCloseHover = false;
  let penDragSegment = null, penDragHandleKind = null, penChanged = false, penResumeReversed = false;
  let nodeHit = null, nodeEditItem = null;

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
    clearNodeSelection();
    if (penPath) finishPen();
    currentTool = t;
    penHoverPoint = null; penEndpointHover = null; penCloseHover = false;
    clearSel(); emitSel(); drawPenOverlay();
    if (t === "pen") setPenCursor("new");
    else setCursor(cursorForTool(t));
    view.update();
  }
  function setPathOrder(o) { pathOrder = o; }
  window.addEventListener("resize", sizeCanvas);
  // NB: initial sizeCanvas/drawBed/fit run at the very end of createBed — fit()
  // calls drawOverlay(), which touches `handles` (declared below). Running it here
  // would hit that `let` in its temporal dead zone and throw, killing the app.

  // --- import (flattened into designLayer) --------------------------------
  const notifyChange = () => changeCb && changeCb();
  function clearDesign() {
    abandonPenInteraction();
    clearNodeSelection();
    resetGroupFocus();
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
    resetGroupFocus();
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
    resetGroupFocus();
    pushHistory();
    designLayer.activate();
    const raster = new paper.Raster({ source: dataUrl, position: P(bedWmm / 2, bedHmm / 2) });
    raster.data.modcutRaster = true;
    raster.data.modcutColor = "#000000";
    raster.data.originalDataUrl = dataUrl;
    raster.data.rasterSettings = { ...DEFAULT_RASTER_SETTINGS };
    raster.data.rasterMode = "Grayscale";
    raster.smoothing = false;
    return new Promise((resolve, reject) => {
      raster.onLoad = () => {
        if (raster.width) raster.scale((wMm || raster.width * MM_PER_PX) / raster.width);
        raster.position = P(bedWmm / 2, bedHmm / 2);
        applyRasterSettings(raster);
        clearSel();
        addSel(raster);
        emitSel();
        view.update();
        notifyChange();
        resolve(getDesign());
      };
      raster.onError = () => {
        raster.remove();
        reject(new Error("The raster image could not be decoded."));
      };
    });
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
      const raster = it.className === "Raster";
      const hex = logicalColor(it);
      const entry = map.get(hex) || { key: hex, color: hex, count: 0, raster: false };
      entry.count++;
      entry.raster ||= raster;
      map.set(hex, entry);
    }
    return [...map.values()];
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
    if (activeGroup) activeGroup.addChild(item);
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
    const targets = roots.flatMap((it) => laserTargets(it));
    if (!targets.length) return;
    pushHistory();
    for (const it of targets) {
      if (color) {
        setItemLayerColor(it, color);
        if (it.className === "Raster") applyRasterSettings(it);
      }
      if (width != null && it.className !== "Raster") it.strokeWidth = width;
    }
    if (color) drawColor = color; if (width != null) drawWidth = width;
    drawOverlay(); view.update(); notifyChange();
  }
  function getStyle() {
    const root = [...selected][0] || nodeEditItem;
    const it = firstLaserIn(root) || root;
    if (it) return { color: logicalColor(it), width: it.strokeWidth || drawWidth };
    return { color: drawColor, width: drawWidth };
  }

  const isLaserItem = (it) =>
    (it.className === "Path" || it.className === "CompoundPath" || it.className === "Raster") &&
    !(it.parent && it.parent.className === "CompoundPath");
  const isVectorItem = (it) => it.className === "Path" || it.className === "CompoundPath";
  const isUserGroup = (it) => it && it.className === "Group" && it.data && it.data.modcutGroup;
  const isSelectableItem = (it) => isLaserItem(it) || isUserGroup(it);
  const laserItems = () => designLayer.getItems({ recursive: true, match: isLaserItem });
  const selectionRoot = () => activeGroup || designLayer;
  const selectable = () => selectionRoot().children.filter(isSelectableItem);
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
  function laserTargets(it, out = []) {
    if (!it) return out;
    if (isLaserItem(it)) out.push(it);
    else if (it.children) for (const child of it.children) laserTargets(child, out);
    return out;
  }
  function toSelectable(it) {
    const root = selectionRoot();
    let cur = it, top = null;
    while (cur && cur !== root && cur.layer === designLayer) {
      if (cur.parent === root && isSelectableItem(cur)) top = cur;
      cur = cur.parent;
    }
    return cur === root ? top : null;
  }
  function toEditableVector(it) {
    let cur = it;
    const root = selectionRoot();
    while (cur && cur !== root && cur.layer === designLayer) {
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
  function emitSel() { selectionCb && selectionCb(selected.size); reprocessRasters(); drawOverlay(); }
  let selectionMode = "element"; // "design" = whole current scope, "element" = individual items
  function setSelectionMode(m) { selectionMode = m; clearSel(); emitSel(); }
  // Whole-design selection = EVERY item on the layer (paths, text, rasters), so a
  // move/scale/rotate can never leave part of the design behind.
  function selectAllItems() { clearSel(); for (const it of selectable()) addSel(it); }

  // --- group isolation ----------------------------------------------------
  function isInsideGroup(item, group = activeGroup) {
    if (!group || !item) return !group;
    let cur = item;
    while (cur && cur !== designLayer) {
      if (cur === group) return true;
      cur = cur.parent;
    }
    return false;
  }
  function isAncestorOf(ancestor, item) {
    let cur = item?.parent;
    while (cur && cur !== designLayer) {
      if (cur === ancestor) return true;
      cur = cur.parent;
    }
    return false;
  }
  function restoreFocusOpacity() {
    for (const [item, opacity] of focusOpacity) if (item) item.opacity = opacity;
    focusOpacity.clear();
  }
  function dimItem(item) {
    if (!focusOpacity.has(item)) focusOpacity.set(item, item.opacity);
    item.opacity = focusOpacity.get(item) * 0.5;
  }
  function updateGroupNav() {
    if (!activeGroup) {
      groupNav.classList.add("hidden");
      groupNav.querySelector(".group-nav__path").textContent = "";
      return;
    }
    const names = [];
    let cur = activeGroup;
    while (cur && cur !== designLayer) {
      if (isUserGroup(cur)) names.unshift(cur.data.modcutGroupName || "Group");
      cur = cur.parent;
    }
    groupNav.querySelector(".group-nav__path").textContent = `Main view  ›  ${names.join("  ›  ")}`;
    groupNav.classList.remove("hidden");
  }
  function applyGroupFocus() {
    restoreFocusOpacity();
    updateGroupNav();
    if (!activeGroup) { view.update(); return; }
    const visit = (container) => {
      for (const child of container.children || []) {
        if (child === activeGroup) continue;
        if (isAncestorOf(child, activeGroup)) visit(child);
        else dimItem(child);
      }
    };
    visit(designLayer);
    view.update();
  }
  function resetGroupFocus(emit = false) {
    restoreFocusOpacity();
    activeGroup = null;
    updateGroupNav();
    if (emit) { clearSel(); emitSel(); view.update(); }
  }
  function enterGroup(group) {
    if (!isUserGroup(group)) return false;
    activeGroup = group;
    clearSel();
    applyGroupFocus();
    emitSel();
    return true;
  }
  function leaveGroupLevel() {
    if (!activeGroup) return false;
    let parent = activeGroup.parent;
    while (parent && parent !== designLayer && !isUserGroup(parent)) parent = parent.parent;
    if (isUserGroup(parent)) return enterGroup(parent);
    resetGroupFocus(true);
    return true;
  }
  groupNav.querySelector(".group-nav__back").addEventListener("click", leaveGroupLevel);
  groupNav.querySelector(".group-nav__path").addEventListener("click", () => resetGroupFocus(true));

  // --- undo / redo (round-trips the design layer through Paper JSON) -------
  const undoStack = [], redoStack = [];
  function snapshot() {
    restoreFocusOpacity();
    const result = designLayer.children.length ? designLayer.exportJSON({ asString: true }) : "";
    if (activeGroup) applyGroupFocus();
    return result;
  }
  function restoreFrom(s) {
    clearNodeSelection();
    resetGroupFocus();
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
  function undo() { finishDrawing(); if (!undoStack.length) return; redoStack.push(snapshot()); restoreFrom(undoStack.pop()); }
  function redo() { finishDrawing(); if (!redoStack.length) return; undoStack.push(snapshot()); restoreFrom(redoStack.pop()); }
  function resetHistory() { undoStack.length = 0; redoStack.length = 0; }
  function exportDesign() { return snapshot(); }
  function exportSession() {
    return {
      design: snapshot(),
      undo: undoStack.slice(),
      redo: redoStack.slice(),
      designAngle,
      drawColor,
      drawWidth,
      selectionMode,
      viewZoom: view.zoom,
      viewCenter: [view.center.x, view.center.y],
    };
  }
  function importDesign(s) {
    abandonPenInteraction();
    clearNodeSelection();
    resetGroupFocus();
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
  function importSession(session = {}) {
    importDesign(session.design || "");
    undoStack.push(...(Array.isArray(session.undo) ? session.undo : []));
    redoStack.push(...(Array.isArray(session.redo) ? session.redo : []));
    designAngle = Number(session.designAngle) || 0;
    drawColor = session.drawColor || drawColor;
    drawWidth = Math.max(0.01, Number(session.drawWidth) || drawWidth);
    selectionMode = session.selectionMode === "design" ? "design" : "element";
    if (Number(session.viewZoom) > 0) view.zoom = Number(session.viewZoom);
    if (Array.isArray(session.viewCenter) && session.viewCenter.length === 2) view.center = P(+session.viewCenter[0], +session.viewCenter[1]);
    drawOverlay();
    view.update();
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
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
      const { gray } = grayscaleImageData(image, settings);
      const mode = raster.data.rasterMode || "Grayscale";
      const grayscaleMode = String(mode).toLowerCase() === "grayscale";
      const mask = grayscaleMode ? null : ditherMask(gray, image.width, image.height, settings, mode);
      const tinted = !isSelectedLaser(raster);
      const color = logicalColor(raster);
      for (let i = 0, pixel = 0; i < data.length; i += 4, pixel++) {
        const v = grayscaleMode
          ? Math.round(posterizeGray(gray[pixel], settings.grayLevels))
          : (mask[pixel] ? 0 : 255);
        if (tinted) [data[i], data[i + 1], data[i + 2]] = tintGray(v, color);
        else data[i] = data[i + 1] = data[i + 2] = v;
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
  function isSelectedLaser(item) {
    return [...selected].some((root) => firstLaserIn(root, (candidate) => candidate === item));
  }
  function selectionHasRaster() {
    return [...selected].some((root) => firstLaserIn(root, (candidate) => candidate.className === "Raster"));
  }
  let rasterEditOpen = false;
  function beginRasterEdit() { if (selectedRaster() && !rasterEditOpen) { pushHistory(); rasterEditOpen = true; } }
  function endRasterEdit() { if (rasterEditOpen) { rasterEditOpen = false; notifyChange(); } }
  function getRasterSettings() {
    const raster = selectedRaster();
    return raster ? normalizeRasterSettings(raster.data.rasterSettings) : null;
  }
  function getRasterMode() {
    const raster = selectedRaster();
    return raster?.data?.rasterMode || "Grayscale";
  }
  function setRasterModes(entries = []) {
    const byColor = new Map(entries.filter((entry) => entry.color).map((entry) => [entry.color.toLowerCase(), entry.mode]));
    const fallback = entries.find((entry) => !entry.color)?.mode;
    for (const raster of laserItems().filter((it) => it.className === "Raster")) {
      const mode = byColor.get(logicalColor(raster).toLowerCase()) || fallback || "Grayscale";
      if (raster.data.rasterMode === mode) continue;
      raster.data.rasterMode = mode;
      applyRasterSettings(raster);
    }
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
  function drawNodeOverlay() {
    if (!selectedSegments.size) return;
    uiLayer.activate();
    const radius = 5 / view.zoom;
    for (const segment of selectedSegments) {
      if (!segment?.path) continue;
      const marker = new paper.Path.Circle(segment.point, radius);
      marker.name = "selected-anchor";
      marker.fillColor = "white";
      marker.strokeColor = "#006B5C";
      marker.strokeWidth = 1.6 / view.zoom;
      marker.guide = true;
    }
  }
  function drawOverlay() {
    uiLayer.removeChildren();
    handles = [];
    const b = selectionBounds();
    if (!b) { drawNodeOverlay(); drawPenOverlay(); view.update(); return; }
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
    drawNodeOverlay();
    designLayer.activate();
    drawPenOverlay();
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
  const penCursor = (badge = "") => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>
    <g fill='white' stroke='#111' stroke-width='1.6' stroke-linejoin='round'><path d='M3 2l13 13-5.1 1.2-3 5.7-3-3 5.7-3L3 2z'/></g>
    ${badge}
  </svg>`)}") 3 2, crosshair`;
  const PEN_NEW_CURSOR = penCursor("<path d='M22 4v9M17.5 8.5h9' fill='none' stroke='white' stroke-width='4'/><path d='M22 4v9M17.5 8.5h9' fill='none' stroke='#111' stroke-width='1.5'/>");
  const PEN_ACTIVE_CURSOR = penCursor();
  const PEN_CONTINUE_CURSOR = penCursor("<path d='M18 12l8-8' fill='none' stroke='white' stroke-width='4'/><path d='M18 12l8-8' fill='none' stroke='#111' stroke-width='1.8'/>");
  const PEN_CLOSE_CURSOR = penCursor("<circle cx='22' cy='8' r='4' fill='white' stroke='#111' stroke-width='1.6'/>");
  const ROT_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#071411' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 11a9 9 0 0 1 15-6l3 3'/><path d='M21 3v5h-5'/><path d='M21 13a9 9 0 0 1-15 6l-3-3'/><path d='M3 21v-5h5'/></svg>";
  const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROT_SVG)}") 11 11, grab`;
  const cursorForTool = (tool) => tool === "select" ? SELECT_CURSOR : tool === "node" ? NODE_CURSOR : tool === "pen" ? PEN_NEW_CURSOR : DRAW_CURSOR;
  function setPenCursor(mode) {
    canvas.dataset.penCursor = mode;
    setCursor(mode === "continue" ? PEN_CONTINUE_CURSOR : mode === "close" ? PEN_CLOSE_CURSOR : mode === "active" ? PEN_ACTIVE_CURSOR : PEN_NEW_CURSOR);
  }
  function updateCursor(pt) {
    if (spaceDown) return; // grab already set on keydown
    if (currentTool === "pen") {
      setPenCursor(penCloseHover ? "close" : penEndpointHover ? "continue" : penPath ? "active" : "new");
      return;
    }
    if (currentTool !== "select") { setCursor(cursorForTool(currentTool)); return; }
    const h = handleAt(pt);
    if (h && selected.size) { setCursor(h.type === "rotate" ? ROTATE_CURSOR : SCALE_CURSORS[h.key] || "default"); return; }
    const b = selectionBounds();
    if (b && b.contains(pt)) { setCursor(SELECT_CURSOR); return; }
    const hit = paper.project.hitTest(pt, { fill: true, stroke: true, tolerance: 5 / view.zoom, match: (r) => r.item && r.item.layer === designLayer && (!activeGroup || isInsideGroup(r.item)) });
    setCursor(hit ? SELECT_CURSOR : SELECT_CURSOR);
  }
  function restoreToolCursor() {
    if (currentTool === "pen") updateCursor(penHoverPoint || P(-1e6, -1e6));
    else setCursor(cursorForTool(currentTool));
  }

  // --- pan (native, absolute pixel tracking = no judder) ------------------
  let pan = null;
  const setCursor = (c) => {
    canvas.style.cursor = c;
    if (currentTool !== "pen") delete canvas.dataset.penCursor;
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Alt" || e.altKey) altDown = true;
    if (e.key === "Shift" || e.shiftKey) shiftDown = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt") altDown = false;
    if (e.key === "Shift") shiftDown = false;
  });
  window.addEventListener("blur", () => { altDown = false; shiftDown = false; });
  window.addEventListener("keydown", (e) => { if (e.code === "Space" && !spaceDown) { spaceDown = true; if (!pan) setCursor("grab"); } });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { spaceDown = false; if (!pan) restoreToolCursor(); } });
  window.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === "Escape") && currentTool === "pen" && penPath) finishPen(); });
  canvas.addEventListener("dblclick", (e) => {
    if (currentTool === "pen" && penPath) { finishPen(); return; }
    if (currentTool !== "select") return;
    const pt = view.viewToProject(P(e.offsetX, e.offsetY));
    const hit = paper.project.hitTest(pt, { fill: true, stroke: true, tolerance: 5 / view.zoom, match: (r) => r.item && r.item.layer === designLayer });
    if (activeGroup && (!hit || !isInsideGroup(hit.item))) {
      resetGroupFocus(true);
      return;
    }
    const item = hit && toSelectable(hit.item);
    if (isUserGroup(item)) enterGroup(item);
  });
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
  canvas.addEventListener("mouseleave", () => {
    if (currentTool !== "pen" || penDragSegment) return;
    penHoverPoint = null; penEndpointHover = null; penCloseHover = false;
    drawPenOverlay();
  });
  const endPan = (e) => { if (!pan) return; pan = null; if (spaceDown) setCursor("grab"); else restoreToolCursor(); try { canvas.releasePointerCapture(e.pointerId); } catch {} };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);

  // --- select / move / scale / rotate / marquee (Paper tool) --------------
  const tool = new paper.Tool();
  let mode = null, moveItems = null, marquee = null, downPt = null;
  let anchor = null, scaleKey = null, scaleCenter = null, scaleOpposite = null, scaleDownPoint = null, scaleFromCenter = false, lastVec = null, lastAngle = null;
  let preDrag = null, dragChanged = false;
  let drawStart = null, drawPreview = null, drawMoved = false, preDraw = null;

  // Finish a drag-drawn shape but STAY in the tool (user switches tools themselves).
  function endDrawTool() { drawStart = null; drawPreview = null; drawSizeCb && drawSizeCb(null); toolResetCb && toolResetCb(); }

  // --- pen tool (bezier) --------------------------------------------------
  function abandonPenInteraction() {
    if (penPath && !penChanged && penResumeReversed) penPath.reverse();
    penPath = null; penHoverPoint = null; penEndpointHover = null; penCloseHover = false;
    penDragSegment = null; penDragHandleKind = null; penChanged = false; penResumeReversed = false;
    penLayer.removeChildren();
  }
  function finishDrawing() { if (penPath) finishPen(); }
  function openEndpointAt(pt) {
    const root = selectionRoot();
    let best = null;
    for (const path of root.children) {
      if (path === penPath || path.className !== "Path" || path.closed || !path.visible || !path.segments.length) continue;
      const candidates = [
        { path, segment: path.firstSegment, atStart: true },
        { path, segment: path.lastSegment, atStart: false },
      ];
      for (const candidate of candidates) {
        const distance = pt.getDistance(candidate.segment.point);
        if (distance <= 9 / view.zoom && (!best || distance < best.distance)) best = { ...candidate, distance };
      }
    }
    return best;
  }
  function anchorAt(pt) {
    const root = selectionRoot();
    let best = null;
    for (const path of root.children) {
      if (path === penPath || path.className !== "Path" || !path.visible) continue;
      for (const segment of path.segments) {
        const distance = pt.getDistance(segment.point);
        if (distance <= 8 / view.zoom && (!best || distance < best.distance)) best = { path, segment, distance };
      }
    }
    return best;
  }
  function penGuideLine(from, to) {
    const line = new paper.Path.Line(from, to);
    line.name = "pen-handle-line";
    line.strokeColor = "#006B5C"; line.strokeWidth = 1 / view.zoom; line.guide = true;
  }
  function penGuidePoint(point, { active = false, ring = false } = {}) {
    const radius = (ring ? 5 : 3.5) / view.zoom;
    const marker = ring
      ? new paper.Path.Circle(point, radius)
      : new paper.Path.Rectangle(new paper.Rectangle(point.x - radius, point.y - radius, radius * 2, radius * 2));
    marker.name = ring ? "pen-endpoint-indicator" : "pen-anchor";
    marker.fillColor = ring ? new paper.Color(1, 1, 1, 0.9) : active ? "#006B5C" : "white";
    marker.strokeColor = "#006B5C"; marker.strokeWidth = 1 / view.zoom; marker.guide = true;
  }
  function penHandle(segment, vector) {
    if (!vector || vector.length < 0.01) return;
    const point = segment.point.add(vector);
    penGuideLine(segment.point, point);
    const marker = new paper.Path.Circle(point, 3.5 / view.zoom);
    marker.name = "pen-handle";
    marker.fillColor = "white"; marker.strokeColor = "#006B5C"; marker.strokeWidth = 1 / view.zoom; marker.guide = true;
  }
  function activePenHandleAt(point) {
    const segment = penPath?.lastSegment;
    if (!segment) return null;
    const handles = [
      { kind: "in", vector: segment.handleIn },
      { kind: "out", vector: segment.handleOut },
    ];
    for (const handle of handles) {
      if (handle.vector.length > 0.01 && point.getDistance(segment.point.add(handle.vector)) <= 7 / view.zoom) return { segment, kind: handle.kind };
    }
    return null;
  }
  function drawPenOverlay() {
    penLayer.removeChildren();
    if (currentTool !== "pen") { designLayer.activate(); return; }
    penLayer.activate();
    if (penPath?.segments.length) {
      for (const segment of penPath.segments) penGuidePoint(segment.point, { active: segment === penPath.lastSegment });
      const active = penPath.lastSegment;
      penHandle(active, active.handleIn);
      penHandle(active, active.handleOut);
      if (penHoverPoint && !penHoverPoint.equals(active.point)) {
        const destination = penCloseHover ? penPath.firstSegment : null;
        const preview = new paper.Path({ name: "pen-preview" });
        preview.add(new paper.Segment(active.point.clone(), active.handleIn.clone(), active.handleOut.clone()));
        preview.add(new paper.Segment(
          destination ? destination.point.clone() : penHoverPoint.clone(),
          destination ? destination.handleIn.clone() : null,
          destination ? destination.handleOut.clone() : null,
        ));
        preview.strokeColor = "#007A66"; preview.strokeWidth = 1.2 / view.zoom;
        preview.dashArray = [5 / view.zoom, 3 / view.zoom]; preview.guide = true;
        if (!destination) penGuidePoint(penHoverPoint, { ring: true });
      }
    } else if (penEndpointHover) {
      penGuidePoint(penEndpointHover.segment.point, { ring: true });
    }
    designLayer.activate();
  }
  function updatePenHover(point) {
    if (currentTool !== "pen") return;
    penHoverPoint = point.clone();
    penEndpointHover = penPath ? null : openEndpointAt(point);
    penCloseHover = !!(penPath?.segments.length > 1 && point.getDistance(penPath.firstSegment.point) <= 9 / view.zoom);
    drawPenOverlay();
  }
  function finishPen() {
    if (!penPath) return;
    const discarded = penPath.segments.length < 2;
    if (discarded) penPath.remove();
    else if (!penChanged && penResumeReversed) penPath.reverse();
    else if (penChanged) { undoStack.push(preDraw); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; }
    const committed = !discarded && penChanged;
    penPath = null; // stay in the pen tool, ready for the next path
    penDragSegment = null; penDragHandleKind = null; penChanged = false; penResumeReversed = false;
    penEndpointHover = penHoverPoint ? openEndpointAt(penHoverPoint) : null;
    penCloseHover = false;
    drawPenOverlay(); updateCursor(penHoverPoint || P(-1e6, -1e6));
    if (committed) { notifyChange(); toolResetCb && toolResetCb(); }
  }
  function onPenDown(e) {
    if (!penPath) {
      preDraw = snapshot();
      const anchorHit = anchorAt(e.point);
      if (anchorHit && (e.event.shiftKey || (anchorHit.segment !== anchorHit.path.firstSegment && anchorHit.segment !== anchorHit.path.lastSegment) || anchorHit.path.closed)) {
        selectNodeSegment(anchorHit.segment, !!e.event.shiftKey);
        nodeEditItem = anchorHit.path;
        view.update();
        return;
      }
      const continuation = openEndpointAt(e.point);
      if (continuation) {
        clearNodeSelection();
        penPath = continuation.path;
        penChanged = false; penResumeReversed = continuation.atStart;
        if (penResumeReversed) penPath.reverse();
        penDragSegment = penPath.lastSegment; penDragHandleKind = "symmetric";
        penEndpointHover = null; penCloseHover = false;
        drawPenOverlay(); setPenCursor("active");
        return;
      }
      clearNodeSelection();
      designLayer.activate();
      penPath = new paper.Path({ strokeColor: drawColor, strokeWidth: drawWidth, fillColor: null });
      if (activeGroup) activeGroup.addChild(penPath);
      penChanged = true; penResumeReversed = false;
    }
    const handle = activePenHandleAt(e.point);
    if (handle) {
      penDragSegment = handle.segment; penDragHandleKind = handle.kind;
      return;
    }
    if (penPath.segments.length > 1 && e.point.getDistance(penPath.firstSegment.point) < 9 / view.zoom) {
      penPath.closed = true; penChanged = true; finishPen(); return;
    }
    if (penPath.lastSegment && e.point.getDistance(penPath.lastSegment.point) < 9 / view.zoom) {
      penDragSegment = penPath.lastSegment; penDragHandleKind = "symmetric";
      return;
    }
    penDragSegment = penPath.add(e.point); penDragHandleKind = "symmetric"; penChanged = true;
    penEndpointHover = null; penCloseHover = false;
    drawPenOverlay(); view.update();
  }
  function onPenDrag(e) {
    if (!penPath || !penDragSegment) return;
    const seg = penDragSegment;
    const vector = e.point.subtract(seg.point);
    if (penDragHandleKind === "in") {
      seg.handleIn = vector; seg.handleOut = vector.multiply(-1);
    } else {
      seg.handleOut = vector; seg.handleIn = vector.multiply(-1);
    }
    penChanged = true; drawPenOverlay(); view.update();
  }
  function onPenUp() {
    penDragSegment = null; penDragHandleKind = null;
    drawPenOverlay();
  }
  // --- node edit tool -----------------------------------------------------
  function clearNodeSelection() {
    for (const segment of selectedSegments) if (segment) segment.selected = false;
    selectedSegments.clear();
    if (nodeEditItem) nodeEditItem.selected = false;
    nodeEditItem = null; nodeHit = null;
  }
  function selectNodeSegment(segment, additive = false) {
    if (!additive) clearNodeSelection();
    if (additive && selectedSegments.has(segment)) {
      segment.selected = false;
      selectedSegments.delete(segment);
      return;
    }
    segment.selected = true;
    selectedSegments.add(segment);
  }
  function selectedCurveSegments(hit) {
    if (hit?.type !== "stroke") return null;
    const curve = hit.location?.curve || hit.curve;
    const first = curve?.segment1;
    const second = curve?.segment2;
    if (!first || !second || !selectedSegments.has(first) || !selectedSegments.has(second)) return null;
    return first === second ? [first] : [first, second];
  }
  function onNodeDown(e) {
    const hr = paper.project.hitTest(e.point, { segments: true, handles: true, stroke: true, fill: true, tolerance: 8 / view.zoom, match: (r) => r.item && r.item.layer === designLayer && (!activeGroup || isInsideGroup(r.item)) });
    const curveSegments = selectedCurveSegments(hr);
    if (curveSegments) {
      clearSel(); emitSel();
      nodeEditItem = hr.item;
      nodeHit = { kind: "curve", segments: curveSegments };
      preDrag = snapshot(); dragChanged = false;
    } else if (hr?.segment && hr.type !== "stroke") {
      const it = hr.item;
      clearSel(); emitSel();
      selectNodeSegment(hr.segment, !!e.event.shiftKey);
      nodeEditItem = it;
      nodeHit = !selectedSegments.has(hr.segment) ? null
        : hr.type === "segment" ? { seg: hr.segment, kind: "point" }
          : hr.type === "handle-in" ? { seg: hr.segment, kind: "in" }
            : hr.type === "handle-out" ? { seg: hr.segment, kind: "out" } : null;
      preDrag = snapshot(); dragChanged = false;
    } else clearNodeSelection();
    drawOverlay();
  }
  function onNodeDrag(e) {
    if (!nodeHit) return;
    dragChanged = true;
    if (nodeHit.kind === "curve") {
      for (const segment of nodeHit.segments) segment.point = segment.point.add(e.delta);
    } else {
      const s = nodeHit.seg;
      if (nodeHit.kind === "point") for (const segment of selectedSegments) segment.point = segment.point.add(e.delta);
      else if (nodeHit.kind === "in") s.handleIn = s.handleIn.add(e.delta);
      else s.handleOut = s.handleOut.add(e.delta);
    }
    drawOverlay();
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
      if (h.type === "scale") {
        mode = "scale"; scaleKey = h.key; scaleCenter = selectionBounds().center;
        scaleOpposite = h.anchor; scaleDownPoint = e.point.clone();
        scaleFromCenter = altDown || !!e.event.altKey || paper.Key.isDown("alt") || paper.Key.isDown("option");
        anchor = scaleFromCenter ? scaleCenter : scaleOpposite;
        lastVec = e.point.subtract(anchor);
      }
      else { mode = "rotate"; anchor = selectionBounds().center; lastAngle = e.point.subtract(anchor).angle; }
      return;
    }
    // drag anywhere inside the selection box = move (LightBurn-style)
    const selBounds = selectionBounds();
    if (selBounds && selBounds.contains(e.point)) { mode = "move"; moveItems = [...selected]; preDrag = snapshot(); dragChanged = false; return; }
    const hit = paper.project.hitTest(e.point, { fill: true, stroke: true, tolerance: 5 / view.zoom, match: (r) => r.item && r.item.layer === designLayer && (!activeGroup || isInsideGroup(r.item)) });
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
  tool.onMouseMove = (e) => {
    coordsCb && coordsCb(e.point.x, e.point.y);
    if (currentTool === "pen") updatePenHover(e.point);
    updateCursor(e.point);
  };
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
      const wantsCenter = altDown || !!e.event.altKey || paper.Key.isDown("alt") || paper.Key.isDown("option");
      if (!dragChanged && wantsCenter !== scaleFromCenter) {
        scaleFromCenter = wantsCenter;
        anchor = scaleFromCenter ? scaleCenter : scaleOpposite;
        lastVec = scaleDownPoint.subtract(anchor);
      }
      dragChanged = true;
      const cur = e.point.subtract(anchor);
      let sx = lastVec.x ? cur.x / lastVec.x : 1, sy = lastVec.y ? cur.y / lastVec.y : 1;
      if (scaleKey === "tc" || scaleKey === "bc") sx = 1;
      if (scaleKey === "lc" || scaleKey === "rc") sy = 1;
      if (shiftDown || e.event.shiftKey) {
        if (scaleKey === "tc" || scaleKey === "bc") sx = sy;
        else if (scaleKey === "lc" || scaleKey === "rc") sy = sx;
        else { const s = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy; sx = s; sy = s; }
      }
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
    if (currentTool === "pen") return onPenUp(e); // pen commits via dbl-click / Enter / Esc
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
    const hit = paper.project.hitTest(pt, { fill: true, stroke: true, tolerance: 5 / view.zoom, match: (r) => r.item && r.item.layer === designLayer && (!activeGroup || isInsideGroup(r.item)) });
    const it = hit && toSelectable(hit.item);
    if (it && !selected.has(it)) {
      if (!e.shiftKey) clearSel();
      addSel(it);
      emitSel();
    }
    contextCb && contextCb({ x: e.clientX, y: e.clientY, hasSelection: selected.size > 0, hasRaster: selectionHasRaster(), canGroup: selectedItems().length > 1, canUngroup: canUngroup() });
  });

  // --- geometry stats for time estimation ---------------------------------
  function geometryStats() {
    const map = new Map();
    for (const it of laserItems()) {
      const raster = it.className === "Raster";
      const hex = logicalColor(it);
      const cur = map.get(hex) || { length: 0, area: 0 };
      cur.length += raster ? 0 : (it.length || 0);
      cur.area += raster ? Math.abs(it.bounds.area || 0) : Math.abs(it.area || 0);
      map.set(hex, cur);
    }
    return map;
  }
  const css = (c) => (c ? c.toCSS(true) : null);
  const logicalColor = (it) => itemLayerColor(it, css);

  // --- position (whole design) --------------------------------------------
  const items = () => selectionRoot().children.slice();
  const REF = (b, k) => ({ tl: b.topLeft, tc: b.topCenter, tr: b.topRight, lc: b.leftCenter, c: b.center, rc: b.rightCenter, bl: b.bottomLeft, bc: b.bottomCenter, br: b.bottomRight }[k] || b.topLeft);
  function getRect() {
    const root = selectionRoot();
    if (!root.children.length) return null;
    const b = root.bounds;
    return { x: b.x, y: b.y, w: b.width, h: b.height, angle: designAngle };
  }
  function refX(key) { const b = selectionRoot().bounds; return REF(b, key); }
  function applyRect(key, x, y, w, h) {
    const root = selectionRoot();
    if (!root.children.length) return;
    pushHistory();
    let b = root.bounds, anchor = REF(b, key);
    const sx = w > 0 && b.width ? w / b.width : 1, sy = h > 0 && b.height ? h / b.height : 1;
    if (sx !== 1 || sy !== 1) { for (const it of items()) it.scale(sx, sy, anchor); b = root.bounds; }
    const d = P(x, y).subtract(REF(b, key));
    for (const it of items()) it.position = it.position.add(d);
    view.update(); drawOverlay(); notifyChange();
  }
  function applyAngle(deg) {
    const root = selectionRoot();
    if (!root.children.length) return;
    pushHistory();
    const c = root.bounds.center;
    for (const it of items()) it.rotate(deg - designAngle, c);
    designAngle = deg; view.update(); drawOverlay(); notifyChange();
  }
  // reference point coordinates for the position readout (respects the 9-dot)
  function getRef(key) { const root = selectionRoot(); const p = root.children.length ? REF(root.bounds, key) : null; return p && { x: p.x, y: p.y }; }

  // --- grouping, arrange, clipboard ---------------------------------------
  const stackSort = (arr) => arr.slice().sort((a, b) => a.index - b.index);
  function selectedItems() { return stackSort([...selected].filter((it) => it && it.parent)); }
  function canUngroup() { return selectedItems().some(isUserGroup); }
  function selectAll() { selectAllItems(); emitSel(); return selected.size > 0; }
  function deleteSelection() {
    if (selectedSegments.size) {
      pushHistory();
      const paths = new Set([...selectedSegments].map((segment) => segment.path).filter(Boolean));
      for (const segment of [...selectedSegments].sort((a, b) => b.index - a.index)) if (segment.path) segment.remove();
      clearNodeSelection();
      for (const path of paths) if (path.parent && path.segments.length < 2) {
        const parent = path.parent;
        path.remove();
        if (parent.className === "CompoundPath" && !parent.children.length) parent.remove();
      }
      drawPenOverlay(); view.update(); notifyChange();
      return true;
    }
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
    const parent = selectionRoot();
    if (roots.length < 2 || roots.some((it) => it.parent !== parent)) return false;
    pushHistory();
    const index = Math.min(...roots.map((it) => it.index));
    const group = new paper.Group();
    group.data.modcutGroup = true;
    group.data.modcutGroupName = "Group";
    parent.insertChild(index, group);
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
    const container = selectionRoot();
    for (const def of defs) {
      designLayer.activate();
      const item = designLayer.importJSON(def);
      if (item && item.className === "Layer" && item.children?.length) {
        for (const child of item.children.slice()) {
          container.addChild(child);
          child.position = child.position.add(offset);
          if (isSelectableItem(child)) addSel(child);
        }
        item.remove();
      } else if (item) {
        container.addChild(item);
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
    return color ? all.filter((it) => logicalColor(it) === String(color).toLowerCase()) : all;
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
  function engraveSeg(it, sp, out) {
    if (engraveStrategy(it) === "raster") rasterScan(it, sp, out);
    else vectorSeg(it, sp, out);
  }
  // Collect segments grouped per source shape (keeps a shape's paths together).
  function collectSegs(specs) {
    const groups = [];
    for (const sp of specs) for (const it of itemsForColor(sp.color)) {
      const g = [];
      sp.op === "Engrave" ? engraveSeg(it, sp, g) : vectorSeg(it, sp, g);
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
  async function rasterDitherScan(it, sp, out) {
    const image = await loadRasterImageData(it);
    if (!image) return rasterImageScan(it, sp, out);
    const b = it.bounds;
    if (!b.width || !b.height) return;
    const { gray, settings } = grayscaleImageData(image, it.data?.rasterSettings);
    const mask = ditherMask(gray, image.width, image.height, settings, sp.dither);
    let interval = 25.4 / Math.max(1, sp.dpi || 300);
    if (b.height / interval > 1200) interval = b.height / 1200;
    const columns = Math.max(1, Math.min(4000, Math.ceil(b.width / interval)));
    const rows = [];
    for (let y = b.bottom; y >= b.top; y -= interval) rows.push(y);
    if (!sp.bottomUp) rows.reverse();
    let flip = false;
    for (const y of rows) {
      const py = Math.max(0, Math.min(image.height - 1, Math.floor(((y - b.top) / b.height) * image.height)));
      let start = null;
      const runs = [];
      for (let column = 0; column < columns; column++) {
        const px = Math.max(0, Math.min(image.width - 1, Math.floor(((column + 0.5) / columns) * image.width)));
        const dark = mask[py * image.width + px] === 1;
        if (dark && start == null) start = column;
        if ((!dark || column === columns - 1) && start != null) {
          runs.push([start, dark && column === columns - 1 ? column + 1 : column]);
          start = null;
        }
      }
      const ordered = flip ? runs.slice().reverse() : runs;
      for (const [aPx, cPx] of ordered) {
        let a = P(b.left + (aPx / columns) * b.width, y);
        let c = P(b.left + (cPx / columns) * b.width, y);
        if (flip) { const t = a; a = c; c = t; }
        out.push({ pts: [a, c], speed: sp.speed, power: sp.power, freq: sp.freq, dpi: sp.dpi, dither: sp.dither, op: "Engrave", raster: true });
      }
      flip = !flip;
    }
  }
  async function rasterGrayscaleScan(it, sp, out) {
    const image = await loadRasterImageData(it);
    if (!image) return rasterImageScan(it, sp, out);
    const b = it.bounds;
    if (!b.width || !b.height) return;
    const { gray, settings } = grayscaleImageData(image, it.data?.rasterSettings);
    let interval = 25.4 / Math.max(1, sp.dpi || 300);
    if (b.height / interval > 1200) interval = b.height / 1200;
    const columns = Math.max(1, Math.min(4000, Math.ceil(b.width / interval)));
    const rows = [];
    for (let y = b.bottom; y >= b.top; y -= interval) rows.push(y);
    if (!sp.bottomUp) rows.reverse();
    let flip = false;
    for (const y of rows) {
      const py = Math.max(0, Math.min(image.height - 1, Math.floor(((y - b.top) / b.height) * image.height)));
      const samples = new Float32Array(columns);
      for (let column = 0; column < columns; column++) {
        const px = Math.max(0, Math.min(image.width - 1, Math.floor(((column + 0.5) / columns) * image.width)));
        samples[column] = gray[py * image.width + px];
      }
      const runs = grayscaleRuns(samples, settings.grayLevels, sp.power);
      const ordered = flip ? runs.slice().reverse() : runs;
      for (const run of ordered) {
        let a = P(b.left + (run.start / columns) * b.width, y);
        let c = P(b.left + (run.end / columns) * b.width, y);
        if (flip) { const t = a; a = c; c = t; }
        out.push({
          pts: [a, c], speed: sp.speed, power: run.power, freq: sp.freq,
          dpi: sp.dpi, dither: "Grayscale", op: "Engrave", raster: true,
        });
      }
      flip = !flip;
    }
  }
  async function collectJobSegs(specs) {
    const groups = [];
    for (const sp of specs) for (const it of itemsForColor(sp.color)) {
      const g = [];
      if (sp.op === "Engrave" && it.className === "Raster" && String(sp.dither).toLowerCase() === "grayscale") await rasterGrayscaleScan(it, sp, g);
      else if (sp.op === "Engrave" && it.className === "Raster") await rasterDitherScan(it, sp, g);
      else sp.op === "Engrave" ? engraveSeg(it, sp, g) : vectorSeg(it, sp, g);
      if (g.length) groups.push(g);
      if (groups.length > 10000) break;
    }
    return groups;
  }
  async function orderJobSegs(specs) {
    const groups = await collectJobSegs(specs);
    if (groups.some((group) => group.some((segment) => segment.raster))) return groups.flat();
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
    setSelectionMode, undo, redo, resetHistory, exportDesign, importDesign, exportSession, importSession,
    groupSelected, ungroupSelected, arrangeSelected, copySelection, pasteSelection, duplicateSelection,
    canUngroup, selectAll, deleteSelection,
    setGrid, setTool, setPathOrder, getColors, addShape, finishDrawing,
    setDrawStyle, applyStyle, getStyle,
    getSelectionInfo: () => ({ hasRaster: selectionHasRaster(), count: selected.size }),
    getRasterSettings, getRasterMode, setRasterModes, beginRasterEdit, updateRasterSettings, endRasterEdit, resetRasterSettings,
    onDrawSize: (cb) => (drawSizeCb = cb),
    onDrawClick: (cb) => (drawClickCb = cb),
    onToolReset: (cb) => (toolResetCb = cb),
    onContextMenu: (cb) => (contextCb = cb),
  };
}
