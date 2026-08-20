import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `command` is 'serve' for `vite dev` and 'build' for `vite build`.
export default defineConfig(({ command }) => ({
  base: './',
  // public/ holds nothing but the ~440 MB of grid extracts in public/data/.
  // Dev serves them straight off disk; a build fetches the same files from the
  // R2 bucket instead (see GRID_DATA_BUCKET_URL in src/lib/config.js), so
  // copying them into dist/ would ship half a gigabyte nothing requests.
  publicDir: command === 'serve' ? 'public' : false,
  plugins: [svelte()],
}));
