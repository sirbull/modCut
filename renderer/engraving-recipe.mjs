import {
  DEFAULT_RASTER_SETTINGS,
  ditherMask,
  grayscaleImageData,
  normalizeRasterSettings,
  posterizeGray,
} from "./raster-processing.mjs";

export const ENGRAVING_RECIPE_VERSION = 2;
export const ENGRAVING_STYLES = Object.freeze(["Photo", "Dots", "Lines", "Crosshatch", "Sketch"]);
export const PHOTO_MODES = Object.freeze(["Grayscale", "Jarvis", "Floyd-Steinberg", "Stucki", "Atkinson", "Bayer"]);

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));

export const DEFAULT_ENGRAVING_RECIPE = Object.freeze({
  version: ENGRAVING_RECIPE_VERSION,
  crop: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
  adjustments: Object.freeze({
    ...DEFAULT_RASTER_SETTINGS,
    dehaze: 0,
    denoise: 0,
    enhanceRadius: 1,
    enhanceAmount: 0,
  }),
  style: "Photo",
  photo: Object.freeze({ detail: 50, mode: "Grayscale", noise: 0 }),
  dots: Object.freeze({ detail: 50, cellsPerInch: 45, angle: 45, shape: "Round", minSize: 0, maxSize: 92 }),
  lines: Object.freeze({ detail: 50, linesPerInch: 55, angle: 45, minWidth: 4, maxWidth: 88, roughness: 0 }),
  crosshatch: Object.freeze({ detail: 50, linesPerInch: 48, angle: 35, crossAngle: 125, crossThreshold: 58, minWidth: 3, maxWidth: 82, roughness: 0 }),
  sketch: Object.freeze({ detail: 50, edgeRadius: 2, edgeAmount: 1.6, threshold: 42, smoothing: 1 }),
  texts: Object.freeze([]),
});

function normalizedCrop(value = {}) {
  const width = clamp(value.width ?? 1, 0.01, 1);
  const height = clamp(value.height ?? 1, 0.01, 1);
  return {
    x: clamp(value.x ?? 0, 0, 1 - width),
    y: clamp(value.y ?? 0, 0, 1 - height),
    width,
    height,
  };
}

const TEXT_FALLBACK_FONT = "Arial";

function normalizedText(value = {}, index = 0) {
  const text = String(value.text ?? "").slice(0, 500);
  const fontFamily = String(value.fontFamily || TEXT_FALLBACK_FONT).replace(/[\r\n]/g, " ").slice(0, 160);
  return {
    id: String(value.id || `text-${index + 1}`).slice(0, 80),
    text,
    fontFamily: fontFamily || TEXT_FALLBACK_FONT,
    size: clamp(value.size ?? 8, 1, 40),
    x: clamp(value.x ?? 50, 0, 100),
    y: clamp(value.y ?? 50, 0, 100),
    weight: value.weight === "bold" ? "bold" : "normal",
    style: value.style === "italic" ? "italic" : "normal",
    color: value.color === "#ffffff" ? "#ffffff" : "#000000",
  };
}

function normalizedTexts(values) {
  if (!Array.isArray(values)) return [];
  // Keep an empty draft layer too: this lets a user choose font, style and
  // placement before typing, while it remains a no-op in the raster output.
  return values.slice(0, 20).map(normalizedText);
}

