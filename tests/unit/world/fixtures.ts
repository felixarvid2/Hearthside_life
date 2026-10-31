// Test fixture content: the Milestone 1 shared object ids with the footprints from docs/ARCHITECTURE.md and
// plausible slot shapes, plus the M1 wall/floor designs and openings. Chairs and similar seats use the
// "approach from the front" convention on purpose: at a table that tile is the table itself, which
// exercises the access fallback in world/slots.ts.

import type { ContentDB, ObjectDef, ObjectSlot, OpeningDef, SurfaceDesign } from '../../../src/content/types';
import { addHousehold, createEmptyWorld } from '../../../src/core/state';
import type { Household, Lot, PlacedObject, Rot, StartMode, WorldState } from '../../../src/core/types';
import { createLot } from '../../../src/world/lots';
import { makePlacedObject } from '../../../src/world/objects';

const PI = Math.PI;

function titleCase(id: string): string {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function def(id: string, w: number, d: number, layer: ObjectDef['layer'], extra: Partial<ObjectDef> = {}): ObjectDef {
  return {
    id, name: titleCase(id), description: `${titleCase(id)} (test fixture).`, category: 'decor', rooms: [], style: 'test',
    tags: [], packs: ['base'], tier: 'standard', price: 10000, quality: 3, functional: true,
    model: { asset: id, scale: 2, offset: [0, 0, 0], yaw: 0 }, footprint: { w, d }, layer,
    blocksMovement: layer === 'floor', height: 1, slots: [], interactions: [], stats: {},
    finishes: [{ id: 'wood', label: 'Wood', materials: ['wood'], swatches: [
      { id: 'oak', name: 'Oak', color: '#a0703f' }, { id: 'walnut', name: 'Walnut', color: '#5b3a22' },
    ] }],
    status: 'ready',
    ...extra,
  };
}

const use = (id = 'use', approach: [number, number] = [0, 1], pos: [number, number] = [0.5, 0.9]): ObjectSlot =>
  ({ id, kind: 'use', pos, height: 0, facing: PI, approach, posture: 'standing' });
const sit = (id = 'seat', pos: [number, number] = [0.5, 0.5], approach: [number, number] = [0, 1]): ObjectSlot =>
  ({ id, kind: 'sit', pos, height: 0.45, facing: 0, approach, posture: 'seated' });
const sleep = (id: string, pos: [number, number], approach: [number, number]): ObjectSlot =>
  ({ id, kind: 'sleep', pos, height: 0.55, facing: 0, approach, posture: 'lying' });

export const FIXTURE_OBJECTS: ObjectDef[] = [
  def('bed-double-oak', 2, 2, 'floor', { price: 90000, slots: [sleep('left', [0.5, 1.1], [-1, 1]), sleep('right', [1.5, 1.1], [2, 1])], interactions: ['sleep', 'nap'] }),
  def('bed-single-pine', 1, 2, 'floor', { price: 40000, slots: [sleep('sleep', [0.5, 1.1], [-1, 1])], interactions: ['sleep', 'nap'] }),
  def('fridge-standard', 1, 1, 'floor', { price: 80000, slots: [use()], interactions: ['grabSnack', 'cookMeal'] }),
  def('stove-basic', 1, 1, 'floor', { price: 50000, slots: [use()] }),
  def('counter-basic', 1, 1, 'floor', { price: 15000, surfaceHeight: 0.9 }),
  def('counter-sink', 1, 1, 'floor', { price: 25000, surfaceHeight: 0.9, slots: [use()], interactions: ['washHands'] }),
  def('table-dining-oak', 2, 1, 'floor', { price: 30000, surfaceHeight: 0.66 }),
  def('chair-dining-oak', 1, 1, 'floor', { price: 8000, slots: [sit()], interactions: ['sit'] }),
  def('sofa-tweed', 2, 1, 'floor', { price: 60000, slots: [sit('left', [0.5, 0.5], [0, 1]), sit('right', [1.5, 0.5], [1, 1])], interactions: ['sit', 'nap'] }),
  def('armchair-lounge', 1, 1, 'floor', { price: 30000, slots: [sit()], interactions: ['sit'] }),
  def('table-coffee', 1, 1, 'floor', { price: 9000, surfaceHeight: 0.4 }),
  def('tv-stand-low', 2, 1, 'floor', { price: 12000, surfaceHeight: 0.6 }),
  def('tv-flatscreen', 1, 1, 'surface', { price: 50000, blocksMovement: false, slots: [use('watch', [0, 1], [0.5, 1.5])], interactions: ['watchTv'] }),
  def('toilet-basic', 1, 1, 'floor', { price: 30000, slots: [sit()], interactions: ['useToilet'] }),
  def('shower-stall', 1, 1, 'floor', { price: 60000, slots: [use('use', [0, 1], [0.5, 0.5])], interactions: ['takeShower'] }),
  def('bathroom-sink', 1, 1, 'floor', { price: 20000, slots: [use()], interactions: ['washHands'] }),
  def('bathroom-mirror', 1, 1, 'wall', { price: 9000, needsWall: true, blocksMovement: false, slots: [use('use', [0, 0], [0.5, 0.6])], interactions: ['practiceSpeech'] }),
  def('bookcase-open', 1, 1, 'floor', { price: 25000, slots: [use()], interactions: ['readBook'] }),
  def('desk-oak', 2, 1, 'floor', { price: 25000, surfaceHeight: 0.76 }),
  def('chair-desk', 1, 1, 'floor', { price: 10000, slots: [sit()], interactions: ['sit'] }),
  def('computer-desktop', 1, 1, 'surface', { price: 90000, blocksMovement: false, slots: [use('use', [0, 1], [0.5, 1.2])], interactions: ['playComputerGames', 'practiceProgramming'] }),
  def('wardrobe-tall', 1, 1, 'floor', { price: 40000, slots: [use()], interactions: ['changeOutfit', 'editOutfits'] }),
  def('nightstand-oak', 1, 1, 'floor', { price: 8000, surfaceHeight: 0.6 }),
  def('lamp-floor-round', 1, 1, 'floor', { price: 7000 }),
  def('plant-potted', 1, 1, 'floor', { price: 5000, slots: [use()], interactions: ['waterPlant'] }),
  def('rug-rectangle', 3, 2, 'rug', { price: 12000, blocksMovement: false }),
  def('radio-retro', 1, 1, 'surface', { price: 6000, blocksMovement: false, slots: [use()], interactions: ['listenToMusic'] }),
  def('trash-can', 1, 1, 'floor', { price: 3000 }),
];

function opening(id: string, kind: OpeningDef['kind'], price: number): OpeningDef {
  return {
    id, kind, name: titleCase(id), description: '', tags: [], packs: ['base'], tier: 'standard', price, width: 1,
    height: kind === 'door' ? 2.1 : 1.2, sill: kind === 'door' ? 0 : 0.9, style: {}, status: 'ready',
  };
}

function design(id: string, surface: 'wall' | 'floor', price: number, palettes: number): SurfaceDesign {
  return {
    id, surface, name: titleCase(id), description: '', family: id, tags: [], packs: ['base'], tier: 'standard', price,
    painter: id, params: {}, repeat: 1,
    palettes: Array.from({ length: palettes }, (_, i) => ({ id: `${id}-p${i}`, name: `Palette ${i}`, colors: ['#ffffff', '#000000'] })),
    status: 'ready',
  };
}

const byId = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.id, x]));

