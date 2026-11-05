# Task F — three Milestone 12 fixes

Status: all three tasks fixed and verified — pool visual re-shot (36/36 checks), travel regression fixed at the
cause, acceptance step 11 deterministic and green in portrait and landscape.

## 1. Invisible swimmers

Root cause: the sink assumed a standing person. The shared `Swim_Fwd_Loop` / `Swim_Idle_Loop` clips lie the
body flat around the root — measured from `public/assets/characters/anims_1.glb` (bone world positions with
the clip applied): pelvis about -0.08 m, head about +0.02 m, hands dipping to about -0.4 m during a stroke,
and the floating clip's feet trailing to about -1.1 m.
`peopleView.ts` still lowered the root by `0.92 * max(stageHeight / 1.8, 0.55)`, putting every bone at
roughly -0.9 m: under the pool's basin floor (-0.78 m) and far below the water plane (0.015 m). Only the
name tag (drawn from `headTop`, i.e. root + standing height) stayed above the water, matching the report.

Fix (`src/render/peopleView.ts`): for `swim`/`float` put the root on the pool's water plane
(`WATER_Y = 0.015`, now exported from `src/render/poolView.ts`) plus 0.04 m, instead of sinking it by the
standing height. The clip's own body then sits at the surface: head about 0.06-0.07 m above it, back and legs
just under the transparent water, arms stroking through it; the floating clip treads water with the head about
0.3 m up.
No stage-height factor is needed: the whole body scales with the root and the clip is already relative to it.
`p-shots.mjs` now also logs a probe (visible flag, root, world bone x/y/z bounds) and checks that the
swimmer's top bone is above the surface while the lowest bone is below it.

Regression test: `tests/unit/swim-probe.test.ts` loads `anims_1.glb`, plays each swim/float clip at two times
and asserts the skeleton stays within a flat body's range around the root (nothing near standing height, lowest
limb above about -1.3 m). It fails on the old standing-body assumption and on any clip replacement that stands
the character up again.

## 2. Travel regression: a member starts 'introduce' with autonomy off

Root cause: Milestone 12's four new weather preferences changed the preference list, which shifts the
generated personality RNG stream and therefore the NPCs in the travel fixture. The new NPC decisions exposed
a latent bug (older than M12): `personAvailable` only checked distance/availability, so an NPC could start a
social on an idle member of the played household and `social.ts` would force a `chain`/`role:'listen'`
action onto that member, emitting `action.started` for them even though `settings.autonomy` is off. The
household's autonomy setting must rule on every lot: nobody else may pull a member into a conversation.

Fix: `personAvailable` (`src/sim/social.ts`) now refuses a non-playable actor socialising with a member of a
playable household while autonomy is off (`"<name> is waiting for orders."`). Player-ordered socials are
unaffected (the actor is playable), as are NPC-to-NPC socials. A guest the player invited to a running event
(homeEvents `running`, both people participants) is exempt: chatting with the host is part of the gathering
the player started, and the existing events score test depends on it.

Focused test: `tests/unit/sim/social.test.ts`, "autonomy off for the played household" — asserts the refusal
reason, that the neighbour's autonomy candidates no longer include the member, that the player can still
order the conversation, and that autonomy on restores the candidate. `tests/unit/sim/autonomy.test.ts`'s
comment was updated (residents no longer take part as partners).

`tests/unit/integration/travel.test.ts` was not modified.

## 3. Acceptance step 11 refused by rain

Weather is planned from the seed and `startNewGame` picks a random seed, so the acceptance run could land on
rain, and the watering rule correctly refuses ("It is raining."). The scenario is now deterministic without
turning weather off:

- `window.hearthside.debug.setWeather(kind)` (`src/main.ts`) pins the stored same-day plan (current + today +
  tomorrow + day/since) for the current day. `ensureWeather` keeps a same-day plan as stored, so it lasts
  until midnight and later days are planned normally; the weather setting stays on.
- `tests/e2e/acceptance.mjs` has a documented `forceClearWeather(T)` helper, called once at the start of the
  garden-bed section of step 11 (before planting/watering/harvesting), and a check that it was applied.

## Check results

- `npm run typecheck` — pass (`tsc --noEmit`).
- `npm run content:check` — pass, 0 errors, 0 warnings.
- `tests/unit/integration/travel.test.ts`, `tests/unit/sim/social.test.ts`, `sim/autonomy.test.ts`,
  `sim/events.test.ts`, `sim/poolLifecycle.test.ts`, `sim/weather.test.ts`, `tests/unit/swim-probe.test.ts` —
  all pass (64 + 25 tests).
- `npm run visual:m12:pools` — 36/36 checks in portrait, landscape and desktop. The swim probe reports the
  swimmer visible with root y 0.055 (water plane 0.015) and the bone span 0.055 (head) down to -0.21/-0.24
  (hands/feet) per viewport: head above the surface, body under the transparent water — the exact opposite of
  the old -0.9 m sink. Screenshots re-shot in `dev/ds-tasks/m12/shots/P/pool-swim-*.png`.
- `npx vitest run` (all) — 155 of 156 files, 2020 of 2021 tests pass. The one failure is the known load flake
  `tests/unit/surfaces/painters.test.ts` "are deterministic" (the 5 s default timeout expired while an
  M11.5 Playwright job held the machine); rerun alone it passes 17/17 in 21.6 s. No pool, weather, social or
  travel test failed.
- `npm run build` — pass (vite build, `✓ built in 11.77s`; the usual chunk-size warning only).
- `npm run e2e:acceptance -- --only=portrait,landscape --steps=11 --fast-start` — **176 passed, 0 failed**.
  Step 11 passes in both viewports, including "the garden step can rely on clear weather" (`true`) and
  "Water the Bed fills the bed" (`{"ok":true,"reason":""}`), plus harvest; no page/console errors. The scenario
  was deterministic on this run: `setWeather('clear')` pinned a clear same-day plan, and later game days (the
  crop ripening) were planned normally.
- `npm run e2e` — pass (exit 0): desktop 1280x720, portrait 390x844 and landscape 844x390 shot sets all ran,
  ending with `OK. Screenshots in tests/e2e/out/screenshots`; no page errors and no missing-model warnings.
