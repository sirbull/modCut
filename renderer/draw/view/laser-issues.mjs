/** User-facing explanations for unresolved Laser Preview output. No document writes. */
export function laserIssueAdvice(reason) {
  if (['missing-process-settings','missing-process-layer','missing-output-setting','inconsistent-global-operation','invalid-operation'].includes(reason))
    return 'Choose an operation in Laser processes, then review its settings in Cut.';
  if (reason === 'expand-appearance')
    return 'Expand the appearance on a copy, or review this effect in Cut.';
  if (reason === 'expand-stroke')
    return 'Expand the stroke on a copy, or review its engraving in Cut.';
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
