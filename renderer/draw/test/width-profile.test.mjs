import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDTH_PROFILES, normalizeProfile, profileName, widthAt, variableStrokeRings, setWidthPoint, removeWidthPoint, moveWidthPoint, flipAlong, flipAcross } from '../geom/width-profile.mjs';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
// A straight line from (0,0) to (10,0); the left normal points up (y down on screen: -y).
const line = (n = 11) => Array.from({ length: n }, (_, i) => ({ p: [i * 10 / (n - 1), 0], n: [0, -1], t: i / (n - 1) }));

test('profiles: plain strokes are null, presets are recognised, flips mirror', () => {
  assert.equal(normalizeProfile([{ t: 0, left: .5, right: .5 }, { t: 1, left: .5, right: .5 }]), null);
  assert.equal(profileName(null), 'uniform'); assert.equal(profileName(WIDTH_PROFILES['profile-3'].points), 'profile-3');
  assert.equal(profileName(flipAlong(WIDTH_PROFILES['profile-3'].points)), 'profile-4');
  assert.deepEqual(flipAcross([{ t: 0, left: 1, right: 0 }]), [{ t: 0, left: 0, right: 1 }]);
});
test('width eases between points and is flat beyond the ends', () => {
  const p = WIDTH_PROFILES['profile-1'].points;
  assert.deepEqual(widthAt(p, 0), [0, 0]); assert.deepEqual(widthAt(p, .5), [.5, .5]); near(widthAt(p, .25)[0], .25);
  assert.deepEqual(widthAt([{ t: .5, left: 1, right: 1 }], .1), [1, 1]);
});
test('outline: open paths make one ring, closed paths two opposite rings, round caps bulge outwards', () => {
  const [ring] = variableStrokeRings(line(), 2, WIDTH_PROFILES['profile-3'].points);
  assert.deepEqual(ring[0], [0, -1]); near(ring[10][1], 0, 1e-9); assert.equal(ring.length, 22);
  const [round] = variableStrokeRings(line(), 2, null, { cap: 'round' });
  assert.ok(Math.max(...round.map((p) => p[0])) > 10.9 && Math.min(...round.map((p) => p[0])) < -.9, 'Both ends get a half circle beyond the path');
  const circle = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * 2 * Math.PI; return { p: [Math.cos(a) * 10, Math.sin(a) * 10], n: [-Math.cos(a), -Math.sin(a)], t: i / 64 }; });
  const rings = variableStrokeRings(circle, 2, null, { closed: true });
  assert.equal(rings.length, 2); near(Math.hypot(...rings[0][0]), 9); near(Math.hypot(...rings[1][0]), 11);
});
test('Width tool edits: add, snap to an existing point, one side, move and remove', () => {
  let { points, index } = setWidthPoint(null, { t: .5, share: 1 });
  assert.deepEqual(points.map((p) => p.t), [0, .5, 1]); assert.equal(index, 1); assert.deepEqual([points[1].left, points[1].right], [1, 1]);
  ({ points } = setWidthPoint(points, { t: .505, share: 2, side: 'left' }));
  assert.equal(points.length, 3, 'Near an existing point it is edited, not added'); assert.deepEqual([points[1].left, points[1].right], [2, 1]);
  points = moveWidthPoint(points, 1, 1.5); assert.equal(points[1].t, 1, 'A point stays between its neighbours');
  assert.equal(removeWidthPoint(points, 1), null, 'Without the wide point the stroke is plain again');
});

test('a closed rectangle corner tapers only along its adjacent sides and the seam is one width point',()=>{
  const options={closed:true,corners:[0,.25,.5,.75]};
  const {points}=setWidthPoint(null,{t:.75,share:5,...options});
  assert.deepEqual(points.map(p=>[p.t,p.left]),[[0,.5],[.25,.5],[.5,.5],[.75,5],[1,.5]]);
  assert.deepEqual(widthAt(points,.125,options),[.5,.5],'The opposite side stays at its original width');
  near(widthAt(points,.5625,options)[0],1.625);
  const seam=setWidthPoint(null,{t:1,share:3,...options}).points;
  assert.equal(seam[0].left,3);assert.equal(seam.at(-1).left,3);
  near(widthAt(seam,0,options)[0],widthAt(seam,1,options)[0]);
  near(widthAt(seam,1-1e-8,options)[0],3);
});

test('a mid-edge width point makes a smooth bulge with pointed corner ends and preserves earlier edits',()=>{
  const options={closed:true,corners:[0,.25,.5,.75]};
  const corner=setWidthPoint(null,{t:.75,share:5,...options}).points;
  const {points}=setWidthPoint(corner,{t:.375,share:8,...options});
  for(const point of corner)assert.deepEqual(points.find(p=>p.t===point.t),point,'Earlier corner widths stay fixed');
  near(widthAt(points,.125,options)[0],.5);
  near(widthAt(points,.625,options)[0],widthAt(corner,.625,options)[0]);
  near(widthAt(points,.28125,options)[0],.5+7.5*.4375);
  near(widthAt(points,.46875,options)[0],widthAt(points,.28125,options)[0]);
  near(widthAt(points,.375,options)[0],8);
  const delta=1e-6;
  near((widthAt(points,.375,options)[0]-widthAt(points,.375-delta,options)[0])/delta,0,.001);
  near((widthAt(points,.375+delta,options)[0]-widthAt(points,.375,options)[0])/delta,0,.001);
});

test('profiled rectangle outlines have real miter joins at all four corners including the closing seam',()=>{
  const vertices=[[0,0],[100,0],[100,100],[0,100],[0,0]],normals=[[0,-1],[1,0],[0,1],[-1,0]],samples=[];
  for(let side=0;side<4;side++)for(let j=0;j<=10;j++)samples.push({p:vertices[side].map((v,k)=>v+(vertices[side+1][k]-v)*j/10),n:normals[side],t:(side+j/10)/4});
  const options={closed:true,corners:[0,.25,.5,.75]},profile=setWidthPoint(null,{t:.75,share:5,...options}).points;
  const rings=variableStrokeRings(samples,2,profile,{...options,join:'miter'});
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  for(const ring of rings){let turns=0;
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],c=ring[(i+2)%ring.length];if(Math.abs(cross([b[0]-a[0],b[1]-a[1]],[c[0]-b[0],c[1]-b[1]]))>1e-5)turns++;}
    assert.equal(turns,4,'Tapered edges remain straight and meet without bevels');
    const top=ring.filter(p=>p[1]<10);assert.ok(top.every(p=>Math.abs(Math.abs(p[1])-1)<1e-6),'The top side retains the original 2 mm stroke');
    const right=ring.filter(p=>p[0]>90);assert.ok(right.every(p=>Math.abs(Math.abs(p[0]-100)-1)<1e-6),'The right side retains the original 2 mm stroke');
  }
});
