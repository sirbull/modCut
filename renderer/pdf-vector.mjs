const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
const MM_PER_POINT = 25.4 / 72;

const multiply = (left, right) => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];

const number = (value) => Number(Number(value).toFixed(5));
const matrixValue = (matrix) => matrix.map(number).join(" ");
const escapeAttribute = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

function pathData(buffer) {
  if (!buffer?.length) return null;
  const out = [];
  for (let index = 0; index < buffer.length;) {
    const command = buffer[index++];
    if (command === 0 || command === 1) {
      if (index + 1 >= buffer.length) return null;
      out.push(`${command === 0 ? "M" : "L"}${number(buffer[index++])} ${number(buffer[index++])}`);
    } else if (command === 2) {
      if (index + 5 >= buffer.length) return null;
      out.push(`C${number(buffer[index++])} ${number(buffer[index++])} ${number(buffer[index++])} ${number(buffer[index++])} ${number(buffer[index++])} ${number(buffer[index++])}`);
    } else if (command === 3) {
      if (index + 3 >= buffer.length) return null;
      out.push(`Q${number(buffer[index++])} ${number(buffer[index++])} ${number(buffer[index++])} ${number(buffer[index++])}`);
    } else if (command === 4) {
      out.push("Z");
    } else return null;
  }
  return out.join(" ");
}

function initialState() {
  return {
    ctm: [...IDENTITY],
    lineWidth: 1,
    lineCap: 0,
    lineJoin: 0,
    miterLimit: 10,
    dash: [],
    dashOffset: 0,
    stroke: "#000000",
    fill: "#000000",
    strokeAlpha: 1,
    fillAlpha: 1,
    strokePattern: false,
    fillPattern: false,
    clipped: false,
    pendingClip: false,
    unsupportedEffect: false,
  };
}

function cloneState(state) {
  return { ...state, ctm: [...state.ctm], dash: [...state.dash] };
}

function applyGState(state, entries = []) {
  for (const [key, value] of entries) {
    if (key === "LW") state.lineWidth = Math.abs(Number(value) || 0);
    else if (key === "LC") state.lineCap = Number(value) || 0;
    else if (key === "LJ") state.lineJoin = Number(value) || 0;
    else if (key === "ML") state.miterLimit = Number(value) || 10;
    else if (key === "D") { state.dash = Array.from(value?.[0] || []); state.dashOffset = Number(value?.[1]) || 0; }
    else if (key === "CA") state.strokeAlpha = Number(value);
    else if (key === "ca") state.fillAlpha = Number(value);
    else if (key === "BM" && value !== "source-over" && value !== "Normal") state.unsupportedEffect = true;
    else if (key === "SMask" && value) state.unsupportedEffect = true;
  }
}

function pathStyle(state, paintOp, OPS) {
  const strokes = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fills = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const evenOdd = new Set([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke]);
  const wantsStroke = strokes.has(paintOp);
  const wantsFill = fills.has(paintOp);
  if (!wantsStroke && !wantsFill) return null;
  if ((wantsStroke && state.strokePattern) || (wantsFill && state.fillPattern) || state.clipped || state.unsupportedEffect) return { extractable: false, visible: true };
  const strokeVisible = wantsStroke && state.stroke !== "none" && state.strokeAlpha > 0;
  const fillVisible = wantsFill && state.fill !== "none" && state.fillAlpha > 0;
  if (!strokeVisible && !fillVisible) return { extractable: false, visible: false };
  const attributes = [
    `fill="${fillVisible ? escapeAttribute(state.fill) : "none"}"`,
    `stroke="${strokeVisible ? escapeAttribute(state.stroke) : "none"}"`,
  ];
  if (fillVisible && evenOdd.has(paintOp)) attributes.push('fill-rule="evenodd"');
  if (fillVisible && state.fillAlpha < 1) attributes.push(`fill-opacity="${number(state.fillAlpha)}"`);
  if (strokeVisible) {
    attributes.push(`stroke-width="${number(state.lineWidth)}"`);
    attributes.push(`stroke-linecap="${["butt", "round", "square"][state.lineCap] || "butt"}"`);
    attributes.push(`stroke-linejoin="${["miter", "round", "bevel"][state.lineJoin] || "miter"}"`);
    attributes.push(`stroke-miterlimit="${number(state.miterLimit)}"`);
    if (state.strokeAlpha < 1) attributes.push(`stroke-opacity="${number(state.strokeAlpha)}"`);
    if (state.dash.length) {
      attributes.push(`stroke-dasharray="${state.dash.map(number).join(" ")}"`);
      attributes.push(`stroke-dashoffset="${number(state.dashOffset)}"`);
    }
  }
  return {
    extractable: true,
    visible: true,
    attributes: attributes.join(" "),
    fillVisible,
    strokeVisible,
    fillRule: fillVisible && evenOdd.has(paintOp) ? "evenodd" : "nonzero",
    lineWidth: state.lineWidth,
    lineCap: ["butt", "round", "square"][state.lineCap] || "butt",
    lineJoin: ["miter", "round", "bevel"][state.lineJoin] || "miter",
    miterLimit: state.miterLimit,
    dash: [...state.dash],
    dashOffset: state.dashOffset,
  };
}

