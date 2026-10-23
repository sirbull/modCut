import test from 'node:test';
import assert from 'node:assert/strict';
import { HARMONY_RULES, collectColors, dragSettings, hexWheel, neutralSettings, nearestColor, pointWheel, recolorHexes, recolorMap, remapAppearance, rgbHue, wheelAngle, wheelColors, wheelHex, wheelPoint } from '../doc/recolor.mjs';
import { RECOLOR_LIBRARIES, recolorLibraries, recolorLibrary } from '../doc/recolor-libraries.mjs';
import { appearance } from '../geometry.mjs';
import { defaultGradient, changeGradient } from '../doc/gradient.mjs';

const node = (fill, stroke = null) => ({ appearance: appearance(fill, stroke, 1) });
const circular = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('the artistic wheel puts complements opposite and round-trips RGB hues', () => {
  for (let h = 0; h < 360; h += 7.5) assert.ok(Math.abs(rgbHue(wheelAngle(h)) - h) < 1e-9 || Math.abs(rgbHue(wheelAngle(h)) - h) > 359.99);
  assert.ok(circular(hexWheel('#FF0000')[0] + 180, hexWheel('#00C040')[0]) < 25, 'red opposite green');
  assert.ok(circular(hexWheel('#FFFF00')[0] + 180, hexWheel('#7F00FF')[0]) < 25, 'yellow opposite violet');
  for (const hex of ['#123456', '#FF8800', '#00FF7F', '#FFFFFF', '#000000', '#808080']) assert.equal(wheelHex(hexWheel(hex)), hex);
});

test('colours come from fills, strokes and gradient stops, most used first', () => {
  const g = node('#FF0000'); g.appearance = changeGradient(g.appearance, 'fill', defaultGradient({ x: 0, y: 0, width: 10, height: 10 }, { stops: [{ offset: 0, color: { space: 'rgb', values: [0, 0, 1] } }, { offset: 1, color: { space: 'rgb', values: [1, 0, 0] } }] }));
  const colors = collectColors([node('#FF0000', '#000000'), node('#FF0000'), g]);
  assert.deepEqual(colors, [{ hex: '#FF0000', weight: 3 }, { hex: '#000000', weight: 1 }, { hex: '#0000FF', weight: 1 }]);
});

test('neutral settings keep every colour; the base is the most used chromatic colour', () => {
  const colors = collectColors([node('#FFFFFF'), node('#FFFFFF'), node('#336699'), node('#CC3300')]);
  const settings = neutralSettings(colors);
  assert.equal(colors[settings.base].hex, '#336699', 'white is skipped as base');
  assert.deepEqual(recolorHexes(colors, settings), colors.map((c) => c.hex));
});

test('rotating the wheel turns every hue together and leaves greys alone', () => {
  const colors = collectColors([node('#FF0000'), node('#0000FF'), node('#808080')]);
  const turned = { ...neutralSettings(colors), rotation: 90 }, before = colors.map((c) => hexWheel(c.hex)), after = wheelColors(colors, turned);
  after.forEach(([a, s, b], i) => { if (before[i][1] > 0) assert.ok(circular(a, before[i][0] + 90) < 1e-6); assert.ok(Math.abs(s - before[i][1]) < 1e-9 && Math.abs(b - before[i][2]) < 1e-9); });
  assert.equal(recolorMap(colors, turned).get('#808080'), '#808080');
});

test('harmony rules put the colours on the rule\'s hues around the base', () => {
  const colors = collectColors([node('#FF0000'), node('#FF4000'), node('#FF8000'), node('#FFC000')]);
  for (const rule of HARMONY_RULES.filter((r) => r.offsets)) {
    const settings = { ...neutralSettings(colors), rule: rule.id, base: 0 }, base = hexWheel(colors[0].hex)[0];
    for (const [a] of wheelColors(colors, settings)) assert.ok(rule.offsets.some((o) => circular(a, base + o) <= 12 + 1e-6), `${rule.id}: ${a} near a rule hue`);
  }
  const complementary = wheelColors(colors, { ...neutralSettings(colors), rule: 'complementary', base: 0 });
  assert.ok(complementary.some(([a]) => circular(a, hexWheel('#FF0000')[0] + 180) <= 12), 'some colour moves to the complement');
  const mono = wheelColors(colors, { ...neutralSettings(colors), rule: 'monochromatic', base: 0 });
  assert.ok(mono.every(([a]) => circular(a, mono[0][0]) < 1e-6));
});

