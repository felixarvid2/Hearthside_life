import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, dayIndex } from '../../../src/core/clock';
import { NORMAL_STAGE_DAYS, STAGE_ORDER, daysToBirthday, nextStage, stageLength } from '../../../src/core/lifeStages';
import { ageUp, ageUpProblem, dailyAging, passAwayProblem } from '../../../src/sim/aging';
import { pureCtx, runTicks } from './fixtures';
import { addMember, familyWorld, placeObject } from './familyFixtures';

describe('life stage lengths', () => {
  it('normal uses the table, long is 2.5 times, custom uses agingDays (clamped), off has none', () => {
    expect(STAGE_ORDER.map((s) => stageLength({ aging: 'normal' }, s))).toEqual([3, 5, 10, 10, 14, 20, 14]);
    expect(STAGE_ORDER.map((s) => stageLength({ aging: 'long' }, s))).toEqual(STAGE_ORDER.map((s) => Math.round(NORMAL_STAGE_DAYS[s] * 2.5)));
    expect(stageLength({ aging: 'custom', agingDays: { baby: 2, adult: 500, child: 0 } }, 'baby')).toBe(2);
    expect(stageLength({ aging: 'custom', agingDays: { baby: 2, adult: 500, child: 0 } }, 'adult')).toBe(120);
    expect(stageLength({ aging: 'custom', agingDays: { child: 0 } }, 'child')).toBe(1);
    expect(stageLength({ aging: 'custom' }, 'teen')).toBe(10);
    expect(stageLength({ aging: 'off' }, 'baby')).toBeNull();
  });

  it('knows the next stage and the days to a birthday', () => {
    expect(STAGE_ORDER.map(nextStage)).toEqual(['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder', null]);
    expect(daysToBirthday({ aging: 'normal' }, 'child', 4)).toBe(6);
    expect(daysToBirthday({ aging: 'off' }, 'child', 4)).toBeNull();
    expect(daysToBirthday({ aging: 'normal' }, 'child', 99)).toBe(0);
  });
});

describe('aging at each setting', () => {
  const growUp = (aging: 'off' | 'long' | 'normal' | 'custom', days: number, agingDays?: Record<string, number>) => {
    const fw = familyWorld({ aging });
    if (agingDays) fw.w.state.settings.agingDays = agingDays;
    const baby = addMember(fw, fw.w.state.activeHouseholdId, 'Bea', { lifeStage: 'baby' });
    const ctx = pureCtx(fw.h);
    for (let d = 0; d < days; d++) dailyAging(ctx);
    return { fw, baby: fw.w.state.people[baby.id]! };
  };

  it('off: nobody ever ages', () => {
    const { baby } = growUp('off', 100);
    expect(baby.lifeStage).toBe('baby');
    expect(baby.stageDays).toBeUndefined();
  });

  it('normal: a baby becomes a toddler on the third day and the stage clock restarts', () => {
    expect(growUp('normal', 2).baby.lifeStage).toBe('baby');
    const { baby } = growUp('normal', 3);
    expect(baby.lifeStage).toBe('toddler');
    expect(baby.stageDays).toBe(0);
  });

  it('long: the same baby needs 8 days', () => {
    expect(growUp('long', 7).baby.lifeStage).toBe('baby');
    expect(growUp('long', 8).baby.lifeStage).toBe('toddler');
  });

  it('custom: uses the days per stage from the settings', () => {
    expect(growUp('custom', 1, { baby: 2 }).baby.lifeStage).toBe('baby');
    expect(growUp('custom', 2, { baby: 2 }).baby.lifeStage).toBe('toddler');
    const full = growUp('custom', 2 + 2 + 3 + 3 + 3 + 3, { baby: 2, toddler: 2, child: 3, teen: 3, youngAdult: 3, adult: 3 });
    expect(full.baby.lifeStage).toBe('elder');
  });

  it('an existing adult without stageDays counts from 0 when aging is switched on', () => {
    const fw = familyWorld({ aging: 'normal' });
    const mira = fw.w.state.people[fw.w.mira]!;
    expect(mira.stageDays).toBeUndefined();
    const ctx = pureCtx(fw.h);
    dailyAging(ctx);
    expect(mira.stageDays).toBe(1);
    expect(mira.lifeStage).toBe('adult');
  });

  it('is driven by the daily rollover of the simulation', () => {
    const fw = familyWorld({ aging: 'normal', startMinute: MINUTES_PER_DAY - 3 });
    const kid = addMember(fw, fw.w.state.activeHouseholdId, 'Kit', { lifeStage: 'child' });
    fw.w.state.people[kid.id]!.stageDays = 9;
    expect(dayIndex(fw.w.state.clock.minutes)).toBe(0);
    runTicks(fw.h, 40);
    expect(dayIndex(fw.w.state.clock.minutes)).toBe(1);
    expect(fw.w.state.people[kid.id]!.lifeStage).toBe('teen');
    expect(fw.w.state.people[kid.id]!.stageDays).toBe(0);
  });
});

