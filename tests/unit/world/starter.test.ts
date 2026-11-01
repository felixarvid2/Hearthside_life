import { describe, expect, it } from 'vitest';
import type { ContentDB } from '../../../src/content/types';
import { tileKey } from '../../../src/core/ids';
import type { Tile } from '../../../src/core/nav';
import { cloneState } from '../../../src/core/state';
import type { Lot, PlacedObject, WorldState } from '../../../src/core/types';
import { LotNav } from '../../../src/world/nav';
import { backEdges, doorTiles, objectTiles, validatePlacement } from '../../../src/world/placement';
import { computeRooms, roomAt } from '../../../src/world/rooms';
import { frontDir, slotAccess } from '../../../src/world/slots';
import { furnishNeighborHouse, furnishStarterHouse } from '../../../src/world/starter';
import { openingOnWall } from '../../../src/world/walls';
import { fixtureContent, testWorld } from './fixtures';

/** Ids the generated houses need from the real content registries. */
const NEEDED = {
  objects: ['bed-double-oak', 'bed-single-pine', 'fridge-standard', 'stove-basic', 'counter-basic', 'counter-sink', 'table-dining-oak',
    'chair-dining-oak', 'sofa-tweed', 'armchair-lounge', 'table-coffee', 'tv-stand-low', 'tv-flatscreen', 'toilet-basic', 'shower-stall',
    'bathroom-sink', 'bathroom-mirror', 'bookcase-open', 'desk-oak', 'chair-desk', 'computer-desktop', 'wardrobe-tall', 'nightstand-oak',
    'lamp-floor-round', 'plant-potted', 'rug-rectangle', 'radio-retro', 'trash-can'],
  openings: ['door-panel', 'door-glazed', 'window-sash', 'window-wide'],
  wallDesigns: ['plain-paint', 'subway-tile', 'stripes-regency', 'brick-classic'],
  floorDesigns: ['oak-planks', 'checker-tile', 'carpet-plush', 'hex-mosaic', 'stone-pavers'],
} as const;

let real: ContentDB | null = null;
try {
  real = (await import('../../../src/content/index')).content();
} catch {
  real = null; // registries are still being written by other modules
}
const realReady = !!real && (Object.keys(NEEDED) as Array<keyof typeof NEEDED>).every((k) => NEEDED[k].every((id) => !!real![k][id]));

function byDef(lot: Lot, defId: string): PlacedObject[] {
  return Object.values(lot.objects).filter((o) => o.defId === defId);
}

function center(o: PlacedObject, content: ContentDB): { x: number; z: number } {
  const t = objectTiles(o, content.objects[o.defId]);
  return { x: t.reduce((s, p) => s + p.x + 0.5, 0) / t.length, z: t.reduce((s, p) => s + p.z + 0.5, 0) / t.length };
}

