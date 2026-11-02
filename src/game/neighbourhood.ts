// Neighbourhood generation (Milestone 7): the twelve generated lot records and the named NPC households that live in
// them, created exactly once per world. A new world generates it inside createNewWorld; an older save gets one when it
// is loaded (ensureNeighbourhood), with the player's household, home lot and next-door neighbours left untouched.
//
// Everything is drawn from a generator seeded by the world seed (never the simulation's rng, except the 70-90 starting
// needs that createPerson takes, which ensureNeighbourhood puts back), so the same world always gets the same
// neighbourhood. Nothing here runs again when a lot is loaded or a household is switched: people keep their jobs,
// traits, looks and relationships for good.

import { SURNAMES, randomPersonDraft } from '../characters/names';
import type { ContentDB } from '../content/types';
import type { HouseholdDraft, PersonDraft } from '../core/drafts';
import { pairKey } from '../core/ids';
import { dollars } from '../core/money';
import { Rng, seedRng } from '../core/rng';
import { addHousehold, transact } from '../core/state';
import type { FamilyTie } from '../core/types';
import type { BondStatus, Cents, Id, Lot, NeighbourhoodState, WorldState } from '../core/types';
import { applyHouseholdTies, createPerson } from '../sim/people';
import { ensureRel, refreshLabel } from '../sim/relationships';
import { HOME_MAP, LOT_SPECS, NEIGHBOUR_MAP, createNeighbourhoodLots } from '../world/neighbourhood';

/** Who lives in each generated home (LotSpec.home index): size, ties between members and how they are named. */
interface HomePlan { size: number; tie: FamilyTie | null; sharedName: boolean }

const HOME_PLANS: readonly HomePlan[] = [
  { size: 2, tie: 'partner', sharedName: true },
  { size: 1, tie: null, sharedName: true },
  { size: 2, tie: 'roommate', sharedName: false },
  { size: 2, tie: 'sibling', sharedName: true },
];

/** Relationships between the households, by (household index, member index); -1 is the next-door neighbours. */
const LINKS: ReadonlyArray<{ a: [number, number]; b: [number, number]; status: BondStatus; familiarity: number; friendship: number; trust: number }> = [
  { a: [-1, 0], b: [0, 0], status: 'friend', familiarity: 60, friendship: 42, trust: 30 },
  { a: [0, 1], b: [1, 0], status: 'acquaintance', familiarity: 25, friendship: 12, trust: 8 },
  { a: [1, 0], b: [2, 0], status: 'friend', familiarity: 55, friendship: 40, trust: 28 },
  { a: [2, 1], b: [3, 0], status: 'rival', familiarity: 45, friendship: -35, trust: -12 },
  { a: [-1, 1], b: [3, 1], status: 'acquaintance', familiarity: 30, friendship: 14, trust: 10 },
  { a: [1, 0], b: [3, 1], status: 'friend', familiarity: 50, friendship: 36, trust: 25 },
  { a: [0, 0], b: [2, 1], status: 'acquaintance', familiarity: 22, friendship: 10, trust: 6 },
];

const SEED_MIX = 0x0e16b0d;

/** The street the player's home is on (the address without its number). */
function streetOf(lot: Lot | undefined): string {
  return lot ? lot.address.split(' ').slice(1).join(' ') || 'Main Street' : 'Main Street';
}

function setLink(state: WorldState, a: Id, b: Id, v: { familiarity: number; friendship: number; trust: number }, status: BondStatus): void {
  const now = state.clock.minutes;
  for (const [from, to] of [[a, b], [b, a]] as const) {
    const rel = ensureRel(state, from, to);
    rel.familiarity = Math.max(rel.familiarity, v.familiarity);
    rel.friendship = v.friendship;
    rel.trust = v.trust;
    rel.lastInteractionAt = now;
  }
  const [lo, hi] = a < b ? [a, b] : [b, a];
  state.bonds[pairKey(a, b)] = { a: lo, b: hi, status, familyAtoB: 'none', since: now };
  refreshLabel(state, a, b);
  refreshLabel(state, b, a);
}

/**
 * Creates the generated lots and the NPC households for a world that has none (call once; use ensureNeighbourhood for
 * saves). The player's household and the next-door neighbours must already exist. Returns the marker stored in
 * `state.neighbourhood`.
 */
export function generateNeighbourhood(state: WorldState, content: ContentDB): NeighbourhoodState {
  // createPerson draws starting needs from the world rng; put it back afterwards so the neighbourhood never changes the
  // random future of the world (worlds with and without it play on identically).
  const savedRng = [...state.rng] as WorldState['rng'];
  const marker = generate(state, content);
  state.rng = savedRng;
  return marker;
}

