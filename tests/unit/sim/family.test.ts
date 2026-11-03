import { describe, expect, it } from 'vitest';
import { pairKey } from '../../../src/core/ids';
import {
  auntsUnclesOf, childrenOf, cousinsOf, familyKind, familyText, grandchildrenOf, grandparentsOf, linkParent, nephewsNiecesOf, parentsOf,
  relativesOf, setFamilyTie, siblingsOf, treeMembersOf,
} from '../../../src/sim/family';
import { applyHouseholdTies } from '../../../src/sim/people';
import { familyTie } from '../../../src/sim/relationships';
import { treeModel } from '../../../src/ui/hud/familyModel';
import { familyGenerations } from '../../../src/characters/creator';
import { addMember, familyWorld } from './familyFixtures';

/** Three generations: Gran (g) -> Dad (d) and Aunt (a); Dad + Mom (m) -> Kid (k) and Sis (s); Aunt -> Cousin (c). */
function clan() {
  const fw = familyWorld();
  const s = fw.w.state;
  const hh = s.activeHouseholdId;
  const add = (n: string, stage = 'adult' as const) => addMember(fw, hh, n, { lifeStage: stage }).id;
  const g = add('Gran', 'elder' as never), d = add('Dad'), a = add('Aunt'), m = add('Mom'), k = add('Kid', 'child' as never), sis = add('Sis', 'teen' as never), c = add('Cousin', 'child' as never);
  const ids = [g, d, a, m, k, sis, c];
  // ties: b is a's <tie>
  applyHouseholdTies(s, ids, [
    { a: 1, b: 0, tie: 'parent' }, { a: 2, b: 0, tie: 'parent' },
    { a: 4, b: 1, tie: 'parent' }, { a: 4, b: 3, tie: 'parent' }, { a: 5, b: 1, tie: 'parent' }, { a: 5, b: 3, tie: 'parent' },
    { a: 6, b: 2, tie: 'parent' }, { a: 1, b: 3, tie: 'partner' },
  ]);
  return { fw, s, g, d, a, m, k, sis, c };
}

describe('the family graph', () => {
  it('household ties set parentIds and keep Bond.familyAtoB in step', () => {
    const { s, g, d, k, m } = clan();
    expect(s.people[k]!.parentIds).toEqual([d, m]);
    expect(s.people[d]!.parentIds).toEqual([g]);
    expect(familyTie(s, k, d)).toBe('parent');
    expect(familyTie(s, d, k)).toBe('child');
    const bond = s.bonds[pairKey(k, d)]!;
    expect(bond.familyAtoB).toBe(bond.a === k ? 'parent' : 'child');
    expect(familyTie(s, d, m)).toBe('partner');
  });

  it('derives siblings, grandparents, aunts and uncles, nieces and nephews and cousins', () => {
    const { s, g, d, a, m, k, sis, c } = clan();
    const ids = (list: Array<{ id: string }>) => list.map((p) => p.id).sort();
    expect(ids(parentsOf(s, k))).toEqual([d, m].sort());
    expect(ids(childrenOf(s, d))).toEqual([k, sis].sort());
    expect(ids(siblingsOf(s, k))).toEqual([sis]);
    expect(ids(siblingsOf(s, d))).toEqual([a]);
    expect(ids(grandparentsOf(s, k))).toEqual([g]);
    expect(ids(grandchildrenOf(s, g))).toEqual([c, k, sis].sort());
    expect(ids(auntsUnclesOf(s, k))).toEqual([a]);
    expect(ids(nephewsNiecesOf(s, a))).toEqual([k, sis].sort());
    expect(ids(cousinsOf(s, k))).toEqual([c]);
    expect(familyKind(s, k, g)).toBe('grandparent');
    expect(familyKind(s, k, a)).toBe('auntUncle');
    expect(familyKind(s, a, k)).toBe('nieceNephew');
    expect(familyKind(s, k, c)).toBe('cousin');
    expect(familyKind(s, d, m)).toBe('partner');
    expect(familyKind(s, k, k)).toBeNull();
    expect(familyText(s, k, g)).toBe('Grandparent');
    expect(familyText(s, k, s.people[Object.keys(s.people).find((x) => s.people[x]!.firstName === 'Ada')!]!.id)).toBe('');
    expect(relativesOf(s, k).map((r) => r.kind)).toEqual(['parent', 'parent', 'sibling', 'grandparent', 'auntUncle', 'cousin']);
  });

  it('siblings from a sibling tie without parents count too', () => {
    const fw = familyWorld();
    const s = fw.w.state;
    const x = addMember(fw, s.activeHouseholdId, 'Xan').id, y = addMember(fw, s.activeHouseholdId, 'Yve').id;
    applyHouseholdTies(s, [x, y], [{ a: 0, b: 1, tie: 'sibling' }]);
    expect(siblingsOf(s, x).map((p) => p.id)).toEqual([y]);
    expect(familyKind(s, x, y)).toBe('sibling');
  });

  it('linkParent allows at most two parents, no cycles, and creates the bond', () => {
    const { fw, s, d, k, g } = clan();
    const extra = addMember(fw, s.activeHouseholdId, 'Third').id;
    expect(linkParent(s, k, extra)).toBe(false); // already two parents
    expect(linkParent(s, g, k)).toBe(false); // would be a cycle
    expect(linkParent(s, k, k)).toBe(false);
    const solo = addMember(fw, s.activeHouseholdId, 'Solo', { lifeStage: 'child' }).id;
    expect(linkParent(s, solo, extra)).toBe(true);
    expect(s.people[solo]!.parentIds).toEqual([extra]);
    expect(familyTie(s, solo, extra)).toBe('parent');
    expect(linkParent(s, solo, extra)).toBe(true);
    expect(s.people[solo]!.parentIds).toEqual([extra]);
    expect(d).toBeDefined();
  });

  it('setFamilyTie never replaces a family tie by "none"', () => {
    const { s, k, d } = clan();
    setFamilyTie(s, k, d, 'none');
    expect(familyTie(s, k, d)).toBe('parent');
  });

  it('draws as a tree with three generations', () => {
    const { s, k, g } = clan();
    const ids = treeMembersOf(s, k);
    expect(ids[0]).toBe(k);
    expect(ids).toContain(g);
    const model = treeModel(s, ids, k);
    expect(model.current).toBe(0);
    const gens = familyGenerations(model.draft);
    expect(Math.max(...gens)).toBe(2);
    const nameOf = (i: number) => model.draft.members[i]!.firstName;
    expect(gens[model.ids.indexOf(g)]).toBe(0); // the grandparent is the top row
    expect(gens[0]).toBe(2); // the child is the bottom row
    expect(model.draft.ties.length).toBeGreaterThan(5);
    expect(nameOf(0)).toBe('Kid');
  });
});
