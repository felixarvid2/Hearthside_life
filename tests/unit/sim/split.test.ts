import { describe, expect, it } from 'vitest';
import { isProcessed } from '../../../src/core/state';
import { moveInGroup, moveInNpc, moveInProblem, splitHousehold, splitPreview, splitProblem } from '../../../src/sim/split';
import { socialRequirementReason } from '../../../src/sim/social';
import { MAX_HOUSEHOLD_SIZE } from '../../../src/sim/tuning';
import { pureCtx } from './fixtures';
import { addMember, addVacantLot, familyWorld } from './familyFixtures';
import { setBoth } from './socialFixtures';

function crowd() {
  const fw = familyWorld({ funds: 300000 });
  const s = fw.w.state;
  const hh = s.activeHouseholdId;
  const kid = addMember(fw, hh, 'Kit', { lifeStage: 'child' }, { x: 8, z: 9 });
  const lot = addVacantLot(s, 20000);
  return { fw, s, hh, kid, lot };
}

describe('splitting a household', () => {
  it('previews who goes, the proportional share and the cost of the new home', () => {
    const { fw, kid, lot } = crowd();
    const pv = splitPreview(pureCtx(fw.h), [fw.w.theo, kid.id], { kind: 'lot', lotId: lot.id });
    expect(pv).toMatchObject({ ok: true, mode: 'rent', cost: 20000, share: 200000, movers: ['Theo', 'Kit'], staying: ['Mira'] });
    expect(pv.lines.join(' ')).toMatch(/2 of 3 people/);
  });

  it('refuses unsafe splits with clear reasons', () => {
    const { fw, s, hh, kid, lot } = crowd();
    const ctx = pureCtx(fw.h);
    const t = { kind: 'lot', lotId: lot.id } as const;
    expect(splitProblem(ctx, [], t)).toMatch(/Choose who/);
    expect(splitProblem(ctx, [fw.w.mira, fw.w.theo, kid.id], t)).toMatch(/Somebody has to stay/);
    expect(splitProblem(ctx, [fw.w.mira, fw.w.theo], t)).toMatch(/young adult or older must stay/);
    expect(splitProblem(ctx, [kid.id], t)).toMatch(/young adult or older has to go with the children/);
    expect(splitProblem(ctx, [fw.w.theo], { kind: 'lot', lotId: s.households[hh]!.homeLotId! })).toMatch(/already live/);
    expect(splitProblem(ctx, [fw.w.neighbour!], t)).toMatch(/Only members of your household/);
    expect(splitProblem(ctx, [fw.w.theo], { kind: 'lot', lotId: 'nope' })).toMatch(/no such home/);
    delete lot.rent;
    expect(splitProblem(ctx, [fw.w.theo], t)).toMatch(/not available/);
    lot.rent = 20000;
    s.people[fw.w.theo]!.location = { kind: 'offlot', place: 'work', since: 0, until: null };
    expect(splitProblem(ctx, [fw.w.theo], t)).toMatch(/away right now/);
  });

  it('moves a member out to a vacant home: funds shared by headcount, once-only occurrences, new NPC household', () => {
    const { fw, s, hh, lot } = crowd();
    const ctx = pureCtx(fw.h);
    const theo = s.people[fw.w.theo]!;
    const before = s.households[hh]!.funds; // 300000 for 3 members
    const pv = splitPreview(ctx, [theo.id], { kind: 'lot', lotId: lot.id });
    expect(pv).toMatchObject({ ok: true, mode: 'rent', share: 100000, cost: 20000 });
    const r = splitHousehold(ctx, [theo.id], { kind: 'lot', lotId: lot.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nh = s.households[r.householdId]!;
    expect(nh).toMatchObject({ isPlayable: false, homeLotId: lot.id, memberIds: [theo.id] });
    expect(nh.name).toBe('Test');
    expect(nh.funds).toBe(100000 - 20000);
    expect(s.households[hh]!.funds).toBe(before - 100000);
    expect(s.households[hh]!.memberIds).not.toContain(theo.id);
    expect(theo).toMatchObject({ householdId: nh.id, isNpc: true });
    expect(theo.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: lot.id });
    const occ = [...s.households[hh]!.ledger, ...nh.ledger].map((l) => l.occurrence).sort();
    expect(occ).toEqual([`split:${hh}:0:cost`, `split:${hh}:0:in`, `split:${hh}:0:out`]);
    expect(isProcessed(s, `split:${hh}:0`)).toBe(true);
    expect(s.neighbourhood?.npcHouseholdIds ?? [nh.id]).toContain(nh.id);
    expect(s.feed.some((f) => f.kind === 'family' && /moved out/.test(f.text))).toBe(true);
    expect(s.people[fw.w.mira]!.memories.some((m) => m.kind === 'movedOut')).toBe(true);
    // the same people cannot be moved again, and the home is taken
    const again = splitHousehold(pureCtx(fw.h), [theo.id], { kind: 'lot', lotId: lot.id });
    expect(again.ok).toBe(false);
    // relationships and the bond with the ones left behind stay
    expect(Object.keys(s.relationships).some((k) => k.includes(theo.id))).toBe(true);
    // the new household is looked after by the light schedule: it can be played
    expect(fw.h.sim.switchPreview(nh.id).ok).toBe(true);
  });

  it('does not move out to a home the share cannot pay for', () => {
    const { fw, s, lot } = crowd();
    s.households[s.activeHouseholdId]!.funds = 20000;
    const pv = splitPreview(pureCtx(fw.h), [fw.w.theo], { kind: 'lot', lotId: lot.id });
    expect(pv.ok).toBe(false);
    expect(pv.reason).toMatch(/does not cover/);
    expect(splitHousehold(pureCtx(fw.h), [fw.w.theo], { kind: 'lot', lotId: lot.id }).ok).toBe(false);
    expect(s.households[s.activeHouseholdId]!.funds).toBe(20000);
  });

  it('buys a home for sale with the share', () => {
    const { fw, s, lot } = crowd();
    delete lot.rent;
    lot.price = 60000;
    const r = splitHousehold(pureCtx(fw.h), [fw.w.theo], { kind: 'lot', lotId: lot.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(lot.ownerHouseholdId).toBe(r.householdId);
    expect(lot.price).toBeUndefined();
    expect(s.households[r.householdId]!.funds).toBe(40000);
  });

  it('moves in with an existing household and brings a share of the money, up to 8 people', () => {
    const { fw, s, hh, kid } = crowd();
    const nh = s.people[fw.w.neighbour!]!.householdId;
    const theo = s.people[fw.w.theo]!;
    const okay = splitHousehold(pureCtx(fw.h), [theo.id], { kind: 'household', householdId: nh });
    expect(okay.ok).toBe(true);
    expect(s.households[nh]!.memberIds).toContain(theo.id);
    expect(s.households[nh]!.funds).toBe(300000 + 100000);
    expect(theo).toMatchObject({ householdId: nh, isNpc: true });
    // a full household cannot take more
    for (let i = 0; i < 6; i++) addMember(fw, nh, `Extra${i}`);
    expect(s.households[nh]!.memberIds).toHaveLength(8);
    expect(splitProblem(pureCtx(fw.h), [kid.id], { kind: 'household', householdId: nh })).toMatch(/more than 8/);
    expect(hh).not.toBe(nh);
  });
});

describe('ask to move in', () => {
  it('brings a neighbour (and the children in their care) into the household with their share of the funds', () => {
    const fw = familyWorld({ funds: 300000 });
    const s = fw.w.state;
    const hh = s.activeHouseholdId;
    const ada = s.people[fw.w.neighbour!]!;
    const nh = ada.householdId;
    const baby = addMember(fw, nh, 'Bo', { lifeStage: 'baby', }, undefined);
    baby.parentIds = [ada.id];
    const ctx = pureCtx(fw.h);
    expect(moveInGroup(s, ada).map((p) => p.firstName)).toEqual(['Ada', 'Bo']);
    expect(moveInProblem(ctx, s.people[fw.w.mira]!, ada)).toBeNull();
    expect(moveInProblem(ctx, s.people[fw.w.mira]!, baby)).toMatch(/too young/);
    expect(moveInProblem(ctx, s.people[fw.w.mira]!, s.people[fw.w.theo]!)).toMatch(/already lives/);
    const moved = moveInNpc(ctx, s.people[fw.w.mira]!, ada);
    expect(moved.map((p) => p.firstName)).toEqual(['Ada', 'Bo']);
    expect(s.households[hh]!.memberIds).toEqual(expect.arrayContaining([ada.id, baby.id]));
    expect(ada).toMatchObject({ householdId: hh, isNpc: false });
    expect(s.households[hh]!.funds).toBe(300000 + 300000);
    expect(s.households[nh]).toBeUndefined(); // nobody left: the old household is gone
    expect(s.neighbourhood?.npcHouseholdIds ?? []).not.toContain(nh);
    // once only: the same day's move-in cannot repeat
    expect(moveInNpc(pureCtx(fw.h), s.people[fw.w.mira]!, ada)).toEqual([]);
  });

  it('is refused when the household would hold more than 8 people', () => {
    const fw = familyWorld({ funds: 300000 });
    const s = fw.w.state;
    for (let i = 0; i < 6; i++) addMember(fw, s.activeHouseholdId, `P${i}`);
    const ada = s.people[fw.w.neighbour!]!;
    expect(moveInProblem(pureCtx(fw.h), s.people[fw.w.mira]!, ada)).toMatch(/more than 8 people/);
    expect(MAX_HOUSEHOLD_SIZE).toBe(8);
  });

  it('is a social with friendship, trust and room required; accepting moves them in', () => {
    const fw = familyWorld({ funds: 300000, startMinute: 5 * 1440 + 12 * 60 });
    const s = fw.w.state;
    const ada = s.people[fw.w.neighbour!]!;
    const mira = s.people[fw.w.mira]!;
    const def = fw.content.socials.askToMoveIn!;
    expect(socialRequirementReason(pureCtx(fw.h), mira, ada, def)).toMatch(/introduction|know/i);
    setBoth(s, mira.id, ada.id, { familiarity: 80, friendship: 70, trust: 50 });
    // she has to be on the lot for a conversation
    ada.location = { kind: 'lot', lotId: fw.w.lot.id, level: 0, x: 9.5, z: 9.5, facing: 0, posture: 'standing' };
    expect(socialRequirementReason(pureCtx(fw.h), mira, ada, def)).toBeNull();
    for (const id of Object.keys(fw.content.socials)) fw.content.socials[id]!.acceptance = fw.content.socials[id]!.acceptance;
    def.acceptance = 1;
    const q = fw.h.sim.queue(mira.id, { interactionId: 'askToMoveIn', target: { kind: 'person', personId: ada.id } });
    expect(q.ok).toBe(true);
    for (let i = 0; i < 4 * 30; i++) fw.h.sim.tick();
    expect(s.people[ada.id]!.householdId).toBe(s.activeHouseholdId);
  });
});
