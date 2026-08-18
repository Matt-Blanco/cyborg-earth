<script>
  // Swatch colours come from the same HUES table the renderer draws with, so a
  // theme switch moves the legend and the map together and neither can drift.
  import { theme } from '../lib/stores.js';
  import {
    LEGEND_DEFS,
    AREA_FILL_ALPHA,
    AREA_OUTLINE_ALPHA,
    hueFor,
    hexToCss,
  } from '../lib/config.js';

  // Lines fade left-to-right the way they do on the map, where a run of track
  // is denser at its core than at its ends.
  const lineSwatch = (hex) =>
    `linear-gradient(90deg, ${hexToCss(hex, 0.85)}, ${hexToCss(hex, 0.3)})`;
</script>

<div class="legend">
  {#each LEGEND_DEFS as def (def.label)}
    {@const hex = hueFor(def.hue, $theme)}
    <div class="legend-item">
      {#if def.mark === 'dot'}
        <div
          class="legend-dot"
          style="background:{hex}; box-shadow: 0 0 6px {hexToCss(hex, 0.5)}"
        ></div>
      {:else if def.mark === 'line'}
        <div class="legend-line" style="background:{lineSwatch(hex)}"></div>
      {:else}
        <!-- Areas: the fill tint inside the outline colour, as they read on the map. -->
        <div
          class="legend-area"
          style="background:{hexToCss(hex, AREA_FILL_ALPHA)};
                 border-color:{hexToCss(hex, AREA_OUTLINE_ALPHA)}"
        ></div>
      {/if}
      <span>{def.label}</span>
    </div>
  {/each}
</div>

<style>
  .legend {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 6px 18px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-line {
    width: 16px;
    height: 2px;
    flex-shrink: 0;
    border-radius: 1px;
  }

  .legend-area {
    width: 14px;
    height: 9px;
    flex-shrink: 0;
    border: 1px solid;
    border-radius: 2px;
  }
</style>
