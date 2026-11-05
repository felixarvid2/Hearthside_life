// createNewWorld on the real content: the starter home and the neighbour house are valid, the household moves
// in just inside the front door with its funds, ties, careers and a welcome, the neighbours wait at home and the
// first visit is scheduled for day 0 at 17:00. Deterministic for a seed.

import { describe, expect, it } from 'vitest';
import { NEIGHBOR_HOUSEHOLD, premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute } from '../../../src/core/clock';
import { pairKey, tileKey } from '../../../src/core/ids';
import type { Tile } from '../../../src/core/nav';
import { cloneState } from '../../../src/core/state';
import type { Lot, StartMode, WorldState } from '../../../src/core/types';
import { createNewWorld, STARTING_FUNDS } from '../../../src/game/newWorld';
import { validateWorld } from '../../../src/persistence/index';
import { LotNav } from '../../../src/world/nav';
import { doorTiles, validatePlacement } from '../../../src/world/placement';
import { computeRooms, roomAt } from '../../../src/world/rooms';
import { coreWithoutSaves, db } from './harness';

const premades = premadeHouseholds(db);
const neighbor = NEIGHBOR_HOUSEHOLD(db);
const world = (mode: StartMode, index = 0, seed = 42): WorldState =>
  createNewWorld(db, { seed, mode, household: premades[index]!, neighbor });

/** Every object passes validatePlacement where it stands, every slot approach is reachable, no doorway is blocked. */
function checkLotValid(state: WorldState, lot: Lot): void {
  const nav = new LotNav(() => state, db);
  const entry: Tile = { x: lot.entry.x, z: lot.entry.z };
  expect(Object.keys(lot.objects).length).toBeGreaterThan(15);
  for (const obj of Object.values(lot.objects)) {
    const v = validatePlacement(state, db, lot.id, { defId: obj.defId, x: obj.x, z: obj.z, rot: obj.rot, level: obj.level, ignoreObjectId: obj.id });
    expect(v.reasons, `${obj.defId} at (${obj.x}, ${obj.z})`).toEqual([]);
    expect(v.ok).toBe(true);
    for (const slot of nav.slotsOf(lot.id, obj.id)) {
      const label = `${obj.defId} ${slot.slotId} approach (${slot.approach.x}, ${slot.approach.z})`;
      expect(nav.isWalkable(lot.id, 0, slot.approach.x, slot.approach.z), label).toBe(true);
      expect(nav.findPath(lot.id, 0, entry, [slot.approach]), label).not.toBeNull();
    }
  }
  for (const op of Object.values(lot.openings)) {
    if (db.openings[op.defId]?.kind !== 'door') continue;
    const w = lot.walls[op.wallId]!;
    const [a, b] = w.dir === 'h' ? [{ x: w.x, z: w.z - 1 }, { x: w.x, z: w.z }] : [{ x: w.x - 1, z: w.z }, { x: w.x, z: w.z }];
    expect(nav.isWalkable(lot.id, 0, a.x, a.z), `door ${op.wallId}`).toBe(true);
    expect(nav.isWalkable(lot.id, 0, b.x, b.z), `door ${op.wallId}`).toBe(true);
    expect(nav.canStep(lot.id, 0, a, b), `door ${op.wallId}`).toBe(true);
    expect(nav.findPath(lot.id, 0, entry, [a]), `door ${op.wallId} reachable`).not.toBeNull();
  }
}

