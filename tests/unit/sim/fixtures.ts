// Test fixtures for the simulation: a small content DB (independent of the real registries), a 16x12
// lot with a few walls and furniture, a simple grid NavProvider, and helpers to build worlds and run ticks.

import type {
  CareerDef, ContentDB, InteractionDef, MoodletDef, ObjectDef, ObjectSlot, RecipeDef, SkillDef, SocialDef, TraitDef,
  AspirationDef,
} from '../../../src/content/types';
import type { PersonDraft } from '../../../src/core/drafts';
import { EventBus } from '../../../src/core/events';
import type { GameEvent } from '../../../src/core/events';
import { footprintTiles, rotateCell, rotateFacing, rotateLocal } from '../../../src/core/geometry';
import { edgeKey, newId } from '../../../src/core/ids';
import type { NavProvider, Tile, WorldSlot } from '../../../src/core/nav';
import { addHousehold, createEmptyWorld } from '../../../src/core/state';
import { Rng } from '../../../src/core/rng';
import type {
  ActionInstance, Appearance, Id, Lot, Outfit, PersonLocation, PlacedObject, Rot, Wardrobe, WorldState,
} from '../../../src/core/types';
import type { SimCtx } from '../../../src/sim/context';
import { Reservations } from '../../../src/sim/reservations';
import { applyHouseholdTies, createPerson } from '../../../src/sim/people';
import { Simulation } from '../../../src/sim/simulation';

// ---------------------------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------------------------

function slot(id: string, kind: ObjectSlot['kind'], pos: [number, number], approach: [number, number], posture: ObjectSlot['posture'], facing = 0, height = 0.45): ObjectSlot {
  return { id, kind, pos, approach, posture, facing, height };
}

function obj(id: string, o: Partial<ObjectDef> & { footprint: { w: number; d: number } }): ObjectDef {
  return {
    id, name: id.replace(/-/g, ' '), description: id, category: 'decor', rooms: [], style: 'test', tags: [], packs: [], tier: 'standard',
    price: 10000, quality: 3, functional: true, model: { asset: id, scale: 2, offset: [0, 0, 0], yaw: 0 }, layer: 'floor',
    blocksMovement: true, height: 1, slots: [], interactions: [], stats: {}, finishes: [], status: 'ready', ...o,
  };
}

function inter(id: string, o: Partial<InteractionDef>): InteractionDef {
  return {
    id, name: id, description: id, icon: id, kind: 'object', slotKinds: [], anims: { perform: 'interact' }, posture: 'standing',
    duration: { kind: 'fixed', minutes: 10 }, needsPerHour: {}, needsOnComplete: {}, autonomy: { enabled: false, ads: {}, tags: [] },
    allowVisitors: false, status: 'ready', ...o,
  };
}

function social(id: string, category: SocialDef['category'], o: Partial<SocialDef>): SocialDef {
  return {
    id, name: id, description: id, icon: id, category, minutes: 6, anim: 'talk', requires: {}, acceptance: 0.7,
    targetTraits: {}, actorTraits: {},
    success: { actor: { friendship: 4 }, target: { friendship: 4 }, social: 12 },
    failure: { actor: { friendship: -2 }, target: { friendship: -3 }, social: 2 },
    lines: { success: ['{a} and {b} had a nice chat.'], failure: ['{b} was not in the mood for {a}.'] },
    topics: ['weather'], autonomy: { enabled: true, weight: 1 }, alsoActivity: false, status: 'ready', ...o,
  };
}

const THRESHOLDS = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

