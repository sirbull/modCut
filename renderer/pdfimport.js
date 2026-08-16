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
    await pdf.destroy();
  }
}

function openPdf(dataUrl) {
  return getDocument({
    data: bytesFromDataUrl(dataUrl),
    cMapUrl: new URL("cmaps/", PDFJS_ROOT).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", PDFJS_ROOT).href,
    wasmUrl: new URL("wasm/", PDFJS_ROOT).href,
  });
}

async function renderRaster(page, points, { dpi, maxPixels, operationsFilter = null }) {
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
  await page.render({ canvas, canvasContext: context, viewport, operationsFilter }).promise;
  return {
    dataUrl: canvas.toDataURL("image/png"),
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
        operationsFilter: (index) => !vectors.extractedIndexes.has(index),
      })
      : null;
    return {
      ...vectors,
      rasterDataUrl: raster?.dataUrl || null,
      effectiveDpi: raster?.effectiveDpi || null,
      pageCount: pdf.numPages,
    };
  } finally {
    await pdf.destroy();
  }
}
