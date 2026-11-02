# Milestone 6 progress — careers and economy

Short bullets per finished step, with the check result. If a run is interrupted, continue from the first unchecked step.

- [x] Content: 7 careers x 10 levels, 10 ready skills, 8 aspirations, freelance interactions, career events (typecheck + content:check green)
- [x] Core state and save defaults: bills, power, auto-pay, work effort, career events (typecheck green)
- [x] Simulation: career effort/events/join-quit, freelance sales, weekly bills and cut-off/restore (typecheck green)
- [x] Game API and UI: career tab controls, bills panel, phone/computer/mailbox openers (typecheck green)
- [x] Unit tests: careers, freelance once-only, bills, aspirations, save/load (37/37 in the five M6 files, logs `unit-m6-3.log`, `unit-careers-m6-3.log`)
- [x] Headless integration: 2 roommates, 14 days of jobs, freelancing and bills, fixed seed and deterministic repeat (2/2, log `integration-m6-3.log`)
- [x] Full `npm test` regression pass: 10 failures fixed — `fillEconomyDefaults` deleted a legitimate `pendingEvent: null`
  on load (save/reload byte equality in the M1 acceptance test), and the 7-day daily-life playtests starved after the
  unpaid-bill cut-off (day 5) because they never paid bills; they now auto-pay, since bill pressure has its own tests.
  Full suite green: 84 files, 1020 tests (`unit-m6-final2.log`); typecheck clean; build passes.
- [ ] Acceptance step 8 through the real UI in all three viewports
  - `e2e-portrait-m6-3`: only remaining miss was the "sleeping person lies in a bed" check firing while the person was
    already lying elsewhere (an autonomous nap) before the queued Sleep began. The wait now requires lying within 3.5 m
    of the chosen bed. (The run itself was also stopped by the 10-minute background limit during step 8, so reruns use
    a 60-minute limit.)
  - Portrait rerun (`e2e-portrait-m6-4.log`): 175 passed, 0 failed, including step 2 sleep and step 8 career panel,
    bill payment and freelance sale. Landscape and desktop running.
  - Attempt 1 (portrait): 161/165 checks passed. Fixed a stale roommate-wage assumption (Tue-Sat career has no day-0 shift),
    a bed tap that could land on the napping roommate (pick a free bed, wider object offsets) and step 8 calling the wrong
    `focusPerson` handle. Also added the missing promotion requirement "days worked" to the content, simulation and Career tab.
  - Quick step 1+8 (`--fast-start`, portrait, build): 15/15 passed after issuing a bill when the quick run has not ticked
    (`debug.step(4)`) and raising `.seg` to the 44 px touch minimum (the career-panel audit's 3 small targets are gone).
  - Attempt 2 (portrait): the roommate-wage check assumed both shifts end by 16:05, but the business shift ends at 17:00.
    Step 2 now waits for the roommate's own shift end before checking their wage (`tests/e2e/acceptance.mjs`).
- [ ] CONTENT_STATUS and docs regenerated/updated (CONTENT_STATUS + M6 min column + ARCHITECTURE/CONTINUATION/ROADMAP/TEST_CHECKLIST drafts done)