describe('createNewWorld', () => {
  it('builds a valid, furnished starter home and neighbour house', () => {
    const s = world('guided');
    const home = s.lots[s.activeLotId]!;
    expect(Object.keys(s.lots)).toHaveLength(15); // the home, the house next door and thirteen generated lots (Milestone 7)
    expect([home.width, home.depth]).toEqual([24, 24]);
    expect(home.entry).toEqual({ x: 12, z: 23, level: 0 });
    expect(home.address).toMatch(/^\d+ [A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(home.ownerHouseholdId).toBe(s.activeHouseholdId);
    checkLotValid(s, home);
    for (const o of Object.values(home.objects)) expect(o.ownerHouseholdId).toBe(s.activeHouseholdId);
    const next = Object.values(s.lots).find((l) => l.id !== home.id && l.built !== false)!;
    expect(next.ownerHouseholdId).not.toBe(s.activeHouseholdId);
    expect(s.households[next.ownerHouseholdId!]!.homeLotId).toBe(next.id);
    expect(next.address.split(' ').slice(1)).toEqual(home.address.split(' ').slice(1)); // same street, next door
    expect(next.address).not.toBe(home.address);
    checkLotValid(s, next);
  });

  it('gives each start mode its funds with a start ledger entry; the sandbox builds for free', () => {
    for (const mode of ['guided', 'create', 'sandbox'] as const) {
      const s = world(mode);
      const hh = s.households[s.activeHouseholdId]!;
      expect(hh.funds, mode).toBe(STARTING_FUNDS[mode]);
      expect(hh.ledger).toEqual([expect.objectContaining({ kind: 'start', amount: STARTING_FUNDS[mode], occurrence: `start:${hh.id}` })]);
      expect(s.settings.unlimitedFunds).toBe(mode === 'sandbox');
      expect(s.startMode).toBe(mode);
      expect(hh.isPlayable).toBe(true);
    }
    expect(STARTING_FUNDS).toEqual({ guided: 900000, create: 1200000, sandbox: 5000000 });
  });

  it('moves the household in just inside the front door with draft looks, careers and ties', () => {
    const s = world('create', 1);
    const draft = premades[1]!;
    const home = s.lots[s.activeLotId]!;
    const hh = s.households[s.activeHouseholdId]!;
    expect(hh.memberIds).toHaveLength(draft.members.length);
    const rooms = computeRooms(home, 0);
    const doors = new Set(doorTiles(home, db, 0).map((t) => `${t.x},${t.z}`));
    const nav = new LotNav(() => s, db);
    const spots = new Set<string>();
    hh.memberIds.forEach((id, i) => {
      const p = s.people[id]!;
      const d = draft.members[i]!;
      expect(p.isNpc).toBe(false);
      expect(p.firstName).toBe(d.firstName);
      expect(p.appearance).toEqual(d.appearance);
      expect(p.outfits).toEqual(d.outfits);
      expect(p.traits).toEqual(d.traits);
      expect(p.career?.careerId ?? null).toBe(d.careerId);
      expect(p.aspiration?.aspirationId ?? null).toBe(d.aspirationId);
      const loc = p.location;
      if (loc.kind !== 'lot') throw new Error('not on the lot');
      expect(loc.lotId).toBe(home.id);
      expect(loc.posture).toBe('standing');
      const t = { x: Math.floor(loc.x), z: Math.floor(loc.z) };
      expect(roomAt(rooms, t.x, t.z)?.outdoor, `${p.firstName} inside`).toBe(false);
      expect(nav.isWalkable(home.id, 0, t.x, t.z)).toBe(true);
      expect(doors.has(`${t.x},${t.z}`), `${p.firstName} not in a doorway`).toBe(false);
      // the front door's inside tile is (8, 16); its outside tile (8, 17)
      expect(Math.abs(t.x - 8) + Math.abs(t.z - 16), `${p.firstName} near the front door`).toBeLessThanOrEqual(2);
      spots.add(`${t.x},${t.z}`);
    });
    expect(spots.size).toBe(hh.memberIds.length);
    const [a, b] = hh.memberIds;
    const bond = s.bonds[pairKey(a!, b!)]!;
    expect(bond.familyAtoB).toBe('roommate');
    expect(s.relationships[`${a}>${b}`]!.familiarity).toBeGreaterThan(0);
  });

  it('keeps the neighbours at home off-lot and schedules their first visit for day 0 at 17:00', () => {
    const s = world('guided');
    const nh = Object.values(s.households).find((h) => !h.isPlayable)!;
    expect(nh.memberIds).toHaveLength(neighbor.members.length);
    for (const id of nh.memberIds) {
      const p = s.people[id]!;
      expect(p.isNpc).toBe(true);
      expect(p.location).toEqual({ kind: 'offlot', place: 'home', lotId: nh.homeLotId, since: atDayMinute(0, 8 * 60), until: null });
    }
    expect(s.bonds[pairKey(nh.memberIds[0]!, nh.memberIds[1]!)]!.status).toBe('spouse');
    const first = nh.memberIds[0]!;
    expect(s.schedule).toEqual([{ occurrence: `visit:${first}:0`, at: atDayMinute(0, 17 * 60), kind: 'visitArrive', personId: first, data: { first: true } }]);
    expect(s.processed['visitday:0']).toBeDefined();
  });

  it('the simulation does not schedule the first visit twice', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[0]!, 42);
    core.advanceTicks(40);
    expect(core.state()!.schedule.filter((e) => e.kind === 'visitArrive')).toHaveLength(1);
  });

  it('writes a welcome to the feed and passes the save validation', () => {
    const s = world('guided');
    const home = s.lots[s.activeLotId]!;
    const street = home.address.split(' ').slice(1).join(' ');
    expect(s.feed[0]!.text).toContain(street);
    expect(s.feed[0]!.text).toContain(premades[0]!.members[0]!.firstName);
    expect(s.feed[0]!.kind).toBe('info');
    expect(cloneState(s)).toEqual(s);
    const v = validateWorld(s, db);
    expect(v.errors).toEqual([]);
    expect(v.missing).toEqual([]);
    expect(home.floors[tileKey(0, 8, 17)]).toBeDefined(); // porch
  });

  it('does not change the drafts it is given', () => {
    const household = premadeHouseholds(db)[1]!;
    const before = JSON.stringify([household, neighbor]);
    const s = createNewWorld(db, { seed: 3, mode: 'create', household, neighbor });
    expect(JSON.stringify([household, neighbor])).toBe(before);
    s.people[s.households[s.activeHouseholdId]!.memberIds[0]!]!.appearance.hair.color = '#000000';
    expect(JSON.stringify([household, neighbor])).toBe(before); // people hold copies
  });

  it('is deterministic for a seed', () => {
    expect(JSON.stringify(world('create', 2, 7))).toBe(JSON.stringify(world('create', 2, 7)));
    expect(JSON.stringify(world('create', 2, 7))).not.toBe(JSON.stringify(world('create', 2, 8)));
  });

  it('rejects a household without members', () => {
    expect(() => createNewWorld(db, { seed: 1, mode: 'guided', household: { name: 'Nobody', members: [], ties: [] }, neighbor })).toThrow(/no members/);
  });
});
