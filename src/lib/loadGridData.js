// Loads compact_power.py output files and converts them straight into
// GPU-ready buffers.
//
// Grid lines are quantized to int16 (≈600 m resolution — far below a pixel
// at globe scale) so the full worldwide grid fits comfortably in GPU memory:
// 8 bytes per vertex instead of the original per-frame GeoJSON re-projection.
//
// Vertex layout (matches renderer's int16 geo buffers, normalized):
//   [lonQ, latQ, midLonQ, midLatQ] — mid* is the segment midpoint used for
//   antimeridian unwrapping in the vertex shader.
import { HV_THRESHOLD, PICKABLE_RAIL_NODES, AREA_CATEGORIES, areaDefFor } from './config.js';
import { triangulateRings, ringOutlines } from './webgl/geometry.js';

const QX = 32767 / 180;
const QY = 32767 / 90;

function q(v, s) {
  const n = Math.round(v * s);
  return n > 32767 ? 32767 : n < -32767 ? -32767 : n;
}

function midLon(a, b) {
  let m = (a + b) / 2;
  if (Math.abs(a - b) > 180) m += m > 0 ? -180 : 180;
  return m;
}

class SegmentWriter {
  constructor(segmentCount) {
    this.data = new Int16Array(segmentCount * 8);
    this.o = 0;
  }
  push(x0, y0, x1, y1) {
    const mx = q(midLon(x0, x1), QX);
    const my = q((y0 + y1) / 2, QY);
    const d = this.data;
    let o = this.o;
    d[o++] = q(x0, QX); d[o++] = q(y0, QY); d[o++] = mx; d[o++] = my;
    d[o++] = q(x1, QX); d[o++] = q(y1, QY); d[o++] = mx; d[o++] = my;
    this.o = o;
  }
  result() {
    return { data: this.data, vertexCount: this.o / 4 };
  }
}

// Line categories, in draw order (rail/telecom/subsea are background context,
// so the power grid draws over them).
export const LINE_CATEGORIES = ['rail', 'subsea', 'telecom', 'mv', 'hv', 'cable'];

// Two file shapes reach this loader and they disagree about what `t` means:
//
//   power extracts   `t` is a type string ("cable") and `v` is voltage in volts.
//   tagged extracts  `t` is the raw OSM tag object ({railway: "rail"}) and
//                    there is no voltage at all.
//
// Discriminating on typeof matters: an object `t` is never === 'cable' and an
// absent `v` reads as 0, so treating every file as a power extract silently
// files railways under "MV lines" — drawn in medium-voltage blue and counted as
// power infrastructure.
function categoryOf(line) {
  const t = line.t;
  if (t && typeof t === 'object') {
    if (t.railway) return 'rail';
    if (t.telecom) return 'telecom';
    // The submarine-cable extract is not an OSM export: its `t` carries the
    // cable's own identity ({id, name, color, feature_id}) instead of tags, so
    // there is no `telecom` key to match on — `feature_id` is what marks the
    // shape. Without this branch all 1,930 cables land in `skippedLines`.
    if (typeof t.feature_id === 'string') return 'subsea';
    return null; // an unmodelled tag family — skip rather than mislabel it
  }
  if ((t || 'line') === 'cable') return 'cable';
  return (line.v || 0) >= HV_THRESHOLD ? 'hv' : 'mv';
}

