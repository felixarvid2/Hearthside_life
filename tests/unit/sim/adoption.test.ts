import { describe, expect, it } from 'vitest';
import { isProcessed } from '../../../src/core/state';
import { adopt, adoptionPreview, adoptionStartProblem } from '../../../src/sim/adoption';
import { childrenOf, familyKind, siblingsOf } from '../../../src/sim/family';
import { ADOPTION_FEES } from '../../../src/sim/tuning';
import { pureCtx } from './fixtures';
import { addMember, familyWorld, placeObject } from './familyFixtures';

const spec = (o: Partial<Parameters<typeof adoptionPreview>[2]> = {}) => ({ stage: 'child' as const, sex: 'girl' as const, firstName: 'Nora', ...o });

describe('adoption', () => {
  it('previews the fee, the parents and why not', () => {
    const fw = familyWorld({ funds: 500000 });
    const ctx = pureCtx(fw.h);
    const pv = adoptionPreview(ctx, fw.w.mira, spec());
    expect(pv).toMatchObject({ ok: true, fee: ADOPTION_FEES.child, members: 3, maxMembers: 8, parents: ['Mira'] });
    expect(adoptionPreview(ctx, fw.w.mira, spec({ firstName: '  ' })).reason).toMatch(/first name/);
    expect(adoptionPreview(ctx, fw.w.mira, spec({ stage: 'elder' as never })).reason).toMatch(/baby, toddler, child or teen/);
    const poor = familyWorld({ funds: 1000 });
    expect(adoptionPreview(pureCtx(poor.h), poor.w.mira, spec()).reason).toMatch(/Not enough household funds/);
    const kid = addMember(fw, fw.w.state.activeHouseholdId, 'Kit', { lifeStage: 'child' });
    expect(adoptionStartProblem(ctx, kid)).toMatch(/Only young adults and older/);
    expect(adoptionStartProblem(ctx, fw.w.state.people[fw.w.neighbour!]!)).toMatch(/decides for themself/);
  });

  it('is limited to households with fewer than 8 members', () => {
    const fw = familyWorld({ funds: 5000000 });
    const hh = fw.w.state.activeHouseholdId;
    for (let i = 0; i < 6; i++) addMember(fw, hh, `P${i}`);
    expect(fw.w.state.households[hh]!.memberIds).toHaveLength(8);
    const r = adoptionPreview(pureCtx(fw.h), fw.w.mira, spec());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/household is full/);
    expect(adopt(pureCtx(fw.h), fw.w.mira, spec()).ok).toBe(false);
    expect(fw.w.state.households[hh]!.memberIds).toHaveLength(8);
  });

  it('creates the child with parentIds, family ties, a once-only fee and looks from the parents', () => {
    const fw = familyWorld({ funds: 500000 });
    const s = fw.w.state;
    const hh = s.activeHouseholdId;
    const mira = s.people[fw.w.mira]!, theo = s.people[fw.w.theo]!;
    mira.appearance.hair.color = '#aa5500'; theo.appearance.hair.color = '#112233';
    mira.appearance.face.eyeColor = '#00aa00'; theo.appearance.face.eyeColor = '#0000aa';
    // Mira and Theo are partners: both become parents
    s.bonds[[fw.w.mira, fw.w.theo].sort().join('|')]!.status = 'partner';
    const funds = s.households[hh]!.funds;
    const r = adopt(pureCtx(fw.h), fw.w.mira, spec({ stage: 'teen', sex: 'boy', firstName: 'Ben' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kid = s.people[r.personId]!;
    expect(kid).toMatchObject({ firstName: 'Ben', lastName: 'Test', lifeStage: 'teen', householdId: hh, isNpc: false, stageDays: 0 });
    expect(kid.pronouns.subject).toBe('he');
    expect(kid.parentIds).toEqual([fw.w.mira, fw.w.theo]);
    expect(kid.school?.schoolId).toBe('high');
    expect(['#aa5500', '#112233']).toContain(kid.appearance.hair.color);
    expect(['#00aa00', '#0000aa']).toContain(kid.appearance.face.eyeColor);
    expect(s.households[hh]!.memberIds).toContain(kid.id);
    expect(familyKind(s, kid.id, fw.w.mira)).toBe('parent');
    expect(familyKind(s, fw.w.mira, kid.id)).toBe('child');
    expect(childrenOf(s, fw.w.theo).map((c) => c.id)).toEqual([kid.id]);
    expect(s.households[hh]!.funds).toBe(funds - ADOPTION_FEES.teen);
    const entry = s.households[hh]!.ledger.filter((l) => l.kind === 'family');
    expect(entry).toHaveLength(1);
    expect(entry[0]!.occurrence).toBe(`adopt:${hh}:0`);
    expect(isProcessed(s, `adopt:${hh}:0`)).toBe(true);
    expect(kid.memories.some((m) => m.kind === 'adopted')).toBe(true);
    expect(mira.memories.some((m) => m.kind === 'adopted')).toBe(true);
    expect(s.feed.some((f) => f.kind === 'family' && /Ben Test joined the family/.test(f.text))).toBe(true);
    expect(fw.h.log.some((e) => e.type === 'family' && e.what === 'adopted')).toBe(true);
    // a second child gets the next occurrence and becomes the first child's sibling
    const r2 = adopt(pureCtx(fw.h), fw.w.mira, spec({ stage: 'baby', firstName: 'Bea' }));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(s.households[hh]!.ledger.filter((l) => l.kind === 'family').map((l) => l.occurrence)).toEqual([`adopt:${hh}:0`, `adopt:${hh}:1`]);
    expect(siblingsOf(s, kid.id).map((x) => x.id)).toEqual([r2.personId]);
    expect(familyKind(s, kid.id, r2.personId)).toBe('sibling');
  });

  it('puts a baby in the crib and a child at the lot entry', () => {
    const fw = familyWorld({ funds: 500000 });
    const crib = placeObject(fw, 'crib-wood', 6, 0);
    const ctx = pureCtx(fw.h);
    const baby = adopt(ctx, fw.w.mira, spec({ stage: 'baby', firstName: 'Bea' }));
    const child = adopt(pureCtx(fw.h), fw.w.mira, spec({ firstName: 'Cleo' }));
    expect(baby.ok && child.ok).toBe(true);
    if (!baby.ok || !child.ok) return;
    const slot = fw.h.nav.slotsOf(fw.w.lot.id, crib.id).find((x) => x.kind === 'sleep')!;
    expect(fw.w.state.people[baby.personId]!.location).toMatchObject({ kind: 'lot', posture: 'lying', x: slot.x, z: slot.z });
    expect(fw.w.state.people[child.personId]!.location).toMatchObject({ kind: 'lot', posture: 'standing' });
  });

  it('works through the game API and cannot be run twice with the same money', () => {
    const fw = familyWorld({ funds: ADOPTION_FEES.child });
    const ctx = pureCtx(fw.h);
    expect(adopt(ctx, fw.w.mira, spec()).ok).toBe(true);
    const again = adopt(pureCtx(fw.h), fw.w.mira, spec({ firstName: 'Nina' }));
    expect(again.ok).toBe(false);
    expect(Object.values(fw.w.state.people).filter((p) => p.firstName === 'Nina')).toHaveLength(0);
  });
});
