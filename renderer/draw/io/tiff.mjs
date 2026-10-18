/**
 * TIFF writer (D4.5): baseline TIFF 6.0, little-endian, one strip per 64 KB of rows, RGB or RGBA
 * (unassociated alpha) at 8 bits, with the resolution in pixels per inch. Optional PackBits compression.
 * Pure: RGBA bytes in, file bytes out.
 */
function packBits(row) {
  const out = [];
  let i = 0;
  while (i < row.length) {
    // A run of 3 or more equal bytes is written as one repeat; otherwise up to 128 literal bytes.
    let run = 1; while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 3) { out.push(257 - run, row[i]); i += run; continue; }
    const start = i; let n = 0;
    while (i < row.length && n < 128) {
      let ahead = 1; while (i + ahead < row.length && ahead < 3 && row[i + ahead] === row[i]) ahead++;
      if (ahead >= 3) break;
      i++; n++;
    }
    out.push(n - 1); for (let k = start; k < start + n; k++) out.push(row[k]);
  }
  return out;
}
/**
 * @param image { width, height, data: RGBA Uint8 array }
 * @param options { ppi = 72, alpha = true, compression: 'none' | 'packbits' }
 */
export function tiffDocument({ width, height, data }, { ppi = 72, alpha = true, compression = 'none' } = {}) {
  if (!(width > 0 && height > 0) || data.length < width * height * 4) throw new Error('No pixels to write.');
  const channels = alpha ? 4 : 3, rowBytes = width * channels, rowsPerStrip = Math.max(1, Math.floor(65536 / rowBytes));
  const strips = [];
  for (let y = 0; y < height; y += rowsPerStrip) {
    const rows = Math.min(rowsPerStrip, height - y), raw = new Uint8Array(rows * rowBytes);
    for (let r = 0; r < rows; r++) for (let x = 0; x < width; x++) {
      const s = ((y + r) * width + x) * 4, d = r * rowBytes + x * channels;
      raw[d] = data[s]; raw[d + 1] = data[s + 1]; raw[d + 2] = data[s + 2]; if (alpha) raw[d + 3] = data[s + 3];
    }
    if (compression !== 'packbits') { strips.push(raw); continue; }
    const packed = []; for (let r = 0; r < rows; r++) packed.push(...packBits(raw.subarray(r * rowBytes, (r + 1) * rowBytes)));
    strips.push(Uint8Array.from(packed));
  }
  // Tags in ascending order; values that do not fit in 4 bytes go after the directory.
  const SHORT = 3, LONG = 4, RATIONAL = 5;
  const entries = [
    [256, LONG, [width]], [257, LONG, [height]], [258, SHORT, Array(channels).fill(8)], [259, SHORT, [compression === 'packbits' ? 32773 : 1]],
    [262, SHORT, [2]], [273, LONG, strips.map(() => 0)], [277, SHORT, [channels]], [278, LONG, [rowsPerStrip]],
    [279, LONG, strips.map((s) => s.length)], [282, RATIONAL, [Math.round(ppi * 1000), 1000]], [283, RATIONAL, [Math.round(ppi * 1000), 1000]],
    [284, SHORT, [1]], [296, SHORT, [2]], ...(alpha ? [[338, SHORT, [2]]] : []),
  ];
  const size = (type, values) => (type === SHORT ? 2 : type === LONG ? 4 : 4) * values.length;
  const dirSize = 2 + entries.length * 12 + 4, extra = entries.reduce((n, [, type, values]) => n + (size(type, values) > 4 ? size(type, values) : 0), 0);
  const dataStart = 8 + dirSize + extra, total = dataStart + strips.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total), view = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]); view.setUint32(4, 8, true);
  // Strip offsets are known once the data area starts.
  let offset = dataStart; const offsets = strips.map((s) => { const at = offset; offset += s.length; return at; });
  entries.find((e) => e[0] === 273)[2] = offsets;
  view.setUint16(8, entries.length, true);
  let extraAt = 8 + dirSize;
  entries.forEach(([tag, type, values], i) => {
    const at = 10 + i * 12, bytes = size(type, values), count = type === RATIONAL ? values.length / 2 : values.length;
    view.setUint16(at, tag, true); view.setUint16(at + 2, type, true); view.setUint32(at + 4, count, true);
    const write = (base) => values.forEach((v, k) => type === SHORT ? view.setUint16(base + k * 2, v, true) : view.setUint32(base + k * 4, v, true));
    if (bytes <= 4) write(at + 8); else { view.setUint32(at + 8, extraAt, true); write(extraAt); extraAt += bytes; }
  });
  view.setUint32(10 + entries.length * 12, 0, true);
  strips.forEach((s, i) => out.set(s, offsets[i]));
  return out;
}
