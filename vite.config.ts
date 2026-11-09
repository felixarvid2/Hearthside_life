import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Production builds ship no source maps (about 10 MB); HEARTHSIDE_SOURCEMAP=1 turns them on for debugging.
    sourcemap: process.env.HEARTHSIDE_SOURCEMAP === '1',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Stable, big modules get their own chunks: they load in parallel, stay cached across releases that only touch
        // game logic, and keep the entry chunk small. Build mode and the creator are lazy chunks of their own (ui/app.ts).
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/src/content/')) return 'content';
          if (id.includes('/src/render/textures/')) return 'textures';
          if (id.includes('/src/characters/') && !id.includes('/src/characters/modular/')) return 'characters';
          if (id.includes('/src/sim/')) return 'sim';
        },
      },
    },
  },
  server: { host: true },
});
