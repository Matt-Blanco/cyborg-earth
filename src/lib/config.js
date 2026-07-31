// ============================================================================
// CONFIGURATION — Edit GRID_DATA_URLS to point at your compact_power.py outputs.
//
// Each entry is a URL (relative to the site root) to a JSON file produced by
// compact_power.py. Files live in public/data/ and are loaded in parallel on
// page load. If the array is empty, only the embedded reactor data displays.
// ============================================================================
export const GRID_DATA_URLS = [
  'data/africa-power-compact.json',
  'data/asia-power-compact.json',
  'data/australia-power-compact.json',
  'data/north-america-power-compact.json',
  'data/central-america-power-compact.json',
  'data/south-america-power-compact.json',
  'data/europe-power-compact.json',
];

export const WORLD_ATLAS_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Spatial index cell size (degrees) — used for fast hover picking of points.
export const CELL_SIZE = 5;

// HV threshold in volts: lines at or above render as HV, below as MV.
export const HV_THRESHOLD = 200000;

// Layer toggle definitions (order = button order).
export const LAYER_DEFS = [
  { id: 'reactors', label: 'Reactors', color: '#10b981' },
  { id: 'hvLines', label: 'HV Lines', color: '#f59e0b' },
  { id: 'mvLines', label: 'MV Lines', color: '#38bdf8' },
  { id: 'cables', label: 'Cables', color: '#10b981' },
  { id: 'substations', label: 'Substations', color: '#a78bfa' },
  { id: 'plants', label: 'Plants', color: '#fb923c' },
];

export const INITIAL_LAYERS = {
  reactors: false,
  hvLines: true,
  mvLines: true,
  cables: true,
  substations: false,
  plants: false,
};

// Reactor status colors (dot + tooltip accent) and glow colors.
export const REACTOR_COLORS = {
  Operational: '#10b981',
  'Under Construction': '#f59e0b',
  Planned: '#a78bfa',
  'Permanent Shutdown': '#ef4444',
  'Suspended Operation': '#64748b',
};
export const REACTOR_GLOWS = {
  Operational: [16, 185, 129, 0.6],
  'Under Construction': [245, 158, 11, 0.6],
  'Permanent Shutdown': [239, 68, 68, 0.4],
  'Suspended Operation': [100, 116, 139, 0.4],
};
export const REACTOR_FALLBACK_COLOR = '#64748b';
export const REACTOR_FALLBACK_GLOW = [100, 116, 139, 0.3];

export function reactorColor(status) {
  return REACTOR_COLORS[status] || REACTOR_FALLBACK_COLOR;
}

// WebGL render colors as [r, g, b, a] in 0-1. WebGL rasterizes 1px lines, so
// alphas are tuned slightly up from the original canvas strokeStyle values
// (which used sub-pixel/1.4px widths) to keep the same visual weight.
export const RENDER_COLORS = {
  mvLines: [56 / 255, 189 / 255, 248 / 255, 0.22],
  hvLines: [245 / 255, 158 / 255, 11 / 255, 0.5],
  cables: [16 / 255, 185 / 255, 129 / 255, 0.35],
  substations: [167 / 255, 139 / 255, 250 / 255, 0.55],
  plants: [251 / 255, 146 / 255, 60 / 255, 0.6],
  graticule: [1, 1, 1, 0.02],
  land: [0x0d / 255, 0x11 / 255, 0x17 / 255, 1],
  oceanFlat: [0x0d / 255, 0x11 / 255, 0x17 / 255, 1],
  oceanInner: [0x13 / 255, 0x19 / 255, 0x22 / 255, 1],
  oceanOuter: [0x0a / 255, 0x0e / 255, 0x14 / 255, 1],
  sphereOutline: [34 / 255, 211 / 255, 238 / 255, 0.08],
  atmosphere: [34 / 255, 211 / 255, 238 / 255, 0.04],
};

export function hexToVec4(hex, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}