export function normalizeEngravingRecipe(recipe = {}, legacySettings = {}, legacyMode = "Grayscale") {
  const sourceAdjustments = { ...legacySettings, ...(recipe.adjustments || {}) };
  const adjustments = normalizeRasterSettings(sourceAdjustments);
  adjustments.dehaze = clamp(sourceAdjustments.dehaze ?? 0, 0, 100);
  adjustments.denoise = clamp(sourceAdjustments.denoise ?? 0, 0, 4);
  adjustments.enhanceRadius = clamp(sourceAdjustments.enhanceRadius ?? 1, 0.5, 5);
  adjustments.enhanceAmount = clamp(sourceAdjustments.enhanceAmount ?? 0, 0, 3);
  const style = ENGRAVING_STYLES.includes(recipe.style) ? recipe.style : "Photo";
  const photoMode = recipe.photo?.mode || legacyMode || "Grayscale";
  const dotMinSize = clamp(recipe.dots?.minSize ?? 0, 0, 95);
  const lineMinWidth = clamp(recipe.lines?.minWidth ?? 4, 0, 95);
  const crossMinWidth = clamp(recipe.crosshatch?.minWidth ?? 3, 0, 95);
  return {
    version: ENGRAVING_RECIPE_VERSION,
    crop: normalizedCrop(recipe.crop),
    adjustments,
    style,
    photo: {
      detail: clamp(recipe.photo?.detail ?? 50, 1, 100),
      mode: PHOTO_MODES.includes(photoMode) ? photoMode : "Grayscale",
      noise: clamp(recipe.photo?.noise ?? 0, 0, 30),
    },
    dots: {
      detail: clamp(recipe.dots?.detail ?? 50, 1, 100),
      cellsPerInch: clamp(recipe.dots?.cellsPerInch ?? 45, 5, 300),
      angle: clamp(recipe.dots?.angle ?? 45, -180, 180),
      shape: ["Round", "Ellipse", "Diamond", "Square"].includes(recipe.dots?.shape) ? recipe.dots.shape : "Round",
      minSize: dotMinSize,
      maxSize: Math.max(dotMinSize, clamp(recipe.dots?.maxSize ?? 92, 5, 100)),
    },
    lines: {
      detail: clamp(recipe.lines?.detail ?? 50, 1, 100),
      linesPerInch: clamp(recipe.lines?.linesPerInch ?? 55, 5, 300),
      angle: clamp(recipe.lines?.angle ?? 45, -180, 180),
      minWidth: lineMinWidth,
      maxWidth: Math.max(lineMinWidth, clamp(recipe.lines?.maxWidth ?? 88, 5, 100)),
      roughness: clamp(recipe.lines?.roughness ?? 0, 0, 35),
    },
    crosshatch: {
      detail: clamp(recipe.crosshatch?.detail ?? 50, 1, 100),
      linesPerInch: clamp(recipe.crosshatch?.linesPerInch ?? 48, 5, 300),
      angle: clamp(recipe.crosshatch?.angle ?? 35, -180, 180),
      crossAngle: clamp(recipe.crosshatch?.crossAngle ?? 125, -180, 180),
      crossThreshold: clamp(recipe.crosshatch?.crossThreshold ?? 58, 0, 100),
      minWidth: crossMinWidth,
      maxWidth: Math.max(crossMinWidth, clamp(recipe.crosshatch?.maxWidth ?? 82, 5, 100)),
      roughness: clamp(recipe.crosshatch?.roughness ?? 0, 0, 35),
    },
    sketch: {
      detail: clamp(recipe.sketch?.detail ?? 50, 1, 100),
      edgeRadius: clamp(recipe.sketch?.edgeRadius ?? 2, 1, 6),
      edgeAmount: clamp(recipe.sketch?.edgeAmount ?? 1.6, 0.1, 5),
      threshold: clamp(recipe.sketch?.threshold ?? 42, 1, 254),
      smoothing: clamp(recipe.sketch?.smoothing ?? 1, 0, 4),
    },
    texts: normalizedTexts(recipe.texts),
  };
}

export const ENGRAVING_PRESETS = Object.freeze([
  { id: "photo-wood", name: "Photo · Wood", description: "Balanced grayscale for wood", recipe: {} },
  { id: "photo-dark", name: "Photo · Dark surface", description: "Inverted diffusion for slate and coated metal", recipe: { adjustments: { invert: true, contrast: 12, gamma: 1.15 }, photo: { mode: "Jarvis", noise: 3 } } },
  { id: "bold-lines", name: "Bold lines", description: "Strong parallel engraved lines", recipe: { style: "Lines", adjustments: { contrast: 18 }, lines: { linesPerInch: 38, angle: 45, minWidth: 8, maxWidth: 94 } } },
  { id: "halftone", name: "Halftone dots", description: "Classic round-dot halftone", recipe: { style: "Dots", adjustments: { contrast: 10 }, dots: { cellsPerInch: 42, angle: 45, shape: "Round", minSize: 0, maxSize: 94 } } },
  { id: "banknote", name: "Banknote crosshatch", description: "Layered line engraving", recipe: { style: "Crosshatch", adjustments: { contrast: 15 }, crosshatch: { linesPerInch: 52, angle: 32, crossAngle: 122, crossThreshold: 57, minWidth: 2, maxWidth: 78 } } },
  { id: "technical", name: "Technical sketch", description: "Edges for drawings and architecture", recipe: { style: "Sketch", adjustments: { contrast: 8 }, sketch: { edgeRadius: 2, edgeAmount: 1.8, threshold: 40, smoothing: 1 } } },
]);

