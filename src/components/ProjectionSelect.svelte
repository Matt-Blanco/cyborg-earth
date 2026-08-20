<script>
  import { projectionKey } from '../lib/stores.js';
  import { PROJECTION_GROUPS } from '../lib/projections.js';
</script>

<div class="proj-select-wrap">
  <label for="proj-sel">Projection</label>
  <select id="proj-sel" class="proj-select" bind:value={$projectionKey}>
    {#each PROJECTION_GROUPS as group}
      <optgroup label={group.label}>
        {#each group.options as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
</div>

<style>
  .proj-select-wrap {
    position: fixed;
    top: 20px;
    left: 28px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: 8px;
    pointer-events: auto;
  }

  .proj-select-wrap label {
    font-family: 'Inter', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    color: var(--text-dim);
  }

  .proj-select {
    font-family: 'Inter', monospace;
    font-size: 11px;
    padding: 7px 12px;
    border-radius: 2px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
  }

  /* The arrow is baked into a data URI, so the light theme restates it in its
     own ink rather than trying to push a variable through the URL. */
  :global(:root[data-theme='light']) .proj-select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235b6675'/%3E%3C/svg%3E");
  }

  .proj-select:hover {
    border-color: var(--border-hover);
  }

  .proj-select:focus {
    border-color: var(--accent);
  }

  .proj-select option,
  .proj-select optgroup {
    background: var(--surface);
    color: var(--text);
  }
</style>
