import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, atDayMinute } from '../../../src/core/clock';
import { isProcessed } from '../../../src/core/state';
import { careProblem, callSitter, settleBaby, settleDependents, updateCare } from '../../../src/sim/care';
import { SITTER_FEE } from '../../../src/sim/tuning';
import { pureCtx, runTicks, runUntil, setNeeds } from './fixtures';
import { addMember, familyWorld, placeObject } from './familyFixtures';

const SATURDAY_NOON = 5 * MINUTES_PER_DAY + 12 * 60;

function nursery(autonomy = false) {
  const fw = familyWorld({ startMinute: SATURDAY_NOON, autonomy });
  const s = fw.w.state;
  s.settings.autonomy = autonomy;
  const hh = s.activeHouseholdId;
  const crib = placeObject(fw, 'crib-wood', 6, 0);
  const baby = addMember(fw, hh, 'Bea', { lifeStage: 'baby' }, { x: 8, z: 8 });
  setNeeds(s, fw.w.mira, 90);
  setNeeds(s, fw.w.theo, 90);
  return { fw, s, hh, crib, baby: baby.id };
}

describe('babies', () => {
  it('are settled in a crib or bassinet, lying, and go back to it', () => {
    const { fw, s, crib, baby } = nursery();
    const ctx = pureCtx(fw.h);
    settleBaby(ctx, s.people[baby]!);
    const loc = s.people[baby]!.location as { x: number; z: number; posture: string };
    const slot = fw.h.nav.slotsOf(fw.w.lot.id, crib.id).find((x) => x.kind === 'sleep')!;
    expect([loc.x, loc.z]).toEqual([slot.x, slot.z]);
    expect(loc.posture).toBe('lying');
    expect(s.people[baby]!.anim.id).toBe('sleep');
    // a second baby takes the free place of another crib, not the same slot
    placeObject(fw, 'bassinet-wicker', 8, 0);
    const twin = addMember(fw, s.activeHouseholdId, 'Bo', { lifeStage: 'baby' }, { x: 9, z: 9 });
    settleDependents(pureCtx(fw.h));
    const a = s.people[baby]!.location as { x: number; z: number }, b = s.people[twin.id]!.location as { x: number; z: number };
    expect(a.x !== b.x || a.z !== b.z).toBe(true);
    expect((s.people[twin.id]!.location as { posture: string }).posture).toBe('lying');
  });

  it('cannot act on their own: no orders, no autonomy', () => {
    const { fw, s, baby } = nursery(true);
    const r = fw.h.sim.queue(baby, { interactionId: 'sleep', target: { kind: 'self' } });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toMatch(/baby/);
    runTicks(fw.h, 4 * 60 * 6);
    expect(s.people[baby]!.queue).toEqual([]);
  });
});

