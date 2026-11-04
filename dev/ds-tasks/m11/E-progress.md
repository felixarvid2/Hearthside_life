# Task E: pond model and M11 docs (progress)

Status: complete on 2026-11-03.

## Files changed
- `tools/furniture-extra/models.mjs` - `fishingPond` rebuilt: irregular 24-point rim of rounded lathe stones in
  grey/brown kit materials, two-depth opaque blue-green water (`metalMedium` outer, `metalDark` centre), three
  notched lily pads (one with a white flower), and a front-right clump of reeds and cattails.
- `src/content/objects.ts` - `MODEL_BOUNDS.fishingPond` updated to the rebuilt manifest bounds
  `[[0.0339, 0, 0.0347], [0.9673, 0.407, 0.9735]]`. Footprint (2x2), anchor and fit scale unchanged.
- `public/assets/furniture/fishingPond.glb`, `public/assets/furniture/thumbs/fishingPond.png`,
  `public/assets/manifest.json` - rebuilt with `npm run assets:extra`.
- `dev/ds-tasks/m11/shots-skills-b.mjs` - yoga shots: the mat is placed in open floor inside the house, on a 2x1
  footprint across the view where possible, cutaway walls down, camera centred on the mat. `setupWorld` now calls
  `view.lotChanged('objects')` / `lotChanged('floors')` so the renderer sees the placed objects; new on-screen
  person/mat and centring checks.
- `docs/ARCHITECTURE.md` - "Progression and social scope (Milestone 11)": six new careers, six ready skills with
  activities/objects/effects/payout occurrence ids, 40 traits and 13 adult-only aspirations; stale career/skill
  counts fixed in the M1 ids and M6 sections.
- `docs/ROADMAP.md` - Milestones 1-11 complete (M11 on its own PR); next M10 or M12; new M11 summary; entry 6
  rewritten.
- `docs/CONTINUATION.md` - M11 state, table row, checks table, known gaps, next steps.
- `docs/CONTENT_STATUS.md` - tables regenerated from `npm run content:check -- --markdown`; intro states the M11
  minimums and current counts (13 careers/130 levels, 19 skills, 40 traits, 13 aspirations/39 stages, 45 socials).
- `docs/ASSET_GUIDE.md` - original-model list now includes bread oven, yoga mat, sketchbook, camera tripod,
  telescope and stocked garden pond.
- `dev/ds-tasks/m11/render-pond.mjs` + preview PNGs and the `visual:m11:pond` script - dev-only model preview
  tool used while iterating on the pond (not runtime code).

## How it works
The pond keeps the existing 2x2 footprint and `useFront('fish', ...)` anchor. Its rim uses a deterministic sine
noise function (no `Math.random`), so rebuilds are reproducible. Water is opaque and layered so it reads in the
software-rendered thumbnail (glass on top looked pale there). Lily pads are upward-facing notched triangle fans at
water level; reeds use `cylY` stems, `fur` cattail heads and arching `plant` blades. All material names are from the
kit, so the finish system and lighting treat them normally.

The yoga fix is shot-only: the mat is selected from free interior tiles away from walls, the camera focuses on the
mat centre with cutaway walls down, and the renderer is resynced after the script mutates `lot.objects`.

## Checks (final tree, 2026-11-03)
- `npm run typecheck` - clean.
- `npm test` - 129 files, 1746/1746 tests pass.
- `npm run content:check` - 0 errors, 0 warnings.
- `npm run build` - passes; only the existing 2.27 MB main-chunk warning.
- `npm run visual:m11:skills-c` - 39/39 checks, 12 screenshots; `desktop-pond.png` and `portrait-pond.png` show
  the new irregular stone-rimmed pond with dark teal water, green pads, a flower and cattails.
- `npm run visual:m11:skills` - 45/45 checks, 12 screenshots; `desktop-yoga-mat.png` and `portrait-yoga-mat.png`
  show the person standing/posing on a visible mat centred in the living room.

## Open items
- No code or content gaps found in task E. The M11 career ladders deliberately ask for the new skills from level
  4-5; this is documented in CONTINUATION.md.
- Supervising session: run `bash tools/te-save.sh`, scan for API keys, commit `.tokeneconomizer/` with the rest,
  and merge the M11 PR only after the user approves. This agent cannot run git, curl or rm.
- The pond preview PNGs and `render-pond.mjs` are debug artifacts; keep them as a dev preview tool or remove them
  before merging.
