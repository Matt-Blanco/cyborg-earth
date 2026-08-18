// ============================================================================
// CONFIGURATION — Edit GRID_DATA_URLS to point at your compact_power.py outputs.
//
// Each entry is a URL (relative to the site root) to a JSON file produced by
// compact_power.py. Files live in public/data/ and are loaded in parallel on
// page load. If the array is empty, only the embedded reactor data displays.
//
// Three file shapes are supported (see loadGridData.js):
//   * power extracts  — lines carry `v` (voltage) / `t: "cable"`, plus
//                       `substations` and `plants` arrays.
//   * tagged extracts — lines, `areas` and `points` carry the raw OSM tag
//                       object (`t: {railway: "rail"}`), listed in
//                       `meta.tagsKept`. An area is `{r: [outerRing, ...holes],
//                       t: {...}}`, rings being [[lon, lat], ...].
//   * plain GeoJSON   — a FeatureCollection of (Multi)Polygon / (Multi)LineString
//                       / (Multi)Point features, normalised on load. This is the
//                       drop-in path for boundary data (forests, mountain
//                       ranges, protected areas, national parks, admin borders)
//                       straight from Overpass or Natural Earth — see
//                       AREA_TYPES for the tags that reach the area layer.
//
// Boundary extracts often deliver their polygons as closed *ways* in `lines`
// rather than in `areas`; the loader promotes those, so an Overpass export of
// `boundary=protected_area` works without reshaping it first.
// ============================================================================
export const GRID_DATA_URLS = [
  "data/africa-power-compact.json",
  "data/asia-power-compact.json",
  "data/australia-power-compact.json",
  "data/north-america-power-compact.json",
  "data/central-america-power-compact.json",
  "data/south-america-power-compact.json",
  "data/europe-power-compact.json",
  "data/north-america-rail-telecom.json",
  "data/south-america-rail-telecom.json",
  "data/europe-rail-telecom.json",
  "data/asia-rail-telecom.json",
  "data/africa-rail-telecom.json",
  "data/central-america-rail-telecom.json",
  "data/australia-protected-area.json",
  "data/sea-telecom-cables.json",
  "data/australia-national-park.json",
  "data/north-america-protected-area.json",
  "data/south-america-protected-area.json",
  "data/central-america-protected-area.json",
  "data/north-america-national-parks.json",
  "data/south-america-national-parks.json",
  "data/central-america-national-parks.json",
  "data/europe-national-parks.json",
  "data/africa-national-parks.json",
  "data/asia-national-parks.json",
];

export const WORLD_ATLAS_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
  "station",
  "station_site",
  "halt",
  "stop",
  "site",
  "yard",
  "depot",
  "junction",
  "spur_junction",
  "ferry_terminal",
  "tram_stop",
  "subway_entrance",
  "platform",
  "turntable",
  "roundhouse",
  "traverser",
]);

// HV threshold in volts: lines at or above render as HV, below as MV.
export const HV_THRESHOLD = 200000;

