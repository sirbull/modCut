/** Small retained renderer for the initial Draw workspace. Paper is a view, never the model. */
export function createDrawRenderer(scope, state, { onImageLoad = () => {} } = {}) {
  const boards = new scope.Layer({ name: 'Artboards' });
  const artwork = new scope.Layer({ name: 'Draw artwork' });
  const overlay = new scope.Layer({ name: 'Selection' });
  const items = new Map(), fingerprints = new Map();
  function color(paint) {
    if (!paint || paint.type === 'none') return null;
    if (paint.type !== 'solid') return null;
    const c = paint.color, v = c.values;
    if (c.space === 'rgb') return new scope.Color(...v);
    if (c.space === 'gray') return new scope.Color(v[0]);
    if (c.space === 'cmyk') return new scope.Color(...v.slice(0,3).map(n => (1-n)*(1-v[3])));
    return new scope.Color({ hue: v[0]*360, saturation: v[1], brightness: v[2] });
  }
  function path(data) {
    return new scope.Path({ insert: false, closed: data.closed, segments: data.segments.map(s =>
      new scope.Segment(new scope.Point(...s.p), new scope.Point(...s.in), new scope.Point(...s.out))) });
  }
  function make(node) {
    if (node.children) return new scope.Group({ insert: false });
    if (node.type === 'path') return node.subpaths.length === 1 ? path(node.subpaths[0])
      : new scope.CompoundPath({ insert: false, children: node.subpaths.map(path), fillRule: node.fillRule });
    if (node.type === 'shape') {
      const p = node.params, x = p.x || 0, y = p.y || 0;
      const rect = new scope.Rectangle(x, y, p.width || 0, p.height || 0);
      if (node.shape === 'rect') return new scope.Path.Rectangle({ rectangle: rect, radius: p.cornerRadius || 0, insert: false });
      if (node.shape === 'ellipse') return new scope.Path.Ellipse({ rectangle: rect, insert: false });
      if (node.shape === 'line') return new scope.Path({ segments: [[p.x1 || 0,p.y1 || 0],[p.x2 || p.width || 0,p.y2 || p.height || 0]], insert: false });
      if (node.shape === 'polygon') return new scope.Path.RegularPolygon({ center: [x,y], sides: p.sides || 6, radius: p.radius || 10, insert: false });
      if (node.shape === 'star') return new scope.Path.Star({ center: [x,y], points: p.points || 5, radius1: p.innerRadius || 5, radius2: p.outerRadius || 10, insert: false });
    }
    if (node.type === 'image') {
      const asset = state.document.data.assets[node.assetId];
      const raster = new scope.Raster({ source: `data:${asset.mimeType};base64,${asset.data}`, insert: false });
      raster.onLoad = () => {
        raster.size = new scope.Size(node.width || asset.width*25.4/96, node.height || asset.height*25.4/96);
        raster.position = new scope.Point(raster.size.width/2, raster.size.height/2);
        raster.transform(new scope.Matrix(...node.transform));
        scope.view.update(); onImageLoad();
      };
      return raster;
    }
    return new scope.Group({ insert: false });
  }
  function reconcile(nodes, parent, alive) {
    for (const node of nodes) {
      alive.add(node.id);
      const own = { ...node }; delete own.children;
      const fingerprint = JSON.stringify(own);
      let item = items.get(node.id);
      if (!item || fingerprints.get(node.id) !== fingerprint) {
        item?.remove(); item = make(node);
        item.data.nodeId = node.id;
        item.visible = node.visible; item.opacity = node.opacity; item.blendMode = node.blendMode;
        if (!node.children && node.type !== 'image') {
          const fill = node.appearance.fills[0], stroke = node.appearance.strokes[0];
          item.fillColor = color(fill?.paint); item.strokeColor = color(stroke?.paint);
          if (item.fillColor) item.fillColor.alpha = fill?.opacity ?? 1;
          if (item.strokeColor) item.strokeColor.alpha = stroke?.opacity ?? 1;
          item.strokeWidth = stroke?.width || 0; item.strokeCap = stroke?.cap || 'butt'; item.strokeJoin = stroke?.join || 'miter';
          if (node.type === 'path') item.fillRule = node.fillRule;
        }
        if (node.type !== 'image') item.transform(new scope.Matrix(...node.transform));
        items.set(node.id, item); fingerprints.set(node.id, fingerprint);
      }
      parent.addChild(item);
      if (node.children) reconcile(node.children, item, alive);
    }
  }
  let boardFingerprint = '';
  function render() {
    const data = state.document.data, nextBoards = JSON.stringify(data.artboards);
    if (nextBoards !== boardFingerprint) {
      boards.removeChildren();
      for (const board of data.artboards) {
        const item = new scope.Path.Rectangle({ rectangle: new scope.Rectangle(board.x,board.y,board.width,board.height), insert: false });
        item.fillColor = board.background; item.strokeColor = '#CFE6DC'; item.strokeWidth = 1 / scope.view.zoom;
        boards.addChild(item);
      }
      boardFingerprint = nextBoards;
    }
    const alive = new Set(); reconcile(data.layers, artwork, alive);
    for (const [id,item] of items) if (!alive.has(id)) { item.remove(); items.delete(id); fingerprints.delete(id); }
    select(); scope.view.update();
  }
  function bounds(id) { const item = items.get(id); return item?.getBounds(item.globalMatrix) || null; }
  function selectionBounds() {
    let result = null;
    for (const id of state.selection.ids) { const b = bounds(id); if (b) result = result ? result.unite(b) : b.clone(); }
    return result;
  }
  function select() {
    overlay.removeChildren();
    const b = selectionBounds();
    if (b) {
      const outline = new scope.Path.Rectangle({ rectangle: b, insert: false });
      outline.strokeColor = '#006B5C'; outline.strokeWidth = 1.5 / scope.view.zoom;
      overlay.addChild(outline);
    }
    scope.view.update();
  }
  function hit(point) {
    const result = artwork.hitTest(point, { fill: true, stroke: true, tolerance: 6/scope.view.zoom });
    let item = result?.item;
    while (item && !item.data.nodeId) item = item.parent;
    return item?.data.nodeId || null;
  }
  function localMatrix(id, matrix) {
    const parent = items.get(id)?.parent.globalMatrix;
    if (!parent) return matrix;
    return parent.inverted().append(new scope.Matrix(...matrix)).append(parent).values;
  }
  return { render, select, bounds, selectionBounds, hit, localMatrix, items,
    fit() {
      const b = state.document.data.artboards.reduce((r,a) => {
        const next = new scope.Rectangle(a.x,a.y,a.width,a.height); return r ? r.unite(next) : next;
      }, null);
      scope.view.zoom = Math.max(.01, Math.min((scope.view.viewSize.width-64)/b.width,(scope.view.viewSize.height-64)/b.height));
      scope.view.center = b.center; select(); scope.view.update();
    },
    destroy() { boards.remove(); artwork.remove(); overlay.remove(); items.clear(); },
  };
}
