// SVG import — the headline fix over VisiCut.
// We lean on the webview's own SVG/CSS engine: parse to a DOM, and read *resolved*
// colors (getComputedStyle handles Illustrator's <style>.cls-1{} classes) and real
// physical size (viewBox + unit math, not DPI string-sniffing).

const MM_PER_PX = 25.4 / 96; // CSS reference: 96px = 1 inch

/** Convert an SVG width/height attribute to millimetres. Pure — unit-tested. */
export function lengthToMm(value, viewBoxDim, unitlessUnitsPerInch = 96) {
  const s = (value || "").trim();
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*(mm|cm|in|pt|pc|px|%)?$/);
  if (m && m[2] !== "%") {
    const n = parseFloat(m[1]);
    switch (m[2]) {
      case "mm": return n;
      case "cm": return n * 10;
      case "in": return n * 25.4;
      case "pt": return n * (25.4 / 72);
      case "pc": return n * (25.4 / 6);
      case "px": return n * MM_PER_PX;
      default:   return n * (25.4 / unitlessUnitsPerInch);
    }
  }
  // "%", missing, or unparseable -> fall back to the viewBox extent.
  if (viewBoxDim != null) return viewBoxDim * (25.4 / unitlessUnitsPerInch);
  return null;
}

/** Parse SVG text -> { svg (node in THIS document), widthMm, heightMm, viewBox }. */
export function parseSVG(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("Ugyldig SVG-fil");
  const src = doc.documentElement;
  if (src.tagName.toLowerCase() !== "svg") throw new Error("Ikke en SVG-fil");

  const vb = (src.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const viewBox = vb.length === 4 && vb.every((n) => !Number.isNaN(n)) ? vb : null;

  // Illustrator stores a width-less artboard viewBox in PostScript points
  // (72 units/in), while ordinary SVG/CSS unitless coordinates use 96 px/in.
  const unitlessUnitsPerInch = /Adobe Illustrator/i.test(text) ? 72 : 96;
  const widthMm = lengthToMm(src.getAttribute("width"), viewBox ? viewBox[2] : null, unitlessUnitsPerInch);
  const heightMm = lengthToMm(src.getAttribute("height"), viewBox ? viewBox[3] : null, unitlessUnitsPerInch);

  const svg = document.importNode(src, true);
  return { svg, widthMm, heightMm, viewBox };
}

const SHAPE_SEL = "path,rect,circle,ellipse,line,polyline,polygon,text";

/** Distinct operation-colors in an ATTACHED svg, most-used first: [{color,count}]. */
export function extractColors(svgEl) {
  const counts = new Map();
  for (const el of svgEl.querySelectorAll(SHAPE_SEL)) {
    const cs = getComputedStyle(el);
    const color = pickColor(cs.stroke) || pickColor(cs.fill); // stroke = cut lines first
    if (!color) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Full import prep: parse -> attach hidden -> read colors + inline the *resolved*
 * stroke/fill/stroke-width onto every element (so Paper.js renders Illustrator's
 * CSS-class colors faithfully) -> detach. Returns a node ready for importSVG.
 */
export function prepareSVG(text) {
  const { svg, widthMm, heightMm, viewBox } = parseSVG(text);
  // Paper.js parses the numeric part of physical SVG lengths but ignores their
  // unit. Give it a unitless millimetre viewport so viewBox coordinates become
  // project millimetres without scaling the artwork bounds to the whole page.
  if (viewBox && widthMm > 0 && heightMm > 0) {
    svg.setAttribute("width", String(widthMm));
    svg.setAttribute("height", String(heightMm));
  }
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden";
  holder.appendChild(svg);
  document.body.appendChild(holder);
  const colors = extractColors(svg);
  inlineColors(svg);
  stripClipping(svg);
  holder.remove(); // detached node is still valid for paper.project.importSVG
  return { node: svg, widthMm, heightMm, viewBox, colors };
}

function inlineColors(svgEl) {
  // Only colors — NOT stroke-width. getComputedStyle resolves stroke-width to used
  // px scaled by the SVG's width/viewBox ratio, which inflates it. Paper.js reads
  // the real stroke-width straight from the file's attributes/inline style.
  for (const el of svgEl.querySelectorAll(SHAPE_SEL)) {
    const cs = getComputedStyle(el);
    if (cs.stroke && cs.stroke !== "none") el.setAttribute("stroke", cs.stroke);
    if (cs.fill) el.setAttribute("fill", cs.fill);
  }
}

function stripClipping(svgEl) {
  svgEl.querySelectorAll("clipPath,mask").forEach((el) => el.remove());
  for (const el of svgEl.querySelectorAll("*")) {
    el.removeAttribute("clip-path");
    el.removeAttribute("mask");
    el.removeAttribute("overflow");
    const style = el.getAttribute("style");
    if (!style) continue;
    const cleaned = style
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !/^(clip-path|mask|overflow)\s*:/i.test(part))
      .join("; ");
    cleaned ? el.setAttribute("style", cleaned) : el.removeAttribute("style");
  }
  svgEl.setAttribute("overflow", "visible");
}

function pickColor(v) {
  if (!v || v === "none") return null;
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
  if (parseFloat(a) === 0) return null; // fully transparent
  const hex = (n) => (+n).toString(16).padStart(2, "0");
  return "#" + hex(r) + hex(g) + hex(b);
}