export function fixtureContent(): ContentDB {
  const objects: ObjectDef[] = [
    obj('bed-double-oak', { category: 'beds', footprint: { w: 2, d: 2 }, interactions: ['sleep', 'nap'], stats: { energy: 1.2, comfort: 7 },
      slots: [slot('left', 'sleep', [0.5, 1], [-1, 0], 'lying'), slot('right', 'sleep', [1.5, 1], [2, 0], 'lying')] }),
    obj('fridge-standard', { category: 'kitchen', footprint: { w: 1, d: 1 }, interactions: ['grabSnack', 'cookMeal'],
      slots: [slot('use', 'use', [0.5, 1.3], [0, 1], 'standing')] }),
    obj('stove-basic', { category: 'kitchen', tags: ['stove'], footprint: { w: 1, d: 1 }, stats: { cooking: 1 },
      slots: [slot('use', 'use', [0.5, 1.3], [0, 1], 'standing')] }),
    obj('counter-basic', { category: 'kitchen', footprint: { w: 1, d: 1 }, surfaceHeight: 0.9 }),
    obj('table-dining-oak', { category: 'tables', footprint: { w: 2, d: 1 }, surfaceHeight: 0.66 }),
    obj('chair-dining-oak', { category: 'seating', footprint: { w: 1, d: 1 }, interactions: ['sit'], stats: { comfort: 3 },
      slots: [slot('sit', 'sit', [0.5, 0.5], [0, -1], 'seated')] }),
    obj('sofa-tweed', { category: 'seating', footprint: { w: 2, d: 1 }, interactions: ['sit', 'nap'], stats: { comfort: 6 },
      slots: [slot('s0', 'sit', [0.5, 0.5], [0, 1], 'seated'), slot('s1', 'sit', [1.5, 0.5], [1, 1], 'seated')] }),
    obj('tv-stand-low', { category: 'tables', tags: ['tv-stand'], footprint: { w: 2, d: 1 }, surfaceHeight: 0.6 }),
    obj('tv-flatscreen', { category: 'electronics', footprint: { w: 1, d: 1 }, layer: 'surface', blocksMovement: false, interactions: ['watchTv'], stats: { fun: 1.2 },
      slots: [slot('use', 'use', [0.5, 1.4], [0, 1], 'standing')] }),
    obj('toilet-basic', { category: 'bathroom', footprint: { w: 1, d: 1 }, interactions: ['useToilet'],
      slots: [slot('sit', 'sit', [0.5, 0.5], [0, 1], 'seated')] }),
    obj('shower-stall', { category: 'bathroom', footprint: { w: 1, d: 1 }, interactions: ['takeShower'],
      slots: [slot('use', 'use', [0.5, 0.5], [0, 1], 'standing')] }),
    obj('bookcase-open', { category: 'storage', footprint: { w: 1, d: 1 }, interactions: ['readBook'],
      slots: [slot('use', 'use', [0.5, 1.3], [0, 1], 'standing')] }),
    obj('wardrobe-tall', { category: 'storage', footprint: { w: 1, d: 1 }, interactions: ['changeOutfit', 'editOutfits'],
      slots: [slot('use', 'use', [0.5, 1.3], [0, 1], 'standing')] }),
  ];
  const interactions: InteractionDef[] = [
    inter('sleep', { behavior: 'sleep', slotKinds: ['sleep'], posture: 'lying', anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
      duration: { kind: 'untilFull', need: 'energy', maxMinutes: 600 }, needsPerHour: { energy: 14 }, moodletOnComplete: 'wellRested',
      autonomy: { enabled: true, ads: { energy: 80 }, tags: ['rest'] } }),
    inter('nap', { behavior: 'rest', slotKinds: ['sleep', 'sit'], posture: 'lying', anims: { perform: 'sleep' }, duration: { kind: 'fixed', minutes: 90 },
      needsPerHour: { energy: 10 }, autonomy: { enabled: true, ads: { energy: 25 }, tags: ['rest'] } }),
    inter('sit', { behavior: 'sit', slotKinds: ['sit'], posture: 'seated', anims: { perform: 'sitIdle' }, duration: { kind: 'fixed', minutes: 30 },
      needsPerHour: { energy: 1, fun: 2 }, allowVisitors: true, autonomy: { enabled: true, ads: { fun: 6, energy: 4 }, tags: ['relax'] } }),
    inter('grabSnack', { behavior: 'snack', anims: { perform: 'openFridge' }, duration: { kind: 'fixed', minutes: 5 }, needsOnComplete: { hunger: 25 },
      cost: 300, autonomy: { enabled: true, ads: { hunger: 25 }, tags: ['food'] } }),
    inter('cookMeal', { behavior: 'cook', anims: { perform: 'cook' }, duration: { kind: 'fixed', minutes: 30 }, skill: { id: 'cooking', xpPerHour: 40 },
      autonomy: { enabled: true, ads: { hunger: 70 }, tags: ['food', 'cooking'] } }),
    inter('eatMeal', { behavior: 'eatMeal', kind: 'item', anims: { perform: 'eat' }, duration: { kind: 'fixed', minutes: 25 }, needsPerHour: { fun: 2 },
      moodletOnComplete: 'ateMeal', autonomy: { enabled: true, ads: { hunger: 60 }, tags: ['food'] } }),
    inter('useToilet', { behavior: 'toilet', slotKinds: ['sit'], posture: 'seated', anims: { perform: 'toilet' },
      duration: { kind: 'untilFull', need: 'bladder', maxMinutes: 15 }, needsPerHour: { bladder: 600 }, autonomy: { enabled: true, ads: { bladder: 90 }, tags: [] } }),
    inter('takeShower', { behavior: 'shower', slotKinds: ['use'], anims: { perform: 'shower' }, duration: { kind: 'untilFull', need: 'hygiene', maxMinutes: 30 },
      needsPerHour: { hygiene: 250 }, autonomy: { enabled: true, ads: { hygiene: 70 }, tags: [] } }),
    inter('watchTv', { behavior: 'watchTv', slotKinds: ['use'], anims: { perform: 'watchTv' }, duration: { kind: 'fixed', minutes: 60 },
      needsPerHour: { fun: 25 }, allowVisitors: true, autonomy: { enabled: true, ads: { fun: 40 }, tags: ['tv'] } }),
    inter('readBook', { behavior: 'read', slotKinds: ['use'], anims: { perform: 'read' }, duration: { kind: 'fixed', minutes: 45 },
      needsPerHour: { fun: 18 }, skill: { id: 'logic', xpPerHour: 30 }, autonomy: { enabled: true, ads: { fun: 30 }, tags: ['reading'] } }),
    inter('changeOutfit', { behavior: 'changeOutfit', anims: { perform: 'interact' }, duration: { kind: 'fixed', minutes: 2 } }),
    inter('editOutfits', { behavior: 'editOutfits', anims: { perform: 'interact' }, duration: { kind: 'fixed', minutes: 1 } }),
    inter('goToWork', { behavior: 'goToWork', kind: 'self', duration: { kind: 'fixed', minutes: 0 } }),
    inter('goHere', { behavior: 'goHere', kind: 'tile', duration: { kind: 'fixed', minutes: 0 }, allowVisitors: true }),
    inter('phoneInvite', { behavior: 'invite', kind: 'self', anims: { perform: 'phone' }, duration: { kind: 'fixed', minutes: 3 } }),
    inter('phoneChat', { behavior: 'phoneChat', kind: 'self', anims: { perform: 'phone' }, duration: { kind: 'fixed', minutes: 15 }, needsPerHour: { social: 30 } }),
    inter('danceSolo', { kind: 'self', anims: { perform: 'dance' }, duration: { kind: 'fixed', minutes: 20 }, needsPerHour: { fun: 25, energy: -5 },
      autonomy: { enabled: true, ads: { fun: 20 }, tags: ['active'] } }),
  ];
  const socials: SocialDef[] = [
    social('introduce', 'greeting', { anim: 'wave', minutes: 4, requires: { maxFamiliarity: 5 }, acceptance: 0.95,
      success: { actor: { familiarity: 15, friendship: 5 }, target: { familiarity: 15, friendship: 5 }, social: 10, memory: { kind: 'met', importance: 2, text: 'Met {b}' }, setStatus: 'acquaintance' },
      failure: { actor: { familiarity: 5 }, target: { familiarity: 5 }, social: 2 },
      lines: { success: ['{a} introduced themself to {b}.'], failure: ['{b} barely noticed {a}.'] } }),
    social('chat', 'friendly', { requires: { minFamiliarity: 5 }, acceptance: 0.75 }),
    social('tellJoke', 'funny', { requires: { minFamiliarity: 10 }, acceptance: 0.55,
      success: { actor: { friendship: 5 }, target: { friendship: 6 }, social: 10, fun: 10, memory: { kind: 'joke', importance: 1, text: 'Laughed with {b}' } } }),
    social('becomeFriends', 'status', { requires: { minFriendship: 30, notStatus: ['friend', 'closeFriend'] }, acceptance: 0.6,
      success: { actor: { friendship: 5, trust: 5 }, target: { friendship: 5, trust: 5 }, social: 10, setStatus: 'friend' } }),
    social('deepTalk', 'deep', { requires: { status: ['friend', 'closeFriend'] }, acceptance: 0.7 }),
    social('flirt', 'romantic', { requires: { romantic: true, minFriendship: 10 }, acceptance: 0.5, autonomy: { enabled: false, weight: 0 },
      success: { actor: { romance: 6 }, target: { romance: 6 }, social: 8 } }),
  ];
  const traits: TraitDef[] = [
    { id: 'cheerful', name: 'Cheerful', description: '', icon: 'sun', category: 'social', conflicts: [], effects: { socialReceive: { friendly: 0.1, funny: 0.1 } }, effectText: [], status: 'ready' },
    { id: 'lazy', name: 'Lazy', description: '', icon: 'couch', category: 'energy', conflicts: [], effects: { needDecay: { energy: 1.25 }, autonomyBias: { rest: 1.5 } }, effectText: [], status: 'ready' },
    { id: 'foodie', name: 'Foodie', description: '', icon: 'fork', category: 'lifestyle', conflicts: [], effects: { enjoys: { food: 1.3 }, skillRate: { cooking: 1.5 } }, effectText: [], status: 'ready' },
    { id: 'loner', name: 'Loner', description: '', icon: 'moon', category: 'social', conflicts: [], effects: { needDecay: { social: 0.5 }, socialReceive: { friendly: -0.2 } }, effectText: [], status: 'ready' },
    { id: 'hardworker', name: 'Hard Worker', description: '', icon: 'briefcase', category: 'lifestyle', conflicts: [], effects: { workPerformance: 2 }, effectText: [], status: 'ready' },
  ];
  const skills: SkillDef[] = ['cooking', 'logic', 'charisma', 'fitness'].map((id) => ({ id, name: id, description: '', icon: id, thresholds: THRESHOLDS, unlocks: [], status: 'ready' }));
  const careers: CareerDef[] = [{
    id: 'culinary', name: 'Culinary', description: '', icon: 'chef', skills: ['cooking'], status: 'ready',
    levels: Array.from({ length: 10 }, (_, i) => ({
      level: i + 1, title: `Cook ${i + 1}`, hourlyWage: 1500 + i * 400, days: [0, 1, 2, 3, 4], start: 9 * 60, end: 17 * 60,
      promotion: { performance: 30, skills: { cooking: i + 2 } },
    })),
  }];
  const moodlets: MoodletDef[] = [
    { id: 'wellRested', name: 'Well Rested', description: '', icon: 'bed', value: 8, minutes: 240 },
    { id: 'ateMeal', name: 'Good Meal', description: '', icon: 'fork', value: 5, minutes: 120 },
    { id: 'greatChat', name: 'Great Chat', description: '', icon: 'chat', value: 6, minutes: 180 },
  ];
  const recipes: RecipeDef[] = [
    { id: 'pasta', name: 'Pasta', description: '', minutes: 30, cost: 1200, servings: 4, hunger: 70, minCookingLevel: 1, status: 'ready' },
    { id: 'souffle', name: 'Souffle', description: '', minutes: 50, cost: 2500, servings: 4, hunger: 80, minCookingLevel: 5, status: 'ready' },
  ];
  const aspirations: AspirationDef[] = [{
    id: 'homeChef', name: 'Home Chef', description: '', icon: 'chef', category: 'skill', status: 'ready',
    stages: [{ name: 'First Dishes', objectives: [{ id: 'cook2', text: 'Cook 2 meals', type: 'interactionCount', match: 'cookMeal', count: 2 }], reward: { money: 50000, text: '$500' } }],
  }];
  const byId = <T extends { id: string }>(l: T[]) => Object.fromEntries(l.map((x) => [x.id, x])) as Record<string, T>;
  return {
    objects: byId(objects), openings: {}, wallDesigns: {}, floorDesigns: {}, interactions: byId(interactions), socials: byId(socials),
    traits: byId(traits), aspirations: byId(aspirations), skills: byId(skills), careers: byId(careers), moodlets: byId(moodlets),
    recipes: byId(recipes), packs: {}, hair: {}, facialHair: {}, garments: {}, accessories: {}, patterns: {}, facePresets: {},
    bodyPresets: {}, browStyles: {}, voices: {}, faceParams: [], bodyParams: [], skinTones: [], hairColors: [], eyeColors: [], preferences: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Grid navigation (8 directions, walls on edges, blocking furniture)
// ---------------------------------------------------------------------------------------------

export class GridNav implements NavProvider {
  requests = 0;
  constructor(private getState: () => WorldState, private content: ContentDB) {}

  private lot(lotId: Id): Lot | undefined { return this.getState().lots[lotId]; }

  private blockedTiles(lot: Lot, level: number): Set<string> {
    const out = new Set<string>();
    for (const o of Object.values(lot.objects)) {
      const def = this.content.objects[o.defId];
      if (!def || !def.blocksMovement || def.layer !== 'floor' || o.level !== level) continue;
      for (const t of footprintTiles(o.x, o.z, def.footprint, o.rot)) out.add(`${t.x},${t.z}`);
    }
    return out;
  }

  isWalkable(lotId: Id, level: number, x: number, z: number): boolean {
    const lot = this.lot(lotId);
    if (!lot || x < 0 || z < 0 || x >= lot.width || z >= lot.depth) return false;
    return !this.blockedTiles(lot, level).has(`${x},${z}`);
  }

  private edgeOpen(lot: Lot, level: number, a: Tile, b: Tile): boolean {
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.abs(dx) + Math.abs(dz) !== 1) return false;
    const key = dx !== 0 ? edgeKey(level, 'v', Math.max(a.x, b.x), a.z) : edgeKey(level, 'h', a.x, Math.max(a.z, b.z));
    return !lot.walls[key];
  }

  canStep(lotId: Id, level: number, from: Tile, to: Tile): boolean {
    const lot = this.lot(lotId);
    if (!lot) return false;
    const dx = to.x - from.x, dz = to.z - from.z;
    if (Math.abs(dx) > 1 || Math.abs(dz) > 1 || (dx === 0 && dz === 0)) return false;
    if (dx === 0 || dz === 0) return this.edgeOpen(lot, level, from, to);
    const c1 = { x: to.x, z: from.z }, c2 = { x: from.x, z: to.z };
    return this.isWalkable(lotId, level, c1.x, c1.z) && this.isWalkable(lotId, level, c2.x, c2.z) &&
      this.edgeOpen(lot, level, from, c1) && this.edgeOpen(lot, level, c1, to) && this.edgeOpen(lot, level, from, c2) && this.edgeOpen(lot, level, c2, to);
  }

  findPath(lotId: Id, level: number, from: Tile, goals: Tile[]): Tile[] | null {
    this.requests++;
    const lot = this.lot(lotId);
    if (!lot) return null;
    const goalSet = new Set(goals.map((g) => `${g.x},${g.z}`));
    if (goalSet.has(`${from.x},${from.z}`)) return [];
    const blocked = this.blockedTiles(lot, level);
    const key = (t: Tile) => `${t.x},${t.z}`;
    const cost = new Map<string, number>([[key(from), 0]]);
    const prev = new Map<string, string>();
    const open: Array<{ t: Tile; c: number }> = [{ t: from, c: 0 }];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    while (open.length > 0) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i]!.c < open[bi]!.c) bi = i;
      const { t, c } = open.splice(bi, 1)[0]!;
      if (c > (cost.get(key(t)) ?? Infinity)) continue;
      if (goalSet.has(key(t))) {
        const path: Tile[] = [];
        let k: string | undefined = key(t);
        while (k && k !== key(from)) {
          const [x, z] = k.split(',').map(Number) as [number, number];
          path.unshift({ x, z });
          k = prev.get(k);
        }
        return path;
      }
      for (const [dx, dz] of dirs) {
        const n = { x: t.x + dx, z: t.z + dz };
        if (n.x < 0 || n.z < 0 || n.x >= lot.width || n.z >= lot.depth || blocked.has(key(n))) continue;
        if (!this.canStep(lotId, level, t, n)) continue;
        const nc = c + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
        if (nc < (cost.get(key(n)) ?? Infinity)) {
          cost.set(key(n), nc);
          prev.set(key(n), key(t));
          open.push({ t: n, c: nc });
        }
      }
    }
    return null;
  }

  slotsOf(lotId: Id, objectId: Id): WorldSlot[] {
    const o = this.lot(lotId)?.objects[objectId];
    const def = o ? this.content.objects[o.defId] : undefined;
    if (!o || !def) return [];
    return def.slots.map((s) => {
      const p = rotateLocal(s.pos[0], s.pos[1], def.footprint, o.rot);
      const ap = rotateCell(s.approach[0], s.approach[1], def.footprint, o.rot);
      return {
        objectId, slotId: s.id, kind: s.kind, x: o.x + p.x, z: o.z + p.z, height: s.height,
        facing: rotateFacing(s.facing, o.rot), approach: { x: o.x + ap.x, z: o.z + ap.z }, posture: s.posture,
      };
    });
  }

  standTilesNear(lotId: Id, objectId: Id): Tile[] {
    const lot = this.lot(lotId);
    const o = lot?.objects[objectId];
    const def = o ? this.content.objects[o.defId] : undefined;
    if (!lot || !o || !def) return [];
    const fp = footprintTiles(o.x, o.z, def.footprint, o.rot);
    const inFp = new Set(fp.map((t) => `${t.x},${t.z}`));
    const out: Tile[] = [];
    const seen = new Set<string>();
    for (const t of fp) {
      for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
        const n = { x: t.x + dx, z: t.z + dz };
        const k = `${n.x},${n.z}`;
        if (inFp.has(k) || seen.has(k)) continue;
        if (!this.isWalkable(lotId, o.level, n.x, n.z) || !this.edgeOpen(lot, o.level, t, n)) continue;
        seen.add(k);
        out.push(n);
      }
    }
    return out;
  }

  invalidate(): void { /* no caches */ }
  stats() { return { routeRequests: this.requests, lastRouteMs: 0 }; }
}

