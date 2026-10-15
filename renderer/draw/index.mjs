import { createProjectDraw } from './io/project.mjs';
import { createDrawRenderer } from './render.mjs';
import { createPanels } from './panels/ui.mjs';
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
import { insertNode, removeNode, updateNode, updateDocument } from './doc/commands.mjs';
import { activeArtboard } from './doc/artboards.mjs';
import { changePaint, paintHex } from './doc/paint.mjs';
import { importArtwork } from './import-artwork.mjs';
import { shapeSizeDialog, rearrangeDialog,transformDialog as openTransformDialog,layerOptionsDialog } from './ui/dialogs.mjs';
import { layerOptionsPatch } from './doc/layers.mjs';

const workspaces=new WeakMap();
export function getDrawWorkspace(root) {return workspaces.get(root) || null;}
const implementedTools=new Set(['select','hand','zoom','artboard',...SHAPE_TOOLS,...PATH_TOOLS,...TRANSFORM_TOOLS]);
const commands=new Set(['undo','redo','delete','select-all','select-artboard','deselect','cancel','fit-artboard','fit-all','actual-size','zoom-in','zoom-out','outline',
  'paint-focus','paint-swap','paint-none','default-paint','smart-guides','tool-dialog','transform-again','rotate-dialog','reflect-dialog','scale-dialog','toggle-panels','toggle-panels-except-tools',
  ...PANEL_DEFINITIONS.map(p=>`panel.${p.id}`),...['left','right','up','down'].flatMap(d=>[`nudge-${d}`,`nudge-large-${d}`,`duplicate-${d}`])]);
