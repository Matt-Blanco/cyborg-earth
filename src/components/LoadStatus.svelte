<script>
  import { loadStatus } from '../lib/stores.js';
</script>

<div class="load-status" class:visible={$loadStatus.visible} class:loading={$loadStatus.loading}>
  {$loadStatus.message}
</div>

<style>
  .load-status {
    position: fixed;
    /* Clears the controls trigger, which is the only thing left up here. */
    top: 64px;
    right: 28px;
    z-index: 100;
    font-family: 'Inter', monospace;
    font-size: 9px;
    color: var(--text-dim);
    letter-spacing: 0.5px;
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.3s;
    max-width: 360px;
  }

  .load-status.visible {
    opacity: 1;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }

  .load-status.loading {
    animation: pulse 1s ease-in-out infinite;
    color: var(--accent);
  }
</style>
