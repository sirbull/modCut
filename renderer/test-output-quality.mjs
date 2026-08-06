import assert from "node:assert/strict";
import test from "node:test";

import { MAX_RASTER_SAMPLES, VECTOR_SAMPLE_STEP_MM, assessOutputQuality, rasterGrid } from "./output-quality.mjs";

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

test("vector quality uses a fixed physical tolerance", () => {
  assert.equal(VECTOR_SAMPLE_STEP_MM, 0.2);
  assert.equal(assessOutputQuality({ vectorPoints: 50_000 }).blocked, false);
});
