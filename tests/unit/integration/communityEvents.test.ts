// Milestone 13: the weekly community events at the venues, on the real content and world.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute, dayIndex, weekday } from '../../../src/core/clock';
import type { WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { communityEventsBetween, runningCommunityEvents, upcomingCommunityEvents } from '../../../src/sim/community';
import { plansAt } from '../../../src/sim/townlife';
import { VENUES } from '../../../src/world/neighbourhood';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 90_000 });

const premades = premadeHouseholds(db);

function quiet(seed = 42): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premades[0]!, seed)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.schedule = s.schedule.filter((e) => e.kind === 'travelArrive');
  for (const id of s.households[s.activeHouseholdId]!.memberIds) if (s.people[id]!.career) core.quitCareer(id);
  return core;
}
const now = (c: GameCore) => c.state()!.clock.minutes;
function runTo(c: GameCore, minute: number): void { if (minute > now(c)) c.advanceTicks(Math.ceil((minute - now(c)) / 0.25)); }
const venue = (s: WorldState, type: string) => Object.values(s.lots).find((l) => l.venueType === type)!;

/** The first day (from `from`) whose weekday is `wd`. */
const nextWeekday = (from: number, wd: number): number => { let d = dayIndex(from); while (weekday(atDayMinute(d, 0)) !== wd) d++; return d; };

describe('the community calendar', () => {
  it('is a pure weekly calendar inside the venues\' opening hours', () => {
    const c = quiet();
    const s = c.state()!;
    const week = communityEventsBetween(s, db, atDayMinute(7, 0), atDayMinute(14, 0));
    expect(week.map((e) => e.defId).sort()).toEqual(['bookClub', 'danceNight', 'familySplash', 'makersMarket', 'openMic', 'parkPicnic', 'quizNight']);
    for (const e of week) {
      const v = VENUES[e.venueType as keyof typeof VENUES];
      expect(e.startAt % 1440).toBeGreaterThanOrEqual(v.open);
      expect(e.endAt - atDayMinute(dayIndex(e.startAt), 0)).toBeLessThanOrEqual(v.close);
      expect(e.lotId).toBe(venue(s, e.venueType).id);
    }
    const fri = nextWeekday(0, 4);
    const mic = communityEventsBetween(s, db, atDayMinute(fri, 18 * 60 + 30), atDayMinute(fri, 18 * 60 + 31))[0]!;
    expect(mic).toMatchObject({ defId: 'openMic', running: true });
    expect(runningCommunityEvents(s, db, atDayMinute(fri, 17 * 60))).toEqual([]);
    expect(upcomingCommunityEvents(s, db, atDayMinute(fri, 18 * 60 + 30), 1)[0]!.running).toBe(true);
    // same minute, same answer
    expect(communityEventsBetween(s, db, 0, 20000)).toEqual(communityEventsBetween(s, db, 0, 20000));
  });

  it('draws the townspeople to the venue while it runs', () => {
    const c = quiet();
    const s = c.state()!;
    const arts = venue(s, 'arts').id;
    const count = (day: number) => [...plansAt(s, db, atDayMinute(day, 18 * 60 + 15)).values()].filter((p) => p.kind === 'venue' && p.lotId === arts).length;
    let withEvent = 0, without = 0;
    for (let w = 1; w <= 6; w++) { withEvent += count(nextWeekday(atDayMinute(w * 7, 0), 4)); without += count(nextWeekday(atDayMinute(w * 7, 0), 1)); }
    expect(withEvent).toBeGreaterThan(without);
  });
});

describe('attending', () => {
  it('rewards the household once after enough time at the venue, and announces the day', () => {
    const c = quiet();
    const s = c.state()!;
    const hh = s.households[s.activeHouseholdId]!;
    const arts = venue(s, 'arts');
    const fri = nextWeekday(now(c) + 1440, 4);
    runTo(c, atDayMinute(fri, 8 * 60));
    expect(s.feed.some((f) => f.text.includes('Open Mic Night'))).toBe(true);
    expect(s.feed.filter((f) => f.text.startsWith('Today at') && f.text.includes('Open Mic')).length).toBe(1);
    // set off in good time
    const mover = hh.memberIds.find((id) => s.people[id]!.lifeStage !== 'baby' && s.people[id]!.lifeStage !== 'toddler')!;
    runTo(c, atDayMinute(fri, 17 * 60 + 15));
    expect(c.travel([mover], arts.id).ok).toBe(true);
    for (let i = 0; i < 120 && s.activeLotId !== arts.id; i++) c.advanceTicks(4 * 5);
    expect(s.activeLotId).toBe(arts.id);
    const p = s.people[mover]!;
    const funBefore = (p.needs.fun = 30);
    runTo(c, atDayMinute(fri, 18 * 60 + 20));
    expect(s.processed[`commdone:openMic:${fri}:${mover}`]).toBeUndefined();
    runTo(c, atDayMinute(fri, 19 * 60 + 15));
    expect(s.processed[`commdone:openMic:${fri}:${mover}`]).toBeDefined();
    expect(p.needs.fun).toBeGreaterThan(funBefore);
    expect(p.memories.some((m) => m.text.includes('Open Mic Night'))).toBe(true);
    expect(s.feed.filter((f) => f.text.includes(`${p.firstName} enjoyed Open Mic Night`))).toHaveLength(1);
    // townspeople were there and got to know the visitor
    const mics = () => p.memories.filter((m) => m.text.includes('Open Mic Night')).length;
    expect(mics()).toBe(1);
    runTo(c, atDayMinute(fri, 19 * 60 + 55));
    expect(mics()).toBe(1); // not rewarded twice
  });
});
