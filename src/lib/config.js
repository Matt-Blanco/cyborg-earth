// ============================================================================
// CONFIGURATION — Edit GRID_DATA_URLS to point at your compact_power.py outputs.
//
// Each entry is a URL (relative to the site root) to a JSON file produced by
// compact_power.py. Files live in public/data/ and are loaded in parallel on
// page load. If the array is empty, only the embedded reactor data displays.
//
// Two file shapes are supported (see loadGridData.js):
//   * power extracts  — lines carry `v` (voltage) / `t: "cable"`, plus
//                       `substations` and `plants` arrays.
//   * tagged extracts — lines and `points` carry the raw OSM tag object
//                       (`t: {railway: "rail"}`), listed in `meta.tagsKept`.
// ============================================================================
export const GRID_DATA_URLS = [
  'data/africa-power-compact.json',
  'data/asia-power-compact.json',
  'data/australia-power-compact.json',
  'data/north-america-power-compact.json',
  'data/central-america-power-compact.json',
  'data/south-america-power-compact.json',
  'data/europe-power-compact.json',
  'data/north-america-rail-telecom.json',
  'data/south-america-rail-telecom.json',
  'data/europe-rail-telecom.json',
  'data/sea-telecom-cables.json',
];

export const WORLD_ATLAS_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Spatial index cell size (degrees) — used for fast hover picking of points.
export const CELL_SIZE = 5;

// Rail nodes worth putting in the hover index: named places and network
// junctions. Everything else in a rail extract is track furniture (level
// crossings, switches, signals, milestones) — ~575k of the ~580k nodes. Those
// still render; they are just not hoverable. The globe has no zoom, so the
// 14px pick radius always spans ~2° of map, which over a dense network covers
// tens of thousands of identical dots at once — there is no "the one you meant"
// to report, and indexing them would put >100k candidates through projection
// math on every mousemove.
export const PICKABLE_RAIL_NODES = new Set([
  'station',
  'station_site',
  'halt',
  'stop',
  'site',
  'yard',
  'depot',
  'junction',
  'spur_junction',
  'ferry_terminal',
  'tram_stop',
  'subway_entrance',
  'platform',
  'turntable',
  'roundhouse',
  'traverser',
]);

// HV threshold in volts: lines at or above render as HV, below as MV.
export const HV_THRESHOLD = 200000;

// Categorical hues. Railways and rail nodes deliberately share one hue: they
// are the same entity drawn as two mark types (line vs dot), so identity is
// carried by form, not by minting a second hue. Both new hues clear the
// colorblind-separation floor against every colour already in use
// (rail↔shutdown-red ΔE 15.0 normal / 14.4 CVD; telecom↔cable-green 19.3 / 17.8).
//
// Submarine cables reuse TELECOM_COLOR for the same reason: they are telecom,
// and the split from land telecom is carried by domain (long ocean arcs vs
// continental lines and sites), which never overlap on the map. Minting a
// ninth hue was measured first — against the eight in use only #c026d3
// (ΔE 18.4 normal / 10.8 CVD) and #7c3aed (18.9 / 16.2) clear both floors, and
// both are dark enough that at line alpha over the near-black ocean they fall
// under the 3:1 contrast floor. A hue that passes separation but disappears on
// the background is not a usable layer colour.
export const RAIL_COLOR = '#f472b6';
export const TELECOM_COLOR = '#a3e635';

// Layer toggle definitions (order = button order).
export const LAYER_DEFS = [
  { id: 'reactors', label: 'Reactors', color: '#10b981' },
  { id: 'hvLines', label: 'HV Lines', color: '#f59e0b' },
  { id: 'mvLines', label: 'MV Lines', color: '#38bdf8' },
  { id: 'cables', label: 'Cables', color: '#10b981' },
  { id: 'substations', label: 'Substations', color: '#a78bfa' },
  { id: 'plants', label: 'Plants', color: '#fb923c' },
  { id: 'railLines', label: 'Railways', color: RAIL_COLOR },
  { id: 'railNodes', label: 'Rail Nodes', color: RAIL_COLOR },
  { id: 'telecom', label: 'Telecom', color: TELECOM_COLOR },
  { id: 'subseaCables', label: 'Subsea Cables', color: TELECOM_COLOR },
];

export const INITIAL_LAYERS = {
  reactors: false,
  hvLines: true,
  mvLines: true,
  cables: true,
  substations: false,
  plants: false,
  railLines: true,
  // ~590k dots would swamp the grid at world zoom; off until asked for, the
  // same call the substation layer makes.
  railNodes: false,
  telecom: true,
  subseaCables: true,
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
  // Rail is dense background context, so it sits at a low alpha like mvLines;
  // telecom is only ~90 lines and can afford to read solid.
  railLines: [244 / 255, 114 / 255, 182 / 255, 0.28],
  railNodes: [244 / 255, 114 / 255, 182 / 255, 0.5],
  telecomLines: [163 / 255, 230 / 255, 53 / 255, 0.6],
  telecomPoints: [163 / 255, 230 / 255, 53 / 255, 0.7],
  // Sits just under the land telecom alpha: ~11.6k segments of uninterrupted
  // open-ocean arc read heavier than the same alpha does over land clutter.
  subseaCables: [163 / 255, 230 / 255, 53 / 255, 0.5],
  graticule: [1, 1, 1, 0.02],
  land: [0x0d / 255, 0x11 / 255, 0x17 / 255, 0],
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
