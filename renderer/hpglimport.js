// HP-GL/1 and common HP-GL/2 plotter commands used by laser/CAD software.
// Plotter coordinates conventionally use 1016 units/inch = 40 units/mm.

const UNITS_PER_MM = 40;
const PEN_COLORS = ["#000000", "#ff0000", "#0000ff", "#00aa00", "#aa00aa", "#00aaaa", "#ffaa00", "#555555"];
const esc = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

function numbers(value) {
  return value.trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
}

function commands(text) {
  const out = [];
  for (const chunk of text.replace(/\x03/g, ";").split(";")) {
    const re = /([A-Za-z]{2})([^A-Za-z]*)/g;
    for (let match; (match = re.exec(chunk));) out.push([match[1].toUpperCase(), match[2]]);
  }
  return out;
}

export function hpglToSvg(text) {
  let x = 0, y = 0, absolute = true, penDown = false, pen = 1;
  let active = null;
  const strokes = [];
  const all = [];
  const point = (px, py) => ({ x: px / UNITS_PER_MM, y: py / UNITS_PER_MM });
  const remember = (p) => all.push(p);
  const endStroke = () => { active = null; };
  const drawTo = (nx, ny) => {
    const from = point(x, y), to = point(nx, ny);
    if (!active) {
      active = { pen, points: [from] };
      strokes.push(active);
      remember(from);
    }
    active.points.push(to);
    remember(to);
    x = nx; y = ny;
  };
  const moveTo = (nx, ny) => { x = nx; y = ny; endStroke(); };
  const applyCoordinates = (values) => {
    for (let i = 0; i + 1 < values.length; i += 2) {
      const nx = absolute ? values[i] : x + values[i];
      const ny = absolute ? values[i + 1] : y + values[i + 1];
      penDown ? drawTo(nx, ny) : moveTo(nx, ny);
    }
  };
  const arc = (cx, cy, sweep, chord = 5) => {
    const radius = Math.hypot(x - cx, y - cy);
    if (!radius || !Number.isFinite(sweep)) return;
    const start = Math.atan2(y - cy, x - cx);
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(0.5, Math.abs(chord) || 5)));
    for (let i = 1; i <= steps; i++) {
      const angle = start + sweep * Math.PI / 180 * i / steps;
      const nx = cx + radius * Math.cos(angle), ny = cy + radius * Math.sin(angle);
      penDown ? drawTo(nx, ny) : moveTo(nx, ny);
    }
  };
  const circle = (cx, cy, radius, chord = 5) => {
    const steps = Math.max(12, Math.ceil(360 / Math.max(0.5, Math.abs(chord) || 5)));
    const stroke = { pen, points: [] };
    for (let i = 0; i <= steps; i++) {
      const angle = Math.PI * 2 * i / steps;
      const p = point(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      stroke.points.push(p);
      remember(p);
    }
    strokes.push(stroke);
    endStroke();
  };

  for (const [command, raw] of commands(text)) {
    const values = numbers(raw);
    if (command === "IN" || command === "DF") {
      x = 0; y = 0; absolute = true; penDown = false; pen = 1; endStroke();
    } else if (command === "SP") {
      pen = Math.max(1, Math.round(values[0] || 1)); endStroke();
    } else if (command === "PA" || command === "PR") {
      absolute = command === "PA";
      applyCoordinates(values);
    } else if (command === "PU" || command === "PD") {
      penDown = command === "PD";
      endStroke();
      applyCoordinates(values);
    } else if (command === "AA" && values.length >= 3) {
      arc(values[0], values[1], values[2], values[3]);
    } else if (command === "AR" && values.length >= 3) {
      arc(x + values[0], y + values[1], values[2], values[3]);
    } else if (command === "CI" && values.length) {
      // CI performs an automatic pen-down movement and restores both the
      // current position and prior pen state after drawing.
      circle(x, y, Math.abs(values[0]), values[1]);
    }
  }

  const usable = strokes.filter((stroke) => stroke.points.length > 1);
  if (!usable.length || !all.length) throw new Error("No supported HP-GL pen paths found.");
  const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
  const width = Math.max(0.001, maxX - minX), height = Math.max(0.001, maxY - minY);
  const path = usable.map((stroke) => {
    const d = stroke.points.map((p, index) => `${index ? "L" : "M"}${(p.x - minX).toFixed(3)},${(maxY - p.y).toFixed(3)}`).join(" ");
    const color = PEN_COLORS[(stroke.pen - 1) % PEN_COLORS.length];
    return `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="0.1"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(3)}mm" height="${height.toFixed(3)}mm" viewBox="0 0 ${width.toFixed(3)} ${height.toFixed(3)}">${path}</svg>`;
}
