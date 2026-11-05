import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['dev/ds-tasks/m115/measure.test.ts'], environment: 'node', reporters: ['verbose'] },
});