export function engravingPreset(id) {
  const preset = ENGRAVING_PRESETS.find((entry) => entry.id === id) || ENGRAVING_PRESETS[0];
  return normalizeEngravingRecipe(preset.recipe);
}

function sampleBilinear(image, x, y, channel) {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(y)));
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  const at = (px, py) => image.data[(py * image.width + px) * 4 + channel];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export function cropAndResampleImageData(image, cropValue, width, height) {
  const crop = normalizedCrop(cropValue);
  const outWidth = Math.max(1, Math.round(finite(width, image.width * crop.width)));
  const outHeight = Math.max(1, Math.round(finite(height, image.height * crop.height)));
  if (crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1
      && outWidth === image.width && outHeight === image.height) {
    return { data: image.data, width: image.width, height: image.height };
  }
  const data = new Uint8ClampedArray(outWidth * outHeight * 4);
  const left = crop.x * image.width;
  const top = crop.y * image.height;
  const sourceWidth = crop.width * image.width;
  const sourceHeight = crop.height * image.height;
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
    const sx = left + ((x + 0.5) / outWidth) * sourceWidth - 0.5;
    const sy = top + ((y + 0.5) / outHeight) * sourceHeight - 0.5;
    const offset = (y * outWidth + x) * 4;
    for (let channel = 0; channel < 4; channel++) data[offset + channel] = Math.round(sampleBilinear(image, sx, sy, channel));
  }
  return { data, width: outWidth, height: outHeight };
}

function textCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    return canvas;
  }
  return null;
}

function quoteFontFamily(fontFamily) {
  return fontFamily.split(",").map((name) => {
    const trimmed = name.trim();
    return /^[a-z0-9 _-]+$/i.test(trimmed) ? `"${trimmed.replace(/"/g, "")}"` : trimmed;
  }).join(", ");
}

/** Render text in source-pixel coordinates before crop and engraving processing. */
export function compositeTextOntoImage(image, texts = []) {
  const visibleTexts = texts.filter((entry) => String(entry.text || "").trim());
  if (!visibleTexts.length) return image;
  const canvas = textCanvas(image.width, image.height);
  const context = canvas?.getContext?.("2d", { willReadFrequently: true });
  if (!context || typeof ImageData === "undefined") return image;
  const input = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  context.putImageData(input, 0, 0);
  for (const entry of visibleTexts) {
    const fontSize = Math.max(1, image.width * entry.size / 100);
    context.save();
    context.font = `${entry.style} ${entry.weight} ${fontSize}px ${quoteFontFamily(entry.fontFamily)}`;
    context.fillStyle = entry.color;
    context.textBaseline = "top";
    const x = image.width * entry.x / 100;
    const y = image.height * entry.y / 100;
    const lineHeight = fontSize * 1.2;
    for (const [line, lineIndex] of entry.text.split(/\r?\n/).entries()) context.fillText(line, x, y + lineIndex * lineHeight);
    context.restore();
  }
  return context.getImageData(0, 0, image.width, image.height);
}

function boxBlur(values, width, height, radiusValue) {
  const radius = Math.max(0, Math.round(radiusValue));
  if (!radius) return new Float32Array(values);
  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += values[y * width + Math.max(0, Math.min(width - 1, x))];
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / (radius * 2 + 1);
      sum -= values[y * width + Math.max(0, x - radius)];
      sum += values[y * width + Math.min(width - 1, x + radius + 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += horizontal[Math.max(0, Math.min(height - 1, y)) * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / (radius * 2 + 1);
      sum -= horizontal[Math.max(0, y - radius) * width + x];
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x];
    }
  }
  return output;
}

