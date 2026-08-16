import assert from "node:assert/strict";
import test from "node:test";

import {
  cropAndResampleImageData,
  detailDensity,
  normalizeEngravingRecipe,
  processEngravingImage,
} from "./engraving-recipe.mjs";

function solid(width, height, value) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { data, width, height };
}

test("engraving recipes clamp crop, adjustments and style parameters", () => {
  const recipe = normalizeEngravingRecipe({
    crop: { x: .9, y: -.5, width: .4, height: 2 },
    style: "Dots",
    adjustments: { gamma: 99, dehaze: 999, denoise: -2 },
    dots: { detail: 999, cellsPerInch: 999, minSize: -4, maxSize: 200 },
    lines: { detail: -20 },
  });
  assert.deepEqual(recipe.crop, { x: .6, y: 0, width: .4, height: 1 });
  assert.equal(recipe.adjustments.gamma, 3);
  assert.equal(recipe.adjustments.dehaze, 100);
  assert.equal(recipe.adjustments.denoise, 0);
  assert.equal(recipe.dots.cellsPerInch, 300);
  assert.equal(recipe.dots.detail, 100);
  assert.equal(recipe.lines.detail, 1);
  assert.equal(recipe.dots.minSize, 0);
  assert.equal(recipe.dots.maxSize, 100);
});

test("style detail preserves density at 50 and scales it in both directions", () => {
  assert.equal(detailDensity(60, 50), 60);
  assert.ok(detailDensity(60, 20) < 60);
  assert.ok(detailDensity(60, 80) > 60);
});

test("engraving recipes keep safe, positioned text settings for raster baking", () => {
  const recipe = normalizeEngravingRecipe({
    texts: [{ text: "Hello", fontFamily: "Avenir Next", size: 99, x: -10, y: 110, weight: "bold", style: "italic", color: "#ffffff" }],
  });
  assert.deepEqual(recipe.texts, [{
    id: "text-1", text: "Hello", fontFamily: "Avenir Next", size: 40, x: 0, y: 100,
    weight: "bold", style: "italic", color: "#ffffff",
  }]);
});

test("crop resampling uses the selected source rectangle without changing the original", () => {
  const source = solid(4, 1, 0);
  source.data.set([255, 0, 0, 255], 0);
  source.data.set([0, 255, 0, 255], 4);
  source.data.set([0, 0, 255, 255], 8);
  source.data.set([255, 255, 255, 255], 12);
  const cropped = cropAndResampleImageData(source, { x: .5, y: 0, width: .5, height: 1 }, 2, 1);
  assert.deepEqual([...cropped.data], [0, 0, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual([...source.data.slice(8)], [0, 0, 255, 255, 255, 255, 255, 255]);
});

test("photo output supports grayscale and deterministic Atkinson diffusion", () => {
  const source = solid(12, 8, 115);
  const grayscale = processEngravingImage(source, { width: 12, height: 8, dpi: 300 }, { style: "Photo", photo: { mode: "Grayscale" } });
  assert.equal(grayscale.kind, "gray");
  const first = processEngravingImage(source, { width: 12, height: 8, dpi: 300 }, { style: "Photo", photo: { mode: "Atkinson", noise: 4 } });
  const second = processEngravingImage(source, { width: 12, height: 8, dpi: 300 }, { style: "Photo", photo: { mode: "Atkinson", noise: 4 } });
  assert.equal(first.kind, "mask");
  assert.deepEqual([...first.mask], [...second.mask]);
});

test("dehaze restores tonal separation in a pale low-contrast image", () => {
  const source = solid(80, 40, 175);
  for (let y = 0; y < source.height; y++) for (let x = source.width / 2; x < source.width; x++) {
    const offset = (y * source.width + x) * 4;
    source.data[offset] = source.data[offset + 1] = source.data[offset + 2] = 205;
  }
  const neutral = processEngravingImage(source, { width: 80, height: 40, dpi: 300 }, { style: "Photo", adjustments: { dehaze: 0, grayLevels: 32 } });
  const restored = processEngravingImage(source, { width: 80, height: 40, dpi: 300 }, { style: "Photo", adjustments: { dehaze: 50, grayLevels: 32 } });
  const neutralSeparation = neutral.gray[20 * 80 + 60] - neutral.gray[20 * 80 + 10];
  const restoredSeparation = restored.gray[20 * 80 + 60] - restored.gray[20 * 80 + 10];
  assert.ok(restoredSeparation > neutralSeparation);
  assert.ok(restored.gray[20 * 80 + 10] < neutral.gray[20 * 80 + 10]);
});

test("darker tones produce at least as many halftone and line marks", () => {
  for (const style of ["Dots", "Lines", "Crosshatch"]) {
    const dark = processEngravingImage(solid(80, 60, 35), { width: 80, height: 60, dpi: 300 }, { style });
    const light = processEngravingImage(solid(80, 60, 220), { width: 80, height: 60, dpi: 300 }, { style });
    const count = (mask) => mask.reduce((sum, value) => sum + value, 0);
    assert.ok(count(dark.mask) >= count(light.mask), `${style} should grow marks for darker tones`);
  }
});

test("detail level changes every engraving style's rendered structure", () => {
  const source = solid(96, 64, 150);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const value = (x * 17 + y * 29) % 256;
    const offset = (y * source.width + x) * 4;
    source.data[offset] = source.data[offset + 1] = source.data[offset + 2] = value;
  }
  for (const [style, scope] of [["Photo", "photo"], ["Dots", "dots"], ["Lines", "lines"], ["Crosshatch", "crosshatch"], ["Sketch", "sketch"]]) {
    const low = processEngravingImage(source, { width: 96, height: 64, dpi: 300 }, { style, [scope]: { detail: 10 } });
    const high = processEngravingImage(source, { width: 96, height: 64, dpi: 300 }, { style, [scope]: { detail: 90 } });
    const lowValues = low.kind === "gray" ? low.gray : low.mask;
    const highValues = high.kind === "gray" ? high.gray : high.mask;
    assert.notDeepEqual([...lowValues], [...highValues], `${style} detail must affect the processed output`);
  }
});

test("tone adjustments feed into pattern styles before marks are generated", () => {
  const source = solid(80, 60, 140);
  const marks = (style, brightness) => processEngravingImage(
    source,
    { width: 80, height: 60, dpi: 300 },
    { style, adjustments: { brightness } },
  ).mask.reduce((sum, value) => sum + value, 0);
  for (const style of ["Dots", "Lines", "Crosshatch"]) {
    assert.ok(marks(style, -45) > marks(style, 45), `${style} must react to brightness before pattern generation`);
  }
});

test("sketch mode detects a strong edge and leaves flat areas mostly empty", () => {
  const source = solid(24, 12, 255);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width / 2; x++) {
    const offset = (y * source.width + x) * 4;
    source.data[offset] = source.data[offset + 1] = source.data[offset + 2] = 0;
  }
  const result = processEngravingImage(source, { width: 24, height: 12, dpi: 300 }, { style: "Sketch", sketch: { threshold: 20, edgeAmount: 2 } });
  const marks = result.mask.reduce((sum, value) => sum + value, 0);
  assert.ok(marks > 0);
  assert.ok(marks < source.width * source.height / 2);
});
