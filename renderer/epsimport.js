// EPS / PostScript -> SVG for import. A small PostScript interpreter: operand, dictionary and graphics
// state stacks, procedures and control flow, paths, colours (gray, RGB, CMYK, HSB), transforms, clipping
// and 8-bit images (hex, ASCII85 or binary data). Illustrator's own drawing operators (m, L, C, f, S, k,
// Xa, *u ...) are built in, so AI-format EPS files draw even when their procset is missing. Text is not
// drawn (fonts are not available here); a warning says so. Only the first page of a PostScript file is used.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const fmt = (v) => { const s = (Math.round(v * 1000) / 1000).toString(); return s === "-0" ? "0" : s; };
const MARK = { t: "mark" }, NULL = { t: "null" };
const EXIT = Symbol("exit"), STOP = Symbol("stop"), QUIT = Symbol("quit");
const MAX_STEPS = 20_000_000;

class PSError extends Error { constructor(name, detail = "") { super(`${name}${detail ? `: ${detail}` : ""}`); this.psName = name; } }
const name = (v, lit = false) => ({ t: "name", v, lit });
const str = (v) => ({ t: "str", v });
const isNum = (v) => typeof v === "number";

// --- Matrices: [a b c d e f], x' = a x + c y + e, y' = b x + d y + f -----------------------------------------
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const invert = (m) => { const d = m[0] * m[3] - m[1] * m[2]; if (!d) throw new PSError("undefinedresult", "singular matrix"); return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };

