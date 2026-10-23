import {insertNodes,updateNodes} from '../doc/commands.mjs';
import {createId} from '../doc/schema.mjs';
import {transformProperties} from '../geometry.mjs';
import {isIdentity,scaledStrokeProperties,strokeScalingPolicy} from '../geom/transforms.mjs';

/** One transaction per transform. Repeat memory and reference points are per workspace UI. */
export function createTransformController(state,api) {
  let last=null,selectionKey='',internalSelection=false;
  const ids=()=>api.selectedIds().filter(id=>state.document.isEditable(id));
  function selectionChanged(){
    const key=JSON.stringify([...ids()].sort());if(!internalSelection&&key!==selectionKey)state.ui.transformOrigin=null;selectionKey=key;
  }
  function origin(){selectionChanged();const b=api.bounds();return state.ui.transformOrigin??(b?[b.x+b.width/2,b.y+b.height/2]:null);}
  function setOrigin(point){selectionChanged();state.ui.transformOrigin=point?[...point]:null;api.update();}
  function apply(matrix,label='Transform',{copy=false,ids:targets=ids(),mergeKey=null,scaleStrokes=strokeScalingPolicy(state.ui,matrix),scaleCorners=true,remember=true}={}) {
    if(state.document.readOnly||!targets.length||!copy&&isIdentity(matrix))return false;
    if(matrix.length!==6||!matrix.every(Number.isFinite))throw new RangeError('Invalid transform');
    const chosen=new Set(targets);
    targets=[...chosen].filter(id=>state.document.isEditable(id)).filter(id=>!state.document.ancestors(id).some(n=>chosen.has(n.id)));
    if(!targets.length)return false;
    const result=[],pivot=state.ui.transformOrigin&&[...state.ui.transformOrigin];
    const strokeProperties=(node,descendant=false)=>scaleStrokes===null?{}:scaledStrokeProperties(node,api.worldMatrix(node.id),matrix,scaleStrokes,{descendant});
    // All objects change in one edit (one walk of the document), not one edit each.
    const updates=[],inserts=[],originals=[];
    state.history.transaction(copy?`Copy ${label}`:label,()=>{
      for(const id of targets){
        const node=state.document.getNode(id),properties=transformProperties(node,api.localMatrix(id,matrix),{scaleCorners});
        if(copy){
          const clone=structuredClone({...node,...properties}),prepare=(n,source,descendant=false)=>{Object.assign(n,strokeProperties(source,descendant));n.id=createId();n.children?.forEach((c,i)=>prepare(c,source.children[i],true));};prepare(clone,node);
          // Each copy goes right above its original; copies already placed below it in the same list shift it up.
          const location=state.document.locate(id),below=originals.filter(([parent,at])=>parent===location.parentId&&at<location.index).length;
          inserts.push([location.parentId,clone,location.index+1+below]);originals.push([location.parentId,location.index]);result.push(clone.id);
        }else {
          updates.push([id,{...properties,...strokeProperties(node)}]);
          if(scaleStrokes!==null&&node.children)for(const child of state.document.descendants(id)){
            const props=strokeProperties(child,true);if(Object.keys(props).length)updates.push([child.id,props]);
          }
          result.push(id);
        }
      }
      if(updates.length)state.history.execute(updateNodes(updates,{label,mergeKey}));
      if(inserts.length)state.history.execute(insertNodes(inserts));
    });
    internalSelection=true;try{api.select(result);state.ui.transformOrigin=pivot;selectionChanged();}finally{internalSelection=false;}
    api.update();if(remember)last={matrix:[...matrix],label,copy,scaleStrokes,scaleCorners};return true;
  }
  return {apply,origin,setOrigin,selectionChanged,again(){return last?apply(last.matrix,last.label,last):false;},get last(){return last&&structuredClone(last);}};
}
