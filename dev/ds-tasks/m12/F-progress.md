# Task F — three Milestone 12 fixes

Status: task 2 and task 3 implemented; task 1 under diagnosis (the pool visual run is queued behind a hung
M11.5 browser job on `/tmp/hearthside-browser.lock`).

## 1. Invisible swimmers (in progress)

Root cause: the sink assumed a standing person. The shared `Swim_Fwd_Loop` / `Swim_Idle_Loop` clips lie the
body flat around the root — measured from `public/assets/characters/anims_1.glb` (bone world positions with
the clip applied): pelvis about -0.08 m, head about +0.02 m, hands dipping to about -0.55 m during a stroke.
`peopleView.ts` still lowered the root by `0.92 * max(stageHeight / 1.8, 0.55)`, putting every bone at
roughly -0.9 m: under the pool's basin floor (-0.78 m) and far below the water plane (0.015 m). Only the
name tag (drawn from `headTop`, i.e. root + standing height) stayed above the water, matching the report.

Fix (`src/render/peopleView.ts`): for `swim`/`float` raise the root a small fixed amount above the ground
(0.18 m) instead of sinking it, so the head and upper body break the surface while the submerged parts stay
under the transparent water. No stage-height factor is needed: the whole body scales with the root and the
clip is already relative to it. `p-shots.mjs` now also logs a probe (visible flag, root, world bone x/y/z
bounds) and checks that the swimmer's top bone is above the surface while the lowest bone is below it.

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
