// CPU-side geometry preparation. Everything is built once at load time and
// uploaded to GPU buffers; nothing here runs during pan/rotate.
//
// Vertex layout for "geo" line/triangle buffers (interleaved):
//   [posLon, posLat, refLon, refLat]  — normalized (lon/180, lat/90)
// where ref is the segment midpoint / triangle centroid used for
// antimeridian unwrapping in the vertex shader.
import earcut from 'earcut';

const NX = 1 / 180; // lon -> normalized
const NY = 1 / 90;  // lat -> normalized

// Midpoint of two lon/lat points that is wrap-safe across the antimeridian.
function midLon(a, b) {
  let m = (a + b) / 2;
  if (Math.abs(a - b) > 180) m += m > 0 ? -180 : 180;
  return m;
}

// --- Line segments ---------------------------------------------------------

// Count output segments for a polyline given a subdivision limit (degrees).
function countSegs(coords, maxDeg) {
  let n = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = Math.abs(coords[i][0] - coords[i + 1][0]);
    const dy = Math.abs(coords[i][1] - coords[i + 1][1]);
    const span = Math.max(dx > 180 ? 360 - dx : dx, dy);
    n += maxDeg > 0 ? Math.max(1, Math.ceil(span / maxDeg)) : 1;
  }
  return n;
}

function writeSeg(out, o, x0, y0, x1, y1) {
  const mx = midLon(x0, x1) * NX;
  const my = ((y0 + y1) / 2) * NY;
  out[o] = x0 * NX; out[o + 1] = y0 * NY; out[o + 2] = mx; out[o + 3] = my;
  out[o + 4] = x1 * NX; out[o + 5] = y1 * NY; out[o + 6] = mx; out[o + 7] = my;
  return o + 8;
}

// Build a Float32 segment buffer from an array of polylines
// (each polyline = [[lon,lat], ...]). maxDeg > 0 subdivides long edges so
// horizon clipping and seam handling stay accurate.
export function segmentBuffer(polylines, maxDeg = 0) {
  let total = 0;
  for (const line of polylines) total += countSegs(line, maxDeg);
  const out = new Float32Array(total * 8);
  let o = 0;
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, y0] = line[i];
      const [x1, y1] = line[i + 1];
      const dx = Math.abs(x0 - x1);
      const span = Math.max(dx > 180 ? 360 - dx : dx, Math.abs(y0 - y1));
      const parts = maxDeg > 0 ? Math.max(1, Math.ceil(span / maxDeg)) : 1;
      if (parts === 1) {
        o = writeSeg(out, o, x0, y0, x1, y1);
      } else {
        // linear subdivision in lon/lat (wrap-safe)
        let ddx = x1 - x0;
        if (ddx > 180) ddx -= 360;
        else if (ddx < -180) ddx += 360;
        const ddy = y1 - y0;
        for (let p = 0; p < parts; p++) {
          let ax = x0 + (ddx * p) / parts;
          let bx = x0 + (ddx * (p + 1)) / parts;
          if (ax > 180) ax -= 360; else if (ax < -180) ax += 360;
          if (bx > 180) bx -= 360; else if (bx < -180) bx += 360;
          o = writeSeg(out, o, ax, y0 + (ddy * p) / parts, bx, y0 + (ddy * (p + 1)) / parts);
        }
      }
    }
  }
  return { data: out, vertexCount: total * 2 };
}

// --- Country fills ---------------------------------------------------------

