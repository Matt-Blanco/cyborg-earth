# Adding new path, node and area types

How to take a new feature type out of a JSON extract and get it drawn, toggleable,
legible in the legend, and hoverable.

**Areas are different: see section C first.** Boundary polygons go through a
declarative registry and cost one table row, not the nine-file walk below.

## Three ID namespaces

Most mistakes here are a name that matches in two places out of three.

| Namespace | Lives in | Examples | Joins |
|---|---|---|---|
| **category** | `LINE_CATEGORIES`, `acc.chunks`, `renderer.grid` | `rail`, `subsea`, `mv`, `hv`, `cable` | loader → GPU line buffer |
| **layer id** | `LAYER_DEFS`, `INITIAL_LAYERS`, `RENDER_COLORS`, `s.layers.*` | `railLines`, `railNodes`, `telecom` | toggle button → draw call |
| **kind** | point objects, `SpatialGrid`, `layersOn`, `tooltipContent` | `railNode`, `telecomPoint`, `substation` | picking → tooltip |

A category and its layer id are deliberately *not* the same string (`rail` ↔
`railLines`), because one line category can have several layer ids and vice versa.

For areas all three names live in one `AREA_DEFS` row, so they cannot drift apart —
and there is currently only one such row (see section C).

## Before you start: identify the schema

Three file shapes reach `loadGridData.js`:

- **power extract** — `t` is a type string (`"cable"`), `v` is voltage in volts;
  points arrive in `substations` / `plants` arrays.
- **tagged extract** — `t` is the raw OSM tag object (`{railway: "rail"}`), there
  is no `v`, and points arrive in a generic `points` array. Polygons arrive in an
  `areas` array as `{r: [outerRing, ...holes], t: {...}}`.
- **plain GeoJSON** — a `FeatureCollection`. `normalizeGeoJSON()` rewrites it into
  the tagged shape on load (`properties` becomes `t`), splitting Multi* geometries
  into one entry each. Drop a boundary `.geojson` straight into `GRID_DATA_URLS`.
  An entry there is a bare filename under `data/`, so the file has to exist in
  both places it is read from: `public/data/` for `vite dev`, and the R2 bucket
  (`GRID_DATA_BUCKET_URL`) for a production build.

Lines and areas are discriminated by `typeof t`: an object means tags, a string
means the power extract's type field.

Check a new file before writing any code:

```bash
node -e 'const d=require("./public/data/YOUR.json");
console.log(Object.keys(d), d.meta);
console.log(JSON.stringify(d.lines?.[0]), JSON.stringify(d.areas?.[0]), JSON.stringify(d.points?.[0]));'
```

If it is none of these — a new top-level container key — you need a new block in
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

## C. New area (boundary polygon) type

Example: wetlands arriving as `{"r": [[[lon,lat], ...]], "t": {"natural": "wetland"}}`,
or the same thing as GeoJSON `Polygon` features.

Areas are a registry, not a walk, and it is split in two:

| | Lives in | One row per | Carries |
|---|---|---|---|
| **`AREA_DEFS`** | `src/lib/config.js` | *drawn layer* | category, layerId, kind, label, colour |
| **`AREA_TYPES`** | `src/lib/config.js` | *tag family* | `match()` and a tooltip `subtitle` |

Today `AREA_DEFS` has exactly one row — **Natural Area** — and every boundary tag
family lands on it. Forests, mountain ranges, protected areas, national parks and
administrative boundaries are all "someone drew a line around this land", which on
a globe with no zoom is one question, not five, and five hues spent separating
them cost the palette more than they returned.

**So most new boundary types are one row in `AREA_TYPES`:**

```js
{ subtitle: 'Wetland', match: (t) => t.natural === 'wetland' }
```

That gets the polygons drawn, toggled, legended and hovered — the tooltip reads
"Wetland" over the shared Natural Area colour. Add a row to `AREA_DEFS` instead
only when the new type genuinely needs its own toggle and hue, and read
"Choosing a colour" first: a second area layer re-imposes the separation
constraint that collapsing to one lifted.

The loader, renderer, legend, tooltip and toggle bar all iterate `AREA_DEFS`, so a
new row there brings its buffer, draw call, legend entry, hover kind and toggle
with it. `INITIAL_LAYERS` picks the id up automatically too.

Things worth knowing:

- **Closed ways count as rings.** Boundary extracts routinely deliver polygons in
  `lines` rather than `areas` — an Overpass query for `boundary=protected_area`
  exports boundary *ways*. `ingestFile()` promotes any line that no line category
  claims and that `areaDefFor()` matches. A **line category always wins**: a
  railway crossing a national park stays a railway.
- **A way that encloses nothing is stroked, not filled.** Open fragments of a
  piecemeal relation, and rings flattened to `[a, b, a]` by coordinate rounding,
  go into the layer's outline buffer with no fill and no hover entry. Watch
  `counts.strokeOnlyAreas` — a high ratio against `counts.areas` means the source
  was exported at too coarse a precision, not that the tags were wrong. At 3
  decimal places (~110 m) roughly half of a small-reserve extract collapses.