function preparedGray(image, recipe) {
  let { gray } = grayscaleImageData(image, recipe.adjustments);
  if (recipe.adjustments.dehaze > 0) {
    const strength = recipe.adjustments.dehaze / 100;
    const radius = Math.max(2, Math.min(16, Math.round(Math.min(image.width, image.height) / 40)));
    const localAtmosphere = boxBlur(gray, image.width, image.height, radius);
    const recovered = new Float32Array(gray.length);
    for (let index = 0; index < gray.length; index++) {
      // Approximate atmospheric-light recovery on luminance. Brighter local
      // neighborhoods receive more correction while true dark marks stay put.
      const transmission = Math.max(.35, 1 - .65 * strength * localAtmosphere[index] / 255);
      recovered[index] = clamp(255 - (255 - gray[index]) / transmission, 0, 255);
    }
    gray = recovered;
  }
  if (recipe.adjustments.denoise > 0) gray = boxBlur(gray, image.width, image.height, recipe.adjustments.denoise);
  if (recipe.adjustments.enhanceAmount > 0) {
    const blurred = boxBlur(gray, image.width, image.height, recipe.adjustments.enhanceRadius);
    const amount = recipe.adjustments.enhanceAmount;
    const sharpened = new Float32Array(gray.length);
    for (let index = 0; index < gray.length; index++) sharpened[index] = clamp(gray[index] + (gray[index] - blurred[index]) * amount, 0, 255);
    gray = sharpened;
  }
  return gray;
}

function deterministicNoise(index) {
  let value = (index + 1) * 0x9e3779b1;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
}

// Detail 50 preserves the established recipe exactly. The exponential scale
// gives the low half useful coarse steps while allowing up to twice the
// pattern density for machines and materials that can reproduce it.
const detailScale = (detail = 50) => Math.pow(2, (clamp(detail, 1, 100) - 50) / 50);

export function detailDensity(baseDensity, detail = 50) {
  return clamp(finite(baseDensity, 1) * detailScale(detail), 1, 300);
}

function photoDetail(gray, width, height, detail) {
  const normalized = clamp(detail, 1, 100);
  if (normalized === 50) return gray;
  if (normalized < 50) {
    const strength = (50 - normalized) / 49;
    const blurred = boxBlur(gray, width, height, 1 + strength * 3);
    const output = new Float32Array(gray.length);
    for (let index = 0; index < gray.length; index++) output[index] = gray[index] * (1 - strength) + blurred[index] * strength;
    return output;
  }
  const amount = (normalized - 50) / 50 * .8;
  const blurred = boxBlur(gray, width, height, 1);
  const output = new Float32Array(gray.length);
  for (let index = 0; index < gray.length; index++) output[index] = clamp(gray[index] + (gray[index] - blurred[index]) * amount, 0, 255);
  return output;
}

function spotMask(gray, width, height, dpi, settings) {
  const mask = new Uint8Array(width * height);
  const cell = Math.max(1.5, dpi / settings.cellsPerInch);
  const angle = settings.angle * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = cos * x + sin * y;
    const v = -sin * x + cos * y;
    const centerU = (Math.floor(u / cell) + 0.5) * cell;
    const centerV = (Math.floor(v / cell) + 0.5) * cell;
    const sampleX = Math.round(cos * centerU - sin * centerV);
    const sampleY = Math.round(sin * centerU + cos * centerV);
    const sx = Math.max(0, Math.min(width - 1, sampleX));
    const sy = Math.max(0, Math.min(height - 1, sampleY));
    const darkness = 1 - gray[sy * width + sx] / 255;
    const size = (settings.minSize + (settings.maxSize - settings.minSize) * Math.sqrt(darkness)) / 100;
    const dx = Math.abs(u - centerU) / cell;
    const dy = Math.abs(v - centerV) / cell;
    const inside = settings.shape === "Square" ? Math.max(dx, dy) <= size / 2
      : settings.shape === "Diamond" ? dx + dy <= size / 1.42
      : settings.shape === "Ellipse" ? Math.hypot(dx / 1.18, dy * 1.18) <= size / 2
      : Math.hypot(dx, dy) <= size / 2;
    mask[y * width + x] = inside ? 1 : 0;
  }
  return mask;
}

function lineAt(x, y, gray, width, height, dpi, settings, angleValue, threshold = 0) {
  const index = Math.max(0, Math.min(gray.length - 1, Math.round(y) * width + Math.round(x)));
  const darkness = 1 - gray[index] / 255;
  if (darkness * 100 < threshold) return false;
  const period = Math.max(1.5, dpi / settings.linesPerInch);
  const angle = angleValue * Math.PI / 180;
  const across = -Math.sin(angle) * x + Math.cos(angle) * y;
  const phase = Math.abs(((across / period + 0.5) % 1 + 1) % 1 - 0.5) * 2;
  const roughness = settings.roughness ? deterministicNoise(index) * settings.roughness / 100 : 0;
  const widthFraction = clamp((settings.minWidth + (settings.maxWidth - settings.minWidth) * darkness) / 100 + roughness, 0, 1);
  return phase <= widthFraction;
}

