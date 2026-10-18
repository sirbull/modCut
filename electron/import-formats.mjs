export const TEXT_FORMATS = Object.freeze(["svg", "svgz", "dxf", "plt", "hpgl", "eps", "ps"]);
// PostScript is read as Latin-1 text: one character per byte, so binary sections survive.
export const POSTSCRIPT_FORMATS = Object.freeze(["eps", "ps"]);
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

/** True for PostScript (plain, or EPS with a DOS binary header), as old Illustrator files are. */
export function isPostScript(bytes) {
  const b = Buffer.from(bytes);
  return b.subarray(0, 1024).toString("latin1").trimStart().startsWith("%!") || (b.length >= 4 && b.readUInt32BE(0) === 0xc5d0d3c6);
}

export function importIssueFor(ext, bytes = null) {
  const normalized = String(ext || "").toLowerCase();
  if (!SUPPORTED_IMPORT_FORMATS.includes(normalized)) return "unsupported-format";
  if (normalized === "ai" && bytes && !isPdfCompatible(bytes) && !isPostScript(bytes)) return "ai-not-pdf-compatible";
  if (normalized === "pdf" && bytes && !isPdfCompatible(bytes)) return "invalid-pdf";
  return null;
}
