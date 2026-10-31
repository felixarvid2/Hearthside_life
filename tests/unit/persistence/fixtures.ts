// Shared test fixtures: a small but complete WorldState, a matching ContentDB made of minimal stub definitions,
// and creator drafts. Stubs carry only the fields persistence reads (ids and palettes), cast to the full types.

import { IDBFactory } from 'fake-indexeddb';
import type { ContentDB, SurfaceDesign } from '../../../src/content/types';
import type { HouseholdDraft, PersonDraft } from '../../../src/core/drafts';
import { edgeKey, pairKey, relKey, tileKey, newId } from '../../../src/core/ids';
import { addHousehold, cloneState, createEmptyWorld } from '../../../src/core/state';
import type {
  ActionInstance, Appearance, Id, Lot, Outfit, Person, PlacedObject, Wall, Wardrobe, WorldState,
} from '../../../src/core/types';
import { OUTFIT_CATEGORIES } from '../../../src/core/types';

/** A fresh, isolated IndexedDB implementation. Pass as `factory` so tests never share storage. */
export function newFactory(): IDBFactory { return new IDBFactory(); }

// ---------------------------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------------------------

function table<T extends { id: string }>(...ids: string[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of ids) out[id] = { id } as unknown as T;
  return out;
}

function design(id: string, surface: 'wall' | 'floor', palettes: string[]): SurfaceDesign {
  return { id, surface, palettes: palettes.map((p) => ({ id: p, name: p, colors: ['#ffffff'] })) } as unknown as SurfaceDesign;
}