// ---------------------------------------------------------------------------------------------
// World building
// ---------------------------------------------------------------------------------------------

function outfit(state: WorldState, name: string): Outfit {
  return { id: newId(state, 'out'), name, layers: { top: { garmentId: 'tee', color: '#aa5533', pattern: 'solid', patternColor: '#ffffff' } }, accessories: [] };
}

export function draft(state: WorldState, firstName: string, o: Partial<PersonDraft> = {}): PersonDraft {
  const appearance: Appearance = {
    frame: 'a', skin: '#c58c6a', body: {}, bodyPresetId: null,
    face: { presetId: null, params: {}, eyeColor: '#553311', browStyle: 'soft', browColor: '#332211', freckles: 0, blush: 0, lipTint: 0, lipColor: '#aa6655' },
    hair: { styleId: 'short', color: '#222222', highlight: null, facialHairId: null },
  };
  const outfits: Wardrobe = {
    outfits: { everyday: [outfit(state, 'Day')], formal: [], work: [outfit(state, 'Work')], athletic: [], sleep: [outfit(state, 'PJs')], swim: [] },
    current: { category: 'everyday', index: 0 },
  };
  return {
    firstName, lastName: 'Test', pronouns: { subject: 'they', object: 'them', possessive: 'their' }, lifeStage: 'adult', bio: '',
    voice: { preset: 'warm', pitch: 0 }, walkStyle: 'normal', romance: { interestedIn: ['any'], open: true }, appearance, outfits,
    traits: [], likes: [], dislikes: [], aspirationId: null, careerId: null, ...o,
  };
}