function generate(state: WorldState, content: ContentDB): NeighbourhoodState {
  const rng = new Rng(seedRng(((state.seed >>> 0) ^ SEED_MIX) >>> 0));
  const now = state.clock.minutes;
  const player = state.households[state.activeHouseholdId];
  const homeLot = player?.homeLotId ? state.lots[player.homeLotId] : state.lots[state.activeLotId];
  const street = streetOf(homeLot);

  // Map positions of the lots that already exist: the player's home and the next-door house.
  const next = Object.values(state.households).find((h) => h.id !== player?.id && h.homeLotId && state.lots[h.homeLotId]);
  if (homeLot && !homeLot.map) homeLot.map = { ...HOME_MAP };
  const neighbourLot = next?.homeLotId ? state.lots[next.homeLotId] : undefined;
  if (neighbourLot && !neighbourLot.map) neighbourLot.map = { ...NEIGHBOUR_MAP };

  const lots = createNeighbourhoodLots(state, rng, street);

  const taken = new Set<string>(Object.values(state.people).map((p) => p.firstName));
  const takenSurnames = new Set<string>(Object.values(state.people).map((p) => p.lastName));
  const careerIds = Object.values(content.careers).filter((c) => c.status === 'ready' && c.levels.length > 0).map((c) => c.id).sort();
  const households: Array<{ id: Id; memberIds: Id[] }> = [];
  const npcHouseholdIds: Id[] = [];

  for (const spec of LOT_SPECS) {
    if (spec.home === undefined) continue;
    const plan = HOME_PLANS[spec.home]!;
    const lot = state.lots[lots.byKey[spec.key]!]!;
    const surname = () => {
      const options = SURNAMES.filter((s) => !takenSurnames.has(s));
      const pick = rng.pick(options.length > 0 ? options : SURNAMES);
      takenSurnames.add(pick);
      return pick;
    };
    const shared = plan.sharedName ? surname() : null;
    const members: PersonDraft[] = [];
    for (let i = 0; i < plan.size; i++) {
      const draft = randomPersonDraft(rng, content, {
        lastName: shared ?? surname(), avoidFirstNames: [...taken], careerChance: 0.7,
      });
      taken.add(draft.firstName);
      members.push(draft);
    }
    // Every household has at least one job.
    if (careerIds.length > 0 && members.every((m) => m.careerId === null)) members[0]!.careerId = rng.pick(careerIds);
    const name = shared ?? members.map((m) => m.lastName).join(' & ');
    const draftHousehold: HouseholdDraft = {
      name, members, ties: plan.tie && members.length > 1 ? [{ a: 0, b: 1, tie: plan.tie }] : [],
    };
    const funds: Cents = dollars(rng.int(30, 90) * 100);
    const hh = addHousehold(state, draftHousehold.name, 0, lot.id, false);
    transact(state, null, hh.id, funds, 'start', 'Starting funds', { occurrence: `start:${hh.id}` });
    if (spec.rented) lot.rent = dollars(rng.int(110, 140));
    else lot.ownerHouseholdId = hh.id;
    const ids = draftHousehold.members.map((m) => createPerson(state, content, m, hh.id, {
      kind: 'offlot', place: 'home', lotId: lot.id, since: now, until: null,
    }).id);
    applyHouseholdTies(state, ids, draftHousehold.ties);
    households.push({ id: hh.id, memberIds: ids });
    npcHouseholdIds.push(hh.id);
  }

  // Relationships between the households (and with the people next door).
  const memberOf = (ref: [number, number]): Id | undefined =>
    ref[0] < 0 ? next?.memberIds[ref[1]] : households[ref[0]]?.memberIds[ref[1]];
  for (const link of LINKS) {
    const a = memberOf(link.a), b = memberOf(link.b);
    if (a && b) setLink(state, a, b, link, link.status);
  }

  const marker: NeighbourhoodState = { version: 1, street, npcHouseholdIds, ...(next ? { nextDoorHouseholdId: next.id } : {}) };
  state.neighbourhood = marker;
  return marker;
}

/**
 * Makes sure the world has a neighbourhood. Worlds saved before Milestone 7 (or built without one) get it generated now,
 * deterministically from the world seed; the world's rng is left exactly where it was, so a loaded save plays on as it
 * would have. Returns true when something was generated.
 */
export function ensureNeighbourhood(state: WorldState, content: ContentDB): boolean {
  if (state.neighbourhood) return false;
  if (!state.households[state.activeHouseholdId] || !state.lots[state.activeLotId]) return false;
  generateNeighbourhood(state, content);
  return true;
}
