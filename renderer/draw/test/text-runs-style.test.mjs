import test from 'node:test';
import assert from 'node:assert/strict';
import { characterAt, runCharacter, styleRange } from '../doc/text.mjs';

test('styling a range splits runs, merges settings, removes with null and joins equal runs', () => {
  assert.deepEqual(styleRange([{ text: 'Hello' }], 1, 2, { rotation: 30 }), [{ text: 'H' }, { text: 'e', character: { rotation: 30 } }, { text: 'llo' }]);
  const runs = [{ text: 'He', character: { fontSize: 10 } }, { text: 'llo' }];
  assert.deepEqual(styleRange(runs, 1, 3, { rotation: 30, fontSize: null }), [{ text: 'H', character: { fontSize: 10 } }, { text: 'el', character: { rotation: 30 } }, { text: 'lo' }]);
  assert.deepEqual(styleRange([{ text: 'ab', character: { xShift: 2 } }], 0, 2, { xShift: null }), [{ text: 'ab' }]);
  const node = { character: { fontSize: 12 }, content: { runs: [{ text: 'a' }, { text: 'b', character: { rotation: 5 } }] } };
  assert.equal(characterAt(node, 1).rotation, 5); assert.equal(characterAt(node, 1).fontSize, 12); assert.equal(characterAt(node, 0).rotation, undefined);
  assert.throws(() => runCharacter({ rotation: 400 }), /rotation/); assert.deepEqual(runCharacter({ xShift: -3 }), { xShift: -3 });
});
test('the schema accepts Touch Type run settings', async () => {
  const { createDocument, createNode, validateDocument } = await import('../doc/schema.mjs');
  const text = createNode('text', { content: { runs: [{ text: 'a' }, { text: 'b', character: { rotation: -90, xShift: 3 } }] }, character: { fontFamily: 'Arial', fontSize: 12, leading: 14, fontWeight: 'normal', fontStyle: 'normal' }, paragraph: { alignment: 'left' } });
  assert.deepEqual(validateDocument(createDocument({ layers: [createNode('layer', { children: [text] })] })), []);
});
