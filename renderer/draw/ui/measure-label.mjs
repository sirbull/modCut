import { RULER_UNITS } from '../view/rulers.mjs';

export function measurementValue(mm,unit='mm') {
  const scale=RULER_UNITS.find(u=>u.id===unit&&u.mm)??RULER_UNITS[0];
  return (mm/scale.mm).toFixed(2);
}

/** A view-only length badge. Its two positions follow the line through pan, zoom and rotation. */
export function createMeasureLabel(stage,{toView,unit}) {
  const badge=document.createElement('output');badge.className='draw-measure-label';badge.hidden=true;
  badge.setAttribute('aria-label','Measured length');stage.append(badge);
  const controller=new AbortController(),events={signal:controller.signal};
  let points=null,side=1,pointer=null;
  const contains=(box,p)=>p&&p.x>=box.x&&p.x<=box.x+box.width&&p.y>=box.y&&p.y<=box.y+box.height;
  function refresh() {
    if(!points){badge.hidden=true;return;}
    const [from,to]=points,mm=Math.hypot(to[0]-from[0],to[1]-from[1]);
    badge.textContent=`${measurementValue(mm,unit())} ${unit()}`;badge.hidden=false;
    const [a,b]=points.map(toView),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
    let nx=-dy/length,ny=dx/length;
    // Prefer below a horizontal line, or to the right of a vertical one, regardless of drag direction.
    if((Math.abs(dx)>=Math.abs(dy)?ny:nx)<0){nx=-nx;ny=-ny;}
    if(!dx&&!dy){nx=0;ny=1;}
    const width=badge.offsetWidth,height=badge.offsetHeight;
    const offset=12+Math.abs(nx)*width/2+Math.abs(ny)*height/2;
    const position=s=>({
      x:Math.max(4,Math.min(stage.clientWidth-width-4,(a.x+b.x)/2+s*nx*offset-width/2)),
      y:Math.max(4,Math.min(stage.clientHeight-height-4,(a.y+b.y)/2+s*ny*offset-height/2)),width,height,
    });
    let box=position(side),other=position(-side);
    if(contains(box,pointer)&&!contains(other,pointer)){side=-side;box=other;}
    badge.style.left=`${box.x}px`;badge.style.top=`${box.y}px`;badge.dataset.side=String(side);
  }
  stage.addEventListener('pointermove',event=>{const r=stage.getBoundingClientRect();pointer={x:event.clientX-r.left,y:event.clientY-r.top};refresh();},{...events,capture:true});
  stage.addEventListener('pointerleave',()=>{pointer=null;},events);
  return {
    set(value){points=value?.map(p=>[...p])??null;if(!points)side=1;refresh();},
    refresh,
    destroy(){controller.abort();badge.remove();},
  };
}
