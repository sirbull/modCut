/**
 * Pure Object menu rules for Compound Path (Mod+8, Mod+Shift+Alt+8) and Clipping Mask (Mod+7, Mod+Alt+7).
 * A compound path is one path whose subpaths are filled with the even-odd rule, so overlaps become holes.
 * A clipping mask is a group with `clip: true` whose topmost child (a path or shape) clips the rest.
 */
import { createNode } from './schema.mjs';
import { insertNode, moveNode, removeNode, updateNode } from './commands.mjs';
import { multiply, stackingOrder } from './arrange.mjs';
import { invert } from './clipboard.mjs';

const PAINTABLE = new Set(['path', 'shape']);
const objects = (doc, ids) => stackingOrder(doc, ids).filter((id) => doc.getNode(id)?.type !== 'layer');
function mapSubpath(subpath, [a, b, c, d, e, f]) {
  const point = ([x, y]) => [a * x + c * y + e, b * x + d * y + f], vector = ([x, y]) => [a * x + c * y, b * x + d * y];
  return { closed: subpath.closed, segments: subpath.segments.map((s) => ({ p: point(s.p), in: vector(s.in), out: vector(s.out) })) };
}
/** The paths and shapes a selection is made of, back to front; groups contribute their contents. */
function leaves(doc, members) {
  const result = [];
  for (const id of members) {
    const node = doc.getNode(id);
    const parts = PAINTABLE.has(node.type) ? [node] : node.children ? doc.descendants(id).filter((n) => !n.children) : [node];
    for (const part of parts) {
      if (part.type === 'text') throw new Error('Create outlines from text before making a compound path.');
      if (!PAINTABLE.has(part.type)) throw new Error('Compound paths can only be made from paths and shapes.');
      result.push(part.id);
    }
  }
  return result;
}
/**
 * Make Compound Path. `geometry.parentWorld(id)` is the world matrix of a node's parent and
 * `geometry.subpaths(id)` its subpaths in that parent's space (shapes expanded).
 */
export function compoundCommands(doc, ids, geometry) {
  const members = objects(doc, ids);
  if (!members.length) throw new Error('Select paths or shapes to make a compound path.');
  for (const id of members) if (!doc.isEditable(id)) throw new Error('Unlock and show the objects before making a compound path.');
  const parts = leaves(doc, members);
  if (!parts.length) throw new Error('Select paths or shapes to make a compound path.');
  const top = doc.locate(members.at(-1)), toTarget = invert(geometry.parentWorld(members.at(-1)));
  const subpaths = parts.flatMap((id) => geometry.subpaths(id).map((s) => mapSubpath(s, multiply(toTarget, geometry.parentWorld(id)))));
  // As in Illustrator, the compound path takes the paint of the backmost object.
  const back = doc.getNode(parts[0]);
  const node = createNode('path', { name: '', subpaths, fillRule: 'evenodd', appearance: structuredClone(back.appearance),
    opacity: back.opacity, blendMode: back.blendMode, ...(back.strokeScaling !== undefined ? { strokeScaling: back.strokeScaling } : {}) });
  return { commands: [insertNode(top.parentId, node, top.index + 1), ...members.map((id) => removeNode(id))], id: node.id };
}
/** Release Compound Path: one path per subpath, in place, each with the compound path's paint. */
export function releaseCompoundCommands(doc, ids) {
  const paths = stackingOrder(doc, ids).filter((id) => doc.getNode(id)?.type === 'path' && doc.getNode(id).subpaths.length > 1);
  if (!paths.length) throw new Error('Select a compound path to release.');
  const commands = [], released = [];
  for (const id of [...paths].reverse()) {
    if (!doc.isEditable(id)) throw new Error('Unlock and show the compound path before releasing it.');
    const node = doc.getNode(id), { parentId, index } = doc.locate(id);
    commands.push(removeNode(id));
    node.subpaths.forEach((subpath, i) => {
      const part = createNode('path', { name: '', subpaths: [structuredClone(subpath)], fillRule: 'nonzero', appearance: structuredClone(node.appearance),
        opacity: node.opacity, blendMode: node.blendMode, ...(node.strokeScaling !== undefined ? { strokeScaling: node.strokeScaling } : {}) });
      commands.push(insertNode(parentId, part, index + i)); released.push(part.id);
    });
  }
  return { commands, ids: released };
}
/** The clip group a node belongs to: itself, or its nearest clipping ancestor. */
export function clipGroupOf(doc, id) {
  const node = doc.getNode(id);
  if (node?.type === 'group' && node.clip) return id;
  return doc.ancestors(id).find((n) => n.type === 'group' && n.clip)?.id ?? null;
}
/** Make Clipping Mask: the topmost selected path or shape clips the others; it loses its fill and stroke. */
export function clipCommands(doc, ids) {
  const members = objects(doc, ids);
  if (members.length < 2) throw new Error('Select a path or shape on top of the objects to clip.');
  for (const id of members) if (!doc.isEditable(id)) throw new Error('Unlock and show the objects before making a clipping mask.');
  const mask = doc.getNode(members.at(-1));
  if (!PAINTABLE.has(mask.type)) throw new Error('The topmost selected object must be a path or shape to use as a clipping path.');
  // The group is made clipping last, after its contents are in place, so every step stays valid.
  const top = doc.locate(members.at(-1)), group = createNode('group', { name: '' });
  const commands = [insertNode(top.parentId, group, top.index + 1)];
  members.forEach((id, i) => commands.push(moveNode(id, group.id, i)));
  commands.push(updateNode(mask.id, { appearance: { ...structuredClone(mask.appearance), fills: [], strokes: [] } }, { label: 'Clipping Mask' }));
  commands.push(updateNode(group.id, { clip: true }, { label: 'Clipping Mask' }));
  return { commands, group };
}
/** Release Clipping Mask: the group stays, clipping stops; the clipping path keeps no fill or stroke. */
export function releaseClipCommands(doc, ids) {
  const groups = [...new Set(objects(doc, ids).map((id) => clipGroupOf(doc, id)).filter(Boolean))];
  if (!groups.length) throw new Error('Select a clipping mask to release.');
  for (const id of groups) if (!doc.isEditable(id)) throw new Error('Unlock and show the clipping mask before releasing it.');
  return groups.map((id) => updateNode(id, { clip: false }, { label: 'Release Clipping Mask' }));
}
