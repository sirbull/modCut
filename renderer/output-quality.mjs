export const VECTOR_SAMPLE_STEP_MM = 0.2;
export const MAX_RASTER_SAMPLES = 8_000_000;
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

export function assessOutputQuality({ rasters = [], vectorPoints = 0 } = {}) {
  const rasterSamples = rasters.reduce((sum, item) => sum + (Number(item.samples) || 0), 0);
  const problems = [];
  if (rasterSamples > MAX_RASTER_SAMPLES) {
    problems.push(`Raster output requires ${rasterSamples.toLocaleString("en-US")} samples; the safe limit is ${MAX_RASTER_SAMPLES.toLocaleString("en-US")}. Reduce DPI or physical image size.`);
  }
  if (vectorPoints > MAX_VECTOR_POINTS) {
    problems.push(`Vector output requires about ${Math.ceil(vectorPoints).toLocaleString("en-US")} points at ${VECTOR_SAMPLE_STEP_MM} mm spacing; the safe limit is ${MAX_VECTOR_POINTS.toLocaleString("en-US")}. Split the design or simplify its paths.`);
  }
  return { blocked: problems.length > 0, problems, rasterSamples, vectorPoints };
}