export function place(state: WorldState, lot: Lot, defId: string, x: number, z: number, rot: Rot = 0, supportId?: Id): PlacedObject {
  const o: PlacedObject = {
    id: newId(state, 'obj'), defId, level: 0, x, z, rot, finishes: {}, purchasePrice: 10000, boughtAt: state.clock.minutes,
    ownerHouseholdId: lot.ownerHouseholdId, condition: { dirt: 0, broken: false }, ...(supportId ? { supportId } : {}),
  };
  lot.objects[o.id] = o;
  return o;
}

export function lotLocation(lot: Lot, x: number, z: number): PersonLocation {
  return { kind: 'lot', lotId: lot.id, level: 0, x: x + 0.5, z: z + 0.5, facing: 0, posture: 'standing' };
}

export interface FixtureWorld {
  state: WorldState;
  lot: Lot;
  objects: Record<string, PlacedObject>;
  mira: Id;
  theo: Id;
  neighbour: Id | null;
}

export interface WorldOptions {
  seed?: number;
  neighbour?: boolean;
  career?: boolean;
  autonomy?: boolean;
  visitors?: boolean;
  funds?: number;
  miraTraits?: string[];
  theoTraits?: string[];
}

/**
 * 16x12 lot. Kitchen in the north-west (fridge, stove, counter), dining table with a chair, living room
 * (TV on a stand facing a sofa), bedroom behind a wall at x=10 (door gap at z=4) with a double bed and a
 * wardrobe, bathroom behind a wall at z=7 (door gap at x=13) with a toilet and shower, a bookcase in the
 * south-west. Entry at (8, 11).
 */
