// Embedded reactor dataset (GeoNuclearData), extracted from the original
// globe.html. The original page shipped with this array commented out and
// REACTORS_RAW = []; here the data is loaded so the "Reactors" toggle works,
// but the layer still starts hidden (see INITIAL_LAYERS). Set REACTORS_RAW
// to [] to fully disable it.
import raw from './reactors-data.json';
import {
  reactorColor,
  REACTOR_GLOWS,
  REACTOR_FALLBACK_GLOW,
  hexToVec4,
} from './config.js';

export const REACTORS_RAW = raw;

export const reactors = REACTORS_RAW.map((d) => ({
  name: d.n,
  lat: d.la,
  lon: d.lo,
  country: d.c,
  status: d.s,
  type: d.rt,
  model: d.rm,
  capacity: d.ca,
  kind: 'reactor',
}));

// GPU buffers: positions, per-status core/glow colors, core diameters, and a
// separate position list for the animated pulse (operational reactors only).
export function reactorBuffers() {
  const n = reactors.length;
  const positions = new Float32Array(n * 2);
  const coreColors = new Uint8Array(n * 4);
  const glowColors = new Uint8Array(n * 4);
  const sizes = new Float32Array(n);
  const pulse = [];
  for (let i = 0; i < n; i++) {
    const r = reactors[i];
    positions[i * 2] = r.lon / 180;
    positions[i * 2 + 1] = r.lat / 90;
    const core = hexToVec4(reactorColor(r.status));
    const glow = REACTOR_GLOWS[r.status] || REACTOR_FALLBACK_GLOW;
    for (let c = 0; c < 3; c++) {
      coreColors[i * 4 + c] = Math.round(core[c] * 255);
      glowColors[i * 4 + c] = glow[c];
    }
    coreColors[i * 4 + 3] = 255;
    glowColors[i * 4 + 3] = Math.round(glow[3] * 255);
    const operational = r.status === 'Operational';
    sizes[i] = (operational ? 2.6 : 2) * 2; // core diameter in css px
    if (operational) pulse.push(r.lon / 180, r.lat / 90);
  }
  return {
    positions,
    coreColors,
    glowColors,
    sizes,
    pulsePositions: new Float32Array(pulse),
  };
}
