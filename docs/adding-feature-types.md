# Adding new path and node types

How to take a new feature type out of a JSON extract and get it drawn, toggleable,
legible in the legend, and hoverable.

## Three ID namespaces

Most mistakes here are a name that matches in two places out of three.

| Namespace | Lives in | Examples | Joins |
|---|---|---|---|
| **category** | `LINE_CATEGORIES`, `acc.chunks`, `renderer.grid` | `rail`, `mv`, `hv`, `cable` | loader → GPU line buffer |
| **layer id** | `LAYER_DEFS`, `INITIAL_LAYERS`, `RENDER_COLORS`, `s.layers.*` | `railLines`, `railNodes`, `telecom` | toggle button → draw call |
| **kind** | point objects, `SpatialGrid`, `layersOn`, `tooltipContent` | `railNode`, `telecomPoint`, `substation` | picking → tooltip |

A category and its layer id are deliberately *not* the same string (`rail` ↔
`railLines`), because one line category can have several layer ids and vice versa.

## Before you start: identify the schema

Two file shapes reach `loadGridData.js`, discriminated by `typeof line.t`:

- **power extract** — `t` is a type string (`"cable"`), `v` is voltage in volts;
  points arrive in `substations` / `plants` arrays.
- **tagged extract** — `t` is the raw OSM tag object (`{railway: "rail"}`), there
  is no `v`, and points arrive in a generic `points` array.

Check a new file before writing any code:

```bash
node -e 'const d=require("./public/data/YOUR.json");
console.log(Object.keys(d), d.meta);
console.log(JSON.stringify(d.lines?.[0]), JSON.stringify(d.points?.[0]));'
```

If it is neither shape — a new top-level container key — you need a new block in
`ingestFile()` rather than the steps below.

---

## A. New path (line) type

Example: pipelines arriving as `{"c": [...], "t": {"man_made": "pipeline"}}`.

1. **`src/lib/loadGridData.js` → `categoryOf()`** (~line 60). Add the tag → category
   mapping inside the object-`t` branch:
   ```js
   if (t.man_made === 'pipeline') return 'pipeline';
   ```
   Unmapped tags return `null` and are counted into `skippedLines` rather than
   guessed at — that is what stops a new type being silently drawn as MV power.

2. **`src/lib/loadGridData.js` → `LINE_CATEGORIES`** (line 48). Add `'pipeline'`.
   **Array position = draw order** (earlier = underneath). Everything else in the
   loader — segment counting, writers, chunks, merged GPU buffers, totals — is
   driven off this array, so there is nothing else to change in the loader.

3. **`src/lib/config.js` → `RENDER_COLORS`.** Add `pipelines: [r, g, b, a]` as
   0–1 floats. Validate the hue first (see "Choosing a colour").

4. **`src/lib/config.js` → `LAYER_DEFS` + `INITIAL_LAYERS`.** Add the toggle. Every
   id in `LAYER_DEFS` needs a matching key in `INITIAL_LAYERS` or the button
   renders permanently inactive.

5. **`src/lib/webgl/renderer.js` → constructor `this.grid`** (line 74). Add
   `pipeline: null`. `setGrid()` is generic and needs no change.

6. **`src/lib/webgl/renderer.js` → `render()` section 5** (lines 284–288). Add the
   draw call in the z-order you want:
   ```js
   if (s.layers.pipelines) gridDraw(this.grid.pipeline, RENDER_COLORS.pipelines);
   ```

7. **`src/components/Legend.svelte`.** Add a `.legend-item` row and its
   `.legend-line.pipeline` CSS rule.

---

## B. New node (point) type

Example: airports arriving in `points` as `{"lo":…, "la":…, "t":{"aeroway":"aerodrome"}}`.

1. **`src/lib/loadGridData.js` → skip guard** (~line 152). Extend the early-out or
   the new points are all counted as `skippedPoints`:
   ```js
   if (!t || typeof t !== 'object' || (!t.railway && !t.telecom && !t.aeroway)) {
   ```

