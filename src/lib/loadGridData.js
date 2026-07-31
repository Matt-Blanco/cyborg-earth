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
import { HV_THRESHOLD } from './config.js';

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

function categoryOf(line) {
  if ((line.t || 'line') === 'cable') return 'cable';
  return (line.v || 0) >= HV_THRESHOLD ? 'hv' : 'mv';
}

// Parse one compact file into per-category segment arrays + point lists.
function ingestFile(data, acc) {
  const segCounts = { mv: 0, hv: 0, cable: 0 };
  const lines = data.lines || [];
  for (const ln of lines) {
    const c = ln.c;
    if (!c || c.length < 2) continue;
    segCounts[categoryOf(ln)] += c.length - 1;
  }
  const writers = {
    mv: new SegmentWriter(segCounts.mv),
    hv: new SegmentWriter(segCounts.hv),
    cable: new SegmentWriter(segCounts.cable),
  };
  for (const ln of lines) {
    const c = ln.c;
    if (!c || c.length < 2) continue;
    const w = writers[categoryOf(ln)];
    for (let i = 0; i < c.length - 1; i++) {
      w.push(c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]);
    }
    acc.lineCount++;
  }
  for (const cat of ['mv', 'hv', 'cable']) {
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

// Fetch + ingest all configured files. onStatus(message, loading) mirrors the
// original page's load banner. Returns GPU buffers plus pickable point lists.
export async function loadGridData(urls, onStatus) {
  if (urls.length === 0) {
    onStatus('No grid data files configured — edit GRID_DATA_URLS in config.js', false);
    return null;
  }
  onStatus(`Loading ${urls.length} grid data file(s)...`, true);

  const acc = {
    chunks: { mv: [], hv: [], cable: [] },
    segCounts: { mv: 0, hv: 0, cable: 0 },
    substations: [],
    plants: [],
    lineCount: 0,
  };

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

  const gpu = {
    mv: mergeChunks(acc.chunks.mv),
    hv: mergeChunks(acc.chunks.hv),
    cable: mergeChunks(acc.chunks.cable),
  };
  const totalSegs = acc.segCounts.mv + acc.segCounts.hv + acc.segCounts.cable;

  onStatus(
    `${loaded} file(s) loaded: ${acc.lineCount.toLocaleString()} lines ` +
      `(${totalSegs.toLocaleString()} segments) uploaded to GPU` +
      (failed ? ` (${failed} failed)` : ''),
    false
  );

  return {
    gpu,
    substations: acc.substations,
    plants: acc.plants,
    substationPositions: pointPositions(acc.substations),
    plantPositions: pointPositions(acc.plants),
    counts: {
      lines: acc.lineCount,
      segments: totalSegs,
      substations: acc.substations.length,
      plants: acc.plants.length,
    },
  };
}
