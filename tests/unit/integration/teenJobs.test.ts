// Milestone 8 gap: part-time jobs for teenagers on the real content, world and simulation. A teenager takes one
// part-time job beside school; shifts fall after the school bell; the wage occurrence pays once; ageing to young adult
// ends the job with a feed line; grown-ups are not offered teen jobs; and a save and load keep every marker.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute, weekday } from '../../../src/core/clock';
import { NORMAL_STAGE_DAYS } from '../../../src/core/lifeStages';
import type { Id } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { careersForStage } from '../../../src/sim/careers';
import { schoolDayOn } from '../../../src/sim/school';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 180_000 });

const premades = premadeHouseholds(db);
const now = (c: GameCore) => c.state()!.clock.minutes;
function runTo(c: GameCore, minute: number): void { if (minute > now(c)) c.advanceTicks(Math.ceil((minute - now(c)) / 0.25)); }

function game(seed = 42): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premades[0]!, seed)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
  const hh = s.households[s.activeHouseholdId]!;
  for (const id of hh.memberIds) if (s.people[id]!.career) core.quitCareer(id);
  hh.funds = 1_000_000;
  return core;
}

function adoptTeen(core: GameCore, name = 'Tess'): Id {
  const s = core.state()!;
  const parent = s.households[s.activeHouseholdId]!.memberIds[0]!;
  const r = core.adopt(parent, { stage: 'teen', sex: 'girl', firstName: name });
  expect(r.ok).toBe(true);
  return (r as { personId: Id }).personId;
}

const partTime = () => careersForStage(db, 'teen');
const adultJobs = () => careersForStage(db, 'adult');

describe('teen part-time jobs', () => {
  it('offers four part-time jobs to teens only, and only part-time jobs fit around school', () => {
    expect(partTime().length).toBeGreaterThanOrEqual(4);
    expect(partTime().every((d) => d.partTime === true && d.levels.length === 3)).toBe(true);
    expect(adultJobs().every((d) => !d.partTime)).toBe(true);
    expect(careersForStage(db, 'child')).toEqual([]);
    // level 3 needs one skill, days worked and a performance bar
    for (const d of partTime()) {
      const toThird = d.levels[1]!.promotion;
      expect(Object.keys(toThird.skills), d.name).toHaveLength(1);
      expect(toThird.days ?? 0).toBeGreaterThan(0);
      expect(toThird.performance).toBeGreaterThan(0);
    }
    // every level keeps its hourly pay below a grown-up's entry level
    const lowestAdult = Math.min(...adultJobs().map((d) => d.levels[0]!.hourlyWage));
    expect(Math.max(...partTime().flatMap((d) => d.levels.map((l) => l.hourlyWage)))).toBeLessThan(lowestAdult);

    const core = game();
    const teen = adoptTeen(core);
    const parent = core.state()!.households[core.state()!.activeHouseholdId]!.memberIds[0]!;
    const job = partTime()[0]!;
    expect(core.joinCareer(teen, adultJobs()[0]!.id)).toMatchObject({ ok: false, reason: /part-time/i });
    expect(core.joinCareer(parent, job.id)).toMatchObject({ ok: false, reason: /teenagers/i });
    expect(core.joinCareer(teen, job.id)).toEqual({ ok: true });
    expect(core.state()!.people[teen]!.career).toMatchObject({ careerId: job.id, level: 1 });
    // quitting a part-time job works like any other job
    expect(core.quitCareer(teen).ok).toBe(true);
    expect(core.state()!.people[teen]!.career).toBeNull();
    expect(core.state()!.feed.some((f) => /quit the /.test(f.text))).toBe(true);
  });

  it('never schedules a shift across the school day', () => {
    const core = game();
    const teen = adoptTeen(core);
    const person = core.state()!.people[teen]!;
    for (const def of partTime()) {
      for (const lvl of def.levels) {
        const length = lvl.end - lvl.start;
        expect(length).toBeGreaterThanOrEqual(3 * 60);
        expect(length).toBeLessThanOrEqual(4 * 60);
        for (let day = 0; day < 7; day++) {
          if (!lvl.days.includes(weekday(atDayMinute(day, 0)))) continue;
          const school = schoolDayOn(db, person, day);
          if (!school) continue;
          const start = atDayMinute(day, lvl.start);
          const end = atDayMinute(day, lvl.end);
          expect(start >= school.end || end <= school.start, `${def.name} ${lvl.title} day ${day}`).toBe(true);
        }
      }
    }
  });

  it('pays a part-time shift once, beside a full school day, and survives a save and load', async () => {
    const core = game();
    const teen = adoptTeen(core);
    const s = core.state()!;
    const job = db.careers['cafeHelper']!; // Monday to Thursday, 16:00-19:30
    expect(core.joinCareer(teen, job.id).ok).toBe(true);

    runTo(core, atDayMinute(0, 20 * 60));
    const p = s.people[teen]!;
    expect(p.school).toMatchObject({ attended: 1, missed: 0 });
    expect(p.career).toMatchObject({ level: 1, daysWorked: 1, shift: { status: 'done' } });
    const wages = s.households[s.activeHouseholdId]!.ledger.filter((l) => l.occurrence === `pay:${teen}:0`);
    expect(wages).toHaveLength(1);
    expect(wages[0]!.amount).toBeGreaterThan(0);
    expect(s.processed[`school:${teen}:0`]).toBeDefined();
    expect(s.processed[`money:pay:${teen}:0`]).toBeDefined();

    // a save and load in the middle of the week keeps the once-only markers
    const json = core.exportWorld()!;
    const copy = coreWithoutSaves();
    expect((await copy.importWorld(json)).ok).toBe(true);
    expect(JSON.stringify(copy.state())).toBe(JSON.stringify(s));
    runTo(copy, atDayMinute(1, 20 * 60));
    runTo(core, atDayMinute(1, 20 * 60));
    expect(JSON.stringify(copy.state())).toBe(JSON.stringify(s));
    const after = s.households[s.activeHouseholdId]!.ledger.filter((l) => l.occurrence === `pay:${teen}:0`);
    expect(after).toHaveLength(1);
    expect(s.people[teen]!.career!.daysWorked).toBe(2);
    expect(s.households[s.activeHouseholdId]!.ledger.some((l) => l.occurrence === `pay:${teen}:1`)).toBe(true);
  });

  it('ends the part-time job when the teenager becomes a young adult', () => {
    const core = game(7);
    const teen = adoptTeen(core);
    expect(core.joinCareer(teen, 'dogWalker').ok).toBe(true);
    core.setSimSettings({ aging: 'normal' });
    const s = core.state()!;
    s.people[teen]!.stageDays = NORMAL_STAGE_DAYS.teen - 1;
    runTo(core, atDayMinute(1, 0)); // the midnight rollover and the birthday
    const p = s.people[teen]!;
    expect(p.lifeStage).toBe('youngAdult');
    expect(p.career).toBeNull();
    expect(s.feed.some((f) => f.kind === 'career' && f.text === `${p.firstName} left the part-time job at Happy Tails Dog Walking.`)).toBe(true);
    expect(core.quitCareer(teen)).toMatchObject({ ok: false });
  });
});
