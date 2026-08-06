import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustedGray,
  grayToPower,
  grayscaleImageData,
  grayscaleRuns,
  normalizeRasterSettings,
  tintGray,
} from "./raster-processing.mjs";

test("color raster pixels remain continuous grayscale instead of binary", () => {
  const red = adjustedGray(255, 0, 0);
  const green = adjustedGray(0, 255, 0);
  const blue = adjustedGray(0, 0, 255);
  assert.ok(red > blue && green > red);
  assert.ok(red > 0 && red < 255);
  assert.notEqual(Math.round(red), 0);
  assert.notEqual(Math.round(red), 255);
});

test("brightness, contrast, tone points, gamma and invert affect grayscale", () => {
  const base = adjustedGray(100, 100, 100);
  assert.ok(adjustedGray(100, 100, 100, 255, { brightness: 20 }) > base);
  assert.ok(adjustedGray(100, 100, 100, 255, { contrast: 30 }) < base);
  assert.equal(adjustedGray(40, 40, 40, 255, { blackPoint: 40 }), 0);
  assert.equal(adjustedGray(200, 200, 200, 255, { whitePoint: 200 }), 255);
  assert.ok(adjustedGray(100, 100, 100, 255, { gamma: 2 }) > base);
  assert.ok(Math.abs(adjustedGray(100, 100, 100, 255, { invert: true }) - (255 - base)) < 0.001);
});

test("transparent pixels never engrave", () => {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]) };
  assert.equal(grayscaleImageData(image).gray[0], 255);
  assert.equal(grayToPower(255, 16, 80), 0);
});

test("gray levels quantize laser power and preserve the layer maximum", () => {
  assert.equal(grayToPower(255, 4, 60), 0);
  assert.equal(grayToPower(0, 4, 60), 60);
  assert.equal(grayToPower(128, 4, 60), 20);
});

test("grayscale scanlines are run-length encoded by variable power", () => {
  const runs = grayscaleRuns([255, 255, 128, 128, 0], 4, 60);
  assert.deepEqual(runs, [
    { start: 2, end: 4, power: 20 },
    { start: 4, end: 5, power: 60 },
  ]);
});

test("raster settings are clamped and keep valid tone points", () => {
  assert.deepEqual(normalizeRasterSettings({ blackPoint: 255, whitePoint: 0, grayLevels: 100 }), {
    brightness: 0,
    contrast: 0,
    blackPoint: 254,
    whitePoint: 255,
    threshold: 128,
    gamma: 1,
    grayLevels: 32,
    invert: false,
  });
});

test("layer tint preserves white and maps black to the selected layer color", () => {
  assert.deepEqual(tintGray(0, "#0000ff"), [0, 0, 255]);
  assert.deepEqual(tintGray(255, "#0000ff"), [255, 255, 255]);
  assert.deepEqual(tintGray(128, "#ff0000"), [255, 128, 128]);
});
