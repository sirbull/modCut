/** Transient selection is separate from document serialization and undo history. */
export class Selection {
  #doc;
  #ids = [];
  #anchors = [];
  #saved = new Map();
  constructor(doc) { this.#doc = doc; }
  get ids() { this.prune(); return [...this.#ids]; }
  get anchors() { this.prune(); return structuredClone(this.#anchors); }
  set(ids) {
    this.#ids = [...new Set(ids)].filter((id) => this.#doc.isEditable(id));
    this.#anchors = [];
  }
  setAnchors(anchors) {
    this.#anchors = structuredClone(anchors);
    this.prune();
    this.#ids = [...new Set(this.#anchors.map((anchor) => anchor.nodeId))];
  }
  prune() {
    this.#ids = this.#ids.filter((id) => this.#doc.isEditable(id));
    this.#anchors = this.#anchors.filter(({ nodeId, subpath, segment }) => {
      const node = this.#doc.getNode(nodeId);
      return this.#doc.isEditable(nodeId) && node.type === 'path'
        && Number.isInteger(subpath) && subpath >= 0 && Number.isInteger(segment) && segment >= 0
        && !!node.subpaths[subpath]?.segments[segment];
    });
  }
  clear() { this.#ids = []; this.#anchors = []; }
  save(name) { this.#saved.set(name, { ids: this.ids, anchors: this.anchors }); }
  restore(name) {
    const saved = this.#saved.get(name);
    if (!saved) return false;
    this.#ids = [...saved.ids]; this.#anchors = structuredClone(saved.anchors); this.prune();
    return true;
  }
  deleteSaved(name) { return this.#saved.delete(name); }
  get savedNames() { return [...this.#saved.keys()]; }
}
