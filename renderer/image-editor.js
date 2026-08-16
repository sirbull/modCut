import {
  DEFAULT_ENGRAVING_RECIPE,
  ENGRAVING_PRESETS,
  ENGRAVING_STYLES,
  PHOTO_MODES,
  cropAndResampleImageData,
  detailDensity,
  engravingPreset,
  engravingResultToImageData,
  normalizeEngravingRecipe,
  processEngravingImage,
} from "./engraving-recipe.mjs";

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
let payload = null;
let sourceImage = null;
let sourcePixels = null;
let recipe = normalizeEngravingRecipe();
let activeTool = "crop";
let previewMode = "after";
let zoom = 1;
let renderTimer = null;
let renderSerial = 0;
let cropDrag = null;
let aspectValue = "free";
let materialPreview = false;
let history = [];
let historyIndex = -1;
let restoringHistory = false;

const FALLBACK_FONTS = ["Arial", "Helvetica Neue", "Avenir Next", "Times New Roman", "Georgia", "Verdana", "Trebuchet MS", "Courier New", "Menlo"];
const defaultTextLayer = () => ({
  id: `text-${Date.now()}`, text: "", fontFamily: "Arial", size: 8, x: 50, y: 50,
  weight: "normal", style: "normal", color: "#000000",
});

const adjustmentFields = [
  ["brightness", "Brightness", -100, 100, 1], ["contrast", "Contrast", -100, 100, 1],
  ["blackPoint", "Black point", 0, 254, 1], ["whitePoint", "White point", 1, 255, 1],
  ["gamma", "Midtones", .2, 3, .05], ["dehaze", "Dehaze", 0, 100, 1], ["denoise", "Denoise", 0, 4, .25],
  ["enhanceAmount", "Sharpen", 0, 3, .05], ["enhanceRadius", "Sharpen radius", .5, 5, .25],
];

const styleCopy = {
  Photo: "Grayscale or diffusion", Dots: "Variable-size halftone", Lines: "Parallel line engraving",
  Crosshatch: "Banknote-style layers", Sketch: "Edge and line drawing",
};

const styleScope = (style = recipe.style) => style === "Photo" ? "photo" : style.toLowerCase();

