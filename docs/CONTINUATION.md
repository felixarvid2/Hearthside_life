# Continuation note

State on 2026-11-01: Milestone 1 is complete and playable in the browser (Vite build).

## Checks

- `npm run typecheck`: clean.
- `npm test`: 52 files, 543 tests pass.
- `npm run build`: passes. Warning: main chunk is about 1.4 MB.
- `npm run e2e`: smoke passes.
- `npm run e2e:acceptance` (brief section 26 scenario through the real UI):
  - landscape 844x390: 122/122 passed.
  - desktop 1280x720: 122/122 passed.
  - portrait 390x844: 124/124 passed (also after the character change and the neighbour-menu test fix).

## Acceptance fixes (11 issues, all fixed)

- Creator mounted twice.
- Person panel unusable on short landscape.
- Buttons under 44 px.
- Creator step tab out of view.
- Buy, Build and creator panels on short landscape.
- Tiny people and fiddly person picking: screen-space forgiving pick, repeat taps cycle, camera reveals the
  ghost or selected object, panels keep in view on change.
- Toasts drawn over context menus.
- Dream Home aspiration counted starter furniture; it now counts only bought items.
- "Already has this finish" shown as a neutral tip.
- Loads restore the saved speed (older saves load paused).
- Creator hint when a garment has no patterns.

## Characters

- People use AI-generated Meshy base bodies by default (`characterStyle: 'detailed'`, Settings > Display).
  The procedural `'classic'` bodies remain as a fallback.
- Sources and generation notes: `dev/meshy/` (its README covers generation, credits and the feasibility test).
- Build step `npm run assets:meshy` (`tools/build-meshy-bodies.mts`):
  - fits the bodies to the UAL skeleton;
  - simplifies to about 10k triangles;
  - repacks a 1024 px atlas;
  - bakes a skin, base-layer and eye mask.
  - Output: `public/assets/characters/meshy_a.glb` and `meshy_b.glb`.
- Works: skin tone, eye and brow colour, body and face sliders, hair, accessories.
- Does not apply to the baked faces: brow style and lip colour.
- Meshy licence depends on the plan of the account that generated the bodies. Check before distribution.
- Meshy credits left: 42.

## Known issues and next steps, in order

1. Garments were refitted to the scanned bodies (necklines on the shoulder slope, rolled rims, bell skirts with folds, fabric
   relief and sheen, bare male torso; see ASSET_GUIDE "Garment fit"). Still weak:
   - some premade men default to skirts or nightgowns;
   - where a garment leaves the baked shorts visible (swimsuit, trunks) their hem shows as a faint seam on the thigh (the base
     layer is flatter than the baked skin around it); the swimsuit leg opening is a fragment cut on a coarse shell;
   - cloth folds are static (geometry on skirts and loose tops, normal detail elsewhere), not simulated.
2. Main chunk is over 1.2 MB; `content/index.ts` is imported both statically and dynamically.
3. Boot progress bar is not driven.
4. Social menu has 17+ entries in no relevance order.
5. Bookworm "own 2 bookcases" may count the starter bookcases.
6. Tests so far are on SwiftShader only. Record real-device runs in the device log in
   `docs/TEST_CHECKLIST.md`.

## Commands that work

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run content:check`
- `npm run e2e`
- `npm run e2e:acceptance` (`-- --only=portrait|landscape|desktop`). It takes the browser lock
  `/tmp/hearthside-browser.lock` itself; do not wrap it in another `flock`.
- `npm run assets` (needs the asset library at `../test/assets`)
- `npm run assets:meshy`
