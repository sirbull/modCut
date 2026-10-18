/**
 * GIF writer (D5): one frame, GIF89a, up to 256 colours chosen by median cut, pixels with alpha below 128
 * transparent. Pure: RGBA bytes in, file bytes out.
 */
/** Up to `max` colours for the opaque pixels (median cut on a sample), as [[r, g, b], ...]. */
export function medianCut(data, max = 256) {
  const step = Math.max(1, Math.floor(data.length / 4 / 60000)), pixels = [];
  for (let i = 0; i < data.length; i += 4 * step) if (data[i + 3] >= 128) pixels.push([data[i], data[i + 1], data[i + 2]]);
  if (!pixels.length) return [[0, 0, 0]];
  let boxes = [pixels];
  while (boxes.length < max) {
    // Split the box with the widest channel range at its median.
    let best = -1, range = 0, channel = 0;
    boxes.forEach((box, i) => { if (box.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of box) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > range) { range = hi - lo; best = i; channel = c; } } });
    if (best < 0 || range === 0) break;
    const box = boxes[best].sort((a, b) => a[channel] - b[channel]), half = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, half), box.slice(half));
  }
  return boxes.map((box) => [0, 1, 2].map((c) => Math.round(box.reduce((sum, p) => sum + p[c], 0) / box.length)));
}
function lzw(indices, minCodeSize) {
  const out = [], clear = 1 << minCodeSize, end = clear + 1;
  let codeSize = minCodeSize + 1, next = end + 1, dict = new Map(), bits = 0, acc = 0;
  const write = (code) => { acc |= code << bits; bits += codeSize; while (bits >= 8) { out.push(acc & 255); acc >>= 8; bits -= 8; } };
  write(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix * 4096 + k, found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    write(prefix);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << codeSize) && codeSize < 12) codeSize++; }
    else { write(clear); dict = new Map(); codeSize = minCodeSize + 1; next = end + 1; }
    prefix = k;
  }
  write(prefix); write(end);
  if (bits > 0) out.push(acc & 255);
  return out;
}
/** @param image { width, height, data: RGBA } */
export function gifDocument({ width, height, data }, { colors = 256 } = {}) {
  if (!(width > 0 && height > 0 && width < 65536 && height < 65536)) throw new Error('GIF images are up to 65535 pixels on each side.');
  const transparent = (() => { for (let i = 3; i < data.length; i += 4) if (data[i] < 128) return true; return false; })();
  const palette = medianCut(data, Math.min(colors, transparent ? 255 : 256)), size = Math.max(2, 1 << Math.ceil(Math.log2(palette.length + (transparent ? 1 : 0))));
  const clear = transparent ? palette.length : -1, cache = new Map(), indices = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    if (transparent && data[i + 3] < 128) { indices[j] = clear; continue; }
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let index = cache.get(key);
    if (index === undefined) { let d = Infinity; palette.forEach((c, k) => { const e = (c[0] - data[i]) ** 2 + (c[1] - data[i + 1]) ** 2 + (c[2] - data[i + 2]) ** 2; if (e < d) { d = e; index = k; } }); cache.set(key, index); }
    indices[j] = index;
  }
  const bits = Math.log2(size), out = [];
  const u16 = (v) => out.push(v & 255, v >> 8);
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0))); u16(width); u16(height); out.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
  for (let k = 0; k < size; k++) out.push(...(palette[k] ?? [0, 0, 0]));
  if (transparent) out.push(0x21, 0xF9, 4, 1, 0, 0, clear, 0);
  out.push(0x2C); u16(0); u16(0); u16(width); u16(height); out.push(0);
  const minCodeSize = Math.max(2, bits), packed = lzw(indices, minCodeSize);
  out.push(minCodeSize);
  for (let i = 0; i < packed.length; i += 255) { const block = packed.slice(i, i + 255); out.push(block.length, ...block); }
  out.push(0, 0x3B);
  return Uint8Array.from(out);
}
