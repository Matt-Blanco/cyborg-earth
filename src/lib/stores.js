import { writable } from 'svelte/store';
import { INITIAL_LAYERS } from './config.js';

// Active map projection key (see projections.js).
export const projectionKey = writable('orthographic');

// Which infrastructure layers are visible.
export const layers = writable({ ...INITIAL_LAYERS });

export function toggleLayer(id) {
  layers.update((l) => ({ ...l, [id]: !l[id] }));
}

// Data-loading status banner.
export const loadStatus = writable({ message: '', loading: false, visible: false });

let hideTimer = null;
export function showStatus(message, loading) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  loadStatus.set({ message, loading, visible: true });
  if (!loading) {
    hideTimer = setTimeout(() => {
      loadStatus.update((s) => ({ ...s, visible: false }));
    }, 5000);
  }
}

// Tooltip contents; null when hidden.
// { x, y, name, subtitle, rows: [{ label, value, color? }] }
export const tooltip = writable(null);
