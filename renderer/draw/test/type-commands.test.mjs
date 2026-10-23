import test from 'node:test';
import assert from 'node:assert/strict';
import { INSERT_CHARACTERS, areaTypeValues, changeCase, placeholderFit, pointTypeValues, rewriteRuns, smartPunctuation } from '../doc/type-commands.mjs';

const plain = text => [{ text }];
const join = runs => runs.map(r => r.text).join('');

test('rewriteRuns keeps the styles of untouched characters', () => {
  const runs = [{ text: 'ab' }, { text: 'cd', character: { fontSize: 30 } }];
  assert.deepEqual(rewriteRuns(runs, [{ from: 1, to: 3, text: 'XYZ' }]), [{ text: 'aXYZ' }, { text: 'd', character: { fontSize: 30 } }]);
  assert.deepEqual(rewriteRuns(runs, [{ from: 2, to: 3, text: 'Q' }]), [{ text: 'ab' }, { text: 'Qd', character: { fontSize: 30 } }]);
});

test('changeCase covers the four Illustrator modes', () => {
  const text = "hello WORLD. don't stop";
  assert.equal(join(changeCase(plain(text), 'upper')), "HELLO WORLD. DON'T STOP");
  assert.equal(join(changeCase(plain(text), 'lower')), "hello world. don't stop");
  assert.equal(join(changeCase(plain(text), 'title')), "Hello World. Don't Stop");
  assert.equal(join(changeCase(plain(text), 'sentence')), "Hello world. Don't stop");
  assert.equal(join(changeCase(plain('abc def'), 'upper', 4, 7)), 'abc DEF', 'only the selected characters');
  assert.equal(join(changeCase(plain('straße'), 'upper')), 'STRASSE');
  assert.deepEqual(changeCase([{ text: 'a' }, { text: 'b', character: { fontSize: 9 } }], 'upper'), [{ text: 'A' }, { text: 'B', character: { fontSize: 9 } }]);
  assert.throws(() => changeCase(plain('x'), 'shout'));
});

test('smartPunctuation curls quotes and joins dashes and dots', () => {
  assert.equal(join(smartPunctuation(plain(`"It's" -- 'ok'... --- (end)`))), '“It’s” – ‘ok’… — (end)');
  assert.equal(join(smartPunctuation(plain('a--b "c"'), 0, 4)), 'a–b "c"', 'only the range');
});

test('placeholderFit cuts after the last whole word', () => {
  assert.equal(placeholderFit('Lorem ipsum dolor', 13), 'Lorem ipsum');
  assert.equal(placeholderFit('Lorem ipsum', 99), 'Lorem ipsum');
  assert.equal(placeholderFit('Loremipsum', 3), 'Lor');
});

test('insert commands map to their characters', () => {
  assert.equal(INSERT_CHARACTERS['insert-em-dash'], '—');
  assert.equal(INSERT_CHARACTERS['insert-nonbreaking-space'], ' ');
});

const font = { ascent: 8, descent: -2 };
const base = { leading: 12, fontSize: 10, alignment: 'left', orientation: 'horizontal' };
test('point text becomes a frame that fits its lines, moved up one ascent', () => {
  const { values, offset } = areaTypeValues({ ...base, kind: 'point', text: 'ab\ncd', runs: plain('ab\ncd') }, { font, lineWidths: [30, 20] });
  assert.equal(values.kind, 'area');
  assert.ok(values.frameWidth >= 30 && values.frameWidth < 30.1);
  assert.ok(values.frameHeight >= 12 * 25.4 / 72 + 10);
  assert.equal(values.orientation, undefined);
  assert.deepEqual(offset, [0, -8]);
  assert.ok(Math.abs(areaTypeValues({ ...base, alignment: 'center', kind: 'point', text: 'ab' }, { font, lineWidths: [30] }).offset[0] + 15) < .01);
  assert.throws(() => areaTypeValues({ ...base, kind: 'point', orientation: 'vertical', text: 'a' }, { font, lineWidths: [1] }), /Vertical/);
});

test('area text becomes point text with a break at each wrap', () => {
  const text = 'one two\nthree four', layout = { font, glyphs: [
    { line: 0, index: 0 }, { line: 1, index: 4 }, { line: 2, index: 8 }, { line: 3, index: 14 }] };
  const { values, offset } = pointTypeValues({ ...base, alignment: 'right', kind: 'area', frameWidth: 40, frameHeight: 50, text, runs: plain(text) }, layout);
  assert.equal(values.text, 'one\ntwo\nthree\nfour');
  assert.equal(values.kind, 'point');
  assert.equal(values.frameWidth, undefined);
  assert.deepEqual(offset, [40, 8]);
});
