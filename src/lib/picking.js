// Hover picking. D3 does the CPU-side math here (projection + inversion +
// great-circle visibility), scoped to spatial-grid cells near the cursor —
// the original page iterated every substation on every mousemove.
import { geoDistance } from 'd3-geo';

const PICK_RADIUS_PX = 14;

// Find the closest visible point item to (mx, my) in screen space.
// grid: SpatialGrid; projection: the live D3 projection; layersOn: which
// kinds are pickable (kind -> boolean); isGlobe: hemisphere test needed.
export function pick(grid, projection, mx, my, layersOn, isGlobe, viewport) {
  const geo = projection.invert ? projection.invert([mx, my]) : null;
  if (!geo || !isFinite(geo[0]) || !isFinite(geo[1])) return null;

  // convert the pixel radius to a generous degree radius for the cell query
  const degPerPx = 180 / (Math.PI * projection.scale());
  const radiusDeg = Math.max(PICK_RADIUS_PX * degPerPx * 2, 1);

  const center = isGlobe
    ? projection.invert([viewport[0] / 2, viewport[1] / 2])
    : null;

  // Reject hidden layers inside the cell walk, so points on an off layer never
  // reach the projection math below.
  const accept = (item) => layersOn[item.kind] === true;
  const candidates = grid.near(geo[1], geo[0], radiusDeg, [], accept);

  let closest = null;
  let best = PICK_RADIUS_PX;
  for (const item of candidates) {
    const pos = projection([item.lon, item.lat]);
    if (!pos) continue;
    if (center && geoDistance([item.lon, item.lat], center) > Math.PI / 2) continue;
    const d = Math.hypot(pos[0] - mx, pos[1] - my);
    if (d < best) {
      best = d;
      closest = item;
    }
  }
  return closest;
}

// Which boundary area sits under the cursor. Points are tested first by the
// caller and win ties: a substation is a 3px target the user aimed at, while an
// area is whatever happens to be underneath, so letting a continent-sized
// polygon outrank a dot would make the dots unhoverable.
export function pickArea(index, projection, mx, my, layersOn, isGlobe, viewport) {
  if (!index || !index.count) return null;
  const geo = projection.invert ? projection.invert([mx, my]) : null;
  if (!geo || !isFinite(geo[0]) || !isFinite(geo[1])) return null;

  // Off the globe's near hemisphere, invert() still returns a coordinate — the
  // far-side point that projects to the same pixel. Without this the cursor
  // would hover regions hidden behind the planet.
  if (isGlobe) {
    const center = projection.invert([viewport[0] / 2, viewport[1] / 2]);
    if (center && geoDistance(geo, center) > Math.PI / 2) return null;
  }
  return index.hit(geo[0], geo[1], (a) => layersOn[a.kind] === true);
}