function linesMask(gray, width, height, dpi, settings, cross = false) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const first = lineAt(x, y, gray, width, height, dpi, settings, settings.angle);
    const second = cross && lineAt(x, y, gray, width, height, dpi, settings, settings.crossAngle, settings.crossThreshold);
    mask[y * width + x] = first || second ? 1 : 0;
  }
  return mask;
}

function sketchMask(gray, width, height, settings) {
  const source = settings.smoothing ? boxBlur(gray, width, height, settings.smoothing) : gray;
  const mask = new Uint8Array(width * height);
  const step = Math.max(1, Math.round(settings.edgeRadius));
  const at = (x, y) => source[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gx = at(x + step, y - step) + 2 * at(x + step, y) + at(x + step, y + step)
      - at(x - step, y - step) - 2 * at(x - step, y) - at(x - step, y + step);
    const gy = at(x - step, y + step) + 2 * at(x, y + step) + at(x + step, y + step)
      - at(x - step, y - step) - 2 * at(x, y - step) - at(x + step, y - step);
    const edge = Math.hypot(gx, gy) * settings.edgeAmount / 4;
    mask[y * width + x] = edge >= settings.threshold ? 1 : 0;
  }
  return mask;
}

export function processEngravingImage(sourceImage, outputGrid = {}, recipeValue = {}) {
  const recipe = normalizeEngravingRecipe(recipeValue);
  const width = Math.max(1, Math.round(outputGrid.width || sourceImage.width * recipe.crop.width));
  const height = Math.max(1, Math.round(outputGrid.height || sourceImage.height * recipe.crop.height));
  const dpi = Math.max(1, finite(outputGrid.dpi, 300));
  const image = cropAndResampleImageData(compositeTextOntoImage(sourceImage, recipe.texts), recipe.crop, width, height);
  let gray = preparedGray(image, recipe);
  if (recipe.style === "Photo") {
    gray = photoDetail(gray, width, height, recipe.photo.detail);
    if (recipe.photo.noise) for (let index = 0; index < gray.length; index++) {
      gray[index] = clamp(gray[index] + deterministicNoise(index) * recipe.photo.noise, 0, 255);
    }
    if (recipe.photo.mode === "Grayscale") {
      const output = new Float32Array(gray.length);
      for (let index = 0; index < gray.length; index++) output[index] = posterizeGray(gray[index], recipe.adjustments.grayLevels);
      return { kind: "gray", gray: output, width, height, recipe };
    }
    return { kind: "mask", mask: ditherMask(gray, width, height, recipe.adjustments, recipe.photo.mode), width, height, recipe };
  }
  if (recipe.style === "Dots") {
    const settings = { ...recipe.dots, cellsPerInch: detailDensity(recipe.dots.cellsPerInch, recipe.dots.detail) };
    return { kind: "mask", mask: spotMask(gray, width, height, dpi, settings), width, height, recipe };
  }
  if (recipe.style === "Lines") {
    const settings = { ...recipe.lines, linesPerInch: detailDensity(recipe.lines.linesPerInch, recipe.lines.detail) };
    return { kind: "mask", mask: linesMask(gray, width, height, dpi, settings), width, height, recipe };
  }
  if (recipe.style === "Crosshatch") {
    const settings = { ...recipe.crosshatch, linesPerInch: detailDensity(recipe.crosshatch.linesPerInch, recipe.crosshatch.detail) };
    return { kind: "mask", mask: linesMask(gray, width, height, dpi, settings, true), width, height, recipe };
  }
  const sketchScale = Math.sqrt(detailScale(recipe.sketch.detail));
  const settings = {
    ...recipe.sketch,
    edgeRadius: clamp(recipe.sketch.edgeRadius / sketchScale, 1, 6),
    threshold: clamp(recipe.sketch.threshold / sketchScale, 1, 254),
    smoothing: clamp(recipe.sketch.smoothing / sketchScale, 0, 4),
  };
  return { kind: "mask", mask: sketchMask(gray, width, height, settings), width, height, recipe };
}

export function engravingResultToImageData(result) {
  const data = new Uint8ClampedArray(result.width * result.height * 4);
  for (let index = 0; index < result.width * result.height; index++) {
    const value = result.kind === "gray" ? Math.round(result.gray[index]) : (result.mask[index] ? 0 : 255);
    const offset = index * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { data, width: result.width, height: result.height };
}
