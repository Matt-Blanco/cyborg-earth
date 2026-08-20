<script>
  import { layers, toggleLayer, theme } from '../lib/stores.js';
  import { LAYER_DEFS, hueFor } from '../lib/config.js';
</script>

<div class="layer-toggles">
  {#each LAYER_DEFS as def (def.id)}
    <button
      class="toggle-btn"
      class:active={$layers[def.id]}
      aria-pressed={$layers[def.id]}
      onclick={() => toggleLayer(def.id)}
    >
      <span class="indicator" style="background:{hueFor(def.hue, $theme)}"></span
      >{def.label}
    </button>
  {/each}
</div>

<style>
  .layer-toggles {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .toggle-btn {
    font-family: 'Inter', monospace;
    font-size: 10px;
    letter-spacing: 0.5px;
    padding: 7px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toggle-btn:hover {
    border-color: var(--border-hover);
    color: var(--text);
  }

  .toggle-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-glow);
  }

  .toggle-btn .indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
</style>
