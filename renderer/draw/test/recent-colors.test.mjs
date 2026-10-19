import test from 'node:test';
import assert from 'node:assert/strict';
import { recentColors, rememberRecentColor } from '../doc/recent-colors.mjs';

const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
};
test('recent colors persist, normalize and move reused colors to the front', () => {
  const saved = storage();
  rememberRecentColor('#abc', [], saved);
  rememberRecentColor('#112233', [], saved);
  assert.deepEqual(recentColors([], saved), ['#112233','#AABBCC']);
  rememberRecentColor('#aabbcc', [], saved);
  assert.deepEqual(recentColors([], saved), ['#AABBCC','#112233']);
  for (let i = 0; i < 15; i++) rememberRecentColor(`#${i.toString(16).padStart(6,'0')}`, [], saved);
  assert.equal(recentColors([], saved).length, 10);
  assert.equal(recentColors([], saved)[0], '#00000E');
});
test('malformed and inaccessible storage retains usable session history', () => {
  const saved = storage(); saved.setItem('modcut_recent_colors', JSON.stringify(['bad color','#abc','#AABBCC',null]));
  assert.deepEqual(recentColors(['#123456'], saved), ['#AABBCC','#123456']);
  saved.setItem('modcut_recent_colors', '{broken');
  assert.deepEqual(recentColors(['#123456'], saved), ['#123456']);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(rememberRecentColor('#abcdef', ['#123456'], blocked), ['#ABCDEF','#123456']);
});
