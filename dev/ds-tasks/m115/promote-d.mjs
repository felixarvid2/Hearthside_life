// Task D: picks one camera-angle candidate per state and copies it to the required screenshot name.
// shoot-d.mjs writes <viewport>-<state>-k0..3.png for fridge-open, stove-cooking and shower-running; the four
// angles differ only in the camera yaw step, so the best one is chosen by eye here.
//   npm run visual:m115:promote
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots', 'D');
// The camera yaw step (0 = 45 degrees, then +90 each) chosen per state. Edit after looking at the candidates.
const CHOICE = { 'fridge-open': 2, 'stove-cooking': 0, 'shower-running': 0 };
const VIEWPORTS = ['portrait', 'landscape', 'desktop'];

let missing = 0;
for (const vp of VIEWPORTS) {
  for (const [state, k] of Object.entries(CHOICE)) {
    const src = join(SHOTS, `${vp}-${state}-k${k}.png`);
    const dst = join(SHOTS, `${vp}-${state}.png`);
    if (!existsSync(src)) {
      console.error(`[promote] missing ${src}`);
      missing++;
      continue;
    }
    copyFileSync(src, dst);
    console.log(`[promote] ${vp}-${state}.png <- k${k}`);
  }
}
if (missing) process.exitCode = 1;
