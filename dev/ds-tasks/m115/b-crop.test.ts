// Diagnostic for task B: crop the pill regions from the task B screenshots so the tiny pills can be inspected
// without a magnifier. Run with: npx vitest run --config dev/ds-tasks/m115/b-crop-vitest.config.ts
import { mkdirSync } from 'node:fs';
import { test } from 'vitest';
import sharp from 'sharp';

const OUT = '/tmp/m115b-crops';

test('crop task B pill regions', async () => {
  mkdirSync(OUT, { recursive: true });
  // [source, out, left, top, width, height]
  const shots: Array<[string, string, number, number, number, number]> = [
    ['two-actions-desktop', 'two-actions-pills', 240, 210, 620, 200],
    ['two-actions-desktop', 'two-actions-top', 0, 0, 640, 240],
    ['done-check-desktop', 'done-check-pills', 590, 220, 140, 100],
    ['done-check-desktop', 'done-check-top', 0, 0, 640, 240],
    ['cook-30-desktop', 'cook-30-pill', 600, 220, 120, 100],
    ['two-actions-portrait', 'two-actions-portrait', 0, 380, 390, 120],
    ['done-check-portrait', 'done-check-portrait', 160, 320, 120, 100],
    ['cook-30-desktop', 'cook-30-pill-10x', 615, 245, 70, 30],
    ['done-check-desktop', 'done-check-pill-10x', 615, 245, 70, 30],
    ['two-actions-desktop', 'two-actions-pill-a-10x', 295, 292, 80, 30],
    ['two-actions-desktop', 'two-actions-pill-b-10x', 675, 287, 80, 30],
    ['two-actions-desktop', 'two-actions-left-2x', 60, 240, 260, 320],
    ['done-check-desktop', 'done-check-left-2x', 60, 240, 260, 320],
    ['done-check-desktop', 'done-check-right-2x', 600, 240, 340, 200],
    ['done-check-desktop', 'done-check-left-4x', 100, 250, 185, 300],
    ['done-check-desktop', 'done-check-card-3x', 0, 470, 340, 190],
    ['two-actions-desktop', 'two-actions-left-4x', 100, 250, 185, 300],
  ];
  for (const [source, out, left, top, width, height] of shots) {
    const file = `dev/ds-tasks/m115/shots/B/${source}.png`;
    const scale = out.endsWith('-10x') ? 10 : out.endsWith('-4x') ? 4 : out.endsWith('-2x') ? 2 : 3;
    await sharp(file).extract({ left, top, width, height }).resize(width * scale, height * scale, { kernel: 'nearest' })
      .png().toFile(`${OUT}/${out}-crop.png`);
  }

  // Find pill-coloured horizontal runs anywhere in the desktop shots: amber (r high, g mid, b low) and the green
  // theme colour (77,154,91). A pill's fill is a run of 15+ px, which furniture rarely produces in one row.
  const targets: Array<[string, [number, number, number]]> = [
    ['amber-30', [218, 182, 37]],
    ['amber-9', [224, 151, 41]],
    ['green', [77, 154, 91]],
  ];
  for (const source of ['cook-30-desktop', 'cook-90-desktop', 'done-check-desktop', 'two-actions-desktop']) {
    const { data, info } = await sharp(`dev/ds-tasks/m115/shots/B/${source}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const found: string[] = [];
    for (const [name, [tr, tg, tb]] of targets) {
      let count = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels;
          if (Math.abs(data[i]! - tr) <= 8 && Math.abs(data[i + 1]! - tg) <= 8 && Math.abs(data[i + 2]! - tb) <= 8) {
            count++;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      found.push(`${name}: ${count}${count ? ` box ${minX},${minY}..${maxX},${maxY}` : ''}`);
      if (name === 'green' && count) {
        const rowHits = new Map<number, number[]>();
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            const i = (y * info.width + x) * info.channels;
            if (Math.abs(data[i]! - tr) <= 8 && Math.abs(data[i + 1]! - tg) <= 8 && Math.abs(data[i + 2]! - tb) <= 8) {
              const xs = rowHits.get(y) ?? [];
              xs.push(x);
              rowHits.set(y, xs);
            }
          }
        }
        for (const [y, xs] of rowHits) {
          if (xs.length >= 4) found.push(`  row y=${y}: x ${Math.min(...xs)}..${Math.max(...xs)} (${xs.length})`);
        }
      }
    }
    console.log(`${source}: ${found.join(' | ')}`);
  }
}, 60_000);
