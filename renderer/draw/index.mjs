import { createProjectDraw } from './io/project.mjs';
import { createDrawRenderer } from './render.mjs';
import { createPanels } from './panels/ui.mjs';
import { rememberColor } from './doc/swatches.mjs';
import { copyNodes, drawClipboard, invert as invertMatrix, pasteCommands } from './doc/clipboard.mjs';
import { multiply as multiplyMatrix } from './doc/arrange.mjs';
import { stackingOrder as objectOrder } from './doc/arrange.mjs';
import { arrangeCommands, groupCommands, hideCommands, lockCommands, showAllCommands, ungroupCommands, unlockAllCommands } from './doc/arrange.mjs';
import { PATHFINDER_LABELS, runPathfinder, toSubpaths } from './geom/pathfinder.mjs';
import { TRACE_PRESETS, traceScale, quantize, removeNoise, contours, ringArea, simplifyRing, ringCorners } from './geom/trace.mjs';
import { transformEachMatrix, gridCells, distortSubpaths, boxCorners, cropImage } from './geom/transform-each.mjs';
import { pickRegions, mergeRegions, knifeCut, erase as eraseRegion, areaOf } from './geom/region-ops.mjs';
import { fillHex, pathfinderCommands, stackingOrder } from './doc/pathfinder-commands.mjs';
import { cancelActiveScrub } from './ui/number-field.mjs';
import { PANEL_DEFINITIONS } from './panels/registry.mjs';
import { TOOL_DEFINITIONS, toolRegistry } from './tools/registry.mjs';
import { setKeyOverrides, shortcutLabel } from './keymap.mjs';
import { commandEntries, openCommandSearch } from './ui/command-search.mjs';
import { createToolbar } from './tools/toolbar.mjs';
import { createInteractions } from './tools/interactions.mjs';
import { createPathInteractions, PATH_TOOLS } from './tools/paths.mjs';
import { createArtboardController } from './tools/artboards.mjs';
import { createTransformController } from './tools/transforms.mjs';
import { TRANSFORM_TOOLS, operationMatrix, dialogOperation, panelMatrix } from './geom/transforms.mjs';
import { transformedBox } from './tools/selection.mjs';
import { SHAPE_TOOLS, shapeFromDrag } from './tools/shapes.mjs';
import { insertNode, moveNode, removeNode, replaceLeaf, revertTo, updateNode, updateDocument } from './doc/commands.mjs';
import { BLEND_DEFAULTS, blendOptions, keyPosition, spineCurve } from './geom/blend.mjs';
import { WARP_STYLES } from './geom/warp.mjs';
import { BLOB_DEFAULTS, blobOptions, calligraphicProfile, paintbrushOptions } from './geom/brush.mjs';
import { createId, createNode } from './doc/schema.mjs';
import { appearance } from './geometry.mjs';
import { changeGradient, defaultGradient, isGradient, vectorGradient } from './doc/gradient.mjs';
import { sampleAppearance, applySampleCommands, measure } from './doc/tool-rules.mjs';
import { activeArtboard } from './doc/artboards.mjs';
import { SAME_MODES, OBJECT_KINDS, magicWand, inverseSelection, sameAs, objectsOfKind, stackNeighbour, saveSelection, savedSelection, selectableObjects, insidePolygon } from './doc/select-rules.mjs';
import { DRAW_MODE_LABELS, insideTarget, nextDrawMode, placement } from './doc/draw-mode.mjs';
import { changePaint, changeStroke, paintHex } from './doc/paint.mjs';
import { setWidthPoint, moveWidthPoint, removeWidthPoint, normalizeProfile } from './geom/width-profile.mjs';
import { importArtwork, rasterAsset } from './import-artwork.mjs';
import { shapeSizeDialog, rearrangeDialog,transformDialog as openTransformDialog,layerOptionsDialog,swatchOptionsDialog,sendToCutDialog,averageDialog,offsetDialog,simplifyDialog,pencilDialog,expandDialog,cropImageDialog,effectDialog,magicWandDialog,eraserDialog,transformEachDialog,splitGridDialog,saveSelectionDialog,editSelectionDialog,widthPointDialog,blendOptionsDialog,paintbrushDialog,blobBrushDialog,workspaceNameDialog,workspacesDialog } from './ui/dialogs.mjs';
import { shortcutsDialog } from './ui/shortcuts-dialog.mjs';
import { ESSENTIALS, applyWorkspace, captureWorkspace, deleteWorkspace, loadWorkspaces, saveWorkspace } from './ui/workspaces.mjs';
import { ALL_ARTBOARDS, artboardCutSvg } from './io/cut-svg.mjs';
import { EXPORT_FORMATS, rasterSize, svgDocument } from './io/export.mjs';
import { createExportController } from './export-controller.mjs';
import { layerOptionsPatch, templateLayerCommands, isOutputNode } from './doc/layers.mjs';
import { compoundCommands, releaseCompoundCommands, clipCommands, releaseClipCommands } from './doc/compound.mjs';
import { offsetPaths, flattenPath, outlineStroke, loadGeometry } from './geom/kernel-js.mjs';
import { EFFECTS, LIVE_LABELS, effect, hasVectorEffects, livePathfinder, vectorEffects } from './doc/effects.mjs';
import { cutSubpath } from './geom/path-commands.mjs';
import { erasePath, smoothRange, sectionPoints } from './geom/path-eraser.mjs';
import { bakeCorners } from './geom/corners.mjs';
import { addAnchorPoints, removeAnchorPoints, reverseSubpaths, averagePoints, joinSubpaths, closeSubpath, cleanUpTargets, mapSubpath } from './geom/path-commands.mjs';
import { toolCursor } from './tools/cursors.mjs';
import { alignReference, alignOffsets, distributeOffsets, spacingOffsets } from './geom/align.mjs';
import { pointText, pathText, textValues, textProperties, textToOutlines, DEFAULT_CHARACTER, PT_TO_MM, characterAt, styleRange, textContent } from './doc/text.mjs';
import { hasTextLayout } from './doc/text-layout.mjs';
import { textDialog } from './ui/dialogs.mjs';

const workspaces=new WeakMap();
export function getDrawWorkspace(root) {return workspaces.get(root) || null;}
// Custom shortcuts live in the main process (it builds the menus); the canvas takes the same ones.
const shortcutsReady=globalThis.window?.modcut?.getDrawShortcuts?.().then(map=>{try{setKeyOverrides(map??{});}catch{/* unreadable: defaults */}}).catch(()=>{});
const implementedTools=new Set(['path-eraser','smooth','vertical-type','touch-type','rotate-view','select','group-selection','magic-wand','lasso','shape-builder','knife','eraser','width','blend','paintbrush','blob-brush','free-transform','pencil','hand','zoom','artboard','gradient','eyedropper','measure','scissors','type','area-type','type-on-path',...SHAPE_TOOLS,...PATH_TOOLS,...TRANSFORM_TOOLS]);
const commands=new Set(['undo','redo','delete','select-all','select-artboard','deselect','cancel','fit-artboard','fit-all','actual-size','zoom-in','zoom-out','outline',
  'cut','copy','paste','paste-front','paste-back','paste-place','paste-all-artboards',
  'edit-text','create-outlines','join','average','offset-path','outline-stroke','expand','expand-appearance','transform-each','split-into-grid','crop-image','effect-last','effect-options',...Object.keys(EFFECTS).map(t=>`effect-${t}`),...Object.keys(WARP_STYLES).map(t=>`warp-${t}`),...Object.keys(LIVE_LABELS).map(t=>`live-${t}`),'simplify','reverse-path','add-anchors','remove-anchors','clean-up','compound-make','compound-release','clip-make','clip-release','reset-rotate-view','package','keyboard-shortcuts','workspace-new','workspace-reset','workspace-manage','blend-make','blend-release','blend-expand','blend-options','blend-reverse','blend-replace-spine','blend-reverse-spine','envelope-make','envelope-warp','envelope-release','envelope-expand','mask-make','mask-release','mask-clip','mask-invert','send-to-cut','export-as','export-screens','use-as-template','toggle-control-bar','group','ungroup','bring-forward','send-backward','bring-front','send-back','lock','unlock-all','hide','show-all',
  'paint-focus','paint-swap','paint-none','paint-solid','paint-gradient','default-paint','smart-guides','tool-dialog','transform-again','rotate-dialog','reflect-dialog','scale-dialog','shear-dialog','toggle-panels','toggle-panels-except-tools','command-search','draw-mode','draw-normal','draw-behind','draw-inside','reselect','select-inverse','select-next-above','select-next-below','save-selection','edit-selection',
  ...Object.keys(SAME_MODES).map(m=>`select-same-${m}`),...Object.keys(OBJECT_KINDS).map(k=>`select-object-${k}`),'select-object-direction-handles',
  ...PANEL_DEFINITIONS.map(p=>`panel.${p.id}`),...['left','right','up','down'].flatMap(d=>[`nudge-${d}`,`nudge-large-${d}`,`duplicate-${d}`])]);
