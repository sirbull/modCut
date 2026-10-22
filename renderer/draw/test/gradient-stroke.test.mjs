import test from 'node:test';
import assert from 'node:assert/strict';
import { gradientStrokeBands } from '../geom/gradient-stroke.mjs';
import { setWidthPoint } from '../geom/width-profile.mjs';
import { defaultGradient, opacityAt, setStrokeMode, setGradientType, applyGradientPreset, GRADIENT_PRESETS, updateStop } from '../doc/gradient.mjs';
import { createDocument, createNode, validateDocument } from '../doc/schema.mjs';
import { appearance } from '../geometry.mjs';
import { changeGradient } from '../doc/gradient.mjs';

// A straight line from (0,0) to (10,0); paper.js normals are the tangent turned to (y, -x), here (0,-1).
const line = Array.from({ length: 11 }, (_, i) => ({ p: [i, 0], n: [0, -1], t: i / 10 }));
const xs = (ring) => ring.map((p) => p[0]), ys = (ring) => ring.map((p) => p[1]);

test('gradient bands use the same local closed-corner taper as solid strokes',()=>{
  const vertices=[[0,0],[100,0],[100,100],[0,100],[0,0]],normals=[[0,-1],[1,0],[0,1],[-1,0]],samples=[];
  for(let side=0;side<4;side++)for(let j=0;j<=16;j++)samples.push({p:vertices[side].map((v,k)=>v+(vertices[side+1][k]-v)*j/16),n:normals[side],t:(side+j/16)/4});
  samples.pop();
  const options={closed:true,corners:[0,.25,.5,.75]},profile=setWidthPoint(null,{t:.75,share:5,...options}).points;
  for(const mode of ['along','across']){
    const pixels=gradientStrokeBands(samples,2,profile,{...options,mode,opaque:false}).flatMap(b=>b.rings.flat());
    const left=pixels.filter(p=>Math.abs(p[1]-75)<1e-8&&p[0]<0);
    assert.ok(left.length>0);assert.ok(Math.abs(Math.min(...left.map(p=>p[0]))+7.75)<1e-6,`${mode} keeps the linear corner taper`);
  }
});

test('along: bands follow the path from start to end, each with its own colour offset', () => {
  const bands = gradientStrokeBands(line, 2, null, { mode: 'along', opaque: false });
  assert.ok(bands.length >= 16);
  bands.forEach((band, k) => {
    assert.ok(Math.abs(band.t - (k + .5) / bands.length) < 1e-9);
    const x = xs(band.rings[0]); assert.ok(Math.min(...x) >= k / bands.length * 10 - 1e-9 && Math.max(...x) <= (k + 1) / bands.length * 10 + 1e-9, `band ${k} stays in its share`);
    assert.deepEqual([Math.min(...ys(band.rings[0])), Math.max(...ys(band.rings[0]))], [-1, 1], 'full width');
  });
  const overlapping = gradientStrokeBands(line, 2, null, { mode: 'along', opaque: true });
  assert.ok(Math.max(...xs(overlapping[0].rings[0])) > 10 / overlapping.length + 1e-6, 'opaque bands overlap the next one');
});

test('across: bands run from the left edge to the right, the whole length', () => {
  const bands = gradientStrokeBands(line, 2, null, { mode: 'across', opaque: false });
  assert.ok(bands.length >= 8);
  const first = bands[0].rings[0], last = bands.at(-1).rings[0];
  assert.ok(Math.min(...ys(first)) < -.99 && Math.max(...ys(first)) < 0, 'first band at the left edge (normal side)');
  assert.ok(Math.max(...ys(last)) > .99 && Math.min(...ys(last)) > 0, 'last band at the right edge');
  assert.deepEqual([Math.min(...xs(first)), Math.max(...xs(first))], [0, 10]);
  const square = gradientStrokeBands(line, 2, null, { mode: 'across', cap: 'square' })[0].rings[0];
  assert.deepEqual([Math.min(...xs(square)), Math.max(...xs(square))], [-1, 11], 'square caps lengthen each band');
});

test('closed paths and caps', () => {
  const circle = Array.from({ length: 32 }, (_, i) => { const a = i / 32 * Math.PI * 2; return { p: [Math.cos(a) * 10, Math.sin(a) * 10], n: [Math.cos(a), Math.sin(a)], t: i / 32 }; });
  const across = gradientStrokeBands(circle, 2, null, { mode: 'across', closed: true });
  assert.equal(across[0].rings.length, 2, 'a closed band is a ring with a hole');
  const along = gradientStrokeBands(circle, 2, null, { mode: 'along', closed: true, opaque: false });
  const end = along.at(-1).rings[0]; assert.ok(end.some((p) => Math.abs(p[1]) < 1e-6 && p[0] > 0), 'the last band closes back to the start');
  const round = gradientStrokeBands(line, 2, null, { mode: 'along', cap: 'round' });
  assert.deepEqual(round.slice(0, 2).map((b) => b.t), [0, 1], 'caps first, in the end colours');
  assert.ok(Math.min(...xs(round[0].rings[0])) < -.99 && Math.max(...xs(round[1].rings[0])) > 10.99);
  assert.deepEqual(gradientStrokeBands(line.slice(0, 1), 2, null, { mode: 'along' }), []);
  assert.deepEqual(gradientStrokeBands(line, 0, null, { mode: 'along' }), []);
});

test('stroke mode on the gradient: kept through refits, validated, opacity between stops', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };
  const g = setStrokeMode(defaultGradient(box), 'along');
  assert.equal(g.strokeMode, 'along'); assert.equal(setStrokeMode(g, 'within').strokeMode, undefined);
  assert.throws(() => setStrokeMode(g, 'sideways'), /within, along or across/);
  assert.equal(setGradientType(g, 'radial', box).strokeMode, 'along');
  assert.equal(applyGradientPreset(g, GRADIENT_PRESETS.find((p) => p.gradient.type === 'radial').gradient, box).strokeMode, 'along');
  assert.equal(opacityAt(updateStop(g, 1, { opacity: 0 }), .5), .5);
  const look = changeGradient(appearance(null, '#000000'), 'stroke', g);
  const doc = createDocument({ layers: [createNode('layer', { children: [createNode('path', { appearance: look })] })] });
  assert.deepEqual(validateDocument(doc), []);
  look.strokes[0].paint.strokeMode = 'sideways';
  assert.ok(validateDocument(createDocument({ layers: [createNode('layer', { children: [createNode('path', { appearance: look })] })] })).some((e) => /strokeMode/.test(e.path)));
});
