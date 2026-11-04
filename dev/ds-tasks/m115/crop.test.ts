// Diagnostic only (task S): crop the screen area of the close-up screenshots and print simple colour
// statistics, so the picture mode can be checked without a magnifier. Run with:
//   npx vitest run --config dev/ds-tasks/m115/crop-vitest.config.ts
import { expect, test } from 'vitest';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = '/tmp/m115s-crops';
mkdirSync(OUT, { recursive: true });

/** Projected glass centre at ppm 400 (from the shoot log) and a 340x220 box around it. */
const BOX: Record<string, { left: number; top: number }> = {
  portrait: { left: 25, top: 348 },
  landscape: { left: 252, top: 72 },
  desktop: { left: 470, top: 237 },
};

const STATES = ['writing-20', 'writing-80', 'programming', 'gaming', 'computer-off'];

test('crop the computer screen from each shot', async () => {
  const rows: string[] = [];
  for (const vp of Object.keys(BOX)) {
    for (const state of STATES) {
      const file = `dev/ds-tasks/m115/shots/S/${state}-${vp}.png`;
      const img = sharp(file);
      const meta = await img.metadata();
      const box = { ...BOX[vp]!, width: 340, height: 220 };
      expect(meta.width).toBeGreaterThan(box.left + box.width);
      expect(meta.height).toBeGreaterThan(box.top + box.height);
      const crop = sharp(file).extract(box).resize(1020, 660, { kernel: 'nearest' });
      await crop.png().toFile(`${OUT}/${state}-${vp}.png`);
      const { data, info } = await sharp(file).extract(box).raw().toBuffer({ resolveWithObject: true });
      let green = 0, white = 0, blue = 0, dark = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        if (g > 70 && g > r + 15 && g > b + 10) green++;
        if (r > 210 && g > 205 && b > 190) white++;
        if (b > 60 && b > r + 20) blue++;
        if (r < 45 && g < 45 && b < 55) dark++;
      }
      const n = info.width * info.height;
      rows.push(`${state}-${vp}: green ${(green / n * 100).toFixed(1)}% white ${(white / n * 100).toFixed(1)}% blue ${(blue / n * 100).toFixed(1)}% dark ${(dark / n * 100).toFixed(1)}%`);
    }
  }
  console.log(rows.join('\n'));
  expect(rows.length).toBe(STATES.length * Object.keys(BOX).length);
});
