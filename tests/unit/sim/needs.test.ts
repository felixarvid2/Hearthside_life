import { describe, expect, it } from 'vitest';
import { pairKey, relKey } from '../../../src/core/ids';
import { computeMood } from '../../../src/sim/mood';
import { NEED_DECAY_PER_HOUR } from '../../../src/sim/tuning';
import { buildWorld, harness, runTicks, setNeeds } from './fixtures';

describe('people', () => {
  it('createPerson draws initial needs 70-90, joins the career at level 1 and starts the aspiration', () => {
    const w = buildWorld({ career: true });
    const mira = w.state.people[w.mira]!;
    for (const v of Object.values(mira.needs)) { expect(v).toBeGreaterThanOrEqual(70); expect(v).toBeLessThanOrEqual(90); }
    expect(mira.career).toMatchObject({ careerId: 'culinary', level: 1, performance: 0, shift: null });
    expect(mira.aspiration).toMatchObject({ aspirationId: 'homeChef', stage: 0 });
    expect(mira.skills).toEqual({});
    expect(mira.anim.id).toBe('idle');
    expect(w.state.households[mira.householdId]!.memberIds).toContain(mira.id);
    expect(w.state.people[w.neighbour!]!.isNpc).toBe(true);
  });

  it('applyHouseholdTies creates a bond and friendly relationships both ways', () => {
    const w = buildWorld();
    const bond = w.state.bonds[pairKey(w.mira, w.theo)]!;
    expect(bond.familyAtoB).toBe('roommate');
    expect(bond.status).toBe('friend');
    const ab = w.state.relationships[relKey(w.mira, w.theo)]!;
    const ba = w.state.relationships[relKey(w.theo, w.mira)]!;
    expect(ab.familiarity).toBeGreaterThan(0);
    expect(ab.friendship).toBeGreaterThan(0);
    expect(ba.friendship).toBe(ab.friendship);
  });
});

describe('needs', () => {
  it('decay at the documented base rates per game hour', () => {
    const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
    setNeeds(w.state, w.mira, 80);
    const h = harness(w.state);
    runTicks(h, 4 * 60); // one game hour
    const n = h.holder.state.people[w.mira]!.needs;
    for (const [need, rate] of Object.entries(NEED_DECAY_PER_HOUR)) {
      expect(n[need as keyof typeof n]).toBeCloseTo(80 - rate, 6);
    }
  });

  it('applies trait multipliers, no energy decay while lying and reduced decay off-lot', () => {
    const w = buildWorld({ autonomy: false, visitors: false, neighbour: false, miraTraits: ['lazy', 'loner'] });
    setNeeds(w.state, w.mira, 80);
    setNeeds(w.state, w.theo, 80);
    const theo = w.state.people[w.theo]!;
    theo.location = { kind: 'offlot', place: 'work', since: w.state.clock.minutes, until: null };
    const h = harness(w.state);
    runTicks(h, 4 * 60);
    const m = h.holder.state.people[w.mira]!.needs;
    expect(m.energy).toBeCloseTo(80 - 5 * 1.25, 6);
    expect(m.social).toBeCloseTo(80 - NEED_DECAY_PER_HOUR.social * 0.5, 6);
    expect(h.holder.state.people[w.theo]!.needs.hunger).toBeCloseTo(80 - 6.5 * 0.5, 6);

    const mira = h.holder.state.people[w.mira]!;
    if (mira.location.kind === 'lot') mira.location.posture = 'lying';
    const before = mira.needs.energy;
    // Needs decay before actions run in a tick, so this tick sees the lying posture.
    runTicks(h, 1);
    expect(mira.needs.energy).toBeCloseTo(before, 6);
  });

  it('emits need.low once when crossing the threshold and sets a thought', () => {
    const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
    w.state.people[w.mira]!.needs.bladder = 25.5;
    const h = harness(w.state);
    runTicks(h, 4 * 30);
    const lows = h.log.filter((e) => e.type === 'need.low' && e.personId === w.mira && e.need === 'bladder');
    expect(lows).toHaveLength(1);
    expect(h.holder.state.people[w.mira]!.thought?.text).toBe('Needs the toilet');
  });

  it('mood combines needs and moodlets with readable reasons', () => {
    const w = buildWorld({ neighbour: false });
    const h = harness(w.state);
    setNeeds(w.state, w.mira, 90);
    const happy = computeMood(h.content, w.state.people[w.mira]!);
    expect(happy.value).toBeGreaterThan(10);
    expect(happy.reasons.some((r) => r.startsWith('Well fed'))).toBe(true);
    w.state.people[w.mira]!.needs.hunger = 5;
    w.state.people[w.mira]!.moodlets.push({ id: 'greatChat', value: 6, until: w.state.clock.minutes + 60 });
    const m = h.sim.mood(w.mira);
    expect(m.reasons[0]).toMatch(/^Starving/);
    expect(m.reasons.some((r) => r.startsWith('Great Chat (+6)'))).toBe(true);
    expect(m.value).toBeLessThan(happy.value);
    runTicks(h, 4 * 61);
    expect(h.holder.state.people[w.mira]!.moodlets.find((x) => x.id === 'greatChat')).toBeUndefined();
  });
});
