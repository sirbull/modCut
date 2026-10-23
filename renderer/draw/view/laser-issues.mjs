/** User-facing explanations for unresolved Laser Preview output. No document writes. */
export function laserIssueAdvice(reason) {
  if (reason === 'clipped-image-transfer')
    return 'Cut receives the whole image outside its clipping mask. Review the image in Cut.';
  if (reason === 'clipped-stroke-transfer')
    return 'Cut clips the path before applying stroke width. Engraving can extend outside the mask. Review it in Cut.';
  if (reason === 'clipped-vector-transfer')
    return 'Clipped path boundaries or text may transfer differently. Review the final paths in Cut.';
  if (['missing-process-settings','missing-process-layer','missing-output-setting','inconsistent-global-operation','invalid-operation'].includes(reason))
    return 'Choose an operation in Laser processes, then review its settings in Cut.';
  if (reason === 'expand-appearance')
    return 'Expand the appearance on a copy, or review this effect in Cut.';
  if (reason === 'expand-stroke')
    return 'Expand the stroke on a copy, or review its engraving in Cut.';
  if (reason === 'outline-transfer')
    return 'An earlier transfer used Outline Stroke. Review that output in Cut before updating.';
  if (reason === 'text-layout')
    return 'Resolve missing fonts or text overflow before sending to Cut.';
  if (reason === 'raster-dither')
    return 'Review image dithering in Cut. Laser Preview only supports Grayscale.';
  return 'Review this object in Cut before running the job.';
}

export function laserPreviewIssues(doc, resolve) {
  return doc.descendants(null).flatMap(node => {
    const intent = resolve(node.id);
    return intent.status === 'unresolved'
      ? [{id:node.id,name:node.name || node.type,advice:laserIssueAdvice(intent.reason)}] : [];
  });
}
