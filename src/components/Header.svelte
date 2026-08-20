<!-- Title block — hidden in the original page; kept for parity. -->
<div class="header">
  <div class="title-block" style="display: none;">
    <h1>&#9889; Global Energy Infrastructure</h1>
    <p>Nuclear Reactors &amp; Power Grid &mdash; OpenStreetMap + GeoNuclearData</p>
  </div>
</div>

<style>
  .header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    padding: 20px 28px 10px 28px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    pointer-events: none;
  }

  .header > * {
    pointer-events: auto;
  }

  .title-block h1 {
    font-family: 'Inter', monospace;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 4px;
  }

  .title-block p {
    font-family: 'Inter', monospace;
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.5px;
  }
</style>
