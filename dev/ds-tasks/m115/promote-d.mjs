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
  // k0 is the front-right yaw (camera on the person's side of the fridge): the closed dark door panel and the open
  // door with the lit cavity beside the person both read. k1 was behind the fridge - it showed the model's back and
  // made the door panel look like a cavity on the rear. The front-side oblique f70 frames the door against the wall.
  'fridge-closed': 'k0',
  'fridge-open': 'k0',
  // The hob reads best close up: portrait w1 keeps the whole stove + person + steam wisps; landscape d1 and
  // desktop d2 put the four lit rings, the pan and the cook in one frame.
  'stove-cooking': { portrait: 'w1', landscape: 'd1', desktop: 'd2' },
  // k1 shows both open doors and the clothes with the person in front in every viewport.
  'wardrobe-open': 'k1',
  // k0/d0 frame the whole stall with the person inside and the water streaks; landscape d1 is the closest
  // legible view (the wide angles all cut the stall against the lot edge).
  'shower-running': { portrait: 'k0', landscape: 'd1', desktop: 'd0' },
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
