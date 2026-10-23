import assert from "node:assert/strict";
import test from "node:test";

import { IMAGE_FORMATS, PDF_FORMATS, SUPPORTED_IMPORT_FORMATS, TEXT_FORMATS, TIFF_FORMATS, importIssueFor, isPdfCompatible } from "./import-formats.mjs";

test("file picker only advertises formats with implemented importers", () => {
  assert.deepEqual(TEXT_FORMATS, ["svg", "svgz", "dxf", "plt", "hpgl", "eps", "ps"]);
  assert.deepEqual(IMAGE_FORMATS, ["png", "jpg", "jpeg", "bmp", "gif", "webp", "avif"]);
  assert.deepEqual(TIFF_FORMATS, ["tif", "tiff"]);
  assert.deepEqual(PDF_FORMATS, ["pdf", "ai"]);
  for (const unavailable of ["gcode", "gc", "nc"]) {
    assert.equal(SUPPORTED_IMPORT_FORMATS.includes(unavailable), false, `${unavailable} must stay hidden until implemented`);
  }
});

test("Illustrator support is limited to PDF-compatible files", () => {
  assert.equal(isPdfCompatible(Buffer.from("%PDF-1.7\n...")), true);
  assert.equal(isPdfCompatible(Buffer.from("\n%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator")), false);
  assert.equal(importIssueFor("ai", Buffer.from("%!PS-Adobe-3.0")), null, "Older Illustrator files are PostScript, read by the EPS importer");
  assert.equal(importIssueFor("ai", Buffer.from("\0\0binary")), "ai-not-pdf-compatible");
  assert.equal(importIssueFor("AI", Buffer.from("%PDF-1.7")), null);
});

test("unsupported and invalid formats return renderer-safe issue codes", () => {
  assert.equal(importIssueFor("cdr"), "unsupported-format");
  assert.equal(importIssueFor("pdf", Buffer.from("not a PDF")), "invalid-pdf");
  assert.equal(importIssueFor("svg"), null);
});
