/**
 * Graphic Styles (D4.5): named appearances (fills, strokes, effects, opacity and blending) stored in the
 * document's `graphicStyles`, applied to objects in one undo step. Pure: returns commands.
 */
import { updateDocument, updateNode } from './commands.mjs';
import { createId } from './schema.mjs';
import { appearance } from '../geometry.mjs';

export const DEFAULT_STYLE = Object.freeze({ id: 'default', name: '[Default]', appearance: appearance('#FFFFFF', '#000000', .353), opacity: 1, blendMode: 'normal' });
const STYLED = ['path', 'shape', 'text', 'group'];
/** The document's styles, the default one first. */
export const graphicStyles = (doc) => [DEFAULT_STYLE, ...(doc.data.graphicStyles ?? [])];
/** A new style from an object's look. */
export function styleFrom(node, name) {
  if (!node || !STYLED.includes(node.type)) throw new Error('Select a path, shape, text or group to make a graphic style from.');
  return { id: createId(), name: String(name || '').trim() || 'Graphic Style', appearance: structuredClone(node.appearance), opacity: node.opacity ?? 1, blendMode: node.blendMode ?? 'normal' };
}
export const addStyleCommand = (doc, style) => updateDocument({ graphicStyles: [...(doc.data.graphicStyles ?? []), style] }, { label: 'New Graphic Style' });
export function removeStyleCommand(doc, id) {
  if (id === DEFAULT_STYLE.id) throw new Error('The default graphic style cannot be deleted.');
  return updateDocument({ graphicStyles: (doc.data.graphicStyles ?? []).filter((s) => s.id !== id) }, { label: 'Delete Graphic Style' });
}
/** Commands that give `ids` the style's look; a group gets only its effects, opacity and blending. */
export function applyStyleCommands(doc, ids, style) {
  const targets = ids.filter((id) => STYLED.includes(doc.getNode(id)?.type) && doc.isEditable(id));
  if (!targets.length) throw new Error('Select objects to apply the graphic style to.');
  return targets.map((id) => {
    const node = doc.getNode(id), look = structuredClone(style.appearance);
    const next = node.type === 'group' ? { ...node.appearance, effects: look.effects ?? [] } : node.type === 'text' ? { ...look, effects: (look.effects ?? []).filter((e) => e.type === 'drop-shadow') } : look;
    return updateNode(id, { appearance: next, opacity: style.opacity ?? 1, blendMode: style.blendMode ?? 'normal' }, { label: 'Apply Graphic Style' });
  });
}