// ============================================================================
// COLOUR — two themes over one set of hues.
//
// HUES is the single source: one row per drawn thing, carrying that thing's hue
// in each theme. The map (RENDER_COLORS, AREA_COLORS, REACTOR_COLORS), the
// legend swatches and the toggle dots are all derived from it by applyTheme(),
// so a layer's colour is stated once per theme and cannot drift between the
// canvas and the chrome.
//
// Categorical separation, measured on the dark set: railways and rail nodes
// deliberately share one hue — they are the same entity drawn as two mark types
// (line vs dot), so identity is carried by form, not by minting a second hue.
// Both clear the colorblind-separation floor against every other colour in use
// (rail↔shutdown-red ΔE 15.0 normal / 14.4 CVD; telecom↔cable-green 19.3 / 17.8).
//
// Submarine cables reuse the telecom hue for the same reason: they are telecom,
// and the split from land telecom is carried by domain (long ocean arcs vs
// continental lines and sites), which never overlap on the map. Minting a
// ninth hue was measured first — against the eight in use only #c026d3
// (ΔE 18.4 normal / 10.8 CVD) and #7c3aed (18.9 / 16.2) clear both floors, and
// both are dark enough that at line alpha over the near-black ocean they fall
// under the 3:1 contrast floor. A hue that passes separation but disappears on
// the background is not a usable layer colour.
//
// The light set is the same eight families pulled down to the 600–800 range.
// That last constraint is what forces it: over a near-white ocean the dark hues
// are the ones that fall under the 3:1 floor, so each is darkened until it
// clears it. Separation survives because the whole set moves together — the ΔE
// figures above are distances *between* hues, and darkening all of them
// preserves the ordering rather than collapsing pairs into each other.
const HUES = {
  reactorOperational: { dark: "#10b981", light: "#047857" },
  reactorConstruction: { dark: "#f59e0b", light: "#b45309" },
  reactorPlanned: { dark: "#a78bfa", light: "#6d28d9" },
  reactorShutdown: { dark: "#ef4444", light: "#b91c1c" },
  reactorSuspended: { dark: "#64748b", light: "#475569" },
  hv: { dark: "#f59e0b", light: "#b45309" },
  mv: { dark: "#38bdf8", light: "#0369a1" },
  cable: { dark: "#10b981", light: "#047857" },
  substation: { dark: "#a78bfa", light: "#6d28d9" },
  plant: { dark: "#fb923c", light: "#c2410c" },
  rail: { dark: "#f472b6", light: "#be185d" },
  telecom: { dark: "#a3e635", light: "#4d7c0f" },
  area: { dark: "#4ade80", light: "#15803d" },
};

export const THEMES = ["dark", "light"];
export const DEFAULT_THEME = "dark";

let activeTheme = DEFAULT_THEME;

// A hue key resolved against a theme (the active one by default). This is what
// the legend and toggle bar call for their swatches.
export function hueFor(key, theme = activeTheme) {
  const hue = HUES[key];
  return hue ? hue[theme] || hue[DEFAULT_THEME] : REACTOR_FALLBACK_COLOR;
}

// ============================================================================
// AREA (POLYGON) LAYERS — natural and administrative boundaries.
//
// Areas are the third mark class, after lines and points: a filled region plus
// the outline that bounds it. Unlike lines and points — whose category, layer
// id and kind are declared separately across six files — an area layer is one
// row here, read by the loader, renderer, legend and tooltip alike. This is the
// registry docs/adding-feature-types.md recommends adopting "if this list
// starts to hurt".
//
// Forests, mountain ranges, protected areas, national parks and administrative
// boundaries are all one drawn layer. On a globe with no zoom they answer the
// same question — "someone has drawn a line around this land" — and five hues
// spent on that distinction cost the palette more than they returned. The
// sub-type survives where it is actually legible: AREA_TYPES maps tags to a
// tooltip subtitle, so hovering a park still says "National Park" rather than
// "Natural Area".
//
// Fields (AREA_DEFS — the visual layer):
//   category  GPU buffer key (fill + outline pair)
//   layerId   toggle id — must be unique against LAYER_DEFS below
//   kind      picking/tooltip id
//   hue       HUES key; fill and outline are that hue at two alphas
//   subtitle  tooltip fallback when no AREA_TYPES row matched
//
// Colour: collapsing to one area hue drops the constraint that used to bind the
// four — they no longer have to separate from each other, only from the
// infrastructure palette — so this hue clears the categorical floor outright
// (worst pair ΔE 22.4 normal / 16.6 CVD, against the emerald shared by cables
// and operating reactors) at 10.9:1 over the near-black ocean. None of the four
// it replaces cleared it; they sat at ΔE 8–12.7 and leaned on being a different
// mark class. Measured on the outline, which is what carries identity — at
// AREA_FILL_ALPHA every hue collapses toward the background.
export const AREA_DEFS = [
  {
    category: "natural",
    layerId: "naturalAreas",
    kind: "naturalArea",
    label: "Natural Area",
    subtitle: "Natural Area",
    hue: "area",
  },
];

