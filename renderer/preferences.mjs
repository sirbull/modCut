export const DEFAULT_PROCESS_PREVIEW_COLORS = Object.freeze({ processPreviewCut: "#e0201b", processPreviewScore: "#1f6fe0", processPreviewEngrave: "#4d4d4d" });
export const DEFAULT_SMART_GUIDES = Object.freeze({ smartGuideColor: "#006b5c", smartGuideAlignment: true,
  smartGuideHighlight: true, smartGuideMeasurements: true, smartGuideSpacing: true, smartGuideTolerance: 4 });
export const DEFAULT_PREFERENCES = Object.freeze({ showGrid: true, invertZoom: false, tooltips: true, tooltipDelay: 1000, language: "en", laserPreviewEnabled: false, hideLaserPreviewIntro: false,
  processPreview: false, processPreviewScoreDashed: true, ...DEFAULT_PROCESS_PREVIEW_COLORS, ...DEFAULT_SMART_GUIDES });
export const PREFERENCES_KEY = "modcut_preferences";

export function normalizePreferences(value, defaults = DEFAULT_PREFERENCES) {
  const result = { ...defaults };
  if (!value || typeof value !== "object") return result;
  for (const key of ["showGrid", "invertZoom", "tooltips", "laserPreviewEnabled", "hideLaserPreviewIntro", "processPreview", "processPreviewScoreDashed", "smartGuideAlignment", "smartGuideHighlight", "smartGuideMeasurements", "smartGuideSpacing"]) {
    if (typeof value[key] === "boolean") result[key] = value[key];
  }
  for (const key of [...Object.keys(DEFAULT_PROCESS_PREVIEW_COLORS), "smartGuideColor"]) {
    if (/^#[0-9a-f]{6}$/i.test(value[key])) result[key] = value[key].toLowerCase();
  }
  if (typeof value.smartGuideTolerance === "number" && Number.isFinite(value.smartGuideTolerance)) {
    result.smartGuideTolerance = Math.max(1, Math.min(20, value.smartGuideTolerance));
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