test('dragging rotates all, Ctrl scales radially and Shift moves one colour', () => {
  const colors = collectColors([node('#CC3333'), node('#3333CC')]), start = neutralSettings(colors);
  const rotated = dragSettings(start, colors, 0, [1, 0], [0, -1]);
  assert.equal(rotated.rotation, 90);
  const scaled = dragSettings(start, colors, 0, [.8, 0], [.4, 0], { radial: true });
  assert.equal(scaled.scale.saturation, .5); assert.equal(scaled.rotation, 0);
  const blue = colors.findIndex((c) => c.hex === '#3333CC'), red = 1 - blue;
  const one = dragSettings(start, colors, blue, wheelPoint(hexWheel('#3333CC')), [0, -.5], { single: true });
  const out = recolorHexes(colors, one);
  assert.equal(out[red], '#CC3333', 'other colour stays'); assert.notEqual(out[blue], '#3333CC');
  const [a, r] = pointWheel([0, -.5]), moved = wheelColors(colors, one)[blue];
  assert.ok(circular(moved[0], a) < 1e-6 && Math.abs(moved[1] - r) < 1e-6, 'the colour lands under the pointer');
  assert.deepEqual(dragSettings({ ...start, linked: false }, colors, blue, [1, 0], [0, -1]).overrides['#3333CC'].angle, 90, 'unlinked moves one colour too');
});

test('the slider lightens or darkens every colour by the other wheel value', () => {
  const colors = collectColors([node('#804040')]), s = neutralSettings(colors);
  const [, , b] = hexWheel(recolorHexes(colors, { ...s, adjust: { saturation: 0, brightness: .5 } })[0]);
  assert.ok(b > hexWheel('#804040')[2]);
  const [, sat] = hexWheel(recolorHexes(colors, { ...s, adjust: { saturation: -1, brightness: 0 } })[0]);
  assert.equal(sat, 0);
});

