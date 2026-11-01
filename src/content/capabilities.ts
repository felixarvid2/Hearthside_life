// Object capabilities by tag. Cleaning and repairs are generic: any object carrying one of these tags is offered the
// matching interactions without listing them in ObjectDef.interactions, so furniture added later (dishwasher, trash
// can, washing machine, ...) works as soon as it has the tags.
//
//   cleanable   gets dirty with use; offered "Clean". Counted for the Dirty Kitchen / Dirty Bathroom moodlets.
//   plumbing    breakable water fixture (toilet, shower, bath, sink, dishwasher); "Repair", "Service", "Call a Repairperson".
//   appliance   breakable appliance (fridge, stove, microwave, washer); same repair interactions.
//   electronics breakable electronics (TV, computer, radio, speaker); same repair interactions.
//   sink | dishes  a dish-washing station: dirty dishes are carried here and washed (a 'dishes' object such as a
//                  dishwasher washes them in half the time).
//
// A tag only counts on a functional object (decorative objects never offer interactions).

import type { SocialDef, SocialSection } from './types';

export const CLEANABLE_TAG = 'cleanable';
/** Tags that make an object break with use and repairable. */
export const REPAIR_TAGS: readonly string[] = ['plumbing', 'appliance', 'electronics'];
/** Tags of objects dirty dishes can be washed at. */
export const DISH_STATION_TAGS: readonly string[] = ['sink', 'dishes'];

export const CLEAN_INTERACTION = 'cleanObject';
export const REPAIR_INTERACTION = 'repairObject';
export const SERVICE_INTERACTION = 'serviceObject';
export const CALL_REPAIR_INTERACTION = 'callRepairperson';

type Capable = { tags: readonly string[]; functional: boolean };

export const isCleanable = (d: Capable): boolean => d.functional && d.tags.includes(CLEANABLE_TAG);
export const isRepairable = (d: Capable): boolean => d.functional && d.tags.some((t) => REPAIR_TAGS.includes(t));
export const isDishStation = (d: Capable): boolean => d.functional && d.tags.some((t) => DISH_STATION_TAGS.includes(t));

/** Interaction ids an object offers because of its tags (not listed in ObjectDef.interactions). */
export function capabilityInteractions(d: Capable): string[] {
  const out: string[] = [];
  if (isCleanable(d)) out.push(CLEAN_INTERACTION);
  if (isRepairable(d)) out.push(REPAIR_INTERACTION, SERVICE_INTERACTION, CALL_REPAIR_INTERACTION);
  return out;
}

/** Every interaction id an object offers: its own list plus the tag capabilities. */
export function offeredInteractionIds(d: Capable & { interactions: readonly string[] }): string[] {
  const out = [...d.interactions];
  for (const id of capabilityInteractions(d)) if (!out.includes(id)) out.push(id);
  return out;
}

/** Social menu section of a social: its explicit `section`, else from the category. */
export function socialSection(def: Pick<SocialDef, 'category' | 'section'>): SocialSection {
  if (def.section) return def.section;
  switch (def.category) {
    case 'romantic': return 'romantic';
    case 'mean': return 'mean';
    case 'status': return 'special';
    default: return 'friendly';
  }
}
