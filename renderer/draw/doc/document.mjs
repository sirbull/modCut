import { assertDocument, createDocument } from './schema.mjs';
import { createDraft } from './draft.mjs';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Nodes of published snapshots: frozen and already validated, so validation skips them next time.
const validNodes = new WeakSet();
// The published index while an edit runs, so lookups do not search the whole tree.
let hint = null;

/** Model snapshots are immutable; only Commands call the internal edit/restore boundary. */
export class DrawDocument {
  #data;
  #index;
  #readOnly;
  constructor(data = createDocument(), { readOnly = false } = {}) {
    this.#readOnly = readOnly;
    this._restore(data);
  }
  get readOnly() { return this.#readOnly; }
  get data() { return this.#data; }
  toJSON() { return structuredClone(this.#data); }
  serialize() { return JSON.stringify(this.#data); }
  getNode(id) { return this.#index.get(id)?.node || null; }
  locate(id) { return this.#index.get(id) || null; }
  getArtboard(id) { return this.#data.artboards.find((board) => board.id === id) || null; }
  descendants(id) {
    const result = [];
    const visit = (nodes) => { for (const n of nodes) { result.push(n); visit(n.children || []); } };
    visit(id === null ? this.#data.layers : this.getNode(id)?.children || []);
    return result;
  }
  ancestors(id) {
    const result = [];
    let entry = this.locate(id);
    while (entry?.parentId) { entry = this.locate(entry.parentId); result.push(entry.node); }
    return result;
  }
  isEditable(id) {
    const node = this.getNode(id);
    return !!node && [node, ...this.ancestors(id)].every((item) => item.visible && !item.locked);
  }
  /**
   * Internal command boundary: the edit works on a copy-on-write draft, so only the changed paths are new
   * objects, and the candidate is validated (untouched nodes were validated before) before it is published.
   */
  _edit(edit) {
    if (this.readOnly) throw new Error('Document is in read-only safe mode');
    const before = this.#data, { draft, finish } = createDraft(before);
    hint = this.#index;
    try { edit(draft); } finally { hint = null; }
    this._restore(finish(), { owned: true, previous: before });
    return { before, after: this.#data };
  }
  /** `owned`: a finished draft (new objects around shared, frozen ones); a frozen snapshot needs no copy either. */
  _restore(data, { owned = false, previous = null } = {}) {
    assertDocument(data, { trusted: validNodes });
    const next = freeze(owned || Object.isFrozen(data) ? data : structuredClone(data));
    const index = previous && previous === this.#data ? new Map(this.#index) : new Map();
    function visit(nodes, parentId, path) {
      nodes.forEach((node, i) => {
        const nodePath = [...path, i];
        index.set(node.id, Object.freeze({ node, parentId, index: i, path: Object.freeze(nodePath) }));
        validNodes.add(node);
        visit(node.children || [], node.id, [...nodePath, 'children']);
      });
    }
    if (previous && previous === this.#data) {
      // After an edit only the changed child lists are walked: an identical list means an identical subtree,
      // and a node at the same place keeps its entry. Moved and new nodes are entered again; removed ones go.
      const removed = [];
      const forget = (node, path) => { removed.push([node.id, path]); (node.children ?? []).forEach((c, i) => forget(c, `${path}.children.${i}`)); };
      const walk = (before, after, parentId, path) => {
        if (before === after) return;
        const kept = new Set(after);
        before.forEach((node, i) => { if (!kept.has(node) && !(after[i]?.id === node.id)) forget(node, `${path.join('.')}.${i}`); });
        after.forEach((node, i) => {
          const old = before[i], nodePath = [...path, i];
          if (old === node) return;
          if (old?.id === node.id) {
            index.set(node.id, Object.freeze({ node, parentId, index: i, path: Object.freeze(nodePath) })); validNodes.add(node);
            if (node.children || old.children) walk(old.children ?? [], node.children ?? [], node.id, [...nodePath, 'children']);
          } else visitAt(node, parentId, nodePath);
        });
      };
      const visitAt = (node, parentId, nodePath) => {
        index.set(node.id, Object.freeze({ node, parentId, index: nodePath.at(-1), path: Object.freeze(nodePath) })); validNodes.add(node);
        visit(node.children || [], node.id, [...nodePath, 'children']);
      };
      walk(previous.layers, next.layers, null, ['layers']);
      for (const [id, path] of removed) if (index.get(id)?.path.join('.') === path) index.delete(id);
    } else visit(next.layers, null, ['layers']);
    this.#data = next;
    this.#index = index;
  }
}

/**
 * Lookup in data being edited: the published index's path is tried first (checked by id), then a search.
 */
export function findNode(data, id) {
  const entry = hint?.get(id);
  if (entry) {
    let value = data, siblings = null;
    for (const key of entry.path) { siblings = value; value = value?.[key]; }
    if (value?.id === id) {
      let parent = data; for (const key of entry.path.slice(0, -2)) parent = parent?.[key];
      return { node: value, siblings, index: entry.path.at(-1), parentId: entry.path.length > 2 ? parent.id : null };
    }
  }
  function search(nodes, parentId) {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.id === id) return { node, siblings: nodes, index, parentId };
      const found = search(node.children || [], node.id);
      if (found) return found;
    }
    return null;
  }
  return search(data.layers, null);
}
