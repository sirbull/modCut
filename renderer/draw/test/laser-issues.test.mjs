import test from 'node:test';
import assert from 'node:assert/strict';
import { laserIssueAdvice, laserPreviewIssues } from '../view/laser-issues.mjs';

test('unresolved preview guidance distinguishes process setup from unsupported output', () => {
  for (const reason of ['missing-process-settings','missing-process-layer','missing-output-setting','inconsistent-global-operation','invalid-operation'])
    assert.match(laserIssueAdvice(reason), /Laser processes/);
  assert.match(laserIssueAdvice('expand-appearance'), /appearance on a copy/);
  assert.match(laserIssueAdvice('expand-stroke'), /stroke on a copy/);
  assert.match(laserIssueAdvice('text-layout'), /fonts or text overflow/);
  assert.match(laserIssueAdvice('raster-dither'), /dithering/);
  assert.match(laserIssueAdvice('future-reason'), /Review this object in Cut/);
});

test('issue list identifies only unresolved objects and preserves document names and data', () => {
  const nodes = [{id:'a',name:'<script>artwork</script>',type:'path'},{id:'b',type:'image'},{id:'c',type:'group'},{id:'d',type:'path'},{id:'e',type:'path'}];
  const before = structuredClone(nodes);
  const statuses = ['unresolved','unresolved','container','resolved','excluded'];
  const issues = laserPreviewIssues({descendants:()=>nodes}, id => ({status:statuses[nodes.findIndex(n=>n.id===id)],reason:'raster-dither'}));
  assert.deepEqual(issues.map(i=>[i.id,i.name]), [['a','<script>artwork</script>'],['b','image']]);
  assert.deepEqual(nodes,before);
});
