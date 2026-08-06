import test from "node:test";
import assert from "node:assert/strict";
import { engraveStrategy } from "./bed.js";

test("open vector paths are traced when assigned to Engrave", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: false, fillColor: null }), "trace");
  assert.equal(engraveStrategy({ className: "Path", closed: false, fillColor: { alpha: 1 } }), "trace");
});

test("stroke-only closed paths are traced instead of silently disappearing", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: null }), "trace");
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: { alpha: 0 } }), "trace");
});

test("filled closed vectors and raster images use scan engraving", () => {
  assert.equal(engraveStrategy({ className: "Path", closed: true, fillColor: { alpha: 1 } }), "raster");
  assert.equal(engraveStrategy({ className: "CompoundPath", fillColor: { alpha: 0.5 } }), "raster");
  assert.equal(engraveStrategy({ className: "Raster" }), "raster");
});
