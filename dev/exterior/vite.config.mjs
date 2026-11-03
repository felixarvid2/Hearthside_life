// Build config for the exterior check scripts: the game plus the exterior contact-sheet page, into a temporary folder (so a running
// dev server's hot reloads, which other agents' edits trigger, never reload the page under a test).
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

export default {
  root,
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    outDir: process.env.EXT_DIST ?? '/tmp/hearthside-ext-dist',
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(root, 'index.html'), exterior: resolve(root, 'dev/exterior.html') } },
  },
};
