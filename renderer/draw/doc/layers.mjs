/** Pure layer rules: options, inherited template/print/outline state and Layers panel moves. */
import { createNode } from './schema.mjs';
import { insertNode, moveNode, removeNode, updateNode } from './commands.mjs';

// Illustrator-style identification colors, cycled for new layers.
export const LAYER_COLORS = Object.freeze(['#4F80FF', '#FF4F4F', '#4FD24F', '#4F4FFF', '#FFC800', '#FF4FFF', '#4FD2FF', '#8C8C8C', '#FF8000']);
export const ROOT_CONTEXT = Object.freeze({ template: false, printable: true, outline: false, dim: 1, color: null });

const layerCount = (doc) => doc.descendants(null).filter((n) => n.type === 'layer').length;
export function nextLayerColor(doc) { return LAYER_COLORS[layerCount(doc) % LAYER_COLORS.length]; }
export function newLayer(doc, properties = {}) {
  return createNode('layer', { name: `Layer ${layerCount(doc) + 1}`, color: nextLayerColor(doc), ...properties });
}

/** State a node inherits from its enclosing layers. Template layers are always previewed. */
export function layerContext(parent, node) {
  if (node.type !== 'layer') return parent;
  const template = parent.template || node.template;
  return Object.freeze({
    template,
    printable: parent.printable && node.printable && !node.template,
    outline: !template && (parent.outline || node.preview === false),
    dim: node.template || node.dimImages ? (node.dimImagesTo ?? 50) / 100 : parent.dim,
    color: node.color,
  });
}
export function nodeContext(doc, id) {
  const node = doc.getNode(id);
  if (!node) return ROOT_CONTEXT;
  return [...doc.ancestors(id).reverse(), node].reduce(layerContext, ROOT_CONTEXT);
}
/** Visible, printable artwork for later export and Send to Cut. Template layers never qualify. */
export function isOutputNode(doc, id) {
  const node = doc.getNode(id);
  return !!node && [node, ...doc.ancestors(id)].every((n) => n.visible) && nodeContext(doc, id).printable;
}

