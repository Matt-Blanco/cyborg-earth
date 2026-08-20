<script>
  // The map's whole control surface: theme, layer toggles and legend, behind one
  // button in the top-right corner. A native <dialog> carries it, which is what
  // gives Escape-to-close, the inert backdrop and focus containment for free —
  // none of that is reimplemented here.
  import { theme, setTheme } from '../lib/stores.js';
  import { THEMES } from '../lib/config.js';
  import LayerToggles from './LayerToggles.svelte';
  import Legend from './Legend.svelte';

  const THEME_LABELS = { dark: 'Dark', light: 'Light' };

  let dialogEl;
  let open = $state(false);

  function openPanel() {
    dialogEl.showModal();
    open = true;
  }

  // A click whose target is the dialog element itself landed on the backdrop:
  // the panel fills the dialog's box, so every click inside hits a child.
  function onDialogClick(e) {
    if (e.target === dialogEl) dialogEl.close();
  }
</script>

<button
  class="panel-trigger"
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={openPanel}
>
  Controls
</button>

<dialog
  bind:this={dialogEl}
  class="panel-dialog"
  aria-labelledby="controls-heading"
  onclick={onDialogClick}
  onclose={() => (open = false)}
>
  <div class="panel">
    <header>
      <h2 id="controls-heading">Map Controls</h2>
      <button class="close-btn" aria-label="Close controls" onclick={() => dialogEl.close()}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </header>

    <section>
      <div class="section-title">Theme</div>
      <div class="segmented" role="group" aria-label="Theme">
        {#each THEMES as t (t)}
          <button
            class="segment"
            class:active={$theme === t}
            aria-pressed={$theme === t}
            onclick={() => setTheme(t)}
          >
            {THEME_LABELS[t]}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <div class="section-title">Layers</div>
      <LayerToggles />
    </section>

    <section>
      <div class="section-title">Infrastructure Legend</div>
      <Legend />
    </section>
  </div>
</dialog>

<style>
  .panel-trigger {
    position: fixed;
    top: 20px;
    right: 28px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: 'Inter', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    padding: 8px 14px;
    border-radius: 2px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: var(--shadow-panel);
  }

  .panel-trigger:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-glow);
  }

  .panel-dialog {
    padding: 0;
    border: none;
    background: transparent;
    max-width: min(620px, 92vw);
    max-height: 86vh;
    overflow: visible;
  }

  .panel-dialog::backdrop {
    background: rgba(6, 10, 18, 0.5);
    backdrop-filter: blur(2px);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-height: 86vh;
    overflow-y: auto;
    padding: 20px 24px 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--text);
    margin: 2rem 2rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  h2 {
    font-family: 'Inter', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: var(--accent);
  }

  .close-btn {
    display: flex;
    padding: 5px;
    border: 1px solid transparent;
    border-radius: 2px;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-btn:hover {
    border-color: var(--border-hover);
    color: var(--text);
  }

  .close-btn svg {
    width: 14px;
    height: 14px;
  }

  .section-title {
    font-family: 'Inter', monospace;
    font-size: 8px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 10px;
  }

  .segmented {
    display: inline-flex;
    padding: 3px;
    gap: 3px;
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .segment {
    font-family: 'Inter', monospace;
    font-size: 10px;
    letter-spacing: 0.5px;
    padding: 6px 18px;
    border: none;
    border-radius: 2px;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
    transition: all 0.2s;
  }

  .segment:hover {
    color: var(--text);
  }

  .segment.active {
    background: var(--accent-glow);
    color: var(--accent);
  }
</style>
