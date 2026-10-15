import {insertNode,updateNode} from '../doc/commands.mjs';
import {createId} from '../doc/schema.mjs';
import {transformProperties} from '../geometry.mjs';
import {isIdentity,scaledStrokeProperties} from '../geom/transforms.mjs';

/** One transaction per transform. Repeat memory and reference points are per workspace UI. */
export function createTransformController(state,api) {
  let last=null,selectionKey='',internalSelection=false;
  const ids=()=>api.selectedIds().filter(id=>state.document.isEditable(id));
  function selectionChanged(){
    const key=JSON.stringify([...ids()].sort());if(!internalSelection&&key!==selectionKey)state.ui.transformOrigin=null;selectionKey=key;
  }
  function origin(){selectionChanged();const b=api.bounds();return state.ui.transformOrigin??(b?[b.x+b.width/2,b.y+b.height/2]:null);}
  function setOrigin(point){selectionChanged();state.ui.transformOrigin=point?[...point]:null;api.update();}
  function apply(matrix,label='Transform',{copy=false,ids:targets=ids(),mergeKey=null,scaleStrokes=null,remember=true}={}) {
    if(state.document.readOnly||!targets.length||!copy&&isIdentity(matrix))return false;
    if(matrix.length!==6||!matrix.every(Number.isFinite))throw new RangeError('Invalid transform');
    targets=[...new Set(targets)].filter(id=>state.document.isEditable(id)).filter(id=>!state.document.ancestors(id).some(n=>targets.includes(n.id)));
    if(!targets.length)return false;
    const result=[],pivot=state.ui.transformOrigin&&[...state.ui.transformOrigin];
    const strokeProperties=node=>scaleStrokes===null?{}:scaledStrokeProperties(node,api.worldMatrix(node.id),matrix,scaleStrokes);
    state.history.transaction(copy?`Copy ${label}`:label,()=>{
      for(const id of targets){
        const node=state.document.getNode(id),properties=transformProperties(node,api.localMatrix(id,matrix));
        if(copy){
          const clone=structuredClone({...node,...properties}),prepare=(n,source)=>{Object.assign(n,strokeProperties(source));n.id=createId();n.children?.forEach((c,i)=>prepare(c,source.children[i]));};prepare(clone,node);
          const location=state.document.locate(id);state.history.execute(insertNode(location.parentId,clone,location.index+1));result.push(clone.id);
        }else {
          state.history.execute(updateNode(id,{...properties,...strokeProperties(node)},{label,mergeKey}));
          if(scaleStrokes!==null&&node.children)for(const child of state.document.descendants(id)){
            const props=strokeProperties(child);if(Object.keys(props).length)state.history.execute(updateNode(child.id,props,{label}));
          }
          result.push(id);
        }
      }
    });
    internalSelection=true;try{api.select(result);state.ui.transformOrigin=pivot;selectionChanged();}finally{internalSelection=false;}
    api.update();if(remember)last={matrix:[...matrix],label,copy,scaleStrokes};return true;
  }
  return {apply,origin,setOrigin,selectionChanged,again(){return last?apply(last.matrix,last.label,last):false;},get last(){return last&&structuredClone(last);}};
}
