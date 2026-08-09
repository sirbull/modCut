export const PROCESS_OPERATIONS = ["Cut", "Engrave", "Score"];
export const RASTER_MODES = ["Grayscale", "Jarvis", "Floyd-Steinberg", "Stucki", "Bayer"];
export const ENGRAVE_MODES = ["auto", "native", "vector"];

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, finite(value, fallback)));

export function combinedFocusOffset(machineOffset, layerOffset) {
  return finite(machineOffset, 0) + finite(layerOffset, 0);
}

export function normalizeProcessProfile(profile = {}) {
  const op = PROCESS_OPERATIONS.includes(profile.op) ? profile.op : "Cut";
  return {
    id: String(profile.id || ""),
    name: String(profile.name || `${op} profile`).trim() || `${op} profile`,
    op,
    power: clamp(profile.power, 0, 100, 50),
    speed: clamp(profile.speed, 1, 100, 50),
    freq: Math.max(0, finite(profile.freq, 20_000)),
    zOffset: finite(profile.zOffset, 0),
    dpi: clamp(profile.dpi, 1, 1000, 300),
    dither: RASTER_MODES.includes(profile.dither) ? profile.dither : "Grayscale",
    bottomUp: profile.bottomUp !== false,
    engraveMode: ENGRAVE_MODES.includes(profile.engraveMode) ? profile.engraveMode : "auto",
  };
}

export function applyProcessProfile(layer, rawProfile) {
  const profile = normalizeProcessProfile(rawProfile);
  layer.op = profile.op;
  layer.power = profile.power;
  layer.speed = profile.speed;
  layer.freq = profile.freq;
  layer.zOffset = profile.zOffset;
  if (profile.op === "Engrave") {
    layer.dpi = profile.dpi;
    layer.dither = profile.dither;
    layer.bottomUp = profile.bottomUp;
    layer.engraveMode = profile.engraveMode;
  }
  layer.profileId = profile.id || null;
  return layer;
}

export function profilesForOperation(profiles, operation) {
  return profiles.map(normalizeProcessProfile).filter((profile) => profile.id && profile.op === operation);
}
