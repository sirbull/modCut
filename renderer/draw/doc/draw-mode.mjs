/**
 * Draw Normal, Draw Behind and Draw Inside (Shift+D cycles), as at the bottom of Illustrator's toolbar.
 * Normal puts new objects on top; Behind puts them under the selected object, or at the bottom of the
 * layer; Inside puts them in a clipping group under the chosen path or shape, which keeps its own fill
 * and stroke (unlike Make Clipping Mask).
 */
import { createNode } from './schema.mjs';
import { insertNode, moveNode, updateNode } from './commands.mjs';

export const DRAW_MODES = Object.freeze(['normal', 'behind', 'inside']);
export const DRAW_MODE_LABELS = Object.freeze({ normal: 'Draw Normal', behind: 'Draw Behind', inside: 'Draw Inside' });
export function nextDrawMode(mode) { return DRAW_MODES[(DRAW_MODES.indexOf(mode) + 1) % DRAW_MODES.length]; }

/** The path or shape new objects are drawn inside, from a selection of one object or one clipping group. */
export function insideTarget(doc, ids) {
  const objects = ids.filter((id) => doc.getNode(id) && doc.getNode(id).type !== 'layer');
  if (objects.length !== 1) throw new Error('Select one path or shape to draw inside.');
  let node = doc.getNode(objects[0]);
  if (node.type === 'group' && node.clip) node = node.children.at(-1);
  if (!node || !['path', 'shape'].includes(node.type)) throw new Error('Draw Inside needs a path or shape.');
  if (!doc.isEditable(node.id)) throw new Error('Unlock and show the object before drawing inside it.');
  return node.id;
}

/**
 * Where a new object goes in `mode`: `{ parentId, index, commands }`. `commands` run first (Draw Inside
 * wraps the target in a clipping group the first time). `index` undefined means on top.
 */
export function placement(doc, mode, { parentId, selection = [], insideId = null } = {}) {
  if (mode === 'inside' && insideId && doc.getNode(insideId)) {
    const { parentId: owner, index } = doc.locate(insideId), group = doc.getNode(owner);
    // Already a clipping path: new objects go on top of the contents, under the clipping path.
    if (group?.type === 'group' && group.clip && group.children.at(-1).id === insideId) return { parentId: owner, index: group.children.length - 1, commands: [] };
    const wrapper = createNode('group', { name: '' });
    return { parentId: wrapper.id, index: 0, commands: [insertNode(owner, wrapper, index + 1), moveNode(insideId, wrapper.id, 0), updateNode(wrapper.id, { clip: true }, { label: 'Draw Inside' })], group: wrapper.id };
  }
  if (mode === 'behind') {
    const ids = selection.filter((id) => doc.getNode(id) && doc.getNode(id).type !== 'layer');
    if (ids.length === 1) {
      const { parentId: owner, index } = doc.locate(ids[0]);
      if (owner !== null && doc.isEditable(owner)) return { parentId: owner, index, commands: [] };
    }
    return { parentId, index: 0, commands: [] };
  }
  return { parentId, index: undefined, commands: [] };
}