export function createDrawWorkspace(root,{paper=window.paper,state=createProjectDraw(),onError=console.warn,onImport=()=>{},getPreferences=()=>({}),statusHost=null}={}) {
  state.ui={tool:'select',panel:'properties',layerId:state.document.data.layers[0]?.id,fill:'#FFFFFF',stroke:'#071411',strokeWidth:.5,paintFocus:'fill',...state.ui};
  state.ui.artboardId=activeArtboard(state).id;
  const element=(tag,className,parent)=>{const el=document.createElement(tag);el.className=className;parent?.append(el);return el;};
  const shell=element('div','draw-shell',root),tools=element('nav','draw-tool-rail',shell);tools.setAttribute('aria-label','Draw tools');
  const stage=element('div','draw-stage',shell),canvas=element('canvas','draw-canvas',stage);canvas.setAttribute('aria-label','Draw canvas');canvas.tabIndex=0;
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
  let panels,toolbar,interactions,paths,artboards,temporary=null,destroyed=false,fitted=false,lastPoint=null,ownedTransformModal=null;
  const renderer=withScope(()=>createDrawRenderer(scope,state,{withScope,onImageLoad:()=>panels?.render()}));
  const selectedIds=()=>state.selection.ids.filter(id=>!state.document.ancestors(id).some(n=>state.selection.ids.includes(n.id)));
  const paintIds=()=>[...new Set(selectedIds().flatMap(id=>{
    const node=state.document.getNode(id);return node.children ? state.document.descendants(id).map(n=>n.id) : [id];
  }))].filter(id=>['path','shape'].includes(state.document.getNode(id)?.type) && state.document.isEditable(id));
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
      tool.id==='direct-selection' ? 'Drag dots: round corners · Alt: one corner / break handles · Shift: add anchors/constrain' :
      tool.id==='anchor-point' ? 'Click anchor: corner/smooth · Drag: handles · Click shape: expand to path' :
      tool.id==='artboard' ? 'Drag: create/move · Edges: resize · Alt+drag: duplicate' :
      tool.id==='select' ? 'Shift: add to selection · Alt+drag: copy · Space: Hand' : 'Space: Hand · Ctrl/Cmd+Space: Zoom');
  }
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
  function paint(kind,value) {
    if(state.document.readOnly)return;
    if(kind==='width')state.ui.strokeWidth=value;else state.ui[kind]=value;
    const ids=paintIds();
    if(ids.length)state.history.transaction('Appearance',()=>{for(const id of ids)state.history.execute(updateNode(id,{appearance:changePaint(state.document.getNode(id).appearance,kind,value,state.ui)}));});
    else {panels?.render();toolbar?.update();}
  }
  function layerId() {
    if(state.document.isEditable(state.ui.layerId))return state.ui.layerId;
    const layer=state.document.data.layers.find(n=>state.document.isEditable(n.id));
    if(!layer)throw new Error('Create or unlock a visible layer before drawing.');state.ui.layerId=layer.id;return layer.id;
  }
  function insertShape(node) {state.history.execute(insertNode(layerId(),node));select([node.id]);}
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
    interactions?.cancel();paths?.finish();toolbar?.close();temporary=null;state.ui.tool=id;canvas.dataset.tool=id;canvas.style.cursor='';
    withScope(()=>renderer.select());toolbar?.update();panels?.render();hint.hidden=state.document.data.layers.some(l=>l.children.length)||state.document.readOnly||id!=='select';status();
  }
  function openPanel(id) {if(!PANEL_DEFINITIONS.some(p=>p.id===id))return;toolbar?.close();state.ui.panel=id;panels.render();}
  artboards=createArtboardController(state,{refresh,fit,bounds:id=>renderer.bounds(id),localMatrix:(id,m)=>renderer.localMatrix(id,m)});
  panels=createPanels(shell,state,{run,select,selectedIds,paintIds,paint,bounds:()=>renderer.selectionBounds(),fit,artboards,
    cornerInfo:()=>paths?.cornerInfo()??null,setCornerRadius:radius=>paths.setCornerRadius(radius),
    async layerOptions(id){const layer=state.document.getNode(id);if(layer?.type!=='layer'||state.document.readOnly)return;
      const values=await layerOptionsDialog(layer);if(!values||destroyed)return;
      run(()=>{const current=state.document.getNode(id);if(!current)return;const patch=layerOptionsPatch(current,values);if(Object.keys(patch).length)state.history.execute(updateNode(id,patch,{label:'Layer Options'}));});},
    async rearrange(){const options=await rearrangeDialog();if(options&&!destroyed)run(()=>artboards.rearrange(options));},
    transformPanel(key,value){const b=renderer.selectionBounds();if(!b)return;
      const scaling=key==='width'||key==='height',matrix=panelMatrix(b,state.ui.referencePoint??[.5,.5],key,value,{linked:!!state.ui.linkProportions});
      transform(matrix,{x:'Move',y:'Move',width:'Scale',height:'Scale',rotate:'Rotate',shear:'Shear'}[key],scaling?{scaleStrokes:state.ui.scaleStrokes!==false,scaleCorners:state.ui.scaleCorners!==false}:{});
    },
    align(key){const b=renderer.selectionBounds(),a=activeArtboard(state);if(!b)return;
      const x={left:a.x,centerX:a.x+(a.width-b.width)/2,right:a.x+a.width-b.width}[key],y={top:a.y,centerY:a.y+(a.height-b.height)/2,bottom:a.y+a.height-b.height}[key];
      transform([1,0,0,1,x===undefined?0:x-b.x,y===undefined?0:y-b.y],'Align');
    },
  });
  function handle(command) {return run(()=>{
    if(command.startsWith('tool.'))return setTool(command.slice(5));
    if(command.startsWith('panel.'))return openPanel(command.slice(6));
    if(paths?.handle(command)){if(command==='cancel')toolbar.close(true);return;}
    if(command==='cancel'){interactions.cancel();toolbar.close(true);return;}
    if(command==='undo'||command==='redo'){interactions.cancel();paths.finish();state.history[command]();select(state.selection.ids);return;}
    if(command==='fit-artboard')return fit();if(command==='fit-all')return fit(null);
    if(command==='zoom-in'||command==='zoom-out')return zoomAt(scope.view.center,command==='zoom-in'?1.25:.8);
    if(command==='actual-size')return zoomAt(scope.view.center,(96/25.4)/scope.view.zoom);
    if(command==='outline'){state.ui.outline=!renderer.outline;renderer.setOutline(state.ui.outline);outlineButton.setAttribute('aria-pressed',String(renderer.outline));return;}
    if(command==='deselect')return select([]);
    if(command==='select-all')return select(state.document.data.layers.flatMap(l=>l.children).map(n=>n.id));
    if(command==='select-artboard'){const a=activeArtboard(state),rect=new scope.Rectangle(a.x,a.y,a.width,a.height);return select(state.document.data.layers.flatMap(l=>l.children).filter(n=>renderer.bounds(n.id)?.intersects(rect)).map(n=>n.id));}
      if(command==='toggle-panels'||command==='toggle-panels-except-tools'){shell.classList.toggle('draw-shell--panels-hidden');shell.classList.toggle('draw-shell--all-hidden',command==='toggle-panels' && shell.classList.contains('draw-shell--panels-hidden'));return;}
    if(state.document.readOnly)return;
    if(command==='transform-again')return transforms.again();
    if(['rotate-dialog','reflect-dialog','scale-dialog'].includes(command))return void transformToolDialog(command.split('-')[0]);
    if(command==='delete') {
      if(state.ui.tool==='artboard')return artboards.remove();
      state.history.transaction('Delete',()=>{for(const id of selectedIds())state.history.execute(removeNode(id));});return;
    }
    if(command==='smart-guides'){const settings=state.document.data.settings;state.history.execute(updateDocument({settings:{...settings,smartGuides:!settings.smartGuides}}));return;}
    if(command==='paint-focus'){state.ui.paintFocus=state.ui.paintFocus==='fill'?'stroke':'fill';toolbar.update();return;}
    if(command==='paint-none')return paint(state.ui.paintFocus,null);
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
  paths=createPathInteractions(canvas,state,{scope,renderer,withScope,run,select,selectionChanged,layerId,status,
    tool:()=>temporary?.id || state.ui.tool,closeMenus:()=>toolbar.close()});
  interactions=createInteractions(canvas,state,{scope,renderer,withScope,run,select,selectedIds,transform,artboards,status,shapeOptions,insertShape,shapeDialog,zoomAt,
    transforms,transformDialog:transformToolDialog,
    tool:()=>temporary?.id || state.ui.tool,zoomOut:()=>!!temporary?.zoomOut,preferences:getPreferences,closeMenus:()=>toolbar.close()});
  const unsubscribe=state.subscribe(()=>{interactions.cancel();paths.documentChanged();refresh();});
  function resize(){const {width,height}=stage.getBoundingClientRect();if(width<=0||height<=0)return;
    withScope(()=>{scope.view.viewSize=new scope.Size(width,height);if(!fitted){renderer.fit();fitted=true;}renderer.updateView();});status();}
  const observer=new ResizeObserver(resize);observer.observe(stage);
  function syncTheme(){const css=getComputedStyle(root);withScope(()=>renderer.setTheme({muted:css.getPropertyValue('--text-muted').trim(),background:css.getPropertyValue('--surface-2').trim()}));}
  window.addEventListener('modcut-theme-change',syncTheme);
  boardSelect.addEventListener('change',()=>artboards.choose(boardSelect.value,true));
  zoomInput.addEventListener('change',()=>{if(Number.isFinite(zoomInput.valueAsNumber)&&zoomInput.valueAsNumber>=.0001&&zoomInput.valueAsNumber<=10000)zoomAt(scope.view.center,zoomInput.valueAsNumber/100*(96/25.4)/scope.view.zoom);else status();});
  outlineButton.addEventListener('click',()=>handle('outline'));fitButton.addEventListener('click',()=>fit());
  const workspace={state,scope,renderer,statusElement:controls,artboards,transforms,resize,select,setTool,handle,availableTool:id=>implementedTools.has(id),canHandle:command=>commands.has(command),
    setTemporaryTool(value){temporary=value;canvas.dataset.tool=temporary?.id || state.ui.tool;status();},
    async import(prepared,name,options={}){const result=await importArtwork(scope,state,prepared,name,layerId(),{...options,alive:()=>!destroyed});select(result.ids);if(options.fitArtboard)fit();return result;},
    destroy(){destroyed=true;ownedTransformModal?.querySelector('[data-x=cancel]').click();paths.destroy();interactions.destroy();toolbar.destroy();unsubscribe();observer.disconnect();window.removeEventListener('modcut-theme-change',syncTheme);workspaces.delete(root);withScope(()=>{renderer.destroy();scope.remove();});controls.remove();root.replaceChildren();},
  };
  workspaces.set(root,workspace);refresh();syncTheme();setTool(state.ui.tool);resize();return workspace;
}
