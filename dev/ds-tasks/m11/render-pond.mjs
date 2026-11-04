// Preview the pond model at catalog-thumbnail quality but larger, for art iteration.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModels } from '../../../tools/furniture-extra/models.mjs';
import { COLORS } from '../../../tools/furniture-extra/kit.mjs';
import { renderThumb } from '../../../tools/furniture-extra/thumb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const models = buildModels();
const m = models.fishingPond;
for (const [mat, list] of m.tris) {
  let maxY = -Infinity, minY = Infinity;
  for (const t of list) for (const p of t.p) { maxY = Math.max(maxY, p[1]); minY = Math.min(minY, p[1]); }
  console.log(`${mat}: ${list.length} triangles, y ${minY.toFixed(3)}..${maxY.toFixed(3)}`);
}
const png = await renderThumb(m.scaledTriangles(), { px: 520 });
writeFileSync(join(here, 'pond-preview.png'), png);
// Also from the game's usual isometric angle and a second angle.
for (const [name, az, el] of [['pond-preview-alt.png', (35 * Math.PI) / 180, (35 * Math.PI) / 180], ['pond-preview-front.png', (-Math.PI) / 2, (20 * Math.PI) / 180], ['pond-preview-top.png', (-Math.PI) / 4, (75 * Math.PI) / 180]]) {
  const p = await renderThumb(m.scaledTriangles(), { px: 520, az, el });
  writeFileSync(join(here, name), p);
}
console.log('wrote pond-preview.png, pond-preview-alt.png, pond-preview-front.png');
const pads = m.tris.get('plant').filter((t) => t.p.every((p) => Math.abs(p[1] - 0.078) < 0.01));
console.log('flat plant triangles', pads.length, pads.slice(0, 3).map((t) => t.p));
const plants = m.scaledTriangles().filter((t) => t.mat === 'plant');
writeFileSync(join(here, 'pond-preview-plants.png'), await renderThumb(plants, { px: 520 }));
const sharpLib = (await import('sharp')).default;
console.log('plant render size', await sharpLib(await renderThumb(plants, { px: 520 })).metadata().then((x) => `${x.width}x${x.height}`));
console.log('plant y range scaled', Math.min(...plants.flatMap((t) => t.p.map((p) => p[1]))), Math.max(...plants.flatMap((t) => t.p.map((p) => p[1]))));
const stoneView = m.scaledTriangles().filter((t) => t.mat !== 'metalMedium' && t.mat !== 'metalDark');
writeFileSync(join(here, 'pond-preview-nodwater.png'), await renderThumb(stoneView, { px: 520 }));
const waterPlants = m.scaledTriangles().filter((t) => t.mat === 'plant' || t.mat === 'metalMedium' || t.mat === 'metalDark');
writeFileSync(join(here, 'pond-preview-waterplants.png'), await renderThumb(waterPlants, { px: 520 }));
const saved = COLORS.plant;
COLORS.plant = [1, 0, 1];
const magentaBuf = await renderThumb(m.scaledTriangles(), { px: 520 });
COLORS.plant = saved;
writeFileSync(join(here, 'pond-preview-magenta.png'), magentaBuf);
const raw = await sharpLib(magentaBuf).raw().toBuffer({ resolveWithObject: true });
let magenta = 0;
for (let i = 0; i < raw.data.length; i += 4) if (raw.data[i] > 180 && raw.data[i + 2] > 180 && raw.data[i + 1] < 80) magenta++;
console.log(`magenta pixels ${magenta}`);
console.log('wrote pond-preview-plants.png, pond-preview-nodwater.png');
