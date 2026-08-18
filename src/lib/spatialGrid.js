import { CELL_SIZE } from './config.js';

// 5°×5° bucket index over hoverable point features (reactors, substations,
// plants, notable rail/telecom nodes). Rendering no longer needs culling (the
// GPU draws everything), so this exists purely to make hover picking
// O(nearby) instead of O(all points).
export class SpatialGrid {
  constructor() {
    this.cells = new Map();
  }

  _bucket(v) {
    return Math.floor(v / CELL_SIZE) * CELL_SIZE;
  }

  insert(item) {
    const k = this._bucket(item.lat) + ',' + this._bucket(item.lon);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(item);
  }

  // Items within roughly ±radiusDeg of (lat, lon), appended to `out`. Callers
  // pass `accept` so items on hidden layers are rejected here rather than
  // materialised into an array first.
  near(lat, lon, radiusDeg, out = [], accept = null) {
    const size = CELL_SIZE;
    const lonRadius = radiusDeg / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
    const lat0 = this._bucket(lat - radiusDeg);
    const lat1 = this._bucket(lat + radiusDeg);
    const lon0 = this._bucket(lon - lonRadius);
    const lon1 = this._bucket(lon + lonRadius);
    for (let la = lat0; la <= lat1; la += size) {
      for (let lo = lon0; lo <= lon1; lo += size) {
        // wrap longitude buckets across the antimeridian
        let wlo = lo;
        if (wlo < -180) wlo += 360;
        else if (wlo >= 180) wlo -= 360;
        const cell = this.cells.get(la + ',' + this._bucket(wlo));
        if (!cell) continue;
        for (const item of cell) {
          if (!accept || accept(item)) out.push(item);
        }
      }
    }
    return out;
  }
}

// Even-odd ray cast. Rings are [[lon, lat], ...] in degrees.
function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Inside the outer ring and outside every hole.
function pointInFrame(rings, x, y) {
  if (!pointInRing(rings[0], x, y)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(rings[i], x, y)) return false;
  }
  return true;
}

function pointInArea(area, x, y) {
  if (!area.wrapped) return pointInFrame(area.rings, x, y);
  // A seam-crossing ring was unwrapped at load into a continuous frame that may
  // sit past +180 or before -180 (175..185, or -185..-175). The cursor's
  // longitude always arrives in [-180, 180], so try it in each frame.
  return (
    pointInFrame(area.rings, x, y) ||
    pointInFrame(area.rings, x + 360, y) ||
    pointInFrame(area.rings, x - 360, y)
  );
}

// Bucket index over boundary polygons, on the same 5° grid as SpatialGrid.
//
// Points and areas need different indexes: a point lives in exactly one cell,
// while an area covers every cell its bounding box touches, and answering
// "which region is under the cursor" is containment, not proximity. Binning by
// bbox turns the hover into a ray cast against a handful of candidates instead
// of every boundary on Earth.
export class AreaIndex {
  constructor() {
    this.cells = new Map();
    this.count = 0;
  }

  _bucket(v) {
    return Math.floor(v / CELL_SIZE) * CELL_SIZE;
  }

  _put(la, lo, area) {
    const k = la + ',' + lo;
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(area);
  }

  // area: { rings, wrapped, lonMin, lonMax, latMin, latMax, size, kind, ... }
  // Bounds are in the area's own (possibly unwrapped) longitude frame, so the
  // range may run past ±180; each bucket key is wrapped back into [-180, 180)
  // to match the frame incoming queries use.
  insert(area) {
    this.count++;
    const size = CELL_SIZE;
    const lat0 = this._bucket(Math.max(area.latMin, -90));
    const lat1 = this._bucket(Math.min(area.latMax, 90));
    const lon0 = this._bucket(area.lonMin);
    const lon1 = this._bucket(area.lonMax);
    for (let la = lat0; la <= lat1; la += size) {
      for (let lo = lon0; lo <= lon1; lo += size) {
        let wlo = lo;
        if (wlo < -180) wlo += 360;
        else if (wlo >= 180) wlo -= 360;
        this._put(la, this._bucket(wlo), area);
      }
    }
  }

  // The smallest area containing (lon, lat), so a forest inside a national park
  // reports the forest. `accept` rejects hidden layers before any ray cast.
  hit(lon, lat, accept = null) {
    // Normalise into [-180, 180) exactly as insert() keys its buckets —
    // otherwise a cursor on the antimeridian itself looks up bucket 180 while
    // the areas there were filed under -180.
    if (lon >= 180) lon -= 360;
    else if (lon < -180) lon += 360;
    const cell = this.cells.get(this._bucket(lat) + ',' + this._bucket(lon));
    if (!cell) return null;
    let best = null;
    for (const area of cell) {
      if (accept && !accept(area)) continue;
      if (best && area.size >= best.size) continue;
      if (pointInArea(area, lon, lat)) best = area;
    }
    return best;
  }
}
