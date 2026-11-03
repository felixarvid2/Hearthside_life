# Task B2: make the elder wrinkles readable

Task B added a procedural elder wrinkle map (`src/characters/materials.ts`: `wrinkleIntensity`, `bakeWrinkleTexture`,
`wrinkleMapForStage`, the `HAS_WRINKLES` branch of the MPFB skin shader). It works, but in
`dev/mpfb/shots/elder_wrinkles.jpg` the lines are almost invisible at head-and-shoulders range, even with the albedo
factor raised to 0.3 (line ~480). The lines are about 1.5 mm wide, so they vanish at normal camera distance.

Goal: an elder face should clearly read as old at the `closeups` plan's framing and still look aged in the `lineup`
plan, on light and dark skin tones, without looking like dirt, paint or scars.

Do:
- Make the lines wider and softer (a few mm with a soft falloff), with deeper forehead lines and nasolabial folds,
  crow's feet fanning from the outer eye corners, and lines under the eyes. Add a faint broad darkening for the
  under-eye hollows and the nasolabial region (age shading, not just thin lines).
- Make the lines catch the light: in the `HAS_WRINKLES` branch, perturb the normal from the map's screen-space
  derivatives (`dFdx`/`dFdy` of the sampled value, or sample neighbours in UV) so creases shade with the lighting.
  Keep it subtle. Use the existing patch/define mechanism; only elders get the define.
- Tune the albedo factor and normal strength together. Keep the texture shared (one build) and small.
- Keep the existing unit tests passing, and update them if you change the pattern's shape (the tests in
  `tests/unit/characters3d/stageBodies.test.ts` that check forehead/crow's feet present and back of head clear).
- Check visually: `node dev/mpfb/shootStages.mjs --plan=closeups` then `node dev/mpfb/composeStages.mjs`
  (the script takes the browser lock itself; do not wrap it in flock). Look at `dev/mpfb/shots/elder_wrinkles.jpg`
  with Read, crop it bigger if needed (python3 with PIL is available), and iterate until the wrinkles are clearly
  visible. Then run `--plan=lineup` + compose and check `stages_lineup.jpg` that the adults are unchanged.
- Do not touch clothing.ts or any non-elder look.

Progress file: `dev/ds-tasks/gaps/B2-progress.md`.
