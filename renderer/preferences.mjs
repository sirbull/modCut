export const DEFAULT_PREFERENCES = Object.freeze({ showGrid: true, invertZoom: false, tooltips: true, tooltipDelay: 1000, language: "system", laserPreviewEnabled: false, hideLaserPreviewIntro: false });
export const PREFERENCES_KEY = "modcut_preferences";

export function normalizePreferences(value, defaults = DEFAULT_PREFERENCES) {
  const result = { ...defaults };
  if (!value || typeof value !== "object") return result;
  for (const key of ["showGrid", "invertZoom", "tooltips", "laserPreviewEnabled", "hideLaserPreviewIntro"]) {
    if (typeof value[key] === "boolean") result[key] = value[key];
  }
  const delay = Number(value.tooltipDelay);
  if ([350, 1000, 1800].includes(delay)) result.tooltipDelay = delay;
  if (["system", "en", "nb"].includes(value.language)) result.language = value.language;
  return result;
}

export function loadPreferences(storage) {
  try { return normalizePreferences(JSON.parse(storage.getItem(PREFERENCES_KEY))); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}
