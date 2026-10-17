import { createProjectDraw } from './io/project.mjs';
import { createDrawRenderer } from './render.mjs';
import { createPanels } from './panels/ui.mjs';
import { rememberColor } from './doc/swatches.mjs';
import { copyNodes, drawClipboard, invert as invertMatrix, pasteCommands } from './doc/clipboard.mjs';
import { multiply as multiplyMatrix } from './doc/arrange.mjs';
import { stackingOrder as objectOrder } from './doc/arrange.mjs';
import { arrangeCommands, groupCommands, hideCommands, lockCommands, showAllCommands, ungroupCommands, unlockAllCommands } from './doc/arrange.mjs';
import { PATHFINDER_LABELS, runPathfinder } from './geom/pathfinder.mjs';
import { fillHex, pathfinderCommands, stackingOrder } from './doc/pathfinder-commands.mjs';
import { cancelActiveScrub } from './ui/number-field.mjs';
import { PANEL_DEFINITIONS } from './panels/registry.mjs';
import { toolRegistry } from './tools/registry.mjs';
import { createToolbar } from './tools/toolbar.mjs';
import { createInteractions } from './tools/interactions.mjs';
import { createPathInteractions, PATH_TOOLS } from './tools/paths.mjs';
import { createArtboardController } from './tools/artboards.mjs';
import { createTransformController } from './tools/transforms.mjs';
import { TRANSFORM_TOOLS, operationMatrix, dialogOperation, panelMatrix } from './geom/transforms.mjs';
import { transformedBox } from './tools/selection.mjs';
import { SHAPE_TOOLS, shapeFromDrag } from './tools/shapes.mjs';
import { insertNode, removeNode, replaceLeaf, updateNode, updateDocument } from './doc/commands.mjs';
import { activeArtboard } from './doc/artboards.mjs';
import { changePaint, changeStroke, paintHex } from './doc/paint.mjs';
import { importArtwork } from './import-artwork.mjs';
import { shapeSizeDialog, rearrangeDialog,transformDialog as openTransformDialog,layerOptionsDialog,swatchOptionsDialog,sendToCutDialog } from './ui/dialogs.mjs';
import { artboardCutSvg } from './io/cut-svg.mjs';
import { EXPORT_FORMATS, rasterSize, svgDocument } from './io/export.mjs';
import { createExportController } from './export-controller.mjs';
import { layerOptionsPatch, templateLayerCommands, isOutputNode } from './doc/layers.mjs';
import { toolCursor } from './tools/cursors.mjs';
import { alignReference, alignOffsets, distributeOffsets, spacingOffsets } from './geom/align.mjs';
import { pointText, pathText, textValues, textProperties, textToOutlines, DEFAULT_CHARACTER } from './doc/text.mjs';
import { hasTextLayout } from './doc/text-layout.mjs';
import { textDialog } from './ui/dialogs.mjs';

const workspaces=new WeakMap();
export function getDrawWorkspace(root) {return workspaces.get(root) || null;}
const implementedTools=new Set(['select','hand','zoom','artboard','type','area-type','type-on-path',...SHAPE_TOOLS,...PATH_TOOLS,...TRANSFORM_TOOLS]);
const commands=new Set(['undo','redo','delete','select-all','select-artboard','deselect','cancel','fit-artboard','fit-all','actual-size','zoom-in','zoom-out','outline',
  'cut','copy','paste','paste-front','paste-back','paste-place','paste-all-artboards',
  'edit-text','create-outlines','send-to-cut','export-as','export-screens','use-as-template','toggle-control-bar','group','ungroup','bring-forward','send-backward','bring-front','send-back','lock','unlock-all','hide','show-all',
  'paint-focus','paint-swap','paint-none','paint-solid','default-paint','smart-guides','tool-dialog','transform-again','rotate-dialog','reflect-dialog','scale-dialog','toggle-panels','toggle-panels-except-tools',
  ...PANEL_DEFINITIONS.map(p=>`panel.${p.id}`),...['left','right','up','down'].flatMap(d=>[`nudge-${d}`,`nudge-large-${d}`,`duplicate-${d}`])]);