export function buildWorld(o: WorldOptions = {}): FixtureWorld {
  const content = fixtureContent();
  const state = createEmptyWorld(o.seed ?? 42, 'create');
  state.settings.autonomy = o.autonomy ?? true;
  state.settings.visitors = o.visitors ?? true;
  const lot: Lot = {
    id: newId(state, 'lot'), name: 'Test Lot', address: '1 Test Lane', kind: 'residential', width: 16, depth: 12, landValue: 100000,
    ownerHouseholdId: null, entry: { x: 8, z: 11, level: 0 }, levels: 1, walls: {}, floors: {}, openings: {}, objects: {}, ground: 'grass',
  };
  state.lots[lot.id] = lot;
  const wall = (dir: 'h' | 'v', x: number, z: number) => {
    const id = edgeKey(0, dir, x, z);
    lot.walls[id] = { id, level: 0, dir, x, z, height: 2.8, sideA: { designId: 'plain-paint', paletteId: 'p0' }, sideB: { designId: 'plain-paint', paletteId: 'p0' } };
  };
  for (let z = 0; z <= 6; z++) if (z !== 4) wall('v', 10, z);
  for (let x = 10; x <= 15; x++) if (x !== 13) wall('h', x, 7);
  const hh = addHousehold(state, 'Hart', o.funds ?? 500000, lot.id, true);
  lot.ownerHouseholdId = hh.id;
  state.activeHouseholdId = hh.id;
  state.activeLotId = lot.id;
  const objects: Record<string, PlacedObject> = {};
  objects.fridge = place(state, lot, 'fridge-standard', 1, 0);
  objects.stove = place(state, lot, 'stove-basic', 2, 0);
  objects.counter = place(state, lot, 'counter-basic', 3, 0);
  objects.table = place(state, lot, 'table-dining-oak', 2, 4);
  objects.chair = place(state, lot, 'chair-dining-oak', 2, 5, 2);
  objects.tvStand = place(state, lot, 'tv-stand-low', 6, 3);
  objects.tv = place(state, lot, 'tv-flatscreen', 6, 3, 0, objects.tvStand.id);
  objects.sofa = place(state, lot, 'sofa-tweed', 6, 7, 2);
  objects.bed = place(state, lot, 'bed-double-oak', 12, 1);
  objects.wardrobe = place(state, lot, 'wardrobe-tall', 15, 4, 3);
  objects.toilet = place(state, lot, 'toilet-basic', 14, 8);
  objects.shower = place(state, lot, 'shower-stall', 12, 8);
  objects.bookcase = place(state, lot, 'bookcase-open', 0, 9, 1);
  const mira = createPerson(state, content, draft(state, 'Mira', { careerId: o.career ? 'culinary' : null, traits: o.miraTraits ?? [], aspirationId: 'homeChef' }), hh.id, lotLocation(lot, 8, 8));
  const theo = createPerson(state, content, draft(state, 'Theo', { traits: o.theoTraits ?? [] }), hh.id, lotLocation(lot, 9, 8));
  applyHouseholdTies(state, [mira.id, theo.id], [{ a: 0, b: 1, tie: 'roommate' }]);
  let neighbour: Id | null = null;
  if (o.neighbour ?? true) {
    const nh = addHousehold(state, 'Okafor', 300000, null, false);
    neighbour = createPerson(state, content, draft(state, 'Ada'), nh.id, { kind: 'offlot', place: 'home', since: state.clock.minutes, until: null }).id;
  }
  return { state, lot, objects, mira: mira.id, theo: theo.id, neighbour };
}

