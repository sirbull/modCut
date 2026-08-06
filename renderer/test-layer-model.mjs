import assert from "node:assert/strict";
import test from "node:test";

import {
  OPERATIONS,
  canAssignRasterToOperation,
  isOutputLayer,
  itemLayerColor,
  operationsForLayer,
  setItemLayerColor,
} from "./layer-model.mjs";

test("Ignore is available for vector and raster layers", () => {
  assert.deepEqual(OPERATIONS, ["Cut", "Engrave", "Score", "Ignore"]);
  assert.deepEqual(operationsForLayer(true), ["Engrave", "Ignore"]);
});

test("ignored and disabled layers are never output", () => {
  assert.equal(isOutputLayer({ output: true, op: "Ignore" }), false);
  assert.equal(isOutputLayer({ output: false, op: "Cut" }), false);
  assert.equal(isOutputLayer({ output: true, op: "Engrave" }), true);
});

test("raster assignment only allows engrave or ignore", () => {
  assert.equal(canAssignRasterToOperation("Engrave"), true);
  assert.equal(canAssignRasterToOperation("Ignore"), true);
  assert.equal(canAssignRasterToOperation("Cut"), false);
  assert.equal(canAssignRasterToOperation("Score"), false);
});

test("element layer color persists and updates existing stroke and fill", () => {
  const item = { className: "Path", data: {}, strokeColor: "#111111", fillColor: "#eeeeee" };
  assert.equal(setItemLayerColor(item, "#ff0000"), true);
  assert.equal(item.strokeColor, "#ff0000");
  assert.equal(item.fillColor, "#ff0000");
  assert.equal(itemLayerColor(item), "#ff0000");
});

test("changing a stroke layer does not add a fill, and raster stores its layer color", () => {
  const stroke = { className: "Path", data: {}, strokeColor: "#000000", fillColor: null };
  setItemLayerColor(stroke, "#0000ff");
  assert.equal(stroke.strokeColor, "#0000ff");
  assert.equal(stroke.fillColor, null);

  const raster = { className: "Raster", data: {} };
  setItemLayerColor(raster, "#00aa00");
  assert.equal(itemLayerColor(raster), "#00aa00");
});
