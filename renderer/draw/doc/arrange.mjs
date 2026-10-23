/** Pure Object menu rules: Group, Ungroup, Arrange, Lock/Unlock All and Hide/Show All, as Commands. */
import { createNode } from './schema.mjs';
import { insertNode, moveNode, removeNode, updateNode } from './commands.mjs';

const CONTAINERS = new Set(['layer', 'group', 'compoundPath']);
/** Compose two affine matrices [a, b, c, d, e, f]: the result applies `child` first, then `parent`. */
export function multiply(parent, child) {
  const [a, b, c, d, e, f] = parent, [A, B, C, D, E, F] = child;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}
export function stackingOrder(doc, ids) {
  const order = new Map(doc.descendants(null).map((n, i) => [n.id, i]));
  return [...new Set(ids)].filter((id) => order.has(id)).sort((a, b) => order.get(a) - order.get(b));
}
const objects = (doc, ids) => stackingOrder(doc, ids).filter((id) => doc.getNode(id)?.type !== 'layer');

/** Group (Mod+G): the group takes the topmost object's place; members keep their stacking order. */
export function groupCommands(doc, ids) {
  const members = objects(doc, ids);
  if (!members.length) throw new Error('Select objects to group.');
  for (const id of members) if (!doc.isEditable(id)) throw new Error('Unlock and show the objects before grouping.');
  const top = doc.locate(members.at(-1)), group = createNode('group', { name: '' });
  const commands = [insertNode(top.parentId, group, top.index + 1)];
  members.forEach((id, i) => commands.push(moveNode(id, group.id, i)));
  return { commands, group };
}
/** Ungroup (Mod+Shift+G): children replace the group in place and keep their look (group transform and opacity carried over). */
export function ungroupCommands(doc, ids) {
  const groups = stackingOrder(doc, ids).filter((id) => doc.getNode(id)?.type === 'group');
  if (!groups.length) throw new Error('Select a group to ungroup.');
  const commands = [], released = [];
  // Topmost first: releasing a group only shifts indices above it, so lower groups keep their positions.
  for (const id of [...groups].reverse()) {
    const group = doc.getNode(id);
    if (!doc.isEditable(id)) throw new Error('Unlock and show the group before ungrouping.');
    const { parentId, index } = doc.locate(id);
    group.children.forEach((child, i) => {
      const patch = {};
      if (group.transform.some((v, j) => v !== [1, 0, 0, 1, 0, 0][j])) patch.transform = multiply(group.transform, child.transform);
      if (group.opacity !== 1) patch.opacity = child.opacity * group.opacity;
      if (Object.keys(patch).length) commands.push(updateNode(child.id, patch));
      // Each child lands where the group was; the group moves up one place each time.
      commands.push(moveNode(child.id, parentId, index + i));
      released.push(child.id);
    });
    commands.push(removeNode(id));
  }
  return { commands, released };
}
/**
 * Arrange within each parent: 'front', 'forward', 'backward', 'back'. Returns the new child order per
 * parent as moveNode Commands; objects already at the edge stay, and selected neighbours move together.
 */
export function arrangeCommands(doc, ids, how) {
  if (!['front', 'forward', 'backward', 'back'].includes(how)) throw new Error(`Unknown arrange: ${how}`);
  const selected = new Set(objects(doc, ids)), byParent = new Map();
  for (const id of selected) { const { parentId } = doc.locate(id); if (!byParent.has(parentId)) byParent.set(parentId, []); }
  const commands = [];
  for (const parentId of byParent.keys()) {
    const siblings = (parentId === null ? doc.data.layers : doc.getNode(parentId).children).map((n) => n.id);
    let order = [...siblings];
    if (how === 'front') order = [...order.filter((id) => !selected.has(id)), ...order.filter((id) => selected.has(id))];
    else if (how === 'back') order = [...order.filter((id) => selected.has(id)), ...order.filter((id) => !selected.has(id))];
    else if (how === 'forward') { for (let i = order.length - 2; i >= 0; i--) if (selected.has(order[i]) && !selected.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]]; }
    else for (let i = 1; i < order.length; i++) if (selected.has(order[i]) && !selected.has(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]];
    // Only selected objects move, so locked neighbours never block. Each one is inserted just before the
    // next object that is already where it belongs (an unselected or already placed one).
    const current = [...siblings], placed = new Set();
    for (const id of order.filter((x) => selected.has(x))) {
      const from = current.indexOf(id); current.splice(from, 1);
      const after = order.slice(order.indexOf(id) + 1).find((x) => !selected.has(x) || placed.has(x));
      const to = after === undefined ? current.length : current.indexOf(after);
      current.splice(to, 0, id); placed.add(id);
      if (to !== from) commands.push(moveNode(id, parentId, to));
    }
  }
  return commands;
}
export function lockCommands(doc, ids) { return objects(doc, ids).map((id) => updateNode(id, { locked: true })); }
export function hideCommands(doc, ids) { return objects(doc, ids).map((id) => updateNode(id, { visible: false })); }
/** Unlock All / Show All reach objects in any layer, but leave layers themselves alone. */
export function unlockAllCommands(doc) { return doc.descendants(null).filter((n) => n.type !== 'layer' && n.locked).map((n) => updateNode(n.id, { locked: false })); }
export function showAllCommands(doc) { return doc.descendants(null).filter((n) => n.type !== 'layer' && !n.visible).map((n) => updateNode(n.id, { visible: true })); }
export const isContainer = (node) => CONTAINERS.has(node?.type);
