import { assertDocument, createDocument } from './schema.mjs';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

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
  /** Internal command boundary: validate a detached candidate before publishing it. */
  _edit(edit) {
    if (this.readOnly) throw new Error('Document is in read-only safe mode');
    const before = this.#data;
    const next = structuredClone(before);
    edit(next);
    this._restore(next);
    return { before, after: this.#data };
  }
  _restore(data) {
    assertDocument(data);
    const next = freeze(structuredClone(data));
    const index = new Map();
    function visit(nodes, parentId, path) {
      nodes.forEach((node, i) => {
        const nodePath = [...path, i];
        index.set(node.id, Object.freeze({ node, parentId, index: i, path: Object.freeze(nodePath) }));
        visit(node.children || [], node.id, [...nodePath, 'children']);
      });
    }
    visit(next.layers, null, ['layers']);
    this.#data = next;
    this.#index = index;
  }
}

export function findNode(data, id) {
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
