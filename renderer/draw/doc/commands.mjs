import { CONTAINERS } from './schema.mjs';
import { findNode } from './document.mjs';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (value) => value !== null && typeof value === 'object';
// A node copied once and frozen can be placed in the document as it is, and placed again on redo.
const frozenCopy = (value) => { const deep = (v) => { if (isObject(v) && !Object.isFrozen(v)) { Object.values(v).forEach(deep); Object.freeze(v); } return v; }; return deep(structuredClone(value)); };
/** Patches between two snapshots; shared (identical) objects are skipped, so only edited paths are walked. */
function differences(before, after, path = [], result = []) {
  if (before === after) return result;
  if (isObject(before) && isObject(after) && Array.isArray(before) === Array.isArray(after)
      && (!Array.isArray(before) || before.length === after.length)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) differences(before[key], after[key], [...path, key], result);
  } else if (isObject(before) || isObject(after) || before !== after) result.push({ path, before, after });
  return result;
}
// Patch values are parts of frozen snapshots, so they are shared rather than copied.
function applyPatches(data, patches, direction) {
  for (const patch of patches) {
    const parent = patch.path.slice(0, -1).reduce((value, key) => value[key], data);
    const key = patch.path.at(-1), value = patch[direction];
    if (value === undefined) delete parent[key];
    else parent[key] = value;
  }
}

/** Patches retain changed values, rather than whole-document snapshots per undo step. */
class EditCommand {
  constructor(label, edit, { mergeKey = null, nodeIds = [] } = {}) {
    this.label = label;
    this.edit = edit;
    this.mergeKey = mergeKey;
    this.nodeIds = [...nodeIds];
    this.patches = null;
  }
  do(doc) {
    if (this.patches) doc._edit((data) => applyPatches(data, this.patches, 'after'));
    else {
      const { before, after } = doc._edit(this.edit);
      this.patches = differences(before, after);
    }
  }
  undo(doc) { doc._edit((data) => applyPatches(data, this.patches, 'before')); }
  merge(next) {
    if (!(next instanceof EditCommand) || !this.mergeKey || this.mergeKey !== next.mergeKey
        || !equal(this.patches.map((p) => p.path), next.patches.map((p) => p.path))) return null;
    const merged = new EditCommand(next.label, null, { mergeKey: this.mergeKey, nodeIds: [...new Set([...this.nodeIds, ...next.nodeIds])] });
    merged.patches = this.patches.map((patch, i) => ({ ...patch, after: next.patches[i].after }));
    return merged;
  }
}
function requireNode(data, id) {
  const entry = findNode(data, id);
  if (!entry) throw new Error(`Unknown node: ${id}`);
  return entry;
}
function children(data, parentId) {
  if (parentId === null) return data.layers;
  const { node } = requireNode(data, parentId);
  if (!CONTAINERS.includes(node.type)) throw new Error('Parent must be a container');
  return node.children;
}
function indexAt(index, length) {
  const value = index === undefined ? length : index;
  if (!Number.isInteger(value) || value < 0 || value > length) throw new RangeError('Invalid insertion index');
  return value;
}
function editable(data, id) {
  let entry = requireNode(data, id);
  while (entry) {
    if (entry.node.locked || !entry.node.visible) throw new Error('Node or parent is locked or hidden');
    entry = entry.parentId === null ? null : requireNode(data, entry.parentId);
  }
}
export function insertNode(parentId, node, index) {
  const copy = frozenCopy(node);
  return new EditCommand('Insert', (data) => {
    if (parentId !== null) editable(data, parentId);
    const list = children(data, parentId);
    list.splice(indexAt(index, list.length), 0, copy);
  }, { nodeIds: [node.id, parentId].filter(Boolean) });
}
export function removeNode(id) {
  return new EditCommand('Delete', (data) => {
    editable(data, id);
    const { siblings, index } = requireNode(data, id);
    siblings.splice(index, 1);
  }, { nodeIds: [id] });
}
export function updateNode(id, properties, { label = 'Edit', mergeKey = null } = {}) {
  if (['id', 'type', 'children'].some((key) => Object.hasOwn(properties, key))) throw new Error('Identity and children must use structural commands');
  const copy = structuredClone(properties);
  return new EditCommand(label, (data) => {
    const entry = requireNode(data, id);
    // Visibility/lock changes remain available from Layers even for locked nodes.
    if (Object.keys(copy).some((key) => !['locked', 'visible'].includes(key))) editable(data, id);
    Object.assign(entry.node, structuredClone(copy));
  }, { nodeIds: [id], mergeKey });
}
/**
 * Many updates as one edit (D4.6): `[[id, properties], ...]`, each checked as `updateNode` checks it. One edit
 * walks the document once, where one command per object would walk it once per object.
 */
