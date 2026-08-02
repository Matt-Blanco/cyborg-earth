<div class="legend">
  <div class="legend-title">Infrastructure Layers</div>
  <div class="legend-item">
    <div class="legend-dot reactor-op"></div>
    Reactor &mdash; Operational
  </div>
  <div class="legend-item">
    <div class="legend-dot reactor-uc"></div>
    Reactor &mdash; Under Construction
  </div>
  <div class="legend-item">
    <div class="legend-dot reactor-sd"></div>
    Reactor &mdash; Shutdown
  </div>
  <div class="legend-item">
    <div class="legend-line hv"></div>
    HV Transmission (&ge;200kV)
  </div>
  <div class="legend-item">
    <div class="legend-line mv"></div>
    MV Lines (&lt;200kV)
  </div>
  <div class="legend-item">
    <div class="legend-line cable"></div>
    Underground / Submarine Power Cables
  </div>
  <div class="legend-item">
    <div class="legend-dot substation"></div>
    Substations
  </div>
  <div class="legend-item">
    <div class="legend-dot plant"></div>
    Power Plants
  </div>
  <div class="legend-item">
    <div class="legend-line rail"></div>
    Railways
  </div>
  <div class="legend-item">
    <div class="legend-dot rail"></div>
    Rail Nodes (crossings, switches)
  </div>
  <div class="legend-item">
    <div class="legend-line telecom"></div>
    Telecom Lines &amp; Sites
  </div>
  <div class="legend-item">
    <div class="legend-line subsea"></div>
    Submarine Telecom Cables
  </div>
</div>

<style>
  .legend {
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 100;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 18px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  }

  .legend-title {
    font-family: 'Geist Mono', monospace;
    font-size: 8px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
    font-family: 'Geist Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
  }

  .legend-item:last-child {
    margin-bottom: 0;
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

  .legend-dot.reactor-op {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
  }

  .legend-dot.reactor-uc {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
  }

  .legend-dot.reactor-sd {
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
  }

  .legend-dot.substation {
    background: #a78bfa;
    box-shadow: 0 0 6px rgba(167, 139, 250, 0.4);
  }

  .legend-dot.plant {
    background: #fb923c;
    box-shadow: 0 0 6px rgba(251, 146, 60, 0.4);
  }

  .legend-line.hv {
    background: linear-gradient(90deg, rgba(245, 158, 11, 0.8), rgba(245, 158, 11, 0.3));
  }

  .legend-line.mv {
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.6), rgba(56, 189, 248, 0.2));
  }

  .legend-line.cable {
    background: linear-gradient(90deg, rgba(16, 185, 129, 0.6), rgba(16, 185, 129, 0.2));
  }

  /* Railways and rail nodes share a hue — the mark shape carries the split. */
  .legend-line.rail {
    background: linear-gradient(90deg, rgba(244, 114, 182, 0.7), rgba(244, 114, 182, 0.25));
  }

  .legend-dot.rail {
    background: #f472b6;
    box-shadow: 0 0 6px rgba(244, 114, 182, 0.4);
  }

  .legend-line.telecom {
    background: linear-gradient(90deg, rgba(163, 230, 53, 0.8), rgba(163, 230, 53, 0.3));
  }

  /* Land telecom and submarine cables share a hue — the domain carries the
     split, as railways and rail nodes share theirs. */
  .legend-line.subsea {
    background: linear-gradient(90deg, rgba(163, 230, 53, 0.6), rgba(163, 230, 53, 0.2));
  }
</style>
