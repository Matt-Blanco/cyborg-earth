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
