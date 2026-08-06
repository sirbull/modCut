export const DEFAULT_RASTER_SETTINGS = Object.freeze({
  brightness: 0,
  contrast: 0,
  blackPoint: 0,
  whitePoint: 255,
  threshold: 128,
  gamma: 1,
  grayLevels: 16,
  invert: false,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

export function normalizeRasterSettings(settings = {}) {
  const blackPoint = clamp(settings.blackPoint ?? DEFAULT_RASTER_SETTINGS.blackPoint, 0, 254);
  const whitePoint = Math.max(
    blackPoint + 1,
    clamp(settings.whitePoint ?? DEFAULT_RASTER_SETTINGS.whitePoint, 1, 255),
  );
  return {
    brightness: clamp(settings.brightness ?? DEFAULT_RASTER_SETTINGS.brightness, -100, 100),
    contrast: clamp(settings.contrast ?? DEFAULT_RASTER_SETTINGS.contrast, -100, 100),
    blackPoint,
    whitePoint,
    threshold: clamp(settings.threshold ?? DEFAULT_RASTER_SETTINGS.threshold, 0, 255),
    gamma: clamp(settings.gamma ?? DEFAULT_RASTER_SETTINGS.gamma, 0.2, 3),
    grayLevels: Math.round(clamp(settings.grayLevels ?? DEFAULT_RASTER_SETTINGS.grayLevels, 2, 32)),
    invert: Boolean(settings.invert),
  };
}

function adjustedGrayNormalized(red, green, blue, alpha, s) {
  if (alpha < 8) return 255;
  const contrast = s.contrast * 2.55;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const brightness = s.brightness * 2.55;
  let gray = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  gray = factor * (gray - 128) + 128 + brightness;
  gray = clamp(((gray - s.blackPoint) * 255) / (s.whitePoint - s.blackPoint), 0, 255);
  gray = 255 * Math.pow(gray / 255, 1 / s.gamma);
  return s.invert ? 255 - gray : gray;
}

export function adjustedGray(red, green, blue, alpha = 255, settings = DEFAULT_RASTER_SETTINGS) {
  return adjustedGrayNormalized(red, green, blue, alpha, normalizeRasterSettings(settings));
}

export function grayscaleImageData(image, settings = DEFAULT_RASTER_SETTINGS) {
  const normalized = normalizeRasterSettings(settings);
  const gray = new Float32Array(image.width * image.height);
  for (let i = 0, pixel = 0; i < image.data.length; i += 4, pixel++) {
    gray[pixel] = adjustedGrayNormalized(
      image.data[i],
      image.data[i + 1],
      image.data[i + 2],
      image.data[i + 3],
      normalized,
    );
  }
  return { gray, settings: normalized };
}

export function grayToPower(gray, levels = 16, maxPower = 100) {
  const safeLevels = Math.round(clamp(levels, 2, 32));
  const safePower = clamp(maxPower, 0, 100);
  const intensity = 1 - clamp(gray, 0, 255) / 255;
  const level = Math.round(intensity * (safeLevels - 1));
  return level === 0 ? 0 : (safePower * level) / (safeLevels - 1);
}

// Photoshop-style posterization: collapse neighboring tones into a fixed
// number of evenly spaced gray bands, including pure black and white.
export function posterizeGray(gray, levels = 16) {
  const safeLevels = Math.round(clamp(levels, 2, 32));
  const step = 255 / (safeLevels - 1);
  return Math.round(clamp(gray, 0, 255) / step) * step;
}

export function ditherMask(gray, width, height, settings, dither = "Jarvis") {
  const normalized = normalizeRasterSettings(settings);
  const mask = new Uint8Array(width * height);
  const threshold = normalized.threshold;
  const type = String(dither).toLowerCase();
  const mark = (idx, black) => (mask[idx] = black ? 1 : 0);
  if (type.includes("bayer")) {
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const value = threshold + (bayer[(y & 3) * 4 + (x & 3)] - 7.5) * 10;
      mark(idx, gray[idx] < value);
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
    const error = old - next;
    for (const [dx, dy, weight] of kernels) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) work[ny * width + nx] += error * weight;
    }
  }
  return mask;
}

// Turn one sampled scanline into consecutive, variable-power laser runs.
export function grayscaleRuns(samples, levels = 16, maxPower = 100) {
  const runs = [];
  let start = 0;
  let power = samples.length ? grayToPower(samples[0], levels, maxPower) : 0;
  for (let index = 1; index <= samples.length; index++) {
    const next = index < samples.length ? grayToPower(samples[index], levels, maxPower) : -1;
    if (next === power) continue;
    if (power > 0) runs.push({ start, end: index, power });
    start = index;
    power = next;
  }
  return runs;
}

export function tintGray(gray, hexColor = "#000000") {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hexColor));
  const hex = match ? match[1] : "000000";
  const amount = clamp(gray, 0, 255) / 255;
  const base = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return base.map((channel) => Math.round(channel + (255 - channel) * amount));
}
