# Global Energy Infrastructure Globe

OpenStreetMap power-grid data (lines, cables, substations, plants) plus the
GeoNuclearData reactor list, rendered on an interactive globe / 2D map.
Refactored from a single `globe.html` (archived in `legacy/`) into a
Svelte + Vite project with a WebGL2 renderer.

## Run

Requires Node 18+ (the machine's global Node 8 is too old — install a current
LTS from nodejs.org or use nvm-windows).

```sh
npm install
npm run dev       # dev server
npm run build     # production build -> dist/
npm run preview   # serve the production build
```

## Why WebGL

The original page re-projected every visible power-line vertex on the CPU
(D3 + 2D canvas) each time the view changed, which made panning slow even on
a fast machine. Now:

- All grid geometry is quantized to int16 lon/lat and uploaded to GPU buffers
  **once** at load time.
- The vertex shader ports d3-geo's projection math (sphere rotation + all 16
  raw projections), so panning/rotating only updates a handful of uniforms —
  no per-frame CPU geometry work at all.
- D3 is still used for GeoJSON management, hover picking, and calibrating the
  GPU uniforms, so CPU picking and GPU rendering agree exactly.
- Antimeridian/seam handling: vertices carry their segment midpoint (or
  triangle centroid) and unwrap longitude toward it; out-of-domain fragments
  are discarded. Horizon clipping on the globe is a per-fragment test.
- Frames render only when something changed (drag, inertia, toggle, or the
  reactor pulse animation).

## Layout

```
public/data/            compact_power.py output JSONs (edit src/lib/config.js to add more)
src/
  App.svelte            component composition
  components/
    Globe.svelte        canvas, interaction, render loop, data loading
    ProjectionSelect / LayerToggles / Legend / Tooltip / LoadStatus / Header
  lib/
    config.js           data URLs, layer defs, colors
    stores.js           shared Svelte stores (projection, layers, tooltip, status)
    projections.js      D3 projection registry + GPU projection mapping
    loadGridData.js     compact JSON -> int16 GPU segment buffers + point lists
    spatialGrid.js      5°x5° point index for hover picking
    picking.js          hover hit-testing + tooltip content
    reactors.js         embedded reactor dataset -> GPU buffers
    reactors-data.json  GeoNuclearData (was commented out in the original)
    webgl/
      shaders.js        GLSL: d3-geo raw projections on the GPU
      geometry.js       triangulation, subdivision, mesh builders
      renderer.js       GL context, buffers, draw passes
legacy/globe.html       the original single-file implementation
```

## Notes vs. the original

- Default projection is Orthographic (the original's `<select>` said
  Orthographic but its internal state started on Natural Earth — the select
  now tells the truth).
- Layer toggle buttons now reflect the actual initial layer state (the
  original rendered all buttons "active" while half the layers were off).
- The reactor dataset that was commented out in `globe.html` is included, so
  the Reactors toggle works; the layer still starts hidden.
- Mollweide, Sinusoidal, and Eckert IV now actually work — the original
  loaded only the core d3 bundle, which doesn't include them
  (`d3.geoMollweide` was undefined); they come from `d3-geo-projection`.
- WebGL rasterizes 1-pixel lines (no fractional widths); line alphas are
  tuned to preserve the original visual weight.
