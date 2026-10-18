import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";

import { epsToSvg } from "./epsimport.js";
import { epsDocument } from "./draw/io/eps.mjs";

const eps = (body, box = "0 0 100 50") => `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: ${box}\n%%EndComments\n${body}\n%%EOF\n`;
const paths = (svg) => [...svg.matchAll(/<path d="([^"]+)"([^>]*)\/>/g)].map((m) => ({ d: m[1], attrs: m[2] }));

test("EPS paths and colours become an SVG in points, flipped to y down", () => {
  const { svg, count, widthMm, warnings } = epsToSvg(eps("newpath 10 10 moveto 90 10 lineto 90 40 lineto closepath 1 0 0 setrgbcolor fill"));
  assert.equal(count, 1); assert.deepEqual(warnings, []);
  assert.match(svg, /width="100pt" height="50pt" viewBox="0 0 100 50"/);
  assert.match(svg, /<g transform="matrix\(1 0 0 -1 0 50\)">/);
  assert.deepEqual(paths(svg).map((p) => p.d), ["M10 10L90 10L90 40Z"]);
  assert.match(svg, /fill="#ff0000"/);
  assert.ok(Math.abs(widthMm - 100 * 25.4 / 72) < 1e-9);
});

test("procedures, definitions, loops and transforms run", () => {
  const { svg, count } = epsToSvg(eps(`/box { newpath 0 0 moveto 10 0 rlineto 0 10 rlineto -10 0 rlineto closepath } bind def
    0 1 2 { gsave 20 mul 5 translate box 0 0 1 setrgbcolor fill grestore } for
    /n 0 def 4 { /n n 1 add def } repeat n 4 eq { 0.5 setgray 0 0 moveto 1 1 lineto stroke } if`));
  assert.equal(count, 4);
  assert.deepEqual(paths(svg).slice(0, 3).map((p) => p.d), ["M0 5L10 5L10 15L0 15Z", "M20 5L30 5L30 15L20 15Z", "M40 5L50 5L50 15L40 15Z"]);
  assert.match(paths(svg)[3].attrs, /stroke="#808080"/);
});

test("arcs are curves and stroke widths follow the scale; dashes and caps carry over", () => {
  const { svg } = epsToSvg(eps("2 2 scale 1 setlinewidth 1 setlinecap [2 1] 0 setdash 25 12 10 0 360 arc stroke"));
  const [circle] = paths(svg);
  assert.equal((circle.d.match(/C/g) ?? []).length, 4);
  assert.match(circle.attrs, /stroke-width="2"/); assert.match(circle.attrs, /stroke-linecap="round"/); assert.match(circle.attrs, /stroke-dasharray="4 2"/);
});

