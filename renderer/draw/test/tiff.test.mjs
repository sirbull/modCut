import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tiffDocument } from '../io/tiff.mjs';

const UTIF = createRequire(import.meta.url)('utif');
const image = (width, height) => { const data = new Uint8Array(width * height * 4); for (let i = 0; i < width * height; i++) data.set([i % 256, (i * 7) % 256, 200, i % 3 ? 255 : 128], i * 4); return { width, height, data }; };
const decode = (bytes) => { const [frame] = UTIF.decode(bytes.buffer); UTIF.decodeImage(bytes.buffer, frame); return { frame, rgba: UTIF.toRGBA8(frame) }; };

for (const compression of ['none', 'packbits']) test(`TIFF round trip (${compression}): pixels, alpha, size and resolution`, () => {
  const img = image(300, 260), bytes = tiffDocument(img, { ppi: 300, compression });
  assert.deepEqual([...bytes.slice(0, 4)], [0x49, 0x49, 42, 0]);
  const { frame, rgba } = decode(bytes);
  assert.deepEqual([frame.width, frame.height], [300, 260]);
  assert.deepEqual([...rgba.slice(0, 16)], [...img.data.slice(0, 16)]); assert.deepEqual([...rgba.slice(-8)], [...img.data.slice(-8)]);
  assert.equal(frame.t282[0], 300, 'X resolution in ppi');
});
test('TIFF without alpha and with long runs compresses', () => {
  const flat = { width: 200, height: 100, data: new Uint8Array(200 * 100 * 4).fill(255) };
  const plain = tiffDocument(flat, { alpha: false }), packed = tiffDocument(flat, { alpha: false, compression: 'packbits' });
  assert.ok(packed.length < plain.length / 10);
  assert.deepEqual([...decode(packed).rgba.slice(0, 4)], [255, 255, 255, 255]);
});