// Tag families that land on the Natural Area layer, specific rows first —
// areaDefFor() takes the first match, so a national park tagged both
// `boundary=national_park` and `boundary=administrative` reports as the park.
// `subtitle` is the whole difference between these rows: it is the tooltip's
// second line, and the fallback heading for an area whose tags carry no name.
export const AREA_TYPES = [
  {
    subtitle: "National Park",
    match: (t) => t.boundary === "national_park",
  },
  {
    subtitle: "Protected Area",
    match: (t) => t.boundary === "protected_area",
  },
  {
    subtitle: "Nature Reserve",
    match: (t) => t.leisure === "nature_reserve",
  },
  {
    subtitle: "Forest",
    match: (t) =>
      t.natural === "wood" || t.landuse === "forest" || t.boundary === "forest",
  },
  {
    subtitle: "Glacier",
    match: (t) => t.natural === "glacier",
  },
  {
    subtitle: "Mountain Range",
    match: (t) =>
      t.natural === "mountain_range" ||
      t.natural === "ridge" ||
      t["region:type"] === "mountain_area",
  },
  {
    subtitle: "Administrative Boundary",
    match: (t) => t.boundary === "administrative" || t.boundary === "maritime",
  },
];

export const AREA_CATEGORIES = AREA_DEFS.map((d) => d.category);

// Fills sit low enough to read as a tint over ocean and land without hiding the
// infrastructure drawn on top; outlines carry the layer's identity.
export const AREA_FILL_ALPHA = 0.13;
export const AREA_OUTLINE_ALPHA = 0.85;

// Live table, rewritten in place by applyTheme() — the renderer holds this
// object reference and reads it per frame, so a theme switch needs no rebind.
export const AREA_COLORS = {};

// One def per AREA_TYPES row, built once: every area on the map shares the
// layer's category/kind/colour and differs only in its subtitle, and the loader
// calls areaDefFor() once per boundary way — thousands of times per file — so
// these are interned rather than spread fresh on each hit.
const AREA_DEFS_BY_TYPE = AREA_TYPES.map((t) => ({
  ...AREA_DEFS[0],
  subtitle: t.subtitle,
}));

// The def for a tag object, or null if no area type claims it (the caller
// counts those as unmatched rather than guessing at a layer for them).
export function areaDefFor(tags) {
  if (!tags || typeof tags !== "object") return null;
  for (let i = 0; i < AREA_TYPES.length; i++) {
    if (AREA_TYPES[i].match(tags)) return AREA_DEFS_BY_TYPE[i];
  }
  return null;
}

// Layer toggle definitions (order = button order). `hue` is a HUES key, so the
// dot on a toggle is the colour that layer actually draws in, in either theme.
export const LAYER_DEFS = [
  { id: "reactors", label: "Reactors", hue: "reactorOperational" },
  { id: "hvLines", label: "HV Lines", hue: "hv" },
  { id: "mvLines", label: "MV Lines", hue: "mv" },
  { id: "cables", label: "Cables", hue: "cable" },
  { id: "substations", label: "Substations", hue: "substation" },
  { id: "plants", label: "Plants", hue: "plant" },
  { id: "railLines", label: "Railways", hue: "rail" },
  // { id: "railNodes", label: "Rail Nodes", hue: "rail" },
  { id: "telecom", label: "Telecom", hue: "telecom" },
  { id: "subseaCables", label: "Subsea Cables", hue: "telecom" },
  ...AREA_DEFS.map((d) => ({ id: d.layerId, label: d.label, hue: d.hue })),
];

