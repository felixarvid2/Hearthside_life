// Task D: picks one camera-angle candidate per state and copies it to the required screenshot name.
// shoot-d.mjs writes <viewport>-<state>-k0..3.png (close zoom) and -w0..3.png (wide zoom) for fridge-open,
// stove-cooking and shower-running; the candidates differ only in the camera yaw step and zoom, chosen by eye here.
//   npm run visual:m115:promote
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots', 'D');
// Chosen candidate per state: 'k<yaw step>' close (0 = 45 degrees, then +90 each) or 'w<yaw step>' wide. `null`
// keeps the natural-reveal shot already written under the plain name. A state may give one choice for every
// viewport or an object { portrait, landscape, desktop } when the best angle differs by screen shape. Edit after
// looking at the images.
const CHOICE = {
  'fridge-closed': null, 'fridge-open': 'w0', 'stove-cooking': 'k0', 'wardrobe-open': null, 'shower-running': 'w0',
};
const VIEWPORTS = ['portrait', 'landscape', 'desktop'];

let missing = 0;
for (const vp of VIEWPORTS) {
  for (const [state, choice] of Object.entries(CHOICE)) {
    const pick = typeof choice === 'string' ? choice : choice?.[vp] ?? null;
    if (!pick) continue;
    const src = join(SHOTS, `${vp}-${state}-${pick}.png`);
    const dst = join(SHOTS, `${vp}-${state}.png`);
    if (!existsSync(src)) {
      console.error(`[promote] missing ${src}`);
      missing++;
      continue;
    }
    copyFileSync(src, dst);
    console.log(`[promote] ${vp}-${state}.png <- ${pick}`);
  }
}
if (missing) process.exitCode = 1;