describe('birthdays', () => {
  it('happen once per person and stage: the memory, moodlet, event and notification are not repeated', () => {
    const fw = familyWorld({ aging: 'normal' });
    const hh = fw.w.state.activeHouseholdId;
    const kid = addMember(fw, hh, 'Kit', { lifeStage: 'child' });
    const ctx = pureCtx(fw.h);
    const first = ageUp(ctx, fw.w.state.people[kid.id]!, 'time');
    expect(first).toEqual({ ok: true, stage: 'teen' });
    // the same birthday delivered again (a replayed day, a duplicated command)
    fw.w.state.people[kid.id]!.lifeStage = 'child';
    const again = ageUp(ctx, fw.w.state.people[kid.id]!, 'time');
    expect(again.ok).toBe(false);
    const p = fw.w.state.people[kid.id]!;
    expect(p.lifeStage).toBe('child');
    expect(p.memories.filter((m) => m.kind === 'birthday')).toHaveLength(1);
    expect(p.moodlets.filter((m) => m.id === 'birthday')).toHaveLength(1);
    expect(fw.h.log.filter((e) => e.type === 'birthday')).toHaveLength(1);
    expect(fw.w.state.feed.filter((f) => f.kind === 'family' && f.text.includes('Kit'))).toHaveLength(1);
    expect(fw.w.state.processed[`birthday:${kid.id}:teen`]).toBeDefined();
  });

  it('migrate the person: school, job, outfits and personality follow the new stage', () => {
    const fw = familyWorld({ aging: 'normal' });
    const hh = fw.w.state.activeHouseholdId;
    const kid = addMember(fw, hh, 'Kit', { lifeStage: 'child', traits: ['cheerful'] });
    const ctx = pureCtx(fw.h);
    expect(kid.school?.schoolId).toBe('elementary');
    kid.school!.performance = 40;
    ageUp(ctx, kid, 'time');
    expect(kid.lifeStage).toBe('teen');
    expect(kid.school).toMatchObject({ schoolId: 'high', performance: 20 });
    // teens have no job even if they had one
    kid.career = { careerId: 'culinary', level: 1, performance: 0, joinedAt: 0, daysWorked: 0, shift: null };
    kid.lifeStage = 'child'; // pretend a child with a job came from an old save
    fw.w.state.processed = {};
    ageUp(ctx, kid, 'time');
    expect(kid.career).toBeNull();
    // teen -> young adult: no school, three traits and an aspiration
    ageUp(ctx, kid, 'time');
    expect(kid.lifeStage).toBe('youngAdult');
    expect(kid.school).toBeNull();
    expect(kid.traits.length).toBe(3);
    expect(kid.aspiration).not.toBeNull();
    expect(kid.outfits.outfits.everyday!.length).toBeGreaterThan(0);
  });

  it('a baby who becomes a toddler starts with the toddler skills and leaves the crib posture', () => {
    const fw = familyWorld({ aging: 'normal' });
    const baby = addMember(fw, fw.w.state.activeHouseholdId, 'Bea', { lifeStage: 'baby' }, { x: 8, z: 8 });
    (baby.location as { posture: string }).posture = 'lying';
    ageUp(pureCtx(fw.h), baby, 'time');
    expect(baby.lifeStage).toBe('toddler');
    expect(Object.keys(baby.skills).sort()).toEqual(['motor', 'potty', 'talking']);
    expect((baby.location as { posture: string }).posture).toBe('standing');
  });

  it('an elder cannot have a birthday', () => {
    const fw = familyWorld({ aging: 'normal' });
    const old = addMember(fw, fw.w.state.activeHouseholdId, 'Opa', { lifeStage: 'elder' });
    expect(ageUpProblem(pureCtx(fw.h), old)).toMatch(/already an elder/);
    expect(ageUp(pureCtx(fw.h), old, 'time').ok).toBe(false);
  });
});