export function extractPdfVectors(operatorList, viewport, OPS) {
  const stack = [];
  let state = initialState();
  const paths = [];
  const rasterMasks = [];
  const extractedIndexes = new Set();
  let hasRasterContent = false;
  const rasterPaintOps = new Set([
    OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText,
    OPS.shadingFill, OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectGroup,
    OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintInlineImageXObjectGroup,
    OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintSolidColorImageMask,
    OPS.rawFillPath,
  ].filter(Number.isFinite));

  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const operation = operatorList.fnArray[index];
    const args = operatorList.argsArray[index] || [];
    if (operation === OPS.save) stack.push(cloneState(state));
    else if (operation === OPS.restore) state = stack.pop() || initialState();
    else if (operation === OPS.transform) state.ctm = multiply(state.ctm, args);
    else if (operation === OPS.setLineWidth) state.lineWidth = Math.abs(Number(args[0]) || 0);
    else if (operation === OPS.setLineCap) state.lineCap = Number(args[0]) || 0;
    else if (operation === OPS.setLineJoin) state.lineJoin = Number(args[0]) || 0;
    else if (operation === OPS.setMiterLimit) state.miterLimit = Number(args[0]) || 10;
    else if (operation === OPS.setDash) { state.dash = Array.from(args[0] || []); state.dashOffset = Number(args[1]) || 0; }
    else if (operation === OPS.setGState) applyGState(state, args[0]);
    else if (operation === OPS.setStrokeRGBColor) { state.stroke = args[0]; state.strokePattern = false; }
    else if (operation === OPS.setFillRGBColor) { state.fill = args[0]; state.fillPattern = false; }
    else if (operation === OPS.setStrokeTransparent) { state.stroke = "none"; state.strokePattern = false; }
    else if (operation === OPS.setFillTransparent) { state.fill = "none"; state.fillPattern = false; }
    else if (operation === OPS.setStrokeColorN) state.strokePattern = true;
    else if (operation === OPS.setFillColorN) state.fillPattern = true;
    else if (operation === OPS.clip || operation === OPS.eoClip) state.pendingClip = true;
    else if (operation === OPS.constructPath) {
      const [paintOp, [buffer]] = args;
      const style = buffer?.length ? pathStyle(state, paintOp, OPS) : null;
      if (style?.visible) {
        const d = style.extractable ? pathData(buffer) : null;
        if (d) {
          const transform = multiply(viewport.transform || IDENTITY, state.ctm);
          paths.push(`<path d="${d}" transform="matrix(${matrixValue(transform)})" ${style.attributes}/>`);
          rasterMasks.push({
            commands: Array.from(buffer), transform,
            fill: style.fillVisible, stroke: style.strokeVisible, fillRule: style.fillRule,
            lineWidth: style.lineWidth, lineCap: style.lineCap, lineJoin: style.lineJoin,
            miterLimit: style.miterLimit, dash: style.dash, dashOffset: style.dashOffset,
          });
          extractedIndexes.add(index);
        } else hasRasterContent = true;
      }
      if (state.pendingClip) { state.clipped = true; state.pendingClip = false; }
    } else if (rasterPaintOps.has(operation)) hasRasterContent = true;
  }

  const widthMm = viewport.width * MM_PER_POINT;
  const heightMm = viewport.height * MM_PER_POINT;
  const svgText = paths.length
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${number(widthMm)}mm" height="${number(heightMm)}mm" viewBox="0 0 ${number(viewport.width)} ${number(viewport.height)}">${paths.join("")}</svg>`
    : null;
  return { svgText, vectorPathCount: paths.length, extractedIndexes, rasterMasks, hasRasterContent, widthMm, heightMm };
}
