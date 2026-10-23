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
  #batching = 0;
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
   * Many edits validated once (D4.6): inside `fn`, edits are published and indexed as usual but the document is
   * checked only at the end. If that check fails, the document goes back to how it was and the error is thrown,
   * as a failed transaction does. Nested batches are checked by the outermost one.
   */
  batch(fn) {
    const before = this.#data;
    this.#batching++;
    let result;
    try { result = fn(); }
    finally { this.#batching--; }
    if (!this.#batching && this.#data !== before) {
      try { assertDocument(this.#data, { trusted: validNodes }); }
      catch (error) { this._restore(before); throw error; }
      const mark = (nodes) => { for (const node of nodes) { if (validNodes.has(node)) continue; validNodes.add(node); mark(node.children ?? []); } };
      mark(this.#data.layers);
    }
    return result;
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
    // In a batch, new nodes are checked (and then trusted) when the batch ends.
    const batching = this.#batching > 0 && owned, trust = batching ? () => {} : (node) => validNodes.add(node);
    if (!batching) assertDocument(data, { trusted: validNodes });
    const next = freeze(owned || Object.isFrozen(data) ? data : structuredClone(data));
    // After an edit the published index is updated in place: validation has passed, so nothing below throws.
    const index = previous && previous === this.#data ? this.#index : new Map();
    function visit(nodes, parentId, path) {
      nodes.forEach((node, i) => {
        const nodePath = [...path, i];
        index.set(node.id, Object.freeze({ node, parentId, index: i, path: Object.freeze(nodePath) }));
        trust(node);
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
        // Only the part between an unchanged start and an unchanged end can differ (an insert at the end of a
        // long list compares references, then looks at one node).
        let start = 0, endB = before.length, endA = after.length;
        while (start < endB && start < endA && before[start] === after[start]) start++;
        while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) { endB--; endA--; }
        const shifted = before.length !== after.length;
        const kept = new Set(after.slice(start, endA));
        for (let i = start; i < endB; i++) { const node = before[i]; if (!kept.has(node) && !(after[i]?.id === node.id)) forget(node, `${path.join('.')}.${i}`); }
        after.forEach((node, i) => {
          if (i < start || (i >= endA && !shifted)) return;
          const old = before[i], nodePath = [...path, i];
          if (old === node) return;
          if (old?.id === node.id) {
            index.set(node.id, Object.freeze({ node, parentId, index: i, path: Object.freeze(nodePath) })); trust(node);
            if (node.children || old.children) walk(old.children ?? [], node.children ?? [], node.id, [...nodePath, 'children']);
          } else visitAt(node, parentId, nodePath);
        });
      };
      const visitAt = (node, parentId, nodePath) => {
        index.set(node.id, Object.freeze({ node, parentId, index: nodePath.at(-1), path: Object.freeze(nodePath) })); trust(node);
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
