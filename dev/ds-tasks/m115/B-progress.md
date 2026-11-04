Read dev/ds-tasks/m115/common.md first and follow it.

## Task B: a progress pill above the head for every running action

Overhead UI is DOM in `#world-overlay`, managed by `src/render/peopleView.ts` (thought bubbles from
`Person.thought`, speech lines, name tags). Running actions: `ActionInstance` in `src/core/types.ts` (phase,
elapsed, duration (null = until a need is full), data.stage for chains, cancelRequested). Interaction defs:
`src/content/types.ts` `InteractionDef` (duration fixed/untilFull, needsPerHour, icon if any) and
`src/content/interactions.ts`; socials have their own defs.

1. **Progress maths.** A pure module `src/render/actionProgress.ts` (no DOM/three) with
   `actionProgress(state, person) -> { fraction: 0..1; icon; label; done: boolean } | null` (unit-tested):
   - null when there is no running action or it is only queued/validating; walking to the target (`route`) shows the
     pill at 0 with a small walking hint, or is hidden - choose and document; prepare/perform/apply count.
   - fixed duration: elapsed/duration. untilFull: how far the driving need (the need with the largest positive
     needsPerHour) has gone from its value at the start (record nothing new if you can compute it from the need and
     its rate; otherwise use an optional `data.startNeed` set in the sim with a test) to full.
   - multi-stage chains (cookMeal stages 0-2, pools, others using data.stage): overall progress across stages using
     each stage's share of the planned time, so the pill never jumps backwards between stages.
   - socials and conversations: progress of the current social exchange.
   - monotonic: the fraction never decreases while the same action runs (clamp against the last shown value per
     action id in the view, not in sim state).
2. **The pill.** New module `src/ui/hud/progressPill.ts` (or `src/render/progressPills.ts`), its own container inside
   `#world-overlay`, positioned above the head of each person on the visible lot/level (reuse the projection that the
   thought bubble uses; sit above the name tag/thought bubble without overlapping them; stack nicely when the thought
   bubble shows). Look: a small rounded pill (about 44x10 px on phones, 56x12 desktop) with the interaction icon
   at its left, a fill that grows left to right and blends from a warm amber to green as it nears completion
   (green at >= 85 %), and on completion briefly a fully green pill with a check mark that fades out in ~0.7 s. A
   cancelled/failed action fades out grey. Uses the existing theme tokens/icons in `src/ui`, readable on light and
   dark backgrounds (outline/shadow). `pointer-events: none` so it never blocks taps on the world. Only for people of
   the active household by default; a setting `actionProgress: 'household' | 'all' | 'off'` (default 'household') in
   `src/game/settings.ts` and the options screen (all three viewports). Update the DOM at most ~10 times per second,
   only for on-screen people, transitions off with reducedMotion.
3. **Hook** into `src/render/gameView.ts` / `peopleView.ts` with minimal additions. Do not change hand props (task H)
   or objects (task D, S).
4. **Tests.** Unit tests for `actionProgress` (fixed, untilFull, chains incl. cookMeal, social, cancel, monotonic
   clamp, mid-action load) and the colour/state function; a DOM test (jsdom, like other ui tests) that the pill
   renders, updates its fill width and shows the check on completion.
5. **Screenshots** in all three viewports: a person cooking at ~30 % and ~90 % (green), two people in different
   actions at once, the completion check, the setting in the options screen.

Progress file: dev/ds-tasks/m115/B-progress.md.