// Legend rows (order = display order). `mark` picks the swatch shape: a dot for
// point layers, a line for linear ones, a filled-and-outlined box for areas —
// the same three mark classes the renderer draws, so the swatch tells you what
// shape to look for as much as what colour.
export const LEGEND_DEFS = [
  { mark: "dot", hue: "reactorOperational", label: "Reactor — Operational" },
  {
    mark: "dot",
    hue: "reactorConstruction",
    label: "Reactor — Under Construction",
  },
  { mark: "dot", hue: "reactorShutdown", label: "Reactor — Shutdown" },
  { mark: "line", hue: "hv", label: "HV Transmission (≥200kV)" },
  { mark: "line", hue: "mv", label: "MV Lines (<200kV)" },
  {
    mark: "line",
    hue: "cable",
    label: "Underground / Submarine Power Cables",
  },
  { mark: "dot", hue: "substation", label: "Substations" },
  { mark: "dot", hue: "plant", label: "Power Plants" },
  { mark: "line", hue: "rail", label: "Railways" },
  { mark: "dot", hue: "rail", label: "Rail Nodes (crossings, switches)" },
  { mark: "line", hue: "telecom", label: "Telecom Lines & Sites" },
  { mark: "line", hue: "telecom", label: "Submarine Telecom Cables" },
  ...AREA_DEFS.map((d) => ({ mark: "area", hue: d.hue, label: d.label })),
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
  // Boundary layers draw nothing until a file carrying `areas` (or a GeoJSON
  // polygon file) is added to GRID_DATA_URLS, so they cost nothing switched on.
  ...Object.fromEntries(AREA_DEFS.map((d) => [d.layerId, true])),
};

// Reactor status -> hue key. Statuses absent from REACTOR_GLOW_ALPHAS (Planned)
// fall back to the dim fallback glow, as they always have.
const REACTOR_HUES = {
  Operational: "reactorOperational",
  "Under Construction": "reactorConstruction",
  Planned: "reactorPlanned",
  "Permanent Shutdown": "reactorShutdown",
  "Suspended Operation": "reactorSuspended",
};
const REACTOR_GLOW_ALPHAS = {
  Operational: 0.6,
  "Under Construction": 0.6,
  "Permanent Shutdown": 0.4,
  "Suspended Operation": 0.4,
};

// Live tables (dot + tooltip accent, and the halo behind the dot), rewritten by
// applyTheme(). Reactor GPU colour buffers are baked from these at load time,
// so Globe.svelte re-uploads them when the theme changes.
export const REACTOR_COLORS = {};
export const REACTOR_GLOWS = {};
export const REACTOR_FALLBACK_COLOR = "#64748b";
export const REACTOR_FALLBACK_GLOW = [100, 116, 139, 0.3];

export function reactorColor(status) {
  return REACTOR_COLORS[status] || REACTOR_FALLBACK_COLOR;
}

// Drawn layer -> HUES key. The alpha comes from RENDER_ALPHAS, the hue from
// here, and applyTheme() combines them into RENDER_COLORS.
const RENDER_HUES = {
  mvLines: "mv",
  hvLines: "hv",
  cables: "cable",
  substations: "substation",
  plants: "plant",
  railLines: "rail",
  railNodes: "rail",
  telecomLines: "telecom",
  telecomPoints: "telecom",
  subseaCables: "telecom",
};

// Per-theme alpha for each of those. WebGL rasterizes 1px lines, so the dark
// alphas are tuned slightly up from the original canvas strokeStyle values
// (which used sub-pixel/1.4px widths) to keep the same visual weight.
//
// The light column runs heavier throughout. Two reasons: the light hues are
// dark ink on a pale ground rather than light ink on a dark one, so alpha
// lightens them toward the background instead of dimming them toward it; and
// the near-white ocean has none of the near-black ocean's tolerance for a faint
// line. The *relative* weights are preserved — rail and MV stay the lightest,
// telecom the heaviest — because that ordering is what keeps dense background
// context from burying the layers drawn over it.
const RENDER_ALPHAS = {
  // Rail is dense background context, so it sits at a low alpha like mvLines;
  // telecom is only ~90 lines and can afford to read solid.
  dark: {
    mvLines: 0.22,
    hvLines: 0.5,
    cables: 0.35,
    substations: 0.55,
    plants: 0.6,
    railLines: 0.28,
    railNodes: 0.5,
    telecomLines: 0.6,
    telecomPoints: 0.7,
    // Sits just under the land telecom alpha: ~11.6k segments of uninterrupted
    // open-ocean arc read heavier than the same alpha does over land clutter.
    subseaCables: 0.5,
  },
  light: {
    mvLines: 0.38,
    hvLines: 0.6,
    cables: 0.5,
    substations: 0.7,
    plants: 0.75,
    railLines: 0.4,
    railNodes: 0.6,
    telecomLines: 0.75,
    telecomPoints: 0.85,
    subseaCables: 0.6,
  },
};

