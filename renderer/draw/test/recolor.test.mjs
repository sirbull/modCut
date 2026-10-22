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