describe('the end of the elder stage', () => {
  const elderWorld = (endOfLife: boolean) => {
    const fw = familyWorld({ aging: 'normal' });
    fw.w.state.settings.elderEndOfLife = endOfLife;
    const hh = fw.w.state.activeHouseholdId;
    const opa = addMember(fw, hh, 'Opa', { lifeStage: 'elder' });
    opa.stageDays = 13;
    return { fw, hh, opa };
  };

  it('with the switch off the elder stays an elder', () => {
    const { fw, opa } = elderWorld(false);
    const ctx = pureCtx(fw.h);
    for (let i = 0; i < 5; i++) dailyAging(ctx);
    expect(fw.w.state.people[opa.id]).toBeDefined();
    expect(fw.w.state.people[opa.id]!.lifeStage).toBe('elder');
    expect(fw.w.state.people[opa.id]!.stageDays).toBe(14);
  });

  it('with the switch on the elder passes away peacefully and is removed cleanly', () => {
    const { fw, hh, opa } = elderWorld(true);
    const ctx = pureCtx(fw.h);
    dailyAging(ctx);
    const s = fw.w.state;
    expect(s.people[opa.id]).toBeUndefined();
    expect(s.households[hh]!.memberIds).not.toContain(opa.id);
    expect(Object.keys(s.relationships).some((k) => k.includes(opa.id))).toBe(false);
    expect(Object.values(s.bonds).some((b) => b.a === opa.id || b.b === opa.id)).toBe(false);
    expect(s.people[fw.w.mira]!.memories.some((m) => m.kind === 'passedAway')).toBe(true);
    expect(s.people[fw.w.mira]!.moodlets.some((m) => m.id === 'missedThem')).toBe(true);
    expect(s.feed.some((f) => f.kind === 'family' && /passed away/.test(f.text))).toBe(true);
    expect(fw.h.log.some((e) => e.type === 'person.removed')).toBe(true);
  });

  it('an elder of a household in town who was alone leaves the household gone and the home free', () => {
    const fw = familyWorld({ aging: 'normal' });
    fw.w.state.settings.elderEndOfLife = true;
    const s = fw.w.state;
    const ada = s.people[fw.w.neighbour!]!;
    const nh = s.households[ada.householdId]!;
    const lot = fw.w.lot; // use the home lot of the neighbour for the check
    nh.homeLotId = lot.id;
    ada.lifeStage = 'elder'; ada.stageDays = 13;
    dailyAging(pureCtx(fw.h));
    expect(s.people[ada.id]).toBeUndefined();
    expect(s.households[nh.id]).toBeUndefined();
    expect(lot.price).toBeGreaterThan(0);
  });

  it('spares the last member of the household and the only grown-up of the children', () => {
    const fw = familyWorld({ aging: 'normal' });
    fw.w.state.settings.elderEndOfLife = true;
    const s = fw.w.state;
    const hh = s.activeHouseholdId;
    const mira = s.people[fw.w.mira]!, theo = s.people[fw.w.theo]!;
    mira.lifeStage = 'elder'; mira.stageDays = 13;
    theo.lifeStage = 'child'; // the only other member is a child
    expect(passAwayProblem(pureCtx(fw.h), mira)).toMatch(/look after/);
    dailyAging(pureCtx(fw.h));
    expect(s.people[fw.w.mira]).toBeDefined();
    s.households[hh]!.memberIds = [mira.id];
    expect(passAwayProblem(pureCtx(fw.h), mira)).toMatch(/last member/);
  });
});

describe('Age up now at a birthday cake', () => {
  it('celebrates early, once a day, and the people around join in', () => {
    const fw = familyWorld({ aging: 'off', startMinute: 5 * MINUTES_PER_DAY + 12 * 60 }); // a Saturday: no school
    const s = fw.w.state;
    const hh = s.activeHouseholdId;
    const kid = addMember(fw, hh, 'Kit', { lifeStage: 'child' }, { x: 5, z: 9 });
    const cake = placeObject(fw, 'birthday-cake', 3, 4, 0, fw.w.objects.table!.id);
    expect(cake.defId).toBe('birthday-cake');
    const queued = fw.h.sim.ageUpNow(kid.id);
    expect(queued.ok).toBe(true);
    runTicks(fw.h, 4 * 120);
    expect(s.people[kid.id]!.lifeStage).toBe('teen');
    expect(s.people[kid.id]!.moodlets.some((m) => m.id === 'birthday')).toBe(true);
    expect(s.people[fw.w.mira]!.moodlets.some((m) => m.id === 'celebrating')).toBe(true);
    // again the same day: refused with a reason
    const again = fw.h.sim.ageUpNow(kid.id);
    expect(again.ok).toBe(false);
    expect(again.ok ? '' : again.reason).toMatch(/already celebrated today/);
    expect(s.people[kid.id]!.stageDays).toBe(0);
  });

  it('needs a cake', () => {
    const fw = familyWorld({ aging: 'off' });
    const kid = addMember(fw, fw.w.state.activeHouseholdId, 'Kit', { lifeStage: 'child' }, { x: 5, z: 9 });
    const r = fw.h.sim.ageUpNow(kid.id);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toMatch(/birthday cake/);
  });
});
