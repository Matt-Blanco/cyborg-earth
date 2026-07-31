<script>
  import { tooltip } from '../lib/stores.js';
</script>

<div
  class="tooltip"
  class:visible={$tooltip}
  style="left: {$tooltip ? $tooltip.x : 0}px; top: {$tooltip ? $tooltip.y : 0}px"
>
  {#if $tooltip}
    <div class="tooltip-name">{$tooltip.name}</div>
    <div class="tooltip-country">{$tooltip.subtitle}</div>
    <div class="tooltip-detail">
      {#each $tooltip.rows as row}
        <div>
          {row.label}: <span style={row.color ? `color:${row.color}` : ''}>{row.value}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tooltip {
    position: fixed;
    z-index: 200;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 18px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 280px;
  }

  .tooltip.visible {
    opacity: 1;
  }

  .tooltip-name {
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }

  .tooltip-country {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }

  .tooltip-detail {
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
    line-height: 1.6;
  }

  .tooltip-detail span {
    color: var(--text);
  }
</style>