/** Structural checks shared by the fixture and real-content runs. */
function checkHouse(state: WorldState, content: ContentDB, lot: Lot) {
  const nav = new LotNav(() => state, content);
  const entry: Tile = { x: lot.entry.x, z: lot.entry.z };

  // every slot is usable (not through a wall, never standing inside furniture) and reachable from the entry
  const grid = nav.grid(lot.id, 0)!;
  const actx = { grid, content, objectById: (id: string) => lot.objects[id] };
  for (const obj of Object.values(lot.objects)) {
    const def = content.objects[obj.defId]!;
    const access = slotAccess(actx, obj, def);
    for (const a of access) {
      const slot = a.slot;
      const label = `${obj.defId} (${obj.x}, ${obj.z}) ${slot.slotId} via ${a.via} approach (${slot.approach.x}, ${slot.approach.z})`;
      expect(a.usable, label).toBe(true);
      expect(nav.isWalkable(lot.id, 0, slot.approach.x, slot.approach.z), label).toBe(true);
      expect(nav.findPath(lot.id, 0, entry, [slot.approach]), label).not.toBeNull();
      if (slot.posture === 'standing') expect(nav.isWalkable(lot.id, 0, Math.floor(slot.x), Math.floor(slot.z)) || objectTiles(obj, def).some((t) => t.x === Math.floor(slot.x) && t.z === Math.floor(slot.z)), label).toBe(true);
    }
    expect(nav.slotsOf(lot.id, obj.id)).toHaveLength(def.slots.length);
    // interactive objects without slots have a free side reachable from the entry
    if (def.slots.length === 0 && def.interactions.length > 0) {
      const stand = nav.standTilesNear(lot.id, obj.id);
      expect(stand.length, obj.defId).toBeGreaterThan(0);
      expect(nav.findPath(lot.id, 0, entry, stand), `${obj.defId} (${obj.x}, ${obj.z})`).not.toBeNull();
    }
  }
  // no doorway blocked: both tiles walkable and connected through the door
  for (const op of Object.values(lot.openings)) {
    if (content.openings[op.defId]?.kind !== 'door') continue;
    const wall = lot.walls[op.wallId]!;
    const [a, b] = wall.dir === 'h' ? [{ x: wall.x, z: wall.z - 1 }, { x: wall.x, z: wall.z }] : [{ x: wall.x - 1, z: wall.z }, { x: wall.x, z: wall.z }];
    expect(nav.isWalkable(lot.id, 0, a.x, a.z), `door ${op.wallId}`).toBe(true);
    expect(nav.isWalkable(lot.id, 0, b.x, b.z), `door ${op.wallId}`).toBe(true);
    expect(nav.canStep(lot.id, 0, a, b), `door ${op.wallId}`).toBe(true);
    expect(nav.findPath(lot.id, 0, entry, [a]), `door ${op.wallId}`).not.toBeNull();
  }
  for (const t of doorTiles(lot, content, 0)) expect(nav.isWalkable(lot.id, 0, t.x, t.z)).toBe(true);
  // every placement is still valid (re-validated with the object itself ignored)
  for (const obj of Object.values(lot.objects)) {
    const v = validatePlacement(state, content, lot.id, { defId: obj.defId, x: obj.x, z: obj.z, rot: obj.rot, level: 0, ignoreObjectId: obj.id });
    expect(v.reasons, `${obj.defId} at (${obj.x}, ${obj.z})`).toEqual([]);
    if (content.objects[obj.defId]!.layer === 'surface') expect(obj.supportId).toBe(v.supportId);
  }
  // TV and computer rest on their supports
  expect(byDef(lot, 'tv-flatscreen')).toHaveLength(1);
  for (const [item, support] of [['tv-flatscreen', 'tv-stand-low'], ['computer-desktop', 'desk-oak'], ['radio-retro', 'tv-stand-low']] as const) {
    for (const o of byDef(lot, item)) expect(lot.objects[o.supportId!]?.defId, item).toBe(support);
  }
  // a dining table with at least two chairs facing it
  const [table] = byDef(lot, 'table-dining-oak');
  const tableTiles = new Set(objectTiles(table!, content.objects['table-dining-oak']).map((t) => `${t.x},${t.z}`));
  const facing = byDef(lot, 'chair-dining-oak').filter((c) => {
    const f = frontDir(c.rot);
    return tableTiles.has(`${c.x + f.x},${c.z + f.z}`);
  });
  expect(facing.length).toBeGreaterThanOrEqual(2);
  // the sofa faces the TV and the TV faces the sofa
  const [sofa] = byDef(lot, 'sofa-tweed');
  const [tv] = byDef(lot, 'tv-flatscreen');
  const s = center(sofa!, content), t = center(tv!, content);
  const fs = frontDir(sofa!.rot), ft = frontDir(tv!.rot);
  const dx = t.x - s.x, dz = t.z - s.z, len = Math.hypot(dx, dz);
  expect((dx * fs.x + dz * fs.z) / len).toBeGreaterThan(0.9);
  expect((-dx * ft.x - dz * ft.z) / len).toBeGreaterThan(0.9);
  return nav;
}

