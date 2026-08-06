import assert from "node:assert/strict";
import test from "node:test";

import { SUPPORTED_IMPORT_FORMATS, TEXT_FORMATS } from "./import-formats.mjs";

test("file picker only advertises formats with implemented importers", () => {
  assert.deepEqual(TEXT_FORMATS, ["svg", "dxf"]);
  for (const unavailable of ["ai", "pdf", "plt", "hpgl", "gcode", "gc", "nc"]) {
    assert.equal(SUPPORTED_IMPORT_FORMATS.includes(unavailable), false, `${unavailable} must stay hidden until implemented`);
  }
});
