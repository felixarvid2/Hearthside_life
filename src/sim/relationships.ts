// Directed relationships, shared bonds and bounded memories.

import type { RelDelta } from '../content/types';
import type { EventBus } from '../core/events';
import { newId, pairKey, relKey } from '../core/ids';
import { MEMORY_LIMIT, addFeed, fullName } from '../core/state';
import type {
  Bond, BondStatus, FamilyTie, GameMinutes, Id, Memory, MemoryKind, Person, Relationship, WorldState,
} from '../core/types';
import { clamp } from './context';

function freshRel(from: Id, to: Id): Relationship {
  return { from, to, familiarity: 0, friendship: 0, trust: 0, romance: 0, lastInteractionAt: null, recent: {} };
}

/** How `from` feels about `to`; a neutral default (not stored) when they never met. */
export function peekRel(state: WorldState, from: Id, to: Id): Relationship {
  return state.relationships[relKey(from, to)] ?? freshRel(from, to);
}

/** The stored relationship record, created when missing. */
export function ensureRel(state: WorldState, from: Id, to: Id): Relationship {
  const key = relKey(from, to);
  let rel = state.relationships[key];
  if (!rel) { rel = freshRel(from, to); state.relationships[key] = rel; }
  return rel;
}

/** Applies a directed delta (scaled by `mult`) with clamping. */
export function applyRelDelta(state: WorldState, from: Id, to: Id, d: RelDelta, now: GameMinutes, mult = 1): Relationship {
  const rel = ensureRel(state, from, to);
  if (d.familiarity) rel.familiarity = clamp(rel.familiarity + d.familiarity * (d.familiarity > 0 ? mult : 1), 0, 100);
  if (d.friendship) rel.friendship = clamp(rel.friendship + d.friendship * (d.friendship > 0 ? mult : 1), -100, 100);
  if (d.trust) rel.trust = clamp(rel.trust + d.trust * (d.trust > 0 ? mult : 1), -100, 100);
  if (d.romance) rel.romance = clamp(rel.romance + d.romance * (d.romance > 0 ? mult : 1), -100, 100);
  rel.lastInteractionAt = now;
  return rel;
}

/** Forgets one recent use per SOCIAL_RECENT_DECAY window since the last interaction. */
export function decayRecent(rel: Relationship, now: GameMinutes, windowMinutes: number): void {
  if (rel.lastInteractionAt === null) { rel.recent = {}; return; }
  const forget = Math.floor((now - rel.lastInteractionAt) / windowMinutes);
  if (forget <= 0) return;
  for (const [k, v] of Object.entries(rel.recent)) {
    const n = v - forget;
    if (n > 0) rel.recent[k] = n; else delete rel.recent[k];
  }
}

export function bondOf(state: WorldState, a: Id, b: Id): Bond | undefined {
  return state.bonds[pairKey(a, b)];
}

/** Family tie of `other` from `self`'s point of view. */
export function familyTie(state: WorldState, self: Id, other: Id): FamilyTie {
  const bond = bondOf(state, self, other);
  if (!bond) return 'none';
  return bond.a === self ? bond.familyAtoB : invertTie(bond.familyAtoB);
}

export function invertTie(t: FamilyTie): FamilyTie {
  return t === 'parent' ? 'child' : t === 'child' ? 'parent' : t;
}

/** Creates or updates the bond between two people. Returns true when the status changed. */
export function setBondStatus(
  state: WorldState, events: EventBus | null, a: Id, b: Id, status: BondStatus, now: GameMinutes,
): boolean {
  const key = pairKey(a, b);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const bond = state.bonds[key];
  if (bond && bond.status === status) return false;
  if (bond) { bond.status = status; bond.since = now; } else state.bonds[key] = { a: lo, b: hi, status, familyAtoB: 'none', since: now };
  const pa = state.people[a], pb = state.people[b];
  const text = pa && pb ? `${pa.firstName} and ${pb.firstName} are now ${statusLabel(status, true)}.` : undefined;
  events?.emit({ type: 'relationship', fromId: a, toId: b, what: 'status', ...(text ? { text } : {}) });
  if (text) addFeed(state, events, 'social', text, a);
  return true;
}

/** Readable status names ("friends", "partners"). */
export function statusLabel(s: BondStatus, plural = false): string {
  const one: Record<BondStatus, string> = {
    acquaintance: 'acquaintance', friend: 'friend', closeFriend: 'close friend', rival: 'rival', partner: 'partner',
    engaged: 'engaged', spouse: 'spouse', exPartner: 'ex-partner',
  };
  const many: Record<BondStatus, string> = {
    acquaintance: 'acquaintances', friend: 'friends', closeFriend: 'close friends', rival: 'rivals', partner: 'partners',
    engaged: 'engaged', spouse: 'spouses', exPartner: 'ex-partners',
  };
  return plural ? many[s] : one[s];
}

/**
 * Records a memory. Repeated low-importance memories of the same kind with the same person are merged
 * (count++), importance-3 memories are kept forever, and the list stays within MEMORY_LIMIT by dropping
 * the oldest importance-1, then importance-2 entries.
 */
export function addMemory(
  state: WorldState, person: Person, m: { kind: MemoryKind; text: string; importance: 1 | 2 | 3; withId?: Id },
): Memory {
  const now = state.clock.minutes;
  if (m.importance < 3) {
    const idx = person.memories.findIndex((x) => x.kind === m.kind && x.withId === m.withId && x.importance === m.importance);
    const existing = idx >= 0 ? person.memories[idx] : undefined;
    if (existing) {
      existing.count += 1;
      existing.at = now;
      existing.text = m.text;
      person.memories.splice(idx, 1);
      person.memories.push(existing);
      return existing;
    }
  }
  const mem: Memory = {
    id: newId(state, 'mem'), at: now, kind: m.kind, text: m.text, importance: m.importance, count: 1,
    ...(m.withId ? { withId: m.withId } : {}),
  };
  person.memories.push(mem);
  while (person.memories.length > MEMORY_LIMIT) {
    let drop = person.memories.findIndex((x) => x.importance === 1);
    if (drop < 0) drop = person.memories.findIndex((x) => x.importance === 2);
    if (drop < 0) break;
    person.memories.splice(drop, 1);
  }
  return mem;
}

/** Number of people with mutual friendship of at least `minFriendship` (both directions). */
export function friendsCount(state: WorldState, personId: Id, minFriendship: number): number {
  let n = 0;
  for (const rel of Object.values(state.relationships)) {
    if (rel.from !== personId || rel.friendship < minFriendship || !state.people[rel.to]) continue;
    if (peekRel(state, rel.to, personId).friendship >= minFriendship) n++;
  }
  return n;
}

/** People this person has met (familiarity > 0), in relationship order. */
export function knownPeople(state: WorldState, personId: Id): Id[] {
  const out: Id[] = [];
  for (const rel of Object.values(state.relationships)) {
    if (rel.from === personId && rel.familiarity > 0 && state.people[rel.to]) out.push(rel.to);
  }
  return out;
}

export function displayName(state: WorldState, id: Id): string {
  const p = state.people[id];
  return p ? fullName(p) : 'someone';
}
