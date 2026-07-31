<script>
  import { layers, toggleLayer } from '../lib/stores.js';
  import { LAYER_DEFS } from '../lib/config.js';
</script>

<div class="layer-toggles">
  {#each LAYER_DEFS as def (def.id)}
    <button
      class="toggle-btn"
      class:active={$layers[def.id]}
      onclick={() => toggleLayer(def.id)}
    >
      <span class="indicator" style="background:{def.color}"></span>{def.label}
    </button>
  {/each}
</div>

<style>
  .layer-toggles {
    position: fixed;
    top: 52px;
    right: 28px;
    z-index: 100;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 500px;
  }

  .toggle-btn {
    font-family: 'Geist Mono', monospace;
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
    border-color: #3a4050;
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
