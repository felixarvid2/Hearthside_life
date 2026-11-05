// Diagnostic only (task D): enlarge the stove region of the promoted shots and build a contact sheet of the
// portrait stove candidates, so the hob rings, pan and steam can be inspected without a magnifier.
// Run with: npx vitest run --config dev/ds-tasks/m115/d-crop-vitest.config.ts
import { mkdirSync } from 'node:fs';
import { test } from 'vitest';
import sharp from 'sharp';

const OUT = '/tmp/m115d-crops';
const SHOTS = 'dev/ds-tasks/m115/shots/D';

// CSS-pixel boxes; images may be 2x device pixels, so they are scaled by width / viewport width.
const BOX: Record<string, { cssWidth: number; left: number; top: number; width: number; height: number }> = {
  portrait: { cssWidth: 390, left: 80, top: 620, width: 280, height: 200 },
  landscape: { cssWidth: 844, left: 80, top: 60, width: 380, height: 300 },
  desktop: { cssWidth: 1280, left: 540, top: 360, width: 380, height: 300 },
};

test('enlarge the stove region of each promoted shot', async () => {
  mkdirSync(OUT, { recursive: true });
  for (const [vp, css] of Object.entries(BOX)) {
    const file = `${SHOTS}/${vp}-stove-cooking.png`;
    const meta = await sharp(file).metadata();
    const scale = (meta.width ?? css.cssWidth) / css.cssWidth;
    const box = {
      left: Math.round(css.left * scale), top: Math.round(css.top * scale),
      width: Math.round(css.width * scale), height: Math.round(css.height * scale),
    };
    await sharp(file).extract(box).resize(css.width * 3, css.height * 3, { kernel: 'nearest' })
      .png().toFile(`${OUT}/stove-${vp}.png`);
  }
});

test('contact sheet of portrait stove candidates', async () => {
  mkdirSync(OUT, { recursive: true });
  const names = ['k0', 'k1', 'k2', 'k3', 'w0', 'w1', 'w2', 'w3', 'd0', 'd1', 'd2', 'd3', 'x0', 'x1', 'x2', 'x3'];
  const W = 195, H = 422;
  const cols = 4, rows = Math.ceil(names.length / cols);
  const composites = [];
  for (let i = 0; i < names.length; i++) {
    const n = names[i]!;
    const buf = await sharp(`${SHOTS}/portrait-stove-cooking-${n}.png`)
      .resize(W, H, { fit: 'contain', background: '#222' }).png().toBuffer();
    composites.push({ input: buf, left: (i % cols) * W, top: Math.floor(i / cols) * H });
  }
  await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#222' } })
    .composite(composites).png().toFile(`${OUT}/portrait-stove-sheet.png`);
});
