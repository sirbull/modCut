export const OPERATIONS = Object.freeze(["Cut", "Engrave", "Score", "Ignore"]);

export function operationsForLayer(hasRaster = false) {
  return hasRaster ? ["Engrave", "Ignore"] : [...OPERATIONS];
}

export function canAssignRasterToOperation(operation) {
  return operation === "Engrave" || operation === "Ignore";
}

export function isOutputLayer(layer) {
  return Boolean(layer?.output) && layer.op !== "Ignore";
}

export function itemLayerColor(item, colorToCss = (color) => String(color || "")) {
  const stored = item?.data?.modcutColor;
  if (stored) return String(stored).toLowerCase();
  if (item?.className === "Raster") return "#000000";
  return String(colorToCss(item?.strokeColor) || colorToCss(item?.fillColor) || "#000000").toLowerCase();
}

export function setItemLayerColor(item, color) {
  if (!item) return false;
  if (!item.data) item.data = {};
  item.data.modcutColor = color;
  if (item.className === "Raster") return true;
  let painted = false;
  const paint = (target) => {
    if (target.strokeColor) { target.strokeColor = color; painted = true; }
    if (target.fillColor) { target.fillColor = color; painted = true; }
    if (target.children) for (const child of target.children) paint(child);
  };
  paint(item);
  if (!painted) item.strokeColor = color;
  return true;
}
