// Milestone 13: furnishings that were display pieces until now. The designs live in objects.ts and objectsM10/*; this table
// turns them into working objects (interactions, shade) without touching every definition. `applyFurnishingUse` runs once
// over the finished catalog (objects.ts). It also holds the handmade pot that Throw a Pot leaves behind.

import { dollars } from '../core/money';
import type { ObjectDef, ObjectSlot } from './types';

interface Patch {
  interactions?: string[];
  /** A standing use slot centred in front of the footprint (instruments that had none). */
  use?: boolean;
  /** Extra slots (the sofa bed's mattress). */
  slots?: ObjectSlot[];
  tags?: string[];
  /** Tiles of shade around the footprint. */
  shelter?: number;
  /** Sentence that replaces the "decorative for now" remark in the description. */
  blurb?: string;
}

const DECOR_REMARK = /\s*(Decorative for now[^.]*\.|A display piece in this version: nobody plays it yet\.)/;

/** The sofa bed's mattress runs along its width: the head is at the left end, the slot faces the foot (+x). */
const SOFA_BED_SLOT: ObjectSlot = { id: 'bed', kind: 'sleep', pos: [1, 0.5], height: 0.5, facing: Math.PI / 2, approach: [1, 1], posture: 'lying' };

const LAUNDRY_BLURB = 'Do the Laundry from the menu: a wash cycle, fresh clothes and a Fresh Laundry mood.';
const PATCHES: Record<string, Patch> = {
  'drum-kit-display': { use: true, interactions: ['playDrums'], tags: ['drums'], blurb: 'Sit on the throne and play: loud fun that trains Music.' },
  'harp-concert': { use: true, interactions: ['playHarp'], tags: ['harp'], blurb: 'Play it for calm fun and Music practice.' },
  'cello-stand': { use: true, interactions: ['playCello'], tags: ['cello'], blurb: 'Play it for fun and Music practice.' },
  'armchair-recliner': { interactions: ['sit', 'nap', 'reclineBack'] },
  'recliner-classic': { interactions: ['sit', 'nap', 'reclineBack'], blurb: 'Choose Recline to lean right back.' },
  'recliner-leather-power': { interactions: ['sit', 'nap', 'reclineBack'], blurb: 'Choose Recline to lean right back.' },
  'sofa-bed-convertible': { interactions: ['sit', 'nap', 'sleep'], slots: [SOFA_BED_SLOT], tags: ['bed'], blurb: 'It sleeps one along its length.' },
  microwave: { interactions: ['microwaveMeal'], blurb: 'Microwave a Meal for a quick hot bite.' },
  'microwave-steel': { interactions: ['microwaveMeal'], blurb: 'Microwave a Meal for a quick hot bite.' },
  'microwave-retro': { interactions: ['microwaveMeal'], blurb: 'Microwave a Meal for a quick hot bite.' },
  'washing-machine': { interactions: ['doLaundry'], blurb: LAUNDRY_BLURB },
  'tumble-dryer': { interactions: ['doLaundry'], blurb: LAUNDRY_BLURB },
  'washer-front-steel': { interactions: ['doLaundry'], blurb: LAUNDRY_BLURB },
  'washer-top-load': { interactions: ['doLaundry'], blurb: LAUNDRY_BLURB },
  'dryer-vented-black': { interactions: ['doLaundry'], blurb: LAUNDRY_BLURB },
  'washer-dryer-stack': { interactions: ['doLaundry'], blurb: LAUNDRY_BLURB },
  'parasol-standing': { shelter: 1, tags: ['shade'], blurb: 'Its shade keeps the rain off: people under it count as sheltered.' },
  'table-patio': { shelter: 1, tags: ['shade'] },
  'garden-arbour': { shelter: 1, tags: ['shade'] },
};

/** Applies the table to the catalog (a new array; definitions without a patch are returned as they are). */
export function applyFurnishingUse(defs: ObjectDef[]): ObjectDef[] {
  return defs.map((d) => {
    const p = PATCHES[d.id];
    if (!p) return d;
    const out: ObjectDef = { ...d };
    if (p.interactions) { out.interactions = p.interactions; out.functional = true; }
    if (p.use) out.slots = [...d.slots, { id: 'use', kind: 'use', pos: [d.footprint.w / 2, d.footprint.d + 0.2], height: 0, facing: Math.PI, approach: [Math.floor(d.footprint.w / 2), d.footprint.d], posture: 'standing' }];
    if (p.slots) out.slots = [...d.slots, ...p.slots];
    if (p.tags) out.tags = [...d.tags, ...p.tags.filter((t) => !d.tags.includes(t))];
    if (p.shelter !== undefined) out.shelter = p.shelter;
    if (p.blurb !== undefined) out.description = DECOR_REMARK.test(d.description) ? d.description.replace(DECOR_REMARK, ` ${p.blurb}`) : `${d.description} ${p.blurb}`;
    return out;
  });
}

/** A pot thrown on the wheel: placed by the interaction, never sold in the catalog (status 'dev'). */
export const HANDMADE_POT: ObjectDef = {
  id: 'pot-handmade', name: 'Handmade Pot', category: 'decor', subcategory: 'vase', rooms: ['living', 'study', 'bedroom', 'kitchen', 'outdoor'], style: 'rustic',
  description: 'A pot you threw yourself, a little uneven and all the better for it. Place it anywhere, or sell it for what it is worth.',
  tags: ['pottery', 'decor', 'vase', 'handmade'], packs: ['creative-studio'], tier: 'budget', price: dollars(20), quality: 2, functional: false,
  model: { asset: 'proc:pot', scale: 1, offset: [0, 0, 0], yaw: 0 },
  footprint: { w: 1, d: 1 }, layer: 'floor', blocksMovement: true, height: 0.5,
  slots: [], interactions: [], stats: { environment: 2 }, finishes: [], status: 'dev',
};

/** Value of a pot at a Creativity level (what its placed object records as the price paid). */
export function potValue(creativityLevel: number): number {
  return dollars(15) + Math.max(1, Math.min(10, creativityLevel)) * dollars(5);
}