// Everything that is not a data layer: the ocean, the land, and the furniture
// drawn around them.
const BACKDROPS = {
  dark: {
    graticule: [1, 1, 1, 0.02],
    land: hexToVec4("#0d1117", 0),
    oceanFlat: hexToVec4("#0d1117", 1),
    oceanInner: hexToVec4("#131922", 1),
    oceanOuter: hexToVec4("#0a0e14", 1),
    sphereOutline: hexToVec4("#22d3ee", 0.08),
    atmosphere: hexToVec4("#22d3ee", 0.04),
  },
  light: {
    graticule: hexToVec4("#334155", 0.1),
    // The dark theme leaves land unpainted (alpha 0) — ocean and land are both
    // near-black there and the coastline is drawn by whatever sits on it. On a
    // light map the two have to separate, so land takes an opaque near-white
    // over the ocean's blue. Opaque, not a tint: country fills are triangulated
    // per polygon, and any alpha below 1 shows the seams where they meet.
    land: hexToVec4("#f7f9fb", 1),
    oceanFlat: hexToVec4("#dbe6f2", 1),
    oceanInner: hexToVec4("#e3ecf6", 1),
    oceanOuter: hexToVec4("#c6d7e8", 1),
    sphereOutline: hexToVec4("#0e7490", 0.35),
    atmosphere: hexToVec4("#0e7490", 0.1),
  },
};

// WebGL render colors as [r, g, b, a] in 0-1. Live table, rewritten in place by
// applyTheme(); the renderer reads it per frame.
export const RENDER_COLORS = {};

// Point every derived colour table at a theme. Called once at module load and
// again on every theme switch — always in place, never by replacing the
// exported objects, since the renderer captured those references at import.
export function applyTheme(theme) {
  activeTheme = THEMES.includes(theme) ? theme : DEFAULT_THEME;

  Object.assign(RENDER_COLORS, BACKDROPS[activeTheme]);
  for (const [layer, hue] of Object.entries(RENDER_HUES)) {
    RENDER_COLORS[layer] = hexToVec4(
      hueFor(hue),
      RENDER_ALPHAS[activeTheme][layer],
    );
  }

  for (const d of AREA_DEFS) {
    AREA_COLORS[d.category] = {
      fill: hexToVec4(hueFor(d.hue), AREA_FILL_ALPHA),
      outline: hexToVec4(hueFor(d.hue), AREA_OUTLINE_ALPHA),
    };
  }

  for (const [status, hue] of Object.entries(REACTOR_HUES)) {
    const hex = hueFor(hue);
    REACTOR_COLORS[status] = hex;
    const alpha = REACTOR_GLOW_ALPHAS[status];
    if (alpha) REACTOR_GLOWS[status] = [...hexRgb(hex), alpha];
  }

  return activeTheme;
}

export function hexToVec4(hex, alpha = 1) {
  const [r, g, b] = hexRgb(hex);
  return [r / 255, g / 255, b / 255, alpha];
}

// Channel bytes of a #rrggbb string.
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Same colour as a CSS string, for the legend and toggle swatches.
export function hexToCss(hex, alpha = 1) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Populate the live colour tables before anything imports them to draw with.
applyTheme(DEFAULT_THEME);
