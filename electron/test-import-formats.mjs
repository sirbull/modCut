import assert from "node:assert/strict";
import test from "node:test";

import { IMAGE_FORMATS, PDF_FORMATS, SUPPORTED_IMPORT_FORMATS, TEXT_FORMATS, TIFF_FORMATS, isPdfCompatible } from "./import-formats.mjs";

test("file picker only advertises formats with implemented importers", () => {
  assert.deepEqual(TEXT_FORMATS, ["svg", "svgz", "dxf", "plt", "hpgl"]);
  assert.deepEqual(IMAGE_FORMATS, ["png", "jpg", "jpeg", "bmp", "gif", "webp", "avif"]);
  assert.deepEqual(TIFF_FORMATS, ["tif", "tiff"]);
  assert.deepEqual(PDF_FORMATS, ["pdf", "ai"]);
  for (const unavailable of ["eps", "ps", "gcode", "gc", "nc"]) {
    assert.equal(SUPPORTED_IMPORT_FORMATS.includes(unavailable), false, `${unavailable} must stay hidden until implemented`);
  }
});

test("Illustrator support is limited to PDF-compatible files", () => {
  assert.equal(isPdfCompatible(Buffer.from("%PDF-1.7\n...")), true);
  assert.equal(isPdfCompatible(Buffer.from("\n%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator")), false);
});
