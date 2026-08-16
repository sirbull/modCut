import {
  DEFAULT_RASTER_SETTINGS,
  ditherMask,
  grayscaleImageData,
  normalizeRasterSettings,
  posterizeGray,
} from "./raster-processing.mjs";

export const ENGRAVING_RECIPE_VERSION = 1;
export const ENGRAVING_STYLES = Object.freeze(["Photo", "Dots", "Lines", "Crosshatch", "Sketch"]);
export const PHOTO_MODES = Object.freeze(["Grayscale", "Jarvis", "Floyd-Steinberg", "Stucki", "Atkinson", "Bayer"]);

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));

export const DEFAULT_ENGRAVING_RECIPE = Object.freeze({
  version: ENGRAVING_RECIPE_VERSION,
  crop: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
  adjustments: Object.freeze({
    ...DEFAULT_RASTER_SETTINGS,
    denoise: 0,
    enhanceRadius: 1,
    enhanceAmount: 0,
  }),
  style: "Photo",
  photo: Object.freeze({ mode: "Grayscale", noise: 0 }),
  dots: Object.freeze({ cellsPerInch: 45, angle: 45, shape: "Round", minSize: 0, maxSize: 92 }),
  lines: Object.freeze({ linesPerInch: 55, angle: 45, minWidth: 4, maxWidth: 88, roughness: 0 }),
  crosshatch: Object.freeze({ linesPerInch: 48, angle: 35, crossAngle: 125, crossThreshold: 58, minWidth: 3, maxWidth: 82, roughness: 0 }),
  sketch: Object.freeze({ edgeRadius: 2, edgeAmount: 1.6, threshold: 42, smoothing: 1 }),
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

export function normalizeEngravingRecipe(recipe = {}, legacySettings = {}, legacyMode = "Grayscale") {
  const sourceAdjustments = { ...legacySettings, ...(recipe.adjustments || {}) };
  const adjustments = normalizeRasterSettings(sourceAdjustments);
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
      mode: PHOTO_MODES.includes(photoMode) ? photoMode : "Grayscale",
      noise: clamp(recipe.photo?.noise ?? 0, 0, 30),
    },
    dots: {
      cellsPerInch: clamp(recipe.dots?.cellsPerInch ?? 45, 5, 300),
      angle: clamp(recipe.dots?.angle ?? 45, -180, 180),
      shape: ["Round", "Ellipse", "Diamond", "Square"].includes(recipe.dots?.shape) ? recipe.dots.shape : "Round",
      minSize: dotMinSize,
      maxSize: Math.max(dotMinSize, clamp(recipe.dots?.maxSize ?? 92, 5, 100)),
    },
    lines: {
      linesPerInch: clamp(recipe.lines?.linesPerInch ?? 55, 5, 300),
      angle: clamp(recipe.lines?.angle ?? 45, -180, 180),
      minWidth: lineMinWidth,
      maxWidth: Math.max(lineMinWidth, clamp(recipe.lines?.maxWidth ?? 88, 5, 100)),
      roughness: clamp(recipe.lines?.roughness ?? 0, 0, 35),
    },
    crosshatch: {
      linesPerInch: clamp(recipe.crosshatch?.linesPerInch ?? 48, 5, 300),
      angle: clamp(recipe.crosshatch?.angle ?? 35, -180, 180),
      crossAngle: clamp(recipe.crosshatch?.crossAngle ?? 125, -180, 180),
      crossThreshold: clamp(recipe.crosshatch?.crossThreshold ?? 58, 0, 100),
      minWidth: crossMinWidth,
      maxWidth: Math.max(crossMinWidth, clamp(recipe.crosshatch?.maxWidth ?? 82, 5, 100)),
      roughness: clamp(recipe.crosshatch?.roughness ?? 0, 0, 35),
    },
    sketch: {
      edgeRadius: clamp(recipe.sketch?.edgeRadius ?? 2, 1, 6),
      edgeAmount: clamp(recipe.sketch?.edgeAmount ?? 1.6, 0.1, 5),
      threshold: clamp(recipe.sketch?.threshold ?? 42, 1, 254),
      smoothing: clamp(recipe.sketch?.smoothing ?? 1, 0, 4),
    },
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
  const image = cropAndResampleImageData(sourceImage, recipe.crop, width, height);
  const gray = preparedGray(image, recipe);
  if (recipe.style === "Photo") {
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
  if (recipe.style === "Dots") return { kind: "mask", mask: spotMask(gray, width, height, dpi, recipe.dots), width, height, recipe };
  if (recipe.style === "Lines") return { kind: "mask", mask: linesMask(gray, width, height, dpi, recipe.lines), width, height, recipe };
  if (recipe.style === "Crosshatch") return { kind: "mask", mask: linesMask(gray, width, height, dpi, recipe.crosshatch, true), width, height, recipe };
  return { kind: "mask", mask: sketchMask(gray, width, height, recipe.sketch), width, height, recipe };
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