describe('caring for a baby', () => {
  it('Feed carries the baby to the caregiver, raises hunger and puts the baby back in the crib', () => {
    const { fw, s, baby } = nursery();
    s.people[baby]!.needs.hunger = 20;
    const before = s.people[baby]!.needs.hunger;
    const q = fw.h.sim.queue(fw.w.mira, { interactionId: 'careFeed', target: { kind: 'person', personId: baby } });
    expect(q.ok).toBe(true);
    let carried = false;
    runUntil(fw.h, () => {
      const m = s.people[fw.w.mira]!.location as { x: number; z: number };
      const b = s.people[baby]!.location as { x: number; z: number; posture: string };
      if (s.people[fw.w.mira]!.queue[0]?.phase === 'perform' && b.x === m.x && b.z === m.z && b.posture === 'standing') carried = true;
      return s.people[fw.w.mira]!.queue.length === 0;
    }, 4 * 60);
    expect(carried).toBe(true);
    expect(s.people[baby]!.needs.hunger).toBeGreaterThan(before + 40);
    expect(s.people[baby]!.moodlets.some((m) => m.id === 'looked')).toBe(true);
    expect((s.people[baby]!.location as { posture: string }).posture).toBe('lying');
  });

  it('each care action raises its needs; Change Diaper gets more with a changing table', () => {
    const { fw, s, baby } = nursery();
    const run = (id: string) => {
      const q = fw.h.sim.queue(fw.w.mira, { interactionId: id, target: { kind: 'person', personId: baby } });
      expect(q.ok, id).toBe(true);
      runUntil(fw.h, () => s.people[fw.w.mira]!.queue.length === 0, 4 * 90);
    };
    const b = s.people[baby]!;
    Object.assign(b.needs, { hunger: 30, bladder: 20, hygiene: 20, energy: 30, social: 30, fun: 30 });
    run('careChange');
    expect(b.needs.bladder).toBeGreaterThan(70);
    const plain = b.needs.hygiene;
    expect(plain).toBeGreaterThan(55);
    run('careBed'); expect(b.needs.energy).toBeGreaterThan(75);
    run('careCuddle'); expect(b.needs.social).toBeGreaterThan(60);
    run('carePlay'); expect(b.needs.fun).toBeGreaterThan(60);
    placeObject(fw, 'changing-table', 9, 0);
    b.needs.bladder = 20; b.needs.hygiene = 20;
    run('careChange');
    expect(b.needs.hygiene).toBeGreaterThan(plain + 5);
  });

  it('only one caregiver looks after a little one at a time', () => {
    const { fw, s, baby } = nursery();
    s.people[baby]!.needs.hunger = 10;
    const a = fw.h.sim.queue(fw.w.mira, { interactionId: 'careFeed', target: { kind: 'person', personId: baby } });
    expect(a.ok).toBe(true);
    runTicks(fw.h, 6);
    const b = fw.h.sim.queue(fw.w.theo, { interactionId: 'careFeed', target: { kind: 'person', personId: baby } });
    expect(b.ok).toBe(false);
    expect(b.ok ? '' : b.reason).toMatch(/looked after/);
  });

  it('is refused for people who are not little, and by those who are too young to care', () => {
    const { fw, s, hh, baby } = nursery();
    const kid = addMember(fw, hh, 'Kit', { lifeStage: 'child' }, { x: 9, z: 9 });
    const ctx = pureCtx(fw.h);
    expect(careProblem(ctx, s.people[fw.w.mira]!, s.people[fw.w.theo]!, 'careFeed')).toMatch(/looks after/);
    expect(careProblem(ctx, kid, s.people[baby]!, 'careFeed')).toMatch(/too young to look after/);
    expect(careProblem(ctx, s.people[fw.w.mira]!, s.people[baby]!, 'careBirthday')).toMatch(/birthday cake/);
    s.people[baby]!.needs.hunger = 100;
    expect(careProblem(ctx, s.people[fw.w.mira]!, s.people[baby]!, 'careFeed')).toMatch(/isn't hungry/);
  });

  it('a caregiver celebrates a baby\'s birthday with a cake (Age up now)', () => {
    const { fw, s, baby } = nursery();
    placeObject(fw, 'birthday-cake', 3, 4, 0, fw.w.objects.table!.id);
    const r = fw.h.sim.ageUpNow(baby);
    expect(r.ok).toBe(true);
    runUntil(fw.h, () => s.people[baby]!.lifeStage === 'toddler', 4 * 120);
    expect(s.people[baby]!.moodlets.some((m) => m.id === 'birthday')).toBe(true);
    expect(s.people[baby]!.stageDays).toBe(0);
  });
});

describe('autonomous caregivers', () => {
  it('feed, change and play with a needy baby before the sitter is ever needed', () => {
    const { fw, s, baby } = nursery(true);
    Object.assign(s.people[baby]!.needs, { hunger: 30, bladder: 30, hygiene: 30, energy: 90, social: 25, fun: 25 });
    runTicks(fw.h, 4 * 60 * 5);
    expect(s.people[baby]!.needs.hunger).toBeGreaterThan(40);
    expect(s.feed.some((f) => /emergency sitter/.test(f.text))).toBe(false);
    const ledger = Object.values(s.households).flatMap((h) => h.ledger).filter((l) => l.kind === 'family');
    expect(ledger).toHaveLength(0);
  });
});

describe('toddlers', () => {
  it('play with toys, nap and eat on their own, but cannot cook or work', () => {
    const fw = familyWorld({ startMinute: SATURDAY_NOON, autonomy: true });
    const s = fw.w.state;
    const tod = addMember(fw, s.activeHouseholdId, 'Tom', { lifeStage: 'toddler' }, { x: 8, z: 8 });
    const cook = fw.h.sim.queue(tod.id, { interactionId: 'cookMeal', target: { kind: 'object', objectId: fw.w.objects.fridge!.id, slotId: null } });
    expect(cook.ok).toBe(false);
    expect(cook.ok ? '' : cook.reason).toMatch(/too little/);
    const sleepy = fw.h.sim.options(tod.id, { kind: 'object', objectId: fw.w.objects.sofa!.id, slotId: null });
    expect(sleepy.map((o) => o.interactionId).sort()).toEqual(['nap', 'sit']);
  });

  it('can be taught to talk: the toddler skills rise from the teaching socials', () => {
    const fw = familyWorld({ startMinute: SATURDAY_NOON });
    const s = fw.w.state;
    const tod = addMember(fw, s.activeHouseholdId, 'Tom', { lifeStage: 'toddler' }, { x: 9, z: 8 });
    setNeeds(s, tod.id, 90);
    setNeeds(s, fw.w.mira, 90);
    const q = fw.h.sim.queue(fw.w.mira, { interactionId: 'teachTalking', target: { kind: 'person', personId: tod.id } });
    expect(q.ok).toBe(true);
    runUntil(fw.h, () => s.people[fw.w.mira]!.queue.length === 0, 4 * 60);
    const talking = s.people[tod.id]!.skills.talking;
    expect(talking?.xp ?? 0).toBeGreaterThan(0);
  });
});

describe('the emergency sitter', () => {
  it('comes when a need has been at zero for three hours: fixes it, charges the fee once, warns', () => {
    const { fw, s, hh, baby } = nursery();
    const funds = s.households[hh]!.funds;
    const b = s.people[baby]!;
    const ctx = pureCtx(fw.h); // Saturday noon: a quarter-hour boundary
    const now = ctx.now;
    b.needs.hunger = 0;
    updateCare(ctx);
    expect(b.careSince?.hunger).toBe(now);
    b.careSince = { hunger: now - 179 };
    updateCare(ctx);
    expect(s.households[hh]!.funds).toBe(funds); // not yet three hours
    b.careSince = { hunger: now - 180 };
    updateCare(ctx);
    expect(s.households[hh]!.funds).toBe(funds - SITTER_FEE);
    expect(b.needs.hunger).toBeGreaterThanOrEqual(70);
    expect(b.careSince).toBeUndefined();
    const entries = s.households[hh]!.ledger.filter((l) => l.kind === 'family');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.occurrence).toMatch(/^sitter:.+:\d+:0$/);
    expect(s.feed.some((f) => f.kind === 'warning' && /emergency sitter/.test(f.text))).toBe(true);
    expect(isProcessed(s, `sitter:${baby}:${Math.floor(now / MINUTES_PER_DAY)}:0`)).toBe(true);
  });

  it('numbers the visits of a day (n) and charges each occurrence once; it cannot charge a replayed occurrence twice', () => {
    const { fw, s, hh, baby } = nursery();
    const b = s.people[baby]!;
    const ctx = pureCtx(fw.h);
    const day = Math.floor(s.clock.minutes / MINUTES_PER_DAY);
    callSitter(ctx, b, 'hunger');
    callSitter(ctx, b, 'energy');
    const ledger = s.households[hh]!.ledger.filter((l) => l.kind === 'family');
    expect(ledger.map((l) => l.occurrence)).toEqual([`sitter:${baby}:${day}:0`, `sitter:${baby}:${day}:1`]);
    // replaying the first occurrence (a reloaded save) charges nothing more
    const funds = s.households[hh]!.funds;
    delete s.processed[`sitter:${baby}:${day}:0`];
    callSitter(ctx, b, 'hunger');
    expect(s.households[hh]!.funds).toBe(funds);
  });

  it('works through the simulation clock for a really neglected baby', () => {
    const { fw, s, hh, baby } = nursery();
    s.settings.autonomy = false;
    const b = s.people[baby]!;
    b.needs.hunger = 0;
    s.clock.minutes = atDayMinute(5, 12 * 60);
    runTicks(fw.h, 4 * 60 * 4);
    expect(s.households[hh]!.ledger.filter((l) => l.kind === 'family')).toHaveLength(1);
    expect(b.needs.hunger).toBeGreaterThan(20);
  });

  it('does not charge households outside the player\'s', () => {
    const fw = familyWorld({ startMinute: SATURDAY_NOON });
    const s = fw.w.state;
    const nh = s.people[fw.w.neighbour!]!.householdId;
    const baby = addMember(fw, nh, 'Bo', { lifeStage: 'baby' });
    baby.needs.hunger = 0;
    runTicks(fw.h, 4 * 60 * 5);
    expect(s.households[nh]!.ledger.filter((l) => l.kind === 'family')).toHaveLength(0);
  });
});

