// Milestone 7 lot layouts: the six public venues and the six homes. Every layout is built on an empty lot from the real
// content, must be deterministic, fully usable (lotProblems), furnished with what its activities need, and robust against a
// different entry tile or a bigger lot.

import { describe, expect, it } from 'vitest';
import { offeredInteractionIds } from '../../../src/content/capabilities';
import { content } from '../../../src/content/index';
import { validateContent } from '../../../src/content/validate';
import type { ContentDB } from '../../../src/content/types';
import { tileKey } from '../../../src/core/ids';
import { createEmptyWorld } from '../../../src/core/state';
import type { Lot, PlacedObject, WorldState } from '../../../src/core/types';
import { createLot } from '../../../src/world/lots';
import { LotNav } from '../../../src/world/nav';
import { computeRooms } from '../../../src/world/rooms';
import { buildNavGrid, reachableMask } from '../../../src/world/navgrid';
import { buildResidentialLot, buildVenueLot, lotProblems, RESIDENTIAL_VARIANTS, type VenueType } from '../../../src/world/venues';

const db: ContentDB = content();

const VENUES: Array<{ type: VenueType; size: number }> = [
  { type: 'park', size: 32 }, { type: 'cafe', size: 24 }, { type: 'gym', size: 24 }, { type: 'library', size: 24 }, { type: 'arts', size: 32 }, { type: 'market', size: 32 },
];

function venueLot(type: VenueType, size: number, entry?: { x: number; z: number }): { state: WorldState; lot: Lot } {
  const state = createEmptyWorld(7, 'create');
  const lot = createLot(state, {
    name: type, address: '1 Test Street', width: size, depth: size, kind: 'venue', venueType: type, landValue: 100000,
    entry: { x: entry?.x ?? size / 2, z: entry?.z ?? size - 1, level: 0 },
  });
  buildVenueLot(state, db, lot.id, type);
  return { state, lot };
}

function homeLot(variant: number, size = 24): { state: WorldState; lot: Lot } {
  const state = createEmptyWorld(7, 'create');
  const lot = createLot(state, { name: 'home', address: '2 Test Street', width: size, depth: size, kind: 'residential', landValue: 100000, entry: { x: size / 2, z: size - 1, level: 0 } });
  buildResidentialLot(state, db, lot.id, variant);
  return { state, lot };
}

const count = (lot: Lot, defId: string) => Object.values(lot.objects).filter((o) => o.defId === defId).length;
const interactionsOf = (lot: Lot): Set<string> => {
  const out = new Set<string>();
  for (const o of Object.values(lot.objects)) for (const i of offeredInteractionIds(db.objects[o.defId]!)) out.add(i);
  return out;
};
const signature = (lot: Lot) => Object.values(lot.objects).map((o) => `${o.defId}@${o.x},${o.z}r${o.rot}`).sort().join('|');

describe.each(VENUES)('$type venue lot', ({ type, size }) => {
  const { state, lot } = venueLot(type, size);

  it('builds a usable lot: every door, slot and approach tile reachable, nothing sealed off', () => {
    expect(lotProblems(state, db, lot.id)).toEqual([]);
    expect(Object.keys(lot.objects).length).toBeGreaterThan(30);
  });

  it('is deterministic: the same empty lot builds the same venue', () => {
    const again = venueLot(type, size);
    expect(JSON.stringify(again.lot)).toBe(JSON.stringify(lot));
    expect(again.state.nextId).toBe(state.nextId);
  });

  it('every object is a ready design and every offered interaction exists', () => {
    for (const o of Object.values(lot.objects)) {
      const def = db.objects[o.defId];
      expect(def?.status, o.defId).toBe('ready');
      for (const id of offeredInteractionIds(def!)) expect(db.interactions[id]?.status, `${o.defId}/${id}`).toBe('ready');
    }
  });

  it('puts every object slot on a reachable tile and keeps the lot entry free', () => {
    const nav = new LotNav(() => state, db);
    const entry = { x: lot.entry.x, z: lot.entry.z };
    expect(nav.isWalkable(lot.id, 0, entry.x, entry.z)).toBe(true);
    for (const o of Object.values(lot.objects)) {
      const def = db.objects[o.defId]!;
      expect(nav.slotsOf(lot.id, o.id), `${o.defId} at ${o.x},${o.z}`).toHaveLength(def.slots.length);
      for (const s of nav.slotsOf(lot.id, o.id)) expect(nav.findPath(lot.id, 0, entry, [s.approach]), `${o.defId} ${s.slotId}`).not.toBeNull();
    }
  });

  it('survives a different entry tile and a bigger lot', () => {
    const e = venueLot(type, size, { x: 3, z: size - 1 });
    expect(lotProblems(e.state, db, e.lot.id)).toEqual([]);
    const big = venueLot(type, size + 8);
    expect(lotProblems(big.state, db, big.lot.id)).toEqual([]);
    expect(Object.keys(big.lot.objects)).toHaveLength(Object.keys(lot.objects).length);
  });

  it('refuses a lot that is too small or not empty', () => {
    const state2 = createEmptyWorld(7, 'create');
    const small = createLot(state2, { name: 's', address: '1', width: size - 4, depth: size - 4, kind: 'venue', venueType: type, landValue: 1, entry: { x: 2, z: size - 5, level: 0 } });
    expect(() => buildVenueLot(state2, db, small.id, type)).toThrow(/at least/);
    expect(() => buildVenueLot(state, db, lot.id, type)).toThrow(/not empty/);
  });

  it('has paved or lawn surfaces and a connected walkway from the entry to the first door or plaza', () => {
    const g = buildNavGrid(lot, db, 0);
    const mask = reachableMask(g, { x: lot.entry.x, z: lot.entry.z });
    let reachable = 0;
    for (const v of mask) reachable += v;
    expect(reachable).toBeGreaterThan(size * size * 0.3);
    expect(lot.floors[tileKey(0, lot.entry.x, lot.entry.z)]).toBeDefined();
  });
});

