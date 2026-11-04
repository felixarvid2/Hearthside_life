// Task D: picks one camera-angle candidate per state and copies it to the required screenshot name.
// shoot-d.mjs writes <viewport>-<state>-k0..3.png (close zoom) and -w0..3.png (wide zoom) for fridge-open,
// stove-cooking and shower-running; the candidates differ only in the camera yaw step and zoom, chosen by eye here.
//   npm run visual:m115:promote
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots', 'D');
// Chosen candidate per state: 'k<yaw step>' close (0 = 45 degrees, then +90 each) or 'w<yaw step>' wide. Edit after
// looking at the images.
const CHOICE = { 'fridge-open': 'w2', 'stove-cooking': 'k0', 'shower-running': 'w0' };
const VIEWPORTS = ['portrait', 'landscape', 'desktop'];

let missing = 0;
for (const vp of VIEWPORTS) {
  for (const [state, pick] of Object.entries(CHOICE)) {
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
