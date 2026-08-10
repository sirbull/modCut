import assert from "node:assert/strict";
import test from "node:test";

import { extractPdfVectors } from "./pdf-vector.mjs";

const OPS = {
  save: 10, restore: 11, transform: 12, stroke: 20, fill: 22, eoFill: 23,
  fillStroke: 24, closeFillStroke: 26, closeEOFillStroke: 27, clip: 29,
  showText: 44, setGState: 9, setLineWidth: 2, setStrokeRGBColor: 58,
  setFillRGBColor: 59, setStrokeColorN: 53, setFillColorN: 55,
  setStrokeTransparent: 92, setFillTransparent: 93, constructPath: 91,
  paintImageXObject: 85, rawFillPath: 94,
};

const viewport = { width: 72, height: 36, transform: [1, 0, 0, -1, 0, 36] };

test("solid PDF paths become physical-size SVG vectors", () => {
  const result = extractPdfVectors({
    fnArray: [OPS.setStrokeRGBColor, OPS.setLineWidth, OPS.constructPath],
    argsArray: [["#ff0000"], [0.5], [OPS.stroke, [new Float32Array([0, 0, 0, 1, 72, 36])], new Float32Array([0, 0, 72, 36])]],
  }, viewport, OPS);
  assert.equal(result.vectorPathCount, 1);
  assert.equal(result.hasRasterContent, false);
  assert.equal(result.extractedIndexes.has(2), true);
  assert.match(result.svgText, /width="25\.4mm" height="12\.7mm"/);
  assert.match(result.svgText, /M0 0 L72 36/);
  assert.match(result.svgText, /stroke="#ff0000"/);
  assert.match(result.svgText, /matrix\(1 0 0 -1 0 36\)/);
});

test("text and images stay in the raster pass while solid paths are removed", () => {
  const result = extractPdfVectors({
    fnArray: [OPS.constructPath, OPS.showText, OPS.paintImageXObject],
    argsArray: [[OPS.fill, [new Float32Array([0, 0, 0, 1, 20, 0, 1, 20, 20, 4])], null], [[{ unicode: "A" }]], ["img_1"]],
  }, viewport, OPS);
  assert.equal(result.vectorPathCount, 1);
  assert.equal(result.hasRasterContent, true);
  assert.deepEqual([...result.extractedIndexes], [0]);
});

test("pattern-filled and clipped paths remain raster to preserve appearance", () => {
  const result = extractPdfVectors({
    fnArray: [OPS.setFillColorN, OPS.constructPath, OPS.clip, OPS.constructPath, OPS.constructPath],
    argsArray: [[], [OPS.fill, [new Float32Array([0, 0, 0, 1, 10, 10])], null], [], [28, [null], null], [OPS.stroke, [new Float32Array([0, 0, 0, 1, 10, 10])], null]],
  }, viewport, OPS);
  assert.equal(result.vectorPathCount, 0);
  assert.equal(result.hasRasterContent, true);
});