describe('what each venue offers', () => {
  const lots = Object.fromEntries(VENUES.map((v) => [v.type, venueLot(v.type, v.size).lot])) as Record<VenueType, Lot>;

  it('cafe: counter, coffee machine, tables and chairs, restroom, terrace', () => {
    const lot = lots.cafe;
    expect(count(lot, 'service-counter')).toBeGreaterThanOrEqual(3);
    expect(count(lot, 'coffee-machine')).toBeGreaterThanOrEqual(1);
    expect(count(lot, 'table-dining-oak')).toBeGreaterThanOrEqual(6);
    expect(count(lot, 'chair-dining-oak')).toBeGreaterThanOrEqual(20);
    expect(count(lot, 'table-patio')).toBeGreaterThanOrEqual(2);
    expect(count(lot, 'toilet-basic')).toBeGreaterThanOrEqual(1);
    for (const i of ['buyCoffee', 'buyPastry', 'buySandwich', 'makeCoffee', 'sit']) expect(interactionsOf(lot).has(i), i).toBe(true);
  });

  it('gym: treadmills, weight benches, showers and a restroom', () => {
    const lot = lots.gym;
    expect(count(lot, 'treadmill')).toBeGreaterThanOrEqual(4);
    expect(count(lot, 'weight-bench')).toBeGreaterThanOrEqual(5);
    expect(count(lot, 'shower-stall')).toBeGreaterThanOrEqual(3);
    expect(count(lot, 'toilet-basic')).toBeGreaterThanOrEqual(2);
    expect(count(lot, 'vending-machine')).toBeGreaterThanOrEqual(1);
    for (const i of ['workOut', 'liftWeights', 'takeShower', 'useToilet', 'buyVendingDrink']) expect(interactionsOf(lot).has(i), i).toBe(true);
  });

  it('library: shelves, study desks with chairs, computers and a reading nook', () => {
    const lot = lots.library;
    expect(count(lot, 'bookcase-tall') + count(lot, 'bookcase-wide')).toBeGreaterThanOrEqual(20);
    expect(count(lot, 'study-notes')).toBeGreaterThanOrEqual(12);
    expect(count(lot, 'chair-desk')).toBeGreaterThanOrEqual(12);
    expect(count(lot, 'computer-desktop')).toBeGreaterThanOrEqual(1);
    for (const i of ['readBook', 'readSkillBook', 'studyHard', 'writeJournal', 'sit']) expect(interactionsOf(lot).has(i), i).toBe(true);
  });

  it('arts centre: easels, two pianos, audience chairs', () => {
    const lot = lots.arts;
    expect(count(lot, 'easel-studio')).toBeGreaterThanOrEqual(6);
    expect(count(lot, 'piano-upright')).toBe(2);
    expect(count(lot, 'chair-dining-cushion')).toBeGreaterThanOrEqual(12);
    for (const i of ['paintCanvas', 'paintToSell', 'playPiano', 'busk']) expect(interactionsOf(lot).has(i), i).toBe(true);
  });

  it('market: produce stalls, deli counter, vending machine, fountain', () => {
    const lot = lots.market;
    expect(count(lot, 'produce-stand')).toBeGreaterThanOrEqual(6);
    expect(count(lot, 'service-counter')).toBeGreaterThanOrEqual(2);
    expect(count(lot, 'vending-machine')).toBeGreaterThanOrEqual(1);
    expect(count(lot, 'fountain-park')).toBe(1);
    for (const i of ['buyProduce', 'buyGroceries', 'buyCoffee', 'buyVendingSnack']) expect(interactionsOf(lot).has(i), i).toBe(true);
  });

  it('park: benches, picnic tables, grills, chess, playground, fountain, trees, a jogging track and a fenced playground', () => {
    const lot = lots.park;
    expect(lot.ground).toBe('grass');
    expect(count(lot, 'bench-garden')).toBeGreaterThanOrEqual(8);
    expect(count(lot, 'table-patio')).toBeGreaterThanOrEqual(2);
    expect(count(lot, 'grill-kettle')).toBeGreaterThanOrEqual(2);
    expect(count(lot, 'table-chess')).toBeGreaterThanOrEqual(2);
    expect(count(lot, 'playground-slide')).toBe(1);
    expect(count(lot, 'swing-set')).toBe(1);
    expect(count(lot, 'fountain-park')).toBe(1);
    expect(count(lot, 'tree-park')).toBeGreaterThanOrEqual(15);
    expect(count(lot, 'chair-adirondack')).toBeGreaterThanOrEqual(3);
    for (const i of ['sit', 'watchClouds', 'havePicnic', 'grillFood', 'playChess', 'playOnSlide', 'swing', 'buyCoffee', 'waterPlant']) expect(interactionsOf(lot).has(i), i).toBe(true);
    const track = Object.values(lot.floors).filter((f) => f.designId === 'brick-paving').length;
    expect(track).toBeGreaterThanOrEqual(180);
    // the playground fence is a low wall with a gap: it is a closed room except through the gate
    const fence = Object.values(lot.walls);
    expect(fence.length).toBeGreaterThan(20);
    expect(fence.every((w) => w.height < 1.5)).toBe(true);
    expect(computeRooms(lot, 0).filter((r) => !r.outdoor)).toHaveLength(0);
  });
});

