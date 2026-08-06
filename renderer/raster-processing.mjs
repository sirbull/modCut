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