test('a library snaps each colour to its nearest library colour', () => {
  assert.equal(nearestColor('#F01010', ['#000000', '#FF0000', '#0000FF']), '#FF0000');
  const colors = collectColors([node('#F01010'), node('#1010E0')]);
  assert.deepEqual(recolorMap(colors, neutralSettings(colors), ['#FF0000', '#0000FF']), new Map([['#1010E0', '#0000FF'], ['#F01010', '#FF0000']]));
  assert.ok(recolorLibraries().length > 20 && recolorLibrary('skintones').colors.length >= 8);
  const ids = recolorLibraries().map((l) => l.id); assert.equal(new Set(ids).size, ids.length);
  for (const l of recolorLibraries()) for (const c of l.colors) assert.match(c, /^#[0-9A-F]{6}$/);
  assert.ok(RECOLOR_LIBRARIES.find((e) => e.name === 'Foods').items.length === 5);
});

test('remapping changes colours, keeps opacity and unlinks changed global swatches', () => {
  const a = appearance('#FF0000', '#000000', 2); a.fills[0].paint.swatch = 'sw1'; a.fills[0].opacity = .5;
  const next = remapAppearance(a, new Map([['#FF0000', '#00FF00']]));
  assert.deepEqual(next.fills[0].paint.color.values, [0, 1, 0]); assert.equal(next.fills[0].opacity, .5);
  assert.equal(next.fills[0].paint.swatch, undefined); assert.deepEqual(next.strokes[0], a.strokes[0]);
  assert.equal(a.fills[0].paint.swatch, 'sw1', 'the source is not changed');
});

test('a scope collects and changes only fills or only strokes', async () => {
  const { RECOLOR_SCOPES } = await import('../doc/recolor.mjs');
  const nodes = [node('#FF0000', '#0000FF')];
  assert.deepEqual(collectColors(nodes, RECOLOR_SCOPES.fill).map((c) => c.hex), ['#FF0000']);
  assert.deepEqual(collectColors(nodes, RECOLOR_SCOPES.stroke).map((c) => c.hex), ['#0000FF']);
  const map = new Map([['#FF0000', '#00FF00'], ['#0000FF', '#00FF00']]);
  const fillOnly = remapAppearance(nodes[0].appearance, map, RECOLOR_SCOPES.fill);
  assert.deepEqual(fillOnly.fills[0].paint.color.values, [0, 1, 0]); assert.deepEqual(fillOnly.strokes[0].paint.color.values, [0, 0, 1]);
  const strokeOnly = remapAppearance(nodes[0].appearance, map, RECOLOR_SCOPES.stroke);
  assert.deepEqual(strokeOnly.fills[0].paint.color.values, [1, 0, 0]); assert.deepEqual(strokeOnly.strokes[0].paint.color.values, [0, 1, 0]);
});

test('copying an adjustment to the other colours keeps the rule and turn, and the base where it matches', async () => {
  const { transferSettings } = await import('../doc/recolor.mjs');
  const fills = collectColors([node('#CC3333'), node('#33CC33')]), strokes = collectColors([node('#3333CC'), node('#33CC33')]);
  const settings = { ...neutralSettings(fills), rule: 'triad', rotation: 40, scale: { saturation: .5, brightness: 1 }, adjust: { saturation: 0, brightness: -.2 }, library: 'web',
    base: fills.findIndex((c) => c.hex === '#33CC33'), overrides: { '#33CC33': { angle: 10 }, '#CC3333': { angle: 5 } } };
  const copied = transferSettings(settings, fills, strokes);
  assert.equal(copied.rule, 'triad'); assert.equal(copied.rotation, 40); assert.equal(copied.scale.saturation, .5); assert.equal(copied.adjust.brightness, -.2); assert.equal(copied.library, 'web');
  assert.equal(strokes[copied.base].hex, '#33CC33', 'the shared colour stays the base');
  assert.deepEqual(Object.keys(copied.overrides), ['#33CC33']);
  assert.equal(settings.rotation, 40, 'the source is not changed');
});

test('Colors reduces to fewer colours: groups by likeness, keeps each brightness, one handle a group', async () => {
  const { colorGroups } = await import('../doc/recolor.mjs');
  const colors = collectColors([node('#D02020'), node('#D02020'), node('#901818'), node('#2040D0'), node('#3050E0')]);
  assert.deepEqual(colorGroups(colors, null), colors.map((_, i) => i), 'Auto keeps every colour');
  const group = colorGroups(colors, 2), at = (hex) => colors.findIndex((c) => c.hex === hex);
  assert.equal(group[at('#901818')], at('#D02020'), 'dark red joins red, the most used');
  assert.equal(group[at('#3050E0')], group[at('#2040D0')]); assert.notEqual(group[at('#2040D0')], at('#D02020'));
  assert.equal(new Set(group).size, 2);
  const settings = { ...neutralSettings(colors), count: 2 }, wheels = wheelColors(colors, settings), red = hexWheel('#D02020');
  const dark = wheels[at('#901818')];
  assert.ok(circular(dark[0], red[0]) < 1e-6 && Math.abs(dark[1] - red[1]) < 1e-9, 'the group hue and saturation');
  assert.ok(Math.abs(dark[2] - hexWheel('#901818')[2]) < 1e-9, 'its own brightness');
  const turned = wheelColors(colors, { ...settings, rotation: 30 });
  assert.ok(circular(turned[at('#901818')][0], red[0] + 30) < 1e-6, 'the group turns together');
  assert.deepEqual(colorGroups(colors, 2), group, 'deterministic');
});

test('the theme picker finds the dominant colours of pixels', async () => {
  const { paletteFromPixels } = await import('../doc/recolor.mjs');
  const px = []; const put = (rgb, n) => { for (let i = 0; i < n; i++) px.push(...rgb, 255); };
  put([250, 10, 10], 60); put([245, 14, 12], 20); put([10, 10, 250], 30); put([20, 200, 20], 10); put([0, 0, 0], 0);
  px.push(255, 255, 0, 0); // transparent is skipped
  const palette = paletteFromPixels(new Uint8ClampedArray(px), 3);
  assert.equal(palette.length, 3);
  assert.ok(hexWheel(palette[0])[0] < 20 || hexWheel(palette[0])[0] > 340, `red covers most: ${palette}`);
  assert.ok(!palette.some((hex) => hexWheel(hex)[0] > 50 && hexWheel(hex)[0] < 110 && hexWheel(hex)[1] > .5 && hexWheel(hex)[2] > .9 && hex.startsWith('#FF')), 'no transparent yellow');
});