// Triangulate GeoJSON (Multi)Polygons with earcut, then recursively split
// triangles whose edges exceed maxDeg. Small triangles keep the interpolated
// horizon clip (vClip) and seam unwrap accurate on the globe.
export function triangulateCountries(features, maxDeg = 4) {
  const tris = []; // flat [x0,y0,x1,y1,x2,y2, ...] in degrees

  const emit = (ax, ay, bx, by, cx, cy) => {
    const eab = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    const ebc = Math.max(Math.abs(bx - cx), Math.abs(by - cy));
    const eca = Math.max(Math.abs(cx - ax), Math.abs(cy - ay));
    const longest = Math.max(eab, ebc, eca);
    if (longest <= maxDeg) {
      tris.push(ax, ay, bx, by, cx, cy);
      return;
    }
    // split the longest edge at its midpoint
    if (eab === longest) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      emit(ax, ay, mx, my, cx, cy);
      emit(mx, my, bx, by, cx, cy);
    } else if (ebc === longest) {
      const mx = (bx + cx) / 2, my = (by + cy) / 2;
      emit(ax, ay, bx, by, mx, my);
      emit(ax, ay, mx, my, cx, cy);
    } else {
      const mx = (cx + ax) / 2, my = (cy + ay) / 2;
      emit(mx, my, bx, by, cx, cy);
      emit(ax, ay, bx, by, mx, my);
    }
  };

  const addPolygon = (rings) => {
    const flat = [];
    const holes = [];
    for (let r = 0; r < rings.length; r++) {
      if (r > 0) holes.push(flat.length / 2);
      for (const pt of rings[r]) flat.push(pt[0], pt[1]);
    }
    const idx = earcut(flat, holes.length ? holes : null, 2);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 2, b = idx[i + 1] * 2, c = idx[i + 2] * 2;
      emit(flat[a], flat[a + 1], flat[b], flat[b + 1], flat[c], flat[c + 1]);
    }
  };

  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') addPolygon(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) addPolygon(p);
  }

  // pack: per-vertex [pos, centroid]
  const triCount = tris.length / 6;
  const out = new Float32Array(triCount * 3 * 4);
  let o = 0;
  for (let t = 0; t < tris.length; t += 6) {
    const cx = ((tris[t] + tris[t + 2] + tris[t + 4]) / 3) * NX;
    const cy = ((tris[t + 1] + tris[t + 3] + tris[t + 5]) / 3) * NY;
    for (let v = 0; v < 3; v++) {
      out[o++] = tris[t + v * 2] * NX;
      out[o++] = tris[t + v * 2 + 1] * NY;
      out[o++] = cx;
      out[o++] = cy;
    }
  }
  return { data: out, vertexCount: triCount * 3 };
}

// --- Domain-fixed geometry (ocean / projection outline) --------------------

// Triangle mesh covering the whole (rotated-frame) lon/lat domain. Under any
// raw projection it renders exactly the projection's footprint (the "sphere"
// fill); under orthographic the far hemisphere is clipped away by vClip.
export function sphereMesh(stepDeg = 2) {
  const cols = Math.ceil(360 / stepDeg);
  const rows = Math.ceil(180 / stepDeg);
  const verts = new Float32Array((cols + 1) * (rows + 1) * 4);
  let o = 0;
  for (let j = 0; j <= rows; j++) {
    const lat = -90 + (180 * j) / rows;
    for (let i = 0; i <= cols; i++) {
      const lon = -180 + (360 * i) / cols;
      verts[o++] = lon * NX;
      verts[o++] = lat * NY;
      verts[o++] = lon * NX; // ref unused in domain mode
      verts[o++] = lat * NY;
    }
  }
  const idx = new Uint32Array(cols * rows * 6);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }
  return { data: verts, indices: idx, indexCount: idx.length };
}

// Outline of the projection domain (rectangle border in rotated lon/lat,
// densely sampled) — becomes the map boundary under every 2D projection.
export function domainBoundary(stepDeg = 1) {
  const lines = [];
  const EPS = 1e-4;
  const top = [], bottom = [], left = [], right = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    top.push([lon, 90 - EPS]);
    bottom.push([lon, -90 + EPS]);
  }
  for (let lat = -90; lat <= 90; lat += stepDeg) {
    left.push([-180 + EPS, lat]);
    right.push([180 - EPS, lat]);
  }
  lines.push(top, bottom, left, right);
  return segmentBuffer(lines, 0);
}

// Unit circle in raw projection space — the globe horizon under orthographic.
export function rawCircle(radius = 1, segments = 180) {
  const out = new Float32Array(segments * 8);
  let o = 0;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    out[o++] = Math.cos(a0) * radius; out[o++] = Math.sin(a0) * radius; out[o++] = 0; out[o++] = 0;
    out[o++] = Math.cos(a1) * radius; out[o++] = Math.sin(a1) * radius; out[o++] = 0; out[o++] = 0;
  }
  return { data: out, vertexCount: segments * 2 };
}

// Annulus (triangle list) in raw projection space — the atmosphere halo.
// innerR/outerR are in raw units (1.0 = globe radius).
export function rawRing(innerR, outerR, segments = 128) {
  const out = new Float32Array(segments * 6 * 4);
  let o = 0;
  const put = (x, y) => { out[o++] = x; out[o++] = y; out[o++] = 0; out[o++] = 0; };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    put(c0 * innerR, s0 * innerR); put(c1 * innerR, s1 * innerR); put(c0 * outerR, s0 * outerR);
    put(c1 * innerR, s1 * innerR); put(c1 * outerR, s1 * outerR); put(c0 * outerR, s0 * outerR);
  }
  return { data: out, vertexCount: segments * 6 };
}
