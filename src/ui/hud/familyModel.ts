// Pure helpers behind the Family tab (Milestone 8): the family tree of a person as a HouseholdDraft-shaped model for
// ui/creator/familyTree.ts, and short texts for stages and birthdays. No DOM; unit-tested in tests/unit/ui/family.test.ts.

import { personToDraft } from '../../characters/names';
import type { HouseholdDraft } from '../../core/drafts';
import { STAGE_LABELS } from '../../core/lifeStages';
import type { FamilyTie, Id, LifeStage, WorldState } from '../../core/types';
import { parentIdsOf, partnerOf } from '../../sim/family';

export interface TreeModel {
  draft: HouseholdDraft;
  /** Index of the person in `draft.members`, or -1. */
  current: number;
  ids: Id[];
}

/**
 * The family tree of `ids` (the person first): members are the people, ties are `parent` (b is a's parent) for every parent
 * link between them, `sibling` for siblings without a shared parent in the picture, and `partner` / `spouse` from the bonds.
 */
export function treeModel(state: WorldState, ids: Id[], currentId: Id): TreeModel {
  const people = ids.map((id) => state.people[id]).filter((p): p is NonNullable<typeof p> => !!p);
  const index = new Map(people.map((p, i) => [p.id, i]));
  const ties: HouseholdDraft['ties'] = [];
  const parentSets = people.map((p) => new Set(parentIdsOf(state, p.id)));
  for (let i = 0; i < people.length; i++) {
    for (const pid of parentSets[i]!) {
      const j = index.get(pid);
      if (j !== undefined) ties.push({ a: i, b: j, tie: 'parent' });
    }
  }
  for (let i = 0; i < people.length; i++) {
    const pk = partnerOf(state, people[i]!.id);
    const j = pk ? index.get(pk.person.id) : undefined;
    if (pk && j !== undefined && j > i) ties.push({ a: i, b: j, tie: (pk.kind === 'spouse' ? 'spouse' : 'partner') as FamilyTie });
  }
  for (const b of Object.values(state.bonds)) {
    if (b.familyAtoB !== 'sibling') continue;
    const i = index.get(b.a), j = index.get(b.b);
    if (i === undefined || j === undefined) continue;
    const shared = [...parentSets[i]!].some((x) => parentSets[j]!.has(x));
    if (!shared) ties.push({ a: i, b: j, tie: 'sibling' });
  }
  const draft: HouseholdDraft = { name: 'Family', members: people.map((p) => personToDraft(p)), ties };
  return { draft, current: index.get(currentId) ?? -1, ids: people.map((p) => p.id) };
}

/** "Child" / "Teen" ...: the stage name. */
export function stageName(stage: LifeStage): string { return STAGE_LABELS[stage]; }

/** "Birthday in 6 days" / "Birthday tomorrow" / "Birthday today"; empty when aging is off. */
export function birthdayText(daysLeft: number | null): string {
  if (daysLeft === null) return '';
  if (daysLeft <= 0) return 'Birthday today';
  if (daysLeft === 1) return 'Birthday tomorrow';
  return `Birthday in ${daysLeft} days`;
}
