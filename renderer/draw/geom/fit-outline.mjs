import { ringCorners } from './trace.mjs';
import { toSubpaths } from './pathfinder.mjs';

/** Fit sampled stroke boundaries with cubic handles, keeping corners and ring winding.
 * Minimize the number of cubics over adaptive anchor candidates, with the same
 * error bound for every shape. Circular runs are only a fast initial fit.
 * Paper's fitting error is squared. Verify both directions against the original
 * polyline as well: fitting only its vertices can bow across a thin stroke or gap.
 * Call in the caller's Paper scope; temporary paths never enter the document.
 */
export function fitOutline(scope, subpaths, tolerance = .01) {
  const distances=new WeakMap();
  const polylineDistance = (points,closed) => {
    let cached=distances.get(points);
    if (cached?.closed===closed) return cached.distance;
    const edges=points.slice(0,points.length-(closed?0:1)).map((a,i)=>{
      const b=points[(i+1)%points.length],x=b[0]-a[0],y=b[1]-a[1];
      return {a,x,y,length:x*x+y*y,minX:Math.min(a[0],b[0]),minY:Math.min(a[1],b[1]),maxX:Math.max(a[0],b[0]),maxY:Math.max(a[1],b[1])};
    });
    const build=(start,end)=>{
      const node={start,end,minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
      for(let i=start;i<end;i++){const e=edges[i];node.minX=Math.min(node.minX,e.minX);node.minY=Math.min(node.minY,e.minY);node.maxX=Math.max(node.maxX,e.maxX);node.maxY=Math.max(node.maxY,e.maxY);}
      if(end-start>8){const middle=(start+end)>>1;node.left=build(start,middle);node.right=build(middle,end);}
      return node;
    };
    const root=build(0,edges.length);
    const distance=p=>{
      let best=Infinity;
      const bound=node=>Math.max(node.minX-p[0],0,p[0]-node.maxX)**2+Math.max(node.minY-p[1],0,p[1]-node.maxY)**2;
      const visit=node=>{
        if(bound(node)>=best)return;
        if(node.left){const a=bound(node.left),b=bound(node.right);visit(a<b?node.left:node.right);visit(a<b?node.right:node.left);}
        else for(let i=node.start;i<node.end;i++){
          const {a,x,y,length}=edges[i],dx=p[0]-a[0],dy=p[1]-a[1];
          const t=length?Math.max(0,Math.min(1,(dx*x+dy*y)/length)):0;
          best=Math.min(best,(dx-t*x)**2+(dy-t*y)**2);
        }
      };
      visit(root);return Math.sqrt(best);
    };
    distances.set(points,{closed,distance});return distance;
  };
  const validFit = (candidate, points, closed) => {
    const sample = candidate.clone({ insert: false });
    try {
      sample.flatten(tolerance / 4);
      const flattened = sample.segments.map(s => [s.point.x, s.point.y]);
      const originalDistance=polylineDistance(points,closed),fittedDistance=polylineDistance(flattened,closed);
      return flattened.every(p => originalDistance(p) <= tolerance * .75)
        && points.every(p => fittedDistance(p) <= tolerance * .75);
    } finally { sample.remove(); }
  };
  // Offset round joins/caps are sampled circles. Recover their tangents instead
  // of using the first/last polygon chords as the handles' directions.
  const fitArc = points => {
    if (points.length < 5) return null;
    const a = points[0], b = points[Math.floor(points.length / 2)], c = points.at(-1);
    const u = [b[0]-a[0], b[1]-a[1]], v = [c[0]-a[0], c[1]-a[1]];
    const cross = u[0]*v[1]-u[1]*v[0];
    if (Math.abs(cross) < 1e-12) return null;
    const uu = u[0]**2+u[1]**2, vv = v[0]**2+v[1]**2;
    const centre = [a[0]+(uu*v[1]-vv*u[1])/(2*cross), a[1]+(u[0]*vv-v[0]*uu)/(2*cross)];
    const radius = Math.hypot(a[0]-centre[0], a[1]-centre[1]);
    // Rounded cubic corners can differ slightly from a circle. The final
    // bidirectional check still bounds the error against the actual outline.
    if (points.some(p => Math.abs(Math.hypot(p[0]-centre[0], p[1]-centre[1])-radius) > Math.max(3e-6,tolerance*.75))) return null;
    const direction = Math.sign(cross), angle = Math.atan2(a[1]-centre[1], a[0]-centre[0]);
    let sweep = 0;
    for (let i = 1; i < points.length; i++) {
      const p = points[i-1].map((n,j) => n-centre[j]), q = points[i].map((n,j) => n-centre[j]);
      const step = Math.atan2(p[0]*q[1]-p[1]*q[0], p[0]*q[0]+p[1]*q[1]);
      if (step*direction <= 0 || Math.abs(step) > Math.PI/2) return null;
      sweep += step;
    }
    for (const pieces of [Math.max(1,Math.ceil(Math.abs(sweep)/(Math.PI/2)-1e-5)), Math.max(1,Math.ceil(Math.abs(sweep)/(Math.PI/4)-1e-5))]) {
      const step = sweep/pieces, handle = 4/3*Math.tan(step/4)*radius;
      const segments = Array.from({length:pieces+1}, (_,i) => {
        const t = angle+i*step, tangent = [-Math.sin(t)*handle, Math.cos(t)*handle];
        return new scope.Segment(i===0?a:i===pieces?c:[centre[0]+radius*Math.cos(t),centre[1]+radius*Math.sin(t)],
          i ? tangent.map(n => -n) : [0,0], i<pieces ? tangent : [0,0]);
      });
      const candidate = new scope.Path({insert:false,segments});
      try { if (validFit(candidate, points, false)) return toSubpaths(candidate)[0].segments; }
      finally { candidate.remove(); }
    }
    return null;
  };
  // Fit one cubic with fixed endpoint tangents. Reparameterizing by nearest
  // points avoids treating uneven polygon sample spacing as curve parameter t.
  const fitCubicWithParameters = (points, startTangent, endTangent, spacing) => {
    if (!startTangent || !endTangent) return null;
    const first=points[0], last=points.at(-1), l1=Math.hypot(...startTangent),l2=Math.hypot(...endTangent);
    if (!l1 || !l2) return null;
    const t1=startTangent.map(n=>n/l1), t2=endTangent.map(n=>n/l2);
    const lengths = [0];
    for (let i=1;i<points.length;i++) lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const weights=[0];
    for (let i=1;i<points.length;i++) weights.push(weights.at(-1)+(spacing===0?1:(lengths[i]-lengths[i-1])**spacing));
    let parameters = weights.map(n => n/weights.at(-1));
    for (let iteration=0;iteration<32;iteration++) {
      let c00=0,c01=0,c11=0,x0=0,x1=0;
      points.forEach((p,i) => {
        const t=parameters[i], s=1-t, b0=s**3, b1=3*t*s*s, b2=3*t*t*s, b3=t**3;
        const a1x=t1[0]*b1,a1y=t1[1]*b1,a2x=t2[0]*b2,a2y=t2[1]*b2;
        const rx=p[0]-first[0]*(b0+b1)-last[0]*(b2+b3), ry=p[1]-first[1]*(b0+b1)-last[1]*(b2+b3);
        c00+=a1x*a1x+a1y*a1y;c01+=a1x*a2x+a1y*a2y;c11+=a2x*a2x+a2y*a2y;
        x0+=a1x*rx+a1y*ry;x1+=a2x*rx+a2y*ry;
      });
      const determinant=c00*c11-c01*c01;
      if (Math.abs(determinant)<1e-12) return null;
      const alpha=(x0*c11-x1*c01)/determinant, beta=(x1*c00-x0*c01)/determinant;
      if (alpha<=0 || beta<=0 || Math.max(alpha,beta)>lengths.at(-1)) return null;
      const out=t1.map(n=>n*alpha), incoming=t2.map(n=>n*beta);
      const p1=first.map((n,j)=>n+out[j]),p2=last.map((n,j)=>n+incoming[j]);
      const a=first.map((n,j)=>-n+3*p1[j]-3*p2[j]+last[j]),b=first.map((n,j)=>3*n-6*p1[j]+3*p2[j]),c=first.map((n,j)=>3*(p1[j]-n));
      let maxError=0;
      const next=points.map((p,i)=>{
        const t=parameters[i];
        const dx=((a[0]*t+b[0])*t+c[0])*t+first[0]-p[0],dy=((a[1]*t+b[1])*t+c[1])*t+first[1]-p[1];
        const vx=(3*a[0]*t+2*b[0])*t+c[0],vy=(3*a[1]*t+2*b[1])*t+c[1];
        maxError=Math.max(maxError,dx*dx+dy*dy);
        const denominator=vx*vx+vy*vy+dx*(6*a[0]*t+2*b[0])+dy*(6*a[1]*t+2*b[1]);
        return denominator?Math.max(0,Math.min(1,t-(dx*vx+dy*vy)/denominator)):t;
      });
      if (maxError<=(tolerance*.75)**2) {
        const candidate=new scope.Path({insert:false,segments:[new scope.Segment(first,[0,0],out),new scope.Segment(last,incoming,[0,0])]});
        try {if (validFit(candidate,points,false)) return toSubpaths(candidate)[0].segments;}
        finally {candidate.remove();}
      }
      if (next.some((t,i)=>i && t<=next[i-1])) return null;
      parameters=next;
    }
    return null;
  };
  const fitCubic = (points,startTangent,endTangent) => {
    // Each coordinate of a cubic has at most two interior extrema. Ignore
    // reversals smaller than the error budget, but reject impossible merges
    // before running the numerical fit (especially on long S-shaped contours).
    for (let axis=0;axis<2;axis++) {
      let extreme=points[0][axis],direction=0,turns=0;
      for (let i=1;i<points.length;i++) {
        const value=points[i][axis],delta=value-extreme;
        if (!direction) {if (Math.abs(delta)>2*tolerance) {direction=Math.sign(delta);extreme=value;}}
        else if (delta*direction>=0) extreme=value;
        else if (Math.abs(delta)>2*tolerance) {if (++turns>2) return null;direction=-direction;extreme=value;}
      }
    }
    // Sampling density is not geometry: try chord, centripetal and uniform
    // seeds so sparse, eccentric and unevenly sampled curves fit equally well.
    for (const spacing of [1,.5,0]) {
      const fitted=fitCubicWithParameters(points,startTangent,endTangent,spacing);
      if (fitted) return fitted;
    }
    return null;
  };
  const tangentAt = (points, i, closed = false) => {
    const p=points[i], before=points[(i+points.length-1)%points.length], after=points[(i+1)%points.length];
    if (!closed && i===0) return after.map((n,j)=>n-p[j]);
    if (!closed && i===points.length-1) return p.map((n,j)=>n-before[j]);
    const a=Math.hypot(p[0]-before[0],p[1]-before[1]), b=Math.hypot(after[0]-p[0],after[1]-p[1]);
    return p.map((n,j)=>(n-before[j])*b/a+(after[j]-n)*a/b);
  };
  // Shortest path through ordered anchor candidates: each edge is a single
  // cubic verified against its entire source interval. Its cost is one curve.
  // Try skipping anchors and move split positions to arc-length midpoints;
  // refit handles and sample parameters for every attempted merge. This is a
  // minimum over this candidate graph, not a proof of a continuous global optimum.
  const minimizeRun = (points, initial, mandatory = []) => {
    if (initial.length<=2) return initial;
    const indices=[];
    let from=0;
    for (const segment of initial) {
      let found=-1;
      for (let i=from;i<points.length;i++) if (Math.hypot(points[i][0]-segment.p[0],points[i][1]-segment.p[1])<1e-8) {found=i;break;}
      // Analytic arc fits may introduce new anchors; those are already compact.
      if (found<0) return initial;
      indices.push(found);from=found+1;
    }
    // Reduce dense seeds in small overlapping-endpoint windows before the
    // global search. The next pass can remove these temporary window seams.
    if (initial.length>33) {
      const reduced=[];
      for(let start=0;start<initial.length-1;start+=16){
        const end=Math.min(start+16,initial.length-1),offset=indices[start];
        const fixed=mandatory.filter(i=>i>=offset&&i<=indices[end]).map(i=>i-offset);
        const fitted=structuredClone(minimizeRun(points.slice(offset,indices[end]+1),initial.slice(start,end+1),fixed));
        if(reduced.length){reduced.at(-1).out=fitted[0].out;reduced.push(...fitted.slice(1));}
        else reduced.push(...fitted);
      }
      if(reduced.length<initial.length)return minimizeRun(points,reduced,mandatory);
    }
    const lengths=[0];
    for (let i=1;i<points.length;i++) lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const candidates=new Set(indices), tangents=new Map();
    initial.forEach((s,i)=>{
      const handle=i===initial.length-1?s.in.map(n=>-n):i===0?s.out:tangentAt(points,indices[i]);
      tangents.set(indices[i],Math.hypot(...handle)>1e-9?handle:tangentAt(points,indices[i]));
      if (i) {
        const middle=(lengths[indices[i-1]]+lengths[indices[i]])/2;
        let split=indices[i-1]+1;
        while (split<indices[i] && lengths[split]<middle) split++;
        candidates.add(split);
      }
    });
    const anchors=[...candidates].sort((a,b)=>a-b), costs=Array(anchors.length).fill(Infinity), best=Array(anchors.length);
    costs[costs.length-1]=0;
    const originals=new Map(indices.slice(0,-1).map((start,i)=>[`${start}:${indices[i+1]}`,[initial[i],initial[i+1]]]));
    for (let i=anchors.length-2;i>=0;i--) {
      const stop=mandatory.find(index=>index>anchors[i])??points.length-1;
      for (let j=anchors.length-1;j>i;j--) {
        if (anchors[j]>stop) continue;
        if (1+costs[j]>=costs[i]) continue;
        const start=anchors[i],end=anchors[j],source=points.slice(start,end+1);
        const startTangent=tangents.get(start)??tangentAt(points,start), endTangent=(tangents.get(end)??tangentAt(points,end)).map(n=>-n);
        const fitted=fitCubic(source,startTangent,endTangent)??originals.get(`${start}:${end}`);
        if (fitted) {costs[i]=1+costs[j];best[i]={end:j,segments:fitted};}
        if (costs[i]===1) break;
      }
    }
    if (costs[0]>=initial.length-1) return initial;
    const segments=[];
    for (let i=0;i<anchors.length-1;) {
      const edge=best[i], fitted=structuredClone(edge.segments);
      if (segments.length) {segments.at(-1).out=fitted[0].out;segments.push(...fitted.slice(1));}
      else segments.push(...fitted);
      i=edge.end;
    }
    const candidate=new scope.Path({insert:false,segments:segments.map(s=>new scope.Segment(s.p,s.in,s.out))});
    try {return validFit(candidate,points,false)?minimizeRun(points,segments,mandatory):initial;}
    finally {candidate.remove();}
  };
  const fitRun = (points, closed, startTangent, endTangent) => {
    if (points.length === 2) return points.map(p=>({p:[...p],in:[0,0],out:[0,0]}));
    const cubic = !closed && fitCubic(points,startTangent,endTangent);
    if (cubic) return cubic;
    const arc = !closed && fitArc(points);
    if (arc) return arc;
    const original = new scope.Path({ insert: false, segments: points, closed });
    try {
      for (const error of [Math.sqrt(tolerance),tolerance*4,tolerance/2]) {
        const candidate = original.clone({ insert: false });
        try {
          candidate.simplify(error * error);
          if (candidate.segments.length < (closed ? 3 : 2)) continue;
          if (validFit(candidate, points, closed)) return toSubpaths(candidate)[0].segments;
        } finally { candidate.remove(); }
      }
      if (!closed && points.length > 4) {
        const middle=Math.floor(points.length/2),left=fitRun(points.slice(0,middle+1),false),right=fitRun(points.slice(middle),false);
        left.at(-1).out=right[0].out;
        return [...left,...right.slice(1)];
      }
      return toSubpaths(original)[0].segments;
    } finally { original.remove(); }
  };
  return subpaths.map(subpath => {
    // Existing cubics already have their editable geometry.
    if (!subpath.closed || subpath.segments.length < 4 || subpath.segments.some(s => Math.hypot(...s.in, ...s.out))) return structuredClone(subpath);
    const ring = subpath.segments.map(s => s.p).filter((p, i, all) => !i || Math.hypot(p[0]-all[i-1][0], p[1]-all[i-1][1]) > 1e-9);
    if (ring.length > 1 && Math.hypot(ring[0][0]-ring.at(-1)[0], ring[0][1]-ring.at(-1)[1]) < 1e-9) ring.pop();
    if (ring.length < 3) return structuredClone(subpath);
    const corners = ringCorners(ring, 35), sharp = new Set(corners), sideTangents = new Map();
    // Long straight sides must stop at the start/end of a rounded corner.
    // Fitting a side together with the arc gives the arc a straight endpoint
    // tangent and forces the fallback to keep many tiny curve segments.
    const lengths = ring.map((p,i) => Math.hypot(p[0]-ring[(i+1)%ring.length][0], p[1]-ring[(i+1)%ring.length][1]));
    lengths.forEach((length,i) => {
      if (length > 3*Math.max(lengths[(i+ring.length-1)%ring.length],lengths[(i+1)%ring.length])) {
        let next = (i+1)%ring.length;
        while (next !== i && lengths[next] < length/3) next = (next+1)%ring.length;
        const a = ring[i], b = ring[(i+1)%ring.length], c = ring[next], d = ring[(next+1)%ring.length];
        // Tiny round joins along a sampled smooth curve also flank long chords.
        // They are not the substantial round corners that need separate runs.
        if (((b[0]-a[0])*(d[0]-c[0])+(b[1]-a[1])*(d[1]-c[1]))/(length*lengths[next]) >= Math.cos(35*Math.PI/180)) return;
        for (const end of [i,(i+1)%ring.length]) {
          if (!corners.includes(end)) corners.push(end);
          sideTangents.set(end,b.map((n,j)=>n-a[j]));
        }
      }
    });
    corners.sort((a,b) => a-b);
    // A smooth ring's arbitrary storage seam must not become a required anchor.
    // Seed at extrema along the principal axes, so changing the storage seam,
    // sampling density or rotation does not impose arbitrary quarter anchors.
    if (!corners.length) {
      const total=lengths.reduce((a,b)=>a+b,0),centre=[0,0];
      ring.forEach((p,i)=>{const q=ring[(i+1)%ring.length];for(let j=0;j<2;j++)centre[j]+=(p[j]+q[j])*lengths[i]/(2*total);});
      let xx=0,xy=0,yy=0;
      ring.forEach((p,i)=>{
        const q=ring[(i+1)%ring.length],x=p[0]-centre[0],y=p[1]-centre[1],u=q[0]-centre[0],v=q[1]-centre[1],w=lengths[i];
        xx+=w*(x*x+x*u+u*u)/3;yy+=w*(y*y+y*v+v*v)/3;xy+=w*(2*x*y+x*v+u*y+2*u*v)/6;
      });
      const angle=Math.atan2(2*xy,xx-yy)/2,c=Math.cos(angle),s=Math.sin(angle);
      const projected=ring.map(p=>[c*(p[0]-centre[0])+s*(p[1]-centre[1]),-s*(p[0]-centre[0])+c*(p[1]-centre[1])]);
      const extrema=[0,0,0,0];
      projected.forEach((p,i)=>{
        if(p[0]<projected[extrema[0]][0])extrema[0]=i;
        if(p[1]<projected[extrema[1]][1])extrema[1]=i;
        if(p[0]>projected[extrema[2]][0])extrema[2]=i;
        if(p[1]>projected[extrema[3]][1])extrema[3]=i;
      });
      corners.push(...new Set(extrema));corners.sort((a,b)=>a-b);
      corners.push(...corners.splice(0,corners.indexOf(extrema[0])));
    }
    const segments = [];
    corners.forEach((start, k) => {
      const end = corners[(k+1)%corners.length], points = [ring[start]];
      for (let i = (start+1)%ring.length;; i = (i+1)%ring.length) {
        points.push(ring[i]); if (i === end) break;
      }
      const fitted = minimizeRun(points,fitRun(points, false,
        sharp.has(start)?null:sideTangents.get(start)??tangentAt(ring,start,true),
        sharp.has(end)?null:(sideTangents.get(end)??tangentAt(ring,end,true)).map(n=>-n)));
      if (segments.length) { segments.at(-1).out = fitted[0].out; segments.push(...fitted.slice(1)); }
      else segments.push(...fitted);
    });
    segments[0].in = segments.pop().in;
    // Extrema are fitting seeds, not compulsory anchors. Search across
    // them too, keeping only real corners and the endpoints of straight sides.
    const start=corners[0], ordered=[...ring.slice(start),...ring.slice(0,start),ring[start]];
    const mandatory=corners.filter(i=>sharp.has(i)||sideTangents.has(i)).map(i=>(i-start+ring.length)%ring.length).sort((a,b)=>a-b);
    const minimized=minimizeRun(ordered,[...segments,structuredClone(segments[0])],mandatory);
    minimized[0].in=minimized.pop().in;
    if(minimized.length<2)return structuredClone(subpath);
    const candidate=new scope.Path({insert:false,closed:true,segments:minimized.map(s=>new scope.Segment(s.p,s.in,s.out))});
    try {
      const originalArea=ring.reduce((area,p,i)=>{const q=ring[(i+1)%ring.length];return area+p[0]*q[1]-q[0]*p[1];},0);
      // A close fit must also remain a simple ring with the original winding.
      if (Math.sign(candidate.area)!==Math.sign(originalArea)||candidate.getIntersections().some(hit=>!hit.isTouching())) return structuredClone(subpath);
      return {closed:true,segments:minimized};
    } finally {candidate.remove();}
  });
}