/** A ContentDB with only the registries world/building need filled in. */
export function fixtureContent(): ContentDB {
  return {
    objects: byId(FIXTURE_OBJECTS),
    openings: byId([opening('door-panel', 'door', 30000), opening('door-glazed', 'door', 45000), opening('window-sash', 'window', 20000), opening('window-wide', 'window', 30000)]),
    wallDesigns: byId([design('plain-paint', 'wall', 200, 6), design('subway-tile', 'wall', 500, 3), design('stripes-regency', 'wall', 400, 2), design('brick-classic', 'wall', 600, 2)]),
    floorDesigns: byId([design('oak-planks', 'floor', 400, 3), design('checker-tile', 'floor', 300, 2), design('carpet-plush', 'floor', 350, 2), design('hex-mosaic', 'floor', 450, 2), design('stone-pavers', 'floor', 250, 1)]),
    interactions: {}, socials: {}, traits: {}, aspirations: {}, skills: {}, careers: {}, moodlets: {}, recipes: {}, packs: {},
    hair: {}, facialHair: {}, garments: {}, accessories: {}, patterns: {}, facePresets: {}, bodyPresets: {}, browStyles: {},
    voices: {}, faceParams: [], bodyParams: [], skinTones: [], hairColors: [], eyeColors: [], preferences: [],
  };
}

/** Inserts an object directly (no validation) and returns it. */
export function putObject(state: WorldState, content: ContentDB, lot: Lot, defId: string, x: number, z: number, rot: Rot = 0, extra: Partial<PlacedObject> = {}): PlacedObject {
  const d = content.objects[defId];
  if (!d) throw new Error(`fixture: unknown object ${defId}`);
  const obj = { ...makePlacedObject(state, d, { x, z, rot, level: 0 }, { ownerHouseholdId: lot.ownerHouseholdId }), ...extra };
  lot.objects[obj.id] = obj;
  return obj;
}

export interface TestWorld { state: WorldState; lot: Lot; hh: Household }

/** A world with one household owning an empty 24 x 24 lot whose entry is on the south edge. */
export function testWorld(o: { funds?: number; mode?: StartMode; size?: number } = {}): TestWorld {
  const state = createEmptyWorld(42, o.mode ?? 'create');
  const size = o.size ?? 24;
  const lot = createLot(state, { name: 'Test Lot', address: '1 Test Lane', width: size, depth: size, kind: 'residential', landValue: 1000000, entry: { x: Math.floor(size / 2), z: size - 1, level: 0 } });
  const hh = addHousehold(state, 'Testers', o.funds ?? 2000000, lot.id, true);
  lot.ownerHouseholdId = hh.id;
  state.activeHouseholdId = hh.id;
  state.activeLotId = lot.id;
  return { state, lot, hh };
}