// --- Tokenizer over the file text; `pos` is shared with currentfile reads ----------------------------------
function scanner(text, onComment) {
  const s = { text, pos: 0 };
  const DELIM = "()<>[]{}/%";
  const white = (c) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  s.next = function next() {
    for (;;) {
      while (s.pos < text.length && white(text[s.pos])) s.pos++;
      if (s.pos >= text.length) return null;
      const c = text[s.pos];
      if (c === "%") { const end = text.indexOf("\n", s.pos); const line = text.slice(s.pos, end < 0 ? text.length : end).replace(/\r$/, ""); s.pos = end < 0 ? text.length : end + 1; if (onComment(line, s) === QUIT) return null; continue; }
      if (c === "(") return { tok: str(readString()) };
      if (c === "<") {
        if (text[s.pos + 1] === "<") { s.pos += 2; return { tok: name("<<") }; }
        if (text[s.pos + 1] === "~") { s.pos += 2; const end = text.indexOf("~>", s.pos); const body = text.slice(s.pos, end < 0 ? text.length : end); s.pos = end < 0 ? text.length : end + 2; return { tok: str(ascii85(body)) }; }
        s.pos++; const end = text.indexOf(">", s.pos); const body = text.slice(s.pos, end < 0 ? text.length : end); s.pos = end < 0 ? text.length : end + 1; return { tok: str(hex(body)) };
      }
      if (c === ">" && text[s.pos + 1] === ">") { s.pos += 2; return { tok: name(">>") }; }
      if (c === "[" || c === "]") { s.pos++; return { tok: name(c) }; }
      if (c === "{") { s.pos++; return { open: true }; }
      if (c === "}") { s.pos++; return { close: true }; }
      let start = s.pos, lit = false, immediate = false;
      if (c === "/") { lit = true; s.pos++; if (text[s.pos] === "/") { immediate = true; lit = false; s.pos++; } start = s.pos; }
      while (s.pos < text.length && !white(text[s.pos]) && !DELIM.includes(text[s.pos])) s.pos++;
      if (s.pos === start && !lit) { s.pos++; continue; }
      const word = text.slice(start, s.pos);
      if (!lit && !immediate) { const n = number(word); if (n !== null) return { tok: n }; }
      return { tok: name(word, lit), immediate };
    }
  };
  function readString() {
    let depth = 1, out = ""; s.pos++;
    while (s.pos < text.length) {
      const c = text[s.pos++];
      if (c === "\\") {
        const e = text[s.pos++];
        if (e === "\n") continue; if (e === "\r") { if (text[s.pos] === "\n") s.pos++; continue; }
        if (/[0-7]/.test(e)) { let o = e; while (o.length < 3 && /[0-7]/.test(text[s.pos])) o += text[s.pos++]; out += String.fromCharCode(parseInt(o, 8) & 255); continue; }
        out += { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[e] ?? e; continue;
      }
      if (c === "(") depth++; else if (c === ")" && --depth === 0) break;
      out += c;
    }
    return out;
  }
  return s;
}
function number(word) {
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(word)) return Number(word);
  const radix = word.match(/^(\d+)#([0-9a-zA-Z]+)$/);
  if (radix && +radix[1] >= 2 && +radix[1] <= 36) { const v = parseInt(radix[2], +radix[1]); return Number.isNaN(v) ? null : v; }
  return null;
}
function hex(body) {
  const digits = body.replace(/[^0-9a-fA-F]/g, ""); let out = "";
  for (let i = 0; i < digits.length; i += 2) out += String.fromCharCode(parseInt((digits[i] + (digits[i + 1] ?? "0")), 16));
  return out;
}
function ascii85(body) {
  const chars = body.replace(/\s/g, ""); let out = "", group = [];
  const flush = (n) => { while (group.length < 5) group.push(84); let v = 0; for (const g of group) v = v * 85 + g; const bytes = [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out += String.fromCharCode(...bytes.slice(0, n)); group = []; };
  for (const c of chars) {
    if (c === "z" && !group.length) { out += "\0\0\0\0"; continue; }
    const v = c.charCodeAt(0) - 33; if (v < 0 || v > 84) continue;
    group.push(v); if (group.length === 5) flush(4);
  }
  if (group.length) flush(group.length - 1);
  return out;
}

// --- PNG writer (stored deflate) for images ---------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function pngDataUrl(width, height, rgba) {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const blocks = []; let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  for (let i = 0; i < raw.length || i === 0; i += 65535) { const part = raw.subarray(i, i + 65535), last = i + 65535 >= raw.length; blocks.push(Uint8Array.of(last ? 1 : 0, part.length & 255, part.length >> 8, ~part.length & 255, (~part.length >> 8) & 255), part); if (last) break; }
  const zlib = [Uint8Array.of(0x78, 1), ...blocks, Uint8Array.of(b >> 8, b & 255, a >> 8, a & 255)];
  const chunk = (type, parts) => {
    const length = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(12 + length), view = new DataView(out.buffer);
    view.setUint32(0, length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    let at = 8; for (const p of parts) { out.set(p, at); at += p.length; }
    let c = 0xffffffff; for (let i = 4; i < 8 + length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
    view.setUint32(8 + length, (c ^ 0xffffffff) >>> 0); return out;
  };
  const header = new Uint8Array(13), hv = new DataView(header.buffer); hv.setUint32(0, width); hv.setUint32(4, height); header.set([8, 6, 0, 0, 0], 8);
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk("IHDR", [header]), chunk("IDAT", zlib), chunk("IEND", [])];
  let bin = ""; for (const p of parts) for (let i = 0; i < p.length; i += 8192) bin += String.fromCharCode(...p.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(bin)}`;
}

// --- Colour -----------------------------------------------------------------------------------------------
const clamp01 = (v) => Math.min(1, Math.max(0, +v || 0));
const cmykToRgb = (c, m, y, k) => [1 - Math.min(1, clamp01(c) + clamp01(k)), 1 - Math.min(1, clamp01(m) + clamp01(k)), 1 - Math.min(1, clamp01(y) + clamp01(k))];
function hsbToRgb(h, s, v) {
  h = (clamp01(h) * 6) % 6; const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
}
const css = (rgb) => "#" + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("");

/** PostScript text (EPS, possibly with a DOS binary header) to SVG in points. */
export function epsToSvg(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xc5 && text.charCodeAt(1) === 0xd0 && text.charCodeAt(2) === 0xd3 && text.charCodeAt(3) === 0xc6) {
    const u32 = (at) => (text.charCodeAt(at) | (text.charCodeAt(at + 1) << 8) | (text.charCodeAt(at + 2) << 16) | (text.charCodeAt(at + 3) << 24)) >>> 0;
    text = text.substr(u32(4), u32(8));
  }
  if (!/^\s*%!/.test(text)) throw new Error("This is not a PostScript or EPS file.");
  const warnings = new Set(), unknown = new Set();
  const illustrator = /^%AI\d_|^%%Creator:.*Illustrator/m.test(text) && /procset\s+Adobe_Illustrator|%AI[35]_/.test(text) && !/Adobe_AGM_Core/.test(text);
  const box = (() => {
    for (const key of ["%%HiResBoundingBox:", "%%BoundingBox:"]) {
      const all = [...text.matchAll(new RegExp(`^${key}\\s*([-\\d.eE+]+)\\s+([-\\d.eE+]+)\\s+([-\\d.eE+]+)\\s+([-\\d.eE+]+)`, "gm"))];
      if (all.length) { const m = all.at(-1); return [1, 2, 3, 4].map((i) => Number(m[i])); }
    }
    return null;
  })();

  // Layers: groups of SVG elements; Illustrator layers (Ln) and modCut layer comments start new ones.
  const layers = [{ name: null, items: [] }], defs = [];
  let groupStack = [layers[0].items], pageDone = false, painted = 0, clipCount = 0, extent = null;
  const startLayer = (layerName) => { const layer = { name: layerName, items: [] }; layers.push(layer); groupStack = [layer.items]; };
  const emit = (svg) => groupStack.at(-1).push(svg);
  const grow = (x, y) => { if (!extent) extent = [x, y, x, y]; else { extent[0] = Math.min(extent[0], x); extent[1] = Math.min(extent[1], y); extent[2] = Math.max(extent[2], x); extent[3] = Math.max(extent[3], y); } };

  let skipping = false;
  const onComment = (line) => {
    if (pageDone) return QUIT;
    if (/^%%modCut layer: /.test(line)) startLayer(line.slice(16));
    // Illustrator files: their procset is replaced by the built-in operators, so the prolog and setup are skipped.
    if (illustrator && /^%%BeginProlog|^%%BeginSetup/.test(line)) skipping = true;
    if (illustrator && /^%%EndProlog|^%%EndSetup/.test(line)) skipping = false;
    if (/^%%Trailer|^%%EOF|^%AI5_BeginPalette|^%%PageTrailer/.test(line) && illustrator) return QUIT;
    if (/^%%Page:/.test(line) && painted) { pageDone = true; return QUIT; }
    return undefined;
  };
  const sc = scanner(text, onComment);

  // --- Interpreter state ---
  const os = [], gstack = [];
  let gs = { ctm: [1, 0, 0, 1, 0, 0], fill: [0, 0, 0], stroke: [0, 0, 0], space: "DeviceGray", lineWidth: 1, cap: 0, join: 0, miter: 10, dash: [], dashOffset: 0, path: [], point: null, clip: null, fillRule: "nonzero", font: null };
  const copyGs = (g) => ({ ...g, ctm: [...g.ctm], path: g.path.map((p) => [...p]), dash: [...g.dash] });
  const pop = () => { if (!os.length) throw new PSError("stackunderflow"); return os.pop(); };
  const popNum = () => { const v = pop(); if (!isNum(v)) throw new PSError("typecheck", "number expected"); return v; };
  const nums = (n) => { const out = new Array(n); for (let i = n - 1; i >= 0; i--) out[i] = popNum(); return out; };
  const push = (...v) => os.push(...v);
  const dict = (entries = []) => ({ t: "dict", m: new Map(entries) });
  const systemdict = dict(), aiDict = dict(), userdict = dict(), globaldict = dict(), statusdict = dict();
  const ds = [aiDict, systemdict, globaldict, userdict];
  const keyOf = (k) => (k && k.t === "name") ? "/" + k.v : (k && k.t === "str") ? "/" + k.v : typeof k === "object" ? k : String(k);
  const lookup = (key) => { for (let i = ds.length - 1; i >= 0; i--) if (ds[i].m.has(key)) return ds[i].m.get(key); return undefined; };
  const op = (names, f) => { for (const n of names.split(" ")) systemdict.m.set("/" + n, { t: "op", f, n }); };
  const ai = (names, f) => { for (const n of names.split(" ")) aiDict.m.set("/" + n, { t: "op", f, n }); };
  let steps = 0;

  function execName(n) {
    const v = lookup("/" + n.v);
    if (v === undefined) {
      // Unknown operators: Illustrator's private ones take their operands from the line before them.
      // Illustrator's procset dictionaries (Adobe_Illustrator_AI5 begin ...) stand in as empty ones.
      if (/^Adobe_/.test(n.v)) { push(dict()); return; }
      unknown.add(n.v); os.length = 0; return;
    }
    exec(v);
  }
  function exec(v) {
    if (++steps > MAX_STEPS) throw new PSError("limitcheck", "the file runs too long");
    if (v && v.t === "op") return v.f();
    if (v && v.t === "proc") return run(v.v);
    if (v && v.t === "name" && !v.lit) return execName(v);
    push(v);
  }
  function run(list) {
    for (const item of list) {
      if (item && item.t === "name" && !item.lit) execName(item);
      else push(item);
    }
  }
  const asProc = (v) => { if (v && v.t === "proc") return v; throw new PSError("typecheck", "procedure expected"); };
  const call = (proc) => (proc.t === "proc" ? run(proc.v) : exec(proc));

  // Paths are kept in device space (points, y up).
  const userPoint = () => { if (!gs.point) throw new PSError("nocurrentpoint"); return apply(invert(gs.ctm), ...gs.point); };
  const moveTo = (x, y) => { const p = apply(gs.ctm, x, y); gs.path.push(["M", ...p]); gs.point = p; };
  const lineTo = (x, y) => { if (!gs.point) throw new PSError("nocurrentpoint"); const p = apply(gs.ctm, x, y); gs.path.push(["L", ...p]); gs.point = p; };
  const curveTo = (x1, y1, x2, y2, x3, y3) => { if (!gs.point) throw new PSError("nocurrentpoint"); const a = apply(gs.ctm, x1, y1), b = apply(gs.ctm, x2, y2), c = apply(gs.ctm, x3, y3); gs.path.push(["C", ...a, ...b, ...c]); gs.point = c; };
  const closePath = () => { if (!gs.path.length) return; gs.path.push(["Z"]); for (let i = gs.path.length - 1; i >= 0; i--) if (gs.path[i][0] === "M") { gs.point = [gs.path[i][1], gs.path[i][2]]; break; } };
  function arc(cx, cy, r, a1, a2, negative) {
    const rad = Math.PI / 180;
    if (negative) { while (a2 > a1) a2 -= 360; } else { while (a2 < a1) a2 += 360; }
    const start = [cx + r * Math.cos(a1 * rad), cy + r * Math.sin(a1 * rad)];
    if (gs.point) lineTo(...start); else moveTo(...start);
    const pieces = Math.max(1, Math.ceil(Math.abs(a2 - a1) / 90)), step = (a2 - a1) / pieces * rad;
    for (let i = 0; i < pieces; i++) {
      const t0 = a1 * rad + i * step, t1 = t0 + step, k = 4 / 3 * Math.tan(step / 4) * r;
      curveTo(cx + r * Math.cos(t0) - k * Math.sin(t0), cy + r * Math.sin(t0) + k * Math.cos(t0), cx + r * Math.cos(t1) + k * Math.sin(t1), cy + r * Math.sin(t1) - k * Math.cos(t1), cx + r * Math.cos(t1), cy + r * Math.sin(t1));
    }
  }
  const pathData = (path) => path.map(([c, ...v]) => c + v.map(fmt).join(" ")).join("");
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const clipAttr = () => gs.clip ? ` clip-path="url(#${gs.clip})"` : "";
  function paint(kind, evenodd = false) {
    if (pageDone || measuring) { gs.path = []; gs.point = null; return; }
    if (gs.path.every((seg) => seg[0] === "M")) return;
    for (const seg of gs.path) for (let i = 1; i + 1 < seg.length; i += 2) grow(seg[i], seg[i + 1]);
    const d = pathData(gs.path);
    if (kind === "fill") emit(`<path d="${d}" fill="${css(gs.fill)}"${evenodd ? ' fill-rule="evenodd"' : ""} stroke="none"${clipAttr()}/>`);
    else {
      const width = gs.lineWidth * scaleOf(gs.ctm), dash = gs.dash.length && gs.dash.some((v) => v > 0) ? ` stroke-dasharray="${gs.dash.map((v) => fmt(v * scaleOf(gs.ctm))).join(" ")}" stroke-dashoffset="${fmt(gs.dashOffset * scaleOf(gs.ctm))}"` : "";
      emit(`<path d="${d}" fill="none" stroke="${css(gs.stroke)}" stroke-width="${fmt(Math.max(width, 0.01))}" stroke-linecap="${["butt", "round", "square"][gs.cap] ?? "butt"}" stroke-linejoin="${["miter", "round", "bevel"][gs.join] ?? "miter"}" stroke-miterlimit="${fmt(Math.max(1, gs.miter))}"${dash}${clipAttr()}/>`);
    }
    painted++;
  }
  const newPath = () => { gs.path = []; gs.point = null; };
  function clip(evenodd) {
    if (!gs.path.length) return;
    const id = `eps-clip-${++clipCount}`;
    defs.push(`<clipPath id="${id}"${gs.clip ? ` clip-path="url(#${gs.clip})"` : ""}><path d="${pathData(gs.path)}"${evenodd ? ' clip-rule="evenodd"' : ""}/></clipPath>`);
    gs.clip = id;
  }
  const setColor = (rgb, which = "both") => { if (which !== "stroke") gs.fill = rgb; if (which !== "fill") gs.stroke = rgb; };
  function colorFrom(space, values) {
    if ((space === "Separation" || space === "DeviceN") && gs.tint) {
      // Run the tint transform into the alternative space.
      const depth = os.length; push(...values);
      try { run(gs.tint.proc.v); const n = components(gs.tint.alt), out = os.splice(os.length - n, n); if (out.length === n && out.every(isNum)) return colorFrom(gs.tint.alt, out); }
      catch (error) { if (!(error instanceof PSError)) throw error; } finally { os.length = Math.min(os.length, depth); }
    }
    if (space === "DeviceRGB" || space === "CalRGB") return values.slice(0, 3);
    if (space === "DeviceCMYK") return cmykToRgb(...values);
    if (space === "Separation" || space === "DeviceN") { const t = clamp01(Math.max(...values)); return [1 - t, 1 - t, 1 - t]; }
    const g = clamp01(values[0]); return [g, g, g];
  }
  const components = (space) => ({ DeviceRGB: 3, CalRGB: 3, DeviceCMYK: 4 })[space] ?? 1;

  // Images: 8-bit (or 1-bit gray) samples to an SVG image placed by CTM x inverse(ImageMatrix).
  function readSource(source, bytes) {
    let out = "";
    if (source && source.t === "str") { while (out.length < bytes && source.v.length) out += source.v; return out.slice(0, bytes); }
    if (source && source.t === "file") return readFile(source, bytes);
    if (source && source.t === "proc") { for (let guard = 0; out.length < bytes && guard < 1e6; guard++) { run(source.v); const v = pop(); if (!v || v.t !== "str" || !v.v.length) break; out += v.v; } return out; }
    throw new PSError("typecheck", "image data source");
  }
  function readFile(file, bytes) {
    let out = "";
    if (file.filter === "hex") {
      const digits = []; while (digits.length < bytes * 2 && sc.pos < text.length) { const c = text[sc.pos++]; if (c === ">") break; if (/[0-9a-fA-F]/.test(c)) digits.push(c); }
      for (let i = 0; i < digits.length; i += 2) out += String.fromCharCode(parseInt(digits[i] + (digits[i + 1] ?? "0"), 16));
      return out;
    }
    if (file.filter === "a85") { const end = text.indexOf("~>", sc.pos); const body = text.slice(sc.pos, end < 0 ? text.length : end); sc.pos = end < 0 ? text.length : end + 2; return ascii85(body).slice(0, bytes); }
    if (file.filter) throw new PSError("undefined", `${file.filter} images`);
    if (text[sc.pos] === "\r" || text[sc.pos] === "\n" || text[sc.pos] === " ") sc.pos++;
    out = text.substr(sc.pos, bytes); sc.pos += out.length; return out;
  }
  function image({ width, height, bits, matrix, source, space, decode = null, mask = false, polarity = false, multi = null }) {
    if (!(width > 0 && height > 0)) return;
    const n = mask ? 1 : components(space), rowBytes = Math.ceil(width * n * bits / 8);
    let data;
    if (multi) { const planes = multi.map((src) => readSource(src, rowBytes / n * height)); data = ""; for (let i = 0; i < width * height; i++) for (const p of planes) data += p[i] ?? "\0"; }
    else data = readSource(source, rowBytes * height);
    if (pageDone) return;
    if (bits !== 8 && bits !== 1) { warnings.add(`${bits}-bit images are not imported.`); return; }
    const rgba = new Uint8Array(width * height * 4), max = (1 << bits) - 1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const values = [];
      for (let k = 0; k < n; k++) {
        const index = x * n + k;
        const raw = bits === 8 ? data.charCodeAt(y * rowBytes + index) || 0 : ((data.charCodeAt(y * rowBytes + (index >> 3)) || 0) >> (7 - (index & 7))) & 1;
        let v = raw / max; if (decode) v = decode[2 * k] + v * (decode[2 * k + 1] - decode[2 * k]); values.push(v);
      }
      const at = (y * width + x) * 4;
      if (mask) { const paintIt = (values[0] >= .5) === polarity; rgba.set([...gs.fill.map((c) => Math.round(c * 255)), paintIt ? 255 : 0], at); }
      else rgba.set([...colorFrom(space, values).map((c) => Math.round(clamp01(c) * 255)), 255], at);
    }
    const m = mul(invert(matrix), gs.ctm);
    for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) grow(...apply(m, x, y));
    // The clip goes on a wrapper: an element's own transform would apply to its clip path too.
    const element = `<image width="${width}" height="${height}" preserveAspectRatio="none" transform="matrix(${m.map(fmt).join(" ")})" href="${pngDataUrl(width, height, rgba)}"/>`;
    emit(gs.clip ? `<g${clipAttr()}>${element}</g>` : element);
    painted++;
  }
  const dictGet = (d, key, fallback) => d.m.has("/" + key) ? d.m.get("/" + key) : fallback;
  const arrayOf = (v) => (v && v.t === "proc") ? v.v : Array.isArray(v) ? v : null;

  // --- Operators ---
  op("pop", () => pop()); op("exch", () => { const b = pop(), a = pop(); push(b, a); });
  op("dup", () => { const a = pop(); push(a, a); });
  op("copy", () => { const top = pop(); if (isNum(top)) { if (top > os.length) throw new PSError("stackunderflow"); push(...os.slice(os.length - top)); } else { const src = pop(), a = arrayOf(src); const b = arrayOf(top); if (a && b) { b.splice(0, a.length, ...a); push(top); } else if (src.t === "dict") { for (const [k, v] of src.m) top.m.set(k, v); push(top); } else push(top); } });
  op("index", () => { const n = popNum(); if (n >= os.length) throw new PSError("rangecheck"); push(os[os.length - 1 - n]); });
  op("roll", () => { const j = popNum(), n = popNum(); if (n > os.length) throw new PSError("stackunderflow"); if (!n) return; const part = os.splice(os.length - n, n), k = ((j % n) + n) % n; push(...part.slice(n - k), ...part.slice(0, n - k)); });
  op("clear", () => { os.length = 0; }); op("count", () => push(os.length));
  op("mark [ <<", () => push(MARK));
  const toMark = () => { const i = os.lastIndexOf(MARK); if (i < 0) throw new PSError("unmatchedmark"); return i; };
  op("cleartomark", () => { os.length = toMark(); }); op("counttomark", () => push(os.length - 1 - toMark()));
  op("]", () => { const i = toMark(); const items = os.splice(i); items.shift(); push(items); });
  op(">>", () => { const i = toMark(); const items = os.splice(i); items.shift(); const d = dict(); for (let k = 0; k + 1 < items.length; k += 2) d.m.set(keyOf(items[k]), items[k + 1]); push(d); });
  const arith = (f) => () => { const b = popNum(), a = popNum(); push(f(a, b)); };
  op("add", arith((a, b) => a + b)); op("sub", arith((a, b) => a - b)); op("mul", arith((a, b) => a * b));
  op("div", arith((a, b) => { if (!b) throw new PSError("undefinedresult"); return a / b; })); op("idiv", arith((a, b) => { if (!b) throw new PSError("undefinedresult"); return Math.trunc(a / b); }));
  op("mod", arith((a, b) => { if (!b) throw new PSError("undefinedresult"); return Math.trunc(a) % Math.trunc(b); }));
  op("atan", arith((a, b) => { const d = Math.atan2(a, b) * 180 / Math.PI; return d < 0 ? d + 360 : d; })); op("exp", arith((a, b) => a ** b));
  const unary = (f) => () => push(f(popNum()));
  op("neg", unary((a) => -a)); op("abs", unary(Math.abs)); op("sqrt", unary(Math.sqrt)); op("sin", unary((a) => Math.sin(a * Math.PI / 180))); op("cos", unary((a) => Math.cos(a * Math.PI / 180)));
  op("ln", unary(Math.log)); op("log", unary(Math.log10)); op("round", unary(Math.round)); op("truncate", unary(Math.trunc)); op("floor", unary(Math.floor)); op("ceiling", unary(Math.ceil));
  op("cvi", () => { const v = pop(); push(Math.trunc(v && v.t === "str" ? Number(v.v) : v)); }); op("cvr", () => { const v = pop(); push(v && v.t === "str" ? Number(v.v) : v); });
  op("rand", () => push(Math.floor(Math.random() * 2 ** 31))); op("srand", () => pop()); op("rrand", () => push(0));
  const same = (a, b) => (a && b && typeof a === "object" && typeof b === "object" && "v" in a && "v" in b && (a.t === "str" || a.t === "name") && (b.t === "str" || b.t === "name")) ? a.v === b.v : a === b;
  op("eq", () => { const b = pop(), a = pop(); push(same(a, b)); }); op("ne", () => { const b = pop(), a = pop(); push(!same(a, b)); });
  const cmp = (f) => () => { const b = pop(), a = pop(); push(f(a?.t === "str" ? a.v : a, b?.t === "str" ? b.v : b)); };
  op("gt", cmp((a, b) => a > b)); op("ge", cmp((a, b) => a >= b)); op("lt", cmp((a, b) => a < b)); op("le", cmp((a, b) => a <= b));
  const logic = (fb, fn) => () => { const b = pop(), a = pop(); push(typeof a === "boolean" ? fb(a, b) : fn(a, b)); };
  op("and", logic((a, b) => a && b, (a, b) => a & b)); op("or", logic((a, b) => a || b, (a, b) => a | b)); op("xor", logic((a, b) => a !== b, (a, b) => a ^ b));
  op("not", () => { const a = pop(); push(typeof a === "boolean" ? !a : ~a); }); op("bitshift", () => { const s = popNum(), a = popNum(); push(s >= 0 ? a << s : a >> -s); });
  op("true", () => push(true)); op("false", () => push(false)); op("null", () => push(NULL));
  op("if", () => { const p = asProc(pop()), c = pop(); if (c === true) run(p.v); });
  op("ifelse", () => { const b = asProc(pop()), a = asProc(pop()), c = pop(); run(c === true ? a.v : b.v); });
  const loop = (body) => { try { body(); } catch (e) { if (e !== EXIT) throw e; } };
  op("for", () => { const p = asProc(pop()), limit = popNum(), inc = popNum(), init = popNum(); loop(() => { for (let i = init; inc > 0 ? i <= limit : i >= limit; i += inc) { push(i); run(p.v); if (!inc) break; } }); });
  op("repeat", () => { const p = asProc(pop()), n = popNum(); loop(() => { for (let i = 0; i < n; i++) run(p.v); }); });
  op("loop", () => { const p = asProc(pop()); loop(() => { for (;;) run(p.v); }); });
  op("exit", () => { throw EXIT; });
  op("forall", () => { const p = asProc(pop()), c = pop(); loop(() => {
    if (c && c.t === "dict") for (const [k, v] of [...c.m]) { push(k.startsWith?.("/") ? name(k.slice(1), true) : k, v); run(p.v); }
    else if (c && c.t === "str") for (const ch of c.v) { push(ch.charCodeAt(0)); run(p.v); }
    else for (const v of arrayOf(c) ?? []) { push(v); run(p.v); }
  }); });
  op("exec", () => call(pop()));
  op("stopped", () => { const p = pop(), depth = os.length; try { call(p); push(false); } catch (e) { if (e === EXIT || e === QUIT) throw e; if (!(e === STOP || e instanceof PSError)) throw e; if (os.length > depth) os.length = depth; push(true); } });
  op("stop", () => { throw STOP; }); op("quit", () => { throw QUIT; });
  op("countexecstack", () => push(0)); op("execstack", () => { pop(); push([]); });
  // Dictionaries
  op("dict", () => { popNum(); push(dict()); }); op("begin", () => { const d = pop(); if (d?.t !== "dict") throw new PSError("typecheck", "dictionary expected"); ds.push(d); });
  op("end", () => { if (ds.length > 4) ds.pop(); }); op("currentdict", () => push(ds.at(-1)));
  op("def", () => { const v = pop(), k = pop(); ds.at(-1).m.set(keyOf(k), v); });
  op("store", () => { const v = pop(), k = keyOf(pop()); const d = [...ds].reverse().find((x) => x.m.has(k)) ?? ds.at(-1); d.m.set(k, v); });
  op("load", () => { const k = keyOf(pop()), v = lookup(k); if (v === undefined) throw new PSError("undefined", k.slice(1)); push(v); });
  op("where", () => { const k = keyOf(pop()), d = [...ds].reverse().find((x) => x.m.has(k)); if (d) push(d, true); else push(false); });
  op("known", () => { const k = keyOf(pop()), d = pop(); push(!!d?.m?.has(k)); });
  op("undef", () => { const k = keyOf(pop()), d = pop(); d?.m?.delete(k); });
  op("get", () => { const k = pop(), c = pop(); if (c?.t === "dict") { const v = c.m.get(keyOf(k)); if (v === undefined) throw new PSError("undefined", String(k?.v ?? k)); push(v); } else if (c?.t === "str") push(c.v.charCodeAt(k)); else { const a = arrayOf(c); if (!a || k < 0 || k >= a.length) throw new PSError("rangecheck"); push(a[k]); } });
  op("put", () => { const v = pop(), k = pop(), c = pop(); if (c?.t === "dict") c.m.set(keyOf(k), v); else if (c?.t === "str") c.v = c.v.slice(0, k) + String.fromCharCode(v & 255) + c.v.slice(k + 1); else { const a = arrayOf(c); if (a) a[k] = v; } });
  op("length", () => { const c = pop(); push(c?.t === "dict" ? c.m.size : c?.t === "str" || c?.t === "name" ? c.v.length : arrayOf(c)?.length ?? 0); });
  op("maxlength", () => { pop(); push(1000); });
  op("userdict", () => push(userdict)); op("systemdict", () => push(systemdict)); op("globaldict", () => push(globaldict)); op("statusdict", () => push(statusdict));
  op("errordict $error", () => push(dict())); op("internaldict", () => { pop(); push(dict()); });
  op("countdictstack", () => push(ds.length));
  // Arrays, strings and types
  op("array", () => { const n = popNum(); push(new Array(n).fill(NULL)); });
  op("string", () => { const n = popNum(); push(str("\0".repeat(Math.max(0, n)))); });
  op("astore", () => { const a = arrayOf(pop()); for (let i = a.length - 1; i >= 0; i--) a[i] = pop(); push(a); });
  op("aload", () => { const c = pop(), a = arrayOf(c); push(...a, c); });
  op("getinterval", () => { const n = popNum(), i = popNum(), c = pop(); if (c?.t === "str") push(str(c.v.substr(i, n))); else { const a = arrayOf(c); push(a.slice(i, i + n)); } });
  op("putinterval", () => { const src = pop(), i = popNum(), c = pop(); if (c?.t === "str") c.v = c.v.slice(0, i) + src.v + c.v.slice(i + src.v.length); else arrayOf(c).splice(i, arrayOf(src).length, ...arrayOf(src)); });
  op("cvx", () => { const v = pop(); push(Array.isArray(v) ? { t: "proc", v } : v?.t === "name" ? name(v.v, false) : v); });
  op("cvlit", () => { const v = pop(); push(v?.t === "proc" ? v.v : v?.t === "name" ? name(v.v, true) : v); });
  op("xcheck", () => { const v = pop(); push(v?.t === "proc" || v?.t === "op" || (v?.t === "name" && !v.lit)); });
  op("type", () => { const v = pop(); push(name(isNum(v) ? (Number.isInteger(v) ? "integertype" : "realtype") : typeof v === "boolean" ? "booleantype" : Array.isArray(v) || v?.t === "proc" ? "arraytype" : ({ str: "stringtype", name: "nametype", dict: "dicttype", op: "operatortype", mark: "marktype", null: "nulltype", file: "filetype" })[v?.t] ?? "nulltype", false)); });
  op("cvn", () => { const v = pop(); push(name(v.v, true)); });
  op("cvs", () => { const target = pop(), v = pop(); const s = isNum(v) || typeof v === "boolean" ? String(v) : v?.t === "str" || v?.t === "name" ? v.v : v?.t === "op" ? v.n : "--nostringval--"; target.v = s + target.v.slice(s.length); push(str(s)); });
  op("search anchorsearch", () => { const seek = pop(), s = pop(), i = s.v.indexOf(seek.v); if (i < 0) push(s, false); else push(str(s.v.slice(i + seek.v.length)), seek, str(s.v.slice(0, i)), true); });
  op("bind readonly executeonly noaccess", () => {});
  op("rcheck wcheck", () => { pop(); push(true); });
  op("save", () => { gstack.push(copyGs(gs)); push({ t: "save", depth: gstack.length - 1 }); });
  op("restore", () => { const s = pop(); if (s?.t === "save" && gstack.length > s.depth) { gs = gstack[s.depth]; gstack.length = s.depth; } });
  op("setpacking setglobal setshared setobjectformat setvmthreshold", () => pop());
  op("currentpacking currentglobal currentshared", () => push(false)); op("gcheck", () => { pop(); push(false); });
  op("vmstatus", () => push(0, 0, 1e7)); op("languagelevel", () => push(2)); op("version product", () => push(str("modCut 1")));
  op("realtime usertime revision serialnumber", () => push(0));
  op("print = == pstack stack flush flushfile cleardictstack", () => { if (os.length) pop(); });
  op("findresource", () => { pop(); pop(); push(dict()); }); op("defineresource", () => { pop(); const v = pop(); pop(); push(v); });
  op("resourcestatus", () => { pop(); pop(); push(false); }); op("undefineresource", () => { pop(); pop(); });
  op("setpagedevice setscreen settransfer setcolortransfer setblackgeneration setundercolorremoval sethalftone setflat setoverprint setsmoothness setstrokeadjust setcolorrendering setucacheparams setuserparams setsystemparams setdevparams setcolorscreen setpattern", () => { if (os.length) pop(); });
  op("currentpagedevice currenthalftone currentcolorrendering currentuserparams currentsystemparams", () => push(dict()));
  op("currentflat currentsmoothness", () => push(1)); op("currentoverprint currentstrokeadjust", () => push(false));
  op("currentscreen", () => push(60, 45, { t: "proc", v: [] })); op("currenttransfer currentblackgeneration currentundercolorremoval", () => push({ t: "proc", v: [] }));
  op("erasepage initgraphics nulldevice", () => {}); op("showpage copypage", () => { if (painted) pageDone = true; });
  op("currentfile", () => push({ t: "file", filter: null }));
  // filter: source [parameters] /Name filter. Hex and ASCII85 over currentfile are read; others are refused when read.
  op("filter", () => {
    const kind = pop().v; let source = pop();
    if (kind === "SubFileDecode") { pop(); source = pop(); } else if (source?.t === "dict") source = pop();
    const own = { ASCIIHexDecode: "hex", ASCII85Decode: "a85" }[kind] ?? kind;
    push({ t: "file", filter: kind === "SubFileDecode" ? source?.filter ?? null : source?.filter ? `${source.filter}+${own}` : own });
  });
  op("readhexstring", () => { const s = pop(), f = pop(); const out = readFile({ ...f, filter: "hex" }, s.v.length); push(str(out), out.length === s.v.length); });
  op("readstring", () => { const s = pop(), f = pop(); const out = readFile(f, s.v.length); push(str(out), out.length === s.v.length); });
  op("readline", () => { pop(); pop(); const end = text.indexOf("\n", sc.pos); const line = text.slice(sc.pos, end < 0 ? text.length : end).replace(/\r$/, ""); sc.pos = end < 0 ? text.length : end + 1; push(str(line), end >= 0); });
  op("closefile", () => pop()); op("bytesavailable", () => { pop(); push(-1); });
  // Graphics state
  op("gsave", () => gstack.push(copyGs(gs))); op("grestore", () => { if (gstack.length) gs = gstack.pop(); });
  op("grestoreall", () => { if (gstack.length) { gs = gstack[0]; gstack.length = 0; } });
  op("setlinewidth", () => { gs.lineWidth = popNum(); }); op("currentlinewidth", () => push(gs.lineWidth));
  op("setlinecap", () => { gs.cap = popNum(); }); op("setlinejoin", () => { gs.join = popNum(); }); op("setmiterlimit", () => { gs.miter = popNum(); });
  op("currentlinecap", () => push(gs.cap)); op("currentlinejoin", () => push(gs.join)); op("currentmiterlimit", () => push(gs.miter));
  op("setdash", () => { gs.dashOffset = popNum(); gs.dash = [...(arrayOf(pop()) ?? [])]; }); op("currentdash", () => push([...gs.dash], gs.dashOffset));
  op("setgray", () => { gs.space = "DeviceGray"; const g = popNum(); setColor([g, g, g]); });
  op("setrgbcolor", () => { gs.space = "DeviceRGB"; setColor(nums(3)); });
  op("sethsbcolor", () => { gs.space = "DeviceRGB"; setColor(hsbToRgb(...nums(3))); });
  op("setcmykcolor", () => { gs.space = "DeviceCMYK"; setColor(cmykToRgb(...nums(4))); });
  op("currentgray", () => push(gs.fill.reduce((a, b) => a + b, 0) / 3)); op("currentrgbcolor", () => push(...gs.fill));
  op("currentcmykcolor", () => push(...gs.fill.map((c) => 1 - c), 0));
  op("setcolorspace", () => { const v = pop(), a = arrayOf(v); const n = a ? a[0]?.v : v?.v;
    const spaceName = (v) => { const arr = arrayOf(v); const id = arr ? arr[0]?.v : v?.v; return id === "ICCBased" ? ({ 1: "DeviceGray", 3: "DeviceRGB", 4: "DeviceCMYK" })[dictGet(arr[1] ?? dict(), "N", 3)] ?? "DeviceRGB" : id; };
    gs.tint = (n === "Separation" || n === "DeviceN") && a[3]?.t === "proc" ? { alt: spaceName(a[2]), proc: a[3], n: n === "DeviceN" ? arrayOf(a[1])?.length ?? 1 : 1 } : null;
    gs.space = n === "ICCBased" ? ({ 1: "DeviceGray", 3: "DeviceRGB", 4: "DeviceCMYK" })[dictGet(a[1] ?? dict(), "N", 3)] ?? "DeviceRGB" : n === "Indexed" || n === "Pattern" ? "DeviceGray" : n ?? "DeviceGray";
    setColor(colorFrom(gs.space, gs.space === "DeviceCMYK" ? [0, 0, 0, 1] : gs.tint ? new Array(gs.tint.n).fill(1) : [0, 0, 0])); });
  op("setcolor", () => { const n = gs.tint ? gs.tint.n : components(gs.space); setColor(colorFrom(gs.space, nums(n))); });
  op("currentcolorspace", () => push([name(gs.space, true)]));
  // Coordinate system
  const matrixOp = (make) => () => { const top = os.at(-1); if (Array.isArray(top) && top.length === 6) { const m = pop(), args = make.length ? nums(make.length) : []; m.splice(0, 6, ...make(...args)); push(m); } else { const args = nums(make.length); gs.ctm = mul(make(...args), gs.ctm); } };
  op("translate", matrixOp((x, y) => [1, 0, 0, 1, x, y])); op("scale", matrixOp((x, y) => [x, 0, 0, y, 0, 0]));
  op("rotate", matrixOp((a) => { const r = a * Math.PI / 180; return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]; }));
  op("concat", () => { const m = arrayOf(pop()); gs.ctm = mul(m, gs.ctm); });
  op("matrix", () => push([1, 0, 0, 1, 0, 0])); op("identmatrix", () => { const m = pop(); m.splice(0, 6, 1, 0, 0, 1, 0, 0); push(m); });
  op("currentmatrix", () => { const m = pop(); m.splice(0, 6, ...gs.ctm); push(m); }); op("setmatrix", () => { gs.ctm = [...arrayOf(pop())]; });
  op("defaultmatrix", () => { const m = pop(); m.splice(0, 6, 1, 0, 0, 1, 0, 0); push(m); }); op("initmatrix", () => { gs.ctm = [1, 0, 0, 1, 0, 0]; });
  op("concatmatrix", () => { const out = pop(), b = pop(), a = pop(); out.splice(0, 6, ...mul(a, b)); push(out); });
  op("invertmatrix", () => { const out = pop(), m = pop(); out.splice(0, 6, ...invert(m)); push(out); });
  const pointOp = (f) => () => { const top = os.at(-1); const m = Array.isArray(top) && top.length === 6 ? pop() : null; const [x, y] = nums(2); push(...f(x, y, m ?? gs.ctm)); };
  op("transform", pointOp((x, y, m) => apply(m, x, y))); op("itransform", pointOp((x, y, m) => apply(invert(m), x, y)));
  op("dtransform", pointOp((x, y, m) => apply([...m.slice(0, 4), 0, 0], x, y))); op("idtransform", pointOp((x, y, m) => apply(invert([...m.slice(0, 4), 0, 0]), x, y)));
  // Paths and painting
  op("newpath", newPath); op("moveto", () => moveTo(...nums(2))); op("lineto", () => lineTo(...nums(2))); op("curveto", () => curveTo(...nums(6)));
  op("rmoveto", () => { const [dx, dy] = nums(2), [x, y] = userPoint(); moveTo(x + dx, y + dy); });
  op("rlineto", () => { const [dx, dy] = nums(2), [x, y] = userPoint(); lineTo(x + dx, y + dy); });
  op("rcurveto", () => { const d = nums(6), [x, y] = userPoint(); curveTo(x + d[0], y + d[1], x + d[2], y + d[3], x + d[4], y + d[5]); });
  op("closepath", closePath); op("currentpoint", () => push(...userPoint()));
  op("arc", () => arc(...nums(5), false)); op("arcn", () => arc(...nums(5), true));
  op("arct arcto", function () {
    const [x1, y1, x2, y2, r] = nums(5), [x0, y0] = userPoint();
    const a = [x0 - x1, y0 - y1], b = [x2 - x1, y2 - y1], la = Math.hypot(...a), lb = Math.hypot(...b), cross = a[0] * b[1] - a[1] * b[0];
    if (!la || !lb || !cross) { lineTo(x1, y1); if (this.n === "arcto") push(x1, y1, x1, y1); return; }
    const angle = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)))), dist = r / Math.tan(angle / 2);
    const t1 = [x1 + a[0] / la * dist, y1 + a[1] / la * dist], t2 = [x1 + b[0] / lb * dist, y1 + b[1] / lb * dist];
    lineTo(...t1); const k = 4 / 3 * Math.tan((Math.PI - angle) / 4);
    curveTo(t1[0] + (x1 - t1[0]) * k * r / dist, t1[1] + (y1 - t1[1]) * k * r / dist, t2[0] + (x1 - t2[0]) * k * r / dist, t2[1] + (y1 - t2[1]) * k * r / dist, ...t2);
    if (this.n === "arcto") push(...t1, ...t2);
  });
  const rect = (x, y, w, h) => { moveTo(x, y); lineTo(x + w, y); lineTo(x + w, y + h); lineTo(x, y + h); closePath(); };
  const rectArgs = () => { const top = os.at(-1); if (Array.isArray(top)) { const a = pop(); const out = []; for (let i = 0; i + 3 < a.length; i += 4) out.push(a.slice(i, i + 4)); return out; } return [nums(4)]; };
  op("rectfill", () => { const saved = copyGs(gs); newPath(); for (const r of rectArgs()) rect(...r); paint("fill"); gs = saved; });
  op("rectstroke", () => { const saved = copyGs(gs); if (Array.isArray(os.at(-1)) && os.at(-1).length === 6 && !Array.isArray(os.at(-2))) pop(); newPath(); for (const r of rectArgs()) rect(...r); paint("stroke"); gs = saved; });
  op("rectclip", () => { newPath(); for (const r of rectArgs()) rect(...r); clip(false); newPath(); });
  op("fill", () => { paint("fill"); newPath(); }); op("eofill", () => { paint("fill", true); newPath(); }); op("stroke", () => { paint("stroke"); newPath(); });
  op("clip", () => clip(false)); op("eoclip", () => clip(true)); op("initclip", () => { gs.clip = null; });
  op("clippath", () => { newPath(); const b = box ?? [0, 0, 612, 792]; const inv = invert(gs.ctm); const [x0, y0] = apply(inv, b[0], b[1]), [x1, y1] = apply(inv, b[2], b[3]); rect(x0, y0, x1 - x0, y1 - y0); });
  op("flattenpath reversepath", () => {}); op("strokepath", () => warnings.add("Stroke outlines (strokepath) are imported as the plain path."));
  op("pathbbox", () => { const xs = [], ys = []; for (const seg of gs.path) for (let i = 1; i + 1 < seg.length; i += 2) { xs.push(seg[i]); ys.push(seg[i + 1]); } if (!xs.length) throw new PSError("nocurrentpoint");
    const inv = invert(gs.ctm), corners = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)], [Math.max(...xs), Math.min(...ys)]].map(([x, y]) => apply(inv, x, y));
    push(Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))); });
  op("shfill", () => { pop(); warnings.add("Smooth shades (gradients) are not imported."); });
  // Images
  op("image", () => {
    const top = pop();
    if (top?.t === "dict") { const d = top, space = gs.space; image({ width: dictGet(d, "Width", 0), height: dictGet(d, "Height", 0), bits: dictGet(d, "BitsPerComponent", 8), matrix: arrayOf(dictGet(d, "ImageMatrix", [1, 0, 0, 1, 0, 0])), source: dictGet(d, "DataSource", null), space, decode: arrayOf(dictGet(d, "Decode", null)) }); return; }
    const matrix = pop(), bits = popNum(), height = popNum(), width = popNum(); image({ width, height, bits, matrix: arrayOf(matrix), source: top, space: "DeviceGray" });
  });
  op("colorimage", () => {
    const ncomp = popNum(), multiple = pop(), sources = multiple ? Array.from({ length: ncomp }, () => pop()).reverse() : [pop()];
    const matrix = pop(), bits = popNum(), height = popNum(), width = popNum(), space = ({ 1: "DeviceGray", 3: "DeviceRGB", 4: "DeviceCMYK" })[ncomp];
    image({ width, height, bits, matrix: arrayOf(matrix), source: sources[0], multi: multiple ? sources : null, space });
  });
  op("imagemask", () => {
    const top = pop();
    if (top?.t === "dict") { const d = top, decode = arrayOf(dictGet(d, "Decode", [0, 1])); image({ width: dictGet(d, "Width", 0), height: dictGet(d, "Height", 0), bits: 1, matrix: arrayOf(dictGet(d, "ImageMatrix", [1, 0, 0, 1, 0, 0])), source: dictGet(d, "DataSource", null), mask: true, polarity: decode[0] === 1 }); return; }
    const matrix = pop(), polarity = pop(), height = popNum(), width = popNum(); image({ width, height, bits: 1, matrix: arrayOf(matrix), source: top, mask: true, polarity: polarity === true });
  });
  // Text: Type 3 fonts (glyphs are PostScript procedures) draw as outlines; other fonts are not available here.
  const fontDirectory = dict();
  const noFont = () => dict([["/FontType", 1], ["/FontMatrix", [0.001, 0, 0, 0.001, 0, 0]], ["/FontName", name("Unknown", true)]]);
  const fontKey = (k) => keyOf(k?.t === "str" ? name(k.v, true) : k);
  const scaled = (font, m) => { const out = dict([...font.m]); out.m.set("/FontMatrix", mul(arrayOf(dictGet(font, "FontMatrix", [1, 0, 0, 1, 0, 0])), m)); return out; };
  const findFont = (k) => fontDirectory.m.get(fontKey(k)) ?? noFont();
  op("findfont", () => push(findFont(pop())));
  op("scalefont", () => { const size = popNum(); push(scaled(pop(), [size, 0, 0, size, 0, 0])); });
  op("makefont", () => { const m = arrayOf(pop()); push(scaled(pop(), m)); });
  op("setfont", () => { gs.font = pop(); }); op("currentfont rootfont", () => push(gs.font ?? noFont()));
  op("selectfont", () => { const v = pop(), font = findFont(pop()); gs.font = scaled(font, Array.isArray(v) ? v : [v, 0, 0, v, 0, 0]); });
  op("definefont", () => { const font = pop(), k = pop(); fontDirectory.m.set(fontKey(k), font); push(font); });
  op("undefinefont", () => { fontDirectory.m.delete(fontKey(pop())); }); op("FontDirectory GlobalFontDirectory", () => push(fontDirectory));
  let glyphWidth = null, measuring = 0;
  op("setcachedevice", () => { const [wx, wy] = nums(6); glyphWidth = [wx, wy]; }); op("setcachedevice2", () => { const [wx, wy] = nums(10); glyphWidth = [wx, wy]; });
  op("setcharwidth", () => { glyphWidth = nums(2); });
  const textWarning = () => warnings.add("Text in fonts other than Type 3 is not imported: convert text to outlines before saving the EPS.");
  /** Draws one glyph (by code or by name) at the current point and returns its advance in user space. */
  function glyph(font, code, glyphName) {
    const fm = arrayOf(dictGet(font, "FontMatrix", [0.001, 0, 0, 0.001, 0, 0])), [x, y] = userPoint();
    const buildGlyph = dictGet(font, "BuildGlyph", null), buildChar = dictGet(font, "BuildChar", null), encoding = arrayOf(dictGet(font, "Encoding", [])) ?? [];
    if (glyphName === null) glyphName = encoding[code]?.v ?? ".notdef";
    if (code === null) { code = encoding.findIndex((n) => n?.v === glyphName); if (code < 0 && !buildGlyph) return [0, 0]; }
    gstack.push(copyGs(gs)); const saved = gstack.length, depth = os.length;
    gs.ctm = mul(fm, mul([1, 0, 0, 1, x, y], gs.ctm)); gs.path = []; gs.point = null; glyphWidth = [0, 0];
    try { if (buildGlyph?.t === "proc") { push(font, name(glyphName, true)); run(buildGlyph.v); } else if (buildChar?.t === "proc") { push(font, code); run(buildChar.v); } }
    finally { gs = gstack[saved - 1]; gstack.length = saved - 1; if (os.length > depth) os.length = depth; }
    const advance = apply([...fm.slice(0, 4), 0, 0], ...glyphWidth);
    gs.point = apply(gs.ctm, x + advance[0], y + advance[1]); if (!gs.path.length || gs.path.at(-1)[0] !== "M") gs.path.push(["M", ...gs.point]); else gs.path[gs.path.length - 1] = ["M", ...gs.point];
    return advance;
  }
  /** show and its variants: `extra(index, code)` adds spacing after each glyph. */
  function show(string, extra = () => [0, 0]) {
    const font = gs.font ?? noFont();
    if (dictGet(font, "FontType", 1) !== 3) { textWarning(); if (gs.point) { const [x, y] = userPoint(); moveTo(x + string.length * 6, y); } return [string.length * 6, 0]; }
    let total = [0, 0];
    for (let i = 0; i < string.length; i++) {
      const code = string.charCodeAt(i), advance = glyph(font, code, null), more = extra(i, code), [x, y] = userPoint();
      if (more[0] || more[1]) moveTo(x + more[0], y + more[1]);
      total = [total[0] + advance[0] + more[0], total[1] + advance[1] + more[1]];
    }
    return total;
  }
  op("show", () => show(pop().v));
  op("ashow", () => { const s = pop().v, [ax, ay] = nums(2); show(s, () => [ax, ay]); });
  op("widthshow", () => { const s = pop().v, char = popNum(), [cx, cy] = nums(2); show(s, (i, c) => c === char ? [cx, cy] : [0, 0]); });
  op("awidthshow", () => { const s = pop().v, [ax, ay] = nums(2), char = popNum(), [cx, cy] = nums(2); show(s, (i, c) => c === char ? [ax + cx, ay + cy] : [ax, ay]); });
  // xshow and friends give each glyph's full displacement instead of its own advance.
  op("xshow", () => { const list = arrayOf(pop()) ?? [], s = pop().v; const font = gs.font ?? noFont(); if (dictGet(font, "FontType", 1) !== 3) { textWarning(); return; }
    for (let i = 0; i < s.length; i++) { const [x, y] = userPoint(); glyph(font, s.charCodeAt(i), null); moveTo(x + (list[i] ?? 0), y); } });
  op("yshow", () => { const list = arrayOf(pop()) ?? [], s = pop().v; const font = gs.font ?? noFont(); if (dictGet(font, "FontType", 1) !== 3) { textWarning(); return; }
    for (let i = 0; i < s.length; i++) { const [x, y] = userPoint(); glyph(font, s.charCodeAt(i), null); moveTo(x, y + (list[i] ?? 0)); } });
  op("xyshow", () => { const list = arrayOf(pop()) ?? [], s = pop().v; const font = gs.font ?? noFont(); if (dictGet(font, "FontType", 1) !== 3) { textWarning(); return; }
    for (let i = 0; i < s.length; i++) { const [x, y] = userPoint(); glyph(font, s.charCodeAt(i), null); moveTo(x + (list[2 * i] ?? 0), y + (list[2 * i + 1] ?? 0)); } });
  op("kshow cshow", () => { pop(); show(pop().v); });
  op("glyphshow", () => { const n = pop(), font = gs.font ?? noFont(); if (dictGet(font, "FontType", 1) !== 3) { textWarning(); return; } glyph(font, null, n.v); });
  op("stringwidth", () => { const s = pop().v; gstack.push(copyGs(gs)); const at = gstack.length; measuring++; if (!gs.point) moveTo(0, 0);
    let w; try { w = show(s); } finally { measuring--; gs = gstack[at - 1]; gstack.length = at - 1; } push(...w); });
  op("charpath", () => { pop(); pop(); warnings.add("Text outlines (charpath) are not imported."); });
  // Illustrator (AI3 to AI8 body operators)
  let compound = null;
  const aiPaint = (close, fill, stroke) => () => {
    if (close) closePath();
    if (compound) { compound.path.push(...gs.path); if (fill || stroke) compound.mode = [fill, stroke]; newPath(); return; }
    if (fill) paint("fill", gs.fillRule === "evenodd"); if (stroke) paint("stroke"); newPath();
  };
  ai("m", () => moveTo(...nums(2))); ai("l L", () => lineTo(...nums(2))); ai("c C", () => curveTo(...nums(6)));
  ai("v V", () => { const [x2, y2, x3, y3] = nums(4), [x, y] = userPoint(); curveTo(x, y, x2, y2, x3, y3); });
  ai("y Y", () => { const [x1, y1, x3, y3] = nums(4); curveTo(x1, y1, x3, y3, x3, y3); });
  ai("h H", closePath);
  ai("f", aiPaint(true, true, false)); ai("F", aiPaint(false, true, false)); ai("s", aiPaint(true, false, true)); ai("S", aiPaint(false, false, true));
  ai("b", aiPaint(true, true, true)); ai("B", aiPaint(false, true, true)); ai("n", aiPaint(true, false, false)); ai("N", aiPaint(false, false, false));
  ai("*u", () => { compound = { path: [], mode: [false, false] }; });
  ai("*U", () => { if (!compound) return; const c = compound; compound = null; gs.path = c.path; if (c.mode[0]) paint("fill", gs.fillRule === "evenodd"); if (c.mode[1]) paint("stroke"); newPath(); });
  ai("g", () => { const v = popNum(); gs.fill = [v, v, v]; }); ai("G", () => { const v = popNum(); gs.stroke = [v, v, v]; });
  ai("k", () => { gs.fill = cmykToRgb(...nums(4)); }); ai("K", () => { gs.stroke = cmykToRgb(...nums(4)); });
  ai("Xa", () => { gs.fill = nums(3); }); ai("XA", () => { gs.stroke = nums(3); });
  const custom = () => { const tint = popNum(); pop(); const [c, m, y, k] = nums(4); return cmykToRgb(c * (1 - tint), m * (1 - tint), y * (1 - tint), k * (1 - tint)); };
  ai("x", () => { gs.fill = custom(); }); ai("X", () => { gs.stroke = custom(); });
  const customTyped = () => { const type = popNum(), tint = popNum(); pop(); if (type === 1) { const rgb = nums(3); return rgb.map((v) => 1 - (1 - v) * (1 - tint)); } const [c, m, y, k] = nums(4); return cmykToRgb(c * (1 - tint), m * (1 - tint), y * (1 - tint), k * (1 - tint)); };
  ai("Xx", () => { gs.fill = customTyped(); }); ai("XX", () => { gs.stroke = customTyped(); });
  ai("w", () => { gs.lineWidth = popNum(); }); ai("j", () => { gs.join = popNum(); }); ai("J", () => { gs.cap = popNum(); }); ai("M", () => { gs.miter = popNum(); });
  ai("d", () => { gs.dashOffset = popNum(); gs.dash = [...(arrayOf(pop()) ?? [])]; });
  ai("XR", () => { gs.fillRule = popNum() === 1 ? "evenodd" : "nonzero"; }); ai("D A Ap Ar O R Xy XW XT", () => { os.length = 0; });
  ai("u", () => { const g = []; groupStack.at(-1).push({ group: g }); groupStack.push(g); }); ai("U", () => { if (groupStack.length > 1) groupStack.pop(); });
  ai("q", () => gstack.push(copyGs(gs))); ai("Q", () => { if (gstack.length) gs = gstack.pop(); }); ai("W", () => clip(gs.fillRule === "evenodd"));
  ai("Lb", () => { os.length = 0; }); ai("Ln", () => { const v = pop(); startLayer(v?.v ?? "Layer"); }); ai("LB", () => {});
  ai("To TO Tp TP Tx TX Tj Tk Tf Ta Tl Tc Tw Tz Ts Ti Tt TA Tq Tv Tr Th TV Xb XB", () => { os.length = 0; textWarning(); });
  // Adobe AGM (Illustrator 9 and later) short names, used when the procset did not define them.
  ai("mo", () => moveTo(...nums(2))); ai("li", () => lineTo(...nums(2))); ai("cv", () => curveTo(...nums(6))); ai("cp", closePath); ai("np", newPath);
  ai("ef", () => { paint("fill", true); newPath(); }); ai("@", () => { paint("stroke"); newPath(); });

  // --- Main loop: procedures are collected while scanning; everything else executes. ---
  const procStack = [];
  let errors = 0;
  for (;;) {
    let token;
    try { token = sc.next(); } catch { break; }
    if (!token || pageDone) break;
    if (skipping) continue;
    if (token.open) { procStack.push([]); continue; }
    if (token.close) { const body = procStack.pop(); if (!body) continue; const proc = { t: "proc", v: body }; if (procStack.length) procStack.at(-1).push(proc); else push(proc); continue; }
    let t = token.tok;
    if (token.immediate) { const v = lookup("/" + t.v); t = v === undefined ? t : v; if (procStack.length) { procStack.at(-1).push(t); continue; } push(t); continue; }
    if (procStack.length) { procStack.at(-1).push(t); continue; }
    try {
      if (t && t.t === "name" && !t.lit) execName(t); else push(t);
    } catch (error) {
      if (error === QUIT) break;
      if (error === EXIT || error === STOP || error instanceof PSError) { errors++; if (error instanceof PSError && errors <= 3) warnings.add(`PostScript error (${error.message}); the drawing may be incomplete.`); if (error instanceof PSError && error.psName === "limitcheck") break; continue; }
      throw error;
    }
  }
  if (unknown.size) warnings.add(`Skipped PostScript operators this importer does not know: ${[...unknown].slice(0, 8).join(", ")}${unknown.size > 8 ? " ..." : ""}.`);
  if (/^%%Pages:\s*([2-9]|\d\d)/m.test(text)) warnings.add("Only the first page was imported.");
  if (clipCount) warnings.add("Clipping paths are kept as SVG clip paths.");

  const area = box && box[2] > box[0] && box[3] > box[1] ? box : extent ?? [0, 0, 1, 1];
  const width = Math.max(area[2] - area[0], 0.001), height = Math.max(area[3] - area[1], 0.001);
  const serialize = (items) => items.map((item) => typeof item === "string" ? item : `<g>${serialize(item.group)}</g>`).join("");
  const body = layers.filter((l) => l.items.length).map((l) => l.name ? `<g id="${esc(l.name.replace(/\s+/g, "_"))}" data-name="${esc(l.name)}">${serialize(l.items)}</g>` : serialize(l.items)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${fmt(width)}pt" height="${fmt(height)}pt" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`
    + (defs.length ? `<defs>${defs.join("")}</defs>` : "")
    + `<g transform="matrix(1 0 0 -1 ${fmt(-area[0])} ${fmt(area[3])})">${body}</g></svg>`;
  return { svg, warnings: [...warnings], count: painted, widthMm: width * 25.4 / 72, heightMm: height * 25.4 / 72 };
}
