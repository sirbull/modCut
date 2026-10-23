import assert from 'node:assert/strict';
import test from 'node:test';
import { CURSORS, RESIZE_CURSORS, toolCursor } from '../tools/cursors.mjs';
import { TOOL_DEFINITIONS } from '../tools/registry.mjs';
import { CURSOR_ARTWORK } from '../tools/cursor-artwork.mjs';

const imageSource = cursor => decodeURIComponent(cursor.match(/data:image\/svg\+xml,([^"]+)"/)[1]);

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
      const svg = imageSource(value);
      assert.match(svg, /^<svg xmlns=['"]http:\/\/www.w3.org\/2000\/svg['"] width=['"]32['"] height=['"]32['"]/, name);
      assert.match(svg, /stroke='white'|fill='white'|fill:\s*#fff\b/, `${name} has a light halo or fill`);
      assert.match(value, /\) \d+ \d+, [a-z-]+$/, `${name} has a hotspot and fallback`);
    } else assert.match(value, /^[a-z-]+-resize$/, name);
  }
  for (const key of Object.values(RESIZE_CURSORS)) assert.ok(CURSORS[key], key);
  const pen = Object.keys(CURSORS).filter((k) => k.startsWith('pen-'));
  assert.equal(new Set(pen.map((k) => CURSORS[k])).size >= 6, true, 'Pen states are distinguishable');
});

test('the redrawn assets are used by their tools and all pen states share the nib hotspot', () => {
  const assignments = {
    select: 'Select_1_1', direct: 'DirectSelect_1_1', 'group-select': 'DirectSelectAdd_1_1',
    'select-move': 'Move_1_1', 'select-copy': 'MoveCopy_1_1',
    'direct-move': 'DirectMove_1_1', 'direct-copy': 'DirectMoveCopy_1_1',
    'pen-new': 'PenNew_1_1', 'pen-active': 'Pen_1_1', 'pen-continue': 'PenContinue_1_1',
    'pen-close': 'PenClose_1_1', 'pen-add': 'PenAdd_1_1', 'pen-remove': 'PenSubstract_1_1',
    'pen-convert': 'PenCorner_1_1', 'pen-join': 'PenWeld_1_1', 'anchor-convert': 'EditAnchor_1_1',
    'bend-curve': 'Arc_1_1',
    hand: 'Hand_11_11', 'hand-active': 'Fist_11_11', 'zoom-in': 'ZoomIn_8_8', 'zoom-out': 'ZoomOut_8_8',
    type: 'HorizontalText_1_1', 'type-on-path': 'HorizTextOnPath_11_12', shape: 'Precise_9_9',
    paintbrush: 'Brush_2_16', eyedropper: 'Eyedropper_2_17', scissors: 'Scissors_1_1',
    rotate: 'RotateTopLeftCorner_7_7', 'resize-ns': 'ScaleVertical_9_9', 'resize-ew': 'ScaleHorizontal_9_9',
    'resize-nwse': 'ScaleTLBR_9_9', 'resize-nesw': 'ScaleTRBL_9_9',
  };
  assert.deepEqual(Object.values(assignments).map(name => `Cur_${name}@2x.svg`).sort(), Object.keys(CURSOR_ARTWORK).sort());
  for (const [state, name] of Object.entries(assignments)) {
    assert.equal(imageSource(CURSORS[state]), CURSOR_ARTWORK[`Cur_${name}@2x.svg`], state);
    if (state.startsWith('pen-')) assert.match(CURSORS[state], /\) 3 1, crosshair$/, state);
  }
  assert.equal(toolCursor('group-selection'), CURSORS['group-select']);
  assert.equal(toolCursor('rotate'), CURSORS.rotate);
  assert.equal(toolCursor('add-anchor'), CURSORS['pen-add']);
  assert.equal(toolCursor('delete-anchor'), CURSORS['pen-remove']);
});
