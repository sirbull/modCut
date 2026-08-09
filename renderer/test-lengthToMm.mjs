// Unit test for the SVG->mm conversion (the fix for VisiCut's scaling bug).
// Run: node renderer/test-lengthToMm.mjs
import assert from "node:assert/strict";
import { lengthToMm } from "./svgimport.js";

const approx = (a, b) => Math.abs(a - b) < 0.05;

assert.ok(approx(lengthToMm("100mm", 500), 100), "mm passthrough");
assert.ok(approx(lengthToMm("10cm", null), 100), "cm -> mm");
assert.ok(approx(lengthToMm("1in", null), 25.4), "in -> mm");
assert.ok(approx(lengthToMm("96px", null), 25.4), "96px == 1in");
assert.ok(approx(lengthToMm("72pt", null), 25.4), "72pt == 1in");
assert.ok(approx(lengthToMm("378", null), 378 * 25.4 / 96), "unitless == px");
// Generic width-less SVG viewBoxes are CSS pixels.
assert.ok(approx(lengthToMm("100%", 378), 100), "percent falls back to viewBox px (378px ~ 100mm)");
assert.ok(approx(lengthToMm("", 189), 50), "missing falls back to viewBox px (189px ~ 50mm)");
// Illustrator's width-less viewBox uses its native 72 pt/in artboard units.
assert.ok(approx(lengthToMm("", 1715, 72), 605.01), "Illustrator viewBox points preserve the artboard width");
assert.ok(approx(lengthToMm("1715", null, 72), 605.01), "Illustrator unitless size is interpreted as points");
assert.ok(approx(lengthToMm("96px", null, 72), 25.4), "an explicit px unit remains CSS pixels");
assert.equal(lengthToMm("", null), null, "no info -> null (caller uses bbox)");

console.log("lengthToMm: all conversions correct.");
