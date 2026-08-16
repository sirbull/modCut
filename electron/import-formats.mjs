export const TEXT_FORMATS = Object.freeze(["svg", "svgz", "dxf", "plt", "hpgl"]);
export const IMAGE_FORMATS = Object.freeze(["png", "jpg", "jpeg", "bmp", "gif", "webp", "avif"]);
export const TIFF_FORMATS = Object.freeze(["tif", "tiff"]);
export const PDF_FORMATS = Object.freeze(["pdf", "ai"]);
export const DOCUMENT_FORMATS = Object.freeze(["modcut"]);

export const SUPPORTED_IMPORT_FORMATS = Object.freeze([
  ...TEXT_FORMATS,
  ...IMAGE_FORMATS,
  ...TIFF_FORMATS,
  ...PDF_FORMATS,
  ...DOCUMENT_FORMATS,
]);

export function isPdfCompatible(bytes) {
  const prefix = Buffer.from(bytes).subarray(0, 1024).toString("latin1");
  return prefix.includes("%PDF-");
}

export function importIssueFor(ext, bytes = null) {
  const normalized = String(ext || "").toLowerCase();
  if (!SUPPORTED_IMPORT_FORMATS.includes(normalized)) return "unsupported-format";
  if (normalized === "ai" && bytes && !isPdfCompatible(bytes)) return "ai-not-pdf-compatible";
  if (normalized === "pdf" && bytes && !isPdfCompatible(bytes)) return "invalid-pdf";
  return null;
}