export function createDrawWorkspace(root,{paper=window.paper,state=createProjectDraw(),onError=console.warn,onNotice=()=>{},onImport=()=>{},onSendToCut=null,cutIsEmpty=()=>false,cutClipboard=()=>null,onExport=null,getPreferences=()=>({}),statusHost=null}={}) {
  state.ui={tool:'select',flyout:null,layerId:state.document.data.layers[0]?.id,fill:'#FFFFFF',stroke:'#071411',strokeWidth:.5,paintFocus:'fill',...state.ui};
  state.ui.artboardId=activeArtboard(state).id;
  // The control bar's visibility is a per-user view preference, like Illustrator's Window > Control.
  const CONTROL_BAR_KEY='modcut.draw.controlBar';
  try{state.ui.controlBar??=globalThis.localStorage?.getItem(CONTROL_BAR_KEY)!=='hidden';}catch{state.ui.controlBar??=true;}
  const element=(tag,className,parent)=>{const el=document.createElement(tag);el.className=className;parent?.append(el);return el;};
  const shell=element('div','draw-shell',root),tools=element('nav','draw-tool-rail',shell);tools.setAttribute('aria-label','Draw tools');
  const stage=element('div','draw-stage',shell),canvas=element('canvas','draw-canvas',stage);canvas.setAttribute('aria-label','Draw canvas');canvas.tabIndex=0;
  const isolationBar=element('nav','draw-isolation-bar',stage);isolationBar.hidden=true;isolationBar.setAttribute('aria-label','Isolation mode');
  const hint=element('div','draw-workspace__hint',stage),hintCard=element('div','draw-workspace__hint-card',hint);
  element('h1','',hintCard).textContent='Start drawing';element('p','',hintCard).textContent='Import artwork, or choose a drawing tool.';
  // Import has one primary location in the application toolbar; view controls join the app status bar when it is given.
  const controls=element('div','draw-view-controls',statusHost||stage),positionLabel=element('span','draw-position',controls);
  const viewButtons=element('div','draw-view-buttons',controls),boardSelect=element('select','draw-board-select',viewButtons);boardSelect.setAttribute('aria-label','Active artboard');
  const zoomInput=element('input','draw-zoom-input',viewButtons);zoomInput.type='number';zoomInput.min='.0001';zoomInput.max='10000';zoomInput.step='any';zoomInput.setAttribute('aria-label','Zoom percent');
  element('span','draw-zoom-unit',viewButtons).textContent='%';
  const outlineButton=element('button','btn btn--ghost btn--sm',viewButtons);outlineButton.type='button';outlineButton.textContent='Outline';outlineButton.setAttribute('aria-label','Outline view');
  const fitButton=element('button','btn btn--ghost btn--sm',viewButtons);fitButton.type='button';fitButton.textContent='Fit';fitButton.setAttribute('aria-label','Fit Draw artboards');
  const statusLine=element('div','draw-tool-hint',shell);statusLine.setAttribute('role','status');
  const scope=new paper.PaperScope();try {scope.setup(canvas);} finally {paper.activate();}scope.view.autoUpdate=false;
  function withScope(fn) {try {scope.activate();return fn();} finally {paper.activate();}}
  function run(fn) {try {return withScope(fn);}catch(error){onError(error.message);}}
  let panels,toolbar,interactions,paths,artboards,temporary=null,destroyed=false,fitted=false,lastPoint=null,ownedTransformModal=null,ownedTextModal=null,textBusy=false,fontCatalog;
  // A late thumbnail (big layers and groups) goes straight into the Layers rows that show it.
  const renderer=withScope(()=>createDrawRenderer(scope,state,{withScope,onImageLoad:()=>panels?.render(),
    onThumbnail:(id,url)=>{if(!destroyed)for(const img of shell.querySelectorAll(`[data-draw-thumb="${CSS.escape(id)}"]`)){img.src=url;img.classList.remove('is-empty');}}}));
  // The selection's top objects: ids inside a selected group are left out (one lookup set, not a list scan per id).
  const selectedIds=()=>{const ids=state.selection.ids,set=new Set(ids);return ids.filter(id=>!state.document.ancestors(id).some(n=>set.has(n.id)));};
  const paintIds=()=>[...new Set(selectedIds().flatMap(id=>{
    const node=state.document.getNode(id);return node.children ? state.document.descendants(id).map(n=>n.id) : [id];
  }))].filter(id=>['path','shape','text'].includes(state.document.getNode(id)?.type) && state.document.isEditable(id));
  const transforms=createTransformController(state,{selectedIds,bounds:()=>renderer.selectionBounds(),localMatrix:(id,m)=>renderer.localMatrix(id,m),worldMatrix:id=>renderer.worldMatrix(id),select,update:()=>withScope(()=>renderer.select())});
  function syncPaint() {
    const node=state.document.getNode(paintIds()[0]);if(!node)return;
    state.ui.fill=paintHex(node.appearance.fills[0]);state.ui.stroke=paintHex(node.appearance.strokes[0]);state.ui.strokeWidth=node.appearance.strokes[0]?.width ?? state.ui.strokeWidth;
  }
  function status(point) {
    if(point)lastPoint=point;
    const tool=toolRegistry.get(temporary?.id || state.ui.tool),a=activeArtboard(state);
    positionLabel.textContent=lastPoint ? `X ${lastPoint.x.toFixed(1)}  Y ${lastPoint.y.toFixed(1)} mm` : `${a.width.toFixed(1)} × ${a.height.toFixed(1)} mm`;
    const percent=scope.view.zoom/(96/25.4)*100;zoomInput.value=String(percent<1 ? Number(percent.toFixed(4)) : Math.round(percent));
    const drawMode=(state.ui.drawMode??'normal')==='normal'?'':`${DRAW_MODE_LABELS[state.ui.drawMode]} · `;
    statusLine.textContent=`${tool.name} · ${drawMode}${state.selection.ids.length} selected · `+(
      SHAPE_TOOLS.includes(tool.id) ? 'Shift: constrain · Alt: from center · Space: move · Click: exact size' :
      TRANSFORM_TOOLS.includes(tool.id) ? 'Click: reference point · Drag: transform · Shift: constrain · Alt: copy · Enter: dialog' :
      tool.id==='pen' ? 'Click: corner · Drag: curve · Alt: break handles · Space: move anchor · Enter/Esc: finish' :
      ['type','area-type'].includes(tool.id) ? 'Click: '+(tool.id==='type'?'point text':'area text')+' · Drag: text frame · Click existing text: edit' :
      tool.id==='type-on-path' ? 'Click a path or shape: type along it · Click existing text: edit' :
      tool.id==='gradient' ? 'Drag across the selection: gradient direction and length · Shift: 45° steps · Click: apply gradient' :
      tool.id==='eyedropper' ? 'Click: copy appearance to the selection · Alt: apply the selection\'s appearance · Shift: colour under the pointer' :
      tool.id==='measure' ? (state.ui.measurement?measurementText(state.ui.measurement):'Drag: distance and angle · Shift: 45° steps') :
      tool.id==='free-transform' ? 'Drag a corner of the selection: free distort (the other corners stay) · Shift: perspective' :
      tool.id==='shape-builder' ? 'Drag across regions of the selected shapes: merge · Alt+drag: delete regions' :
      tool.id==='blend' ? (state.ui.blendFirst?'Click a second object: blend the two · Click empty canvas: start over':'Click an object, then another, to blend them · Double-click the tool: Blend Options') :
      tool.id==='paintbrush' ? 'Drag: paint a calligraphic stroke in the stroke colour · Enter: Paintbrush options' :
      tool.id==='blob-brush' ? 'Drag: paint a filled shape that merges with touching shapes of the same colour · Enter: Blob Brush options' :
      tool.id==='vertical-type' ? 'Click: vertical point text (columns from right to left) · Click existing text: edit' :
      tool.id==='touch-type' ? 'Click a character · Drag: move it · Top-right square: scale · Top circle: rotate' :
      tool.id==='rotate-view' ? `Drag: turn the view (${Math.round(scope.view.rotation)}°) · Shift: 15° steps · View > Reset Rotate View` :
      tool.id==='width' ? 'Drag a stroke: width there · Drag a width point: resize, its centre slides it · Alt: one side · Double-click a point: edit' :
      tool.id==='knife' ? 'Drag across filled shapes to cut them (the selection, or every shape)' :
      tool.id==='path-eraser' ? 'Drag along a selected path to erase that part of it' :
      tool.id==='smooth' ? 'Drag along a selected path to smooth it (fewer, rounder curves)' :
      tool.id==='eraser' ? 'Drag to erase from filled shapes (the selection, or every shape) · Enter: diameter' :
      tool.id==='magic-wand' ? 'Click: objects with a similar fill · Shift: add · Alt: remove · Enter: tolerance' :
      tool.id==='lasso' ? 'Drag around anchor points to select them · Shift: add · Alt: remove · Alt+Ctrl/Cmd: whole objects' :
      tool.id==='pencil' ? 'Drag: draw freehand · End near the start: close · Enter: Pencil options' :
      tool.id==='scissors' ? 'Click a path: cut it there (a closed path opens, an open path splits)' :
      tool.id==='group-selection' ? 'Click: object · Click again: its group, one level up per click · Shift: add' :
      tool.id==='direct-selection' ? 'Drag dots: round corners · Alt: one corner / break handles · Shift: add anchors/constrain' :
      tool.id==='anchor-point' ? 'Click anchor: corner/smooth · Drag: handles · Click shape: expand to path' :
      tool.id==='artboard' ? 'Drag: create/move · Edges: resize · Alt+drag: duplicate' :
      tool.id==='select' ? 'Shift: add to selection · Alt+drag: copy · Space: Hand' : 'Space: Hand · Ctrl/Cmd+Space: Zoom');
    panels?.updateInfo();
  }
  // The canvas always shows an Illustrator-style cursor for the current or temporary tool.
  const cursor=()=>toolCursor(temporary?.id || state.ui.tool,{zoomOut:!!temporary?.zoomOut});
  function select(ids) {state.selection.set(ids);transforms.selectionChanged();syncPaint();withScope(()=>renderer.select());panels?.render();toolbar?.update();status();}
  function selectionChanged(){transforms.selectionChanged();syncPaint();withScope(()=>renderer.select());panels?.render();toolbar?.update();status();}
  function transform(matrix,label='Transform',options={}) {return transforms.apply(matrix,label,options);}
  async function transformToolDialog(tool) {
    if(destroyed||state.document.readOnly||document.querySelector('.modal-overlay')||!selectedIds().length)return;
    interactions.cancel();paths.finish();const before=state.document.data,ids=selectedIds(),box=renderer.selectionBounds(),previousOrigin=state.ui.transformOrigin&&[...state.ui.transformOrigin];
    if(!box)return;
    try{
      const pending=openTransformDialog(tool,transforms.origin(),state.ui.transformDefaults?.[tool],preview=>run(()=>{
        renderer.clearTransformPreview();state.ui.transformPreviewBox=null;state.ui.transformOrigin=preview?.origin??previousOrigin;
        if(preview&&state.document.data===before){const matrix=operationMatrix(preview.operation,preview.origin);state.ui.transformPreviewBox=transformedBox(box,matrix);renderer.previewTransform(ids,matrix,{scaleStrokes:preview.scaleStrokes});}
        else renderer.updateView();
      }));
      ownedTransformModal=document.querySelector('.draw-transform-dialog');
      const values=await pending;ownedTransformModal=null;if(destroyed)return;
      run(()=>{renderer.clearTransformPreview();state.ui.transformPreviewBox=null;state.ui.transformOrigin=previousOrigin;renderer.updateView();
        if(!values||destroyed||state.document.readOnly)return;
        if(state.document.data!==before)throw new Error('The artwork changed while the dialog was open. Open the dialog again.');
        const origin=[values.originX,values.originY];transforms.setOrigin(origin);state.ui.transformDefaults={...state.ui.transformDefaults,[tool]:values};
        transform(operationMatrix(dialogOperation(tool,values),origin),tool[0].toUpperCase()+tool.slice(1),{ids,copy:values.copy,scaleStrokes:tool==='scale'?values.scaleStrokes:null});
      });
    }catch(error){ownedTransformModal=null;onError(error.message);}
  }
  function zoomAt(point,factor) {
    withScope(()=>{const anchor=scope.view.projectToView(point);scope.view.zoom=Math.max(.00001,Math.min(100*(96/25.4),scope.view.zoom*factor));
      scope.view.center=scope.view.center.add(point.subtract(scope.view.viewToProject(anchor)));renderer.updateView({viewOnly:true});});status();
  }
  function fit(id=activeArtboard(state).id) {withScope(()=>renderer.fit(id));status();}
  function refresh() {
    if(destroyed)return;
    state.ui.artboardId=activeArtboard(state).id;
    if(!state.document.getNode(state.ui.layerId))state.ui.layerId=state.document.data.layers[0]?.id;
    withScope(()=>renderer.render());syncPaint();panels?.render();toolbar?.update();
    boardSelect.replaceChildren(...state.document.data.artboards.map((a,i)=>{const option=document.createElement('option');option.value=a.id;option.textContent=`${i+1}. ${a.name}`;return option;}));
    boardSelect.value=state.ui.artboardId;
    hint.hidden=state.document.data.layers.some(layer=>layer.children.length) || state.document.readOnly || state.ui.tool!=='select';
    outlineButton.setAttribute('aria-pressed',String(renderer.outline));status();
  }
  function paint(kind,value,{mergeKey=null,swatch=null}={}) {
    if(state.document.readOnly)return;
    if(kind==='width')state.ui.strokeWidth=value;else state.ui[kind]=value;
    // Remember the last solid color per kind for the Color button / Comma shortcut.
    if(kind!=='width'&&value)state.ui.lastSolid={...state.ui.lastSolid,[kind]:value};
    // Recent Colors records committed colors, not every step of a live slider drag.
    if(kind!=='width'&&value&&!mergeKey)state.ui.recentColors=rememberColor(state.ui.recentColors,value);
    const ids=paintIds();
    if(ids.length)state.history.transaction('Appearance',()=>{for(const id of ids)state.history.execute(updateNode(id,{appearance:changePaint(state.document.getNode(id).appearance,kind,value,state.ui,swatch)}));},{mergeKey});
    else {panels?.render();toolbar?.update();}
  }
  function layerId() {
    if(state.document.isEditable(state.ui.layerId))return state.ui.layerId;
    const layer=state.document.data.layers.find(n=>state.document.isEditable(n.id));
    if(!layer)throw new Error('Create or unlock a visible layer before drawing.');state.ui.layerId=layer.id;return layer.id;
  }
  // Isolation mode (double-click a group): new artwork, pastes and Select All stay inside the group.
  function isolation() {
    const id=state.ui.isolation;if(!id)return null;
    if(state.document.getNode(id)?.type==='group')return id;
    state.ui.isolation=null;return null;
  }
  function insertionParent() {const iso=isolation();return iso&&state.document.isEditable(iso)?iso:layerId();}
  function toParentSpace(parentId,node) {
    const world=renderer.worldMatrix(parentId);
    if(world.every((v,i)=>v===[1,0,0,1,0,0][i]))return node;
    // Paths keep an identity transform: their anchors move into the parent's space instead.
    if(node.type==='path')return {...node,subpaths:node.subpaths.map(s=>mapSubpath(s,invertMatrix(world)))};
    return {...node,transform:multiplyMatrix(invertMatrix(world),node.transform)};
  }
  /** The artboard as a cut SVG; shapes are expanded and placed with their parent's world matrix. */
  function worldMatrix(id){const node=state.document.getNode(id),parent=state.document.ancestors(id)[0];
    return node.type==='shape'?(parent?renderer.worldMatrix(parent.id):[1,0,0,1,0,0]):renderer.worldMatrix(id);}
  function cutSvg(boardId,resolved=new Map(),options={}) {
    return withScope(()=>artboardCutSvg(state.document,boardId,{
      bounds:id=>renderer.bounds(id),
      worldMatrix,
      // Clipping masks are cut into the geometry, so the laser follows what is visible.
      subpaths(id){const node=state.document.getNode(id);return renderer.clippedSubpaths(id,worldMatrix(id))??renderer.effectiveSubpaths(id)??(node.type==='shape'?renderer.expandedShape(id)?.subpaths:node.subpaths);},
      clip:(subpaths,world,rect,filled)=>renderer.clipToRect(subpaths,world,rect,filled),
      blendSteps:id=>renderer.blendSteps(id),liveSteps:id=>renderer.liveSteps(id),envelopeSteps:id=>renderer.envelopeSteps(id),
      resolvedText:id=>resolved.get(id),glyphBounds:(id,paths)=>renderer.glyphBounds(id,paths),
    },options));
  }
  /** One artboard as an SVG document (text) or a PNG/JPEG data URL, drawn from the printable artwork. */
  function exportBoard(boardId,format,{ppi=150,background='transparent',quality=.92,area=null,only=null}={}) {
    // `area` (a rectangle in document mm) stands in for an artboard, and `only` limits the artwork (Asset Export).
    const board=area??state.document.getArtboard(boardId);if(!board)throw new Error('Choose an artboard to export.');
    if(!EXPORT_FORMATS[format])throw new Error('Choose SVG, PNG, JPEG or WebP.');
    const fill=background==='white'?'#FFFFFF':background==='artboard'?board.background??'#FFFFFF':format==='jpg'?'#FFFFFF':null;
    return withScope(()=>{
      // SVG has no luminance masks Paper can write, so opacity-masked groups go in as 300 ppi images.
      const art=renderer.exportArtwork({...(format==='svg'?{rasterMasks:300}:{}),only});
      try {
        if(format==='svg'){
          const textWeights=new Map();
          const svg=art.children.length?art.exportSVG({asString:false,precision:4,onExport(item,element){
            if(item.className!=='PointText')return;
            // Paper writes canvas font shorthand as font-weight, and collapses multiline text.
            element.setAttribute('font-style',item.fontWeight.includes('italic')?'italic':'normal');
            textWeights.set(element,item.fontWeight.includes('bold')?'bold':'normal');
            const lines=item.content.split('\n');
            if(lines.length>1){element.textContent='';lines.forEach((line,i)=>{const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x',element.getAttribute('x')??'0');span.setAttribute('y',String(Number(element.getAttribute('y')??0)+i*item.leading));span.textContent=line;element.append(span);});}
          }}):null;
          for(const [text,weight] of textWeights)text.setAttribute('font-weight',weight);
          const inner=svg?new XMLSerializer().serializeToString(svg):'';
          return svgDocument(board,`<g transform="translate(${-board.x} ${-board.y})">${inner}</g>`,{background:fill,title:board.name});
        }
        const {width,height}=rasterSize(board,ppi),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');if(fill){ctx.fillStyle=fill;ctx.fillRect(0,0,width,height);}
        const matrix=new scope.Matrix().scale(width/board.width,height/board.height).translate(-board.x,-board.y);
        ctx.save();matrix.applyToContext(ctx);art.draw(ctx,new scope.Base({matrices:[matrix]}));ctx.restore();
        return canvas.toDataURL(EXPORT_FORMATS[format].mime,quality);
      } finally {art.remove();}
    });
  }
  /**
   * Navigator: every artboard (white) and the artwork in a small image, with the box it covers, cached
   * until the document changes.
   */
  let navigatorCache=null;
  function navigatorImage(maxPx=200) {
    const data=state.document.data;if(navigatorCache?.data===data&&navigatorCache.maxPx===maxPx)return navigatorCache.result;
    const boards=data.artboards,x=Math.min(...boards.map(b=>b.x)),y=Math.min(...boards.map(b=>b.y)),box={x,y,width:Math.max(...boards.map(b=>b.x+b.width))-x,height:Math.max(...boards.map(b=>b.y+b.height))-y};
    const pad=Math.max(box.width,box.height)*.05,area={x:box.x-pad,y:box.y-pad,width:box.width+2*pad,height:box.height+2*pad},k=maxPx/Math.max(area.width,area.height);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(area.width*k));canvas.height=Math.max(1,Math.round(area.height*k));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#E4E8E7';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(const b of boards){ctx.fillStyle=b.background??'#FFFFFF';ctx.fillRect((b.x-area.x)*k,(b.y-area.y)*k,b.width*k,b.height*k);}
    withScope(()=>{const art=renderer.exportArtwork();try{const matrix=new scope.Matrix().scale(k,k).translate(-area.x,-area.y);ctx.save();matrix.applyToContext(ctx);art.draw(ctx,new scope.Base({matrices:[matrix]}));ctx.restore();}finally{art.remove();}});
    navigatorCache={data,maxPx,result:{url:canvas.toDataURL('image/png'),area}};return navigatorCache.result;
  }
  /** Rotate View: the view turns around its centre (degrees, -180..180); the artwork is unchanged. */
  function rotateView(angle){withScope(()=>{const a=((angle+180)%360+360)%360-180;scope.view.rotation=Math.abs(a)<1e-9?0:a;renderer.updateView({viewOnly:true});});status();}
  const navigatorView=()=>{const b=scope.view.bounds;return {x:b.x,y:b.y,width:b.width,height:b.height,zoom:scope.view.zoom/(96/25.4)*100};};
  function navigateTo(point,percent=null){
    withScope(()=>{if(percent!==null)scope.view.zoom=Math.max(.00001,Math.min(100*(96/25.4),percent/100*(96/25.4)));if(point)scope.view.center=new scope.Point(point[0],point[1]);renderer.updateView({viewOnly:true});});status();
  }
  // onExport is the app's file bridge (save dialog, folder, write); see export-controller.mjs.
  const exporter=createExportController({state,scope,renderer,withScope,exportBoard,bridge:onExport});
  async function exportAs() {
    if(destroyed||document.querySelector('.modal-overlay'))return;
    interactions?.cancel();paths?.finish();
    return exporter.exportAs();
  }
  async function exportScreens() {
    if(destroyed||document.querySelector('.modal-overlay'))return;
    interactions?.cancel();paths?.finish();
    return exporter.exportScreens();
  }
  /** Asset Export panel: add the selected objects (one asset each), remove one, and export them all. */
  function addAssets(){
    const doc=state.document,ids=selectedIds().filter(id=>doc.getNode(id)&&doc.getNode(id).type!=='layer'),current=doc.data.exportAssets??[];
    const fresh=ids.filter(id=>!current.some(a=>a.nodeId===id));if(!fresh.length)throw new Error(ids.length?'These objects are already assets.':'Select objects to add as assets.');
    state.history.execute(updateDocument({exportAssets:[...current,...fresh.map((id,i)=>({id:createId(),nodeId:id,name:doc.getNode(id).name||`Asset ${current.length+i+1}`}))]},{label:'Add Asset'}));
  }
  const removeAsset=id=>state.history.execute(updateDocument({exportAssets:(state.document.data.exportAssets??[]).filter(a=>a.id!==id)},{label:'Remove Asset'}));
  const renameAsset=(id,name)=>state.history.execute(updateDocument({exportAssets:(state.document.data.exportAssets??[]).map(a=>a.id===id?{...a,name:String(name).trim()||a.name}:a)},{label:'Rename Asset'}));
  async function exportAssets(options){
    if(destroyed||document.querySelector('.modal-overlay'))return;
    interactions?.cancel();paths?.finish();
    return exporter.exportAssets(options);
  }
  let cutBusy=false;
  /** Outline Stroke for Send to Cut: each stroked path or shape's stroke area, in the same space as its cut geometry. */
  async function strokeOutlines(boardId) {
    const outlines=new Map(),boards=boardId===ALL_ARTBOARDS?state.document.data.artboards:[state.document.getArtboard(boardId)].filter(Boolean);
    for(const node of state.document.descendants(null)){
      if(!['path','shape'].includes(node.type)||!isOutputNode(state.document,node.id))continue;
      const stroke=(node.appearance?.strokes??[]).find(e=>!e.hidden);if(!stroke||!(stroke.width>0))continue;
      const box=renderer.bounds(node.id);if(!box||!boards.some(board=>box.x<=board.x+board.width&&box.y<=board.y+board.height&&box.x+box.width>=board.x&&box.y+box.height>=board.y))continue;
      const subpaths=withScope(()=>renderer.clippedSubpaths(node.id,worldMatrix(node.id))??renderer.effectiveSubpaths(node.id)??(node.type==='shape'?renderer.expandedShape(node.id)?.subpaths:node.subpaths))??[];
      const [a,b,c,d]=worldMatrix(node.id),width=node.strokeScaling===false?stroke.width/Math.sqrt(Math.abs(a*d-b*c)||1):stroke.width;
      // A width profile is outlined as drawn, in the node's own space like the other outlines.
      if(stroke.widthProfile?.length){const local=withScope(()=>renderer.profiledStroke(node.id,stroke));if(local){outlines.set(node.id,local);continue;}}
      outlines.set(node.id,await outlineStroke(subpaths,{width,join:stroke.join??'miter',cap:stroke.cap??'butt',miterLimit:stroke.miterLimit??4}));
    }
    return outlines;
  }
  // Send to Cut links: what was sent last per artboard, so the Artboards panel can say when it changed.
  const hashCache=new Map();
  function sourceHash(boardId){
    const data=state.document.data,cached=hashCache.get(boardId);if(cached?.data===data)return cached.hash;
    let svg='';try{const out=cutSvg(boardId);svg=out.svg+JSON.stringify(out.images.map(({dataUrl,...rest})=>rest));}catch{/* an unsendable artboard hashes as empty */}
    let h=2166136261;for(let i=0;i<svg.length;i++){h^=svg.charCodeAt(i);h=Math.imul(h,16777619);}
    const hash=(h>>>0).toString(16);hashCache.set(boardId,{data,hash});return hash;
  }
  function cutLink(boardId){return (state.document.data.cutLinks??[]).find(l=>l.artboardId===boardId)??null;}
  function cutStatus(boardId){const link=cutLink(boardId);return link?link.sourceHash===sourceHash(boardId)?'sent':'changed':null;}
  async function sendToCut(boardId=state.ui.artboardId,{update=false}={}) {
    if(cutBusy||textBusy||document.querySelector('.modal-overlay'))return;
    if(!onSendToCut)throw new Error('Send to Cut is not available here.');
    cutBusy=true;
    try {
    interactions?.cancel();paths?.finish();
    const before=state.document.data,resolved=new Map();
    for(const node of state.document.descendants(null))if(node.type==='text'&&isOutputNode(state.document,node.id)&&!hasTextLayout(node)) {
      try{resolved.set(node.id,{...node,...await resolveText(node,{})});}catch{/* The dialog reports unresolved text and blocks incomplete output. */}
      if(destroyed)return;
    }
    if(destroyed)return;if(state.document.data!==before)throw new Error('The artwork changed while preparing text. Try sending again.');
    // An empty Cut with one artboard needs no questions: the artboard goes straight into this tab's Cut.
    // The dialog still opens when something blocks the send or needs a choice (warnings), so it can explain why.
    const boards=state.document.data.artboards,empty=cutIsEmpty();
    const direct=empty&&boards.length===1&&(()=>{try{const s=cutSvg(boards[0].id,resolved);return s.count+s.images.length>0&&!s.errors.length&&!s.warnings.length;}catch{return false;}})();
    // Update in Cut repeats the earlier send's choices without asking, unless something blocks it.
    const stored=update&&!empty?cutLink(boardId):null;
    const quick=stored&&(()=>{try{const s=cutSvg(boardId,resolved,{clipToBoard:stored.options?.outside==='clip',dedupe:stored.options?.dedupe!==false});return s.count+s.images.length>0&&!s.errors.length;}catch{return false;}})();
    const options=quick?{boardId,target:'update',...stored.options}:direct?{boardId:boards[0].id,target:'add',placement:'origin'}
      :await sendToCutDialog({boards,boardId,summary:(id,o={})=>cutSvg(id,resolved,{clipToBoard:o.outside==='clip',dedupe:o.dedupe!==false}),cutEmpty:empty,
        linked:new Set((state.document.data.cutLinks??[]).map(l=>l.artboardId))});
    if(!options||destroyed)return;
    if(state.document.data!==before)throw new Error('The artwork changed while preparing the cut. Try sending again.');
    // All artboards go as one send, laid out as in the document.
    const all=options.boardId===ALL_ARTBOARDS&&boards.length>1;
    const board=all?{id:ALL_ARTBOARDS,name:`${state.document.data.name||'Artboards'} (all artboards)`}:state.document.getArtboard(options.boardId),cutOptions={clipToBoard:options.outside==='clip',dedupe:options.dedupe!==false};
    if(options.strokes==='outline')cutOptions.outlines=await strokeOutlines(board.id);
    if(destroyed)return;if(state.document.data!==before)throw new Error('The artwork changed while preparing the cut. Try sending again.');
    const {svg,count,images:planned,warnings,errors}=cutSvg(board.id,resolved,cutOptions);
    // Cropped images are cut to their visible part before they go to Cut.
    const images=await Promise.all(planned.map(async image=>{if(!image.crop)return image;
      const img=new Image();img.src=image.dataUrl;await img.decode();const c=image.crop,w=img.naturalWidth,h=img.naturalHeight,canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(w*c.width));canvas.height=Math.max(1,Math.round(h*c.height));
      canvas.getContext('2d').drawImage(img,w*c.x,h*c.y,w*c.width,h*c.height,0,0,canvas.width,canvas.height);return {...image,dataUrl:canvas.toDataURL('image/png')};}));
    if(destroyed)return;
    if(errors.length)throw new Error(errors.join(' '));
    if(!count&&!images.length)throw new Error('Nothing on this artboard can be sent to Cut.');
    const sent=await onSendToCut({svg,count,images,warnings,name:board.name,width:board.width,height:board.height,target:options.target,placement:options.placement,
      link:{doc:state.document.data.id,board:board.id},cutTabId:cutLink(board.id)?.cutTabId??null});
    if(destroyed||state.document.readOnly)return;
    const others=(state.document.data.cutLinks??[]).filter(l=>l.artboardId!==board.id);
    state.history.execute(updateDocument({cutLinks:[...others,{artboardId:board.id,cutTabId:sent?.cutTabId??null,sentAt:new Date().toISOString(),sourceHash:sourceHash(board.id),
      options:{strokes:options.strokes??'centerline',outside:options.outside??'whole',dedupe:options.dedupe!==false,placement:options.placement??'origin'}}]},{label:'Send to Cut'}));
    }finally{cutBusy=false;}
  }
  function isolate(id) {if(state.document.getNode(id)?.type!=='group')return;state.ui.isolation=id;select([]);isolationChanged();}
  function exitIsolation() {const id=isolation();if(!id)return false;state.ui.isolation=null;select([id]);isolationChanged();return true;}
  function isolationChanged() {withScope(()=>renderer.updateView());renderIsolationBar();toolbar?.update();}
  function renderIsolationBar() {
    const id=isolation();isolationBar.hidden=!id;isolationBar.replaceChildren();if(!id)return;
    const back=document.createElement('button');back.type='button';back.className='draw-isolation-bar__back';back.textContent='‹';
    back.setAttribute('aria-label','Exit isolation mode (Esc)');back.dataset.tooltip='Exit isolation mode (Esc)';back.addEventListener('click',()=>run(exitIsolation));
    isolationBar.append(back);
    const chain=[...state.document.ancestors(id)].reverse().concat(state.document.getNode(id));
    chain.forEach((node,i)=>{
      if(i)isolationBar.append(Object.assign(document.createElement('span'),{className:'draw-isolation-bar__sep',textContent:'›'}));
      const crumb=document.createElement('button');crumb.type='button';crumb.className='draw-isolation-bar__crumb';
      crumb.textContent=node.name||(node.type==='layer'?'Layer':'<Group>');crumb.dataset.drawCrumb=node.id;
      if(node.id===id)crumb.setAttribute('aria-current','true');
      crumb.addEventListener('click',()=>run(()=>node.type==='group'?(node.id===id?null:isolate(node.id)):exitIsolation()));
      isolationBar.append(crumb);
    });
  }
  /** Inserts a new object where the drawing mode puts it: on top, behind, or inside the Draw Inside target. */
  function insertNew(node,{space=true}={}) {
    const mode=state.ui.drawMode??'normal',p=placement(state.document,mode,{parentId:insertionParent(),selection:selectedIds(),insideId:mode==='inside'?state.ui.drawInside:null});
    const owner=p.commands.length?state.document.locate(state.ui.drawInside).parentId:p.parentId,placed=space?toParentSpace(owner,node):node;
    if(!p.commands.length)return state.history.execute(insertNode(p.parentId,placed,p.index));
    state.history.transaction('Draw Inside',()=>{p.commands.forEach(c=>state.history.execute(c));state.history.execute(insertNode(p.parentId,placed,p.index));});
  }
  function setDrawMode(mode) {
    state.ui.drawInside=mode==='inside'?insideTarget(state.document,selectedIds()):null;
    state.ui.drawMode=mode;toolbar?.update();status();
  }
  function insertShape(node) {insertNew(node);select([node.id]);}
  const listFonts=()=>fontCatalog??=(window.modcut.listSystemFonts().catch(error=>{fontCatalog=null;throw error;}));
  async function resolveText(node,patch) {
    patch=textProperties(textValues({...node,...patch}));
    const previous=node.character;
    if(previous?.fontPostscriptName&&['fontFamily','fontWeight','fontStyle','fontSource'].every(k=>patch.character[k]===previous[k])) {
      patch.character.fontPostscriptName=previous.fontPostscriptName;
      if(previous.googleFont&&!patch.character.googleFont)patch.character.googleFont=previous.googleFont;
    }
    if(hasTextLayout({...node,...patch}))return {...patch,layout:node.layout};
    const layout=await window.modcut.shapeText(textValues({...node,...patch}));
    return {...patch,character:{...patch.character,fontPostscriptName:layout.font.postscriptName,...(layout.font.reference?{googleFont:layout.font.reference}:{})},layout};
  }
  const measurementText=m=>`D ${m.distance.toFixed(2)} mm · W ${m.dx.toFixed(2)} · H ${(-m.dy).toFixed(2)} · ∠ ${m.angle.toFixed(1)}°`;
  /**
   * Bézier fit through points (Paper.js simplify). Paper can fit a closed curve with one looping anchor,
   * so the tolerance halves until a closed path keeps three anchors and an open one two. Call inside withScope.
   */
  function fitCurve(points,closed,tolerance) {
    let path=new scope.Path({segments:points,closed,insert:false});
    for(let tries=0;points.length>2&&tries<12;tolerance/=2,tries++) {
      const attempt=new scope.Path({segments:points,closed,insert:false});attempt.simplify(tolerance);
      if(attempt.segments.length>=(closed?3:2)){path.remove();path=attempt;break;}attempt.remove();
    }
    return path;
  }
  /** Pencil: the dragged points become a smooth path; fidelity sets how closely it follows the hand (in screen pixels). */
  function pencil(points) {
    if(state.document.readOnly||points.length<2)return;
    const options={fidelity:3,close:true,closeDistance:15,keepSelected:true,...state.ui.pencil},pixel=1/scope.view.zoom;
    const first=points[0],last=points.at(-1),closed=options.close&&points.length>3&&Math.hypot(first[0]-last[0],first[1]-last[1])<=options.closeDistance*pixel;
    const subpath=withScope(()=>{
      const path=fitCurve(closed?points.slice(0,-1):points,closed,[.5,1,2.5,5,10][options.fidelity-1]*pixel);
      const result={closed,segments:path.segments.map(s=>({p:[s.point.x,s.point.y],in:[s.handleIn.x,s.handleIn.y],out:[s.handleOut.x,s.handleOut.y]}))};path.remove();return result;});
    if(subpath.segments.length<2)return;
    const node=createNode('path',{name:'',subpaths:[subpath],appearance:appearance(null,state.ui.stroke??'#071411',state.ui.strokeWidth??.5)});
    run(()=>{insertNew(node);select(options.keepSelected?[node.id]:[]);});
  }
  /**
   * Path Eraser and Smooth work on the selected paths and shapes (shapes become paths), along the drag; each drag
   * is one undo step. `change(subpath, drag)` returns the new subpaths for one subpath, or null to keep it.
   */
  function alongDrag(label,points,change){
    const doc=state.document;if(doc.readOnly||points.length<1)return false;
    const targets=selectedIds().filter(id=>['path','shape'].includes(doc.getNode(id)?.type)&&doc.isEditable(id)),edits=[];
    for(const id of targets){
      const node=doc.getNode(id),base=node.type==='shape'?withScope(()=>renderer.expandedShape(id)):node;
      const drag=withScope(()=>points.map(p=>{const q=renderer.pointToLocal(id,p);return [q.x,q.y];}));
      let changed=false;const subpaths=base.subpaths.flatMap(sp=>{const out=change(bakeCorners(sp),drag);if(out===null)return [sp];changed=true;return out;});
      if(changed)edits.push({id,node,base,subpaths});
    }
    if(!edits.length)return false;
    state.history.transaction(label,()=>{for(const {id,node,base,subpaths} of edits){
      if(!subpaths.length)state.history.execute(removeNode(id));
      else if(node.type==='shape')state.history.execute(replaceLeaf(id,{...base,subpaths}));
      else state.history.execute(updateNode(id,{subpaths},{label}));}});
    select(edits.filter(e=>e.subpaths.length).map(e=>e.id));return true;
  }
  const pathEraser=points=>alongDrag('Path Eraser',points,(sp,drag)=>erasePath(sp,drag,(state.ui.pathEraserSize??4)/scope.view.zoom));
  /** Smooth: the anchors the drag passes near are fitted again more loosely, so the path gets fewer, rounder curves. */
  const smoothPath=points=>alongDrag('Smooth',points,(sp,drag)=>{
    const range=smoothRange(sp,drag,12/scope.view.zoom);if(!range||range[1]-range[0]<2)return null;
    const fitted=withScope(()=>{const path=fitCurve(sectionPoints(sp,range[0],range[1]),false,12/scope.view.zoom);
      const out=path.segments.map(s=>({p:[s.point.x,s.point.y],in:[s.handleIn.x,s.handleIn.y],out:[s.handleOut.x,s.handleOut.y]}));path.remove();return out;});
    if(fitted.length>=range[1]-range[0]+1)return null;
    const s=sp.segments;fitted[0].in=s[range[0]].in;fitted.at(-1).out=s[range[1]].out;fitted[0].p=s[range[0]].p;fitted.at(-1).p=s[range[1]].p;
    return [{closed:sp.closed,segments:[...s.slice(0,range[0]),...fitted,...s.slice(range[1]+1)]}];
  });
  /** Paintbrush (B): a smooth path stroked with the calligraphic brush (weight plus width profile). */
  function paintbrush(points) {
    if(state.document.readOnly||points.length<2)return;
    const brush=paintbrushOptions(state.ui.paintbrush??{}),pixel=1/scope.view.zoom;
    const subpath=withScope(()=>{const path=fitCurve(points,false,[.5,1,2.5,5,10][brush.fidelity-1]*pixel);
      const result={closed:false,segments:path.segments.map(s=>({p:[s.point.x,s.point.y],in:[s.handleIn.x,s.handleIn.y],out:[s.handleOut.x,s.handleOut.y]}))};path.remove();return result;});
    if(subpath.segments.length<2)return;
    const look=appearance(brush.fillNew?state.ui.fill??null:null,state.ui.stroke??'#071411',brush.size);
    Object.assign(look.strokes[0],{cap:'round',join:'round'});
    const profile=calligraphicProfile(points,brush);if(profile)Object.assign(look,changeStroke(look,{widthProfile:profile},state.ui));
    const node=createNode('path',{name:'',subpaths:[subpath],appearance:look});
    run(()=>{insertNew(node);select(brush.keepSelected?[node.id]:[]);});
  }
  /**
   * Blob Brush (Shift+B): the drag becomes a filled shape in the stroke colour, merged with the filled,
   * unstroked paths of the same colour it touches (or only the selected ones), in one undo step.
   */
  async function blobBrush(points) {
    if(state.document.readOnly||points.length<1)return;
    const brush=blobOptions(state.ui.blobBrush??{}),hex=state.ui.stroke??'#071411',line=points.length>1?points:[points[0],[points[0][0]+.001,points[0][1]]];
    const outline=await outlineStroke([{closed:false,segments:line.map(p=>({p,in:[0,0],out:[0,0]}))}],{width:brush.size,join:'round',cap:'round'});
    if(destroyed||!outline.length)return;
    run(()=>{
      const doc=state.document,pool=brush.mergeWithSelection?selectedIds():doc.descendants(null).map(n=>n.id);
      const same=id=>{const n=doc.getNode(id);return n?.type==='path'&&doc.isEditable(id)&&n.subpaths.every(s=>s.closed)&&!(n.appearance.strokes??[]).some(e=>!e.hidden)
        &&paintHex((n.appearance.fills??[]).find(e=>!e.hidden))?.toUpperCase()===hex.toUpperCase();};
      const merged=withScope(()=>{
        const blob=new scope.CompoundPath({insert:false,children:outline.map(sub=>new scope.Path({insert:false,closed:true,segments:sub.segments.map(g=>new scope.Segment(new scope.Point(...g.p),new scope.Point(...g.in),new scope.Point(...g.out)))}))});
        let result=blob;const absorbed=[];
        for(const id of pool.filter(same)){const other=renderer.booleanOperand(id);
          if(other.bounds.intersects(result.bounds)&&result.intersects(other)||other.contains(result.firstChild?.firstSegment.point??result.bounds.center)||result.contains(other.bounds.center)){const next=result.unite(other,{insert:false});if(result!==blob)result.remove();result=next;absorbed.push(id);}
          other.remove();}
        const subpaths=toSubpaths(result);result.remove();if(blob!==result)blob.remove();return {subpaths,absorbed};});
      const node=createNode('path',{name:'',subpaths:merged.subpaths,fillRule:'nonzero',appearance:appearance(hex,null)});
      state.history.transaction('Blob Brush',()=>{merged.absorbed.forEach(id=>state.history.execute(removeNode(id)));insertNew(node);});
      select(brush.keepSelected?[node.id]:[]);
    });
  }
  /**
   * Shape Builder: the selected shapes divided into regions when the drag starts; the regions the drag
   * crosses merge into one (Alt deletes them) and the rest stay, as separate paths, in one undo step.
   */
  function shapeBuilderSession(){
    const doc=state.document,ids=stackingOrder(doc,selectedIds().filter(id=>doc.isEditable(id)));
    if(ids.length<2)return null;
    return withScope(()=>({ids,regions:runPathfinder(ids.map(id=>({id,item:renderer.booleanOperand(id),fill:fillHex(doc,id)})),'divide').results}));
  }
  function shapeBuilderPreview(session,points){return withScope(()=>pickRegions(scope,session.regions,points)).map(i=>session.regions[i].subpaths);}
  function shapeBuilder(session,points,{alt=false}={}){
    const picked=withScope(()=>pickRegions(scope,session.regions,points));if(!picked.length)return;
    let results=session.regions.filter((r,i)=>!picked.includes(i));
    if(!alt)results=[...results,{subpaths:withScope(()=>mergeRegions(scope,session.regions,picked)),sourceId:session.regions[picked[0]].sourceId,kind:'fill'}];
    const doc=state.document,label=alt?'Shape Builder Delete':'Shape Builder';
    if(!results.length){state.history.transaction(label,()=>session.ids.forEach(id=>state.history.execute(removeNode(id))));select([]);return;}
    const {commands,ids}=pathfinderCommands(doc,session.ids,{results,grouped:false},'divide',label);
    state.history.transaction(label,()=>commands.forEach(c=>state.history.execute(c)));select(ids);
  }
  /** Free Transform: the selected paths and shapes (also inside groups) distorted by moving a corner of the selection box. */
  function freeDistortSession(){
    const doc=state.document,box=renderer.selectionBounds();if(!box||box.width<1e-6||box.height<1e-6)return null;
    const ids=selectedIds().flatMap(id=>doc.getNode(id)?.children?doc.descendants(id).map(n=>n.id):[id]).filter(id=>['path','shape'].includes(doc.getNode(id)?.type)&&doc.isEditable(id));
    if(!ids.length)return null;
    const items=withScope(()=>ids.map(id=>{const item=renderer.booleanOperand(id),world=toSubpaths(item);item.remove();
      world.forEach((s,i)=>{const original=doc.getNode(id).type==='path'?doc.getNode(id).subpaths[i]:null;if(original)s.closed=original.closed;});return {id,world};}));
    return {box,items,corners:boxCorners(box)};
  }
  function freeDistortPreview(session,corners){
    if(!session){withScope(()=>renderer.previewPaths());return;}
    const doc=state.document;
    withScope(()=>renderer.previewPaths(session.items.map(({id,world})=>({subpaths:distortSubpaths(world,session.box,corners),appearance:doc.getNode(id).appearance,strokeScaling:doc.getNode(id).strokeScaling,fillRule:doc.getNode(id).fillRule,matrix:[1,0,0,1,0,0]})),session.items.map(i=>i.id)));
  }
  function freeDistort(session,corners){
    const doc=state.document;freeDistortPreview(null);
    state.history.transaction('Free Distort',()=>{for(const {id,world} of session.items){
      const node=doc.getNode(id),{parentId}=doc.locate(id),placed=toParentSpace(parentId,{type:'path',subpaths:distortSubpaths(world,session.box,corners)});
      if(node.type==='shape')state.history.execute(replaceLeaf(id,{...withScope(()=>renderer.expandedShape(id)),subpaths:placed.subpaths}));
      else state.history.execute(updateNode(id,{subpaths:placed.subpaths},{label:'Free Distort'}));
    }});
    select(state.selection.ids);
  }
  /** Live effects: added to every selected path and shape, edited in place; Apply Last Effect repeats the last one. */
  async function addEffect(type,{ask=true,preset={}}={}){
    if(state.document.readOnly)return;
    // Drop Shadow also works on text; the vector effects change paths and shapes.
    const kinds=EFFECTS[type].container?['group']:EFFECTS[type].raster?['path','shape','text','group']:['path','shape','group'],ids=selectedIds().filter(id=>kinds.includes(state.document.getNode(id)?.type)&&state.document.isEditable(id));
    if(!ids.length)throw new Error(EFFECTS[type].container?'Group the objects first: Effect > Pathfinder works on a group.':type==='rasterize'?'Select paths, shapes, text or groups to rasterize.':EFFECTS[type].pixels?'Select paths, shapes, text or groups to add this effect to.':EFFECTS[type].raster?'Select paths, shapes, text or groups to add a drop shadow to.':'Select paths, shapes or groups to add an effect to.');
    const last=state.ui.lastEffect?.type===type?state.ui.lastEffect:null;
    const values=ask?await effectDialog(type,{...EFFECTS[type].defaults,...last,...preset}):{...(last??EFFECTS[type].defaults),...preset};if(!values||destroyed)return;
    const e=effect(type,values);state.ui.lastEffect=e;
    run(()=>state.history.transaction(EFFECTS[type].label,()=>{for(const id of ids){const node=state.document.getNode(id);
      state.history.execute(updateNode(id,{appearance:{...node.appearance,effects:[...(node.appearance.effects??[]),e]}},{label:EFFECTS[type].label}));}}));
  }
  async function editEffect(id,index){
    const node=state.document.getNode(id),current=node?.appearance.effects?.[index];if(!current||state.document.readOnly)return;
    const values=await effectDialog(current.type,current);if(!values||destroyed)return;
    run(()=>{const fresh=state.document.getNode(id),list=[...fresh.appearance.effects];list[index]=effect(current.type,{...values,hidden:current.hidden});
      state.history.execute(updateNode(id,{appearance:{...fresh.appearance,effects:list}},{label:`Edit ${EFFECTS[current.type].label}`}));});
  }
  /**
   * Image Trace (Make and Expand): the selected image's visible pixels traced into one filled path per
   * colour, in a group above the image, which is hidden (one undo step). Returns paths, anchors and colours.
   */
  /** One traced ring as a closed subpath: corners stay sharp, the runs between them get fitted curves. Call inside withScope. */
  function traceSubpath(ring,toWorld,tolerance){
    const segs=path=>{const out=path.segments.map(s=>({p:[s.point.x,s.point.y],in:[s.handleIn.x,s.handleIn.y],out:[s.handleOut.x,s.handleOut.y]}));path.remove();return out;};
    const corners=ringCorners(ring);
    if(!corners.length)return {closed:true,segments:segs(fitCurve(ring.map(toWorld),true,tolerance))};
    const segments=[];
    corners.forEach((c,k)=>{const next=corners[(k+1)%corners.length],run=[];for(let i=c;;i=(i+1)%ring.length){run.push(ring[i]);if(i===next&&run.length>1)break;}
      const fitted=run.length>2?segs(fitCurve(run.map(toWorld),false,tolerance)):run.map(p=>({p:toWorld(p),in:[0,0],out:[0,0]}));
      // Each run starts on the corner the previous one ended on: that anchor takes the new run's outgoing handle.
      if(segments.length){segments.at(-1).out=fitted[0].out;segments.push(...fitted.slice(1));}else segments.push(...fitted);});
    // The last anchor is the first corner again: its incoming handle goes to the first anchor.
    const end=segments.pop();segments[0].in=end.in;return {closed:true,segments};
  }
  async function traceImage(id,options){
    const doc=state.document,node=doc.getNode(id);if(node?.type!=='image'||!doc.isEditable(id))throw new Error('Select an image to trace.');
    const asset=doc.data.assets[node.assetId],img=new Image();img.src=`data:${asset.mimeType??'image/png'};base64,${asset.data}`;await img.decode();if(destroyed)return null;
    const crop=node.crop??{x:0,y:0,width:1,height:1},sw=img.naturalWidth*crop.width,sh=img.naturalHeight*crop.height,k=traceScale(sw,sh,options.maxPixels??1_000_000);
    const width=Math.max(1,Math.round(sw*k)),height=Math.max(1,Math.round(sh*k)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,img.naturalWidth*crop.x,img.naturalHeight*crop.y,sw,sh,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height),{palette,labels:raw}=quantize(pixels,options);
    const mmPerPx=node.width/width,labels=removeNoise(raw,width,height,Math.round((options.noise??0)*k*k));
    const world=renderer.worldMatrix(id),toWorld=([x,y])=>{const u=x*node.width/width,v=y*node.height/height;return [world[0]*u+world[2]*v+world[4],world[1]*u+world[3]*v+world[5]];};
    const {parentId,index}=doc.locate(id),tolerance=mmPerPx*(.35+(100-(options.fidelity??70))/30),minArea=options.minDetailMm?(options.minDetailMm/mmPerPx)**2:0;
    const parts=[];let anchors=0;
    for(const [j,colour] of palette.entries()){
      let rings=contours(labels,width,height,j).filter(r=>Math.abs(ringArea(r))>=Math.max(1,minArea));
      if(options.outerOnly&&rings.length){const sign=Math.sign(ringArea(rings.reduce((a,b)=>Math.abs(ringArea(b))>Math.abs(ringArea(a))?b:a)));rings=rings.filter(r=>Math.sign(ringArea(r))===sign);}
      if(!rings.length)continue;
      const subpaths=withScope(()=>rings.map(r=>traceSubpath(simplifyRing(r,.6),toWorld,tolerance)));
      anchors+=subpaths.reduce((n,s)=>n+s.segments.length,0);
      const hex='#'+colour.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
      parts.push(toParentSpace(parentId,createNode('path',{name:hex,subpaths,fillRule:'evenodd',appearance:appearance(hex,null)})));
      await new Promise(r=>setTimeout(r));if(destroyed)return null;
    }
    if(!parts.length)throw new Error('Nothing to trace with these settings. Try another threshold or preset.');
    const group=createNode('group',{name:'Image Trace',children:parts});
    run(()=>{state.history.transaction('Image Trace',()=>{state.history.execute(insertNode(parentId,group,index+1));state.history.execute(updateNode(id,{visible:false},{label:'Image Trace'}));});select([group.id]);});
    return {paths:parts.length,anchors,colors:palette.length};
  }
  /** Filled closed paths and shapes a Knife or Eraser stroke works on: the selection, or every one. */
  function cutTargets(){
    const doc=state.document,chosen=selectedIds(),pool=chosen.length?chosen.flatMap(id=>doc.getNode(id)?.children?doc.descendants(id).map(n=>n.id):[id]):doc.descendants(null).map(n=>n.id);
    return pool.filter(id=>{const n=doc.getNode(id);return ['path','shape'].includes(n?.type)&&doc.isEditable(id)&&(n.type==='shape'||n.subpaths.some(s=>s.closed))&&n.appearance.fills.some(f=>!f.hidden);});
  }
  /** Knife and Eraser: each target replaced by its pieces (in its parent's space), in one undo step. */
  function cutWith(label,cut){
    const doc=state.document,edits=[];
    for(const id of cutTargets()){
      const world=withScope(()=>{const item=renderer.booleanOperand(id),sub=toSubpaths(item);item.remove();return sub;});
      const pieces=withScope(()=>cut(world));
      const before=withScope(()=>areaOf(scope,world)),after=withScope(()=>pieces.reduce((sum,p)=>sum+areaOf(scope,p),0));
      if(pieces.length<2&&Math.abs(before-after)<1e-6)continue;
      edits.push({id,pieces});
    }
    if(!edits.length)return false;
    const created=[];
    state.history.transaction(label,()=>{for(const {id,pieces} of edits){
      const node=doc.getNode(id),{parentId,index}=doc.locate(id),look=structuredClone(node.appearance);
      state.history.execute(removeNode(id));
      pieces.forEach((subpaths,i)=>{const piece=toParentSpace(parentId,createNode('path',{name:node.name,subpaths,fillRule:'nonzero',appearance:look,opacity:node.opacity,blendMode:node.blendMode}));
        state.history.execute(insertNode(parentId,piece,index+i));created.push(piece.id);});
    }});
    select(created);return true;
  }
  /**
   * Width tool. Pressing on a stroked path starts a session: on a width point's side end it resizes that
   * point, on its centre it slides it along the path, elsewhere it adds a point there. The drag is previewed
   * and applied on release as one undo step; Alt changes one side only.
   */
  function widthTarget(id){const node=state.document.getNode(id),stroke=node&&shown(node.appearance?.strokes)[0];
    return ['path','shape'].includes(node?.type)&&state.document.isEditable(id)&&stroke?.width>0?{node,stroke}:null;}
  const shown=list=>(list??[]).filter(e=>!e.hidden);
  function widthHandleAt(point){
    const near=6/scope.view.zoom;
    for(const id of [renderer.hit(point),...selectedIds()].filter(Boolean)){const target=widthTarget(id);if(!target)continue;
      for(const h of withScope(()=>renderer.widthHandles(id,target.stroke)))for(const part of ['left','right','point'])
        if(Math.hypot(h[part][0]-point[0],h[part][1]-point[1])<=near)return {id,index:h.index,t:h.t,part};}
    return null;
  }
  function widthSession(point){
    if(state.document.readOnly)return null;
    const handle=widthHandleAt(point);if(handle)return {...handle,side:handle.part==='point'?null:handle.part};
    const id=renderer.hit(point),target=id&&widthTarget(id);if(!target)return null;
    const loc=withScope(()=>renderer.strokeLocation(id,point));if(!loc)return null;
    return {id,index:-1,t:loc.t,part:'new',side:loc.side};
  }
  /** The profile a Width drag to `point` gives; the document is unchanged until the drag ends. */
  function widthProfileFor(session,point,{alt=false}={}){
    const target=widthTarget(session.id);if(!target)return null;
    const loc=withScope(()=>renderer.strokeLocation(session.id,point));if(!loc)return null;
    if(session.part==='point')return {target,points:moveWidthPoint(target.stroke.widthProfile,session.index,loc.t)};
    return {target,points:setWidthPoint(target.stroke.widthProfile,{t:session.t,index:session.index,share:loc.distance/target.stroke.width,side:alt?session.side:'both'}).points};
  }
  /** Live Width drag: the new stroke outline in world space, for the preview. */
  function widthPreview(session,point,options){
    const result=widthProfileFor(session,point,options);if(!result)return [];
    const m=renderer.worldMatrix(session.id),local=withScope(()=>renderer.profiledStroke(session.id,{...result.target.stroke,widthProfile:result.points}))??[];
    return local.map(sub=>sub.segments.map(g=>[m[0]*g.p[0]+m[2]*g.p[1]+m[4],m[1]*g.p[0]+m[3]*g.p[1]+m[5]]));
  }
  function widthDrag(session,point,options){
    const result=widthProfileFor(session,point,options);if(!result)return;
    state.history.execute(updateNode(session.id,{appearance:changeStroke(result.target.node.appearance,{widthProfile:result.points},state.ui)},{label:'Width'}));
  }
  async function widthPointEdit(point){
    const handle=widthHandleAt(point),target=handle&&widthTarget(handle.id);if(!target)return false;
    const w=normalizeProfile(target.stroke.widthProfile)[handle.index],values=await widthPointDialog({left:w.left*target.stroke.width,right:w.right*target.stroke.width});
    if(!values||destroyed)return true;
    run(()=>{const current=widthTarget(handle.id);if(!current)return;
      let points=normalizeProfile(current.stroke.widthProfile);
      points=values.remove?removeWidthPoint(points,handle.index):points.map((p,i)=>i===handle.index?{...p,left:values.left/current.stroke.width,right:values.right/current.stroke.width}:p);
      state.history.execute(updateNode(handle.id,{appearance:changeStroke(current.node.appearance,{widthProfile:points},state.ui)},{label:'Width Point Edit'}));});
    return true;
  }
  /** Object > Envelope Distort > Make with Top Object: the topmost object becomes the envelope of the others. */
  function makeEnvelope(chosen){
    const doc=state.document,members=stackingOrder(doc,chosen);
    if(members.length<2)throw new Error('Select the artwork and, on top, the path or shape to use as the envelope.');
    if(new Set(members.map(id=>doc.locate(id).parentId)).size>1)throw new Error('Make envelopes from objects in the same layer or group.');
    if(!['path','shape'].includes(doc.getNode(members.at(-1)).type))throw new Error('The topmost object must be a path or shape to use as the envelope.');
    if(!members.slice(0,-1).some(id=>['path','shape','compoundPath'].includes(doc.getNode(id).type)))throw new Error('Envelopes bend paths, shapes and compound paths. Create outlines from text first.');
    const {commands,group}=groupCommands(doc,members);
    state.history.transaction('Make Envelope',()=>{commands.forEach(c=>state.history.execute(c));state.history.execute(updateNode(group.id,{name:'Envelope',envelope:{}}));});
    select([group.id]);return group.id;
  }
  /** Object > Envelope Distort > Make with Warp: the objects are grouped and bent by a warp style, editable later. */
  async function makeWarpEnvelope(chosen){
    const doc=state.document,members=stackingOrder(doc,chosen);
    if(!members.length)throw new Error('Select objects to warp.');
    if(new Set(members.map(id=>doc.locate(id).parentId)).size>1)throw new Error('Make envelopes from objects in the same layer or group.');
    if(!members.some(id=>['path','shape','compoundPath'].includes(doc.getNode(id).type)))throw new Error('Envelopes bend paths, shapes and compound paths. Create outlines from text first.');
    const values=await effectDialog('warp',{...EFFECTS.warp.defaults,...state.ui.envelopeWarp});if(!values||destroyed)return;
    const {type,...warp}=effect('warp',values);void type;state.ui.envelopeWarp=warp;
    run(()=>{const {commands,group}=groupCommands(doc,members);
      state.history.transaction('Make Envelope',()=>{commands.forEach(c=>state.history.execute(c));state.history.execute(updateNode(group.id,{name:'Envelope',envelope:{warp}}));});
      select([group.id]);});
  }
  /** Object > Blend > Make: the objects (in stacking order) become the keys of one blend group. */
  function makeBlend(chosen){
    const doc=state.document,members=stackingOrder(doc,chosen);
    if(members.length<2)throw new Error('Select at least two objects to blend.');
    if(new Set(members.map(id=>doc.locate(id).parentId)).size>1)throw new Error('Blend objects in the same layer or group.');
    const {commands,group}=groupCommands(doc,members),options=blendOptions(state.ui.blendOptions??BLEND_DEFAULTS);
    state.history.transaction('Make Blend',()=>{commands.forEach(c=>state.history.execute(c));state.history.execute(updateNode(group.id,{name:'Blend',blend:options}));});
    select([group.id]);return group.id;
  }
  /**
   * Object > Blend > Replace Spine: the blend and one path are selected; the path becomes the blend's spine (in the
   * blend group's space), the keys move to equal shares of its length, and the path itself is removed.
   */
  function replaceSpine(chosen){
    const doc=state.document,blendIds=[...new Set(chosen.map(id=>doc.getNode(id)?.blend?id:doc.ancestors(id).find(n=>n.blend)?.id).filter(Boolean))];
    if(blendIds.length!==1)throw new Error('Select one blend and one path.');
    const blendId=blendIds[0],paths=chosen.filter(id=>id!==blendId&&!doc.ancestors(id).some(n=>n.id===blendId)&&['path','shape'].includes(doc.getNode(id)?.type));
    if(paths.length!==1)throw new Error('Select one blend and one path.');
    const spine=withScope(()=>{
      const item=renderer.items.get(paths[0]);if(!item)return null;
      const copy=item.clone({insert:false});copy.matrix=new scope.Matrix(...renderer.worldMatrix(paths[0]));copy.applyMatrix=true;
      copy.transform(new scope.Matrix(...renderer.worldMatrix(blendId)).inverted());
      const out=toSubpaths(copy)[0];copy.remove();return out;});
    if(!spine||spine.segments.length<2)throw new Error('A blend spine is a path with at least two points.');
    state.history.transaction('Replace Spine',()=>{
      state.history.execute(updateNode(blendId,{blend:{...doc.getNode(blendId).blend,spine}}));
      placeKeys(blendId);
      state.history.execute(removeNode(paths[0]));
    });
    select([blendId]);
  }
  /** Moves a blend's keys to their places on its spine. */
  function placeKeys(blendId){
    const doc=state.document,node=doc.getNode(blendId),curve=spineCurve(node.blend.spine);
    // The same keys the blend draws: paths, shapes, and text whose glyphs are known.
    const keys=node.children.filter(child=>child.visible&&(['path','shape'].includes(child.type)||child.type==='text'&&renderer.items.get(child.id)?.className==='CompoundPath'));
    const moves=withScope(()=>{const world=new scope.Matrix(...renderer.worldMatrix(blendId));
      return keys.map((key,k)=>{const target=world.transform(new scope.Point(...curve.at(keyPosition(k,keys.length)).p)),centre=renderer.bounds(key.id).center;return [key.id,target.x-centre.x,target.y-centre.y];});});
    for(const [id,dx,dy] of moves)if(Math.hypot(dx,dy)>1e-9)transforms.apply([1,0,0,1,dx,dy],'Replace Spine',{ids:[id],remember:false});
  }
  /** Object > Blend > Reverse Spine: the spine runs the other way, so the keys swap places along it. */
  function reverseSpine(list){
    const doc=state.document,withSpine=list.filter(id=>doc.getNode(id).blend.spine);
    if(!withSpine.length)throw new Error('Select a blend with a spine. Replace Spine gives a blend one.');
    state.history.transaction('Reverse Spine',()=>{for(const id of withSpine){const blend=doc.getNode(id).blend;
      state.history.execute(updateNode(id,{blend:{...blend,spine:reverseSubpaths([blend.spine])[0]}}));placeKeys(id);}});
    select(withSpine);
  }
  /** Blend Options: for the selected blends, or the options new blends get. */
  async function blendOptionsCommand(){
    const doc=state.document,list=selectedIds().map(id=>doc.getNode(id)?.blend?id:doc.ancestors(id).find(n=>n.blend)?.id).filter(Boolean);
    const current=list.length?doc.getNode(list[0]).blend:state.ui.blendOptions??BLEND_DEFAULTS,values=await blendOptionsDialog(current);
    if(!values||destroyed)return;
    run(()=>{const options=blendOptions(values);state.ui.blendOptions=options;
      // A spine stays: it is not one of the dialog's settings.
      const {spine:ignored,...shared}=options;void ignored;
      if(list.length)state.history.transaction('Blend Options',()=>[...new Set(list)].forEach(id=>{const spine=doc.getNode(id).blend.spine;state.history.execute(updateNode(id,{blend:spine?{...shared,spine}:shared}));}));});
  }
  /** Blend tool: click one object, then another; the second click makes the blend. */
  function blendClick(id){
    const doc=state.document,first=state.ui.blendFirst;
    if(!id){state.ui.blendFirst=null;status();return 'none';}
    if(!first||first===id||!doc.getNode(first)){state.ui.blendFirst=id;select([id]);status();return 'first';}
    state.ui.blendFirst=null;makeBlend([first,id]);return 'made';
  }
  const knife=points=>cutWith('Knife',world=>knifeCut(scope,world,points));
  const eraser=points=>cutWith('Eraser',world=>eraseRegion(scope,world,points,state.ui.eraserSize??3));
  /** Measure: a line on the canvas and the distance, offsets and angle in the status bar. */
  function setMeasure(from,to=null){state.ui.measurement=from&&to?measure(from,to):null;withScope(()=>renderer.setMeasure(from&&to?[from,to]:null));status();}
  /** Eyedropper: `sample` copies the clicked object's look, `apply` gives it the selection's look, `pixel` takes a colour. */
  function eyedropper({mode,hitId=null,hex=null}) {
    if(state.document.readOnly)return;
    const doc=state.document,kind=state.ui.paintFocus==='stroke'?'stroke':'fill',commit=(label,commands)=>{if(commands.length)state.history.transaction(label,()=>commands.forEach(c=>state.history.execute(c)));};
    if(mode==='pixel'){if(!hex)throw new Error('There is no colour under the pointer.');return paint(kind,hex);}
    if(mode==='apply'){const source=paintIds()[0];if(!source)throw new Error('Select the object whose appearance you want to apply, then Alt-click.');return commit('Eyedropper',applySampleCommands(doc,[hitId],sampleAppearance(doc.getNode(source))));}
    const sample=sampleAppearance(doc.getNode(hitId)),targets=selectedIds().filter(id=>id!==hitId);
    if(targets.length)return commit('Eyedropper',applySampleCommands(doc,targets,sample));
    // Nothing selected: the sample becomes the paint for new objects.
    state.ui.fill=paintHex(sample.appearance.fills[0])?.toUpperCase()??null;state.ui.stroke=paintHex(sample.appearance.strokes[0])?.toUpperCase()??null;
    if(sample.appearance.strokes[0])state.ui.strokeWidth=sample.appearance.strokes[0].width;
    toolbar?.update();panels?.render();
  }
  /** Scissors: cut at the clicked point; an open path splits into the original and a new path above it. */
  function scissors(hit) {
    if(state.document.readOnly)return;
    const doc=state.document,node=doc.getNode(hit.nodeId),base=node.type==='shape'?withScope(()=>renderer.expandedShape(node.id)):node;
    const parts=cutSubpath(base.subpaths[hit.subpath],hit.segment,hit.t),subpaths=[...base.subpaths];subpaths.splice(hit.subpath,1,parts[0]);
    const commands=[node.type==='shape'?replaceLeaf(node.id,{...base,subpaths}):updateNode(node.id,{subpaths},{label:'Scissors'})],ids=[node.id];
    if(parts[1]){const piece=createNode('path',{name:'',subpaths:[parts[1]],fillRule:base.fillRule,appearance:structuredClone(base.appearance),opacity:base.opacity,blendMode:base.blendMode,
      ...(base.strokeScaling!==undefined?{strokeScaling:base.strokeScaling}:{})});const {parentId,index}=doc.locate(node.id);commands.push(insertNode(parentId,piece,index+1));ids.push(piece.id);}
    state.history.transaction('Scissors',()=>commands.forEach(c=>state.history.execute(c)));select(ids);
  }
  /** Gradient edits on the first fill or stroke of each selected object; `edit(current, localBox)` returns the new gradient. */
  function gradient(kind,edit,{label='Gradient',mergeKey=null}={}) {
    if(state.document.readOnly)return;
    const ids=paintIds();if(!ids.length)throw new Error('Select artwork to apply a gradient.');
    let last=null;
    state.history.transaction(label,()=>{for(const id of ids){
      const node=state.document.getNode(id),entry=(kind==='stroke'?node.appearance.strokes:node.appearance.fills)[0];
      const box=withScope(()=>renderer.localBounds(id))??{x:0,y:0,width:10,height:10},next=edit(isGradient(entry?.paint)?entry.paint:null,box,node);
      if(next){last=next;state.history.execute(updateNode(id,{appearance:changeGradient(node.appearance,kind,next,state.ui)},{label}));}
    }},{mergeKey});
    if(last)state.ui.lastGradient={type:last.type,stops:structuredClone(last.stops),angle:last.angle};
    panels?.render();
  }
  /** Installed font families for the Character panel; loads once and re-renders the panels when ready. */
  let fontFamilyList=null;
  function fontFamilies() {
    if(fontFamilyList)return fontFamilyList;
    fontFamilyList=[];listFonts().then(fonts=>{fontFamilyList=[...new Set(fonts.map(f=>f.family))].sort((a,b)=>a.localeCompare(b));if(!destroyed)panels?.render();}).catch(()=>{fontFamilyList=null;});
    return fontFamilyList;
  }
  /** Character and Paragraph changes: every selected text is shaped again with the font, then committed as one undo step. */
  async function textStyle(changes,label='Character') {
    if(destroyed||state.document.readOnly)return;
    if(textBusy)throw new Error('Text is still being updated. Try again in a moment.');
    const ids=selectedIds().filter(id=>state.document.getNode(id)?.type==='text'&&state.document.isEditable(id));
    if(!ids.length)throw new Error('Select text first.');
    textBusy=true;statusLine.textContent='Updating text…';const before=state.document.data;
    try {
      const patches=await Promise.all(ids.map(async id=>{
        const node=state.document.getNode(id),values={...textValues(node),...changes};
        // A change for the whole object replaces the same setting in its styled runs.
        values.runs=values.runs.map(run=>run.character?{...run,character:Object.fromEntries(Object.entries(run.character).filter(([key])=>!(key in changes)))}:run);
        // A new family or source drops the saved face, Google reference and variable axes of the old font.
        if(changes.fontFamily!==undefined&&(changes.fontFamily!==node.character?.fontFamily||changes.fontSource!==(node.character?.fontSource??'system'))){delete values.fontPostscriptName;delete values.googleFont;delete values.fontAxes;}
        if(changes.fontWeight!==undefined||changes.fontStyle!==undefined)delete values.fontPostscriptName;
        return [id,await resolveText(node,textProperties(values))];
      }));
      if(destroyed)return;if(state.document.data!==before)throw new Error('The artwork changed while updating text. Try again.');
      run(()=>{state.history.transaction(label,()=>{for(const [id,patch] of patches)state.history.execute(updateNode(id,patch));});
        const last=patches.at(-1)[1];state.ui.character=last.character;state.ui.textAlignment=last.paragraph.alignment;state.ui.fontMetadata=last.layout.font;});
    }finally{textBusy=false;if(!destroyed){status();panels?.render();}}
  }
  /**
   * Touch Type (D5): the glyph under a point (world mm) as its character index and its box, in world
   * coordinates (corners in order top-left, top-right, bottom-right, bottom-left).
   */
  function touchGlyphAt(point,preferred=null){
    const id=preferred??renderer.hit(new scope.Point(point[0],point[1])),node=state.document.getNode(id);
    if(node?.type!=='text'||!hasTextLayout(node)||node.kind==='onPath'||!state.document.isEditable(id))return null;
    const local=renderer.pointToLocal(id,point),boxes=node.layout.glyphs.filter(g=>g.index!==undefined&&g.subpaths.length).map(g=>{
      const pts=g.subpaths.flatMap(s=>s.segments.map(x=>x.p)),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
      return {index:g.index,x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};});
    if(!boxes.length)return null;
    const dist=b=>Math.hypot(Math.max(b.x-local.x,0,local.x-b.x-b.w),Math.max(b.y-local.y,0,local.y-b.y-b.h));
    const box=boxes.reduce((a,b)=>dist(b)<dist(a)?b:a);
    const world=(x,y)=>{const q=renderer.pointToWorld(id,[x,y]);return [q.x,q.y];};
    return {id,index:box.index,corners:[world(box.x,box.y),world(box.x+box.w,box.y),world(box.x+box.w,box.y+box.h),world(box.x,box.y+box.h)]};
  }
  /** The same glyph again after a layout change (by index), for the handles. */
  function touchGlyph(id,index){const node=state.document.getNode(id);if(node?.type!=='text'||!hasTextLayout(node))return null;
    const g=node.layout.glyphs.find(x=>x.index===index);if(!g)return null;const p=g.subpaths[0]?.segments[0]?.p;if(!p)return null;
    const at=renderer.pointToWorld(id,p);return touchGlyphAt([at.x,at.y],id)?.index===index?touchGlyphAt([at.x,at.y],id):null;}
  /** Applies a Touch Type change ({dx, dy} in the text's own mm, scale, turn in degrees) to one character, as one undo step. */
  async function touchType(id,index,{dx=0,dy=0,scale=1,turn=0}){
    if(destroyed||state.document.readOnly)return;if(textBusy)throw new Error('Text is still being updated. Try again in a moment.');
    const node=state.document.getNode(id);if(node?.type!=='text')return;
    const c=characterAt(node,index),changes={};
    if(dx)changes.xShift=Math.round(((c.xShift??0)+dx/PT_TO_MM)*1000)/1000;
    if(dy)changes.baselineShift=Math.round(((c.baselineShift??0)-dy/PT_TO_MM)*1000)/1000;
    if(scale!==1){changes.horizontalScale=Math.max(1,Math.min(10000,Math.round((c.horizontalScale??100)*scale*100)/100));changes.verticalScale=Math.max(1,Math.min(10000,Math.round((c.verticalScale??100)*scale*100)/100));}
    if(turn){const r=((c.rotation??0)+turn+540)%360-180;changes.rotation=Math.round(r*100)/100;}
    if(!Object.keys(changes).length)return;
    textBusy=true;const before=state.document.data;
    try{
      const values=textValues(node),length=String.fromCodePoint(textContent(node).codePointAt(index)??0).length;
      values.runs=styleRange(values.runs,index,index+length,changes);
      const patch=await resolveText(node,textProperties(values));
      if(destroyed)return;if(state.document.data!==before)throw new Error('The artwork changed while updating text. Try again.');
      run(()=>state.history.execute(updateNode(id,patch,{label:'Touch Type'})));
    }finally{textBusy=false;}
  }
  async function createTextOutlines() {
    if(destroyed||textBusy||state.document.readOnly||document.querySelector('.modal-overlay'))return;
    const previousSelection=selectedIds();
    const ids=[...new Set(previousSelection.flatMap(id=>{const n=state.document.getNode(id);return n.children?state.document.descendants(id).map(n=>n.id):[id];}))].filter(id=>state.document.getNode(id)?.type==='text'&&state.document.isEditable(id));
    if(!ids.length)throw new Error('Select text to create outlines.');
    textBusy=true;statusLine.textContent='Creating text outlines…';const before=state.document.data;
    try {
      const groups=await Promise.all(ids.map(async id=>{const node=state.document.getNode(id);return textToOutlines(hasTextLayout(node)?node:{...node,...await resolveText(node,{content:node.content,character:node.character??DEFAULT_CHARACTER,paragraph:node.paragraph})});}));
      if(destroyed)return;if(state.document.data!==before)throw new Error('The artwork changed while creating outlines. Try again.');
      run(()=>{state.history.transaction('Create Outlines',()=>{for(const group of groups){const {parentId,index}=state.document.locate(group.id);state.history.execute(removeNode(group.id));state.history.execute(insertNode(parentId,group,index));}});select(previousSelection);});
    }finally{textBusy=false;if(!destroyed)status();}
  }
  /** The first subpath of a path or live shape, in its parent's coordinates, for Type on a Path. */
  function textPathFrom(id) {
    const source=state.document.getNode(id);
    if(!['path','shape'].includes(source?.type)||!state.document.isEditable(id))throw new Error('Click a path or shape to type along it.');
    const subpath=(source.type==='shape'?withScope(()=>renderer.expandedShape(id)):source).subpaths[0];
    if(!subpath||subpath.segments.length<2)throw new Error('Type on a Path needs a path with at least two points.');
    return structuredClone(subpath);
  }
  async function editText(point = scope.view.center, id = null, frame = null, {pathFrom = null, orientation = 'horizontal'} = {}) {
    if(destroyed||textBusy||state.document.readOnly||document.querySelector('.modal-overlay'))return;
    const original=id?state.document.getNode(id):null;
    if(id&&(original?.type!=='text'||!state.document.isEditable(id)))return;
    let subpath=null;
    try{if(pathFrom)subpath=textPathFrom(pathFrom);}catch(error){onError(error.message);return;}
    const parent=id?state.document.locate(id).parentId:pathFrom?state.document.locate(pathFrom).parentId:insertionParent();
    let defaults=original?textValues(original):{text:'Text',...DEFAULT_CHARACTER,...state.ui.character,alignment:state.ui.textAlignment??'left',
      kind:pathFrom?'onPath':frame?'area':'point',...(orientation==='vertical'&&!frame&&!pathFrom?{orientation}:{}),...(frame?{frameWidth:frame.width,frameHeight:frame.height}:{}),...(pathFrom?{pathSubpath:subpath,pathOffset:0,pathFlip:false}:{})};
    const before=state.document.data;
    textBusy=true;statusLine.textContent='Loading installed fonts…';
    try {
      const [fonts,googleCatalog]=await Promise.all([listFonts(),window.modcut.listGoogleFonts()]);if(destroyed)return;
      status();
      if(state.document.data!==before)throw new Error('The artwork changed while loading fonts. Try again.');
      if(!original&&defaults.fontSource!=='google'&&!fonts.some(f=>f.family===defaults.fontFamily)){const face=['Arial','Helvetica','DejaVu Sans','Liberation Sans','Noto Sans'].map(name=>fonts.find(f=>f.family===name&&f.fontWeight==='normal'&&f.fontStyle==='normal')).find(Boolean)??fonts[0];if(face)defaults={...defaults,fontFamily:face.family,fontWeight:face.fontWeight,fontStyle:face.fontStyle};}
      const node=original??(pathFrom?pathText(subpath,defaults):toParentSpace(parent,pointText([point.x,point.y],defaults)));
      const pending=textDialog(defaults,patch=>run(()=>renderer.previewText(patch?{...node,...patch}:null,parent)),{fonts,googleCatalog,fontMetadata:original?.layout?.font??state.ui.fontMetadata,
        googleFamily:window.modcut.googleFontFamily,refreshGoogle:()=>window.modcut.listGoogleFonts({refresh:true}),resolve:patch=>resolveText(node,patch)});
      ownedTextModal=document.querySelector('.draw-text-dialog');
      const patch=await pending;ownedTextModal=null;if(destroyed)return;
      run(()=>{
        renderer.previewText(null);
        if(!patch)return;
        if(state.document.data!==before)throw new Error('The artwork changed while editing text. Open the editor again.');
        state.ui.character=patch.character;state.ui.fontMetadata=patch.layout.font;state.ui.textAlignment=patch.paragraph.alignment;
        // Type on a Path turns the clicked path into the text's path, as in Illustrator.
        state.history.transaction(original?'Edit Text':pathFrom?'Type on a Path':frame?'Area Text':'Point Text',()=>{
          if(original)return state.history.execute(updateNode(id,patch));
          if(pathFrom){const {index}=state.document.locate(pathFrom);state.history.execute(removeNode(pathFrom));return state.history.execute(insertNode(parent,{...node,...patch},index));}
          insertNew({...node,...patch},{space:false});
        });
        select([node.id]);
      });
    }catch(error){ownedTextModal=null;if(!destroyed){run(()=>renderer.previewText(null));onError(error.message);}}finally{textBusy=false;if(!destroyed)status();}
  }
  const shapeOptions=()=>({fill:state.ui.fill,stroke:state.ui.stroke,strokeWidth:state.ui.strokeWidth,points:state.ui.points,cornerRadius:state.ui.cornerRadius ?? 5});
  async function shapeDialog(tool,p=scope.view.center) {
    const options=await shapeSizeDialog(tool,shapeOptions());if(!options || destroyed)return;
    run(()=>{
      let end;
      if(tool==='line'){const angle=options.angle*Math.PI/180;end=[p.x+Math.cos(angle)*options.lineLength,p.y+Math.sin(angle)*options.lineLength];}
      else if(['polygon','star'].includes(tool))end=[p.x+options.radius,p.y];else end=[p.x+options.width,p.y+options.height];
      insertShape(shapeFromDrag(tool,[p.x,p.y],end,{...shapeOptions(),...options}));
    });
  }
  function setTool(id) {
    if(!implementedTools.has(id) || state.document.readOnly && !['select','hand','zoom'].includes(id))return;
    if(id!==state.ui.tool&&['direct-selection','anchor-point','delete-anchor'].some(tool=>tool===id||tool===state.ui.tool))state.selection.set(state.selection.ids);
    if(state.ui.tool==='measure'&&id!=='measure'&&state.ui.measurement)setMeasure(null);
    interactions?.cancel();paths?.finish();toolbar?.close();temporary=null;state.ui.tool=id;canvas.dataset.tool=id;canvas.style.cursor=cursor();
    withScope(()=>renderer.select());toolbar?.update();panels?.render();hint.hidden=state.document.data.layers.some(l=>l.children.length)||state.document.readOnly||id!=='select';status();
  }
  function openPanel(id) {toolbar?.close();panels.open(id);}
  artboards=createArtboardController(state,{refresh,fit,bounds:id=>renderer.bounds(id),localMatrix:(id,m)=>renderer.localMatrix(id,m)});
  panels=createPanels(shell,state,{run,select,selectedIds,paintIds,paint,bounds:()=>renderer.selectionBounds(),fit,artboards,navigatorImage,navigatorView,navigateTo,
    // Glyphs panel: into the open text editor at the cursor; else open the editor for the selected text first.
    insertGlyph(ch){
      const put=()=>{const area=document.querySelector('.draw-text-dialog textarea[name=text]');if(!area)return false;
        const start=area.selectionStart??area.value.length,end=area.selectionEnd??start;area.setRangeText(ch,start,end,'end');area.dispatchEvent(new Event('input',{bubbles:true}));area.focus();return true;};
      if(put())return;
      const id=selectedIds().find(i=>state.document.getNode(i)?.type==='text');
      if(!id)throw new Error('Select a text object, or start typing with the Type tool, to insert a glyph.');
      void editText(undefined,id);setTimeout(()=>{const area=document.querySelector('.draw-text-dialog textarea[name=text]');if(area){area.setSelectionRange(area.value.length,area.value.length);put();}},50);
    },
    addAssets,removeAsset,renameAsset,exportAssets:options=>exportAssets(options).catch(error=>{if(!destroyed)onError(error.message);}),
    cornerInfo:()=>paths?.cornerInfo()??null,setCornerRadius:radius=>paths.setCornerRadius(radius),
    strokeProps(props,{mergeKey=null}={}){const ids=paintIds();if(!ids.length||state.document.readOnly)return;
      if(props.width!==undefined)state.ui.strokeWidth=props.width;
      state.history.transaction('Stroke',()=>{for(const id of ids)state.history.execute(updateNode(id,{appearance:changeStroke(state.document.getNode(id).appearance,props,state.ui)}));},{mergeKey});},
    paintFocus(kind){state.ui.paintFocus=kind;toolbar?.update();panels?.render();},
    thumbnail:id=>withScope(()=>renderer.thumbnail(id)),
    gradient:(kind,edit,options)=>gradient(kind,edit,options),
    textStyle:(changes,label)=>textStyle(changes,label).catch(error=>{if(!destroyed)onError(error.message);}),
    fontFamilies,
    command:id=>handle(id),
    addEffect:type=>addEffect(type).catch(error=>{if(!destroyed)onError(error.message);}),editEffect:(id,i)=>editEffect(id,i).catch(error=>{if(!destroyed)onError(error.message);}),
    pointer:()=>lastPoint,
    traceImage:(id,options)=>traceImage(id,options).catch(error=>{if(!destroyed)onError(error.message);return null;}),
    // Links > Replace: a new image file in the same place, at the same width (height follows the new proportions).
    replaceImage:id=>run(()=>{const input=document.createElement('input');input.type='file';input.accept='image/*';
      input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file||destroyed)return;
        try{const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('The image could not be read.'));r.readAsDataURL(file);});
          const node=state.document.getNode(id);if(!node)return;const raster=await rasterAsset(url);
          run(()=>{const current=state.document.getNode(id),height=current.width*raster.asset.height/raster.asset.width;
            state.history.transaction('Replace Image',()=>{state.history.execute(updateDocument({assets:{...state.document.data.assets,[raster.id]:raster.asset}}));
              {const {crop,...rest}=current;state.history.execute(replaceLeaf(id,{...rest,assetId:raster.id,height,ppiEffective:raster.asset.width/current.width*25.4}));}});});
        }catch(error){if(!destroyed)onError(error.message);}});
      input.click();}),
    cutStatus,updateInCut:boardId=>sendToCut(boardId,{update:true}).catch(error=>{if(!destroyed)onError(error.message);}),
    // Snapshots keep the document as it was (snapshots of the frozen data cost nothing) for this session.
    historySnapshots:()=>state.ui.historySnapshots??[],
    historySnapshot:()=>{const list=state.ui.historySnapshots??=[];list.push({id:createId(),name:`Snapshot ${list.length+1}`,data:state.document.data});refresh();},
    historyRevert:id=>run(()=>{const snap=(state.ui.historySnapshots??[]).find(s=>s.id===id);if(!snap||state.document.readOnly||snap.data===state.document.data)return;
      interactions.cancel();paths.finish();state.history.execute(revertTo(snap.data));select([]);}),
    historyDeleteSnapshot:id=>{state.ui.historySnapshots=(state.ui.historySnapshots??[]).filter(s=>s.id!==id);refresh();},
    /** Delete State: the current step and those after it go; the document goes back one step. */
    historyDeleteState:()=>run(()=>{if(state.document.readOnly||!state.history.canUndo)return;interactions.cancel();paths.finish();state.history.undo();state.history.discardRedo();select(state.selection.ids);}),
    historyGoTo:index=>run(()=>{if(state.document.readOnly)return;interactions.cancel();paths.finish();
      const applied=()=>state.history.entries.filter(entry=>entry.applied).length;
      while(applied()>index&&state.history.undo());while(applied()<index&&state.history.redo());select(state.selection.ids);}),
    expandShapes(ids){if(state.document.readOnly||!ids.length)return;
      state.history.transaction('Expand Shape',()=>{for(const id of ids)if(state.document.getNode(id)?.type==='shape')state.history.execute(replaceLeaf(id,withScope(()=>renderer.expandedShape(id))));});select(ids);},
    pathfinder(op){if(state.document.readOnly)return;
      const ids=stackingOrder(state.document,selectedIds().filter(id=>state.document.isEditable(id)));
      if(ids.length<2)throw new Error('Select at least two objects for Pathfinder.');
      const outcome=withScope(()=>runPathfinder(ids.map(id=>({id,item:renderer.booleanOperand(id),fill:fillHex(state.document,id)})),op));
      const label=PATHFINDER_LABELS[op],{commands,ids:created}=pathfinderCommands(state.document,ids,outcome,op,label);
      state.history.transaction(label,()=>commands.forEach(command=>state.history.execute(command)));select(created);},
    swatchOptions:swatch=>state.document.readOnly?null:swatchOptionsDialog(swatch),
    async layerOptions(id,options={}){const layer=state.document.getNode(id);if(layer?.type!=='layer'||state.document.readOnly)return;
      const values=await layerOptionsDialog(layer,options);if(!values||destroyed)return;
      run(()=>{const current=state.document.getNode(id);if(!current)return;const patch=layerOptionsPatch(current,values);if(Object.keys(patch).length)state.history.execute(updateNode(id,patch,{label:'Layer Options'}));});},
    async rearrange(){const options=await rearrangeDialog();if(options&&!destroyed)run(()=>artboards.rearrange(options));},
    transformPanel(key,value){const b=renderer.selectionBounds();if(!b)return;
      const scaling=key==='width'||key==='height',matrix=panelMatrix(b,state.ui.referencePoint??[.5,.5],key,value,{linked:!!state.ui.linkProportions});
      transform(matrix,{x:'Move',y:'Move',width:'Scale',height:'Scale',rotate:'Rotate',shear:'Shear'}[key],scaling?{scaleStrokes:state.ui.scaleStrokes!==false,scaleCorners:state.ui.scaleCorners!==false}:{});
    },
    flip(axis){const b=renderer.selectionBounds();if(!b)return;const ref=state.ui.referencePoint??[.5,.5];
      transform(operationMatrix({tool:'reflect',angle:axis==='horizontal'?90:0},[b.x+b.width*ref[0],b.y+b.height*ref[1]]),axis==='horizontal'?'Flip Horizontal':'Flip Vertical');},
    alignPanel(kind,mode){
      const ids=selectedIds().filter(id=>state.document.isEditable(id)),boxes=ids.map(id=>{const b=renderer.bounds(id);return b&&{id,x:b.x,y:b.y,width:b.width,height:b.height};}).filter(Boolean);
      if(!boxes.length)return;const a=activeArtboard(state),alignTo=state.ui.alignTo??'selection';
      const keyId=alignTo==='key'?(ids.includes(state.ui.keyObject)?state.ui.keyObject:ids.at(-1)):null;
      const reference=alignReference(boxes,alignTo,{artboard:{x:a.x,y:a.y,width:a.width,height:a.height},keyId});
      const offsets=kind==='align'?alignOffsets(boxes,mode,reference):kind==='distribute'?distributeOffsets(boxes,mode,reference):spacingOffsets(boxes,mode,reference,alignTo==='key'?state.ui.alignSpacing??null:null);
      const moves=offsets.filter(o=>Math.hypot(...o.offset)>1e-9),label=kind==='align'?'Align':kind==='distribute'?'Distribute':'Distribute Spacing';
      if(!moves.length)return;
      // Each object moves by its own offset; all moves form one undo step.
      state.history.transaction(label,()=>{for(const m of moves)transforms.apply([1,0,0,1,...m.offset],label,{ids:[m.id],remember:false});});select(ids);
    },
  });
  // Clipboard: Cut, Copy and the Paste family. The clipboard is shared by all Draw tabs and with Cut:
  // a copy also carries a cut SVG for pasting in Cut, and Paste takes Cut's copy when that is newer.
  function clipboardCommand(command) {
    const doc=state.document,world=id=>renderer.worldMatrix(id);
    const copy=()=>{
      const ids=selectedIds(),clip=copyNodes(doc,ids,world,renderer.selectionBounds());
      const board=doc.data.artboards.find(b=>b.x===clip.board[0]&&b.y===clip.board[1]);
      let cut=null;try{cut=board?cutSvg(board.id,new Map(),{only:new Set(ids)}):null;}catch{/* Paste in Cut reports that nothing could be converted. */}
      drawClipboard.set(Object.freeze({...clip,cut}));return ids;
    };
    if(command==='copy')return()=>{copy();};
    if(command==='cut')return()=>{const ids=copy();state.history.transaction('Cut',()=>{for(const id of ids)state.history.execute(removeNode(id));});select([]);};
    if(!command.startsWith('paste'))return null;
    return()=>{
      // Cut builds its copy in its own paper scope.
      let fromCut;try{paper.activate();fromCut=cutClipboard();}finally{scope.activate();}
      if(fromCut&&fromCut.time>drawClipboard.time())return pasteFromCut(fromCut,command).catch(error=>{if(!destroyed)onError(error.message);});
      const clip=drawClipboard.get();if(!clip)throw new Error('Nothing to paste. Copy or cut objects first.');
      const layer=insertionParent(),top={parentId:layer,atTop:true};
      const placements=[];
      const order=objectOrder(doc,selectedIds().filter(id=>doc.getNode(id)?.type!=='layer'));
      if(command==='paste'){const center=scope.view.center;placements.push({...top,offset:[center.x-clip.center[0],center.y-clip.center[1]]});}
      else if(command==='paste-place')placements.push(top);
      else if(command==='paste-front'||command==='paste-back'){
        const anchor=command==='paste-front'?order.at(-1):order[0],at=anchor&&doc.locate(anchor);
        placements.push(at?{parentId:at.parentId,index:at.index+(command==='paste-front'?1:0)}:command==='paste-front'?top:{parentId:layer,index:0});
      }else for(const board of doc.data.artboards)placements.push({...top,offset:[board.x-clip.board[0],board.y-clip.board[1]]});
      const created=[];
      state.history.transaction({'paste':'Paste','paste-front':'Paste in Front','paste-back':'Paste in Back','paste-place':'Paste in Place','paste-all-artboards':'Paste on All Artboards'}[command],()=>{
        for(const place of placements){
          const parentWorld=place.parentId===null?[1,0,0,1,0,0]:world(place.parentId);
          // Top-of-layer pastes stack in order: read the length now, after earlier placements.
          const index=place.atTop?doc.getNode(place.parentId).children.length:place.index;
          const {commands,ids}=pasteCommands(doc,clip,{...place,index,parentWorld});
          commands.forEach(c=>state.history.execute(c));created.push(...ids);
        }
      });
      select(created);
    };
  }
  // Cut's copy is a millimetre SVG with the bed origin at (0, 0). Paste centres it in the view; the other
  // paste commands keep its bed position relative to the active artboard, the reverse of Send to Cut.
  async function pasteFromCut({svg,bounds,warning},command) {
    if(!svg)throw new Error(warning||'Nothing in the Cut copy can be pasted in Draw.');
    const board=activeArtboard(state),center=scope.view.center;
    const offset=command==='paste'?[center.x-(bounds.x+bounds.width/2),center.y-(bounds.y+bounds.height/2)]:[board.x,board.y];
    const result=await importArtwork(scope,state,{kind:'vector',svgText:svg},'',layerId(),{offset,label:'Paste',unwrap:true,alive:()=>!destroyed});
    if(destroyed)return;
    select(result.ids);
    if(warning||result.warning)onError([warning,result.warning].filter(Boolean).join(' '));
  }
  // Object menu: Group, Ungroup, Arrange, Lock and Hide. Each is one undo step with a menu-style label.
  /** Object > Path commands. Paths keep their identity; a live shape becomes a path with the same id. */
  let averageAxis='both';
  function pathCommand(command) {
    const doc=state.document,apply=(label,commands)=>{if(commands.length)state.history.transaction(label,()=>commands.forEach(c=>state.history.execute(c)));};
    const base=id=>{const n=doc.getNode(id);return n.type==='shape'?withScope(()=>renderer.expandedShape(id)):n;};
    const setPaths=(id,subpaths)=>{const n=doc.getNode(id);return n.type==='shape'?replaceLeaf(id,{...base(id),subpaths}):updateNode(id,{subpaths},{label:'Edit Path'});};
    const parentWorld=id=>renderer.worldMatrix(doc.locate(id).parentId);
    const editable=()=>selectedIds().filter(id=>['path','shape'].includes(doc.getNode(id)?.type)&&doc.isEditable(id));
    const anchors=()=>state.selection.anchors.filter(a=>!a.logical&&doc.getNode(a.nodeId)?.type==='path'&&doc.isEditable(a.nodeId));
    function joinObjects(top,other,ends,topIndex,otherIndex) {
      const A=base(top).subpaths,B=base(other).subpaths;
      if(A.length!==1||B.length!==1)throw new Error('Join works on paths with one open subpath.');
      const moved=mapSubpath(B[otherIndex],multiplyMatrix(invertMatrix(parentWorld(top)),parentWorld(other)));
      // The joined path keeps the topmost object's paint and place.
      apply('Join',[setPaths(top,[joinSubpaths(A[topIndex],moved,ends)]),removeNode(other)]);select([top]);
    }
    if(command==='reverse-path'||command==='add-anchors')return()=>{
      const ids=editable();if(!ids.length)throw new Error('Select paths or shapes first.');
      const edit=command==='reverse-path'?reverseSubpaths:subpaths=>subpaths.map(addAnchorPoints);
      apply(command==='reverse-path'?'Reverse Path Direction':'Add Anchor Points',ids.map(id=>setPaths(id,edit(base(id).subpaths))));select(ids);};
    if(command==='remove-anchors')return()=>{
      const chosen=anchors();if(!chosen.length)throw new Error('Select anchor points with the Direct Selection tool first.');
      const commands=[...new Set(chosen.map(a=>a.nodeId))].map(id=>{const subpaths=removeAnchorPoints(doc.getNode(id).subpaths,chosen.filter(a=>a.nodeId===id));return subpaths.length?updateNode(id,{subpaths},{label:'Remove Anchor Points'}):removeNode(id);});
      const ids=[...new Set(chosen.map(a=>a.nodeId))];apply('Remove Anchor Points',commands);select(ids.filter(id=>doc.getNode(id)));};
    if(command==='clean-up')return()=>{
      const ids=cleanUpTargets(doc);if(!ids.length){onNotice('Clean Up found no stray points, unpainted objects or empty text.');return;}
      apply('Clean Up',ids.map(id=>removeNode(id)));select([]);
      onNotice(`Clean Up removed ${ids.length} object${ids.length===1?'':'s'}.`);};
    if(command==='average')return async()=>{
      let chosen=anchors();
      if(!chosen.length)chosen=editable().filter(id=>doc.getNode(id).type==='path').flatMap(id=>doc.getNode(id).subpaths.flatMap((s,subpath)=>s.segments.map((_,segment)=>({nodeId:id,subpath,segment}))));
      if(chosen.length<2)throw new Error('Select two or more anchor points to average.');
      const axis=await averageDialog(averageAxis);if(!axis||destroyed)return;averageAxis=axis;
      run(()=>{
        const world=chosen.map(a=>{const m=parentWorld(a.nodeId),p=doc.getNode(a.nodeId).subpaths[a.subpath].segments[a.segment].p;return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];});
        const moved=averagePoints(world,axis),edits=new Map();
        chosen.forEach((a,i)=>{
          if(!edits.has(a.nodeId))edits.set(a.nodeId,doc.getNode(a.nodeId).subpaths.map(s=>mapSubpath(s,[1,0,0,1,0,0])));
          const [x,y]=moved[i],[A,B,C,D,E,F]=invertMatrix(parentWorld(a.nodeId));edits.get(a.nodeId)[a.subpath].segments[a.segment].p=[A*x+C*y+E,B*x+D*y+F];
        });
        apply('Average',[...edits].map(([id,subpaths])=>updateNode(id,{subpaths},{label:'Average'})));
      });};
    if(command==='offset-path')return async()=>{
      const ids=editable();if(!ids.length)throw new Error('Select paths or shapes to offset.');
      const sources=ids.map(id=>({id,node:base(id),world:parentWorld(id)}));
      let revision=0;
      const compute=values=>Promise.all(sources.map(async ({id,node})=>({id,node,subpaths:await offsetPaths([node.subpaths],{distance:values.distance,join:values.join,miterLimit:values.miterLimit,fillRule:node.fillRule})})));
      const show=async values=>{const current=++revision;if(!values){renderer.previewPaths();return;}
        try{const results=await compute(values);if(current!==revision||destroyed)return;
          withScope(()=>renderer.previewPaths(results.map(r=>({subpaths:r.subpaths,appearance:r.node.appearance,strokeScaling:r.node.strokeScaling,matrix:sources.find(s=>s.id===r.id).world}))));}catch(error){if(current===revision)onError(error.message);}};
      const values=await offsetDialog(state.ui.offsetDefaults??{},show);revision++;withScope(()=>renderer.previewPaths());
      if(!values||destroyed)return;state.ui.offsetDefaults=values;
      const results=await compute(values);if(destroyed)return;
      const made=results.filter(r=>r.subpaths.length).map(r=>({id:r.id,node:createNode('path',{name:'',subpaths:r.subpaths,fillRule:'nonzero',appearance:structuredClone(r.node.appearance),
        opacity:r.node.opacity,blendMode:r.node.blendMode,...(r.node.strokeScaling!==undefined?{strokeScaling:r.node.strokeScaling}:{})})}));
      if(!made.length)throw new Error('The offset leaves nothing. Use a smaller negative offset.');
      // The offset path goes directly above its source, which stays, as in Illustrator.
      run(()=>{apply('Offset Path',[...made].reverse().map(({id,node})=>{const {parentId,index}=doc.locate(id);return insertNode(parentId,node,index+1);}));select(made.map(m=>m.node.id));});
    };
    const visible=list=>(list??[]).filter(e=>!e.hidden);
    /**
     * Expand: each fill becomes its own path (with `fill`), each stroke the filled area it paints (with
     * `stroke`); strokes left as they are stay on a path above the fills. Parts keep their paint order;
     * several parts become a group carrying the object's opacity and blending.
     */
    async function expanded(id,{fill=true,stroke=true}={}){
      // Live effects are baked in: the parts use the geometry as drawn.
      const own=base(id),drawn=withScope(()=>renderer.effectiveSubpaths(id)),node=drawn?{...own,subpaths:drawn,fillRule:'nonzero'}:own;
      const fills=visible(node.appearance.fills),strokes=visible(node.appearance.strokes).filter(e=>e.width>0),[a,b,c,d]=parentWorld(id),parts=[];
      const part=(look,subpaths=node.subpaths,fillRule=node.fillRule)=>createNode('path',{name:'',subpaths,fillRule,appearance:{...appearance(null,null),...look}});
      if(fill&&fills.length>1)for(const entry of fills)parts.push(part({fills:[structuredClone(entry)],strokes:[]}));
      else if(fills.length)parts.push(part({fills:structuredClone(fills),strokes:stroke?[]:structuredClone(strokes)}));
      if(stroke)for(const entry of strokes){
        // A stroke that does not scale is in world millimetres; the outline is built in the parent's space.
        const width=node.strokeScaling===false?entry.width/Math.sqrt(Math.abs(a*d-b*c)||1):entry.width;
        // A width profile is outlined by the renderer, which draws it that way too.
        const subpaths=entry.widthProfile?.length?withScope(()=>renderer.profiledStroke(id,{...entry,width}))??[]:await outlineStroke(node.subpaths,{width,join:entry.join??'miter',cap:entry.cap??'butt',miterLimit:entry.miterLimit??4});
        if(subpaths.length)parts.push(part({fills:[{paint:structuredClone(entry.paint),opacity:entry.opacity??1,blendMode:entry.blendMode??'normal',effects:[]}],strokes:[]},subpaths,'nonzero'));
      }
      else if(!fills.length&&strokes.length)parts.push(part({fills:[],strokes:structuredClone(strokes)}));
      if(!parts.length)return null;
      if(parts.length===1)return {...parts[0],name:node.name,opacity:node.opacity,blendMode:node.blendMode};
      return createNode('group',{name:node.name,opacity:node.opacity,blendMode:node.blendMode,children:parts});
    }
    const expandSelection=async(label,ids,options,empty)=>{
      if(!ids.length)throw new Error(empty);
      const made=[];for(const id of ids){const node=await expanded(id,options);if(destroyed)return;if(node)made.push({id,node});}
      if(!made.length)throw new Error('Nothing to expand.');
      run(()=>{apply(label,made.flatMap(({id,node})=>{const {parentId,index}=doc.locate(id);return [removeNode(id),insertNode(parentId,node,index)];}));select(made.map(m=>m.node.id));});
    };
    // Transform Each: every selected object around its own reference point; Random picks a factor per object.
    if(command==='transform-each')return async()=>{
      const targets=selectedIds().filter(id=>doc.isEditable(id));if(!targets.length)throw new Error('Select objects to transform.');
      // One random factor per object, so the preview and the result agree.
      const factors=new Map(targets.map(id=>[id,Math.random()])),before=state.document.data;
      const values=await transformEachDialog(state.ui.transformEachDefaults??{},preview=>withScope(()=>{renderer.clearTransformPreview();
        if(preview&&state.document.data===before)renderer.previewTransform(targets,id=>{const box=renderer.bounds(id);return box?transformEachMatrix(box,preview,factors.get(id)):[1,0,0,1,0,0];});else renderer.updateView();}));
      if(!values||destroyed)return;state.ui.transformEachDefaults=values;
      run(()=>{const created=[];
        state.history.transaction(values.copy?'Copy Transform Each':'Transform Each',()=>{for(const id of targets){
          const box=renderer.bounds(id);if(!box)continue;
          transforms.apply(transformEachMatrix(box,values,factors.get(id)),'Transform Each',{ids:[id],copy:values.copy,remember:false});created.push(...state.selection.ids);}});
        select(values.copy?created:targets);});
    };
    // Crop Image: non-destructive; the asset stays whole and the crop can be widened again or reset.
    if(command==='crop-image')return async()=>{
      const ids=selectedIds().filter(id=>doc.getNode(id)?.type==='image'&&doc.isEditable(id));if(!ids.length)throw new Error('Select an image to crop.');
      const values=await cropImageDialog();if(!values||destroyed)return;
      run(()=>state.history.transaction('Crop Image',()=>{for(const id of ids){
        const node=doc.getNode(id),c=node.crop??{x:0,y:0,width:1,height:1},fullW=node.width/c.width,fullH=node.height/c.height;
        const insets=values.reset?{left:-c.x*fullW,top:-c.y*fullH,right:-(1-c.x-c.width)*fullW,bottom:-(1-c.y-c.height)*fullH}:values;
        const next=cropImage(node,insets);
        // The whole image again: the node is replaced without `crop` (a key cannot be cleared with an update).
        if(next.crop)state.history.execute(updateNode(id,{width:next.width,height:next.height,transform:next.transform,crop:next.crop},{label:'Crop Image'}));
        else{const {crop,...rest}=node;state.history.execute(replaceLeaf(id,{...rest,width:next.width,height:next.height,transform:next.transform}));}
      }}));
    };
    // Split Into Grid: each selected path or shape becomes rows x columns rectangles inside its bounds.
    if(command==='split-into-grid')return async()=>{
      const ids=editable();if(!ids.length)throw new Error('Select paths or shapes to split.');
      const values=await splitGridDialog(state.ui.splitGridDefaults??{});if(!values||destroyed)return;state.ui.splitGridDefaults=values;
      run(()=>{const created=[];
        state.history.transaction('Split Into Grid',()=>{for(const id of ids){
          const node=doc.getNode(id),box=renderer.bounds(id),{parentId,index}=doc.locate(id);if(!box)continue;
          const cells=gridCells(box,values);state.history.execute(removeNode(id));
          cells.forEach((c,i)=>{const cell=toParentSpace(parentId,createNode('path',{name:node.name,subpaths:[{closed:true,segments:[[c.x,c.y],[c.x+c.width,c.y],[c.x+c.width,c.y+c.height],[c.x,c.y+c.height]].map(p=>({p,in:[0,0],out:[0,0]}))}],
            fillRule:'nonzero',appearance:structuredClone(node.appearance),opacity:node.opacity,blendMode:node.blendMode}));state.history.execute(insertNode(parentId,cell,index+i));created.push(cell.id);});
        }});select(created);});
    };
    if(command==='outline-stroke')return()=>expandSelection('Outline Stroke',editable().filter(id=>visible(doc.getNode(id).appearance?.strokes).some(e=>e.width>0)),{fill:false,stroke:true},'Select paths or shapes with a stroke.');
    // A live Pathfinder group expands to its result paths, each with its source's look, in the group's place.
    const liveGroups=selectedIds().filter(id=>livePathfinder(doc.getNode(id))&&doc.isEditable(id));
    if(command==='expand-appearance'&&liveGroups.length)return()=>{const made=[];
      state.history.transaction('Expand Appearance',()=>{for(const id of liveGroups){const group=doc.getNode(id),{parentId,index}=doc.locate(id),results=withScope(()=>renderer.liveSteps(id));
        const parts=results.map(r=>{const source=group.children.find(c=>c.id===r.sourceId)??group.children.at(-1);
          return createNode('path',{name:'',subpaths:r.subpaths,fillRule:'nonzero',appearance:{...structuredClone(source.appearance),effects:[]},opacity:source.opacity,blendMode:source.blendMode});});
        const node=parts.length===1?{...parts[0],transform:[...group.transform],name:group.name}:createNode('group',{name:group.name,transform:[...group.transform],opacity:group.opacity,blendMode:group.blendMode,children:parts});
        state.history.execute(removeNode(id));state.history.execute(insertNode(parentId,node,index));made.push(node.id);}});select(made);};
    // Expand Appearance on groups with vector effects: the paths and shapes inside get the effects as anchors.
    const effectGroups=()=>selectedIds().filter(id=>doc.isEditable(id)&&doc.getNode(id)?.type==='group'&&vectorEffects(doc.getNode(id)).length);
    if(command==='expand-appearance'&&effectGroups().length)return()=>{const groups=effectGroups(),edits=[];
      for(const id of groups)for(const n of doc.descendants(id))if(['path','shape'].includes(n.type)){const subpaths=withScope(()=>renderer.effectiveSubpaths(n.id));if(subpaths)edits.push({id:n.id,subpaths});}
      run(()=>{state.history.transaction('Expand Appearance',()=>{
        for(const {id,subpaths} of edits){const n=doc.getNode(id),effects=(n.appearance.effects??[]).filter(e=>!vectorEffects(n).includes(e));
          const {shape,params,...rest}=n;void shape;void params;
          state.history.execute(replaceLeaf(id,{...rest,type:'path',subpaths,fillRule:n.fillRule??'nonzero',transform:n.type==='shape'?[1,0,0,1,0,0]:n.transform,appearance:{...n.appearance,effects}}));}
        for(const id of groups){const g=doc.getNode(id);state.history.execute(updateNode(id,{appearance:{...g.appearance,effects:g.appearance.effects.filter(e=>!vectorEffects(g).includes(e))}}));}});select(groups);});};
    if(command==='expand-appearance')return()=>expandSelection('Expand Appearance',editable().filter(id=>hasVectorEffects(doc.getNode(id))||visible(doc.getNode(id).appearance?.fills).length+visible(doc.getNode(id).appearance?.strokes).length>1),{fill:true,stroke:true},
      'Select objects with several fills or strokes, or a fill and a stroke.');
    if(command==='expand')return async()=>{
      const ids=editable();if(!ids.length)throw new Error('Select paths or shapes to expand.');
      const values=await expandDialog(state.ui.expandDefaults??{});if(!values||destroyed)return;state.ui.expandDefaults=values;
      if(!values.fill&&!values.stroke)return;
      return expandSelection('Expand',ids,values,'Select paths or shapes to expand.');
    };
    if(command==='simplify')return async()=>{
      const ids=editable();if(!ids.length)throw new Error('Select paths or shapes to simplify.');
      const sources=ids.map(id=>({id,node:base(id),world:parentWorld(id)}));
      const before=sources.reduce((sum,s)=>sum+s.node.subpaths.reduce((n,p)=>n+p.segments.length,0),0);
      // Precision 100 keeps detail within 0.002 mm; every 10 % less doubles the allowed deviation.
      const simplified=values=>withScope(()=>sources.map(({id,node})=>({id,node,subpaths:flattenPath(node.subpaths.map(s=>mapSubpath(s,[1,0,0,1,0,0])),.005).map(contour=>{
        const path=fitCurve(contour.points,contour.closed,.002*2**((100-values.precision)/10));
        const result={closed:contour.closed,segments:path.segments.map(s=>({p:[s.point.x,s.point.y],in:values.straight?[0,0]:[s.handleIn.x,s.handleIn.y],out:values.straight?[0,0]:[s.handleOut.x,s.handleOut.y]}))};
        path.remove();return result;}).filter(p=>p.segments.length>1)})));
      const count=values=>simplified(values).reduce((sum,r)=>sum+r.subpaths.reduce((n,p)=>n+p.segments.length,0),0);
      const show=values=>withScope(()=>values?renderer.previewPaths(simplified(values).map(r=>({subpaths:r.subpaths,fillRule:r.node.fillRule,appearance:r.node.appearance,strokeScaling:r.node.strokeScaling,matrix:sources.find(s=>s.id===r.id).world})),ids):renderer.previewPaths());
      const values=await simplifyDialog(state.ui.simplifyDefaults??{},{before,count},show);withScope(()=>renderer.previewPaths());
      if(!values||destroyed)return;state.ui.simplifyDefaults=values;
      run(()=>{apply('Simplify',simplified(values).map(r=>setPaths(r.id,r.subpaths)));select(ids);});
    };
    if(command==='join')return()=>{
      const chosen=anchors(),ends=chosen.filter(a=>{const s=doc.getNode(a.nodeId).subpaths[a.subpath];return !s.closed&&(a.segment===0||a.segment===s.segments.length-1);});
      const end=a=>a.segment===0?'start':'end';
      if(chosen.length===2&&ends.length===2) {
        const [p,q]=ends;
        if(p.nodeId===q.nodeId&&p.subpath===q.subpath){const subpaths=structuredClone(doc.getNode(p.nodeId).subpaths);subpaths[p.subpath]=closeSubpath(subpaths[p.subpath]);apply('Join',[setPaths(p.nodeId,subpaths)]);select([p.nodeId]);return;}
        if(p.nodeId===q.nodeId)throw new Error('Join two endpoints of open paths in different objects, or of the same path.');
        const [other,top]=objectOrder(doc,[p.nodeId,q.nodeId]),[a,b]=top===p.nodeId?[p,q]:[q,p];
        return joinObjects(top,other,{a:end(a),b:end(b)},a.subpath,b.subpath);
      }
      if(chosen.length)throw new Error('Select two endpoints of open paths to join them.');
      const ids=editable();
      if(ids.length===1){const subpaths=base(ids[0]).subpaths;if(subpaths.length!==1)throw new Error('Join closes a single open path.');apply('Join',[setPaths(ids[0],[closeSubpath(subpaths[0])])]);select(ids);return;}
      if(ids.length!==2)throw new Error('Select two open paths, or two endpoints, to join.');
      const [other,top]=objectOrder(doc,ids);
      joinObjects(top,other,null,0,0);
    };
    return null;
  }
  function objectCommand(command) {
    const doc=state.document,ids=()=>selectedIds(),apply=(label,commands)=>{if(commands.length)state.history.transaction(label,()=>commands.forEach(c=>state.history.execute(c)));};
    const arrange={'bring-front':['front','Bring to Front'],'bring-forward':['forward','Bring Forward'],'send-backward':['backward','Send Backward'],'send-back':['back','Send to Back']}[command];
    if(arrange)return()=>apply(arrange[1],arrangeCommands(doc,ids(),arrange[0]));
    if(command==='group')return()=>{const {commands,group}=groupCommands(doc,ids());apply('Group',commands);select([group.id]);};
    if(command==='ungroup')return()=>{const {commands,released}=ungroupCommands(doc,ids());apply('Ungroup',commands);select(released);};
    if(command==='compound-make')return()=>{const {commands,id}=compoundCommands(doc,ids(),{
      parentWorld:id=>renderer.worldMatrix(doc.locate(id).parentId),
      subpaths:id=>doc.getNode(id).type==='shape'?withScope(()=>renderer.expandedShape(id)).subpaths:doc.getNode(id).subpaths});apply('Make Compound Path',commands);select([id]);};
    if(command==='compound-release')return()=>{const {commands,ids:released}=releaseCompoundCommands(doc,ids());apply('Release Compound Path',commands);select(released);};
    // Blends (D4.2): a group whose children are the keys and whose `blend` holds the options.
    const blends=()=>{const found=ids().map(id=>doc.getNode(id)?.blend?id:doc.ancestors(id).find(n=>n.blend)?.id).filter(Boolean);if(!found.length)throw new Error('Select a blend.');return [...new Set(found)];};
    if(command==='blend-make')return()=>makeBlend(ids());
    // Release leaves the keys as a plain group; a spine comes back as an unpainted path on top, as in Illustrator.
    if(command==='blend-release')return()=>{const list=blends();apply('Release Blend',list.flatMap(id=>{const spine=doc.getNode(id).blend.spine;
      return [updateNode(id,{blend:null}),...(spine?[insertNode(id,createNode('path',{name:'Spine',subpaths:[spine],appearance:appearance(null,null)}))]:[])];}));select(list);};
    // With a spine, reversing the stacking also reverses the spine, so the keys keep their places on it.
    if(command==='blend-reverse')return()=>{const list=blends();apply('Reverse Front to Back',list.flatMap(id=>{const node=doc.getNode(id);
      return [...node.children.map(child=>moveNode(child.id,id,0)),...(node.blend.spine?[updateNode(id,{blend:{...node.blend,spine:reverseSubpaths([node.blend.spine])[0]}})]:[])];}));select(list);};
    const envelopes=()=>{const found=ids().map(id=>doc.getNode(id)?.envelope?id:doc.ancestors(id).find(n=>n.envelope)?.id).filter(Boolean);if(!found.length)throw new Error('Select an envelope.');return [...new Set(found)];};
    if(command==='envelope-make')return()=>makeEnvelope(ids());
    if(command==='envelope-warp')return()=>void makeWarpEnvelope(ids()).catch(error=>onError(error.message));
    // Release: the artwork and the envelope shape come back as a plain group.
    if(command==='envelope-release')return()=>{const list=envelopes();apply('Release Envelope',list.map(id=>updateNode(id,{envelope:null})));select(list);};
    // Expand: the bent artwork becomes paths in place of the parts, and the envelope shape goes.
    if(command==='envelope-expand')return()=>{const list=envelopes(),made=list.map(id=>({id,results:withScope(()=>renderer.envelopeSteps(id))}));
      state.history.transaction('Expand Envelope',()=>{for(const {id,results} of made){const top=doc.getNode(id).envelope.warp?null:doc.getNode(id).children.at(-1).id;
        for(const {sourceId,subpaths} of results){const source=doc.getNode(sourceId),{index}=doc.locate(sourceId);
          state.history.execute(removeNode(sourceId));
          state.history.execute(insertNode(id,createNode('path',{name:source.name,subpaths,fillRule:source.fillRule??'nonzero',appearance:source.appearance,opacity:source.opacity,blendMode:source.blendMode}),index));}
        if(top)state.history.execute(removeNode(top));state.history.execute(updateNode(id,{envelope:null}));}});select(list);};
    if(command==='blend-replace-spine')return()=>replaceSpine(ids());
    if(command==='blend-reverse-spine')return()=>reverseSpine(blends());
    if(command==='blend-options')return()=>void blendOptionsCommand();
    if(command==='blend-expand')return()=>{const list=blends(),hex=c=>c&&'#'+c.map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('').toUpperCase();
      // The steps become paths between their keys; the group stays, as a plain group.
      const made=list.map(id=>({id,pairs:withScope(()=>renderer.blendSteps(id))}));
      state.history.transaction('Expand Blend',()=>{for(const {id,pairs} of made){state.history.execute(updateNode(id,{blend:null}));
        for(const pair of pairs){const at=state.document.getNode(id).children.findIndex(c=>c.id===pair.after)+1;
          pair.steps.forEach((step,i)=>{const look=appearance(hex(step.look.fill),hex(step.look.stroke),step.look.width);
            if(look.fills[0])look.fills[0].opacity=step.look.fillAlpha;if(look.strokes[0])Object.assign(look.strokes[0],{opacity:step.look.strokeAlpha,cap:step.look.cap,join:step.look.join});
            if(!step.look.stroke||!(step.look.width>0))look.strokes=[];
            state.history.execute(insertNode(id,createNode('path',{name:'',subpaths:step.subpaths,fillRule:step.look.fillRule,appearance:look,opacity:step.look.opacity}),at+i));});}}});
      select(list);};
    // Opacity masks (D4.3): a group with `mask` whose top child is the mask art.
    const masked=()=>{const found=ids().map(id=>doc.getNode(id)?.mask?id:doc.ancestors(id).find(n=>n.mask)?.id).filter(Boolean);if(!found.length)throw new Error('Select an object with an opacity mask.');return [...new Set(found)];};
    if(command==='mask-make')return()=>{
      const members=stackingOrder(doc,ids());if(members.length<2)throw new Error('Select the artwork and, on top, the object to use as its mask.');
      if(new Set(members.map(id=>doc.locate(id).parentId)).size>1)throw new Error('Mask objects in the same layer or group.');
      const {commands,group}=groupCommands(doc,members);
      state.history.transaction('Make Opacity Mask',()=>{commands.forEach(c=>state.history.execute(c));state.history.execute(updateNode(group.id,{name:'Opacity Mask',mask:{clip:true,invert:false}}));});select([group.id]);};
    if(command==='mask-release')return()=>{const list=masked();apply('Release Opacity Mask',list.map(id=>updateNode(id,{mask:null})));select(list);};
    if(command==='mask-clip'||command==='mask-invert')return()=>{const list=masked(),key=command==='mask-clip'?'clip':'invert',on=!doc.getNode(list[0]).mask[key];
      apply(key==='clip'?'Clip Mask':'Invert Mask',list.map(id=>updateNode(id,{mask:{...doc.getNode(id).mask,[key]:on}})));};
    if(command==='clip-make')return()=>{const {commands,group}=clipCommands(doc,ids());apply('Make Clipping Mask',commands);select([group.id]);};
    if(command==='clip-release')return()=>{apply('Release Clipping Mask',releaseClipCommands(doc,ids()));};
    if(command==='lock')return()=>{apply('Lock',lockCommands(doc,ids()));select([]);};
    if(command==='hide')return()=>{apply('Hide',hideCommands(doc,ids()));select([]);};
    if(command==='unlock-all')return()=>{const before=new Set(doc.descendants(null).filter(n=>n.locked&&n.type!=='layer').map(n=>n.id));apply('Unlock All',unlockAllCommands(doc));select([...before]);};
    if(command==='show-all')return()=>{const before=new Set(doc.descendants(null).filter(n=>!n.visible&&n.type!=='layer').map(n=>n.id));apply('Show All',showAllCommands(doc));select([...before]);};
    return null;
  }
  /** Select menu commands (D3.5); the ones Reselect repeats are remembered. */
  function selectionCommand(command) {
    const doc=state.document,ids=selectedIds(),remember=fn=>()=>{state.ui.lastSelectCommand=command;return fn();};
    if(command==='select-inverse')return remember(()=>select(inverseSelection(doc,ids,isolation())));
    if(command.startsWith('select-same-'))return remember(()=>select(sameAs(doc,ids,command.slice(12))));
    if(command==='select-object-direction-handles')return()=>{const targets=ids.flatMap(id=>doc.getNode(id)?.children?doc.descendants(id).map(n=>n.id):[id]);
      if(!paths.directionHandles(targets))throw new Error('The selected paths have no direction handles.');};
    if(command.startsWith('select-object-'))return remember(()=>select(objectsOfKind(doc,command.slice(14),ids)));
    if(command==='select-next-above'||command==='select-next-below')return remember(()=>{if(!ids.length)throw new Error('Select an object first.');select(stackNeighbour(doc,ids,command==='select-next-above'?1:-1));});
    if(command==='reselect')return()=>{if(!state.ui.lastSelectCommand)throw new Error('There is no selection command to repeat yet.');return handle(state.ui.lastSelectCommand);};
    if(command==='save-selection')return async()=>{
      if(!ids.length)throw new Error('Select objects to save.');if(doc.readOnly)return;
      const name=await saveSelectionDialog(`Selection ${(doc.data.settings.savedSelections?.length??0)+1}`);if(!name||destroyed)return;
      run(()=>state.history.execute(updateDocument({settings:saveSelection(state.document.data.settings,name,selectedIds())},{label:'Save Selection'})));
    };
    if(command==='edit-selection')return async()=>{
      const names=(doc.data.settings.savedSelections??[]).map(s=>s.name);if(!names.length)throw new Error('No selections are saved in this document.');
      const choice=await editSelectionDialog(names);if(!choice||destroyed)return;
      run(()=>{if(choice.action==='delete'){const settings=state.document.data.settings;state.history.execute(updateDocument({settings:{...settings,savedSelections:settings.savedSelections.filter(s=>s.name!==choice.name)}},{label:'Delete Selection'}));}
        else select(savedSelection(state.document,choice.name));});
    };
    return null;
  }
  function handle(command) {return run(()=>{
    if(command.startsWith('tool.'))return setTool(command.slice(5));
    if(command.startsWith('panel.'))return openPanel(command.slice(6));
    if(command==='draw-mode'){const next=nextDrawMode(state.ui.drawMode??'normal');try{return setDrawMode(next);}catch{return setDrawMode('normal');}}
    if(['draw-normal','draw-behind','draw-inside'].includes(command))return setDrawMode(command.slice(5));
    // Effect > Warp > Arc… and the other styles: the Warp dialog with that style chosen.
    // Effect > Pathfinder > Add and the rest: no dialog, as in Illustrator.
    if(command.startsWith('live-')&&LIVE_LABELS[command.slice(5)])return void addEffect('pathfinder',{ask:false,preset:{op:command.slice(5)}}).catch(error=>{if(!destroyed)onError(error.message);});
    if(command.startsWith('warp-')&&WARP_STYLES[command.slice(5)])return void addEffect('warp',{preset:{style:command.slice(5)}}).catch(error=>{if(!destroyed)onError(error.message);});
    if(command.startsWith('effect-')&&EFFECTS[command.slice(7)])return void addEffect(command.slice(7)).catch(error=>{if(!destroyed)onError(error.message);});
    if(command==='effect-last'||command==='effect-options'){const last=state.ui.lastEffect;if(!last)throw new Error('No effect has been applied yet.');
      return void addEffect(last.type,{ask:command==='effect-options'}).catch(error=>{if(!destroyed)onError(error.message);});}
    if(command==='command-search')return void openCommandSearch(commandEntries({commands:[...commands],tools:TOOL_DEFINITIONS.filter(t=>implementedTools.has(t.id)),panels:PANEL_DEFINITIONS}),{run:id=>handle(id),shortcut:id=>shortcutLabel(id,{isMac:/Mac/.test(navigator.platform)})});
    if(command==='cancel'&&(cancelActiveScrub()||panels.close()))return;
    if(paths?.handle(command)){if(command==='cancel')toolbar.close(true);return;}
    // Escape cancels a gesture in progress; otherwise it leaves isolation mode.
    if(command==='cancel'){const busy=interactions.busy();interactions.cancel();toolbar.close(true);if(!busy)exitIsolation();return;}
    if(command==='undo'||command==='redo'){interactions.cancel();paths.finish();state.history[command]();select(state.selection.ids);return;}
    if(command==='fit-artboard')return fit();if(command==='fit-all')return fit(null);
    if(command==='zoom-in'||command==='zoom-out')return zoomAt(scope.view.center,command==='zoom-in'?1.25:.8);
    if(command==='actual-size')return zoomAt(scope.view.center,(96/25.4)/scope.view.zoom);
    if(command==='outline'){state.ui.outline=!renderer.outline;renderer.setOutline(state.ui.outline);outlineButton.setAttribute('aria-pressed',String(renderer.outline));return;}
    if(command==='deselect')return select([]);
    if(command==='select-all')return select((isolation()?state.document.getNode(isolation()).children:state.document.data.layers.flatMap(l=>l.children)).filter(n=>state.document.isEditable(n.id)).map(n=>n.id));
    if(command==='select-artboard'){const a=activeArtboard(state),rect=new scope.Rectangle(a.x,a.y,a.width,a.height);return select(state.document.data.layers.flatMap(l=>l.children).filter(n=>renderer.bounds(n.id)?.intersects(rect)).map(n=>n.id));}
      if(command==='toggle-panels'||command==='toggle-panels-except-tools'){shell.classList.toggle('draw-shell--panels-hidden');shell.classList.toggle('draw-shell--all-hidden',command==='toggle-panels' && shell.classList.contains('draw-shell--panels-hidden'));return;}
    if(command==='send-to-cut')return void workspace.sendToCut();
    if(command==='export-as')return void workspace.exportAs();
    if(command==='export-screens')return void workspace.exportScreens();
    if(command==='toggle-control-bar'){state.ui.controlBar=state.ui.controlBar===false;try{globalThis.localStorage?.setItem(CONTROL_BAR_KEY,state.ui.controlBar?'shown':'hidden');}catch{}panels.render();return resize();}
    if(state.document.readOnly)return;
    if(command==='edit-text')return void editText(undefined,selectedIds()[0]);
    if(command==='create-outlines')return void createTextOutlines().catch(error=>{if(!destroyed)onError(error.message);});
    if(command==='transform-again')return transforms.again();
    if(command==='use-as-template'){const images=selectedIds().filter(id=>state.document.getNode(id)?.type==='image'&&state.document.isEditable(id));
      if(!images.length)throw new Error('Select a placed image to use as a template.');
      const {commands:moves}=templateLayerCommands(state.document,state.document.ancestors(images[0]).find(n=>n.type==='layer').id,{name:state.document.getNode(images[0]).name||'Image',moveIds:images});
      state.history.transaction('Use as Template',()=>moves.forEach(c=>state.history.execute(c)));return select([]);}
    const object=selectionCommand(command)??objectCommand(command)??pathCommand(command)??clipboardCommand(command);if(object){const result=object();if(result?.catch)result.catch(error=>{if(!destroyed)onError(error.message);});return;}
    if(['rotate-dialog','reflect-dialog','scale-dialog','shear-dialog'].includes(command))return void transformToolDialog(command.split('-')[0]);
    if(command==='delete') {
      if(state.ui.tool==='artboard')return artboards.remove();
      state.history.transaction('Delete',()=>{for(const id of selectedIds())state.history.execute(removeNode(id));});return;
    }
    if(command==='smart-guides'){const settings=state.document.data.settings;state.history.execute(updateDocument({settings:{...settings,smartGuides:!settings.smartGuides}}));return;}
    if(command==='paint-focus'){state.ui.paintFocus=state.ui.paintFocus==='fill'?'stroke':'fill';toolbar.update();return;}
    if(command==='paint-none')return paint(state.ui.paintFocus,null);
    if(command==='paint-gradient'){const kind=state.ui.paintFocus==='stroke'?'stroke':'fill',last=state.ui.lastGradient;
      gradient(kind,(current,box)=>current??defaultGradient(box,last?{type:last.type,stops:last.stops,angle:last.angle}:{}),{label:'Gradient'});return openPanel('gradient');}
    if(command==='paint-solid'){const kind=state.ui.paintFocus==='stroke'?'stroke':'fill';return paint(kind,state.ui.lastSolid?.[kind]??(kind==='fill'?'#FFFFFF':'#071411'));}
    if(command==='default-paint'||command==='paint-swap') {
      const ids=paintIds(),swapped=command==='paint-swap';
      const fill=swapped?state.ui.stroke:'#FFFFFF',stroke=swapped?state.ui.fill:'#071411';
      if(!swapped)state.ui.strokeWidth=25.4/72;
      state.history.transaction(swapped?'Swap Fill and Stroke':'Default Appearance',()=>{
        for(const id of ids){const original=state.document.getNode(id).appearance;
          let next=changePaint(original,'fill',swapped?paintHex(original.strokes[0]):fill,state.ui);
          next=changePaint(next,'stroke',swapped?paintHex(original.fills[0]):stroke,state.ui);
          if(!swapped)next=changePaint(next,'width',state.ui.strokeWidth,state.ui);
          state.history.execute(updateNode(id,{appearance:next}));}
      });state.ui.fill=fill;state.ui.stroke=stroke;toolbar.update();panels.render();return;
    }
    if(command==='tool-dialog'&&SHAPE_TOOLS.includes(state.ui.tool))return void shapeDialog(state.ui.tool);
    if(command==='tool-dialog'&&state.ui.tool==='eraser')return void eraserDialog(state.ui.eraserSize??3).then(size=>{if(size&&!destroyed)state.ui.eraserSize=size;});
    if(command==='tool-dialog'&&state.ui.tool==='magic-wand')return void magicWandDialog(state.ui.magicWand??{}).then(values=>{if(values&&!destroyed)state.ui.magicWand=values;});
    if(command==='reset-rotate-view')return rotateView(0);
    if(command==='keyboard-shortcuts')return void shortcutsDialog({isMac:navigator.platform.startsWith('Mac')}).then(async map=>{if(!map||destroyed)return;
      const saved=await window.modcut?.setDrawShortcuts?.(map)??map;run(()=>{setKeyOverrides(saved);toolbar?.update();panels?.render();status();onNotice('Keyboard shortcuts saved.');});}).catch(error=>{if(!destroyed)onError(error.message);});
    if(command==='package')return void (async()=>{if(destroyed||document.querySelector('.modal-overlay'))return;interactions?.cancel();paths?.finish();await exporter.packageDocument();})().catch(error=>{if(!destroyed)onError(error.message);});
    // Window > Workspace: the panel layout saved under a name (this computer only).
    const useWorkspace=ws=>{applyWorkspace(state.ui,ws);try{globalThis.localStorage?.setItem(CONTROL_BAR_KEY,state.ui.controlBar?'shown':'hidden');}catch{}panels.render();resize();onNotice(`Workspace: ${ws.name}`);};
    if(command==='workspace-reset')return useWorkspace(ESSENTIALS);
    if(command==='workspace-new')return void workspaceNameDialog(state.ui.workspace&&state.ui.workspace!==ESSENTIALS.name?state.ui.workspace:'').then(name=>{if(name&&!destroyed)run(()=>{const ws=captureWorkspace(state.ui,name);saveWorkspace(ws);state.ui.workspace=ws.name;onNotice(`Saved workspace ${ws.name}.`);});});
    if(command==='workspace-manage'){const list=loadWorkspaces();if(!list.length)return void onError('No saved workspaces yet. Use Window > Workspace > New Workspace first.');
      return void workspacesDialog(list.map(w=>w.name),state.ui.workspace).then(choice=>{if(!choice||destroyed)return;run(()=>{const ws=loadWorkspaces().find(w=>w.name===choice.name);if(!ws)return;
        if(choice.action==='delete'){deleteWorkspace(ws.name);if(state.ui.workspace===ws.name)state.ui.workspace=null;}else useWorkspace(ws);});});}
    if(command==='tool-dialog'&&state.ui.tool==='blend')return void blendOptionsCommand();
    if(command==='tool-dialog'&&state.ui.tool==='paintbrush')return void paintbrushDialog(paintbrushOptions(state.ui.paintbrush??{})).then(values=>{if(values&&!destroyed)run(()=>{state.ui.paintbrush=paintbrushOptions(values);});});
    if(command==='tool-dialog'&&state.ui.tool==='blob-brush')return void blobBrushDialog(blobOptions(state.ui.blobBrush??{})).then(values=>{if(values&&!destroyed)run(()=>{state.ui.blobBrush=blobOptions(values);});});
    if(command==='tool-dialog'&&state.ui.tool==='pencil')return void pencilDialog(state.ui.pencil??{}).then(values=>{if(values&&!destroyed)state.ui.pencil=values;});
    if(command==='tool-dialog'&&state.ui.tool==='type-on-path'){const id=selectedIds()[0];if(id)return void editText(undefined,null,null,{pathFrom:id});return;}
    if(command==='tool-dialog'&&state.ui.tool==='vertical-type')return void editText(undefined,null,null,{orientation:'vertical'});
    if(command==='tool-dialog'&&['type','area-type'].includes(state.ui.tool))return void editText(undefined,null,state.ui.tool==='area-type'?{width:60,height:30}:null);
    if(command==='tool-dialog'&&TRANSFORM_TOOLS.includes(state.ui.tool))return void transformToolDialog(state.ui.tool);
    const match=command.match(/^(nudge-large|nudge|duplicate)-(left|right|up|down)$/);
    if(match){const [,kind,direction]=match;if(interactions.adjust(direction==='up'?1:direction==='down'?-1:0))return;
      const amount=state.document.data.settings.keyboardIncrement*(kind==='nudge-large'?10:1),x=direction==='left'?-amount:direction==='right'?amount:0,y=direction==='up'?-amount:direction==='down'?amount:0;
      if(state.ui.tool==='artboard'){const a=activeArtboard(state);return artboards.edit(a.id,{x:a.x+x,y:a.y+y},{copy:kind==='duplicate'});}
      if(kind!=='duplicate'&&paths.nudge(x,y))return;
      if(selectedIds().length)transform([1,0,0,1,x,y],'Nudge',{copy:kind==='duplicate',mergeKey:'nudge'});
    }
  });}
  toolbar=createToolbar(tools,state,{available:id=>implementedTools.has(id),setTool,command:handle,openPanel,run});
  paths=createPathInteractions(canvas,state,{scope,renderer,withScope,run,select,selectionChanged,layerId:insertionParent,insertNew,status,
    tool:()=>temporary?.id || state.ui.tool,closeMenus:()=>toolbar.close()});
  interactions=createInteractions(canvas,state,{scope,renderer,withScope,run,select,selectedIds,transform,artboards,status,shapeOptions,insertShape,shapeDialog,zoomAt,isolate,exitIsolation,
    transforms,transformDialog:transformToolDialog,editText,paintIds,command:id=>handle(id),
    eyedropper,scissors,setMeasure,pencil,
    // Magic Wand selects leaves with a similar look; Lasso selects anchor points (as Direct Selection does).
    magicWand(hit,{add=false,subtract=false}={}){
      if(!hit){if(!add&&!subtract)select([]);return;}
      const found=magicWand(state.document,hit,state.ui.magicWand??{}),current=selectedIds();
      select(subtract?current.filter(id=>!found.includes(id)):add?[...new Set([...current,...found])]:found);},
    lasso:(points,options={})=>{
      if(!options.objects)return paths.lasso(points,options);
      // Whole objects: the selectable object around every path or shape with an anchor inside the loop.
      const objects=new Set(selectableObjects(state.document,state.ui.isolation)),hits=new Set();
      for(const n of state.document.descendants(null)){if(!['path','shape'].includes(n.type)||!state.document.isEditable(n.id))continue;
        const node=renderer.editingNode(n.id),inside=node.subpaths.some(path=>path.segments.some(s=>{const w=renderer.editPointToWorld(n.id,s.p);return insidePolygon([w.x,w.y],points);}));
        if(!inside)continue;const top=[n,...state.document.ancestors(n.id)].find(a=>objects.has(a.id));if(top)hits.add(top.id);}
      select(options.add?[...new Set([...state.selection.ids,...hits])]:[...hits]);return hits.size;},
    freeDistortSession,freeDistortPreview,freeDistort,
    shapeBuilderSession,shapeBuilderPreview,shapeBuilder,knife,eraser,pathEraser,smoothPath,eraserSize:()=>state.ui.eraserSize??3,touchGlyphAt,touchGlyph,touchType:(id,index,change)=>touchType(id,index,change).catch(error=>{if(!destroyed)onError(error.message);}),rotateView,widthSession,widthDrag,widthPreview,widthPointEdit,paintbrush,blobBrush:points=>blobBrush(points).catch(error=>{if(!destroyed)onError(error.message);}),brushSize:()=>(state.ui.blobBrush?.size??BLOB_DEFAULTS.size),blendClick,blendOptions:()=>void blendOptionsCommand(),
    widthHandles:point=>{const id=renderer.hit(point)??selectedIds()[0],target=id&&widthTarget(id);return target?withScope(()=>renderer.widthHandles(id,target.stroke)):[];},
    gradientVector(from,to,mergeKey){const kind=state.ui.paintFocus==='stroke'?'stroke':'fill',last=state.ui.lastGradient;
      gradient(kind,(current,box,node)=>{const a=renderer.pointToLocal(node.id,from),b=renderer.pointToLocal(node.id,to);
        return vectorGradient(current??defaultGradient(box,last?{type:last.type,stops:last.stops}:{}),[a.x,a.y],[b.x,b.y]);},{label:'Gradient',mergeKey});},
typeOnPath:id=>editText(undefined,null,null,{pathFrom:id}),cursor,
    tool:()=>temporary?.id || state.ui.tool,zoomOut:()=>!!temporary?.zoomOut,preferences:getPreferences,closeMenus:()=>toolbar.close(),notify:message=>onError(message)});
  // Offset Path effects draw once the polygon library is loaded; until then they are skipped.
  loadGeometry().then(()=>{if(!destroyed)refresh();}).catch(()=>{});
  const unsubscribe=state.subscribe(()=>{interactions.cancel();paths.documentChanged();refresh();if(state.ui.isolation&&!isolation())isolationChanged();else renderIsolationBar();});
  function resize(){const {width,height}=stage.getBoundingClientRect();if(width<=0||height<=0)return;
    withScope(()=>{scope.view.viewSize=new scope.Size(width,height);if(!fitted){renderer.fit();fitted=true;}renderer.updateView();});status();}
  const observer=new ResizeObserver(resize);observer.observe(stage);
  function syncTheme(){const css=getComputedStyle(root);withScope(()=>renderer.setTheme({muted:css.getPropertyValue('--text-muted').trim(),background:css.getPropertyValue('--surface-2').trim()}));}
  window.addEventListener('modcut-theme-change',syncTheme);
  boardSelect.addEventListener('change',()=>artboards.choose(boardSelect.value,true));
  zoomInput.addEventListener('change',()=>{if(Number.isFinite(zoomInput.valueAsNumber)&&zoomInput.valueAsNumber>=.0001&&zoomInput.valueAsNumber<=10000)zoomAt(scope.view.center,zoomInput.valueAsNumber/100*(96/25.4)/scope.view.zoom);else status();});
  outlineButton.addEventListener('click',()=>handle('outline'));fitButton.addEventListener('click',()=>fit());
  const workspace={state,scope,renderer,isolate,cutSvg,exportBoard,exporter,exportAs:()=>exportAs().catch(error=>onError(error.message)),exportScreens:()=>exportScreens().catch(error=>onError(error.message)),sendToCut:boardId=>sendToCut(boardId).catch(error=>onError(error.message)),exitIsolation,statusElement:controls,artboards,transforms,resize,select,setTool,handle,availableTool:id=>implementedTools.has(id),canHandle:command=>commands.has(command),commandNames:()=>[...commands].sort(),withScope,layerId,fit,
    setTemporaryTool(value){temporary=value;canvas.dataset.tool=temporary?.id || state.ui.tool;canvas.style.cursor=cursor();status();},
    /** Cut > Edit in Draw: the copied Cut objects on a new bed-sized artboard, where they were on the bed. */
    async editFromCut({svg,warning},{width,height}){
      if(!svg)throw new Error(warning||'Nothing in the Cut selection can be edited in Draw.');
      const boardId=run(()=>artboards.add({name:'From Cut',width,height}));const board=state.document.getArtboard(boardId);if(!board)return;
      const result=await importArtwork(scope,state,{kind:'vector',svgText:svg},'',layerId(),{offset:[board.x,board.y],label:'Edit in Draw',unwrap:true,alive:()=>!destroyed});
      if(destroyed)return;select(result.ids);fit(board.id);
      if(warning||result.warning)onNotice([warning,result.warning].filter(Boolean).join(' '));
    },
    async import(prepared,name,options={}){const result=await importArtwork(scope,state,prepared,name,layerId(),{...options,alive:()=>!destroyed});select(options.template?[]:result.ids);if(options.fitArtboard)fit();return result;},
    destroy(){destroyed=true;ownedTextModal?.querySelector('[data-x=cancel]').click();ownedTransformModal?.querySelector('[data-x=cancel]').click();paths.destroy();interactions.destroy();toolbar.destroy();unsubscribe();observer.disconnect();window.removeEventListener('modcut-theme-change',syncTheme);workspaces.delete(root);withScope(()=>{renderer.destroy();scope.remove();});controls.remove();root.replaceChildren();},
  };
  workspaces.set(root,workspace);refresh();syncTheme();setTool(state.ui.tool);resize();return workspace;
}
