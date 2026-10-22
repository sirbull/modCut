import { ringCorners } from './trace.mjs';
import { toSubpaths } from './pathfinder.mjs';

/** Fit sampled stroke boundaries with cubic handles, keeping corners and ring winding.
 * Paper's fitting error is squared. Verify both directions against the original
 * polyline as well: fitting only its vertices can bow across a thin stroke or gap.
 * Call in the caller's Paper scope; temporary paths never enter the document.
 */
export function fitOutline(scope, subpaths, tolerance = .01) {
  const distanceToPolyline = (p,points,closed) => {
    let best=Infinity;
    for(let i=0;i<points.length-(closed?0:1);i++){
      const a=points[i],b=points[(i+1)%points.length],x=b[0]-a[0],y=b[1]-a[1],length=x*x+y*y;
      const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/length)):0;
      best=Math.min(best,Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y));
    }
    return best;
  };
  const fitRun = (points, closed) => {
    if (points.length === 2) return points.map(p=>({p:[...p],in:[0,0],out:[0,0]}));
    const original = new scope.Path({ insert: false, segments: points, closed });
    try {
      for (const error of [Math.sqrt(tolerance),tolerance*4,tolerance/2]) {
        const candidate = original.clone({ insert: false });
        try {
          candidate.simplify(error * error);
          if (candidate.segments.length < (closed ? 3 : 2)) continue;
          // Sample each cubic adaptively, including its interior extrema.
          const sample = candidate.clone({ insert: false });
          let valid;
          try {
            sample.flatten(tolerance / 4);
            const flattened=sample.segments.map(s=>[s.point.x,s.point.y]);
            valid = flattened.every(p => distanceToPolyline(p,points,closed) <= tolerance*.75)
              && points.every(p => distanceToPolyline(p,flattened,closed) <= tolerance*.75);
          } finally { sample.remove(); }
          if (valid) return toSubpaths(candidate)[0].segments;
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
    const corners = ringCorners(ring, 35);
    // A fully smooth ring still needs fixed endpoints. Paper's closed fitter can
    // cut across its seam regardless of tolerance. Four open runs avoid that.
    if (!corners.length) for(let i=0;i<4;i++)corners.push(Math.floor(i*ring.length/4));
    const segments = [];
    corners.forEach((start, k) => {
      const end = corners[(k+1)%corners.length], points = [ring[start]];
      for (let i = (start+1)%ring.length;; i = (i+1)%ring.length) {
        points.push(ring[i]); if (i === end) break;
      }
      const fitted = fitRun(points, false);
      if (segments.length) { segments.at(-1).out = fitted[0].out; segments.push(...fitted.slice(1)); }
      else segments.push(...fitted);
    });
    segments[0].in = segments.pop().in;
    return { closed: true, segments };
  });
}