/** Content that defines every id the fixture world uses. */
export function makeContent(): ContentDB {
  const walls = [design('plain-paint', 'wall', ['warm-white', 'sage']), design('brick-classic', 'wall', ['red'])];
  const floors = [design('oak-planks', 'floor', ['natural', 'dark'])];
  const byId = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((d) => [d.id, d]));
  return {
    objects: table('sofa-tweed', 'table-dining-oak', 'tv-stand-low', 'tv-flatscreen', 'plant-potted', 'bed-double-oak'),
    openings: table('door-panel', 'window-sash'),
    wallDesigns: byId(walls),
    floorDesigns: byId(floors),
    interactions: table('sit', 'sleep', 'goHere', 'cookMeal'),
    socials: table('chat', 'joke'),
    traits: table('neat', 'shy', 'foodie', 'active'),
    aspirations: table('chef', 'scholar'),
    skills: table('cooking', 'logic'),
    careers: table('culinary'),
    moodlets: table('tastyMeal', 'wellRested'),
    recipes: table('pasta'),
    packs: table('base'),
    hair: table('short-crop', 'long-wave'),
    facialHair: table('stubble'),
    garments: table('tee-basic', 'jeans-straight', 'sneakers', 'pajama-set'),
    accessories: table('glasses-round'),
    patterns: table('stripes'),
    facePresets: table('face-soft'),
    bodyPresets: table('body-average'),
    browStyles: table('brow-natural'),
    voices: table('voice-mid'),
    faceParams: [], bodyParams: [], skinTones: [], hairColors: [], eyeColors: [], preferences: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------------------------

export function makeAppearance(overrides: { hairStyle?: string; facePreset?: string | null } = {}): Appearance {
  return {
    frame: 'a',
    skin: '#c08a6a',
    body: { height: 0.1, shoulders: -0.2 },
    bodyPresetId: 'body-average',
    face: {
      presetId: overrides.facePreset === undefined ? 'face-soft' : overrides.facePreset,
      params: { jaw: 0.3, nose: -0.1 },
      eyeColor: '#4a6a3a', browStyle: 'brow-natural', browColor: '#3a2a20',
      freckles: 0.2, blush: 0.1, lipTint: 0.4, lipColor: '#b05a5a',
    },
    hair: { styleId: overrides.hairStyle ?? 'short-crop', color: '#3a2a20', highlight: null, facialHairId: 'stubble' },
  };
}

function outfit(id: string, name: string, category: string): Outfit {
  return {
    id, name,
    layers: category === 'sleep'
      ? { full: { garmentId: 'pajama-set', color: '#8899cc', pattern: 'stripes', patternColor: '#ffffff' } }
      : {
        top: { garmentId: 'tee-basic', color: '#d06040', pattern: 'solid', patternColor: '#ffffff' },
        bottom: { garmentId: 'jeans-straight', color: '#304060', pattern: 'solid', patternColor: '#ffffff' },
        shoes: { garmentId: 'sneakers', color: '#eeeeee', pattern: 'solid', patternColor: '#ffffff' },
      },
    accessories: category === 'everyday' ? [{ accessoryId: 'glasses-round', color: '#222222' }] : [],
  };
}

export function makeWardrobe(prefix = 'out'): Wardrobe {
  const outfits = {} as Wardrobe['outfits'];
  for (const cat of OUTFIT_CATEGORIES) outfits[cat] = [outfit(`${prefix}_${cat}_1`, `${cat} one`, cat)];
  return { outfits, current: { category: 'everyday', index: 0 } };
}

export function makePersonDraft(firstName = 'Robin'): PersonDraft {
  return {
    firstName, lastName: 'Finch', pronouns: { subject: 'they', object: 'them', possessive: 'their' }, lifeStage: 'adult',
    bio: 'Likes soup.', voice: { preset: 'voice-mid', pitch: 0.1 }, walkStyle: 'relaxed',
    romance: { interestedIn: ['any'], open: true },
    appearance: makeAppearance(), outfits: makeWardrobe(), traits: ['neat', 'shy', 'foodie'],
    likes: ['music:jazz'], dislikes: ['activity:jogging'], aspirationId: 'chef', careerId: null,
  };
}

export function makeHouseholdDraft(): HouseholdDraft {
  return {
    name: 'The Finches',
    members: [makePersonDraft('Robin'), makePersonDraft('Sam')],
    ties: [{ a: 0, b: 1, tie: 'roommate' }],
  };
}

function makePerson(state: WorldState, householdId: Id, lotId: Id, firstName: string): Person {
  const id = newId(state, 'per');
  const d = makePersonDraft(firstName);
  return {
    id, householdId, firstName, lastName: d.lastName, pronouns: d.pronouns, lifeStage: 'adult', bio: d.bio,
    voice: d.voice, walkStyle: d.walkStyle, romance: d.romance, appearance: d.appearance, outfits: makeWardrobe(id),
    traits: d.traits, likes: d.likes, dislikes: d.dislikes,
    aspiration: { aspirationId: 'chef', stage: 0, progress: { cook: 2 }, completedStages: 0, rewards: [] },
    needs: { hunger: 70, energy: 55.5, hygiene: 80, bladder: 90, fun: 40, social: 60 },
    moodlets: [{ id: 'tastyMeal', value: 5, until: 600, source: 'dinner' }],
    skills: { cooking: { level: 2, xp: 48.25 } },
    career: {
      careerId: 'culinary', level: 1, performance: 12, joinedAt: 480, daysWorked: 3,
      shift: { occurrence: `shift:${id}:2`, status: 'upcoming', workedMinutes: 0, lateMinutes: 0 },
    },
    location: { kind: 'lot', lotId, level: 0, x: 5.5, z: 6.5, facing: 1.5707963267948966, posture: 'standing' },
    queue: [],
    memories: [{ id: newId(state, 'mem'), at: 500, kind: 'movedIn', text: 'Moved in.', importance: 3, count: 1 }],
    cooldowns: { grabSnack: 700 },
    anim: { id: 'idle', since: 480, loop: true },
    thought: null,
    createdAt: 480,
    isNpc: false,
  };
}

// ---------------------------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------------------------

function makeObject(state: WorldState, defId: string, x: number, z: number, extra: Partial<PlacedObject> = {}): PlacedObject {
  return {
    id: newId(state, 'obj'), defId, level: 0, x, z, rot: 1, finishes: { fabric: 'sage' }, purchasePrice: 45000,
    boughtAt: 480, ownerHouseholdId: null, condition: { dirt: 0.25, broken: false }, ...extra,
  };
}

function makeWall(level: number, dir: 'h' | 'v', x: number, z: number, designA = 'plain-paint', paletteA = 'warm-white'): Wall {
  const id = edgeKey(level, dir, x, z);
  return { id, level, dir, x, z, height: 2.8, sideA: { designId: designA, paletteId: paletteA }, sideB: { designId: 'brick-classic', paletteId: 'red' } };
}

/** A small complete world: one household of two, one furnished lot, relationships, schedule, items. */
export function makeWorld(): WorldState {
  const state = createEmptyWorld(1234, 'create');
  const lotId = newId(state, 'lot');
  const lot: Lot = {
    id: lotId, name: 'Finch Cottage', address: '1 Hearth Lane', kind: 'residential', width: 24, depth: 24, landValue: 6000000,
    ownerHouseholdId: null, entry: { x: 12, z: 23, level: 0 }, levels: 1, walls: {}, floors: {}, openings: {}, objects: {}, ground: 'grass',
  };
  state.lots[lotId] = lot;
  for (const w of [makeWall(0, 'h', 4, 4), makeWall(0, 'h', 5, 4), makeWall(0, 'v', 4, 4, 'plain-paint', 'sage')]) lot.walls[w.id] = w;
  for (let x = 4; x < 7; x++) lot.floors[tileKey(0, x, 5)] = { designId: 'oak-planks', paletteId: 'natural' };
  const openingId = newId(state, 'opn');
  lot.openings[openingId] = { id: openingId, defId: 'door-panel', wallId: edgeKey(0, 'h', 5, 4), flip: false, purchasePrice: 12000 };
  const stand = makeObject(state, 'tv-stand-low', 8, 8);
  const tv = makeObject(state, 'tv-flatscreen', 8, 8, { supportId: stand.id });
  const sofa = makeObject(state, 'sofa-tweed', 6, 9);
  for (const o of [stand, tv, sofa]) lot.objects[o.id] = o;

  const hh = addHousehold(state, 'The Finches', 250000, lotId, true);
  lot.ownerHouseholdId = hh.id;
  const robin = makePerson(state, hh.id, lotId, 'Robin');
  const sam = makePerson(state, hh.id, lotId, 'Sam');
  for (const p of [robin, sam]) { state.people[p.id] = p; hh.memberIds.push(p.id); }
  hh.ledger.push({ id: newId(state, 'led'), at: 480, kind: 'start', amount: 250000, label: 'Starting funds' });
  hh.inventory.push({ object: makeObject(state, 'plant-potted', 0, 0), storedAt: 500 });

  const action: ActionInstance = {
    id: newId(state, 'act'), interactionId: 'sit', actorId: robin.id, source: 'player',
    target: { kind: 'object', objectId: sofa.id, slotId: 'seat-1' }, phase: 'route', phaseSince: 490,
    route: [{ x: 6.5, z: 9.5 }], elapsed: 0, duration: 30, replans: 0, failureReason: null,
    data: { note: 'fixture' }, cancelRequested: false, queuedAt: 489,
  };
  robin.queue.push(action);

  state.relationships[relKey(robin.id, sam.id)] = { from: robin.id, to: sam.id, familiarity: 40, friendship: 25, trust: 10, romance: 0, lastInteractionAt: 480, recent: { chat: 1 } };
  state.relationships[relKey(sam.id, robin.id)] = { from: sam.id, to: robin.id, familiarity: 40, friendship: 20, trust: 12, romance: 0, lastInteractionAt: 480, recent: {} };
  const [a, b] = robin.id < sam.id ? [robin.id, sam.id] : [sam.id, robin.id];
  state.bonds[pairKey(robin.id, sam.id)] = { a, b, status: 'friend', familyAtoB: 'roommate', since: 480 };
  state.processed[`pay:${robin.id}:1`] = 1000;
  state.schedule.push({ occurrence: `visit:${sam.id}:2`, at: 3000, kind: 'visitArrive', personId: sam.id });
  state.feed.push({ id: newId(state, 'feed'), at: 480, kind: 'info', text: 'Welcome home.' });
  const mealId = newId(state, 'itm');
  state.items[mealId] = {
    id: mealId, kind: 'meal', lotId, position: { x: 6, z: 9, level: 0, onObjectId: sofa.id }, recipeId: 'pasta', portions: 2,
    quality: 0.8, createdAt: 600, spoilsAt: 900, ownerHouseholdId: hh.id,
  };
  state.activeHouseholdId = hh.id;
  state.activeLotId = lotId;
  state.clock.minutes = 1234.25;
  state.clock.ticks = 4937;
  return state;
}

/** Deep copy so a test can compare against the world as it was before the code under test ran. */
export function snapshot(state: WorldState): WorldState { return cloneState(state); }

/** A fixed clock that advances one minute per reading, starting at 2030-01-01T12:00:00Z. */
export function steppingClock(startIso = '2030-01-01T12:00:00.000Z'): () => Date {
  let t = Date.parse(startIso);
  return () => { const d = new Date(t); t += 60_000; return d; };
}
