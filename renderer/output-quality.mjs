export const VECTOR_SAMPLE_STEP_MM = 0.2;
export const MAX_RASTER_SAMPLES = 8_000_000;
// Epilog jobs are sent as native, PackBits-compressed raster lines rather
// than one controller command per pixel. This matches the grayscale payload
// limit enforced by the machine-side Epilog builder.
export const EPILOG_NATIVE_MAX_RASTER_SAMPLES = 32_000_000;
export const MAX_VECTOR_POINTS = 1_000_000;

export function rasterGrid(widthMm, heightMm, dpi) {
  const requestedDpi = Math.max(1, Number(dpi) || 1);
  const intervalMm = 25.4 / requestedDpi;
  const columns = Math.max(1, Math.ceil(Math.max(0, Number(widthMm) || 0) / intervalMm));
  const rows = Math.max(1, Math.floor(Math.max(0, Number(heightMm) || 0) / intervalMm) + 1);
  return {
    requestedDpi,
    effectiveDpi: requestedDpi,
    intervalMm,
    columns,
    rows,
    samples: columns * rows,
  };
}

// Preserve the artwork's physical dimensions while reducing laser resolution
// just enough to keep a raster job inside the memory/transport budget. The
// caller keeps the requested DPI for the UI, and uses effectiveDpi for the
// generated machine program.
export function fitRasterDpi(rasters = [], maximumSamples = MAX_RASTER_SAMPLES) {
  const source = rasters.map((raster) => ({
    ...raster,
    widthMm: Math.max(0, Number(raster.widthMm) || 0),
    heightMm: Math.max(0, Number(raster.heightMm) || 0),
    requestedDpi: Math.max(1, Number(raster.requestedDpi ?? raster.effectiveDpi) || 1),
  }));
  const requestedSamples = source.reduce((sum, raster) => sum + (Number(raster.samples) || 0), 0);
  if (!source.length || requestedSamples <= maximumSamples) {
    return { rasters: source, requestedSamples, effectiveSamples: requestedSamples, dpiScale: 1, adjusted: false };
  }
  let dpiScale = Math.sqrt(maximumSamples / requestedSamples) * 0.999;
  let fitted = source;
  for (let attempt = 0; attempt < 8; attempt++) {
    fitted = source.map((raster) => {
      const effectiveDpi = Math.max(1, raster.requestedDpi * dpiScale);
      const grid = rasterGrid(raster.widthMm, raster.heightMm, effectiveDpi);
      return { ...raster, ...grid, requestedDpi: raster.requestedDpi, effectiveDpi };
    });
    const effectiveSamples = fitted.reduce((sum, raster) => sum + raster.samples, 0);
    if (effectiveSamples <= maximumSamples) {
      return { rasters: fitted, requestedSamples, effectiveSamples, dpiScale, adjusted: true };
    }
    dpiScale *= Math.sqrt(maximumSamples / effectiveSamples) * 0.999;
  }
  const effectiveSamples = fitted.reduce((sum, raster) => sum + raster.samples, 0);
  return { rasters: fitted, requestedSamples, effectiveSamples, dpiScale, adjusted: true };
}

export function assessOutputQuality({ rasters = [], vectorPoints = 0, maxRasterSamples = MAX_RASTER_SAMPLES } = {}) {
  const rasterSamples = rasters.reduce((sum, item) => sum + (Number(item.samples) || 0), 0);
  const problems = [];
  if (rasterSamples > maxRasterSamples) {
    problems.push(`Raster output requires ${rasterSamples.toLocaleString("en-US")} samples; the safe limit is ${maxRasterSamples.toLocaleString("en-US")}. Reduce DPI or physical image size.`);
  }
  if (vectorPoints > MAX_VECTOR_POINTS) {
    problems.push(`Vector output requires about ${Math.ceil(vectorPoints).toLocaleString("en-US")} points at ${VECTOR_SAMPLE_STEP_MM} mm spacing; the safe limit is ${MAX_VECTOR_POINTS.toLocaleString("en-US")}. Split the design or simplify its paths.`);
  }
  return { blocked: problems.length > 0, problems, rasterSamples, vectorPoints };
}