/** Normalise Layer Options; Template forces Lock, no Print and preview like Illustrator. */
export function layerOptionsPatch(layer, values) {
  const patch = {};
  for (const key of ['name', 'color', 'template', 'locked', 'visible', 'printable', 'preview', 'dimImages', 'dimImagesTo']) {
    if (values[key] !== undefined) patch[key] = values[key];
  }
  if (patch.dimImagesTo !== undefined && !(Number.isFinite(patch.dimImagesTo) && patch.dimImagesTo >= 0 && patch.dimImagesTo <= 100)) throw new Error('Dim images must be between 0 and 100%.');
  if (patch.color !== undefined && !/^#[0-9a-f]{6}$/i.test(patch.color)) throw new Error('Choose a valid layer color.');
  if (patch.color !== undefined) patch.color = patch.color.toUpperCase();
  if (patch.name !== undefined) patch.name = String(patch.name).trim() || layer.name;
  // Turning Template on dims images unless the same edit explicitly changed Dim Images.
  if (patch.template && !layer.template) Object.assign(patch, { locked: true, printable: false, preview: true, dimImages: patch.dimImages !== undefined && patch.dimImages !== !!layer.dimImages ? patch.dimImages : true });
  else if (patch.template) Object.assign(patch, { locked: patch.locked ?? true, printable: false, preview: true });
  for (const key of Object.keys(patch)) if (JSON.stringify(patch[key]) === JSON.stringify(layer[key])) delete patch[key];
  return patch;
}

/** Alt-click eye: show only this top-level layer, or show all again when it is already solo. */
export function soloUpdates(doc, layerId) {
  const layers = doc.data.layers, others = layers.filter((l) => l.id !== layerId);
  const solo = doc.getNode(layerId).visible && others.every((l) => !l.visible);
  return layers.map((l) => [l.id, solo ? true : l.id === layerId]).filter(([id, visible]) => doc.getNode(id).visible !== visible);
}

/** Destination for a Layers-panel drop. The panel lists the top of the stack first. */
export function dropTarget(doc, id, targetId, placement) {
  const target = doc.locate(targetId), node = doc.getNode(id);
  if (!target || !node || id === targetId) return null;
  if (doc.ancestors(targetId).some((n) => n.id === id)) return null;
  let parentId, index;
  if (placement === 'inside') {
    if (!doc.getNode(targetId).children || doc.getNode(targetId).type === 'compoundPath') return null;
    parentId = targetId; index = doc.getNode(targetId).children.length;
  } else {
    parentId = target.parentId; index = target.index + (placement === 'above' ? 1 : 0);
  }
  if (parentId === null && node.type !== 'layer') return null;
  const source = doc.locate(id);
  if (source.parentId === parentId && source.index < index) index -= 1;
  if (source.parentId === parentId && source.index === index) return null;
  return { parentId, index };
}
export const moveCommand = (doc, id, targetId, placement) => {
  const target = dropTarget(doc, id, targetId, placement);
  return target && moveNode(id, target.parentId, target.index);
};

/** Locked or hidden layers can still be deleted from Layers; the last top-level layer remains. */
export function deleteLayerCommands(doc, id) {
  const node = doc.getNode(id);
  if (node?.type !== 'layer') throw new Error('Choose a layer to delete.');
  if (doc.locate(id).parentId === null && doc.data.layers.length === 1) throw new Error('A document needs at least one layer.');
  if (doc.ancestors(id).some((n) => n.locked || !n.visible)) throw new Error('Unlock and show the parent layer first.');
  return [...(node.locked || !node.visible ? [updateNode(id, { locked: false, visible: true })] : []), removeNode(id)];
}

/** Collect in New Layer: a new sublayer, above the topmost item, containing the items in stacking order. */
export function collectCommands(doc, ids) {
  const items = ids.map((id) => doc.locate(id)).filter(Boolean);
  if (!items.length) throw new Error('Select objects to collect.');
  const parentId = items[0].parentId;
  if (parentId === null || items.some((e) => e.parentId !== parentId)) throw new Error('Collect objects from one layer or group at a time.');
  const ordered = [...items].sort((a, b) => a.index - b.index), layer = newLayer(doc);
  const commands = [insertNode(parentId, layer, ordered.at(-1).index + 1)];
  ordered.forEach((entry, i) => commands.push(moveNode(entry.node.id, layer.id, i)));
  return { layer, commands };
}
/** Release to Layers (Sequence): each direct item gets its own sublayer, preserving stacking order. */
export function releaseCommands(doc, layerId) {
  const layer = doc.getNode(layerId);
  if (layer?.type !== 'layer') throw new Error('Choose a layer to release.');
  const commands = [], created = [];
  layer.children.forEach((child, i) => {
    if (child.type === 'layer') return;
    const sub = createNode('layer', { name: `<${child.name || child.type}>`, color: layer.color });
    created.push(sub);
    commands.push(insertNode(layerId, sub, i), moveNode(child.id, sub.id, 0));
  });
  if (!commands.length) throw new Error('The layer has no objects to release.');
  return { created, commands };
}

// Named identification colors for Layer Options, as in Illustrator. The first nine are the cycle above.
export const NAMED_LAYER_COLORS = Object.freeze([
  ['Light Blue', '#4F80FF'], ['Red', '#FF4F4F'], ['Green', '#4FD24F'], ['Blue', '#4F4FFF'], ['Yellow', '#FFC800'],
  ['Magenta', '#FF4FFF'], ['Cyan', '#4FD2FF'], ['Gray', '#8C8C8C'], ['Orange', '#FF8000'], ['Black', '#000000'],
  ['Dark Green', '#006400'], ['Teal', '#008080'], ['Tan', '#CC9966'], ['Brown', '#993300'], ['Violet', '#9933FF'],
  ['Gold', '#FF9900'], ['Dark Blue', '#000080'], ['Pink', '#FF99CC'], ['Lavender', '#9999FF'], ['Brick Red', '#990000'],
  ['Olive Green', '#666600'], ['Peach', '#FF9966'], ['Burgundy', '#990033'], ['Grass Green', '#99CC00'],
  ['Ochre', '#996600'], ['Purple', '#660099'], ['Light Gray', '#CCCCCC'],
].map(([name, hex]) => Object.freeze({ name, hex })));
/** The named color for a hex value, or null for a custom ("Other") color. */
export function layerColorName(hex) {
  const value = String(hex || '').toUpperCase();
  return NAMED_LAYER_COLORS.find((c) => c.hex === value)?.name ?? null;
}

export const LAYER_FILTERS = Object.freeze(['all', 'layers', 'visible', 'locked']);
/**
 * Ids to show in the Layers panel for a search text and filter, or null when everything shows.
 * Matches keep their ancestors so the tree stays readable.
 */
export function filterLayerTree(doc, query = '', filter = 'all') {
  const text = String(query).trim().toLowerCase();
  if (!text && filter === 'all') return null;
  const label = (n) => (n.name || (n.type === 'layer' ? 'Layer' : `<${n.type}>`)).toLowerCase();
  const passes = (n) => (filter === 'layers' ? n.type === 'layer' : filter === 'visible' ? n.visible : filter === 'locked' ? n.locked : true)
    && (!text || label(n).includes(text));
  const shown = new Set();
  for (const node of doc.descendants(null)) {
    if (!passes(node)) continue;
    shown.add(node.id);
    for (const parent of doc.ancestors(node.id)) shown.add(parent.id);
  }
  return shown;
}
/** Delete one Layers panel row: a layer (with its contents) or a single object. */
export function deleteRowCommands(doc, id) {
  const node = doc.getNode(id);
  if (!node) throw new Error('Nothing to delete.');
  if (node.type === 'layer') return deleteLayerCommands(doc, id);
  if (!doc.isEditable(id)) throw new Error('Unlock and show the object first.');
  return [removeNode(id)];
}
