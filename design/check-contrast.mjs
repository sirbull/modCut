#!/usr/bin/env node
// WCAG contrast guardrail for the modCut design system.
// Parses hex tokens out of tokens.css and asserts every text/background pair.
// Run: node design/check-contrast.mjs   (exits non-zero on any AA failure)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "tokens.css"), "utf8");

// Pull "--name: #rrggbb;" declarations (first/light-theme occurrence wins).
const tokens = {};
for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
  if (!(m[1] in tokens)) tokens[m[1]] = m[2];
}

const srgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = srgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const L = [lum(a), lum(b)].sort((x, y) => y - x); return (L[0] + 0.05) / (L[1] + 0.05); };

// [fg, bg, minRatio, label]  (AA normal text = 4.5; AA large/bold = 3.0)
const PAIRS = [
  ["text", "bg", 4.5, "body text on background"],
  ["text", "surface", 4.5, "body text on panel"],
  ["text-muted", "bg", 4.5, "muted text on background"],
  ["text-muted", "surface", 4.5, "muted text on panel"],
  ["on-brand", "brand-fill", 4.5, "white text on filled button bottom"],
  ["on-brand", "brand-fill-top", 4.5, "white text on filled button top"],
  ["text", "brand", 4.5, "dark text on profile gradient bottom"],
  ["text", "brand-mid", 4.5, "dark text on profile gradient top"],
  ["text", "lime-bright", 4.5, "dark text on pale mint"],
  ["bg", "brand-deep", 4.5, "white/background text on --brand-deep"],
  ["bg", "danger", 4.5, "white text on --danger"],
  ["brand-deep", "bg", 4.5, "link / active green on background"],
  ["text", "lime", 4.5, "text on --lime accent (must be near-black)"],
  ["brand-deep", "lime", 3.0, "LARGE green text on lime (large only)"],
];

let failed = 0;
console.log("modCut WCAG contrast check\n" + "=".repeat(52));
for (const [fg, bg, min, label] of PAIRS) {
  const cfg = tokens[fg], cbg = tokens[bg];
  if (!cfg || !cbg) { console.log(`?? MISSING token ${fg}/${bg}`); failed++; continue; }
  const r = ratio(cfg, cbg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1 (>=${min})  ${label}`);
}
console.log("=".repeat(52));
console.log(failed ? `${failed} FAILURE(S)` : "All contrast pairs pass WCAG AA.");
process.exit(failed ? 1 : 0);
