/** Pure rules for the Eyedropper, Measure and Group Selection tools. */
import { updateNode } from './commands.mjs';

const PAINTED = new Set(['path', 'shape', 'text']);
/** What the Eyedropper copies from an object: fills, strokes, opacity and blending mode. */
export function sampleAppearance(node) {
  if (!PAINTED.has(node?.type)) throw new Error('The Eyedropper samples paths, shapes and text.');
  return { appearance: structuredClone(node.appearance), opacity: node.opacity, blendMode: node.blendMode };
}
/** Apply a sample to objects, one Commands list; groups pass it to every painted object inside. */
export function applySampleCommands(doc, ids, sample) {
  const targets = [...new Set(ids.flatMap((id) => { const n = doc.getNode(id); return n?.children ? doc.descendants(id).filter((c) => PAINTED.has(c.type)).map((c) => c.id) : [id]; }))]
    .filter((id) => PAINTED.has(doc.getNode(id)?.type) && doc.isEditable(id));
  return targets.map((id) => updateNode(id, { appearance: structuredClone(sample.appearance), opacity: sample.opacity, blendMode: sample.blendMode }, { label: 'Eyedropper' }));
}
/** Measure: distance, offsets and the angle counterclockwise from the x axis, as Illustrator's Info panel. */
export function measure(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const angle = Math.hypot(dx, dy) < 1e-12 ? 0 : Math.atan2(dy === 0 ? 0 : -dy, dx) * 180 / Math.PI;
  return { distance: Math.hypot(dx, dy), dx, dy, angle: Math.round(angle * 1e6) / 1e6 + 0 };
}
/**
 * Group Selection: the first click picks the object itself; each further click on it picks one group
 * level up, stopping below the layer (or below the isolated group).
 */
export function groupSelectionTarget(doc, hitId, selection = [], isolation = null) {
  const chain = [hitId, ...doc.ancestors(hitId).filter((n) => n.type !== 'layer').map((n) => n.id)];
  const stop = isolation ? chain.indexOf(isolation) : -1, levels = stop >= 0 ? chain.slice(0, stop) : chain;
  const current = selection.length === 1 ? levels.indexOf(selection[0]) : -1;
  return current >= 0 && current + 1 < levels.length ? levels[current + 1] : levels[current >= 0 ? current : 0];
}
