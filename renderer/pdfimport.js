import { GlobalWorkerOptions, OPS, getDocument } from "../node_modules/pdfjs-dist/build/pdf.mjs";
import { extractPdfVectors } from "./pdf-vector.mjs";

GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).href;
const PDFJS_ROOT = new URL("../node_modules/pdfjs-dist/", import.meta.url);

const MM_PER_POINT = 25.4 / 72;
const DEFAULT_DPI = 300;
const MAX_PIXELS = 36_000_000;

function bytesFromDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid PDF data.");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function pdfToRaster(dataUrl, { dpi = DEFAULT_DPI, maxPixels = MAX_PIXELS } = {}) {
  const loadingTask = openPdf(dataUrl);
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const points = page.getViewport({ scale: 1 });
    return { ...(await renderRaster(page, points, { dpi, maxPixels })), pageCount: pdf.numPages };
  } finally {
    destroyPdfInBackground(pdf);
  }
}

function openPdf(dataUrl) {
  return getDocument({
    data: bytesFromDataUrl(dataUrl),
    cMapUrl: new URL("cmaps/", PDFJS_ROOT).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", PDFJS_ROOT).href,
    disableFontFace: true,
    useSystemFonts: false,
    wasmUrl: new URL("wasm/", PDFJS_ROOT).href,
  });
}

function destroyPdfInBackground(pdf) {
  void pdf.destroy().catch(() => {});
}

function maskExtractedVectors(canvas, context, points, masks = []) {
  if (!masks.length) return;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskContext = maskCanvas.getContext("2d");
  const scaleX = canvas.width / points.width;
  const scaleY = canvas.height / points.height;
  for (const mask of masks) {
    maskContext.save();
    maskContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    if (mask.transform?.length === 6) maskContext.transform(...mask.transform);
    maskContext.beginPath();
    for (let index = 0; index < mask.commands.length;) {
      const command = mask.commands[index++];
      if (command === 0) maskContext.moveTo(mask.commands[index++], mask.commands[index++]);
      else if (command === 1) maskContext.lineTo(mask.commands[index++], mask.commands[index++]);
      else if (command === 2) maskContext.bezierCurveTo(
        mask.commands[index++], mask.commands[index++], mask.commands[index++],
        mask.commands[index++], mask.commands[index++], mask.commands[index++],
      );
      else if (command === 3) maskContext.quadraticCurveTo(
        mask.commands[index++], mask.commands[index++], mask.commands[index++], mask.commands[index++],
      );
      else if (command === 4) maskContext.closePath();
      else break;
    }
    if (mask.fill) {
      maskContext.fillStyle = "#ffffff";
      maskContext.fill(mask.fillRule || "nonzero");
    }
    if (mask.stroke) {
      maskContext.strokeStyle = "#ffffff";
      maskContext.lineWidth = mask.lineWidth || 1;
      maskContext.lineCap = mask.lineCap || "butt";
      maskContext.lineJoin = mask.lineJoin || "miter";
      maskContext.miterLimit = mask.miterLimit || 10;
      maskContext.setLineDash(mask.dash || []);
      maskContext.lineDashOffset = mask.dashOffset || 0;
      maskContext.stroke();
    }
    maskContext.restore();
  }
  context.drawImage(maskCanvas, 0, 0);
}

async function renderRaster(page, points, { dpi, maxPixels, rasterMasks = [] }) {
  let scale = dpi / 72;
  const requestedPixels = points.width * scale * points.height * scale;
  if (requestedPixels > maxPixels) scale *= Math.sqrt(maxPixels / requestedPixels);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  await page.render({ canvas, canvasContext: context, viewport, intent: "print" }).promise;
  maskExtractedVectors(canvas, context, points, rasterMasks);
  const dataUrl = canvas.toDataURL("image/png");
  return {
    dataUrl,
    widthMm: points.width * MM_PER_POINT,
    heightMm: points.height * MM_PER_POINT,
    effectiveDpi: Math.round(scale * 72),
  };
}

export async function pdfToArtwork(dataUrl, { dpi = DEFAULT_DPI, maxPixels = MAX_PIXELS } = {}) {
  const loadingTask = openPdf(dataUrl);
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const points = page.getViewport({ scale: 1 });
    const operatorList = await page.getOperatorList();
    const vectors = extractPdfVectors(operatorList, points, OPS);
    const raster = vectors.hasRasterContent
      ? await renderRaster(page, points, {
        dpi,
        maxPixels,
        rasterMasks: vectors.rasterMasks,
      })
      : null;
    return {
      ...vectors,
      rasterDataUrl: raster?.dataUrl || null,
      effectiveDpi: raster?.effectiveDpi || null,
      pageCount: pdf.numPages,
    };
  } finally {
    destroyPdfInBackground(pdf);
  }
}
