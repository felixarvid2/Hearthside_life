import { expect, test } from 'vitest';

test('measure GLB screens', async () => {
  await import('./measure-screens.mjs');
  expect(true).toBe(true);
});
