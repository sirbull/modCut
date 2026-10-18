import test from 'node:test';
import assert from 'node:assert/strict';
import { gifDocument, medianCut } from '../io/gif.mjs';

// A small GIF reader for the round trip: header, palette, optional transparency, one LZW image.
function readGif(bytes) {
  const u16 = (i) => bytes[i] | (bytes[i + 1] << 8), width = u16(6), height = u16(8), flags = bytes[10], size = 1 << ((flags & 7) + 1);
  let at = 13; const palette = []; for (let k = 0; k < size; k++, at += 3) palette.push([bytes[at], bytes[at + 1], bytes[at + 2]]);
  let transparent = -1;
  if (bytes[at] === 0x21 && bytes[at + 1] === 0xF9) { if (bytes[at + 3] & 1) transparent = bytes[at + 6]; at += 8; }
  assert.equal(bytes[at], 0x2C); at += 10;
  const min = bytes[at++], data = []; while (bytes[at]) { const n = bytes[at++]; for (let k = 0; k < n; k++) data.push(bytes[at++]); } at++;
  assert.equal(bytes[at], 0x3B);
  const clear = 1 << min, end = clear + 1, out = [];
  let codeSize = min + 1, dict = [], pos = 0, prev = null;
  const reset = () => { dict = Array.from({ length: clear }, (_, i) => [i]); dict.push([], []); codeSize = min + 1; prev = null; };
  const read = () => { let code = 0; for (let b = 0; b < codeSize; b++, pos++) code |= ((data[pos >> 3] >> (pos & 7)) & 1) << b; return code; };
  reset();
  for (;;) {
    const code = read();
    if (code === clear) { reset(); continue; }
    if (code === end) break;
    const entry = code < dict.length ? dict[code] : [...dict[prev], dict[prev][0]];
    out.push(...entry);
    if (prev !== null && dict.length < 4096) dict.push([...dict[prev], entry[0]]);
    if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
    prev = code;
  }
  return { width, height, palette, transparent, indices: out };
}
const image = (width, height, paint) => { const data = new Uint8Array(width * height * 4); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4); return { width, height, data }; };

test('median cut finds the colours', () => {
  const img = image(10, 10, (x) => x < 5 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  assert.deepEqual(medianCut(img.data, 4).sort(), [[0, 0, 255], [255, 0, 0]]);
});
test('GIF round trip: size, colours, transparency and a long LZW stream', () => {
  const img = image(173, 91, (x, y) => (x + y) % 17 === 0 ? [0, 0, 0, 0] : [(x * 7) & 255, (y * 13) & 255, ((x ^ y) * 3) & 255, 255]);
  const gif = readGif(gifDocument(img));
  assert.deepEqual([gif.width, gif.height], [173, 91]); assert.equal(gif.indices.length, 173 * 91);
  assert.ok(gif.transparent >= 0); assert.equal(gif.indices[0], gif.transparent, 'Pixel (0, 0) is transparent');
  // Every opaque pixel lands on a palette colour near its own.
  let worst = 0;
  for (let i = 0; i < gif.indices.length; i++) { if (img.data[i * 4 + 3] < 128) continue; const c = gif.palette[gif.indices[i]]; worst = Math.max(worst, Math.abs(c[0] - img.data[i * 4]) + Math.abs(c[1] - img.data[i * 4 + 1]) + Math.abs(c[2] - img.data[i * 4 + 2])); }
  assert.ok(worst < 120, `Nearest colours: ${worst}`);
  const flat = readGif(gifDocument(image(64, 64, () => [10, 20, 30, 255])));
  assert.equal(flat.transparent, -1); assert.deepEqual(flat.palette[flat.indices[4095]], [10, 20, 30]);
});