describe('the sitter for households you are not playing', () => {
  /** A neighbour family's baby, on the lot (a visit to their home), with the neighbour household not playable. */
  function visitedBaby() {
    const { fw, s } = nursery();
    const nb = fw.w.neighbour!;
    const hhN = s.people[nb]!.householdId;
    const baby = addMember(fw, hhN, 'Neo', { lifeStage: 'baby' }, { x: 9, z: 9 });
    s.people[baby.id]!.isNpc = true;
    return { fw, s, hhN, baby: baby.id };
  }

  it('steps in for a neglected baby on the lot, charging that household only what it has, with a quiet note', () => {
    const { fw, s, hhN, baby } = visitedBaby();
    const b = s.people[baby]!;
    const funds = s.households[hhN]!.funds;
    const ctx = pureCtx(fw.h);
    b.needs.hunger = 0;
    updateCare(ctx);
    expect(b.careSince?.hunger).toBe(ctx.now);
    b.careSince = { hunger: ctx.now - 180 };
    updateCare(ctx);
    expect(s.households[hhN]!.funds).toBe(funds - SITTER_FEE);
    expect(b.needs.hunger).toBeGreaterThanOrEqual(70);
    expect(s.households[hhN]!.ledger.filter((l) => l.kind === 'family')).toHaveLength(1);
    expect(s.feed.some((f) => f.kind === 'warning' && /emergency sitter/.test(f.text))).toBe(false);
    expect(s.feed.some((f) => f.kind === 'info' && /a sitter stepped in/.test(f.text))).toBe(true);
    // a household with nothing in the bank is never put into debt
    const funds0 = (s.households[hhN]!.funds = 0);
    s.households[hhN]!.ledger = [];
    b.needs.energy = 0;
    callSitter(ctx, b, 'energy');
    expect(s.households[hhN]!.funds).toBe(funds0);
  });

  it('drops the neglect timer of a little one who is off the lot (reconciliation), so it never fires later', () => {
    const { fw, s, hhN, baby } = visitedBaby();
    const b = s.people[baby]!;
    const ctx = pureCtx(fw.h);
    b.needs.hunger = 0;
    b.careSince = { hunger: ctx.now - 500 };
    b.location = { kind: 'offlot', place: 'home', since: ctx.now, until: null };
    const funds = s.households[hhN]!.funds;
    updateCare(ctx);
    expect(b.careSince).toBeUndefined();
    expect(s.households[hhN]!.funds).toBe(funds);
  });
});