2. **`src/lib/loadGridData.js` → the `data.points` loop** (~line 148). Add a branch.
   Push coordinates for *every* point, but build an object only for the hoverable
   subset:
   ```js
   } else if (t.aeroway) {
     acc.airportCoords.push(p.lo, p.la);
     if (PICKABLE_AEROWAY.has(t.aeroway)) {
       acc.pickable.push({ lon: p.lo, lat: p.la, name: humanize(t.aeroway), kind: 'airport' });
     }
   }
   ```
   See "Pick-index budget" below — this split is the whole reason 630k rail nodes
   render at full frame rate.

3. **`src/lib/loadGridData.js` → `acc` init** (~line 223). Add `airportCoords: []`.

4. **`src/lib/loadGridData.js` → return block** (~line 287). Add
   `airportPositions: coordPositions(acc.airportCoords)` and a `counts.airports`
   entry.

5. **`src/lib/config.js`.** Add `PICKABLE_AEROWAY` (if high-cardinality),
   `RENDER_COLORS.airports`, `LAYER_DEFS`, `INITIAL_LAYERS`.

6. **`src/lib/webgl/renderer.js`.** Add `airports: null` to `this.points`
   (line 75), and a draw call in `render()` section 6 (~line 299):
   ```js
   if (s.layers.airports) pointDraw(this.points.airports, RENDER_COLORS.airports, 4);
   ```
   The third argument is point size in px; 2 for dense furniture, 3–4 for
   notable features.

7. **`src/components/Globe.svelte` → `renderer.setPoints({...})`** (line 246). Add
   `airports: result.airportPositions`. The key must match the `this.points` key.

8. **`src/components/Globe.svelte` → `layersOn` in `handleHover()`** (line 147). Add
   `airport: currentLayers.airports`. **Miss this and hover silently never fires** —
   `pick()` rejects any kind not present in `layersOn`.

9. **`src/lib/picking.js` → `tooltipContent()`** (~line 61). Add a branch for the new
   `kind`. **Miss this and the function falls through to its "Power Plant"
   default**, mislabelling every airport as a power plant.

10. **`src/components/Legend.svelte`.** Add the row and `.legend-dot.airport` CSS.

Nothing needs to change in `spatialGrid.js` — `Globe.svelte` already inserts all of
`result.pickableFeatures` into the one grid.

---

## Cross-cutting rules

### Choosing a colour
Run the validator before committing a hue — do not eyeball it:

```bash
cd <dataviz-skill>/ && node scripts/validate_palette.js \
  "#10b981,#f59e0b,#38bdf8,#a78bfa,#fb923c,#f472b6,#a3e635,#YOURHEX" \
  --mode dark --pairs all
```

Target normal-vision ΔE ≥ 15 and CVD ΔE ≥ 8 against **every** existing hue (the map
shows all layers at once, so `--pairs all`, not adjacent-only). The palette is
crowded: emerald, amber, sky, purple, orange, red, pink and lime are taken, and
amber↔orange is already a pre-existing collision at ΔE 4.2. Prefer giving a related
sub-type the *same* hue with a different mark shape (as railways/rail nodes do)
over minting a new one.

### Pick-index budget
Render everything; index only what a user could actually single out. The globe has
no zoom, so the 14px pick radius always spans ~2° of map — over a dense network that
is tens of thousands of identical dots, and there is no "the one you meant" to
report. Rule of thumb: keep `counts.pickableFeatures` in the low thousands. Measure
it:

```js
console.log(result.counts.pickableFeatures);
```

Indexing all 630k rail nodes put 117k candidates per mousemove through projection
math; the allowlist brings it to ~7.6k indexed total and 2.5ms worst-case picks.

### Verify after adding a file
Check the console line the loader emits:

```
loadGridData: skipped N untyped lines and M untagged points (no layer to draw them on)
```

A large `N` means `categoryOf()` has no branch for a tag family that is actually in
the file — the new type is being dropped, not drawn. `M` is expected to be non-zero
(points whose tags were filtered out of the extract carry no identity).

---

## If this list starts to hurt

Nine files-worth of edits per type is the current cost because category, layer, and
kind are declared separately in the loader, config, renderer, globe, picking, and
legend. If several more types are coming, collapse steps 3–7 (and B's 5–10) into one
declarative registry — a single array of
`{ category, layerId, kind, tag, color, size, pickable, legend }` records that the
loader, renderer, legend, and tooltip all read. That turns "add a type" into one
table row plus a `categoryOf()` line, and makes the three namespaces impossible to
mismatch.