// Plain GeoJSON in, compact-extract shape out. Boundary data almost always
// arrives as a FeatureCollection (Overpass, Natural Earth, protectedplanet), and
// re-exporting it through the compact pipeline just to draw it would be busywork
// — so the loader accepts it directly and normalises here. Feature `properties`
// become `t`, which is exactly the tag object the category matchers expect.
function normalizeGeoJSON(data) {
  if (!data || (data.type !== 'FeatureCollection' && data.type !== 'Feature')) {
    return data;
  }
  const features = data.type === 'Feature' ? [data] : data.features || [];
  const out = { lines: [], areas: [], points: [], meta: data.meta };
  for (const f of features) {
    const g = f && f.geometry;
    if (!g) continue;
    const t = f.properties || {};
    switch (g.type) {
      case 'LineString':
        out.lines.push({ c: g.coordinates, t });
        break;
      case 'MultiLineString':
        for (const c of g.coordinates) out.lines.push({ c, t });
        break;
      case 'Polygon':
        out.areas.push({ r: g.coordinates, t });
        break;
      case 'MultiPolygon':
        // Each part of a multipolygon is its own ring set; they are separate
        // shapes that happen to share a name (an archipelago reserve, a forest
        // in disjoint blocks), so they index and hit-test independently.
        for (const r of g.coordinates) out.areas.push({ r, t });
        break;
      case 'Point':
        out.points.push({ lo: g.coordinates[0], la: g.coordinates[1], t });
        break;
      case 'MultiPoint':
        for (const p of g.coordinates) out.points.push({ lo: p[0], la: p[1], t });
        break;
    }
  }
  return out;
}

// A ring crosses the antimeridian if any edge jumps more than half the world in
// longitude — the ring is contiguous on the sphere but its coordinates are not.
function ringCrossesSeam(ring) {
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) return true;
  }
  return false;
}

// Re-express a seam-crossing ring in a continuous longitude frame by walking it
// and accumulating ±360 at each jump, so 175 -> -175 becomes 175 -> 185.
//
// Everything downstream then behaves: earcut sees a narrow box instead of one
// stretching the wrong way round the planet (which is the difference between a
// 10°-wide fill and a 350°-wide one), and the vertex shader is unaffected
// because sin/cos of longitude are periodic — 185° and -175° are the same point
// on the sphere. Only the CPU-side ray cast needs to know, via `wrapped`.
function unwrapRing(ring) {
  const out = [ring[0]];
  let offset = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = ring[i][0] - ring[i - 1][0];
    if (d > 180) offset -= 360;
    else if (d < -180) offset += 360;
    out.push(offset === 0 ? ring[i] : [ring[i][0] + offset, ring[i][1]]);
  }
  return out;
}

// Signed area of a ring in square degrees. Only its magnitude is used, to rank
// overlapping areas so the smallest (most specific) one wins a hover.
function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(s / 2);
}

