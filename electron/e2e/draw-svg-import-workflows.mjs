import assert from 'node:assert/strict';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** D2.5: SVG gradients, clipping paths, embedded images and text arrive as editable Draw objects. */
export async function runDrawSvgImportWorkflows(client) {
  const { evaluate } = client, restore = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 140, height: 90, name: 'SVG import proof' });
  const result = await evaluate(`(async()=>{const w=${active},c=document.createElement('canvas');c.width=40;c.height=20;c.getContext('2d').fillRect(0,0,40,20);const png=c.toDataURL('image/png');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="60mm" viewBox="0 0 100 60">'
      +'<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff" stop-opacity="0.5"/></linearGradient>'
      +'<clipPath id="c1"><circle cx="70" cy="20" r="10"/></clipPath></defs>'
      +'<rect id="grad" x="5" y="5" width="40" height="20" fill="url(#g1)"/>'
      +'<rect id="clipped" x="55" y="5" width="30" height="30" fill="#00aa00" clip-path="url(#c1)"/>'
      +'<image x="5" y="30" width="20" height="10" xlink:href="'+png+'"/>'
      +'<text x="50" y="50" font-family="Arial" font-size="8" fill="#333333" text-anchor="middle">Hello</text></svg>';
    const out=await w.import({kind:'vector',svgText:svg},'Import proof');const d=w.state.document,b=d.data.artboards[0],all=d.descendants(null);
    const grad=all.find(n=>n.name==='grad'),clip=all.find(n=>n.type==='group'&&n.clip),image=all.find(n=>n.type==='image'),text=all.find(n=>n.type==='text');
    return {warning:out.warning,b:[b.x,b.y],grad:grad&&{paint:grad.appearance.fills[0].paint},
      clip:clip&&{kids:clip.children.map(n=>[n.type,n.name,n.appearance?.fills.length])},
      image:image&&{w:image.width,h:image.height,t:image.transform,asset:!!d.data.assets[image.assetId]},
      text:text&&{text:text.content.runs[0].text,size:text.character.fontSize,align:text.paragraph.alignment,t:text.transform,family:text.character.fontFamily}};})()`);
  assert.equal(result.warning ?? null, null, 'Nothing is rasterised');
  const [bx, by] = result.b, near = (a, b, label, tol = .05) => assert.ok(Math.abs(a - b) < tol, `${label}: ${a} vs ${b}`);
  // The gradient keeps type, stops (with opacity) and its vector across the rectangle.
  const g = result.grad.paint;
  assert.equal(g.type, 'linear'); assert.equal(g.stops.length, 2);
  assert.deepEqual(g.stops[0].color.values, [1, 0, 0]); near(g.stops[1].opacity, .5, 'stop opacity');
  near(g.origin[0], bx + 10 + 5, 'gradient start x'); near(g.length, 40, 'gradient length'); near(g.angle, 0, 'gradient angle');
  // The clipping path becomes a clipping group with an unpainted mask on top.
  assert.deepEqual(result.clip.kids.map(k => k[0]), ['path', 'path']);
  assert.equal(result.clip.kids[0][1], 'clipped'); assert.equal(result.clip.kids[1][2], 0);
  // The embedded image becomes an image node with its asset, at its place.
  assert.equal(result.image.asset, true); near(result.image.w, 20, 'image width'); near(result.image.h, 10, 'image height');
  near(result.image.t[4], bx + 10 + 5, 'image x'); near(result.image.t[5], by + 10 + 30, 'image y'); near(result.image.t[0], 1, 'image not rotated', 1e-6);
  // Text becomes point text at its baseline with size in points and the anchor as alignment.
  assert.equal(result.text.text, 'Hello'); assert.equal(result.text.align, 'center'); assert.equal(result.text.family, 'Arial');
  near(result.text.size, 8 / (25.4 / 72), 'font size in pt', .01);
  near(result.text.t[4], bx + 10 + 50, 'text x'); near(result.text.t[5], by + 10 + 50, 'text y');
  await restore();
  console.log('PASS Draw SVG import: gradients with stops and vector, clipping paths as clipping groups, embedded images as image nodes, text as point text, nothing rasterised');
}
