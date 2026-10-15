/** Pure arrowhead geometry at an open path end. `tangent` points outward from the path. */
export function arrowShapes(point, tangent, width, arrow) {
  const length = Math.hypot(...tangent);
  if (!arrow || !(length > 0)) return [];
  const [tx, ty] = tangent.map((v) => v / length), nx = -ty, ny = tx;
  const size = Math.max(width, 0.05) * 4 * arrow.scale, at = (along, across) => [point[0] + tx * along + nx * across, point[1] + ty * along + ny * across];
  // The tip extends beyond the path end, as Illustrator's default arrow placement.
  if (arrow.type === 'triangle') return [{ kind: 'polygon', points: [at(size * .5, 0), at(-size * .5, size * .45), at(-size * .5, -size * .45)] }];
  if (arrow.type === 'arrow') return [{ kind: 'polyline', points: [at(-size * .5, size * .45), at(size * .5, 0), at(-size * .5, -size * .45)] }];
  if (arrow.type === 'circle') return [{ kind: 'circle', center: point, radius: size * .35 }];
  if (arrow.type === 'square') return [{ kind: 'polygon', points: [at(size * .3, size * .3), at(size * .3, -size * .3), at(-size * .3, -size * .3), at(-size * .3, size * .3)] }];
  if (arrow.type === 'bar') return [{ kind: 'polyline', points: [at(0, size * .5), at(0, -size * .5)] }];
  throw new Error(`Unknown arrowhead: ${arrow.type}`);
}
