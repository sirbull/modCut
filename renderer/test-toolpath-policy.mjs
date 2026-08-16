import test from "node:test";
import assert from "node:assert/strict";
import { containsRasterScan, engraveStrategy } from "./bed.js";

test("open vector strokes use painted-area engraving", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: false, strokeWidth: 0.1 }), "raster");
  assert.equal(engraveStrategy({ className: "Path", closed: false, strokeWidth: 5 }), "raster");
});

test("closed paths use painted-area engraving", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: null }), "raster");
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: { alpha: 0 } }), "raster");
});

test("filled vectors and raster images use scan engraving", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: { alpha: 1 } }), "raster");
  assert.equal(engraveStrategy({ className: "CompoundPath", fillColor: { alpha: 0.5 } }), "raster");
  assert.equal(engraveStrategy({ className: "Raster" }), "raster");
});

test("raster toolpaths are identified so scanline order can be preserved", () => {
  assert.equal(containsRasterScan([[{ op: "Engrave", raster: true }]]), true);
  assert.equal(containsRasterScan([[{ op: "Engrave" }], [{ op: "Score" }]]), false);
});