describe('residential lots', () => {
  it('offers at least four distinct, differently planned homes and wraps around', () => {
    expect(RESIDENTIAL_VARIANTS.length).toBeGreaterThanOrEqual(4);
    const built = RESIDENTIAL_VARIANTS.map((_, i) => homeLot(i).lot);
    const sigs = new Set(built.map(signature));
    expect(sigs.size).toBe(built.length);
    const plans = new Set(built.map((l) => Object.keys(l.walls).sort().join(',')));
    expect(plans.size).toBe(built.length);
    const finishes = new Set(built.map((l) => [...new Set(Object.values(l.floors).map((f) => f.designId))].sort().join(',')));
    expect(finishes.size).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(homeLot(RESIDENTIAL_VARIANTS.length).lot)).toBe(JSON.stringify(built[0]));
    expect(JSON.stringify(homeLot(-1).lot)).toBe(JSON.stringify(built[built.length - 1]));
  });

  describe.each(RESIDENTIAL_VARIANTS.map((v, i) => ({ ...v, i })))('home $i: $name', ({ i, sleeps, beds, bedrooms }) => {
    const { state, lot } = homeLot(i);
    const objs = Object.values(lot.objects) as PlacedObject[];
    const sleepSlots = objs.reduce((n, o) => n + db.objects[o.defId]!.slots.filter((s) => s.kind === 'sleep').length, 0);

    it('is usable and deterministic', () => {
      expect(lotProblems(state, db, lot.id)).toEqual([]);
      expect(JSON.stringify(homeLot(i).lot)).toBe(JSON.stringify(lot));
    });

    it('has a bed for everyone, a kitchen, a bathroom and somewhere to sit', () => {
      expect(sleepSlots).toBeGreaterThanOrEqual(sleeps);
      expect(objs.filter((o) => db.objects[o.defId]!.slots.some((s) => s.kind === 'sleep')).length).toBeGreaterThanOrEqual(beds);
      expect(count(lot, 'fridge-standard') + count(lot, 'fridge-compact') + count(lot, 'fridge-built-in') + count(lot, 'fridge-side-by-side')).toBeGreaterThanOrEqual(1);
      expect(count(lot, 'stove-basic') + count(lot, 'stove-electric')).toBeGreaterThanOrEqual(1);
      expect(count(lot, 'counter-sink')).toBeGreaterThanOrEqual(1);
      expect(count(lot, 'toilet-basic') + count(lot, 'toilet-square')).toBeGreaterThanOrEqual(1);
      expect(count(lot, 'shower-stall') + count(lot, 'shower-round') + count(lot, 'bathtub')).toBeGreaterThanOrEqual(1);
      expect(count(lot, 'bathroom-sink') + count(lot, 'vanity-basin')).toBeGreaterThanOrEqual(1);
      expect(objs.some((o) => db.objects[o.defId]!.interactions.includes('sit'))).toBe(true);
      expect(count(lot, 'tv-flatscreen')).toBeGreaterThanOrEqual(1);
      expect(computeRooms(lot, 0).filter((r) => !r.outdoor).length).toBeGreaterThanOrEqual(bedrooms + 1);
    });

    it('has doors and windows, a paved path to the front door and varied finishes', () => {
      const openings = Object.values(lot.openings).map((o) => db.openings[o.defId]!);
      expect(openings.filter((o) => o.kind === 'door').length).toBeGreaterThanOrEqual(2);
      expect(openings.filter((o) => o.kind === 'window').length).toBeGreaterThanOrEqual(6);
      expect(lot.floors[tileKey(0, lot.entry.x, lot.entry.z)]).toBeDefined();
      const wallDesigns = new Set(Object.values(lot.walls).flatMap((w) => [w.sideA.designId, w.sideB.designId]));
      expect(wallDesigns.size).toBeGreaterThanOrEqual(2);
    });

    it('works with another entry tile and on a bigger lot', () => {
      const s = createEmptyWorld(7, 'create');
      const l = createLot(s, { name: 'h', address: '3', width: 24, depth: 24, kind: 'residential', landValue: 1, entry: { x: 6, z: 23, level: 0 } });
      buildResidentialLot(s, db, l.id, i);
      expect(lotProblems(s, db, l.id)).toEqual([]);
      const big = homeLot(i, 32);
      expect(lotProblems(big.state, db, big.lot.id)).toEqual([]);
    });
  });

  it('refuses small or occupied lots', () => {
    const state = createEmptyWorld(7, 'create');
    const small = createLot(state, { name: 's', address: '1', width: 16, depth: 16, kind: 'residential', landValue: 1, entry: { x: 8, z: 15, level: 0 } });
    expect(() => buildResidentialLot(state, db, small.id, 0)).toThrow(/at least 24/);
    const { state: s2, lot } = homeLot(0);
    expect(() => buildResidentialLot(s2, db, lot.id, 1)).toThrow(/not empty/);
  });
});

