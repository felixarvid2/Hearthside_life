// Diagnostic for task B: run the pill-region crops without the repo's normal unit-test include.
//   npx vitest run --config dev/ds-tasks/m115/b-crop-vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['dev/ds-tasks/m115/b-crop.test.ts'], environment: 'node', reporters: ['verbose'] },
});
