/** Turn Pathfinder results into document Commands: replace the operands with the new paths in one step. */
import { createNode } from './schema.mjs';
import { insertNode, removeNode } from './commands.mjs';
import { appearance as makeAppearance } from '../geometry.mjs';
import { paintHex } from './paint.mjs';

// Illustrator drops strokes from these results; Divide keeps them and Outline turns fills into strokes.
const STROKELESS = new Set(['trim', 'merge', 'crop']);
const OUTLINE_WIDTH = 25.4 / 72 / 4; // a quarter point, visible but thin

/** Operand ids sorted back to front by document stacking order. */
export function stackingOrder(doc, ids) {
  const order = new Map(doc.descendants(null).map((n, i) => [n.id, i]));
  return [...ids].sort((a, b) => order.get(a) - order.get(b));
}
/** The node whose look a result inherits: the node itself, or a group's first painted leaf. */
export function paintSource(doc, id) {
  const node = doc.getNode(id);
  if (node?.type === 'path' || node?.type === 'shape') return node;
  return doc.descendants(id).find((n) => (n.type === 'path' || n.type === 'shape')) ?? node;
}
export function fillHex(doc, id) { return paintHex(paintSource(doc, id)?.appearance?.fills?.[0]); }

export function pathfinderCommands(doc, ids, outcome, op, label) {
  if (!outcome.results.length) throw new Error(`${label} produced no shape. Check that the objects overlap.`);
  const ordered = stackingOrder(doc, ids), top = doc.locate(ordered.at(-1));
  const nodes = outcome.results.map((result) => {
    const source = paintSource(doc, result.sourceId), owner = doc.getNode(result.sourceId);
    const look = structuredClone(source?.appearance ?? { fills: [], strokes: [], effects: [] });
    if (result.kind === 'outline') {
      const color = paintHex(look.fills[0]) ?? paintHex(look.strokes[0]) ?? '#000000';
      look.fills = []; look.strokes = makeAppearance(null, color, OUTLINE_WIDTH).strokes;
    } else if (STROKELESS.has(op)) look.strokes = [];
    return createNode('path', { name: owner?.name || '', subpaths: result.subpaths, fillRule: 'nonzero', appearance: look,
      opacity: owner?.opacity ?? 1, blendMode: owner?.blendMode ?? 'normal' });
  });
  const inserted = outcome.grouped ? createNode('group', { name: label, children: nodes }) : nodes[0];
  const extra = outcome.grouped ? [] : nodes.slice(1);
  const commands = [insertNode(top.parentId, inserted, top.index + 1), ...extra.map((n, i) => insertNode(top.parentId, n, top.index + 2 + i)),
    ...ordered.map((id) => removeNode(id))];
  return { commands, ids: [inserted.id, ...extra.map((n) => n.id)] };
}