describe('venue furniture designs', () => {
  const NEW = ['tree-park', 'shrub-round', 'fountain-park', 'playground-slide', 'swing-set', 'service-counter', 'produce-stand', 'vending-machine', 'study-notes', 'locker-bank'];
  it('are ready, distinct designs with their own original model', () => {
    for (const id of NEW) expect(db.objects[id]?.status, id).toBe('ready');
    expect(new Set(NEW.map((id) => db.objects[id]!.model.asset)).size).toBe(NEW.length);
  });
  it('functional ones offer activities with an autonomy tag and a priced purchase', () => {
    for (const id of ['service-counter', 'produce-stand', 'vending-machine']) {
      const def = db.objects[id]!;
      for (const i of def.interactions) expect(db.interactions[i]!.cost, `${id}/${i}`).toBeGreaterThan(0);
    }
  });
});

describe('venue-restricted interactions', () => {
  it('only name known places, and content validation rejects an unknown one', () => {
    expect(validateContent(db).errors).toEqual([]);
    const restricted = Object.values(db.interactions).filter((i) => i.venues);
    expect(restricted.map((i) => i.id).sort()).toEqual(['danceSolo', 'goForJog', 'havePicnic', 'playComputerGames']);
    const broken = { ...db, interactions: { ...db.interactions, goForJog: { ...db.interactions.goForJog!, venues: ['moon'] } } };
    expect(validateContent(broken).errors.join('\n')).toMatch(/unknown place 'moon'/);
  });
});
