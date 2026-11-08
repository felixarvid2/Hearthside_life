// Milestone 11 integration: each new career can be joined, worked through a real shift and promoted, and the
// wage is paid exactly once. A short multi-day run drives the Education ladder through a working week. Everything
// goes through GameCore, the real content and the real simulation (no fixtures).

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute, weekday } from '../../../src/core/clock';
import { promotionDays } from '../../../src/content/careers';
import type { CareerLevelDef } from '../../../src/content/types';
import type { Person } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 180_000 });

const NEW_CAREERS = ['education', 'visualArts', 'science', 'athletics', 'design', 'hospitality'] as const;

const now = (c: GameCore) => c.state()!.clock.minutes;
function runTo(c: GameCore, minute: number): void {
  if (minute > now(c)) c.advanceTicks(Math.ceil((minute - now(c)) / 0.25));
}

/** A clean guided household with no existing jobs and enough money that wages are easy to find. */
function game(seed = 41): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premadeHouseholds(db)[0]!, seed)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.settings.autonomy = false;
  s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
  const hh = s.households[s.activeHouseholdId]!;
  for (const id of hh.memberIds) if (s.people[id]!.career) core.quitCareer(id);
  hh.funds = 1_000_000;
  return core;
}

/** An adult member of the played household. */
function adult(core: GameCore): Person {
  const s = core.state()!;
  const hh = s.households[s.activeHouseholdId]!;
  const p = hh.memberIds.map((id) => s.people[id]!).find((x) => x.lifeStage === 'adult' || x.lifeStage === 'youngAdult');
  expect(p, 'the guided household needs an adult').toBeDefined();
  return p!;
}

function setNeeds(p: Person, value: number): void {
  for (const k of Object.keys(p.needs) as Array<keyof typeof p.needs>) p.needs[k] = value;
}

/** The first weekday on which a level works (0 = Monday). */
function firstWorkDay(level: CareerLevelDef): number {
  for (let d = 0; d < 7; d++) if (level.days.includes(weekday(atDayMinute(d, 0)))) return d;
  throw new Error(`level ${level.level} has no work day`);
}

describe('Milestone 11 careers in the simulation', () => {
  it.each(NEW_CAREERS)('%s: join, work a shift, get paid once and be promoted', (careerId) => {
    const core = game();
    const p = adult(core);
    const def = db.careers[careerId]!;
    const level = def.levels[0]!;
    const day = firstWorkDay(level);
    const s = core.state()!;

    // Join at the start of the day so the shift counts as worked (not joined mid-shift).
    s.clock.minutes = atDayMinute(day, 0);
    setNeeds(p, 85);
    expect(core.joinCareer(p.id, careerId)).toEqual({ ok: true });
    expect(core.state()!.people[p.id]!.career).toMatchObject({ careerId, level: 1, daysWorked: 0 });

    // Enough performance to clear the first promotion; skills are not needed until the next rung.
    core.state()!.people[p.id]!.career!.performance = 100;
    core.state()!.people[p.id]!.career!.daysWorked = promotionDays(1) - 1; // the first promotion also needs the days (docs/BALANCE.md)
    runTo(core, atDayMinute(day, level.start - 45));
    runTo(core, atDayMinute(day, level.end + 1));

    const after = core.state()!.people[p.id]!;
    expect(after.career, careerId).toMatchObject({ careerId, level: 2, daysWorked: promotionDays(1), shift: { status: 'done' } });
    const wages = core.state()!.households[core.state()!.activeHouseholdId]!.ledger
      .filter((l) => l.kind === 'wage' && l.occurrence === `pay:${p.id}:${day}`);
    expect(wages, `${careerId} wage occurrence`).toHaveLength(1);
    expect(wages[0]!.amount).toBeGreaterThan(0);

    // A second day (same occurrence id) cannot pay the same shift again.
    runTo(core, atDayMinute(day, level.end + 120));
    const again = core.state()!.households[core.state()!.activeHouseholdId]!.ledger
      .filter((l) => l.kind === 'wage' && l.occurrence === `pay:${p.id}:${day}`);
    expect(again).toHaveLength(1);
  });

  it('plays three in-game days of the Education career with one wage per day', () => {
    const core = game(7);
    const p = adult(core);
    const def = db.careers['education']!;
    const level = def.levels[0]!;
    const s = core.state()!;
    s.clock.minutes = atDayMinute(0, 0);
    setNeeds(p, 90);
    expect(core.joinCareer(p.id, 'education')).toEqual({ ok: true });
    s.people[p.id]!.career!.performance = 100;
    s.people[p.id]!.career!.daysWorked = promotionDays(1) - 3; // three shifts reach the days for level 2
    const base = promotionDays(1) - 3;

    // Monday, Tuesday and Wednesday: one weekday shift per day.
    for (let day = 0; day < 3; day++) {
      setNeeds(s.people[p.id]!, 90);
      runTo(core, atDayMinute(day, level.end + 30));
      const worked = s.people[p.id]!.career!;
      expect(worked.daysWorked, `shifts completed by day ${day}`).toBe(base + day + 1);
      const paid = s.households[s.activeHouseholdId]!.ledger
        .filter((l) => l.kind === 'wage' && l.occurrence === `pay:${p.id}:${day}`);
      expect(paid, `day ${day} wage`).toHaveLength(1);
    }
    const career = core.state()!.people[p.id]!.career!;
    expect(career.level).toBeGreaterThanOrEqual(2);
    // The career trains its own skills on every shift (Charisma and Logic for Education).
    expect(s.people[p.id]!.skills['charisma']!.xp).toBeGreaterThan(0);
    expect(s.people[p.id]!.skills['logic']!.xp).toBeGreaterThan(0);
  });
});
