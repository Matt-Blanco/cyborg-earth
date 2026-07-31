import { CELL_SIZE } from './config.js';

// 5°×5° bucket index over point features (reactors, substations, plants).
// Rendering no longer needs culling (the GPU draws everything), so this
// exists purely to make hover picking O(nearby) instead of O(all points).
export class SpatialGrid {
  constructor() {
    this.cells = new Map();
  }

  _key(lat, lon) {
    return (
      Math.floor(lat / CELL_SIZE) * CELL_SIZE + ',' + Math.floor(lon / CELL_SIZE) * CELL_SIZE
    );
  }

  insert(item) {
    const k = this._key(item.lat, item.lon);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(item);
  }

  // All items within roughly ±radiusDeg of (lat, lon).
  near(lat, lon, radiusDeg) {
    const out = [];
    const lonRadius = radiusDeg / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
    const lat0 = Math.floor((lat - radiusDeg) / CELL_SIZE) * CELL_SIZE;
    const lat1 = Math.floor((lat + radiusDeg) / CELL_SIZE) * CELL_SIZE;
    const lon0 = Math.floor((lon - lonRadius) / CELL_SIZE) * CELL_SIZE;
    const lon1 = Math.floor((lon + lonRadius) / CELL_SIZE) * CELL_SIZE;
    for (let la = lat0; la <= lat1; la += CELL_SIZE) {
      for (let lo = lon0; lo <= lon1; lo += CELL_SIZE) {
        // wrap longitude buckets across the antimeridian
        let wlo = lo;
        if (wlo < -180) wlo += 360;
        else if (wlo >= 180) wlo -= 360;
        const cell = this.cells.get(la + ',' + Math.floor(wlo / CELL_SIZE) * CELL_SIZE);
        if (cell) out.push(...cell);
      }
    }
    return out;
  }
}
