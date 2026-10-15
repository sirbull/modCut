import { createArtboard, createId } from '../doc/schema.mjs';
import { insertArtboard, updateArtboard, removeArtboard, reorderArtboard, insertNode, updateNode } from '../doc/commands.mjs';
import { activeArtboard, artboardLayout } from '../doc/artboards.mjs';
import { transformProperties } from '../geometry.mjs';

export function createArtboardController(state, api) {
  const boards = () => state.document.data.artboards;
  const active = () => activeArtboard(state);
  function choose(id, fit = false) {
    if (!state.document.getArtboard(id)) return;
    state.ui.artboardId = id; api.refresh(); if (fit) api.fit(id);
  }
  function members(board) {
    return state.document.data.layers.flatMap(layer => layer.children).filter(node => {
      if (!state.document.isEditable(node.id)) return false;
      const b = api.bounds(node.id);
      return b && b.center.x >= board.x && b.center.x <= board.x+board.width && b.center.y >= board.y && b.center.y <= board.y+board.height;
    }).map(node => node.id);
  }
  function moveArtwork(ids, dx, dy, copy = false) {
    for (const id of ids) {
      const node = state.document.getNode(id), matrix = api.localMatrix(id,[1,0,0,1,dx,dy]);
      const properties = transformProperties(node,matrix);
      if (copy) {
        const clone = structuredClone({...node,...properties});
        const reid = n => { n.id = createId(); n.children?.forEach(reid); }; reid(clone);
        state.history.execute(insertNode(state.document.locate(id).parentId,clone));
      } else state.history.execute(updateNode(id,properties,{label:'Move Artboard Artwork'}));
    }
  }
  function add(properties = {}) {
    const previous = active(), board = createArtboard({name:`Artboard ${boards().length+1}`,width:previous.width,height:previous.height,x:previous.x+previous.width+20,y:previous.y,...properties});
    state.history.execute(insertArtboard(board)); choose(board.id); return board.id;
  }
  function edit(id, properties, {copy = false, artwork = state.ui.moveArtwork !== false} = {}) {
    const board = state.document.getArtboard(id); if (!board) return;
    const ids = artwork ? members(board) : [], dx = (properties.x ?? board.x)-board.x, dy = (properties.y ?? board.y)-board.y;
    let nextId = id;
    state.history.transaction(copy ? 'Duplicate Artboard' : 'Edit Artboard',() => {
      if (copy) {
        const clone = createArtboard({...board,...properties,id:createId(),name:`${board.name} copy`});
        nextId = clone.id; state.history.execute(insertArtboard(clone));
      } else state.history.execute(updateArtboard(id,properties));
      if (artwork && (copy || dx || dy)) moveArtwork(ids,dx,dy,copy);
    });
    choose(nextId); return nextId;
  }
  return {active,choose,members,add,edit,
    duplicate() { const a=active(); return edit(a.id,{x:a.x+a.width+20},{copy:true}); },
    remove() { if (boards().length <= 1) throw new Error('Keep at least one artboard.'); state.history.execute(removeArtboard(active().id)); choose(active().id); },
    order(offset) { const index=boards().findIndex(b=>b.id===active().id), to=index+offset; if (to>=0 && to<boards().length) state.history.execute(reorderArtboard(active().id,to)); },
    rearrange(options) {
      const originals=boards(), positions=artboardLayout(originals,options), assignments=originals.map(members);
      const assigned=new Set();
      state.history.transaction('Rearrange Artboards',() => originals.forEach((board,i) => {
        state.history.execute(updateArtboard(board.id,{x:positions[i].x,y:positions[i].y}));
        if (state.ui.moveArtwork !== false) {
          const ids=assignments[i].filter(id=>!assigned.has(id)); ids.forEach(id=>assigned.add(id));
          moveArtwork(ids,positions[i].x-board.x,positions[i].y-board.y);
        }
      })); api.refresh();
    },
  };
}
