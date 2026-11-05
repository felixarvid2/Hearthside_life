// Diagnostic only (task Q): enlarge regions of the promoted shots so faces, doors and hand props can be judged.
// Run with: npx vitest run --config dev/ds-tasks/m115/q-crop-vitest.config.ts
import { mkdirSync } from 'node:fs';
import { test } from 'vitest';
import sharp from 'sharp';

const OUT = '/tmp/m115q-crops';
const D = 'dev/ds-tasks/m115/shots/D';
const H = 'dev/ds-tasks/m115/shots/H';

test('enlarge the fridge in the desktop candidates', async () => {
  mkdirSync(OUT, { recursive: true });
  const names = [
    'desktop-fridge-closed.png', 'desktop-fridge-open.png',
    'desktop-fridge-closed-k0.png', 'desktop-fridge-open-k0.png',
    'desktop-fridge-closed-k1.png', 'desktop-fridge-open-k1.png',
    'desktop-fridge-closed-k2.png', 'desktop-fridge-open-k2.png',
    'desktop-fridge-closed-k3.png', 'desktop-fridge-open-k3.png',
  ];
  for (const name of names) {
    // the fridge sits left of centre in these 1280x720 frames
    await sharp(`${D}/${name}`).extract({ left: 300, top: 250, width: 560, height: 430 })
      .resize(1120, 860, { kernel: 'nearest' }).png().toFile(`${OUT}/${name.replace('.png', '-zoom.png')}`);
  }
});

test('enlarge the fridge in the Q orientation probes', async () => {
  mkdirSync(OUT, { recursive: true });
  for (const state of ['closed', 'open']) {
    for (let k = 0; k < 4; k++) {
      const name = `fridge-${state}-k${k}.png`;
      await sharp(`dev/ds-tasks/m115/shots/Q/${name}`).extract({ left: 300, top: 180, width: 420, height: 300 })
        .resize(1260, 900, { kernel: 'nearest' }).png().toFile(`${OUT}/q-${name.replace('.png', '-zoom.png')}`);
    }
  }
});

test('enlarge the fridge thumbnail', async () => {
  mkdirSync(OUT, { recursive: true });
  await sharp('public/assets/furniture/thumbs/kitchenFridge.png').resize(760, 640, { kernel: 'nearest' })
    .png().toFile(`${OUT}/thumb-kitchenFridge.png`);
});

test('enlarge the hand props in the desktop H shots', async () => {
  mkdirSync(OUT, { recursive: true });
  const boxes: Record<string, { left: number; top: number; width: number; height: number }> = {
    'fridge-reach': { left: 380, top: 180, width: 520, height: 420 },
    'snack-eat': { left: 380, top: 180, width: 520, height: 420 },
    'carry-plate': { left: 380, top: 180, width: 520, height: 420 },
    'eat-20': { left: 380, top: 180, width: 520, height: 420 },
    'eat-80': { left: 380, top: 180, width: 520, height: 420 },
    'reading': { left: 380, top: 180, width: 520, height: 420 },
    'phone': { left: 380, top: 180, width: 520, height: 420 },
  };
  for (const [name, b] of Object.entries(boxes)) {
    await sharp(`${H}/${name}-desktop.png`).extract(b).resize(b.width * 2, b.height * 2, { kernel: 'nearest' })
      .png().toFile(`${OUT}/h-${name}-zoom.png`);
  }
});