test("CMYK, HSB and separation colours become RGB", () => {
  const { svg } = epsToSvg(eps(`0 1 1 0 setcmykcolor 0 0 10 10 rectfill
    0 1 1 sethsbcolor 0 0 10 10 rectfill
    [/Separation (Spot) /DeviceCMYK { 0 0 0 }] setcolorspace 1 setcolor 0 0 10 10 rectfill`));
  assert.deepEqual(paths(svg).map((p) => p.attrs.match(/fill="([^"]+)"/)[1]), ["#ff0000", "#ff0000", "#00ffff"]);
});

test("clipping becomes an SVG clip path", () => {
  const { svg } = epsToSvg(eps("gsave 0 0 50 50 rectclip 0 0 100 100 rectfill grestore 60 0 10 10 rectfill"));
  assert.match(svg, /<clipPath id="eps-clip-1"><path d="M0 0L50 0L50 50L0 50Z"\/><\/clipPath>/);
  const [inside, outside] = paths(svg).filter((p) => !p.d.startsWith("M0 0L50"));
  assert.match(inside.attrs, /clip-path="url\(#eps-clip-1\)"/); assert.doesNotMatch(outside.attrs, /clip-path/);
});

test("Illustrator EPS draws with the built-in operators, its prolog skipped, with layers and compound paths", () => {
  const { svg, warnings } = epsToSvg(`%!PS-Adobe-3.0 EPSF-3.0
%%Creator: Adobe Illustrator(R) 8.0
%%BoundingBox: 0 0 200 100
%AI5_FileFormat 4.0
%%EndComments
%%BeginProlog
%%BeginResource: procset Adobe_Illustrator_AI5 1.3 0
this procset { would not run here
%%EndResource
%%EndProlog
%%BeginSetup
Adobe_Illustrator_AI5 /initialize get exec
%%EndSetup
%AI5_BeginLayer
1 1 1 1 0 0 0 79 128 255 Lb
(Cut lines) Ln
0 A
0 0 0 1 k 0 1 0 0 K 2 w
10 10 m 50 10 L 50 40 L 10 40 L b
*u
1 XR
0 0 1 0 k
100 10 m 190 10 L 190 90 L 100 90 L f
120 30 m 170 30 L 170 70 L 120 70 L f
*U
0 To 1 0 0 1 10 10 0 Tp (Hello) Tx TO
LB
%AI5_EndLayer--
%%PageTrailer
gsave annotatepage grestore showpage
%%Trailer
Adobe_Illustrator_AI5 /terminate get exec
%%EOF
`);
  assert.match(svg, /<g id="Cut_lines" data-name="Cut lines">/);
  const all = paths(svg);
  assert.equal(all.length, 3, "A filled and stroked path is a fill and a stroke; the compound path is one path");
  assert.match(all[0].attrs, /fill="#000000"/); assert.match(all[1].attrs, /stroke="#ff00ff" stroke-width="2"/);
  assert.equal((all[2].d.match(/M/g) ?? []).length, 2); assert.match(all[2].attrs, /fill="#ffff00" fill-rule="evenodd"/);
  assert.ok(warnings.some((w) => /Text in fonts other than Type 3 is not imported/.test(w)));
  assert.ok(!warnings.some((w) => /Skipped PostScript operators/.test(w)), warnings.join("\n"));
});

test("modCut's own EPS export comes back with its layers, curves and image", () => {
  const segments = [[5, 5], [35, 5], [35, 25], [5, 25]].map((p) => ({ p, in: p, out: p }));
  const model = { width: 40, height: 30, name: "Card", warnings: [], layers: [
    { name: "Cut", items: [{ type: "path", opacity: 1, blend: "normal", fillRule: "evenodd", fill: { rgb: [0, 0, 1], alpha: 1 }, stroke: { rgb: [1, 0, 0], alpha: 1, width: .5, cap: "round", join: "round", miter: 4, dash: [], dashOffset: 0 }, subpaths: [{ closed: true, segments }] }] },
    { name: "Photo", items: [{ type: "image", opacity: 1, blend: "normal", width: 2, height: 1, rgba: Uint8Array.of(255, 0, 0, 255, 0, 255, 0, 255), matrix: [10, 0, 0, 5, 2, 2] }] }] };
  const { svg, warnings, count } = epsToSvg(epsDocument(model).text);
  assert.deepEqual(warnings, []); assert.equal(count, 3);
  assert.match(svg, /<g id="Cut" data-name="Cut">/); assert.match(svg, /<g id="Photo" data-name="Photo">/);
  assert.match(svg, /fill="#0000ff" fill-rule="evenodd"/); assert.match(svg, /stroke="#ff0000" stroke-width="1\.417" stroke-linecap="round"/);
  const png = svg.match(/href="data:image\/png;base64,([^"]+)"/)[1], bytes = Buffer.from(png, "base64");
  assert.equal(bytes.readUInt32BE(16), 2); assert.equal(bytes.readUInt32BE(20), 1);
  const idat = bytes.indexOf("IDAT"), length = bytes.readUInt32BE(idat - 4), pixels = inflateSync(bytes.subarray(idat + 4, idat + 4 + length));
  assert.deepEqual([...pixels], [0, 255, 0, 0, 255, 0, 255, 0, 255]);
});

test("a DOS binary EPS header is skipped; errors and unknown operators are warnings, not failures", () => {
  const ps = eps("0 0 10 10 rectfill frobnicate 1 2 3 0 0 moveto 1 0 div");
  const header = Buffer.alloc(30); header.writeUInt32BE(0xc5d0d3c6, 0); header.writeUInt32LE(30, 4); header.writeUInt32LE(ps.length, 8);
  const { svg, warnings } = epsToSvg(header.toString("latin1") + ps + "\0\0binary preview");
  assert.equal(paths(svg).length, 1);
  assert.ok(warnings.some((w) => /frobnicate/.test(w))); assert.ok(warnings.some((w) => /undefinedresult/.test(w)));
  assert.throws(() => epsToSvg("not postscript"), /not a PostScript/);
});

test("only the first page of a PostScript file is drawn; runaway loops stop", () => {
  const { svg, warnings } = epsToSvg("%!PS-Adobe-3.0\n%%Pages: 2\n%%Page: 1 1\n0 0 10 10 rectfill showpage\n%%Page: 2 2\n20 20 10 10 rectfill showpage\n");
  assert.equal(paths(svg).length, 1); assert.ok(warnings.some((w) => /first page/.test(w)));
  const loop = epsToSvg(eps("0 0 10 10 rectfill { 1 pop } loop"));
  assert.ok(loop.warnings.some((w) => /runs too long/.test(w)));
});