// A way encloses something if it returns to where it started *and* has three
// distinct corners to enclose with (so four points, the last repeating the
// first). Both halves matter on real extracts: coordinates rounded to 3dp
// (~110 m) collapse a small reserve's ring into [a, b, a] or even [a, a] —
// still closed, but zero area. Those are drawn as a stroke rather than
// triangulated, because earcut on a degenerate ring emits nothing and a
// zero-area polygon can never win a hit test.
function enclosesArea(c) {
  if (c.length < 4) return false;
  const a = c[0];
  const b = c[c.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

function ringBounds(ring) {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const p of ring) {
    if (p[0] < lonMin) lonMin = p[0];
    if (p[0] > lonMax) lonMax = p[0];
    if (p[1] < latMin) latMin = p[1];
    if (p[1] > latMax) latMax = p[1];
  }
  return { lonMin, lonMax, latMin, latMax };
}

// "level_crossing" -> "Level Crossing". Results are interned: a handful of tag
// values cover all ~590k points, so the labels cost a few strings rather than
// one allocation per point.
const labelCache = new Map();
function humanize(value) {
  let label = labelCache.get(value);
  if (label === undefined) {
    label = String(value)
      .replace(/[_:]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    labelCache.set(value, label);
  }
  return label;
}

// One boundary polygon in: rings to the GPU as a fill + an outline, one record
// to the hover index. Areas are counted in the hundreds or low thousands (a
// forest is one shape, not 600k track segments), so unlike rail nodes every one
// of them is pickable — the whole point of a boundary layer is being able to
// ask "what is this region?".
function addArea(acc, rings, tags, def, name) {
  const wrapped = ringCrossesSeam(rings[0]);
  if (wrapped) rings = rings.map(unwrapRing);
  acc.areaRings[def.category].push(rings);
  const outer = rings[0];
  acc.pickableAreas.push({
    rings,
    wrapped,
    ...ringBounds(outer),
    size: ringArea(outer),
    name: name || (tags && tags.name) || def.subtitle,
    subtitle: def.subtitle,
    kind: def.kind,
    isArea: true,
  });
  acc.areaCount++;
}

// Parse one compact file into per-category segment arrays + point lists.
function ingestFile(raw, acc) {
  const data = normalizeGeoJSON(raw);
  const lines = data.lines || [];

  // Boundary extracts deliver their polygons in `lines`, not `areas`: an
  // Overpass query for boundary=protected_area exports each boundary *way*, and
  // a closed way is a ring even though the schema filed it under lines. Without
  // this partition those files load, match no line category, and land in
  // `skippedLines` — 4,396 protected areas fetched and nothing drawn.
  //
  // A line category always wins: a railway crossing a national park is a
  // railway, so only ways no line category claims are offered to the area
  // matcher. A matched way that encloses nothing — an open fragment of a
  // relation exported piecemeal, or a ring flattened by coordinate rounding —
  // still gets the layer's outline, but no fill and no hover: there is no
  // interior to tint or hit-test.
  // The classification pass is also the counting pass, and its verdict is kept
  // in a parallel array rather than re-derived: the write pass below needs a
  // sized buffer per category before it can start, and `categoryOf` +
  // `areaDefFor` over a million-way extract is not worth running twice. Bare
  // interned strings, not objects — europe-rail-telecom.json alone is 166 MB of
  // lines, so one pointer per way is the difference that matters.
  const cats = new Array(lines.length);
  const segCounts = {};
  for (const cat of LINE_CATEGORIES) segCounts[cat] = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const c = ln.c;
    if (!c || c.length < 2) continue;
    const cat = categoryOf(ln);
    if (cat) {
      cats[i] = cat;
      segCounts[cat] += c.length - 1;
      continue;
    }
    const def = areaDefFor(ln.t);
    if (!def) {
      acc.skippedLines++;
      continue;
    }
    if (enclosesArea(c)) {
      addArea(acc, [c], ln.t, def, ln.n);
    } else {
      // Strokes need no seam unwrap — segmentBuffer wraps them the same way it
      // wraps every other polyline.
      acc.areaStrokes[def.category].push(c);
      acc.strokeOnlyAreas++;
    }
  }

  const writers = {};
  for (const cat of LINE_CATEGORIES) writers[cat] = new SegmentWriter(segCounts[cat]);
  for (let i = 0; i < lines.length; i++) {
    const cat = cats[i];
    if (!cat) continue;
    const c = lines[i].c;
    const w = writers[cat];
    for (let j = 0; j < c.length - 1; j++) {
      w.push(c[j][0], c[j][1], c[j + 1][0], c[j + 1][1]);
    }
    acc.lineCount++;
  }
  for (const cat of LINE_CATEGORIES) {
    const r = writers[cat].result();
    if (r.vertexCount) acc.chunks[cat].push(r);
    acc.segCounts[cat] += segCounts[cat];
  }

  if (data.substations) {
    for (const s of data.substations) {
      acc.substations.push({
        lon: s.lo,
        lat: s.la,
        name: s.n || 'Substation',
        voltage: s.v || '',
        kind: 'substation',
      });
    }
  }
  if (data.plants) {
    for (const p of data.plants) {
      acc.plants.push({
        lon: p.lo,
        lat: p.la,
        name: p.n || 'Power Plant',
        source: p.src || '',
        mw: p.mw || '',
        kind: 'plant',
      });
    }
  }
  // Areas that arrived already shaped as areas — a tagged extract's `areas`
  // array, or a GeoJSON (Multi)Polygon normalised into one.
  if (data.areas) {
    for (const a of data.areas) {
      const rings = a.r;
      // A ring needs three distinct corners to enclose anything. These arrive
      // as rings rather than ways, so closure is implied and not required.
      if (!rings || !rings.length || !rings[0] || rings[0].length < 3) {
        acc.skippedAreas++;
        continue;
      }
      const def = areaDefFor(a.t);
      if (!def) {
        acc.skippedAreas++;
        continue;
      }
      addArea(acc, rings, a.t, def, a.n);
    }
  }

  // Tagged extracts carry a generic `points` array instead of the power
  // files' substations/plants; the tag names the feature. Coordinates go
  // straight into flat number arrays for the GPU — only the small hoverable
  // subset (see PICKABLE_RAIL_NODES) becomes an object.
  if (data.points) {
    for (const p of data.points) {
      const t = p.t;
      // A point whose tags were all filtered out of the extract carries no
      // identity we could label or colour, so it is counted, not drawn.
      if (!t || typeof t !== 'object' || (!t.railway && !t.telecom)) {
        acc.skippedPoints++;
        continue;
      }
      if (t.railway) {
        acc.railNodeCoords.push(p.lo, p.la);
        if (PICKABLE_RAIL_NODES.has(t.railway)) {
          acc.pickable.push({
            lon: p.lo,
            lat: p.la,
            name: humanize(t.railway),
            kind: 'railNode',
          });
        }
      } else {
        acc.telecomCoords.push(p.lo, p.la);
        acc.pickable.push({
          lon: p.lo,
          lat: p.la,
          name: humanize(t.telecom),
          kind: 'telecomPoint',
        });
      }
    }
  }
}

function mergeChunks(chunks) {
  let total = 0;
  for (const c of chunks) total += c.data.length;
  const data = new Int16Array(total);
  let o = 0;
  let vertexCount = 0;
  for (const c of chunks) {
    data.set(c.data, o);
    o += c.data.length;
    vertexCount += c.vertexCount;
  }
  return { data, vertexCount };
}

function pointPositions(items) {
  const out = new Float32Array(items.length * 2);
  for (let i = 0; i < items.length; i++) {
    out[i * 2] = items[i].lon / 180;
    out[i * 2 + 1] = items[i].lat / 90;
  }
  return out;
}

// Same normalisation, for the flat [lon, lat, lon, lat, ...] arrays used by
// the tagged-feature points that never need per-item objects.
function coordPositions(coords) {
  const out = new Float32Array(coords.length);
  for (let i = 0; i < coords.length; i += 2) {
    out[i] = coords[i] / 180;
    out[i + 1] = coords[i + 1] / 90;
  }
  return out;
}

// Fetch + ingest all configured files. onStatus(message, loading) mirrors the
// original page's load banner. Returns GPU buffers plus pickable point lists.
export async function loadGridData(urls, onStatus) {
  if (urls.length === 0) {
    onStatus('No grid data files configured — edit GRID_DATA_URLS in config.js', false);
    return null;
  }
  onStatus(`Loading ${urls.length} grid data file(s)...`, true);

  const acc = {
    chunks: {},
    segCounts: {},
    substations: [],
    plants: [],
    railNodeCoords: [],
    telecomCoords: [],
    pickable: [],
    areaRings: {},
    areaStrokes: {},
    pickableAreas: [],
    lineCount: 0,
    areaCount: 0,
    strokeOnlyAreas: 0,
    skippedLines: 0,
    skippedPoints: 0,
    skippedAreas: 0,
  };
  for (const cat of LINE_CATEGORIES) {
    acc.chunks[cat] = [];
    acc.segCounts[cat] = 0;
  }
  for (const cat of AREA_CATEGORIES) {
    acc.areaRings[cat] = [];
    acc.areaStrokes[cat] = [];
  }

  const results = await Promise.allSettled(
    urls.map((url) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.json();
      })
    )
  );

  let loaded = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      ingestFile(r.value, acc);
      loaded++;
    } else {
      console.error(`Failed to load ${urls[i]}:`, r.reason);
      failed++;
    }
  });

  const gpu = {};
  let totalSegs = 0;
  for (const cat of LINE_CATEGORIES) {
    gpu[cat] = mergeChunks(acc.chunks[cat]);
    totalSegs += acc.segCounts[cat];
  }
  // Triangulate boundary fills and build their outlines once, here, for the
  // same reason the line buffers are built here: nothing may touch geometry
  // during pan/rotate. maxDeg keeps triangles and segments small enough that
  // the horizon clip and the seam unwrap stay accurate on the globe.
  const areaGpu = {};
  let areaTris = 0;
  let areaOutlineSegs = 0;
  for (const cat of AREA_CATEGORIES) {
    const polys = acc.areaRings[cat];
    const fill = triangulateRings(polys, 4);
    const outline = ringOutlines(polys, 2, acc.areaStrokes[cat]);
    areaGpu[cat] = { fill, outline };
    areaTris += fill.vertexCount / 3;
    areaOutlineSegs += outline.vertexCount / 2;
  }

  const railNodeCount = acc.railNodeCoords.length / 2;
  const telecomPointCount = acc.telecomCoords.length / 2;
  const totalPoints =
    acc.substations.length + acc.plants.length + railNodeCount + telecomPointCount;

  onStatus(
    `${loaded} file(s) loaded: ${acc.lineCount.toLocaleString()} lines ` +
      `(${totalSegs.toLocaleString()} segments), ` +
      `${totalPoints.toLocaleString()} points` +
      (acc.areaCount
        ? ` and ${acc.areaCount.toLocaleString()} areas ` +
          `(${areaTris.toLocaleString()} triangles)`
        : '') +
      ' uploaded to GPU' +
      (failed ? ` (${failed} failed)` : ''),
    false
  );
  const skipped = acc.skippedLines + acc.skippedPoints + acc.skippedAreas;
  if (skipped) {
    console.info(
      `loadGridData: skipped ${acc.skippedLines.toLocaleString()} untyped lines, ` +
        `${acc.skippedAreas.toLocaleString()} unmatched areas and ` +
        `${acc.skippedPoints.toLocaleString()} untagged points (no layer to draw them on)`
    );
  }
  if (acc.strokeOnlyAreas) {
    console.info(
      `loadGridData: ${acc.strokeOnlyAreas.toLocaleString()} boundary ways enclose no area ` +
        '(open fragments, or rings flattened by coordinate rounding) — drawn as ' +
        'outlines only, with no fill and no hover. Re-export at finer precision ' +
        'to recover them.'
    );
  }

  return {
    gpu,
    // Per-category { fill, outline } triangle/segment buffers for boundaries.
    areaGpu,
    substations: acc.substations,
    plants: acc.plants,
    // Hoverable tagged features only — see PICKABLE_RAIL_NODES.
    pickableFeatures: acc.pickable,
    // Every boundary area, with rings retained for point-in-polygon hit tests.
    pickableAreas: acc.pickableAreas,
    substationPositions: pointPositions(acc.substations),
    plantPositions: pointPositions(acc.plants),
    railNodePositions: coordPositions(acc.railNodeCoords),
    telecomPointPositions: coordPositions(acc.telecomCoords),
    counts: {
      lines: acc.lineCount,
      segments: totalSegs,
      substations: acc.substations.length,
      plants: acc.plants.length,
      railNodes: railNodeCount,
      telecomPoints: telecomPointCount,
      pickableFeatures: acc.pickable.length,
      areas: acc.areaCount,
      // Matched boundary ways enclosing nothing — outlined, but unfilled and
      // unhoverable. A high ratio against `areas` means the source was exported
      // at too coarse a coordinate precision, not that the tags were wrong.
      strokeOnlyAreas: acc.strokeOnlyAreas,
      areaTriangles: areaTris,
      areaOutlineSegments: areaOutlineSegs,
      skippedLines: acc.skippedLines,
      skippedPoints: acc.skippedPoints,
      skippedAreas: acc.skippedAreas,
    },
  };
}
