// Diagnostic for task B: rasterise the completion tick at the pill's on-screen size and count white pixels.
// Run with: npx vitest run --config dev/ds-tasks/m115/b-crop-vitest.config.ts
import { mkdirSync } from 'node:fs';
import { test } from 'vitest';
import sharp from 'sharp';

const OUT = '/tmp/m115b-crops';

function tick(size: number, stroke: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 13l4 4L19 7"/></svg>`;
}

test('rasterise the tick at 1x', async () => {
  mkdirSync(OUT, { recursive: true });
  for (const [size, stroke, name] of [[10, 4.5, 'desktop'], [8, 5, 'phone'], [8, 1.9, 'old']] as const) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="rgb(57,86,51)"/>${tick(size, stroke)}</svg>`;
    const buf = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let white = 0, maxMin = 0;
    for (let i = 0; i < buf.data.length; i += buf.info.channels) {
      const r = buf.data[i]!, g = buf.data[i + 1]!, b = buf.data[i + 2]!;
      if (r > 215 && g > 215 && b > 215) white++;
      maxMin = Math.max(maxMin, Math.min(r, g, b));
    }
    console.log(`${name} ${size}px stroke=${stroke}: white=${white} maxMin=${maxMin}`);
    await sharp(Buffer.from(svg)).resize(size * 16, size * 16, { kernel: 'nearest' }).png()
      .toFile(`${OUT}/tick-${name}-16x.png`);
  }
}, 60_000);