function controlRow(scope, key, label, min, max, step) {
  const row = document.createElement("div");
  row.className = "control";
  row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><input type="number" min="${min}" max="${max}" step="${step}">`;
  const range = row.children[1], number = row.children[2];
  const read = () => scope ? recipe[scope][key] : recipe.adjustments[key];
  const write = (value) => {
    if (scope) recipe[scope][key] = clamp(value, min, max);
    else recipe.adjustments[key] = clamp(value, min, max);
    changed();
    range.value = number.value = read();
    if (scope && ["detail", "cellsPerInch", "linesPerInch"].includes(key)) updateDetailHint();
  };
  range.value = number.value = read();
  range.addEventListener("input", () => write(range.value));
  number.addEventListener("change", () => write(number.value === "" ? read() : number.value));
  return row;
}

function selectField(label, values, current, onChange) {
  const field = document.createElement("label");
  field.className = "select-field";
  const options = values.map((value) => typeof value === "string" ? [value, value] : value);
  field.innerHTML = `<span>${label}</span><select>${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select>`;
  field.querySelector("select").value = current;
  field.querySelector("select").addEventListener("change", (event) => onChange(event.target.value));
  return field;
}

function buildAdjustmentControls() {
  const host = $("adjustmentControls");
  host.replaceChildren(...adjustmentFields.map((field) => controlRow(null, ...field)));
  $("invertControl").checked = recipe.adjustments.invert;
  updateTonePipelineHint();
}

function updateTonePipelineHint() {
  $("tonePipelineHint").textContent = `Tone, dehaze and sharpening are applied before ${recipe.style}. The preview and laser output use this same order.`;
}

function buildStyleGrid() {
  const host = $("styleGrid");
  host.replaceChildren(...ENGRAVING_STYLES.map((style) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `style-card${recipe.style === style ? " is-active" : ""}`;
    button.innerHTML = `<strong>${style}</strong><span>${styleCopy[style]}</span>`;
    button.addEventListener("click", () => { recipe.style = style; buildStyleGrid(); buildStyleControls(); changed(); });
    return button;
  }));
}

function buildStyleControls() {
  const host = $("styleControls");
  const nodes = [];
  const scope = styleScope();
  const detail = controlRow(scope, "detail", "Detail level", 1, 100, 1);
  detail.classList.add("control--detail");
  $("detailControl").replaceChildren(detail);
  updateDetailHint();
  if (recipe.style === "Photo") {
    nodes.push(selectField("Raster mode", PHOTO_MODES, recipe.photo.mode, (value) => { recipe.photo.mode = value; changed(); buildStyleControls(); }));
    if (recipe.photo.mode === "Grayscale") nodes.push(controlRow(null, "grayLevels", "Gray levels", 2, 32, 1));
    else nodes.push(controlRow(null, "threshold", "Threshold", 0, 255, 1));
    nodes.push(controlRow("photo", "noise", "Anti-banding noise", 0, 30, 1));
  } else if (recipe.style === "Dots") {
    nodes.push(controlRow("dots", "cellsPerInch", "Cells / inch", 5, 300, 1));
    nodes.push(controlRow("dots", "angle", "Angle", -180, 180, 1));
    nodes.push(selectField("Dot shape", ["Round", "Ellipse", "Diamond", "Square"], recipe.dots.shape, (value) => { recipe.dots.shape = value; changed(); }));
    nodes.push(controlRow("dots", "minSize", "Minimum size %", 0, 95, 1));
    nodes.push(controlRow("dots", "maxSize", "Maximum size %", 5, 100, 1));
  } else if (recipe.style === "Lines") {
    nodes.push(controlRow("lines", "linesPerInch", "Lines / inch", 5, 300, 1));
    nodes.push(controlRow("lines", "angle", "Angle", -180, 180, 1));
    nodes.push(controlRow("lines", "minWidth", "Minimum width %", 0, 95, 1));
    nodes.push(controlRow("lines", "maxWidth", "Maximum width %", 5, 100, 1));
    nodes.push(controlRow("lines", "roughness", "Roughness", 0, 35, 1));
  } else if (recipe.style === "Crosshatch") {
    nodes.push(controlRow("crosshatch", "linesPerInch", "Lines / inch", 5, 300, 1));
    nodes.push(controlRow("crosshatch", "angle", "Main angle", -180, 180, 1));
    nodes.push(controlRow("crosshatch", "crossAngle", "Cross angle", -180, 180, 1));
    nodes.push(controlRow("crosshatch", "crossThreshold", "Cross in darks %", 0, 100, 1));
    nodes.push(controlRow("crosshatch", "minWidth", "Minimum width %", 0, 95, 1));
    nodes.push(controlRow("crosshatch", "maxWidth", "Maximum width %", 5, 100, 1));
    nodes.push(controlRow("crosshatch", "roughness", "Roughness", 0, 35, 1));
  } else {
    nodes.push(controlRow("sketch", "edgeRadius", "Edge radius", 1, 6, 1));
    nodes.push(controlRow("sketch", "edgeAmount", "Edge strength", .1, 5, .1));
    nodes.push(controlRow("sketch", "threshold", "Threshold", 1, 254, 1));
    nodes.push(controlRow("sketch", "smoothing", "Smoothing", 0, 4, 1));
  }
  host.replaceChildren(...nodes);
}

function updateDetailHint() {
  const scope = styleScope();
  const value = recipe[scope].detail;
  if (recipe.style === "Photo") {
    $("detailHint").textContent = value < 50
      ? "Smoother output: small texture and noise are reduced."
      : value > 50 ? "Finer output: small edges are preserved and enhanced." : "Balanced detail with no extra smoothing or enhancement.";
  } else if (recipe.style === "Dots") {
    const density = detailDensity(recipe.dots.cellsPerInch, value);
    $("detailHint").textContent = `About ${Math.round(density)} halftone cells/in. Higher detail creates smaller dots and may take longer to engrave.`;
  } else if (recipe.style === "Lines") {
    const density = detailDensity(recipe.lines.linesPerInch, value);
    $("detailHint").textContent = `About ${Math.round(density)} lines/in. Higher detail creates finer, denser toolpaths.`;
  } else if (recipe.style === "Crosshatch") {
    const density = detailDensity(recipe.crosshatch.linesPerInch, value);
    $("detailHint").textContent = `About ${Math.round(density)} lines/in in each pattern. Higher detail can substantially increase job complexity.`;
  } else {
    $("detailHint").textContent = value < 50
      ? "Keeps stronger, broader edges and removes small texture."
      : value > 50 ? "Includes finer and weaker edges; noisy photos may need more denoise." : "Balanced edge detection for drawings and photos.";
  }
}

function currentTextLayer(create = false) {
  if (recipe.texts?.[0]) return recipe.texts[0];
  if (!create) return defaultTextLayer();
  recipe.texts = [defaultTextLayer()];
  return recipe.texts[0];
}

function updateTextControls() {
  const text = currentTextLayer();
  $("textContent").value = text.text;
  if (![...$("textFont").options].some((option) => option.value === text.fontFamily)) {
    $("textFont").add(new Option(text.fontFamily, text.fontFamily), 0);
  }
  $("textFont").value = text.fontFamily;
  $("textBold").setAttribute("aria-pressed", String(text.weight === "bold"));
  $("textItalic").setAttribute("aria-pressed", String(text.style === "italic"));
  $("textColor").value = text.color;
  $("textSize").value = text.size;
  $("textSizeValue").value = `${text.size}%`;
  $("textSizeValue").textContent = `${text.size}%`;
  $("textX").value = text.x;
  $("textY").value = text.y;
  $("clearText").disabled = !recipe.texts?.length;
}

function setTextLayer(partial) {
  Object.assign(currentTextLayer(true), partial);
  changed();
  updateTextControls();
}

function populateFontSelect(fonts = FALLBACK_FONTS) {
  const select = $("textFont");
  const selected = currentTextLayer().fontFamily;
  const families = [...new Set([...fonts, selected].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.replaceChildren(...families.map((family) => new Option(family, family)));
  select.value = selected;
}

async function loadLocalFonts() {
  let fonts = FALLBACK_FONTS;
  try {
    if (typeof window.queryLocalFonts === "function") {
      const localFonts = await window.queryLocalFonts();
      const families = localFonts.map((font) => font.family).filter(Boolean);
      if (families.length) fonts = [...new Set([...FALLBACK_FONTS, ...families])].slice(0, 250);
    }
  } catch { /* Browsers that do not expose local fonts keep the useful system fallback list. */ }
  populateFontSelect(fonts);
}

function recipeSnapshot() { return JSON.stringify(recipe); }

function updateHistoryButtons() {
  $("undoButton").disabled = historyIndex <= 0;
  $("redoButton").disabled = historyIndex < 0 || historyIndex >= history.length - 1;
}

function recordHistory() {
  if (restoringHistory) return;
  const snapshot = recipeSnapshot();
  if (history[historyIndex] === snapshot) return;
  history.splice(historyIndex + 1);
  history.push(snapshot);
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function restoreHistory(direction) {
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  restoringHistory = true;
  recipe = normalizeEngravingRecipe(JSON.parse(history[next]));
  historyIndex = next;
  restoringHistory = false;
  refreshAllControls();
  updateHistoryButtons();
}

function userPresets() {
  try { return JSON.parse(localStorage.getItem("modcut_engraving_presets")) || []; } catch { return []; }
}

function buildPresets(selected = "custom") {
  const select = $("presetSelect");
  const custom = `<option value="custom">Custom settings</option>`;
  const builtIn = ENGRAVING_PRESETS.map((entry) => `<option value="${entry.id}">${entry.name}</option>`).join("");
  const saved = userPresets().map((entry, index) => `<option value="user:${index}">${entry.name}</option>`).join("");
  select.innerHTML = custom + `<optgroup label="modCut presets">${builtIn}</optgroup>` + (saved ? `<optgroup label="My presets">${saved}</optgroup>` : "");
  select.value = selected;
}

function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll(".tool").forEach((button) => button.classList.toggle("is-active", button.dataset.tool === tool));
  document.querySelectorAll(".tool-panel").forEach((panel) => panel.classList.toggle("is-hidden", panel.dataset.panel !== tool));
  $("cropUi").classList.toggle("is-hidden", tool !== "crop");
  scheduleRender();
}

function changed() {
  recipe = normalizeEngravingRecipe(recipe);
  recordHistory();
  buildPresets("custom");
  updateTonePipelineHint();
  updateReadout();
  scheduleRender();
}

function displayDimensions() {
  const crop = activeTool === "crop" || previewMode === "before" ? { width: 1, height: 1 } : recipe.crop;
  const aspect = (sourceImage.naturalWidth * crop.width) / (sourceImage.naturalHeight * crop.height);
  const panel = $("previewPanel").getBoundingClientRect();
  const maxWidth = Math.max(260, panel.width - 110);
  const maxHeight = Math.max(220, panel.height - 130);
  let width = maxWidth, height = width / aspect;
  if (height > maxHeight) { height = maxHeight; width = height * aspect; }
  return { width: Math.round(width * zoom), height: Math.round(height * zoom) };
}

function drawToCanvas(result) {
  const canvas = $("previewCanvas");
  canvas.width = result.width; canvas.height = result.height;
  const ctx = canvas.getContext("2d");
  const image = result.kind === "rgba" ? result.image : engravingResultToImageData(result);
  if (materialPreview && previewMode === "after") {
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const value = image.data[offset] / 255;
      image.data[offset] = Math.round(69 + value * 166);
      image.data[offset + 1] = Math.round(39 + value * 190);
      image.data[offset + 2] = Math.round(20 + value * 189);
    }
  }
  ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
}

function originalResult(width, height, crop) {
  const image = cropAndResampleImageData(sourcePixels, crop, width, height);
  return { kind: "rgba", image, width: image.width, height: image.height };
}

function effectivePreviewDpi(width, crop) {
  const physicalWidth = Math.max(.1, (payload.fullWidthMm || payload.widthMm || 100) * crop.width);
  return width / (physicalWidth / 25.4);
}

function renderPreview() {
  if (!sourcePixels) return;
  const serial = ++renderSerial;
  const dimensions = displayDimensions();
  const scroll = $("previewScroll");
  scroll.classList.toggle("is-zoomed", dimensions.width + 96 > scroll.clientWidth || dimensions.height + 96 > scroll.clientHeight);
  $("previewSurface").style.width = `${dimensions.width}px`;
  $("previewSurface").style.height = `${dimensions.height}px`;
  const full = activeTool === "crop";
  const crop = full ? { x: 0, y: 0, width: 1, height: 1 } : recipe.crop;
  const maxPixels = 1_200_000;
  let width = Math.max(1, Math.round(sourceImage.naturalWidth * crop.width));
  let height = Math.max(1, Math.round(sourceImage.naturalHeight * crop.height));
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale));
  let result;
  if (previewMode === "before") result = originalResult(width, height, crop);
  else {
    const renderRecipe = full ? { ...recipe, crop } : recipe;
    result = processEngravingImage(sourcePixels, { width, height, dpi: effectivePreviewDpi(width, crop) }, renderRecipe);
  }
  if (serial !== renderSerial) return;
  drawToCanvas(result);
  updateCropOverlay();
  $("previewStatus").textContent = activeTool === "crop" ? "Drag the white frame to crop" : `${recipe.style} preview · ${result.width} × ${result.height} px`;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  $("previewStatus").textContent = "Updating preview…";
  renderTimer = setTimeout(renderPreview, 45);
}

function updateCropOverlay() {
  const crop = recipe.crop;
  const left = crop.x * 100, top = crop.y * 100, width = crop.width * 100, height = crop.height * 100;
  const box = $("cropBox");
  Object.assign(box.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
  const shades = $("cropUi").children;
  Object.assign(shades[0].style, { left: "0", top: "0", width: "100%", height: `${top}%` });
  Object.assign(shades[1].style, { left: `${left + width}%`, top: `${top}%`, width: `${100 - left - width}%`, height: `${height}%` });
  Object.assign(shades[2].style, { left: "0", top: `${top + height}%`, width: "100%", height: `${100 - top - height}%` });
  Object.assign(shades[3].style, { left: "0", top: `${top}%`, width: `${left}%`, height: `${height}%` });
}

function normalizedAspect() {
  if (aspectValue === "free") return null;
  const target = aspectValue === "original" ? sourceImage.naturalWidth / sourceImage.naturalHeight : Number(aspectValue);
  return target / (sourceImage.naturalWidth / sourceImage.naturalHeight);
}

function clampCrop(value) {
  const minX = 12 / Math.max(100, $("previewSurface").clientWidth);
  const minY = 12 / Math.max(100, $("previewSurface").clientHeight);
  const width = clamp(value.width, minX, 1);
  const height = clamp(value.height, minY, 1);
  return { x: clamp(value.x, 0, 1 - width), y: clamp(value.y, 0, 1 - height), width, height };
}

function enforceAspect(next, handle, start) {
  const ratio = normalizedAspect();
  if (!ratio) return next;
  const horizontal = /e|w/.test(handle), vertical = /n|s/.test(handle);
  if (horizontal && !vertical) {
    const center = start.y + start.height / 2;
    next.height = next.width / ratio; next.y = center - next.height / 2;
  } else {
    next.width = next.height * ratio;
    if (handle.includes("w")) next.x = start.x + start.width - next.width;
  }
  return next;
}

function beginCrop(event) {
  const handle = event.target.closest("[data-handle]")?.dataset.handle;
  if (!handle) return;
  event.preventDefault();
  const rect = $("previewSurface").getBoundingClientRect();
  cropDrag = { handle, startX: event.clientX, startY: event.clientY, start: { ...recipe.crop }, rect };
  try { event.target.setPointerCapture?.(event.pointerId); } catch {}
}

function moveCrop(event) {
  if (!cropDrag) return;
  const dx = (event.clientX - cropDrag.startX) / cropDrag.rect.width;
  const dy = (event.clientY - cropDrag.startY) / cropDrag.rect.height;
  const start = cropDrag.start;
  let next = { ...start };
  if (cropDrag.handle === "move") { next.x += dx; next.y += dy; }
  else {
    if (cropDrag.handle.includes("e")) next.width = start.width + dx;
    if (cropDrag.handle.includes("s")) next.height = start.height + dy;
    if (cropDrag.handle.includes("w")) { next.x = start.x + dx; next.width = start.width - dx; }
    if (cropDrag.handle.includes("n")) { next.y = start.y + dy; next.height = start.height - dy; }
    next = enforceAspect(next, cropDrag.handle, start);
  }
  recipe.crop = clampCrop(next);
  updateCropOverlay(); updateReadout();
}

function endCrop() {
  if (!cropDrag) return;
  cropDrag = null;
  changed();
}

function updateReadout() {
  if (!payload || !sourceImage) return;
  const crop = recipe.crop;
  const widthMm = (payload.fullWidthMm || payload.widthMm || 0) * crop.width;
  const heightMm = (payload.fullHeightMm || payload.heightMm || 0) * crop.height;
  const dpi = Math.max(1, payload.dpi || 300);
  const columns = Math.max(1, Math.ceil(widthMm / 25.4 * dpi));
  const rows = Math.max(1, Math.ceil(heightMm / 25.4 * dpi));
  const sourceDpi = widthMm ? sourceImage.naturalWidth * crop.width / (widthMm / 25.4) : dpi;
  $("physicalSize").textContent = `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm`;
  $("cropPercent").textContent = `${Math.round(crop.width * 100)} × ${Math.round(crop.height * 100)}%`;
  $("outputInfo").textContent = `${columns.toLocaleString()} × ${rows.toLocaleString()} at ${dpi} DPI`;
  const warning = $("qualityWarning");
  if (sourceDpi < dpi * .75) {
    warning.textContent = `Source resolution is about ${Math.round(sourceDpi)} DPI. The ${dpi} DPI laser output may not gain additional detail.`;
    warning.classList.remove("is-hidden");
  } else if (columns * rows > 8_000_000) {
    warning.textContent = "This image exceeds the safe eight-million-sample laser limit. Reduce its size or layer DPI.";
    warning.classList.remove("is-hidden");
  } else warning.classList.add("is-hidden");
}

function refreshAllControls() {
  buildAdjustmentControls(); buildStyleGrid(); buildStyleControls(); updateTextControls(); updateReadout(); scheduleRender();
}

async function initialize(data) {
  payload = data;
  recipe = normalizeEngravingRecipe(data.recipe, data.settings, data.mode);
  history = [recipeSnapshot()]; historyIndex = 0; updateHistoryButtons();
  $("imageName").textContent = data.name || "Raster image";
  buildPresets();
  populateFontSelect();
  void loadLocalFonts();
  sourceImage = new Image();
  sourceImage.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = sourceImage.naturalWidth; canvas.height = sourceImage.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(sourceImage, 0, 0);
    sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height);
    refreshAllControls(); updateCropOverlay();
  };
  sourceImage.onerror = () => { $("previewStatus").textContent = "The source image could not be decoded."; $("applyButton").disabled = true; };
  sourceImage.src = data.dataUrl;
}

document.querySelectorAll(".tool").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
document.querySelectorAll("[data-preview]").forEach((button) => button.addEventListener("click", () => {
  previewMode = button.dataset.preview;
  document.querySelectorAll("[data-preview]").forEach((item) => item.classList.toggle("is-active", item === button));
  $("cropUi").classList.toggle("is-hidden", activeTool !== "crop"); scheduleRender();
}));
$("cropUi").addEventListener("pointerdown", beginCrop);
window.addEventListener("pointermove", moveCrop);
window.addEventListener("pointerup", endCrop);
$("aspectRatio").addEventListener("change", (event) => { aspectValue = event.target.value; if (normalizedAspect()) { recipe.crop = clampCrop(enforceAspect({ ...recipe.crop }, "se", recipe.crop)); changed(); } });
$("resetCrop").addEventListener("click", () => { recipe.crop = { x: 0, y: 0, width: 1, height: 1 }; $("aspectRatio").value = aspectValue = "free"; changed(); });
$("resetAdjustments").addEventListener("click", () => { recipe.adjustments = structuredClone(DEFAULT_ENGRAVING_RECIPE.adjustments); recipe = normalizeEngravingRecipe(recipe); recordHistory(); refreshAllControls(); });
$("resetStyle").addEventListener("click", () => {
  const scope = styleScope();
  recipe[scope] = structuredClone(DEFAULT_ENGRAVING_RECIPE[scope]);
  recipe = normalizeEngravingRecipe(recipe);
  recordHistory(); refreshAllControls();
});
$("invertControl").addEventListener("change", (event) => { recipe.adjustments.invert = event.target.checked; changed(); });
$("presetSelect").addEventListener("change", (event) => {
  const crop = recipe.crop;
  const value = event.target.value;
  if (value === "custom") return;
  if (value.startsWith("user:")) recipe = normalizeEngravingRecipe(userPresets()[Number(value.slice(5))]?.recipe);
  else recipe = engravingPreset(value);
  recipe.crop = crop;
  recipe = normalizeEngravingRecipe(recipe);
  recordHistory();
  const builtIn = ENGRAVING_PRESETS.find((entry) => entry.id === value);
  $("presetDescription").textContent = builtIn?.description || "Saved personal preset";
  refreshAllControls(); buildPresets(value);
});
$("savePreset").addEventListener("click", () => {
  const name = window.prompt("Name this engraving preset:", `${recipe.style} preset`);
  if (!name?.trim()) return;
  const saved = userPresets();
  const savedRecipe = structuredClone(recipe); savedRecipe.crop = { x: 0, y: 0, width: 1, height: 1 };
  saved.push({ name: name.trim(), recipe: savedRecipe });
  localStorage.setItem("modcut_engraving_presets", JSON.stringify(saved));
  buildPresets(`user:${saved.length - 1}`);
});
$("materialPreview").addEventListener("change", (event) => { materialPreview = event.target.checked; scheduleRender(); });
$("textContent").addEventListener("input", (event) => setTextLayer({ text: event.target.value }));
$("textFont").addEventListener("change", (event) => setTextLayer({ fontFamily: event.target.value }));
$("textBold").addEventListener("click", () => {
  const text = currentTextLayer(true);
  setTextLayer({ weight: text.weight === "bold" ? "normal" : "bold" });
});
$("textItalic").addEventListener("click", () => {
  const text = currentTextLayer(true);
  setTextLayer({ style: text.style === "italic" ? "normal" : "italic" });
});
$("textColor").addEventListener("change", (event) => setTextLayer({ color: event.target.value }));
$("textSize").addEventListener("input", (event) => setTextLayer({ size: Number(event.target.value) }));
$("textX").addEventListener("input", (event) => setTextLayer({ x: Number(event.target.value) }));
$("textY").addEventListener("input", (event) => setTextLayer({ y: Number(event.target.value) }));
$("clearText").addEventListener("click", () => { recipe.texts = []; changed(); updateTextControls(); });
$("zoomRange").addEventListener("input", (event) => { zoom = Number(event.target.value) / 100; $("zoomLabel").textContent = `${event.target.value}%`; scheduleRender(); });
function setZoom(next) { zoom = clamp(next, .25, 2); $("zoomRange").value = Math.round(zoom * 100); $("zoomLabel").textContent = `${Math.round(zoom * 100)}%`; scheduleRender(); }
$("zoomIn").addEventListener("click", () => setZoom(zoom + .25));
$("zoomOut").addEventListener("click", () => setZoom(zoom - .25));
$("zoomFit").addEventListener("click", () => setZoom(1));
$("previewScroll").addEventListener("wheel", (event) => {
  // Chromium reports a trackpad pinch as Ctrl+wheel. Leave regular two-finger
  // scrolling alone so the native scroll container remains the pan gesture.
  if (!event.ctrlKey) return;
  event.preventDefault();
  setZoom(zoom * Math.exp(-event.deltaY * .01));
}, { passive: false });
$("undoButton").addEventListener("click", () => restoreHistory(-1));
$("redoButton").addEventListener("click", () => restoreHistory(1));
$("cancelButton").addEventListener("click", () => window.modcut.finishImageEditor(null));
$("applyButton").addEventListener("click", () => window.modcut.finishImageEditor(normalizeEngravingRecipe(recipe)));
window.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (modifier && !typing && (key === "+" || key === "=")) { event.preventDefault(); setZoom(zoom + .25); return; }
  if (modifier && !typing && (key === "-" || key === "_")) { event.preventDefault(); setZoom(zoom - .25); return; }
  if (modifier && !typing && key === "0") { event.preventDefault(); setZoom(1); return; }
  if (modifier && !typing && key === "z") { event.preventDefault(); restoreHistory(event.shiftKey ? 1 : -1); return; }
  if (modifier && !typing && key === "y") { event.preventDefault(); restoreHistory(1); return; }
  if (event.key === "Escape") window.modcut.finishImageEditor(null);
  if (modifier && event.key === "Enter") window.modcut.finishImageEditor(normalizeEngravingRecipe(recipe));
});
window.addEventListener("resize", scheduleRender);
window.modcut.onImageEditorInit(initialize);
