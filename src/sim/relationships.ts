// Directed relationships, shared bonds and bounded memories.

import type { RelDelta, SocialCategory } from '../content/types';
import type { EventBus } from '../core/events';
import { newId, pairKey, relKey } from '../core/ids';
import { MEMORY_EFFECTS, isCommitted, isHostile, relationshipLabel, romanceInterest } from '../core/relations';
import { MEMORY_LIMIT, addFeed, fullName } from '../core/state';
import type {
  Bond, BondStatus, FamilyTie, GameMinutes, Id, Memory, MemoryKind, Person, RelLabel, Relationship, WorldState,
} from '../core/types';
import { clamp } from './context';
import {
  DECAY_FLOOR, DECAY_FRIENDSHIP_PER_DAY, DECAY_GRACE_DAYS, DECAY_ROMANCE_PER_DAY, DECAY_TRUST_PER_DAY, FORGIVE_PER_DAY,
  MEMORY_HARD_LIMIT, MEMORY_PER_PERSON,
} from './tuning';

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
  refreshLabel(state, from, to);
  return rel;
}

/**
 * Recomputes the stored label of `from`'s view of `to` (with hysteresis from the previous label) and returns it.
 * Called after every change of the values or of the shared bond.
 */
export function refreshLabel(state: WorldState, from: Id, to: Id): RelLabel {
  const rel = ensureRel(state, from, to);
  const a = state.people[from], b = state.people[to];
  const interested = !!a && !!b && romanceInterest(a, b);
  rel.label = relationshipLabel(rel, state.bonds[pairKey(from, to)]?.status, rel.label, interested);
  return rel.label;
}

/** The label to show for `from`'s view of `to` (stored, else derived without history). Never writes to the state. */
export function labelOf(state: WorldState, from: Id, to: Id): RelLabel {
  const rel = state.relationships[relKey(from, to)];
  if (!rel) return 'stranger';
  if (rel.label) return rel.label;
  const a = state.people[from], b = state.people[to];
  return relationshipLabel(rel, state.bonds[pairKey(from, to)]?.status, undefined, !!a && !!b && romanceInterest(a, b));
}

