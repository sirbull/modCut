import assert from 'node:assert/strict';
import test from 'node:test';
import paper from 'paper';
import { createProjectDraw } from '../io/project.mjs';
import { createArtboard, createDocument } from '../doc/schema.mjs';
import { createDrawRenderer } from '../render.mjs';
import { RULER_UNITS, createGuideSnapper, guideReadout, guideReadoutText, guideSegment, rulerAt, rulerNumber, rulerScale, rulerTicks, rulerUnit } from '../view/rulers.mjs';

test('ruler units convert physical lengths and percentages independently on each artboard axis', () => {
  const board = { width: 200, height: 80 };
  for (const [id, length] of [['mm', 25.4], ['cm', 2.54], ['in', 1], ['px', 96], ['pt', 72], ['pc', 6]]) {
    assert.ok(Math.abs(25.4 / rulerScale(RULER_UNITS.find(unit => unit.id === id), board, 'x') - length) < 1e-9);
  }
  const percent = RULER_UNITS.find(unit => unit.id === '%');
  assert.equal(100 / rulerScale(percent, board, 'x'), 50);
  assert.equal(40 / rulerScale(percent, board, 'y'), 50);
  const state = createProjectDraw(createDocument({ units: 'in' }));
  assert.equal(rulerUnit(state).id, 'in');
  state.ui = { rulerUnit: '%' }; assert.equal(rulerUnit(state).id, '%');
});

test('zoom refines ticks into readable decimal values, handles negative/reversed axes and zero-sized views', () => {
  const major = ticks => ticks.filter(tick => tick.major);
  const wide = major(rulerTicks(0, 1000, 800)), close = major(rulerTicks(0, 2, 800));
  assert.ok(close[1].value - close[0].value < wide[1].value - wide[0].value);
  assert.ok(close.some(tick => !Number.isInteger(tick.value)));
  assert.ok(close.every(tick => !rulerNumber(tick.value).includes('e')));
  for (const [first, last] of [[-2, 2], [2, -2], [-.0002, .0002]]) {
    const ticks = rulerTicks(first, last, 800);
    assert.ok(ticks.length > 10 && ticks.length < 100);
    assert.ok(ticks.every(tick => tick.pixel >= -1e-6 && tick.pixel <= 800 + 1e-6));
    assert.ok(major(ticks).every(tick => rulerNumber(tick.value).length < 12));
  }
  assert.deepEqual(rulerTicks(0, 0, 0), []);
  assert.equal(rulerNumber(-1e-12), '0');
  assert.equal(rulerAt({ x: 100, y: 10 }, { width: 800, height: 600 }, true), 'y');
  assert.equal(rulerAt({ x: 10, y: 100 }, { width: 800, height: 600 }, true), 'x');
  assert.equal(rulerAt({ x: 100, y: 10 }, { width: 800, height: 600 }, false), null);
});

test('guides and pointer markers stay screen-sized after pan/zoom/rotation without entering the document or exports', t => {
  const state = createProjectDraw(createDocument({ artboards: [createArtboard({ x: 30, y: 40, width: 200, height: 80 })] }));
  state.ui = { rulers: true, rulerUnit: '%', rulerGuides: [{ axis: 'x', value: 130 }, { axis: 'y', value: 80 }] };
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(800, 600)); scope.view.autoUpdate = false;
  const renderer = createDrawRenderer(scope, state); renderer.render();
  t.after(() => { renderer.destroy(); scope.remove(); });
  const saved = JSON.stringify(state.snapshot()), exported = renderer.exportArtwork().exportJSON({ asString: true });
  const guides = scope.project.getItem({ name: 'Ruler guides' }), rulers = scope.project.getItem({ name: 'View rulers' });
  const markers = scope.project.getItem({ name: 'Ruler pointer' });
  for (const [zoom, rotation] of [[2, 0], [20, 30], [4, 90], [3, 135]]) {
    scope.view.zoom = zoom; scope.view.rotation = rotation; scope.view.center = [130, 80]; renderer.updateView();
    renderer.viewGuides.setPointer(new scope.Point(300, 250));
    assert.equal(markers.children.length, 2);
    for (const path of [...markers.children, ...guides.children]) {
      assert.equal(path.strokeWidth, 1);
      const screenMatrix = scope.view.matrix.clone().append(path.globalMatrix);
      assert.ok(Math.abs(screenMatrix.a - 1) < 1e-8 && Math.abs(screenMatrix.d - 1) < 1e-8);
    }
    for (const guide of state.ui.rulerGuides) {
      const segment = guideSegment(scope, guide, 23); assert.ok(segment);
      for (const p of segment) {
        assert.ok(p.x >= 23 - 1e-6 && p.x <= 800 + 1e-6 && p.y >= 23 - 1e-6 && p.y <= 600 + 1e-6);
        assert.ok(Math.abs(scope.view.viewToProject(p)[guide.axis] - guide.value) < 1e-8);
      }
    }
  }
  scope.view.rotation = 0; scope.view.zoom = 4; renderer.updateView();
  assert.ok(rulers.children.some(item => item.data.rulerAxis === 'x' && item.data.rulerValue === 50));
  assert.ok(rulers.children.some(item => item.data.rulerAxis === 'y' && item.data.rulerValue === 50));
  renderer.viewGuides.setGuidePreview({ axis: 'x', value: 140, source: state.ui.rulerGuides[0] });
  assert.equal(guides.children.length, 2, 'Preview replaces the existing guide visually');
  renderer.viewGuides.setGuidePreview(null);
  renderer.viewGuides.setPointer(null); assert.equal(markers.children.length, 0);
  state.ui.rulers = false; renderer.updateView();
  assert.equal(rulers.visible, false); assert.equal(guides.children.length, 2);
  assert.equal(JSON.stringify(state.snapshot()), saved); assert.equal(state.dirty, false); assert.equal(state.history.canUndo, false);
  assert.equal(renderer.exportArtwork().exportJSON({ asString: true }), exported);
});