/** A simulation over a mutable state holder (so tests can swap in a cloned state). */
export interface Harness {
  holder: { state: WorldState };
  content: ContentDB;
  nav: GridNav;
  events: EventBus;
  log: GameEvent[];
  sim: Simulation;
}

export function harness(state: WorldState, content: ContentDB = fixtureContent()): Harness {
  const holder = { state };
  const events = new EventBus();
  const log: GameEvent[] = [];
  events.onAny((e) => { if (e.type !== 'tick' && e.type !== 'person.changed' && e.type !== 'feed') log.push(e); });
  const nav = new GridNav(() => holder.state, content);
  const sim = new Simulation({ getState: () => holder.state, content, nav, events });
  return { holder, content, nav, events, log, sim };
}

export function runTicks(h: Harness, n: number): void {
  for (let i = 0; i < n; i++) h.sim.tick();
}

/** Ticks until `pred` holds; returns the number of ticks run (throws when maxTicks is exceeded). */
export function runUntil(h: Harness, pred: () => boolean, maxTicks = 20000): number {
  for (let i = 0; i < maxTicks; i++) {
    if (pred()) return i;
    h.sim.tick();
  }
  if (pred()) return maxTicks;
  throw new Error(`condition not reached within ${maxTicks} ticks (t=${h.holder.state.clock.minutes})`);
}

/** Sets every need of a person. */
export function setNeeds(state: WorldState, personId: Id, v: number): void {
  const p = state.people[personId]!;
  for (const k of Object.keys(p.needs) as Array<keyof typeof p.needs>) p.needs[k] = v;
}

/** A SimCtx over the harness state with fresh reservations, for calling pure helpers directly. */
export function pureCtx(h: Harness): SimCtx {
  const state = h.holder.state;
  return {
    state, content: h.content, nav: h.nav, events: h.events, rng: new Rng(state.rng), res: new Reservations(),
    now: state.clock.minutes, counters: { routeRequests: 0 },
  };
}

/** Deterministic chunk sizes for batching tests (no Math.random). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s; };
}

/** The person's head action. */
export function head(h: Harness, personId: Id): ActionInstance | undefined {
  return h.holder.state.people[personId]?.queue[0];
}

export function finished(h: Harness, personId: Id, interactionId?: string): Array<Extract<GameEvent, { type: 'action.finished' }>> {
  return h.log.filter((e): e is Extract<GameEvent, { type: 'action.finished' }> =>
    e.type === 'action.finished' && e.personId === personId && (!interactionId || e.interactionId === interactionId));
}