export function createDrawWorkspace(root,{paper=window.paper,state=createProjectDraw(),onError=console.warn,onImport=()=>{},onSendToCut=null,cutIsEmpty=()=>false,cutClipboard=()=>null,onExport=null,getPreferences=()=>({}),statusHost=null}={}) {
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
  const renderer=withScope(()=>createDrawRenderer(scope,state,{withScope,onImageLoad:()=>panels?.render()}));
  const selectedIds=()=>state.selection.ids.filter(id=>!state.document.ancestors(id).some(n=>state.selection.ids.includes(n.id)));
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
    statusLine.textContent=`${tool.name} · ${state.selection.ids.length} selected · `+(
      SHAPE_TOOLS.includes(tool.id) ? 'Shift: constrain · Alt: from center · Space: move · Click: exact size' :
      TRANSFORM_TOOLS.includes(tool.id) ? 'Click: reference point · Drag: transform · Shift: constrain · Alt: copy · Enter: dialog' :
      tool.id==='pen' ? 'Click: corner · Drag: curve · Alt: break handles · Space: move anchor · Enter/Esc: finish' :
      ['type','area-type'].includes(tool.id) ? 'Click: '+(tool.id==='type'?'point text':'area text')+' · Drag: text frame · Click existing text: edit' :
      tool.id==='type-on-path' ? 'Click a path or shape: type along it · Click existing text: edit' :
      tool.id==='direct-selection' ? 'Drag dots: round corners · Alt: one corner / break handles · Shift: add anchors/constrain' :
      tool.id==='anchor-point' ? 'Click anchor: corner/smooth · Drag: handles · Click shape: expand to path' :
      tool.id==='artboard' ? 'Drag: create/move · Edges: resize · Alt+drag: duplicate' :
      tool.id==='select' ? 'Shift: add to selection · Alt+drag: copy · Space: Hand' : 'Space: Hand · Ctrl/Cmd+Space: Zoom');
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
      scope.view.center=scope.view.center.add(point.subtract(scope.view.viewToProject(anchor)));renderer.updateView();});status();
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
  function paint(kind,value,{mergeKey=null}={}) {
    if(state.document.readOnly)return;
    if(kind==='width')state.ui.strokeWidth=value;else state.ui[kind]=value;
    // Remember the last solid color per kind for the Color button / Comma shortcut.
    if(kind!=='width'&&value)state.ui.lastSolid={...state.ui.lastSolid,[kind]:value};
    // Recent Colors records committed colors, not every step of a live slider drag.
    if(kind!=='width'&&value&&!mergeKey)state.ui.recentColors=rememberColor(state.ui.recentColors,value);
    const ids=paintIds();
    if(ids.length)state.history.transaction('Appearance',()=>{for(const id of ids)state.history.execute(updateNode(id,{appearance:changePaint(state.document.getNode(id).appearance,kind,value,state.ui)}));},{mergeKey});
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
    return world.every((v,i)=>v===[1,0,0,1,0,0][i])?node:{...node,transform:multiplyMatrix(invertMatrix(world),node.transform)};
  }
  /** The artboard as a cut SVG; shapes are expanded and placed with their parent's world matrix. */
  function cutSvg(boardId,resolved=new Map(),options={}) {
    return withScope(()=>artboardCutSvg(state.document,boardId,{
      bounds:id=>renderer.bounds(id),
      worldMatrix(id){const node=state.document.getNode(id),parent=state.document.ancestors(id)[0];
        return node.type==='shape'?(parent?renderer.worldMatrix(parent.id):[1,0,0,1,0,0]):renderer.worldMatrix(id);},
      subpaths(id){const node=state.document.getNode(id);return node.type==='shape'?renderer.expandedShape(id)?.subpaths:node.subpaths;},
      resolvedText:id=>resolved.get(id),glyphBounds:(id,paths)=>renderer.glyphBounds(id,paths),
    },options));
  }
  /** One artboard as an SVG document (text) or a PNG/JPEG data URL, drawn from the printable artwork. */
  function exportBoard(boardId,format,{ppi=150,background='transparent',quality=.92}={}) {
    const board=state.document.getArtboard(boardId);if(!board)throw new Error('Choose an artboard to export.');
    if(!EXPORT_FORMATS[format])throw new Error('Choose SVG, PNG or JPEG.');
    const fill=background==='white'?'#FFFFFF':background==='artboard'?board.background??'#FFFFFF':format==='jpg'?'#FFFFFF':null;
    return withScope(()=>{
      const art=renderer.exportArtwork();
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
  let cutBusy=false;
  async function sendToCut(boardId=state.ui.artboardId) {
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
    // The dialog still opens when something blocks the send, so it can explain why.
    const boards=state.document.data.artboards,empty=cutIsEmpty();
    const direct=empty&&boards.length===1&&(()=>{try{const s=cutSvg(boards[0].id,resolved);return s.count>0&&!s.errors.length;}catch{return false;}})();
    const options=direct?{boardId:boards[0].id,target:'add',placement:'origin'}
      :await sendToCutDialog({boards,boardId,summary:id=>cutSvg(id,resolved),cutEmpty:empty});
    if(!options||destroyed)return;
    if(state.document.data!==before)throw new Error('The artwork changed while preparing the cut. Try sending again.');
    const board=state.document.getArtboard(options.boardId),{svg,count,warnings,errors}=cutSvg(board.id,resolved);
    if(errors.length)throw new Error(errors.join(' '));
    if(!count)throw new Error('Nothing on this artboard can be sent to Cut.');
    await onSendToCut({svg,count,warnings,name:board.name,width:board.width,height:board.height,target:options.target,placement:options.placement});
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
  function insertShape(node) {const parent=insertionParent();state.history.execute(insertNode(parent,toParentSpace(parent,node)));select([node.id]);}
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
  async function editText(point = scope.view.center, id = null, frame = null, {pathFrom = null} = {}) {
    if(destroyed||textBusy||state.document.readOnly||document.querySelector('.modal-overlay'))return;
    const original=id?state.document.getNode(id):null;
    if(id&&(original?.type!=='text'||!state.document.isEditable(id)))return;
    let subpath=null;
    try{if(pathFrom)subpath=textPathFrom(pathFrom);}catch(error){onError(error.message);return;}
    const parent=id?state.document.locate(id).parentId:pathFrom?state.document.locate(pathFrom).parentId:insertionParent();
    let defaults=original?textValues(original):{text:'Text',...DEFAULT_CHARACTER,...state.ui.character,alignment:state.ui.textAlignment??'left',
      kind:pathFrom?'onPath':frame?'area':'point',...(frame?{frameWidth:frame.width,frameHeight:frame.height}:{}),...(pathFrom?{pathSubpath:subpath,pathOffset:0,pathFlip:false}:{})};
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
          state.history.execute(insertNode(parent,{...node,...patch}));
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
    interactions?.cancel();paths?.finish();toolbar?.close();temporary=null;state.ui.tool=id;canvas.dataset.tool=id;canvas.style.cursor=cursor();
    withScope(()=>renderer.select());toolbar?.update();panels?.render();hint.hidden=state.document.data.layers.some(l=>l.children.length)||state.document.readOnly||id!=='select';status();
  }
  function openPanel(id) {toolbar?.close();panels.open(id);}
  artboards=createArtboardController(state,{refresh,fit,bounds:id=>renderer.bounds(id),localMatrix:(id,m)=>renderer.localMatrix(id,m)});
  panels=createPanels(shell,state,{run,select,selectedIds,paintIds,paint,bounds:()=>renderer.selectionBounds(),fit,artboards,
    cornerInfo:()=>paths?.cornerInfo()??null,setCornerRadius:radius=>paths.setCornerRadius(radius),
    strokeProps(props,{mergeKey=null}={}){const ids=paintIds();if(!ids.length||state.document.readOnly)return;
      if(props.width!==undefined)state.ui.strokeWidth=props.width;
      state.history.transaction('Stroke',()=>{for(const id of ids)state.history.execute(updateNode(id,{appearance:changeStroke(state.document.getNode(id).appearance,props,state.ui)}));},{mergeKey});},
    paintFocus(kind){state.ui.paintFocus=kind;toolbar?.update();panels?.render();},
    thumbnail:id=>withScope(()=>renderer.thumbnail(id)),
    textStyle:(changes,label)=>textStyle(changes,label).catch(error=>{if(!destroyed)onError(error.message);}),
    fontFamilies,
    command:id=>handle(id),
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
  function objectCommand(command) {
    const doc=state.document,ids=()=>selectedIds(),apply=(label,commands)=>{if(commands.length)state.history.transaction(label,()=>commands.forEach(c=>state.history.execute(c)));};
    const arrange={'bring-front':['front','Bring to Front'],'bring-forward':['forward','Bring Forward'],'send-backward':['backward','Send Backward'],'send-back':['back','Send to Back']}[command];
    if(arrange)return()=>apply(arrange[1],arrangeCommands(doc,ids(),arrange[0]));
    if(command==='group')return()=>{const {commands,group}=groupCommands(doc,ids());apply('Group',commands);select([group.id]);};
    if(command==='ungroup')return()=>{const {commands,released}=ungroupCommands(doc,ids());apply('Ungroup',commands);select(released);};
    if(command==='lock')return()=>{apply('Lock',lockCommands(doc,ids()));select([]);};
    if(command==='hide')return()=>{apply('Hide',hideCommands(doc,ids()));select([]);};
    if(command==='unlock-all')return()=>{const before=new Set(doc.descendants(null).filter(n=>n.locked&&n.type!=='layer').map(n=>n.id));apply('Unlock All',unlockAllCommands(doc));select([...before]);};
    if(command==='show-all')return()=>{const before=new Set(doc.descendants(null).filter(n=>!n.visible&&n.type!=='layer').map(n=>n.id));apply('Show All',showAllCommands(doc));select([...before]);};
    return null;
  }
  function handle(command) {return run(()=>{
    if(command.startsWith('tool.'))return setTool(command.slice(5));
    if(command.startsWith('panel.'))return openPanel(command.slice(6));
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
    const object=objectCommand(command)??clipboardCommand(command);if(object)return object();
    if(['rotate-dialog','reflect-dialog','scale-dialog'].includes(command))return void transformToolDialog(command.split('-')[0]);
    if(command==='delete') {
      if(state.ui.tool==='artboard')return artboards.remove();
      state.history.transaction('Delete',()=>{for(const id of selectedIds())state.history.execute(removeNode(id));});return;
    }
    if(command==='smart-guides'){const settings=state.document.data.settings;state.history.execute(updateDocument({settings:{...settings,smartGuides:!settings.smartGuides}}));return;}
    if(command==='paint-focus'){state.ui.paintFocus=state.ui.paintFocus==='fill'?'stroke':'fill';toolbar.update();return;}
    if(command==='paint-none')return paint(state.ui.paintFocus,null);
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
    if(command==='tool-dialog'&&state.ui.tool==='type-on-path'){const id=selectedIds()[0];if(id)return void editText(undefined,null,null,{pathFrom:id});return;}
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
  paths=createPathInteractions(canvas,state,{scope,renderer,withScope,run,select,selectionChanged,layerId:insertionParent,status,
    tool:()=>temporary?.id || state.ui.tool,closeMenus:()=>toolbar.close()});
  interactions=createInteractions(canvas,state,{scope,renderer,withScope,run,select,selectedIds,transform,artboards,status,shapeOptions,insertShape,shapeDialog,zoomAt,isolate,exitIsolation,
    transforms,transformDialog:transformToolDialog,editText,typeOnPath:id=>editText(undefined,null,null,{pathFrom:id}),cursor,
    tool:()=>temporary?.id || state.ui.tool,zoomOut:()=>!!temporary?.zoomOut,preferences:getPreferences,closeMenus:()=>toolbar.close(),notify:message=>onError(message)});
  const unsubscribe=state.subscribe(()=>{interactions.cancel();paths.documentChanged();refresh();if(state.ui.isolation&&!isolation())isolationChanged();else renderIsolationBar();});
  function resize(){const {width,height}=stage.getBoundingClientRect();if(width<=0||height<=0)return;
    withScope(()=>{scope.view.viewSize=new scope.Size(width,height);if(!fitted){renderer.fit();fitted=true;}renderer.updateView();});status();}
  const observer=new ResizeObserver(resize);observer.observe(stage);
  function syncTheme(){const css=getComputedStyle(root);withScope(()=>renderer.setTheme({muted:css.getPropertyValue('--text-muted').trim(),background:css.getPropertyValue('--surface-2').trim()}));}
  window.addEventListener('modcut-theme-change',syncTheme);
  boardSelect.addEventListener('change',()=>artboards.choose(boardSelect.value,true));
  zoomInput.addEventListener('change',()=>{if(Number.isFinite(zoomInput.valueAsNumber)&&zoomInput.valueAsNumber>=.0001&&zoomInput.valueAsNumber<=10000)zoomAt(scope.view.center,zoomInput.valueAsNumber/100*(96/25.4)/scope.view.zoom);else status();});
  outlineButton.addEventListener('click',()=>handle('outline'));fitButton.addEventListener('click',()=>fit());
  const workspace={state,scope,renderer,isolate,cutSvg,exportBoard,exporter,exportAs:()=>exportAs().catch(error=>onError(error.message)),exportScreens:()=>exportScreens().catch(error=>onError(error.message)),sendToCut:boardId=>sendToCut(boardId).catch(error=>onError(error.message)),exitIsolation,statusElement:controls,artboards,transforms,resize,select,setTool,handle,availableTool:id=>implementedTools.has(id),canHandle:command=>commands.has(command),
    setTemporaryTool(value){temporary=value;canvas.dataset.tool=temporary?.id || state.ui.tool;canvas.style.cursor=cursor();status();},
    async import(prepared,name,options={}){const result=await importArtwork(scope,state,prepared,name,layerId(),{...options,alive:()=>!destroyed});select(options.template?[]:result.ids);if(options.fitArtboard)fit();return result;},
    destroy(){destroyed=true;ownedTextModal?.querySelector('[data-x=cancel]').click();ownedTransformModal?.querySelector('[data-x=cancel]').click();paths.destroy();interactions.destroy();toolbar.destroy();unsubscribe();observer.disconnect();window.removeEventListener('modcut-theme-change',syncTheme);workspaces.delete(root);withScope(()=>{renderer.destroy();scope.remove();});controls.remove();root.replaceChildren();},
  };
  workspaces.set(root,workspace);refresh();syncTheme();setTool(state.ui.tool);resize();return workspace;
}
