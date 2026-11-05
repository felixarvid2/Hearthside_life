// Diagnostic for task B: tighten the pill position and look for the actor in the new framing.
// Run with: npx vitest run --config dev/ds-tasks/m115/b-crop-vitest.config.ts
import { mkdirSync } from 'node:fs';
import { test } from 'vitest';
import sharp from 'sharp';

const OUT = '/tmp/m115b-crops';

test('locate the new portrait pill and actor', async () => {
  mkdirSync(OUT, { recursive: true });
  const file = 'dev/ds-tasks/m115/shots/B/done-check-portrait.png';
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rows = new Map<number, number[]>();
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.abs(data[i]! - 77) <= 4 && Math.abs(data[i + 1]! - 154) <= 4 && Math.abs(data[i + 2]! - 91) <= 4) {
        const xs = rows.get(y) ?? []; xs.push(x); rows.set(y, xs);
      }
    }
  }
  for (const [y, xs] of rows) console.log(`green row y=${y}: x ${Math.min(...xs)}..${Math.max(...xs)} (${xs.length})`);
  // Crop the full width at the pill's band plus 200 px below, so any actor under it would show.
  await sharp(file).extract({ left: 0, top: 360, width: 390, height: 260 }).resize(390 * 3, 260 * 3, { kernel: 'nearest' })
    .png().toFile(`${OUT}/portrait-new-band-3x.png`);
}, 60_000);
