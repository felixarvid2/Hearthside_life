// Diagnostic for task B: zoom exactly on the DOM-reported pill rect in the saved screenshots.
// Run with: npx vitest run --config dev/ds-tasks/m115/b-crop-vitest.config.ts
import { mkdirSync } from 'node:fs';
import { test } from 'vitest';
import sharp from 'sharp';

const OUT = '/tmp/m115b-crops';

async function zoom(name: string, file: string, left: number, top: number, width: number, height: number, scale: number) {
  await sharp(file).extract({ left, top, width, height }).resize(width * scale, height * scale, { kernel: 'nearest' })
    .png().toFile(`${OUT}/${name}.png`);
  // Print the centre row (through the pill) as RGB triples so the capsule/fill can be judged numerically.
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const y = top + Math.floor(height / 2);
  const row: string[] = [];
  for (let x = left; x < left + width; x++) {
    const i = (y * info.width + x) * info.channels;
    row.push(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  console.log(`${name} row y=${y}: ${row.join(' ')}`);
}

test('zoom the pill rect', async () => {
  mkdirSync(OUT, { recursive: true });
  // portrait cook-30: DOM pill centre 201,369 w=44 h=10 -> left 179, top 364.
  await zoom('portrait-pill-exact-16x', 'dev/ds-tasks/m115/shots/B/cook-30-portrait.png', 179, 364, 44, 10, 16);
  // desktop cook-30: centre 646,255 w=56 h=12 -> left 618, top 249.
  await zoom('desktop-pill-exact-16x', 'dev/ds-tasks/m115/shots/B/cook-30-desktop.png', 618, 249, 56, 12, 16);
  // desktop done: same rect, check on the right.
  await zoom('desktop-done-exact-16x', 'dev/ds-tasks/m115/shots/B/done-check-desktop.png', 618, 255, 56, 12, 16);
  await zoom('desktop-cook30-exact-16x', 'dev/ds-tasks/m115/shots/B/cook-30-desktop.png', 618, 255, 56, 12, 16);
  // Is the cook actually under the pill? Head should be just below the pill top (369) in portrait.
  await sharp('dev/ds-tasks/m115/shots/B/cook-30-portrait.png')
    .extract({ left: 130, top: 355, width: 150, height: 220 }).resize(150 * 5, 220 * 5, { kernel: 'nearest' })
    .png().toFile(`${OUT}/portrait-person-5x.png`);
  await sharp('dev/ds-tasks/m115/shots/B/cook-30-desktop.png')
    .extract({ left: 560, top: 245, width: 200, height: 300 }).resize(200 * 4, 300 * 4, { kernel: 'nearest' })
    .png().toFile(`${OUT}/desktop-person-4x.png`);
}, 60_000);