- **Fills draw before outlines**, across all categories. A large region laid over
  a small one must not bury the smaller one's border, because at
  `AREA_FILL_ALPHA` the fill is only a tint and the *outline* is what identifies
  the layer. Keep it that way if you touch `render()` section 4b.
- **First match wins.** `areaDefFor()` returns the first `AREA_TYPES` row whose
  `match()` passes, so put specific types above general ones — a national park
  tagged both `boundary=national_park` and `boundary=administrative` should report
  as the park.
- **Every area is pickable.** Unlike rail nodes there is no allowlist: areas
  number in the hundreds or low thousands and "what region is this?" is the whole
  point of the layer. Hover resolves to the *smallest* containing area, so a
  forest inside a national park reports the forest.
- **Points beat areas** in `handleHover()`. A substation is a 3px target the user
  aimed at; an area is whatever lies underneath.
- **Colour** follows a different rule than lines — see below.

### Antimeridian

Rings that cross ±180° are detected (`ringCrossesSeam`) and rewritten into a
continuous longitude frame at load (`unwrapRing`), so 175 → −175 becomes
175 → 185. This matters more than it sounds: earcut on the raw coordinates
triangulates the *complement* of the shape — a 10°-wide reserve becomes a
350°-wide one. Rendering is unaffected by the unwrap because sin/cos of longitude
are periodic, and `AreaIndex` compensates on the CPU side by testing the cursor
at `x`, `x ± 360`.

The one shape this cannot resolve is a polygon that genuinely spans more than half
the globe in a single ring (Antarctica, Russia as one piece): "crosses the seam"
and "is enormous" are indistinguishable from the coordinates alone. Pre-split
those at the antimeridian in the source — standard GeoJSON tooling does this, and
it is what `sea-telecom-cables.json` already ships.

### Triangle budget

`triangulateRings(polys, 4)` subdivides until no triangle edge exceeds 4°, which
is what keeps the horizon clip and seam unwrap accurate on the globe. Cost scales
with *area*, not vertex count: one continent-sized polygon can outweigh a thousand
forests. Check it after adding a file:

```js
console.log(result.counts.areas, result.counts.areaTriangles);
```

If a coarse layer is dominating, raise the `maxDeg` argument for that call rather
than simplifying the source geometry.

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

For a **line or point** layer the hue pool is now effectively exhausted — an
exhaustive search over ~35 candidates found nothing clearing both floors against
the eight in use that was also legible on the near-black ocean. Submarine cables
took the shared-hue route for this reason.

**Areas used to play by a different rule** — separation required *within*
`AREA_DEFS`, merely reported against the line hues, on the grounds that a closed
ring enclosing a filled region is a different mark class from a 1px filament.
That exemption paid for four area hues sitting at ΔE 8–12.7 against the
infrastructure palette. Collapsing them into one Natural Area layer spent the
exemption instead of the palette: with nothing to separate *from* inside the
registry, the single hue clears the full categorical floor against every line and
point colour in use (worst pair ΔE 22.4 normal / 16.6 CVD, against the emerald of
cables and operating reactors) at 10.9:1 over the ocean.

Keep it that way. If you add a second area layer you re-inherit the old
trade-off, so validate the new hue against **both** the area and line palettes and
take the mark-class exemption only if nothing clears both. Note that hue
separation is measured on the **outline**, not the fill — at `AREA_FILL_ALPHA`
over a dark ocean every hue collapses toward the background, so the fill cannot
carry identity.

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
loadGridData: skipped N untyped lines, P unmatched areas and M untagged points (no layer to draw them on)
```

A large `N` or `P` means `categoryOf()` / `areaDefFor()` has no branch for a tag
family that is actually in the file — the new type is being dropped, not drawn. `M`
is expected to be non-zero (points whose tags were filtered out of the extract carry
no identity).

A boundary file may emit a second line:

```
loadGridData: K boundary ways enclose no area (open fragments, or rings flattened by coordinate rounding) — drawn as outlines only...
```

Those *are* drawn, so this is a fidelity warning, not a dropped-data one. Compare
`K` against `counts.areas` before re-fetching anything.

---

## If this list starts to hurt

Lines and points still cost seven-to-ten files-worth of edits per type, because
category, layer and kind are declared separately in the loader, config, renderer,
globe, picking and legend.

**Areas already took the cure**: `AREA_DEFS` / `AREA_TYPES` are the declarative
registry this section used to recommend, and adding a boundary type is one table
row — usually in `AREA_TYPES`, which costs no new hue at all. If another
line or point type family arrives, fold `LINE_CATEGORIES` / `LAYER_DEFS` /
`RENDER_COLORS` into the same shape — a single array of
`{ category, layerId, kind, match, color, size, pickable }` records that the loader,
renderer, legend and tooltip all read — and copy how `AREA_DEFS` is consumed in
`renderer.js` section 4b, `Legend.svelte`, and `handleHover()`.
