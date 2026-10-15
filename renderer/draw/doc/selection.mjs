/** Transient selection is separate from document serialization and undo history. */
import { editablePath } from '../geom/corners.mjs';
export const shapeSelectionKey=node=>JSON.stringify([node.shape,node.params,node.transform]);
function shapeAnchorCount(node) {
  const p=node.params;
  if(node.shape==='rect')return 8;
  if(node.shape==='ellipse'){
    const raw=(p.endAngle??360)-(p.startAngle??0),sweep=((raw%360)+360)%360;
    return Math.abs(raw)>=360||sweep<1e-9?4:Math.ceil(sweep/90)+2;
  }
  return node.shape==='line'?2:node.shape==='polygon'?(p.sides??6):node.shape==='star'?2*(p.points??5):0;
}
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
    this.#anchors = this.#anchors.filter(({ nodeId, subpath, segment, shapeKey,logical }) => {
      const node = this.#doc.getNode(nodeId);
      if(!this.#doc.isEditable(nodeId)||!Number.isInteger(subpath)||subpath<0||!Number.isInteger(segment)||segment<0)return false;
      return node.type==='shape'?subpath===0&&shapeKey===shapeSelectionKey(node)&&segment<shapeAnchorCount(node)
        :node.type==='path'&&!!node.subpaths[subpath]&&!!(logical?editablePath(node.subpaths[subpath]):node.subpaths[subpath]).segments[segment];
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
