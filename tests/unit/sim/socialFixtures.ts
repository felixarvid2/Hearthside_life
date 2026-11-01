// Fixtures for the relationship, romance and event tests: the simulation fixture world (tests/unit/sim/fixtures.ts)
// with the game's real socials, events, moodlets and traits, and helpers to add people and set relationships.

import { EVENTS } from '../../../src/content/events';
import { INTERACTIONS } from '../../../src/content/interactions';
import { MOODLETS } from '../../../src/content/moodlets';
import { SOCIALS } from '../../../src/content/socials';
import { TRAITS } from '../../../src/content/traits';
import type { ContentDB } from '../../../src/content/types';
import type { PersonDraft } from '../../../src/core/drafts';
import { pairKey } from '../../../src/core/ids';
import type { BondStatus, Id, Person, WorldState } from '../../../src/core/types';
import { createPerson } from '../../../src/sim/people';
import { ensureRel, refreshLabel } from '../../../src/sim/relationships';
import { buildWorld, draft, fixtureContent, harness, lotLocation, pureCtx, setNeeds } from './fixtures';
import type { FixtureWorld, Harness, WorldOptions } from './fixtures';

const byId = <T extends { id: string }>(l: readonly T[]): Record<string, T> => Object.fromEntries(l.map((x) => [x.id, x]));

/** The fixture content with the real socials, events, moodlets and traits. */
export function socialContent(): ContentDB {
  const base = fixtureContent();
  return {
    ...base,
    interactions: { ...base.interactions, ...byId(INTERACTIONS.filter((i) => i.id === 'planEvent' || i.id === 'phoneDate')) },
    socials: byId(SOCIALS),
    events: byId(EVENTS),
    moodlets: { ...base.moodlets, ...byId(MOODLETS) },
    traits: { ...base.traits, ...byId(TRAITS) },
  };
}

export interface SocialWorld { w: FixtureWorld; h: Harness }

/** Mira and Theo at home, Ada (a neighbour) off-lot at home, everything with real social content. */
export function socialWorld(o: WorldOptions = {}): SocialWorld {
  const w = buildWorld({ autonomy: false, visitors: false, ...o });
  return { w, h: harness(w.state, socialContent()) };
}

/** Adds a person to a household with a draft override; on the lot at (x, z) or off-lot at home. */
export function addPerson(w: FixtureWorld, householdId: Id, firstName: string, o: Partial<PersonDraft> = {}, at?: { x: number; z: number }): Person {
  const content = socialContent();
  const loc = at ? lotLocation(w.lot, at.x, at.z) : { kind: 'offlot' as const, place: 'home' as const, since: w.state.clock.minutes, until: null };
  return createPerson(w.state, content, draft(w.state, firstName, o), householdId, loc);
}

/** Sets both directions of a relationship to the same values (and refreshes the labels). */
export function setBoth(state: WorldState, a: Id, b: Id, v: { familiarity?: number; friendship?: number; trust?: number; romance?: number }): void {
  for (const [from, to] of [[a, b], [b, a]] as const) {
    const r = ensureRel(state, from, to);
    Object.assign(r, v);
    refreshLabel(state, from, to);
  }
}

/** A shared bond between two people. */
export function bond(state: WorldState, a: Id, b: Id, status: BondStatus): void {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  state.bonds[pairKey(a, b)] = { a: lo, b: hi, status, familyAtoB: 'none', since: state.clock.minutes };
  refreshLabel(state, a, b);
  refreshLabel(state, b, a);
}

export { draft, harness, lotLocation, pureCtx, setNeeds };
