// The family graph (Milestone 8). `Person.parentIds` is the only stored fact; children, siblings, grandparents, aunts and
// uncles, nieces and nephews and cousins are derived from it, with the shared bond (`Bond.familyAtoB`) naming the
// household ties the creator sets (parent, child, sibling, partner, spouse, roommate). `linkParent` keeps the two in step:
// every parent link has a bond whose tie says parent / child.
//
// Reads are pure (they take a WorldState); the only writers are `linkParent` and `setFamilyTie`.

import { pairKey } from '../core/ids';
import type { BondStatus, FamilyTie, Id, Person, WorldState } from '../core/types';
import { addMemory, ensureRel, invertTie, refreshLabel } from './relationships';

/** Starting relationship values between household members by tie (b is a's <tie>). */
export const TIE_START: Record<FamilyTie, { familiarity: number; friendship: number; trust: number; romance: number; status: BondStatus }> = {
  spouse: { familiarity: 80, friendship: 55, trust: 50, romance: 55, status: 'spouse' },
  partner: { familiarity: 75, friendship: 50, trust: 45, romance: 50, status: 'partner' },
  parent: { familiarity: 85, friendship: 45, trust: 50, romance: 0, status: 'friend' },
  child: { familiarity: 85, friendship: 45, trust: 50, romance: 0, status: 'friend' },
  sibling: { familiarity: 80, friendship: 35, trust: 35, romance: 0, status: 'friend' },
  roommate: { familiarity: 50, friendship: 25, trust: 20, romance: 0, status: 'friend' },
  none: { familiarity: 40, friendship: 15, trust: 10, romance: 0, status: 'acquaintance' },
};

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

export type FamilyKind =
  | 'parent' | 'child' | 'sibling' | 'grandparent' | 'grandchild' | 'auntUncle' | 'nieceNephew' | 'cousin' | 'spouse' | 'partner' | 'engaged';

export const FAMILY_TEXT: Readonly<Record<FamilyKind, string>> = {
  parent: 'Parent', child: 'Child', sibling: 'Sibling', grandparent: 'Grandparent', grandchild: 'Grandchild',
  auntUncle: 'Aunt or uncle', nieceNephew: 'Niece or nephew', cousin: 'Cousin', spouse: 'Spouse', partner: 'Partner', engaged: 'Fiance(e)',
};

const people = (state: WorldState, ids: Iterable<Id>, except: ReadonlySet<Id> = new Set()): Person[] => {
  const out: Person[] = [];
  const seen = new Set<Id>();
  for (const id of ids) {
    const p = state.people[id];
    if (p && !except.has(id) && !seen.has(id)) { seen.add(id); out.push(p); }
  }
  return out;
};

export function parentIdsOf(state: WorldState, id: Id): Id[] {
  return (state.people[id]?.parentIds ?? []).filter((x) => x !== id && !!state.people[x]);
}

export function parentsOf(state: WorldState, id: Id): Person[] { return people(state, parentIdsOf(state, id)); }

export function childrenOf(state: WorldState, id: Id): Person[] {
  return Object.values(state.people).filter((p) => p.id !== id && (p.parentIds ?? []).includes(id));
}

/** Everybody who shares a parent with `id` (half siblings included) or has a sibling bond with them. */
export function siblingsOf(state: WorldState, id: Id): Person[] {
  const out = new Set<Id>();
  const mine = parentIdsOf(state, id);
  for (const p of Object.values(state.people)) {
    if (p.id === id) continue;
    if ((p.parentIds ?? []).some((x) => mine.includes(x))) out.add(p.id);
  }
  for (const b of Object.values(state.bonds)) {
    if (b.familyAtoB !== 'sibling') continue;
    if (b.a === id) out.add(b.b); else if (b.b === id) out.add(b.a);
  }
  return people(state, out);
}

export function grandparentsOf(state: WorldState, id: Id): Person[] {
  return people(state, parentIdsOf(state, id).flatMap((p) => parentIdsOf(state, p)));
}

export function grandchildrenOf(state: WorldState, id: Id): Person[] {
  return people(state, childrenOf(state, id).flatMap((c) => childrenOf(state, c.id).map((g) => g.id)));
}

/** Siblings of the parents. */
export function auntsUnclesOf(state: WorldState, id: Id): Person[] {
  const parents = new Set(parentIdsOf(state, id));
  return people(state, parentIdsOf(state, id).flatMap((p) => siblingsOf(state, p).map((s) => s.id)), parents);
}

/** Children of the siblings. */
export function nephewsNiecesOf(state: WorldState, id: Id): Person[] {
  return people(state, siblingsOf(state, id).flatMap((s) => childrenOf(state, s.id).map((c) => c.id)));
}

/** Children of the aunts and uncles. */
export function cousinsOf(state: WorldState, id: Id): Person[] {
  const siblings = new Set(siblingsOf(state, id).map((s) => s.id));
  return people(state, auntsUnclesOf(state, id).flatMap((a) => childrenOf(state, a.id).map((c) => c.id)), siblings);
}

/** The partner, spouse or fiance(e) of `id` from the shared bond, or null. */
export function partnerOf(state: WorldState, id: Id): { person: Person; kind: 'spouse' | 'partner' | 'engaged' } | null {
  for (const b of Object.values(state.bonds)) {
    if (b.a !== id && b.b !== id) continue;
    const other = state.people[b.a === id ? b.b : b.a];
    if (other && (b.status === 'spouse' || b.status === 'partner' || b.status === 'engaged')) return { person: other, kind: b.status };
  }
  return null;
}