/** The exclusive commitment (partner, engaged, spouse) a person is in, if any. */
export function commitmentOf(state: WorldState, id: Id): { otherId: Id; status: BondStatus } | null {
  for (const bond of Object.values(state.bonds)) {
    if (!isCommitted(bond.status)) continue;
    if (bond.a === id) return { otherId: bond.b, status: bond.status };
    if (bond.b === id) return { otherId: bond.a, status: bond.status };
  }
  return null;
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
  refreshLabel(state, a, b);
  refreshLabel(state, b, a);
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

/** Kinds whose memories are never dropped to make room (milestones and betrayals). */
const KEEP_FOREVER: ReadonlySet<MemoryKind> = new Set<MemoryKind>([
  'becamePartners', 'engaged', 'married', 'breakup', 'betrayal', 'movedIn', 'greatDate', 'promotion', 'aspiration',
]);

/**
 * Records a memory. Repeated low-importance memories of the same kind with the same person are merged
 * (count++), importance-3 memories are kept, and storage stays bounded: at most MEMORY_PER_PERSON low-importance
 * memories per other person, MEMORY_LIMIT in total (oldest importance 1, then 2, go first), and MEMORY_HARD_LIMIT
 * overall, where the oldest milestone that is not in KEEP_FOREVER goes last.
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
      delete existing.resolved;
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
  const oldest = (pred: (x: Memory) => boolean) => person.memories.findIndex(pred);
  if (m.withId) {
    // One person must not crowd out everybody else: summarise by dropping their oldest low-importance memories.
    while (person.memories.filter((x) => x.withId === m.withId && x.importance < 3).length > MEMORY_PER_PERSON) {
      let drop = oldest((x) => x.withId === m.withId && x.importance === 1 && x !== mem);
      if (drop < 0) drop = oldest((x) => x.withId === m.withId && x.importance === 2 && x !== mem);
      if (drop < 0) break;
      person.memories.splice(drop, 1);
    }
  }
  while (person.memories.length > MEMORY_LIMIT) {
    let drop = oldest((x) => x.importance === 1 && x !== mem);
    if (drop < 0) drop = oldest((x) => x.importance === 2 && x !== mem);
    if (drop < 0) break;
    person.memories.splice(drop, 1);
  }
  while (person.memories.length > MEMORY_HARD_LIMIT) {
    let drop = oldest((x) => x.importance === 3 && !KEEP_FOREVER.has(x.kind) && x !== mem);
    if (drop < 0) drop = oldest((x) => x !== mem);
    if (drop < 0) break;
    person.memories.splice(drop, 1);
  }
  return mem;
}

/** Marks memories of these kinds that involve `withId` as settled; they stay in the list but stop changing behaviour. */
export function resolveMemories(person: Person, withId: Id, kinds: readonly MemoryKind[]): number {
  let n = 0;
  for (const m of person.memories) {
    if (m.withId === withId && kinds.includes(m.kind) && !m.resolved) { m.resolved = true; n++; }
  }
  return n;
}

/** Acceptance modifier a person's memories of `other` give to a social category right now (pure). */
export function memoryModifier(person: Person, other: Id, category: SocialCategory, now: GameMinutes): number {
  let sum = 0;
  for (const m of person.memories) {
    if (m.withId !== other || m.resolved) continue;
    const fx = MEMORY_EFFECTS[m.kind];
    if (!fx || now - m.at >= fx.minutes) continue;
    sum += fx.mod[category] ?? fx.mod.all ?? 0;
  }
  return clamp(sum, -0.6, 0.3);
}

/** Whether `person` holds an unsettled, recent memory of one of these kinds with `other`. */
export function hasRecentMemory(person: Person, other: Id, kinds: readonly MemoryKind[], withinMinutes: number, now: GameMinutes): boolean {
  return person.memories.some((m) => m.withId === other && !m.resolved && kinds.includes(m.kind) && now - m.at <= withinMinutes);
}

// ---------------------------------------------------------------------------------------------
// Time: decay without contact and bond upkeep (once per game day, from Simulation.dailyRollover)
// ---------------------------------------------------------------------------------------------

/**
 * Relationships fade without contact, but only so far. After DECAY_GRACE_DAYS without an interaction, friendship,
 * trust and romance above the floor of the shared bond lose a little each day (people who live together count as
 * in contact), and resentment (negative values) softens toward zero. Pure arithmetic: no randomness, so skipping
 * time or loading a save cannot change the outcome.
 */
export function decayRelationships(state: WorldState, now: GameMinutes): void {
  for (const rel of Object.values(state.relationships)) {
    const a = state.people[rel.from], b = state.people[rel.to];
    if (!a || !b || a.householdId === b.householdId || rel.lastInteractionAt === null) continue;
    if ((now - rel.lastInteractionAt) / 1440 < DECAY_GRACE_DAYS) continue;
    const floor = DECAY_FLOOR[state.bonds[pairKey(rel.from, rel.to)]?.status ?? 'none'] ?? DECAY_FLOOR.none!;
    const fade = (v: number, perDay: number, min: number): number =>
      v < 0 ? Math.min(0, v + FORGIVE_PER_DAY) : v > min ? Math.max(min, v - perDay) : v;
    rel.friendship = fade(rel.friendship, DECAY_FRIENDSHIP_PER_DAY, floor.friendship);
    rel.trust = fade(rel.trust, DECAY_TRUST_PER_DAY, floor.trust);
    rel.romance = fade(rel.romance, DECAY_ROMANCE_PER_DAY, floor.romance);
    refreshLabel(state, rel.from, rel.to);
  }
}

/**
 * Keeps shared bond statuses in line with how the two feel: friends who have drifted apart become acquaintances,
 * people who clearly dislike each other become rivals, and rivals who have cooled down become acquaintances.
 * Upgrades never happen here: they need an accepted interaction.
 */
export function syncBonds(state: WorldState, events: EventBus | null, now: GameMinutes): void {
  for (const bond of Object.values(state.bonds)) {
    const pa = state.people[bond.a], pb = state.people[bond.b];
    if (!pa || !pb || pa.householdId === pb.householdId) continue; // housemates stay in each other's lives
    const la = labelOf(state, bond.a, bond.b), lb = labelOf(state, bond.b, bond.a);
    const either = isHostile(la) || isHostile(lb);
    if ((bond.status === 'friend' || bond.status === 'closeFriend') && (either || (!friendly(la) && !friendly(lb)))) {
      setBondStatus(state, events, bond.a, bond.b, either ? 'rival' : 'acquaintance', now);
    } else if (bond.status === 'acquaintance' && either && isHostile(la) && isHostile(lb)) {
      setBondStatus(state, events, bond.a, bond.b, 'rival', now);
    } else if (bond.status === 'rival' && !either) {
      setBondStatus(state, events, bond.a, bond.b, 'acquaintance', now);
    }
  }
}

function friendly(l: RelLabel): boolean { return l === 'friend' || l === 'closeFriend' || l === 'bestFriend' || l === 'crush'; }

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
