import { writable } from 'svelte/store';
import { INITIAL_LAYERS, THEMES, DEFAULT_THEME, applyTheme } from './config.js';

// Active map projection key (see projections.js).
export const projectionKey = writable('orthographic');

// Active theme, 'dark' | 'light'. One switch drives both halves of the page:
// applyTheme() repaints the WebGL colour tables, and the data-theme attribute
// swaps the CSS custom properties the chrome is built on (see app.css).
const THEME_KEY = 'cyborg-earth:theme';

function storedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(saved)) return saved;
  } catch {
    // private mode / blocked storage — fall through to the preference
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : DEFAULT_THEME;
}

export const theme = writable(storedTheme());

theme.subscribe((t) => {
  applyTheme(t);
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // nothing to do — the theme still applies for this session
  }
});

export function setTheme(t) {
  theme.set(t);
}

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
