// Creating people from creator drafts and wiring household ties.

import type { ContentDB } from '../content/types';
import type { HouseholdDraft, PersonDraft } from '../core/drafts';
import { newId, pairKey } from '../core/ids';
import { Rng } from '../core/rng';
import type {
  FamilyTie, Id, Needs, Person, PersonLocation, WorldState,
} from '../core/types';
import { NEED_IDS } from '../core/types';
import { TIE_START, linkParent } from './family';
import { ensureSchool } from './school';
import { addMemory, ensureRel, invertTie, refreshLabel } from './relationships';

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Creates a Person from a creator draft, adds it to `state.people` and to the household's members.
 * Initial needs are drawn from the world rng (70-90). Skills start empty and are recorded when first
 * practiced. A draft career is joined at level 1; a draft aspiration starts at stage 0.
 */
export function createPerson(
  state: WorldState, content: ContentDB, draft: PersonDraft, householdId: Id, location: PersonLocation,
): Person {
  const hh = state.households[householdId];
  if (!hh) throw new Error(`createPerson: unknown household ${householdId}`);
  const rng = new Rng(state.rng);
  const needs = {} as Needs;
  for (const n of NEED_IDS) needs[n] = Math.round(rng.range(70, 90));
  const now = state.clock.minutes;
  const careerOk = draft.careerId !== null && content.careers[draft.careerId] !== undefined;
  const aspirationOk = draft.aspirationId !== null && content.aspirations[draft.aspirationId] !== undefined;
  const person: Person = {
    id: newId(state, 'per'),
    householdId,
    firstName: draft.firstName,
    lastName: draft.lastName,
    pronouns: { ...draft.pronouns },
    lifeStage: draft.lifeStage,
    bio: draft.bio,
    voice: { ...draft.voice },
    walkStyle: draft.walkStyle,
    romance: copy(draft.romance),
    appearance: copy(draft.appearance),
    outfits: copy(draft.outfits),
    traits: [...draft.traits],
    likes: [...draft.likes],
    dislikes: [...draft.dislikes],
    aspiration: aspirationOk && draft.aspirationId
      ? { aspirationId: draft.aspirationId, stage: 0, progress: {}, completedStages: 0, rewards: [] }
      : null,
    needs,
    moodlets: [],
    skills: {},
    career: careerOk && draft.careerId
      ? { careerId: draft.careerId, level: 1, performance: 0, joinedAt: now, daysWorked: 0, shift: null }
      : null,
    location: copy(location),
    queue: [],
    memories: [],
    cooldowns: {},
    anim: { id: 'idle', since: now, loop: true },
    thought: null,
    createdAt: now,
    isNpc: !hh.isPlayable,
  };
  state.people[person.id] = person;
  hh.memberIds.push(person.id);
  ensureSchool(content, person);
  return person;
}

const TIE_TEXT: Record<FamilyTie, string> = {
  spouse: 'Married to {b}', partner: 'Moved in with my partner {b}', parent: '{b} is my parent', child: '{b} is my child', sibling: '{b} is my sibling',
  roommate: 'Moved in with {b} as roommates', none: 'Moved in with {b}',
};

/**
 * Creates bonds and initial relationships between household members. `ties` index into `memberIds`;
 * `tie` is what member b is to member a. Members without an explicit tie still know each other
 * (familiar, friendly acquaintances).
 */
export function applyHouseholdTies(state: WorldState, memberIds: Id[], ties: HouseholdDraft['ties']): void {
  const now = state.clock.minutes;
  const explicit = new Map<string, { from: Id; tie: FamilyTie }>();
  for (const t of ties) {
    const a = memberIds[t.a], b = memberIds[t.b];
    if (!a || !b || a === b) continue;
    explicit.set(pairKey(a, b), { from: a, tie: t.tie });
  }
  // Parent ties are also the family graph (Milestone 8): the child's parentIds.
  for (const t of ties) {
    const a = memberIds[t.a], b = memberIds[t.b];
    if (!a || !b || a === b) continue;
    if (t.tie === 'parent') linkParent(state, a, b);
    else if (t.tie === 'child') linkParent(state, b, a);
  }
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i], b = memberIds[j];
      if (!a || !b) continue;
      const key = pairKey(a, b);
      const ex = explicit.get(key);
      // tie of b from a's point of view
      const tieAB: FamilyTie = ex ? (ex.from === a ? ex.tie : invertTie(ex.tie)) : 'none';
      const start = TIE_START[tieAB];
      const [lo, hi] = a < b ? [a, b] : [b, a];
      state.bonds[key] = { a: lo, b: hi, status: start.status, familyAtoB: lo === a ? tieAB : invertTie(tieAB), since: now };
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const rel = ensureRel(state, from, to);
        rel.familiarity = Math.max(rel.familiarity, start.familiarity);
        rel.friendship = Math.max(rel.friendship, start.friendship);
        rel.trust = Math.max(rel.trust, start.trust);
        rel.romance = Math.max(rel.romance, start.romance);
        rel.lastInteractionAt = now;
        refreshLabel(state, from, to);
      }
      const pa = state.people[a], pb = state.people[b];
      if (pa && pb) {
        addMemory(state, pa, { kind: 'movedIn', importance: 3, withId: b, text: TIE_TEXT[tieAB].replace('{b}', pb.firstName) });
        addMemory(state, pb, { kind: 'movedIn', importance: 3, withId: a, text: TIE_TEXT[invertTie(tieAB)].replace('{b}', pa.firstName) });
      }
    }
  }
}
