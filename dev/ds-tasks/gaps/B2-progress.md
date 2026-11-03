# Task B2 — elder wrinkles readable

## Changed files
- `src/characters/materials.ts`
  - New `wrinkleIntensity` pattern: Gaussian lines ~6-9 mm wide (was ~1.5 mm), three deeper forehead lines,
    two glabella lines, four crow's feet fanning from each outer eye corner, two short under-eye arcs and deep
    two-segment nasolabial folds plus a fainter outer fold and marionette line. Tails are clamped below 0.004 so
    off-face points stay exactly 0.
  - New exported `ageShading`: broad, faint Gaussian hollows under the eyes, around the nasolabial folds, at the
    temples and on the cheek hollows.
  - `bakeWrinkleTexture` now writes a 512x512 **RG** texture: red = lines, green = broad age shading (same one
    shared build; 0.5 MB). Edge-gap fill works per channel.
  - `PSKIN_FRAG_PAINT` darkens with `1 - lineAlb * r - shadeAlb * g`; `PSKIN_FRAG_NORMAL` bends the head normal
    from the screen-space gradient of the red channel (Mikkelsen bump, derivatives taken outside the head branch).
    Both are inside the existing `HAS_WRINKLES` define, so only elders change.
  - New `uWrinkleFx` uniform (line albedo 0.55, shading albedo 0.24, bump strength 3.0). Shader key bumped to v4.
- `tests/unit/characters3d/stageBodies.test.ts`: the wrinkle test now also checks an under-eye line and the
  under-eye/nasolabial shading; the map test checks the two-channel layout and that the green channel has content.
- `tests/unit/characters3d/elderWrinkles.test.ts` (new): focused checks that forehead lines are wide and soft,
  that the crow's-feet fan and under-eye lines exist, and that lines/shading are zero on the back of the head.

## How it works
The pattern is still baked once from the first elder body into its own UV layout and shared by every MPFB elder, so
it follows every face morph and tone. Albedo darkening is colour-neutral (multiply), so light and dark tones keep
their hue; the bump normal adds light-catching creases that are independent of skin tone. The broad green channel
survives mipmapping, so the face keeps an aged read at lineup distance while the fine lines appear at close range.

## Visual checks
- `npm run visual:stages -- --plan=closeups` + `npm run visual:stages:compose`.
  `dev/mpfb/shots/elder_wrinkles.jpg` (and the 700 px raws) show clear forehead lines, crow's feet, under-eye
  creases and nasolabial folds on light (`#c68f60`) and dark (`#95603b`) skin; soft, not dirt/paint/scars.
- `npm run visual:stages -- --plan=lineup` + compose. `dev/mpfb/shots/stages_lineup.jpg`: adults unchanged;
  the elder's face keeps soft age shading (heads are only ~24 px at this framing, so lines are not expected).
- Iterated three times: initial 1.5 mm lines (invisible) -> wider lines + normals (visible) -> softened under-eye
  lines and tuned albedo/bump.

## Checks (final state)
- `npm run typecheck`: clean
- `npm test`: 120 files, 1676 tests, all pass
- `npm run content:check`: 0 errors, 0 warnings
- `npm run build`: passes (only the existing chunk-size / dynamic-import warnings)

## Left open / notes
- The wrinkle map is shared by all elders (male and female use the same pattern), unchanged from task B.
- `docs/CONTINUATION.md` still lists "Elders have no wrinkles" under known issues; the supervisor may want to
  update that line.
- `dev/ds-tasks/gaps/B2-probe.mjs` is a temporary texture/UV dump used while tuning. `B2-img.py` is an unused
  diagnostic (python script execution needed approval, so it never ran); both can be deleted.