export function updateNodes(entries, { label = 'Edit', mergeKey = null } = {}) {
  const copies = entries.map(([id, properties]) => {
    if (['id', 'type', 'children'].some((key) => Object.hasOwn(properties, key))) throw new Error('Identity and children must use structural commands');
    return [id, structuredClone(properties)];
  });
  return new EditCommand(label, (data) => {
    for (const [id, copy] of copies) {
      const entry = requireNode(data, id);
      if (Object.keys(copy).some((key) => !['locked', 'visible'].includes(key))) editable(data, id);
      Object.assign(entry.node, structuredClone(copy));
    }
  }, { nodeIds: copies.map(([id]) => id), mergeKey });
}
/** Several inserts as one edit: `[[parentId, node, index], ...]`, applied in order. */
export function insertNodes(entries) {
  const copies = entries.map(([parentId, node, index]) => [parentId, frozenCopy(node), index]);
  return new EditCommand('Insert', (data) => {
    for (const [parentId, copy, index] of copies) {
      if (parentId !== null) editable(data, parentId);
      const list = children(data, parentId);
      list.splice(indexAt(index, list.length), 0, copy);
    }
  }, { nodeIds: copies.flatMap(([parentId, node]) => [node.id, parentId]).filter(Boolean) });
}
export function moveNode(id, parentId, index) {
  return new EditCommand('Move', (data) => {
    editable(data, id);
    if (parentId !== null) editable(data, parentId);
    const entry = requireNode(data, id);
    let parent = parentId;
    while (parent !== null) {
      if (parent === id) throw new Error('Cannot move a node into itself or its descendants');
      parent = requireNode(data, parent).parentId;
    }
    entry.siblings.splice(entry.index, 1);
    const target = children(data, parentId);
    // Index is the desired position in the destination after removal.
    target.splice(indexAt(index, target.length), 0, entry.node);
  }, { nodeIds: [id, parentId].filter(Boolean) });
}
export function insertArtboard(board, index) {
  const copy = structuredClone(board);
  return new EditCommand('New Artboard', (data) => data.artboards.splice(indexAt(index, data.artboards.length), 0, structuredClone(copy)), { nodeIds: [board.id] });
}
export function updateArtboard(id, properties) {
  if (Object.hasOwn(properties, 'id')) throw new Error('Artboard id is immutable');
  const copy = structuredClone(properties);
  return new EditCommand('Edit Artboard', (data) => {
    const board = data.artboards.find((item) => item.id === id);
    if (!board) throw new Error(`Unknown artboard: ${id}`);
    Object.assign(board, structuredClone(copy));
  }, { nodeIds: [id] });
}
export function removeArtboard(id) {
  return new EditCommand('Delete Artboard', (data) => {
    const index = data.artboards.findIndex((board) => board.id === id);
    if (index < 0) throw new Error(`Unknown artboard: ${id}`);
    data.artboards.splice(index, 1);
  }, { nodeIds: [id] });
}
/** Expand a leaf while retaining its identity, stacking position and undo data. */
export function replaceLeaf(id, replacement) {
  const copy=structuredClone(replacement);
  if(copy.id!==id || copy.children)throw new Error('Replacement must retain leaf identity');
  return new EditCommand('Expand Shape',data=>{
    editable(data,id);const entry=requireNode(data,id);
    if(entry.node.children)throw new Error('Cannot replace a container');
    entry.siblings[entry.index]=structuredClone(copy);
  },{nodeIds:[id]});
}
export function reorderArtboard(id, index) {
  return new EditCommand('Reorder Artboard', data => {
    const from = data.artboards.findIndex(board => board.id === id);
    if (from < 0 || !Number.isInteger(index) || index < 0 || index >= data.artboards.length) throw new Error('Invalid artboard order');
    const [board] = data.artboards.splice(from,1); data.artboards.splice(index,0,board);
  }, {nodeIds:[id]});
}
/** History > snapshot: the whole document becomes `data` again (an earlier, frozen state), as one undo step. */
export function revertTo(data, { label = 'Revert to Snapshot' } = {}) {
  return new EditCommand(label, (draft) => {
    for (const key of Object.keys(draft)) if (!Object.hasOwn(data, key)) delete draft[key];
    for (const key of Object.keys(data)) draft[key] = data[key];
  }, { nodeIds: [] });
}
export function updateDocument(properties, { label = 'Document Setup' } = {}) {
  const allowed = ['name', 'units', 'rasterEffectsPpi', 'colorMode', 'settings', 'swatches', 'swatchGroups', 'graphicStyles', 'assets', 'guides', 'cutLinks', 'exportAssets'];
  if (Object.keys(properties).some((key) => !allowed.includes(key))) throw new Error('Unsupported document property');
  const copy = structuredClone(properties);
  return new EditCommand(label, (data) => Object.assign(data, structuredClone(copy)));
}
