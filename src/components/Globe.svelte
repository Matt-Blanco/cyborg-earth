<script>
  // Owns the WebGL canvas: renderer lifecycle, drag/inertia interaction,
  // resize, hover picking, and data loading. D3 handles all GeoJSON and
  // projection math on the CPU (picking, uniform calibration); the WebGL
  // renderer mirrors the same projection on the GPU for drawing.
  import { onMount } from 'svelte';
  import { geoRotation, geoGraticule10 } from 'd3-geo';
  import { feature } from 'topojson-client';
  import { GlobeRenderer, rotationMatrix } from '../lib/webgl/renderer.js';
  import { segmentBuffer, triangulateCountries } from '../lib/webgl/geometry.js';
  import { PROJECTIONS, isGlobeKey, gpuParamsFor } from '../lib/projections.js';
  import { loadGridData } from '../lib/loadGridData.js';
  import { SpatialGrid, AreaIndex } from '../lib/spatialGrid.js';
  import { reactors, reactorBuffers } from '../lib/reactors.js';
  import { pick, pickArea, tooltipContent } from '../lib/picking.js';
  import {
    GRID_DATA_URLS,
    WORLD_ATLAS_URL,
    AREA_DEFS,
    reactorColor,
    hexToVec4,
  } from '../lib/config.js';
  import { projectionKey, layers, theme, tooltip, showStatus } from '../lib/stores.js';

  let canvas;
  let glowEl;

  onMount(() => {
    let renderer;
    try {
      renderer = new GlobeRenderer(canvas);
    } catch (e) {
      showStatus(String(e.message || e), false);
      console.error(e);
      return;
    }

    // --- state ---------------------------------------------------------
    let width = 0;
    let height = 0;
    let radius = 0;
    const dpr = window.devicePixelRatio || 1;
    let projKey = 'orthographic';
    let projection = PROJECTIONS[projKey].factory();
    let currentLayers = {};
    let rotX = 38; // centered on US, no auto-rotate (as original)
    let rotY = 95;
    let drag = false;
    let lastM = null;
    let vel = { x: 0, y: 0 };
    let hovered = null;
    let dirty = true;
    let disposed = false;
    let hasReactors = false;
    const grid = new SpatialGrid();
    const areaIndex = new AreaIndex();
    const rad = Math.PI / 180;

    const isGlobe = () => isGlobeKey(projKey);

    // --- layout ----------------------------------------------------------
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      radius = Math.min(width, height) * 0.38;
      if (isGlobe()) {
        projection.translate([width / 2, height / 2]).scale(radius);
      } else {
        const s2d = Math.min(width / 6.5, height / 3.5);
        projection.translate([width / 2, height / 2]).scale(s2d);
      }
      projection.rotate([-rotY, -rotX, 0]);
      glowEl.style.width = glowEl.style.height = radius * 2.4 + 'px';
      glowEl.style.left = width / 2 - radius * 1.2 + 'px';
      glowEl.style.top = height / 2 - radius * 1.2 + 'px';
      glowEl.style.display = isGlobe() ? 'block' : 'none';
      dirty = true;
    }

    // --- store subscriptions ----------------------------------------------
    const unsubs = [
      projectionKey.subscribe((key) => {
        if (!PROJECTIONS[key]) return;
        projKey = key;
        projection = PROJECTIONS[key].factory();
        if (width) resize();
      }),
      layers.subscribe((l) => {
        currentLayers = l;
        dirty = true;
      }),
      // The renderer reads RENDER_COLORS / AREA_COLORS per frame, so those
      // follow the theme on their own — but reactor colours are baked into GPU
      // buffers at load time and have to be rebuilt.
      theme.subscribe(() => {
        if (hasReactors) renderer.setReactors(reactorBuffers());
        dirty = true;
      }),
    ];

    // --- interaction -------------------------------------------------------
    function applyDrag(cx, cy) {
      const dx = cx - lastM.x;
      const dy = cy - lastM.y;
      rotY += dx * 0.3;
      rotX -= dy * 0.3;
      rotX = Math.max(-80, Math.min(80, rotX));
      lastM = { x: cx, y: cy };
      dirty = true;
      return { dx, dy };
    }

    const onMouseDown = (e) => {
      drag = true;
      lastM = { x: e.clientX, y: e.clientY };
      vel = { x: 0, y: 0 };
    };
    const onMouseMove = (e) => {
      if (drag && lastM) {
        const { dx, dy } = applyDrag(e.clientX, e.clientY);
        vel = { x: dx * 0.3, y: -dy * 0.3 };
      }
      // Dragging is tracked on the window so it survives the pointer leaving
      // the canvas; hovering is not. With the controls panel over the map there
      // is nothing on the map being pointed at, so drop the hover instead.
      if (e.target === canvas) handleHover(e.clientX, e.clientY);
      else if (hovered) clearHover();
    };
    const onMouseUp = () => {
      drag = false;
      lastM = null;
    };
    const onTouchStart = (e) => {
      e.preventDefault();
      drag = true;
      lastM = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      if (drag && lastM) applyDrag(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => {
      drag = false;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    window.addEventListener('resize', resize);

    // --- hover / tooltip ---------------------------------------------------
    function clearHover() {
      hovered = null;
      tooltip.set(null);
      dirty = true;
    }

    function handleHover(mx, my) {
      const layersOn = {
        reactor: currentLayers.reactors,
        substation: currentLayers.substations,
        plant: currentLayers.plants,
        railNode: currentLayers.railNodes,
        telecomPoint: currentLayers.telecom,
      };
      for (const d of AREA_DEFS) layersOn[d.kind] = currentLayers[d.layerId];
      // Point features win over areas — see pickArea().
      const item =
        pick(grid, projection, mx, my, layersOn, isGlobe(), [width, height]) ||
        pickArea(areaIndex, projection, mx, my, layersOn, isGlobe(), [width, height]);
      if (item !== hovered) {
        hovered = item;
        dirty = true;
      }
      if (item) {
        let tx = mx + 16;
        let ty = my - 10;
        if (tx + 280 > width) tx = mx - 290;
        if (ty + 160 > height) ty = my - 160;
        tooltip.set({ x: tx, y: ty, ...tooltipContent(item, reactorColor) });
      } else {
        tooltip.set(null);
      }
    }

    // --- render loop ---------------------------------------------------------
    function frame() {
      if (disposed) return;
      requestAnimationFrame(frame);

      if (!drag && (vel.x !== 0 || vel.y !== 0)) {
        rotY += vel.x;
        rotX += vel.y;
        vel.x *= 0.92;
        vel.y *= 0.92;
        if (Math.abs(vel.x) < 0.001) vel.x = 0;
        if (Math.abs(vel.y) < 0.001) vel.y = 0;
        dirty = true;
      }
      rotX = Math.max(-80, Math.min(80, rotX));

      const animating = currentLayers.reactors && hasReactors;
      if (!dirty && !animating) return;
      dirty = false;

      projection.rotate([-rotY, -rotX, 0]);

      // Calibrate GPU uniforms against the live D3 projection: the point at
      // the rotated origin projects to uOffset (raw(0,0) = (0,0) for every
      // raw projection we implement).
      const origin = geoRotation(projection.rotate()).invert([0, 0]);
      const offset = projection(origin) || [width / 2, height / 2];

      const hover =
        hovered && hovered.kind === 'reactor'
          ? {
              kind: 'reactor',
              lon: hovered.lon,
              lat: hovered.lat,
              colorVec4: hexToVec4(reactorColor(hovered.status)),
            }
          : null;

      renderer.render({
        gpu: gpuParamsFor(projKey, projection),
        rotateMat3: rotationMatrix(-rotY * rad, -rotX * rad),
        scale: projection.scale(),
        offset,
        viewport: [width, height],
        dpr,
        layers: currentLayers,
        isGlobe: isGlobe(),
        time: (performance.now() / 1000) * 1.8,
        gradient: {
          center: [
            (width / 2 - radius * 0.3) * dpr,
            (height - (height / 2 - radius * 0.3)) * dpr,
          ],
          radius: radius * 1.3 * dpr,
        },
        hover,
      });
    }

    // --- data loading ----------------------------------------------------------
    async function loadWorld() {
      try {
        const topo = await fetch(WORLD_ATLAS_URL).then((r) => r.json());
        const countries = feature(topo, topo.objects.countries);
        renderer.setCountries(triangulateCountries(countries.features, 4));
      } catch (e) {
        console.error('Failed to load world atlas:', e);
      }
      renderer.setGraticule(segmentBuffer(geoGraticule10().coordinates, 2));
      dirty = true;
    }

    async function loadGrid() {
      const result = await loadGridData(GRID_DATA_URLS, showStatus);
      if (!result || disposed) return;
      renderer.setGrid(result.gpu);
      renderer.setAreas(result.areaGpu);
      renderer.setPoints({
        substations: result.substationPositions,
        plants: result.plantPositions,
        railNodes: result.railNodePositions,
        telecomPoints: result.telecomPointPositions,
      });
      for (const s of result.substations) grid.insert(s);
      for (const p of result.plants) grid.insert(p);
      for (const f of result.pickableFeatures) grid.insert(f);
      for (const a of result.pickableAreas) areaIndex.insert(a);
      dirty = true;
    }

    function loadReactors() {
      if (!reactors.length) return;
      renderer.setReactors(reactorBuffers());
      for (const r of reactors) grid.insert(r);
      hasReactors = true;
      dirty = true;
    }

    resize();
    loadWorld();
    loadGrid();
    loadReactors();
    requestAnimationFrame(frame);

    return () => {
      disposed = true;
      unsubs.forEach((u) => u());
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<div id="globe-container">
  <div class="globe-glow" bind:this={glowEl}></div>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  #globe-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  canvas {
    cursor: grab;
  }

  canvas:active {
    cursor: grabbing;
  }

  .globe-glow {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    background: radial-gradient(
      circle,
      var(--glow-inner) 0%,
      var(--glow-outer) 40%,
      transparent 70%
    );
  }
</style>
