import assert from "node:assert/strict";
import test from "node:test";

import { hpglToSvg } from "./hpglimport.js";

test("HP-GL absolute pen paths become millimetre SVG paths", () => {
  const svg = hpglToSvg("IN;SP1;PU0,0;PD400,0,400,200;PU;");
  assert.match(svg, /width="10\.000mm"/);
  assert.match(svg, /height="5\.000mm"/);
  assert.match(svg, /M0\.000,5\.000 L10\.000,5\.000 L10\.000,0\.000/);
  assert.match(svg, /stroke="#000000"/);
});

test("HP-GL relative coordinates and pen colors are retained", () => {
  const svg = hpglToSvg("IN;SP2;PA100,100;PD;PR400,0,0,400;PU;");
  assert.match(svg, /width="10\.000mm"/);
  assert.match(svg, /height="10\.000mm"/);
  assert.match(svg, /stroke="#ff0000"/);
});

test("HP-GL without drawable paths is rejected", () => {
  assert.throws(() => hpglToSvg("IN;PU0,0;"), /No supported HP-GL/);
});

test("HP-GL circles draw while the pen is up without a radial line", () => {
  const svg = hpglToSvg("IN;SP3;PU400,400;CI200;");
  assert.match(svg, /width="10\.000mm"/);
  assert.match(svg, /height="10\.000mm"/);
  assert.match(svg, /stroke="#0000ff"/);
  assert.doesNotMatch(svg, /M5\.000,5\.000/);
});
