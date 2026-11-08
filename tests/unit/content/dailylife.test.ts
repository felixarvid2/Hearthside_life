// Cleaning and repairs work by tags: any object with the right tags gets the chores, nothing has to be listed.

import { describe, expect, it } from 'vitest';
import {
  CALL_REPAIR_INTERACTION, CLEAN_INTERACTION, REPAIR_INTERACTION, SERVICE_INTERACTION, capabilityInteractions, isCleanable, isDishStation,
  isRepairable, offeredInteractionIds,
} from '../../../src/content/capabilities';
import { content } from '../../../src/content/index';
import { validateContent } from '../../../src/content/validate';

const db = content();
const objects = Object.values(db.objects);

describe('tag capabilities', () => {
  it('a future dishwasher, trash can or washing machine only needs the tags', () => {
    expect(capabilityInteractions({ tags: ['dishwasher', 'dishes', 'appliance', 'plumbing', 'cleanable'], functional: true }))
      .toEqual([CLEAN_INTERACTION, REPAIR_INTERACTION, SERVICE_INTERACTION, CALL_REPAIR_INTERACTION]);
    expect(isDishStation({ tags: ['dishes'], functional: true })).toBe(true);
    expect(capabilityInteractions({ tags: ['bin', 'cleanable'], functional: true })).toEqual([CLEAN_INTERACTION]);
    expect(capabilityInteractions({ tags: ['washer', 'appliance'], functional: true })).toEqual([REPAIR_INTERACTION, SERVICE_INTERACTION, CALL_REPAIR_INTERACTION]);
    // decorative objects never offer chores
    expect(capabilityInteractions({ tags: ['appliance', 'cleanable'], functional: false })).toEqual([]);
    expect(offeredInteractionIds({ tags: ['cleanable'], functional: true, interactions: ['sit', CLEAN_INTERACTION] })).toEqual(['sit', CLEAN_INTERACTION]);
  });

  it('every capability interaction exists, is ready and is an object interaction', () => {
    for (const id of [CLEAN_INTERACTION, REPAIR_INTERACTION, SERVICE_INTERACTION, CALL_REPAIR_INTERACTION]) {
      expect(db.interactions[id]?.status, id).toBe('ready');
      expect(db.interactions[id]?.kind, id).toBe('object');
    }
    for (const id of ['washDishes', 'mopFloor']) expect(db.interactions[id]!.kind).toBe('item');
    expect(db.interactions.eatMeal!.itemKinds).toEqual(['meal', 'fish']); // fish portions are eaten like meals (M11)
    expect(db.interactions.washDishes!.itemKinds).toEqual(['dishes']);
    expect(db.interactions.mopFloor!.itemKinds).toEqual(['mess']);
  });

  it('the existing furniture is tagged: plumbing, appliances, electronics, sinks and surfaces that get dirty', () => {
    const ids = (pred: (o: (typeof objects)[number]) => boolean) => objects.filter(pred).map((o) => o.id);
    expect(ids((o) => o.tags.includes('toilet'))).toEqual(expect.arrayContaining(['toilet-basic', 'toilet-square']));
    for (const o of objects.filter((x) => ['toilet', 'shower', 'bath'].some((t) => x.tags.includes(t)))) {
      expect(isRepairable(o), o.id).toBe(true);
      expect(isCleanable(o), o.id).toBe(true);
    }
    for (const id of ['counter-sink', 'bathroom-sink', 'vanity-basin']) {
      expect(isDishStation(db.objects[id]!), id).toBe(true);
      expect(isRepairable(db.objects[id]!), id).toBe(true);
    }
    for (const id of ['stove-basic', 'stove-electric', 'fridge-standard', 'tv-flatscreen', 'computer-desktop', 'radio-retro', 'speaker-tower']) {
      expect(isRepairable(db.objects[id]!), id).toBe(true);
    }
    for (const id of ['stove-basic', 'counter-basic', 'table-dining-oak', 'bed-double-oak', 'toilet-basic']) expect(isCleanable(db.objects[id]!), id).toBe(true);
    // decor stays chore-free
    for (const id of ['trash-can', 'lamp-floor-round', 'rug-rectangle']) expect(capabilityInteractions(db.objects[id]!), id).toEqual([]);
    // Milestone 13: the microwave and washer now work (they have interactions), so they wear out and can be repaired like any appliance
    for (const id of ['microwave', 'washing-machine']) expect(isRepairable(db.objects[id]!), id).toBe(true);
  });

  it('bookcases offer skill books and every chore interaction carries an autonomy tag the traits can use', () => {
    for (const id of ['bookcase-open', 'bookcase-low', 'bookcase-tall']) expect(db.objects[id]!.interactions).toContain('readSkillBook');
    const tags = (id: string) => db.interactions[id]!.autonomy.tags;
    for (const id of [CLEAN_INTERACTION, 'washDishes', 'mopFloor', 'tidyUp']) expect(tags(id)).toContain('cleaning');
    for (const id of [REPAIR_INTERACTION, SERVICE_INTERACTION]) expect(tags(id)).toContain('repair');
    expect(db.traits.neat!.effects.autonomyBias!.cleaning).toBeGreaterThan(1);
    expect(db.traits.messy!.effects.autonomyBias!.cleaning).toBeLessThan(1);
  });

  it('has the home moodlets and validates clean', () => {
    for (const id of ['dirtyKitchen', 'dirtyBathroom', 'messyFloors', 'brokenThings', 'freshHome', 'accident', 'shocked', 'fixedIt']) expect(db.moodlets[id], id).toBeDefined();
    expect(db.moodlets.dirtyKitchen!.name).toBe('Dirty Kitchen');
    expect(db.moodlets.freshHome!.name).toBe('Fresh and Clean Home');
    const v = validateContent(db);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('validation rejects a chore capability whose interaction is missing', () => {
    const broken = { ...db, interactions: { ...db.interactions } };
    delete broken.interactions[REPAIR_INTERACTION];
    expect(validateContent(broken).errors.some((e) => e.includes(`needs interaction '${REPAIR_INTERACTION}'`))).toBe(true);
  });
});
