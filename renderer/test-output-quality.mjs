import assert from "node:assert/strict";
import test from "node:test";

import { EPILOG_NATIVE_MAX_RASTER_SAMPLES, MAX_RASTER_SAMPLES, VECTOR_SAMPLE_STEP_MM, assessOutputQuality, fitRasterDpi, rasterGrid } from "./output-quality.mjs";

test("raster grid preserves requested DPI without hidden row or column caps", () => {
  const grid = rasterGrid(600, 400, 300);
  assert.equal(grid.requestedDpi, 300);
  assert.equal(grid.effectiveDpi, 300);
  assert.ok(grid.columns > 4000, "a full-bed 300 DPI job must not be silently capped to 4000 columns");
  assert.ok(grid.rows > 1200, "a full-bed 300 DPI job must not be silently capped to 1200 rows");
});

test("oversized output is blocked with an explicit quality message", () => {
  const report = assessOutputQuality({ rasters: [{ samples: MAX_RASTER_SAMPLES + 1 }] });
  assert.equal(report.blocked, true);
  assert.match(report.problems[0], /Reduce DPI or physical image size/);
});

test("raster fitting lowers effective DPI without changing physical size", () => {
  const requested = rasterGrid(265, 269, 300);
  const fit = fitRasterDpi([{ ...requested, widthMm: 265, heightMm: 269 }]);
  assert.equal(fit.adjusted, true);
  assert.ok(fit.rasters[0].effectiveDpi < 300);
  assert.ok(fit.effectiveSamples <= MAX_RASTER_SAMPLES);
  assert.equal(fit.rasters[0].widthMm, 265);
  assert.equal(fit.rasters[0].heightMm, 269);
});

test("native Epilog raster capacity keeps a detailed 8-million-sample job at its requested DPI", () => {
  const requested = rasterGrid(265, 269, 300);
  const fit = fitRasterDpi([{ ...requested, widthMm: 265, heightMm: 269 }], EPILOG_NATIVE_MAX_RASTER_SAMPLES);
  assert.equal(fit.adjusted, false);
  assert.equal(fit.rasters[0].effectiveDpi, 300);
});

test("vector quality uses a fixed physical tolerance", () => {
  assert.equal(VECTOR_SAMPLE_STEP_MM, 0.2);
  assert.equal(assessOutputQuality({ vectorPoints: 50_000 }).blocked, false);
});
