import assert from 'node:assert/strict';
import test from 'node:test';
import { multiply, transformProperties } from '../geometry.mjs';
import { createNode } from '../doc/schema.mjs';
test('path transforms bake into anchors and handles without translating handle vectors', () => {
  const node = createNode('path',{subpaths:[{closed:false,segments:[{p:[2,3],in:[-1,2],out:[1,0]}]}]});
  assert.deepEqual(transformProperties(node,[2,0,0,3,10,20]).subpaths[0].segments[0],{p:[14,29],in:[-2,6],out:[2,0]});
  assert.deepEqual(node.subpaths[0].segments[0].p,[2,3]);
});
test('shape/group transforms compose translation and scale in the correct order', () => {
  const node = createNode('shape',{transform:[1,0,0,1,10,20]});
  assert.deepEqual(transformProperties(node,[2,0,0,3,0,0]),{transform:[2,0,0,3,20,60]});
  assert.deepEqual(multiply([1,0,0,1,10,20],[2,0,0,3,0,0]),[2,0,0,3,10,20]);
});
