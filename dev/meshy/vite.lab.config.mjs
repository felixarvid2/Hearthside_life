// Dev server for the screenshot scripts: no file watching and no HMR, so editing sources while a run is in
// progress cannot reload the page under it.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  base: './',
  server: { host: true, hmr: false, watch: null },
});
