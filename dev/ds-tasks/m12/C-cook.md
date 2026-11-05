Read dev/ds-tasks/m12/common.md first and follow it, except: do NOT run any browser test (no e2e, no acceptance,
no visual scripts) — another agent holds the browser. Unit tests, typecheck, content:check and build only.
You work in a separate git worktree; do not commit, the main session reviews and commits your diff.

## Task C: Cook a Meal across floors

Bug: on a multi-floor lot, "Cook a Meal" (interaction `cookMeal`, offered on fridges) is offered to a person on an
upper floor, but its stove check only accepts a stove on the actor's own level, so the action is cancelled on its
first tick when the stove is on another level (seen in the acceptance run: a member upstairs is told to cook and the
action vanishes). Find where cookMeal's availability is computed (the option list / "can do" check shown in the pie
menu) and where its chain looks for a stove (grep `cookMeal`, `stove`, `oven`, `level` in src/sim).

Fix, in this order of preference:
1. The stove search should accept a usable stove on any level of the lot that the person can reach (the same way
   other multi-level actions route the person across stairs; look at how the fridge/object route already works
   across floors in src/sim and reuse it). Prefer a stove on the person's own level, then the nearest reachable one.
2. Only if no reachable stove exists on any level: do not offer cookMeal (or offer it disabled with a short reason
   string in the existing style, e.g. "Needs a stove.") — availability and execution must use the same predicate so
   they can never disagree again.

Add focused unit tests (tests/unit/sim/ or tests/unit/integration/, following existing multi-floor tests such as
tests/unit/integration/floors.test.ts): stove downstairs + actor upstairs → action completes (meal produced); no
stove anywhere → option not offered/disabled and nothing queued; stove on own level still preferred.

Checks: npm run typecheck, npx vitest run (all), npm run content:check, npm run build.
Progress file: dev/ds-tasks/m12/C-progress.md (what you changed, file:line, test results).
