// Minimal DXF -> SVG bridge for common 2D laser files.
// Supports LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC and ELLIPSE.

const ACI = {
  1: "#ff0000", 2: "#ffff00", 3: "#00aa00", 4: "#00aaaa",
  5: "#0000ff", 6: "#aa00aa", 7: "#000000", 8: "#555555", 9: "#999999",
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;

function pairs(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([lines[i].trim(), lines[i + 1].trim()]);
  return out;
}

function unitsScale(ps) {
  for (let i = 0; i < ps.length - 1; i++) {
    if (ps[i][0] === "9" && ps[i][1] === "$INSUNITS") {
      const u = num(ps[i + 1][1], 4);
      return ({ 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000 }[u]) || 1;
    }
  }
  return 1;
}

function colorOf(ent) {
  const trueColor = ent.find((p) => p[0] === "420");
  if (trueColor) return "#" + (num(trueColor[1]) & 0xffffff).toString(16).padStart(6, "0");
  const aci = ent.find((p) => p[0] === "62");
  return ACI[Math.abs(num(aci?.[1], 7))] || "#000000";
}

function val(ent, code, fallback = 0) {
  const p = ent.find((x) => x[0] === String(code));
  return p ? num(p[1], fallback) : fallback;
}

function vertices(ent) {
  const xs = ent.filter((p) => p[0] === "10").map((p) => num(p[1]));
  const ys = ent.filter((p) => p[0] === "20").map((p) => num(p[1]));
  return xs.slice(0, Math.min(xs.length, ys.length)).map((x, i) => ({ x, y: ys[i] }));
}

function arcPoints(cx, cy, r, a0, a1) {
  const p = (a) => ({ x: cx + r * Math.cos(a * Math.PI / 180), y: cy + r * Math.sin(a * Math.PI / 180) });
  return [p(a0), p(a1)];
}

function ellipsePoints(ent) {
  const cx = val(ent, 10), cy = val(ent, 20);
  const mx = val(ent, 11), my = val(ent, 21);
  const ratio = Math.max(0.0001, val(ent, 40, 1));
  const a0 = val(ent, 41, 0), a1 = val(ent, 42, Math.PI * 2);
  const steps = 72;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (a1 - a0) * (i / steps);
    pts.push({ x: cx + mx * Math.cos(t) - my * ratio * Math.sin(t), y: cy + my * Math.cos(t) + mx * ratio * Math.sin(t) });
  }
  return pts;
}

function collectEntities(ps) {
  const entities = [];
  let inEntities = false;
  for (let i = 0; i < ps.length; i++) {
    const [code, value] = ps[i];
    if (code === "0" && value === "SECTION" && ps[i + 1]?.[1] === "ENTITIES") { inEntities = true; i++; continue; }
    if (code === "0" && value === "ENDSEC") inEntities = false;
    if (!inEntities || code !== "0") continue;
    if (value === "POLYLINE") {
      const ent = [[code, value]];
      const verts = [];
      for (i++; i < ps.length; i++) {
        if (ps[i][0] === "0" && ps[i][1] === "SEQEND") break;
        if (ps[i][0] === "0" && ps[i][1] === "VERTEX") {
          const v = [];
          for (i++; i < ps.length && ps[i][0] !== "0"; i++) v.push(ps[i]);
          verts.push({ x: val(v, 10), y: val(v, 20) });
          i--;
        } else ent.push(ps[i]);
      }
      entities.push({ type: "POLYLINE", ent, verts });
      continue;
    }
    const ent = [[code, value]];
    for (i++; i < ps.length && ps[i][0] !== "0"; i++) ent.push(ps[i]);
    i--;
    entities.push({ type: value, ent });
  }
  return entities;
}

export function dxfToSvg(text) {
  const ps = pairs(text);
  const scale = unitsScale(ps);
  const raw = [];
  const bounds = [];
  const addPoint = (p) => bounds.push({ x: p.x * scale, y: p.y * scale });
  for (const item of collectEntities(ps)) {
    const ent = item.ent;
    const color = colorOf(ent);
    if (item.type === "LINE") {
      const a = { x: val(ent, 10), y: val(ent, 20) }, b = { x: val(ent, 11), y: val(ent, 21) };
      addPoint(a); addPoint(b); raw.push({ type: "line", a, b, color });
    } else if (item.type === "LWPOLYLINE") {
      const pts = vertices(ent); pts.forEach(addPoint);
      raw.push({ type: "poly", pts, closed: (val(ent, 70) & 1) === 1, color });
    } else if (item.type === "POLYLINE") {
      item.verts.forEach(addPoint);
      raw.push({ type: "poly", pts: item.verts, closed: (val(ent, 70) & 1) === 1, color });
    } else if (item.type === "CIRCLE") {
      const c = { x: val(ent, 10), y: val(ent, 20) }, r = val(ent, 40);
      addPoint({ x: c.x - r, y: c.y - r }); addPoint({ x: c.x + r, y: c.y + r });
      raw.push({ type: "circle", c, r, color });
    } else if (item.type === "ARC") {
      const c = { x: val(ent, 10), y: val(ent, 20) }, r = val(ent, 40), a0 = val(ent, 50), a1 = val(ent, 51);
      const pts = arcPoints(c.x, c.y, r, a0, a1);
      addPoint({ x: c.x - r, y: c.y - r }); addPoint({ x: c.x + r, y: c.y + r });
      raw.push({ type: "arc", c, r, a0, a1, pts, color });
    } else if (item.type === "ELLIPSE") {
      const pts = ellipsePoints(ent); pts.forEach(addPoint);
      raw.push({ type: "poly", pts, closed: true, color });
    }
  }
  if (!bounds.length) throw new Error("No supported 2D DXF entities found.");
  const xs = bounds.map((p) => p.x), ys = bounds.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(0.001, maxX - minX), h = Math.max(0.001, maxY - minY);
  const tx = (x) => (x * scale - minX).toFixed(3);
  const ty = (y) => (maxY - y * scale).toFixed(3);
  const parts = raw.map((it) => {
    const stroke = `stroke="${esc(it.color)}" stroke-width="0.1" fill="none"`;
    if (it.type === "line") return `<line x1="${tx(it.a.x)}" y1="${ty(it.a.y)}" x2="${tx(it.b.x)}" y2="${ty(it.b.y)}" ${stroke}/>`;
    if (it.type === "circle") return `<circle cx="${tx(it.c.x)}" cy="${ty(it.c.y)}" r="${(it.r * scale).toFixed(3)}" ${stroke}/>`;
    if (it.type === "arc") {
      const [a, b] = it.pts;
      const delta = ((it.a1 - it.a0) % 360 + 360) % 360;
      return `<path d="M ${tx(a.x)} ${ty(a.y)} A ${(it.r * scale).toFixed(3)} ${(it.r * scale).toFixed(3)} 0 ${delta > 180 ? 1 : 0} 0 ${tx(b.x)} ${ty(b.y)}" ${stroke}/>`;
    }
    const pts = it.pts.map((p) => `${tx(p.x)},${ty(p.y)}`).join(" ");
    return it.closed ? `<polygon points="${pts}" ${stroke}/>` : `<polyline points="${pts}" ${stroke}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}">${parts.join("")}</svg>`;
}
