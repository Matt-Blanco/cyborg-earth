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
import { HV_THRESHOLD, PICKABLE_RAIL_NODES } from './config.js';

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

// Parse one compact file into per-category segment arrays + point lists.
function ingestFile(data, acc) {
  const segCounts = {};
  for (const cat of LINE_CATEGORIES) segCounts[cat] = 0;
  const lines = data.lines || [];
  for (const ln of lines) {
    const c = ln.c;
    if (!c || c.length < 2) continue;
    const cat = categoryOf(ln);
    if (cat) segCounts[cat] += c.length - 1;
  }
  const writers = {};
  for (const cat of LINE_CATEGORIES) writers[cat] = new SegmentWriter(segCounts[cat]);
  for (const ln of lines) {
    const c = ln.c;
    if (!c || c.length < 2) continue;
    const cat = categoryOf(ln);
    if (!cat) {
      acc.skippedLines++;
      continue;
    }
    const w = writers[cat];
    for (let i = 0; i < c.length - 1; i++) {
      w.push(c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]);
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
    lineCount: 0,
    skippedLines: 0,
    skippedPoints: 0,
  };
  for (const cat of LINE_CATEGORIES) {
    acc.chunks[cat] = [];
    acc.segCounts[cat] = 0;
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
  const railNodeCount = acc.railNodeCoords.length / 2;
  const telecomPointCount = acc.telecomCoords.length / 2;
  const totalPoints =
    acc.substations.length + acc.plants.length + railNodeCount + telecomPointCount;

  onStatus(
    `${loaded} file(s) loaded: ${acc.lineCount.toLocaleString()} lines ` +
      `(${totalSegs.toLocaleString()} segments) and ` +
      `${totalPoints.toLocaleString()} points uploaded to GPU` +
      (failed ? ` (${failed} failed)` : ''),
    false
  );
  const skipped = acc.skippedLines + acc.skippedPoints;
  if (skipped) {
    console.info(
      `loadGridData: skipped ${acc.skippedLines.toLocaleString()} untyped lines and ` +
        `${acc.skippedPoints.toLocaleString()} untagged points (no layer to draw them on)`
    );
  }

  return {
    gpu,
    substations: acc.substations,
    plants: acc.plants,
    // Hoverable tagged features only — see PICKABLE_RAIL_NODES.
    pickableFeatures: acc.pickable,
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
      skippedLines: acc.skippedLines,
      skippedPoints: acc.skippedPoints,
    },
  };
}
