import assert from 'node:assert/strict';
import test from 'node:test';
import { CURSORS, RESIZE_CURSORS, toolCursor } from '../tools/cursors.mjs';
import { TOOL_DEFINITIONS } from '../tools/registry.mjs';

test('every tool and state has a visible cursor with a CSS fallback', () => {
  for (const tool of TOOL_DEFINITIONS) {
    const cursor = toolCursor(tool.id);
    assert.match(cursor, /, (default|crosshair|grab|zoom-in|text)$/, tool.id);
    assert.doesNotMatch(cursor, /, none$/);
  }
  assert.equal(toolCursor('zoom', { zoomOut: true }), CURSORS['zoom-out']);
  assert.notEqual(toolCursor('select'), toolCursor('direct-selection'), 'Selection is a black arrow, Direct Selection white');
  for (const [name, value] of Object.entries(CURSORS)) {
    if (value.startsWith('url(')) {
      const svg = decodeURIComponent(value.match(/data:image\/svg\+xml,([^"]+)"/)[1]);
      assert.match(svg, /^<svg xmlns='http:\/\/www.w3.org\/2000\/svg' width='32' height='32'/, name);
      assert.match(svg, /stroke='white'|fill='white'/, `${name} has a light halo or fill`);
      assert.match(value, /\) \d+ \d+, [a-z-]+$/, `${name} has a hotspot and fallback`);
    } else assert.match(value, /^[a-z-]+-resize$/, name);
  }
  for (const key of Object.values(RESIZE_CURSORS)) assert.ok(CURSORS[key], key);
  const pen = Object.keys(CURSORS).filter((k) => k.startsWith('pen-'));
  assert.equal(new Set(pen.map((k) => CURSORS[k])).size >= 6, true, 'Pen states are distinguishable');
});
