import test from "node:test";
import assert from "node:assert/strict";
import { containsRasterScan, engraveStrategy } from "./bed.js";

test("open vector paths are traced when assigned to Engrave", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: false, fillColor: null }), "trace");
  assert.equal(engraveStrategy({ className: "Path", closed: false, fillColor: { alpha: 1 } }), "trace");
});

test("closed paths use area engraving even when they only have a stroke", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: null }), "raster");
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: { alpha: 0 } }), "raster");
});

test("filled closed vectors and raster images use scan engraving", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: { alpha: 1 } }), "raster");
  assert.equal(engraveStrategy({ className: "CompoundPath", fillColor: { alpha: 0.5 } }), "raster");
  assert.equal(engraveStrategy({ className: "Raster" }), "raster");
});

test("raster toolpaths are identified so scanline order can be preserved", () => {
  assert.equal(containsRasterScan([[{ op: "Engrave", raster: true }]]), true);
  assert.equal(containsRasterScan([[{ op: "Engrave" }], [{ op: "Score" }]]), false);
});
