import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['dev/ds-tasks/m115/q-crop.test.ts'], environment: 'node', reporters: ['verbose'] },
});