describe('furnishStarterHouse (fixture content)', () => {
  const content = fixtureContent();
  const { state, lot } = testWorld();
  furnishStarterHouse(state, content, lot.id);
  const rooms = computeRooms(lot, 0);
  const room = (x: number, z: number) => roomAt(rooms, x, z)!;

  it('builds a living room, kitchen, bathroom, two bedrooms and a hall plus the yard', () => {
    expect(rooms.filter((r) => !r.outdoor)).toHaveLength(6);
    expect(rooms.filter((r) => r.outdoor)).toHaveLength(1);
    expect(room(7, 13).tiles).toHaveLength(6 * 7); // living
    expect(room(14, 12).tiles).toHaveLength(8 * 7); // kitchen with dining area
    expect(room(11, 6).tiles).toHaveLength(9); // bathroom
  });

  it('is usable: every slot reachable from the entry, no doorway blocked, supports, chairs, sofa and TV', () => {
    checkHouse(state, content, lot);
  });

  it('puts the double bed and a wardrobe in the main bedroom, the single bed, desk and computer in the other', () => {
    expect(lot.objects[byDef(lot, 'computer-desktop')[0]!.supportId!]!.defId).toBe('desk-oak');
    const main = room(7, 8), second = room(15, 8);
    const inRoom = (o: PlacedObject, r: typeof main) => !!roomAt([r], o.x, o.z);
    expect(byDef(lot, 'bed-double-oak').filter((o) => inRoom(o, main))).toHaveLength(1);
    expect(byDef(lot, 'wardrobe-tall').some((o) => inRoom(o, main))).toBe(true);
    expect(byDef(lot, 'bed-single-pine').filter((o) => inRoom(o, second))).toHaveLength(1);
    expect(byDef(lot, 'desk-oak').filter((o) => inRoom(o, second))).toHaveLength(1);
    expect(byDef(lot, 'computer-desktop').filter((o) => inRoom(o, second))).toHaveLength(1);
    const kitchen = room(14, 12);
    for (const id of ['fridge-standard', 'stove-basic', 'counter-sink', 'table-dining-oak']) expect(byDef(lot, id).some((o) => inRoom(o, kitchen)), id).toBe(true);
    const bath = room(11, 6);
    for (const id of ['toilet-basic', 'shower-stall', 'bathroom-sink']) expect(byDef(lot, id).some((o) => inRoom(o, bath)), id).toBe(true);
  });

  it('hangs the mirror on a bathroom wall', () => {
    const [mirror] = byDef(lot, 'bathroom-mirror');
    expect(mirror).toBeDefined();
    expect(roomAt([room(11, 6)], mirror!.x, mirror!.z)).toBeDefined();
    for (const k of backEdges({ ...mirror!, level: 0 }, content.objects['bathroom-mirror']!)) expect(lot.walls[k], k).toBeDefined();
  });

  it('uses glazed front door, panel doors inside and windows only on exterior walls', () => {
    const yard = rooms.find((r) => r.outdoor)!;
    const exteriorWalls = new Set(yard.sides.map((s) => s.wallId));
    expect(lot.openings[openingOnWall(lot, '0:h:8:17')!.id]!.defId).toBe('door-glazed');
    const ops = Object.values(lot.openings);
    expect(ops.filter((o) => o.defId === 'door-panel')).toHaveLength(5);
    for (const o of ops) {
      const kind = content.openings[o.defId]!.kind;
      if (kind === 'window') expect(exteriorWalls.has(o.wallId), o.wallId).toBe(true);
      if (o.defId === 'door-panel') expect(exteriorWalls.has(o.wallId), o.wallId).toBe(false);
    }
    expect(ops.filter((o) => content.openings[o.defId]!.kind === 'window').length).toBeGreaterThanOrEqual(10);
  });

  it('applies the requested wall and floor finishes', () => {
    const yard = rooms.find((r) => r.outdoor)!;
    for (const s of yard.sides) {
      const w = lot.walls[s.wallId]!;
      expect((s.side === 'a' ? w.sideA : w.sideB).designId).toBe('brick-classic');
    }
    const sideOf = (wallId: string, side: 'a' | 'b') => (side === 'a' ? lot.walls[wallId]!.sideA : lot.walls[wallId]!.sideB);
    for (const s of room(14, 12).sides) expect(sideOf(s.wallId, s.side).designId).toBe('subway-tile');
    for (const s of room(11, 6).sides) expect(sideOf(s.wallId, s.side).designId).toBe('subway-tile');
    const paints = [room(7, 13), room(7, 8), room(15, 8), room(11, 9)].map((r) => {
      const ss = r.sides.map((s) => sideOf(s.wallId, s.side)).filter((f) => f.designId === 'plain-paint');
      expect(ss.length).toBeGreaterThan(0);
      return ss[0]!.paletteId;
    });
    expect(new Set(paints).size).toBe(4); // a different palette in every painted room
    const stripes = Object.values(lot.walls).filter((w) => w.sideA.designId === 'stripes-regency' || w.sideB.designId === 'stripes-regency');
    expect(stripes.length).toBe(5);
    expect(stripes.every((w) => w.dir === 'h' && w.z === 5)).toBe(true); // one straight feature wall
    const floor = (x: number, z: number) => lot.floors[tileKey(0, x, z)]?.designId;
    expect(floor(7, 13)).toBe('oak-planks');
    expect(floor(7, 8)).toBe('oak-planks');
    expect(floor(14, 12)).toBe('checker-tile');
    expect(floor(11, 6)).toBe('hex-mosaic');
    expect(floor(15, 8)).toBe('carpet-plush');
    expect(floor(8, 17)).toBe('stone-pavers');
    expect(floor(0, 0)).toBeUndefined();
    for (const r of rooms.filter((x) => !x.outdoor)) for (const t of r.tiles) expect(lot.floors[tileKey(0, t.x, t.z)]).toBeDefined();
  });

  it('paves a continuous path from the lot entry to the front door', () => {
    const paved = (x: number, z: number) => lot.floors[tileKey(0, x, z)]?.designId === 'stone-pavers';
    expect(paved(lot.entry.x, lot.entry.z)).toBe(true);
    const seen = new Set<string>([`${lot.entry.x},${lot.entry.z}`]);
    const queue: Tile[] = [{ x: lot.entry.x, z: lot.entry.z }];
    while (queue.length) {
      const t = queue.shift()!;
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const n = { x: t.x + dx!, z: t.z + dz! };
        const k = `${n.x},${n.z}`;
        if (seen.has(k) || !paved(n.x, n.z) || n.z < 17) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    expect(seen.has('8,17')).toBe(true); // outside tile of the front door
  });

  it('marks furnishings as pre-owned, owned by the lot owner, and survives cloneState', () => {
    for (const o of Object.values(lot.objects)) {
      expect(o.boughtAt).toBeLessThan(state.clock.minutes);
      expect(o.ownerHouseholdId).toBe(lot.ownerHouseholdId);
      expect(o.purchasePrice).toBe(content.objects[o.defId]!.price);
    }
    expect(cloneState(state)).toEqual(state);
  });

  it('works with the lot entry in other places and refuses non-empty lots or missing content', () => {
    const w2 = testWorld();
    w2.lot.entry = { x: 2, z: 23, level: 0 };
    furnishStarterHouse(w2.state, content, w2.lot.id);
    checkHouse(w2.state, content, w2.lot);
    expect(() => furnishStarterHouse(w2.state, content, w2.lot.id)).toThrow(/not empty/);
    const w3 = testWorld();
    const broken = fixtureContent();
    delete broken.objects['sofa-tweed'];
    expect(() => furnishStarterHouse(w3.state, broken, w3.lot.id)).toThrow(/sofa-tweed/);
    const w4 = testWorld({ size: 16 });
    expect(() => furnishStarterHouse(w4.state, content, w4.lot.id)).toThrow(/24 x 24/);
  });

  it('throws when a footprint does not fit the layout', () => {
    const w = testWorld();
    const wide = fixtureContent();
    wide.objects['counter-basic'] = { ...wide.objects['counter-basic']!, footprint: { w: 2, d: 1 } };
    expect(() => furnishStarterHouse(w.state, wide, w.lot.id)).toThrow(/cannot place .* overlaps the Counter Basic/);
  });
});

describe('furnishNeighborHouse (fixture content)', () => {
  it('builds a smaller, valid, furnished house', () => {
    const content = fixtureContent();
    const { state, lot } = testWorld();
    furnishNeighborHouse(state, content, lot.id);
    const rooms = computeRooms(lot, 0);
    expect(rooms.filter((r) => !r.outdoor)).toHaveLength(3);
    expect(Object.keys(lot.objects).length).toBeGreaterThan(15);
    checkHouse(state, content, lot);
    expect(byDef(lot, 'bed-double-oak')).toHaveLength(1);
    expect(byDef(lot, 'bathroom-mirror')).toHaveLength(1);
  });
});

describe.skipIf(!realReady)('generated houses with the real content registries', () => {
  it('furnishes the starter house with the real definitions', () => {
    const { state, lot } = testWorld();
    furnishStarterHouse(state, real!, lot.id);
    checkHouse(state, real!, lot);
  });

  it('furnishes the neighbour house with the real definitions', () => {
    const { state, lot } = testWorld();
    furnishNeighborHouse(state, real!, lot.id);
    checkHouse(state, real!, lot);
  });
});