/** What `other` is to `self` in the family graph, or null when they are not related (partners count). */
export function familyKind(state: WorldState, self: Id, other: Id): FamilyKind | null {
  if (self === other) return null;
  const has = (list: Person[]) => list.some((p) => p.id === other);
  const pk = partnerOf(state, self);
  if (pk && pk.person.id === other) return pk.kind;
  if (has(parentsOf(state, self))) return 'parent';
  if (has(childrenOf(state, self))) return 'child';
  if (has(siblingsOf(state, self))) return 'sibling';
  if (has(grandparentsOf(state, self))) return 'grandparent';
  if (has(grandchildrenOf(state, self))) return 'grandchild';
  if (has(auntsUnclesOf(state, self))) return 'auntUncle';
  if (has(nephewsNiecesOf(state, self))) return 'nieceNephew';
  if (has(cousinsOf(state, self))) return 'cousin';
  return null;
}

/** Plain words for what `other` is to `self` ("Grandparent"), or '' when they are not related. */
export function familyText(state: WorldState, self: Id, other: Id): string {
  const k = familyKind(state, self, other);
  return k ? FAMILY_TEXT[k] : '';
}

export interface Relative { person: Person; kind: FamilyKind; text: string }

/** Everybody related to `id` (and the partner), nearest relations first. */
export function relativesOf(state: WorldState, id: Id): Relative[] {
  const out: Relative[] = [];
  const seen = new Set<Id>([id]);
  const add = (kind: FamilyKind, list: Person[]) => {
    for (const person of list) if (!seen.has(person.id)) { seen.add(person.id); out.push({ person, kind, text: FAMILY_TEXT[kind] }); }
  };
  const pk = partnerOf(state, id);
  if (pk) add(pk.kind, [pk.person]);
  add('parent', parentsOf(state, id));
  add('child', childrenOf(state, id));
  add('sibling', siblingsOf(state, id));
  add('grandparent', grandparentsOf(state, id));
  add('grandchild', grandchildrenOf(state, id));
  add('auntUncle', auntsUnclesOf(state, id));
  add('nieceNephew', nephewsNiecesOf(state, id));
  add('cousin', cousinsOf(state, id));
  return out;
}

/**
 * The people to draw in a family tree around `id`: the person, every relative and the partners of those relatives,
 * and any parents of the people shown (so a household's tree reaches up to the grandparents).
 */
export function treeMembersOf(state: WorldState, id: Id): Id[] {
  const out: Id[] = [id];
  const seen = new Set<Id>(out);
  const add = (p: Person | undefined) => { if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p.id); } };
  for (const r of relativesOf(state, id)) add(r.person);
  for (const pid of [...out]) add(partnerOf(state, pid)?.person);
  return out;
}

/** True when `ancestor` is a parent, grandparent... of `id` (cycle safe). */
export function isAncestor(state: WorldState, ancestor: Id, id: Id): boolean {
  const seen = new Set<Id>();
  const stack = [...parentIdsOf(state, id)];
  while (stack.length > 0) {
    const x = stack.pop() as Id;
    if (x === ancestor) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...parentIdsOf(state, x));
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

/**
 * Sets the family tie of `b` from `a`'s point of view on the bond between them, creating the bond (and the two directed
 * relationships) with the tie's starting values when there is none. An existing stronger tie is not replaced by
 * 'none' or 'roommate'.
 */
export function setFamilyTie(state: WorldState, a: Id, b: Id, tie: FamilyTie): void {
  if (a === b || !state.people[a] || !state.people[b]) return;
  const key = pairKey(a, b);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const asLo: FamilyTie = lo === a ? tie : invertTie(tie);
  const existing = state.bonds[key];
  if (existing) {
    if (tie === 'none' || (tie === 'roommate' && existing.familyAtoB !== 'none')) return;
    existing.familyAtoB = asLo;
  } else {
    state.bonds[key] = { a: lo, b: hi, status: TIE_START[tie].status, familyAtoB: asLo, since: state.clock.minutes };
  }
  const start = TIE_START[tie];
  for (const [from, to] of [[a, b], [b, a]] as const) {
    const rel = ensureRel(state, from, to);
    rel.familiarity = Math.max(rel.familiarity, start.familiarity);
    rel.friendship = Math.max(rel.friendship, start.friendship);
    rel.trust = Math.max(rel.trust, start.trust);
    rel.lastInteractionAt = rel.lastInteractionAt ?? state.clock.minutes;
    refreshLabel(state, from, to);
  }
}

/**
 * Records that `parentId` is a parent of `childId`: adds it to `parentIds` (at most two parents, no cycles, the parent
 * must be older) and keeps the bond in step. Returns false when the link is not possible.
 */
export function linkParent(state: WorldState, childId: Id, parentId: Id): boolean {
  const child = state.people[childId], parent = state.people[parentId];
  if (!child || !parent || childId === parentId) return false;
  const ids = child.parentIds ?? [];
  if (ids.includes(parentId)) { setFamilyTie(state, childId, parentId, 'parent'); return true; }
  if (ids.length >= 2 || isAncestor(state, childId, parentId)) return false;
  child.parentIds = [...ids, parentId];
  setFamilyTie(state, childId, parentId, 'parent');
  return true;
}

/** Writes a "family" memory for a person about a relative. */
export function familyMemory(state: WorldState, person: Person, withId: Id, kind: 'adopted' | 'movedOut' | 'passedAway' | 'birthday', text: string, importance: 1 | 2 | 3 = 3): void {
  addMemory(state, person, { kind, importance, withId, text });
}
