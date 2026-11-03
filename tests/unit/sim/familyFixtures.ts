// Fixtures for the Milestone 8 tests (aging, school, care, adoption, moving): the social fixture world with the real family
// content (schools, family interactions and socials, moodlets, skills) and a few real objects (crib, cake, desk tags).

import { FAMILY_INTERACTIONS, FAMILY_SOCIALS } from '../../../src/content/family';
import { INTERACTIONS } from '../../../src/content/interactions';
import { OBJECTS } from '../../../src/content/objects';
import { SCHOOLS } from '../../../src/content/school';
import { SKILLS } from '../../../src/content/skills';
import type { ContentDB } from '../../../src/content/types';
import type { PersonDraft } from '../../../src/core/drafts';
import type { Id, Lot, Person, PlacedObject, Rot, WorldState } from '../../../src/core/types';
import { newId } from '../../../src/core/ids';
import { createPerson } from '../../../src/sim/people';
import { buildWorld, draft, harness, lotLocation, place } from './fixtures';
import type { FixtureWorld, Harness, WorldOptions } from './fixtures';
import { socialContent } from './socialFixtures';

const byId = <T extends { id: string }>(l: readonly T[]): Record<string, T> => Object.fromEntries(l.map((x) => [x.id, x]));

/** Fixture content plus the family content. The desk and computer carry the homework tags like the real ones do. */
export function familyContent(): ContentDB {
  const base = socialContent();
  const real = (id: string) => OBJECTS.find((o) => o.id === id)!;
  // The fixture interactions take the life stages of the real ones (toddlers may sleep, nap, sit, eat, watch TV and play with toys).
  const staged = Object.fromEntries(Object.entries(base.interactions).map(([id, d]) => {
    const ages = INTERACTIONS.find((i) => i.id === id)?.ages;
    return [id, ages ? { ...d, ages } : d];
  }));
  return {
    ...base,
    interactions: { ...staged, ...byId(FAMILY_INTERACTIONS) },
    socials: { ...base.socials, ...byId(FAMILY_SOCIALS) },
    schools: byId(SCHOOLS),
    skills: { ...base.skills, ...byId(SKILLS.filter((s) => ['motor', 'talking', 'potty', 'logic'].includes(s.id))) },
    objects: {
      ...base.objects,
      'desk-oak': { ...base.objects['desk-oak']!, tags: ['desk', 'surface'] },
      'computer-desktop': { ...base.objects['computer-desktop']!, tags: ['computer', 'electronics'] },
      'crib-wood': real('crib-wood'), 'bassinet-wicker': real('bassinet-wicker'), 'birthday-cake': real('birthday-cake'),
      'potty-chair': real('potty-chair'), 'changing-table': real('changing-table'), 'high-chair': real('high-chair'),
    },
  };
}

export interface FamilyWorld { w: FixtureWorld; h: Harness; content: ContentDB }

/** The fixture world (Mira and Theo, adults) with the family content, starting at `startMinute` (default Monday 07:00). */
export function familyWorld(o: WorldOptions & { startMinute?: number; aging?: WorldState['settings']['aging'] } = {}): FamilyWorld {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: true, ...o });
  w.state.clock.minutes = o.startMinute ?? 7 * 60;
  if (o.aging) w.state.settings.aging = o.aging;
  const content = familyContent();
  return { w, h: harness(w.state, content), content };
}

/** Adds a person of any life stage to a household; on the lot at (x, z) or off-lot at home. */
export function addMember(fw: FamilyWorld, householdId: Id, firstName: string, o: Partial<PersonDraft> = {}, at?: { x: number; z: number }): Person {
  const w = fw.w;
  const loc = at ? lotLocation(w.lot, at.x, at.z) : { kind: 'offlot' as const, place: 'home' as const, since: w.state.clock.minutes, until: null };
  return createPerson(w.state, fw.content, draft(w.state, firstName, o), householdId, loc);
}

export function placeObject(fw: FamilyWorld, defId: string, x: number, z: number, rot: Rot = 0, supportId?: Id): PlacedObject {
  return place(fw.w.state, fw.w.lot, defId, x, z, rot, supportId);
}

/** A second, empty residential lot for rent. */
export function addVacantLot(state: WorldState, rent = 20000): Lot {
  const src = Object.values(state.lots)[0]!;
  const lot: Lot = { ...JSON.parse(JSON.stringify(src)) as Lot, id: newId(state, 'lot'), name: 'Empty House', ownerHouseholdId: null, objects: {}, rent };
  state.lots[lot.id] = lot;
  return lot;
}

export { lotLocation };
