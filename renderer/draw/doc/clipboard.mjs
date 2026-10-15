/**
 * Draw clipboard: copied objects are stored in world coordinates (their full transform baked into the
 * top-level transform) with the image assets they use, so they paste into any tab, layer or group.
 * Pure: callers pass world matrices from the renderer and run the returned Commands in one transaction.
 */
import { createId } from './schema.mjs';
import { insertNode, updateDocument } from './commands.mjs';
import { multiply, stackingOrder } from './arrange.mjs';

export function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error('Cannot paste into a collapsed group.');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det].map((v) => v + 0); // no -0
}
const translate = ([dx, dy]) => [1, 0, 0, 1, dx, dy];
function freshIds(node) {
  const copy = structuredClone(node); copy.id = createId();
  if (copy.children) copy.children = copy.children.map(freshIds);
  return copy;
}
function assetIds(node, out = new Set()) {
  if (node.type === 'image' && node.assetId) out.add(node.assetId);
  node.children?.forEach((child) => assetIds(child, out));
  return out;
}
/** @param worldMatrix id -> [a,b,c,d,e,f]; @param bounds world bounds {x,y,width,height} of the copied objects. */
export function copyNodes(doc, ids, worldMatrix, bounds) {
  const ordered = stackingOrder(doc, ids).filter((id) => doc.getNode(id)?.type !== 'layer');
  if (!ordered.length) throw new Error('Select objects to copy.');
  const nodes = ordered.map((id) => ({ ...structuredClone(doc.getNode(id)), transform: [...worldMatrix(id)] }));
  const assets = {};
  for (const node of nodes) for (const id of assetIds(node)) if (doc.data.assets[id]) assets[id] = structuredClone(doc.data.assets[id]);
  const center = bounds ? [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2] : [0, 0];
  const board = doc.data.artboards.find((b) => center[0] >= b.x && center[0] <= b.x + b.width && center[1] >= b.y && center[1] <= b.y + b.height) ?? doc.data.artboards[0];
  return Object.freeze({ nodes, assets, center, board: board ? [board.x, board.y] : [0, 0] });
}
/**
 * Insert copies under `parentId` at `index`, moved by `offset` (world mm). `parentWorld` is the target
 * parent's world matrix. Returns the Commands and the new top-level ids, in stacking order.
 */
export function pasteCommands(doc, clip, { parentId, index, offset = [0, 0], parentWorld = [1, 0, 0, 1, 0, 0] }) {
  if (!clip?.nodes?.length) throw new Error('Nothing to paste.');
  const local = invert(parentWorld), commands = [], ids = [];
  const missing = Object.fromEntries(Object.entries(clip.assets).filter(([id]) => !doc.data.assets[id]));
  if (Object.keys(missing).length) commands.push(updateDocument({ assets: { ...doc.data.assets, ...missing } }));
  clip.nodes.forEach((node, i) => {
    const copy = freshIds(node);
    copy.transform = multiply(local, multiply(translate(offset), node.transform));
    commands.push(insertNode(parentId, copy, index + i)); ids.push(copy.id);
  });
  return { commands, ids };
}
let current = null;
/** One clipboard for all Draw tabs in this window. */
export const drawClipboard = { get: () => current, set: (clip) => { current = clip; } };