test('dragged guides snap to quarters, thirds and the middle but let go when pulled past', () => {
  const board = { x: 30, y: 40, width: 200, height: 80 }, snapper = createGuideSnapper(), pixel = 4;
  assert.deepEqual(snapper.snap(129, board, 'x', pixel), { value: 130, fraction: .5 }, '4 px from 50 % snaps');
  assert.equal(snapper.snap(128.5, board, 'x', pixel).value, 130, 'held while pushing within the release distance');
  assert.deepEqual(snapper.snap(126.8, board, 'x', pixel), { value: 126.8, fraction: null }, 'pulling past lets go');
  assert.equal(snapper.snap(128, board, 'x', pixel).value, 128, 'a freed fraction does not catch values beside it (49 %)');
  snapper.snap(100, board, 'x', pixel);
  assert.equal(snapper.snap(129.5, board, 'x', pixel).value, 130, 'moving well away re-arms it');
  snapper.reset();
  assert.deepEqual(snapper.snap(96.4, board, 'x', pixel), { value: 30 + 1 / 3 * 200, fraction: 1 / 3 });
  assert.equal(snapper.snap(81, board, 'y', pixel, false).value, 81, 'Alt drags freely');
  snapper.reset({ value: 128, axis: 'x', board, pixel });
  assert.equal(snapper.snap(128, board, 'x', pixel).value, 128, 'grabbing a guide at 49 % keeps it there');
  snapper.reset({ value: 130, axis: 'x', board, pixel });
  assert.equal(snapper.snap(131, board, 'x', pixel).value, 130, 'a guide on 50 % stays snapped when grabbed');
});

test('guide readout gives percent, millimetres and inches from the artboard origin', () => {
  const board = { x: 30, y: 40, width: 200, height: 80 }, readout = guideReadout({ axis: 'y', value: 60 }, board);
  assert.equal(readout.percent, 25); assert.equal(readout.mm, 20); assert.ok(Math.abs(readout.inches - 20 / 25.4) < 1e-12);
  assert.equal(guideReadoutText({ axis: 'x', value: 130 }, board, '%'), 'Guide X  50 % · 100.0 mm · 3.937 in');
  assert.equal(guideReadoutText({ axis: 'x', value: 130 }, board, 'cm'), 'Guide X  100.0 mm · 50 % · 3.937 in');
});

test('the dragged guide is solid, pixel-aligned and labelled beside the line above the artwork', t => {
  const state = createProjectDraw(createDocument({ artboards: [createArtboard({ x: 0, y: 0, width: 200, height: 80 })] }));
  state.ui = { rulers: true, rulerGuides: [] };
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(800, 600)); scope.view.autoUpdate = false;
  const renderer = createDrawRenderer(scope, state); renderer.render();
  t.after(() => { renderer.destroy(); scope.remove(); });
  scope.view.zoom = 3.3; scope.view.center = [100, 40]; renderer.updateView();
  const pointer = scope.view.projectToView(new scope.Point(100, 40));
  renderer.viewGuides.setPointer(pointer);
  renderer.viewGuides.setGuidePreview({ axis: 'x', value: 100, label: '50 %  ·  100.0 mm', snapped: true });
  const [line] = scope.project.getItem({ name: 'Ruler guides' }).children, label = scope.project.getItem({ name: 'Ruler guide label' });
  assert.equal(line.dashArray.length, 0); assert.equal(line.strokeWidth, 1);
  const x = line.firstSegment.point.x;
  assert.ok(Math.abs(x - Math.floor(x) - .5) < 1e-6, 'centred on a pixel so the 1 px line is crisp');
  const [box, text] = label.children, bounds = box.bounds;
  assert.equal(text.content, '50 %  ·  100.0 mm');
  assert.ok(bounds.left > x && !bounds.contains(pointer), 'beside the line and off the pointer');
  assert.ok(label.isAbove(scope.project.getItem({ name: 'Ruler guides' })));
  renderer.viewGuides.setGuidePreview(null); assert.equal(label.children.length, 0);
});

test('both rulers always mark the artboard middle, in every unit and at every zoom', t => {
  const state = createProjectDraw(createDocument({ artboards: [createArtboard({ x: 30, y: 40, width: 200, height: 80 })] }));
  state.ui = { rulers: true };
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(800, 600)); scope.view.autoUpdate = false;
  const renderer = createDrawRenderer(scope, state); renderer.render();
  t.after(() => { renderer.destroy(); scope.remove(); });
  const rulers = scope.project.getItem({ name: 'View rulers' }), middle = new scope.Point(130, 80);
  for (const [unit, zoom] of [['%', 1.3], ['mm', 3.3], ['in', .7], ['px', 12], ['cm', 2]]) {
    state.ui.rulerUnit = unit; scope.view.zoom = zoom; scope.view.center = [140, 70]; renderer.updateView();
    const centre = scope.view.projectToView(middle);
    const marks = Object.fromEntries(rulers.children.filter(item => item.data.rulerMiddle).map(item => [item.data.rulerMiddle, item.firstSegment.point]));
    assert.ok(Math.abs(marks.x.x - centre.x) <= .5, `${unit} x`); assert.ok(Math.abs(marks.y.y - centre.y) <= .5, `${unit} y`);
  }
});
