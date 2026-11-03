# Task B: less bulky kids' clothes, and wrinkles for elders

Progress file: `dev/ds-tasks/gaps/B-progress.md`.

Background: people are MPFB bodies (`src/characters/mpfbBody.ts`, `src/characters/assets.ts`, `src/characters/stages.ts`, `src/characters/clothing.ts`, `src/characters/materials.ts`, `CharacterView.ts`). Each life stage has its own body GLB (baby, toddler f/m, child f/m, teen f/m, elder f/m) and the UAL skeleton is scaled per stage. Read `tools/mpfb/README.md` and the "life stages" part of `docs/ARCHITECTURE.md`. Screenshot scripts exist: `dev/mpfb/shootStages.mjs` and `dev/mpfb/composeStages.mjs` (they make `dev/mpfb/shots/stages_*.jpg`). Look at `dev/mpfb/shots/stages_lineup.jpg` first to see the problem.

## 1. Kids' clothes look bulky
On toddlers, children (and to a lesser degree teens) the garments stand far off the body: tops and trousers look inflated and dresses/skirts flare out far too much on toddlers.
- Find out how garments are fitted to a stage body (look in `clothing.ts` and where garment meshes are scaled, offset or inflated per body/stage). The likely cause is an adult-sized offset/inflation or flare value that is not scaled with the smaller body.
- Fix it so garments sit close to kid bodies, like they do on adults: scale offsets/inflation by stage (or by body size), and reduce skirt/dress flare for toddler and child. Do not change how adults look.
- Keep it data-driven and small. Add/adjust unit tests (see `tests/unit/characters3d/stageBodies.test.ts`) that assert the per-stage fit parameters (for example that a toddler's garment offset is smaller than an adult's).

## 2. Elders have no wrinkles
Elders only differ by face shape. Add visible but tasteful wrinkles for the `elder` stage.
- Preferred approach: a procedurally generated wrinkle detail (canvas-generated normal map and/or a subtle albedo darkening for forehead lines, crow's feet, nasolabial folds, under-eye lines) applied only to elder skin, mapped through the skin's existing UVs. Look at how the skin material is built in `materials.ts`/`mpfbBody.ts` and whether the MPFB skin UVs make a face region addressable (the build tool `tools/mpfb/build_body.py` may help understand the UV layout; do not run Blender).
- Wrinkles must work with every skin tone, not change younger stages, and cost little (one small texture shared by all elders, created once).
- Unit test: the elder skin material gets the wrinkle map; adult/teen skin does not.

## Screenshots (required)
After the fixes, re-run the stage screenshot scripts (wrapped in `flock /tmp/hearthside-browser.lock node ...`) and save small JPGs to `dev/mpfb/shots/` (overwrite `stages_lineup.jpg`, plus a close-up `elder_wrinkles.jpg` of an elder face and `kids_clothes.jpg` of a dressed toddler, child and teen). Look at them and iterate until kids' clothes sit close to the body and the wrinkles are visible at close range but not dirty-looking. Describe what you see in the progress file.
