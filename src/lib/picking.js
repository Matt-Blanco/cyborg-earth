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

// Tooltip rows for a picked item — mirrors the original tooltip markup.
export function tooltipContent(item, reactorColorFn) {
  if (item.kind === 'reactor') {
    const rows = [{ label: 'Status', value: item.status, color: reactorColorFn(item.status) }];
    if (item.type) rows.push({ label: 'Type', value: item.type });
    if (item.model) rows.push({ label: 'Model', value: item.model });
    if (item.capacity) rows.push({ label: 'Capacity', value: `${item.capacity} MWe` });
    return { name: item.name, subtitle: item.country, rows };
  }
  if (item.kind === 'substation') {
    return {
      name: item.name,
      subtitle: 'Substation',
      rows: item.voltage ? [{ label: 'Voltage', value: item.voltage }] : [],
    };
  }
  // Tagged features have no name of their own — the humanised tag value is the
  // heading, and the subtitle names the network it belongs to.
  if (item.kind === 'railNode') {
    return { name: item.name, subtitle: 'Railway', rows: [] };
  }
  if (item.kind === 'telecomPoint') {
    return { name: item.name, subtitle: 'Telecom', rows: [] };
  }
  const rows = [];
  if (item.source) rows.push({ label: 'Source', value: item.source });
  if (item.mw) rows.push({ label: 'Output', value: item.mw });
  return { name: item.name, subtitle: 'Power Plant', rows };
}
