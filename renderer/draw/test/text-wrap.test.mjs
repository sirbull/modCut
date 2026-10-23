import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapText } from '../doc/text-wrap.mjs';

const length=text=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length;
test('wrapping keeps paragraphs, drops wrap whitespace and breaks long words without losing letters',()=>{
  assert.deepEqual(wrapText('one two three\n\nlast',7,length),['one two','three','','last']);
  assert.deepEqual(wrapText('one     two',4,length),['one','two']);
  assert.deepEqual(wrapText('long-word',5,length),['long-','word']);
  assert.deepEqual(wrapText('abcdefghij',3,length),['abc','def','ghi','j']);
  assert.deepEqual(wrapText('abcdef',100,length),['abcdef']);
});
test('emergency breaks preserve combining marks and emoji graphemes, including a too narrow frame',()=>{
  const cluster='a\u030a',emoji='👩‍👩‍👧‍👦';
  assert.deepEqual(wrapText(cluster+cluster+emoji,1,length),[cluster,cluster,emoji]);
  assert.deepEqual(wrapText('ab',.1,length),['a','b']);
  let work=0;const text='x'.repeat(10000);
  assert.equal(wrapText(text,3,t=>{work+=t.length;return t.length;}).join(''),text);
  assert.ok(work<text.length*8,'A narrow frame does not repeatedly shape the entire remaining paragraph');
});
