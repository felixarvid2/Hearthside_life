// Milestone 9 exterior: content counts, fence and gate navigation (fenceEdgeState), roof plans, prices and undo, terrain paint,
// auto roof, safety rules and the procedural geometry (roof meshes and fence pieces).

import { describe, expect, it } from 'vitest';
import {
  paintTerrain, placeAutoRoof, placeFenceLoop, placeFencePath, placeFenceRun, placeGate, placeRoof, removeFences, removeRoof,
} from '../../../src/building/exteriorCommands';
import { defaultRoofSpec, planExterior, roofPrice } from '../../../src/building/exteriorPlans';
import { CROPS, EXTERIOR, FENCES, GATES, ROOF_FINISHES, ROOF_STYLES, TERRAIN_PAINTS } from '../../../src/content/exterior';
import { EXTERIOR_OBJECTS, GARDEN_OBJECTS, STAIR_OBJECTS } from '../../../src/content/exteriorObjects';
import { UndoStack, type CommandContext } from '../../../src/core/commands';
import { EventBus, type GameEvent } from '../../../src/core/events';
import { tileKey } from '../../../src/core/ids';
import type { FinishRef, Person } from '../../../src/core/types';
import { fenceContinues, fenceEdgeState, isGateDef } from '../../../src/world/fences';
import { fencePieces } from '../../../src/world/fencePieces';
import { LotNav } from '../../../src/world/nav';
import { autoRoofRects, buildRoofMesh, longRidge, roofBaseHeight } from '../../../src/world/roofs';
import { terrainAt } from '../../../src/world/terrain';
import { addOpening, addRectWalls } from '../../../src/world/walls';
import { fixtureContent, testWorld } from '../world/fixtures';

const F = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const FF = { a: F, b: F };
const OAK: FinishRef = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };
const SHINGLE: FinishRef = { designId: 'asphalt-shingle', paletteId: 'charcoal' };

function setup(o: { funds?: number; size?: number } = {}) {
  const content = fixtureContent();
  const w = testWorld({ funds: o.funds, size: o.size });
  const events = new EventBus();
  const seen: GameEvent[] = [];
  events.onAny((e) => seen.push(e));
  const ctx: CommandContext = { state: w.state, content, events };
  const stack = new UndoStack();
  const nav = new LotNav(() => w.state, content, events);
  const run = (cmd: Parameters<UndoStack['run']>[1]) => stack.run(ctx, cmd);
  const floor = (x0: number, z0: number, x1: number, z1: number, level = 0) => {
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) w.lot.floors[tileKey(level, x, z)] = { ...OAK };
  };
  /** A walled, floored 6 x 4 house at (4, 4) with a door in its south wall. */
  const house = () => {
    addRectWalls(w.lot, 0, 4, 4, 10, 8, FF);
    floor(4, 4, 10, 8);
    addOpening(w.state, w.lot, content.openings['door-panel']!, '0:h:6:8');
  };
  const person = (id: string, name: string, x: number, z: number) => {
    w.state.people[id] = { id, firstName: name, lastName: 'T', location: { kind: 'lot', lotId: w.lot.id, level: 0, x, z, facing: 0, posture: 'standing' } } as unknown as Person;
  };
  return { ...w, content, events, seen, ctx, stack, nav, run, floor, house, person };
}

describe('exterior content counts', () => {
  it('has the contracted numbers', () => {
    expect(ROOF_STYLES).toHaveLength(12);
    expect(ROOF_FINISHES.length).toBeGreaterThanOrEqual(8);
    expect(ROOF_FINISHES.reduce((n, f) => n + f.palettes.length, 0)).toBeGreaterThanOrEqual(24);
    expect(FENCES).toHaveLength(24);
    expect(GATES).toHaveLength(12);
    expect(TERRAIN_PAINTS.length).toBeGreaterThanOrEqual(8);
    expect(GARDEN_OBJECTS.length).toBeGreaterThanOrEqual(12);
    expect(STAIR_OBJECTS).toHaveLength(12);
    expect(STAIR_OBJECTS.filter((s) => s.stair?.kind === 'straight')).toHaveLength(8);
    expect(STAIR_OBJECTS.filter((s) => s.stair?.kind === 'spiral')).toHaveLength(4);
    expect(CROPS.length).toBeGreaterThanOrEqual(8);
  });
  it('gate ids start with gate- and nothing else does', () => {
    for (const g of GATES) { expect(isGateDef(g.id)).toBe(true); expect(g.kind).toBe('gate'); }
    for (const f of FENCES) { expect(isGateDef(f.id)).toBe(false); expect(f.kind).toBe('fence'); }
    expect(new Set([...FENCES, ...GATES].map((d) => d.id)).size).toBe(36);
  });
  it('every design has priced, coloured variants', () => {
    for (const d of [...FENCES, ...GATES]) {
      expect(d.price, d.id).toBeGreaterThan(0);
      expect(d.variants.length, d.id).toBeGreaterThanOrEqual(3);
      expect(d.height, d.id).toBeGreaterThan(0.3);
      for (const v of d.variants) { expect(v.main).toMatch(/^#[0-9a-f]{6}$/); expect(v.accent).toMatch(/^#[0-9a-f]{6}$/); }
    }
    for (const f of ROOF_FINISHES) expect(f.palettes.length).toBeGreaterThan(0);
    for (const p of TERRAIN_PAINTS) expect(p.price).toBeGreaterThan(0);
  });
  it('exterior objects are in the content registry with consistent stair footprints', async () => {
    const { content } = await import('../../../src/content/index');
    const db = content();
    expect(db.exterior).toBe(EXTERIOR);
    for (const o of EXTERIOR_OBJECTS) expect(db.objects[o.id]).toBeDefined();
    for (const s of STAIR_OBJECTS) {
      const st = s.stair!;
      if (st.kind === 'straight') expect(s.footprint.d).toBe(st.length);
      else expect(s.footprint.w).toBe(s.footprint.d);
      expect(s.category).toBe('stairs');
    }
    for (const id of ['gardenPlant', 'gardenWater', 'gardenWeed', 'gardenHarvest']) expect(db.interactions[id]?.behavior).toBe('garden');
  });
});

describe('fences and navigation', () => {
  it('fenceEdgeState reads fences and gates', () => {
    const { lot, run, state, hh } = setup();
    expect(fenceEdgeState(lot, 0, 'h', 3, 10)).toBe('open');
    expect(run(placeFenceRun(lot.id, hh.id, 0, { x: 2, z: 10 }, { x: 6, z: 10 }, 'picket-white')).ok).toBe(true);
    expect(fenceEdgeState(lot, 0, 'h', 3, 10)).toBe('wall');
    expect(run(placeGate(lot.id, hh.id, 0, { dir: 'h', x: 3, z: 10 }, 'gate-picket')).ok).toBe(true);
    expect(fenceEdgeState(lot, 0, 'h', 3, 10)).toBe('gate');
    expect(fenceEdgeState(lot, 0, 'h', 2, 10)).toBe('wall');
    expect(Object.keys(lot.fences!)).toHaveLength(4);
    expect(state.households[hh.id]!.funds).toBeLessThan(2000000);
  });

  it('an L drag builds both runs as one command with one transaction; undo restores the money and removes every piece', () => {
    const { lot, hh, run, stack, ctx, state } = setup();
    const funds = state.households[hh.id]!.funds;
    const entries = state.households[hh.id]!.ledger.length;
    const cmd = placeFencePath(lot.id, hh.id, 0, { x: 2, z: 12 }, { x: 6, z: 14 }, 'picket-white');
    expect(run(cmd).ok).toBe(true);
    expect(Object.keys(lot.fences!).sort()).toEqual(['0:h:2:12', '0:h:3:12', '0:h:4:12', '0:h:5:12', '0:v:6:12', '0:v:6:13']);
    expect(cmd.plan!.cost).toBe(6 * EXTERIOR.fences['picket-white']!.price);
    expect(state.households[hh.id]!.ledger.length).toBe(entries + 1); // one transact for both legs
    expect(state.households[hh.id]!.funds).toBe(funds - cmd.plan!.cost);
    stack.undo(ctx);
    expect(lot.fences).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(funds);
    expect(stack.redo(ctx)?.ok).toBe(true);
    expect(Object.keys(lot.fences!)).toHaveLength(6);
  });

  it('a rectangle drag builds a closed loop as one step; undo/redo; a gate still fits afterwards', () => {
    const { lot, hh, run, stack, ctx, state } = setup();
    const funds = state.households[hh.id]!.funds;
    const entries = state.households[hh.id]!.ledger.length;
    const cmd = placeFenceLoop(lot.id, hh.id, 0, { x: 2, z: 12 }, { x: 6, z: 15 }, 'picket-white');
    expect(run(cmd).ok).toBe(true);
    const keys = Object.keys(lot.fences!);
    expect(keys).toHaveLength(14); // 4 + 3 + 4 + 3 sides of the 4 x 3 rectangle
    for (const k of ['0:h:2:12', '0:h:5:12', '0:v:6:12', '0:v:6:14', '0:h:2:15', '0:h:5:15', '0:v:2:12', '0:v:2:14']) expect(lot.fences![k]).toBeDefined();
    expect(state.households[hh.id]!.ledger.length).toBe(entries + 1);
    expect(state.households[hh.id]!.funds).toBe(funds - cmd.plan!.cost);
    stack.undo(ctx);
    expect(lot.fences).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(funds);
    expect(stack.redo(ctx)?.ok).toBe(true);
    expect(Object.keys(lot.fences!)).toHaveLength(14);
    // a gate placed afterwards replaces the fence on its edge and leaves the loop closed
    expect(run(placeGate(lot.id, hh.id, 0, { dir: 'h', x: 3, z: 12 }, 'gate-picket')).ok).toBe(true);
    expect(lot.fences!['0:h:3:12']!.defId).toBe('gate-picket');
    expect(Object.keys(lot.fences!)).toHaveLength(14);
  });

  it('a rectangle loop that would shut a person in is refused by name, and a gate lets it through', () => {
    const { lot, hh, run, person, state } = setup();
    person('p1', 'Ada', 14.5, 14.5);
    const funds = state.households[hh.id]!.funds;
    const loop = () => placeFenceLoop(lot.id, hh.id, 0, { x: 13, z: 13 }, { x: 17, z: 17 }, 'picket-white');
    const refused = run(loop());
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/Ada/);
    expect(Object.keys(lot.fences ?? {})).toHaveLength(0);
    expect(state.households[hh.id]!.funds).toBe(funds);
    expect(run(placeGate(lot.id, hh.id, 0, { dir: 'h', x: 15, z: 13 }, 'gate-picket')).ok).toBe(true);
    expect(run(loop()).ok).toBe(true);
    expect(Object.keys(lot.fences!)).toHaveLength(16); // 16 sides, the gate kept as the doorway
  });

  it('a fence line blocks the route, a gate lets people through', () => {
    const { lot, run, nav, hh, house } = setup();
    house();
    // a line across the whole lot would cut the house off from the street entry: refused until it has a gate
    const line = () => placeFenceRun(lot.id, hh.id, 0, { x: 0, z: 12 }, { x: 24, z: 12 }, 'picket-white');
    const refused = run(line());
    expect(refused.ok).toBe(false);
    expect(Object.keys(lot.fences ?? {})).toHaveLength(0);
    expect(run(placeGate(lot.id, hh.id, 0, { dir: 'h', x: 12, z: 12 }, 'gate-picket')).ok).toBe(true);
    expect(run(line()).ok).toBe(true);
    expect(lot.fences!['0:h:12:12']!.defId).toBe('gate-picket'); // the run keeps the gate
    expect(Object.keys(lot.fences!)).toHaveLength(24);
    const path = nav.findPath(lot.id, 0, { x: 5, z: 20 }, [{ x: 5, z: 5 }]);
    expect(path).not.toBeNull();
    expect(path!.some((t) => t.x === 12 && (t.z === 12 || t.z === 11))).toBe(true);
    expect(nav.canStep(lot.id, 0, { x: 3, z: 12 }, { x: 3, z: 11 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 12, z: 12 }, { x: 12, z: 11 })).toBe(true);
  });

  it('refuses walls, the sky and the street side that shut people in', () => {
    const { lot, run, house, person, hh, state } = setup();
    house();
    expect(run(placeFenceRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 8, z: 4 }, 'picket-white')).ok).toBe(false); // on a wall
    expect(run(placeFenceRun(lot.id, hh.id, 0, { x: 0, z: 0 }, { x: 40, z: 0 }, 'picket-white')).ok).toBe(false); // off the lot
    expect(run(placeFenceRun(lot.id, hh.id, 0, { x: 1, z: 1 }, { x: 3, z: 3 }, 'picket-white')).ok).toBe(false); // diagonal
    person('p1', 'Ada', 14.5, 14.5);
    const funds = state.households[hh.id]!.funds;
    // a ring of fence around Ada without a gate
    for (const [a, b] of [[{ x: 13, z: 13 }, { x: 16, z: 13 }], [{ x: 13, z: 16 }, { x: 16, z: 16 }], [{ x: 13, z: 13 }, { x: 13, z: 16 }]] as const) {
      expect(run(placeFenceRun(lot.id, hh.id, 0, a, b, 'picket-white')).ok).toBe(true);
    }
    const closing = placeFenceRun(lot.id, hh.id, 0, { x: 16, z: 13 }, { x: 16, z: 16 }, 'picket-white');
    const r = run(closing);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Ada/);
    expect(state.households[hh.id]!.funds).toBeLessThan(funds);
    // with a gate in the last side it is fine
    expect(run(placeGate(lot.id, hh.id, 0, { dir: 'v', x: 16, z: 14 }, 'gate-picket')).ok).toBe(true);
    expect(run(placeFenceRun(lot.id, hh.id, 0, { x: 16, z: 13 }, { x: 16, z: 16 }, 'picket-white')).ok).toBe(true);
  });

  it('a fence ring around the house needs a gate (floored tiles must stay reachable)', () => {
    const { lot, hh, house, state } = setup();
    house();
    const ring = (gate: boolean) => {
      const edges = [] as Array<{ dir: 'h' | 'v'; x: number; z: number }>;
      for (let x = 2; x < 12; x++) { edges.push({ dir: 'h', x, z: 2 }); edges.push({ dir: 'h', x, z: 11 }); }
      for (let z = 2; z < 11; z++) { edges.push({ dir: 'v', x: 2, z }); edges.push({ dir: 'v', x: 12, z }); }
      return edges.filter((e) => !(gate && e.dir === 'h' && e.z === 11 && e.x === 6));
    };
    const noGate = planExterior(state, fixtureContent(), lot.id, hh.id, { kind: 'fence', level: 0, edges: ring(false), defId: 'picket-white' });
    expect(noGate.ok).toBe(false);
    expect(noGate.reasons.join(' ')).toMatch(/gate|cut/i);
    const withGap = planExterior(state, fixtureContent(), lot.id, hh.id, { kind: 'fence', level: 0, edges: ring(true), defId: 'picket-white' });
    expect(withGap.ok).toBe(true);
  });

  it('removing fences refunds and undo restores everything', () => {
    const { lot, hh, run, stack, ctx, state } = setup();
    const f0 = state.households[hh.id]!.funds;
    const build = placeFenceRun(lot.id, hh.id, 0, { x: 3, z: 3 }, { x: 7, z: 3 }, 'wrought-spear', 2);
    expect(run(build).ok).toBe(true);
    const price = EXTERIOR.fences['wrought-spear']!.price * 4;
    expect(state.households[hh.id]!.funds).toBe(f0 - price);
    expect(build.plan!.cost).toBe(price);
    // replace two edges with another design: new charged, old refunded (same day = full)
    const swap = placeFenceRun(lot.id, hh.id, 0, { x: 3, z: 3 }, { x: 5, z: 3 }, 'brick-low');
    expect(run(swap).ok).toBe(true);
    expect(swap.plan!.charge).toBe(EXTERIOR.fences['brick-low']!.price * 2);
    expect(swap.plan!.refund).toBe(EXTERIOR.fences['wrought-spear']!.price * 2);
    stack.undo(ctx);
    expect(lot.fences!['0:h:3:3']!.defId).toBe('wrought-spear');
    expect(state.households[hh.id]!.funds).toBe(f0 - price);
    const rm = removeFences(lot.id, hh.id, 0, [{ dir: 'h', x: 3, z: 3 }, { dir: 'h', x: 4, z: 3 }]);
    expect(run(rm).ok).toBe(true);
    expect(rm.plan!.refund).toBe(EXTERIOR.fences['wrought-spear']!.price * 2); // built today: full price back
    stack.undo(ctx);
    expect(Object.keys(lot.fences!)).toHaveLength(4);
    stack.undo(ctx);
    expect(lot.fences).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(f0);
    const re = stack.redo(ctx);
    expect(re?.ok).toBe(true);
    expect(Object.keys(lot.fences!)).toHaveLength(4);
    expect(state.households[hh.id]!.funds).toBe(f0 - price);
  });

  it('is free in the sandbox and rejects what the household cannot pay', () => {
    const poor = setup({ funds: 500 });
    expect(poor.run(placeFenceRun(poor.lot.id, poor.hh.id, 0, { x: 3, z: 3 }, { x: 9, z: 3 }, 'stone-dry')).ok).toBe(false);
    expect(poor.state.households[poor.hh.id]!.funds).toBe(500);
    const sandbox = setup({ funds: 0 });
    sandbox.state.settings.unlimitedFunds = true;
    const cmd = placeFenceRun(sandbox.lot.id, sandbox.hh.id, 0, { x: 3, z: 3 }, { x: 9, z: 3 }, 'stone-dry');
    expect(sandbox.run(cmd).ok).toBe(true);
    expect(cmd.plan!.cost).toBe(0);
    expect(sandbox.lot.fences!['0:h:3:3']!.purchasePrice).toBe(0);
  });

  it('upstairs fences need floor, and fenceContinues links a run', () => {
    const { lot, hh, run, floor } = setup();
    expect(run(placeFenceRun(lot.id, hh.id, 1, { x: 3, z: 3 }, { x: 5, z: 3 }, 'glass-frameless')).ok).toBe(false);
    floor(3, 2, 5, 3, 1);
    const r = run(placeFenceRun(lot.id, hh.id, 1, { x: 3, z: 3 }, { x: 5, z: 3 }, 'glass-frameless'));
    expect(r.ok).toBe(true);
    expect(lot.levels).toBeGreaterThanOrEqual(2);
    expect(fenceContinues(lot, lot.fences!['1:h:3:3']!)).toBe(true);
    expect(fenceContinues(lot, lot.fences!['1:h:4:3']!)).toBe(false);
  });

  it('every design builds pieces that stay near their edge', () => {
    for (const d of [...FENCES, ...GATES]) {
      const rods = fencePieces(d, { endPost: true });
      expect(rods.length, d.id).toBeGreaterThan(3);
      for (const r of rods) {
        for (const p of [r.a, r.b]) {
          expect(p[0], `${d.id} x`).toBeGreaterThanOrEqual(-0.2);
          expect(p[0], `${d.id} x`).toBeLessThanOrEqual(1.2);
          expect(p[1], `${d.id} y`).toBeGreaterThanOrEqual(-0.01);
          expect(p[1], `${d.id} y`).toBeLessThanOrEqual(d.height + 1.0);
          expect(Math.abs(p[2]), `${d.id} z`).toBeLessThanOrEqual(0.4);
        }
      }
      expect(fencePieces(d, { endPost: false }).length).toBeLessThanOrEqual(rods.length);
    }
  });
});

describe('roofs', () => {
  it('prices a roof by area, style and finish, and undo restores the money', () => {
    const { lot, hh, run, stack, ctx, state, house } = setup();
    house();
    const f0 = state.households[hh.id]!.funds;
    const spec = { ...defaultRoofSpec('gable'), finish: SHINGLE };
    const cmd = placeRoof(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 10, z: 8 }, spec);
    expect(run(cmd).ok).toBe(true);
    const price = Math.round(24 * (EXTERIOR.roofStyles.gable!.pricePerM2 + EXTERIOR.roofFinishes['asphalt-shingle']!.pricePerM2));
    expect(roofPrice('gable', SHINGLE, { x0: 4, z0: 4, x1: 10, z1: 8 })).toBe(price);
    expect(cmd.plan!.cost).toBe(price);
    expect(state.households[hh.id]!.funds).toBe(f0 - price);
    const roofs = Object.values(lot.roofs!);
    expect(roofs).toHaveLength(1);
    expect(roofs[0]).toMatchObject({ level: 0, x0: 4, z0: 4, x1: 10, z1: 8, styleId: 'gable', ridge: 'h' });
    expect(roofs[0]!.id).toMatch(/^roof_/);
    expect(roofBaseHeight(lot, 0, roofs[0]!)).toBeCloseTo(2.8);
    const roofId = roofs[0]!.id;
    expect(stack.undo(ctx)).toBeTruthy();
    expect(lot.roofs).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(f0);
    expect(stack.redo(ctx)?.ok).toBe(true);
    expect(Object.keys(lot.roofs!)).toEqual([roofId]);
    expect(state.households[hh.id]!.funds).toBe(f0 - price);
  });

  it('refuses roofs without floor, overlapping roofs, bad styles and floors above', () => {
    const { lot, hh, run, house } = setup();
    const spec = defaultRoofSpec('hip');
    expect(run(placeRoof(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 8, z: 8 }, spec)).ok).toBe(false); // no floor
    house();
    expect(run(placeRoof(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 10, z: 8 }, spec)).ok).toBe(true);
    expect(run(placeRoof(lot.id, hh.id, 0, { x: 5, z: 5 }, { x: 8, z: 7 }, spec)).ok).toBe(false); // overlap
    expect(run(placeRoof(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 4, z: 8 }, spec)).ok).toBe(false); // flat rectangle
    expect(run(placeRoof(lot.id, hh.id, 0, { x: 0, z: 0 }, { x: 40, z: 40 }, spec)).ok).toBe(false); // off the lot
    expect(run(placeRoof(lot.id, hh.id, 0, { x: 12, z: 12 }, { x: 14, z: 14 }, { ...spec, styleId: 'nope' })).ok).toBe(false);
  });

  it('a roof on the ground floor is refused when a floor sits above it', () => {
    const { lot, hh, state, floor, house } = setup();
    house();
    floor(5, 5, 7, 7, 1);
    const p = planExterior(state, fixtureContent(), lot.id, hh.id, { kind: 'roof', level: 0, rect: { x0: 4, z0: 4, x1: 10, z1: 8 }, spec: defaultRoofSpec('gable') });
    expect(p.ok).toBe(false);
    expect(p.reasons.join(' ')).toMatch(/above/);
  });

  it('auto roof covers the rooms of the top level, one roof per rectangle, and replaces on repeat', () => {
    const { lot, hh, run, house, floor, state, stack, ctx } = setup();
    house();
    // a second, separate room to the east
    addRectWalls(lot, 0, 14, 4, 18, 8, FF);
    floor(14, 4, 18, 8);
    expect(autoRoofRects(lot)).toEqual([{ level: 0, x0: 4, z0: 4, x1: 10, z1: 8 }, { level: 0, x0: 14, z0: 4, x1: 18, z1: 8 }]);
    const f0 = state.households[hh.id]!.funds;
    const cmd = placeAutoRoof(lot.id, hh.id, defaultRoofSpec('hip'));
    expect(run(cmd).ok).toBe(true);
    expect(Object.keys(lot.roofs!)).toHaveLength(2);
    expect(cmd.plan!.counts.roofs).toBe(2);
    expect(state.households[hh.id]!.funds).toBe(f0 - cmd.plan!.cost);
    // again with another style: the old roofs are replaced (refunded) in one step
    const again = placeAutoRoof(lot.id, hh.id, defaultRoofSpec('gable'));
    expect(run(again).ok).toBe(true);
    expect(again.plan!.counts.roofsRemoved).toBe(2);
    expect(Object.values(lot.roofs!).every((r) => r.styleId === 'gable')).toBe(true);
    expect(Object.keys(lot.roofs!)).toHaveLength(2);
    stack.undo(ctx);
    expect(Object.values(lot.roofs!).every((r) => r.styleId === 'hip')).toBe(true);
    stack.undo(ctx);
    expect(lot.roofs).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(f0);
  });

  it('auto roof roofs every level: the ground floor only where nothing stands above it', () => {
    const { lot, house, floor } = setup();
    house();
    addRectWalls(lot, 1, 4, 4, 7, 8, FF);
    floor(4, 4, 7, 8, 1);
    expect(autoRoofRects(lot)).toEqual([{ level: 0, x0: 7, z0: 4, x1: 10, z1: 8 }, { level: 1, x0: 4, z0: 4, x1: 7, z1: 8 }]);
    expect(autoRoofRects(lot, 1)).toEqual([{ level: 1, x0: 4, z0: 4, x1: 7, z1: 8 }]);
    // a stairwell (no floor above one ground tile) is still inside the upper room: it does not get a roof of its own
    delete lot.floors[tileKey(1, 5, 5)];
    expect(autoRoofRects(lot).filter((r) => r.level === 0)).toEqual([{ level: 0, x0: 7, z0: 4, x1: 10, z1: 8 }]);
  });

  it('auto roof needs a room; an L-shaped house gets two rectangles', () => {
    const { lot, hh, state } = setup();
    expect(planExterior(state, fixtureContent(), lot.id, hh.id, { kind: 'autoRoof', spec: defaultRoofSpec('gable') }).ok).toBe(false);
    addRectWalls(lot, 0, 2, 2, 8, 6, FF);
    for (let z = 2; z < 6; z++) for (let x = 2; x < 8; x++) lot.floors[tileKey(0, x, z)] = { ...OAK };
    addRectWalls(lot, 0, 2, 6, 5, 10, FF);
    for (let z = 6; z < 10; z++) for (let x = 2; x < 5; x++) lot.floors[tileKey(0, x, z)] = { ...OAK };
    // the shared edge is a wall (two rooms), so each room gets its own roof; with the wall removed it is one L-shaped room
    expect(autoRoofRects(lot).length).toBe(2);
  });

  it('erasing a roof refunds it and undo brings it back', () => {
    const { lot, hh, run, house, state, stack, ctx } = setup();
    house();
    expect(run(placeRoof(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 10, z: 8 }, defaultRoofSpec('flat'))).ok).toBe(true);
    const f1 = state.households[hh.id]!.funds;
    const cmd = removeRoof(lot.id, hh.id, 0, { tile: { x: 5, z: 5 } });
    expect(run(cmd).ok).toBe(true);
    expect(lot.roofs).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(f1 + cmd.plan!.refund);
    expect(cmd.plan!.refund).toBeGreaterThan(0);
    stack.undo(ctx);
    expect(Object.keys(lot.roofs!)).toHaveLength(1);
    expect(state.households[hh.id]!.funds).toBe(f1);
    expect(run(removeRoof(lot.id, hh.id, 0, { tile: { x: 20, z: 20 } })).ok).toBe(false);
  });

  it('a roof is a lot change of its own kind', () => {
    const { lot, hh, run, house, seen } = setup();
    house();
    run(placeRoof(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 10, z: 8 }, defaultRoofSpec('gable')));
    expect([...seen].reverse().find((e) => e.type === 'lot.changed')).toMatchObject({ what: 'roofs' });
    run(placeFenceRun(lot.id, hh.id, 0, { x: 2, z: 12 }, { x: 5, z: 12 }, 'picket-white'));
    expect([...seen].reverse().find((e) => e.type === 'lot.changed')).toMatchObject({ what: 'fences' });
  });

  it('builds a mesh for every style with sane bounds', () => {
    for (const st of ROOF_STYLES) {
      for (const [w, d] of [[6, 4], [5, 5], [3, 8]] as const) {
        for (const ridge of ['h', 'v'] as const) {
          const m = buildRoofMesh(st.id, w, d, ridge, st.pitch);
          expect(m.triangles, `${st.id} ${w}x${d}`).toBeGreaterThan(8);
          expect(m.parts.slope.pos.length, `${st.id} slope`).toBeGreaterThan(0);
          expect(m.parts.slope.pos.length).toBe(m.parts.slope.nor.length);
          expect(m.parts.slope.uv.length / 2).toBe(m.parts.slope.pos.length / 3);
          expect(m.maxY, st.id).toBeGreaterThan(0.05);
          expect(m.maxY, st.id).toBeLessThan(9);
          expect(m.minY, st.id).toBeGreaterThan(-1.2);
          const xs = m.parts.slope.pos.filter((_, i) => i % 3 === 0), zs = m.parts.slope.pos.filter((_, i) => i % 3 === 2);
          expect(Math.min(...xs), st.id).toBeGreaterThanOrEqual(-0.7);
          expect(Math.max(...xs), st.id).toBeLessThanOrEqual(w + 0.7);
          expect(Math.min(...zs), st.id).toBeGreaterThanOrEqual(-0.7);
          expect(Math.max(...zs), st.id).toBeLessThanOrEqual(d + 0.7);
          // every slope face points up or sideways (never under the roof)
          for (let i = 0; i < m.parts.slope.nor.length; i += 3) expect(m.parts.slope.nor[i + 1]!, `${st.id} normal`).toBeGreaterThanOrEqual(-1e-6);
        }
      }
    }
  });

  it('gable ends close with gable triangles, flat roofs do not, the clerestory has glass', () => {
    expect(buildRoofMesh('gable', 6, 4, 'h', 32).parts.gable.pos.length).toBeGreaterThan(0);
    expect(buildRoofMesh('hip', 6, 4, 'h', 28).parts.gable.pos.length).toBe(0);
    expect(buildRoofMesh('dutch-gable', 8, 6, 'h', 30).parts.gable.pos.length).toBeGreaterThan(0);
    expect(buildRoofMesh('clerestory', 6, 4, 'h', 12).parts.glass.pos.length).toBeGreaterThan(0);
    expect(buildRoofMesh('flat', 6, 4, 'h', 0).maxY).toBeLessThan(0.3);
    // a steeper pitch is taller; the pitch is clamped to the style's range
    expect(buildRoofMesh('gable', 6, 4, 'h', 45).maxY).toBeGreaterThan(buildRoofMesh('gable', 6, 4, 'h', 20).maxY);
    expect(buildRoofMesh('gable', 6, 4, 'h', 89).maxY).toBeCloseTo(buildRoofMesh('gable', 6, 4, 'h', 55).maxY, 5);
    expect(longRidge(6, 4)).toBe('h');
    expect(longRidge(3, 8)).toBe('v');
  });
});

describe('terrain paint', () => {
  it('paints open ground, prices it and undoes; the lot ground removes the entry', () => {
    const { lot, hh, run, stack, ctx, state } = setup();
    const f0 = state.households[hh.id]!.funds;
    const tiles = [{ x: 3, z: 3 }, { x: 4, z: 3 }, { x: 3, z: 4 }];
    const cmd = paintTerrain(lot.id, hh.id, tiles, 'gravel');
    expect(run(cmd).ok).toBe(true);
    expect(cmd.plan!.cost).toBe(3 * EXTERIOR.terrain.gravel!.price);
    expect(lot.terrain![tileKey(0, 3, 3)]).toBe('gravel');
    expect(terrainAt(lot, 3, 3)).toBe('gravel');
    expect(terrainAt(lot, 9, 9)).toBe('grass');
    expect(state.households[hh.id]!.funds).toBe(f0 - cmd.plan!.cost);
    // the same paint again changes nothing
    expect(run(paintTerrain(lot.id, hh.id, tiles, 'gravel')).ok).toBe(false);
    // painting the lot ground back removes the paint and costs nothing
    const back = paintTerrain(lot.id, hh.id, [{ x: 3, z: 3 }], 'grass');
    expect(run(back).ok).toBe(true);
    expect(back.plan!.cost).toBe(0);
    expect(lot.terrain![tileKey(0, 3, 3)]).toBeUndefined();
    stack.undo(ctx);
    expect(lot.terrain![tileKey(0, 3, 3)]).toBe('gravel');
    stack.undo(ctx);
    expect(lot.terrain).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(f0);
    expect(stack.redo(ctx)?.ok).toBe(true);
    expect(Object.keys(lot.terrain!)).toHaveLength(3);
  });

  it('refuses indoor and floored tiles, unknown paints and the empty drag', () => {
    const { lot, hh, run, house } = setup();
    house();
    expect(run(paintTerrain(lot.id, hh.id, [{ x: 5, z: 5 }], 'mulch')).ok).toBe(false); // inside the house
    expect(run(paintTerrain(lot.id, hh.id, [{ x: 30, z: 5 }], 'mulch')).ok).toBe(false); // off the lot
    expect(run(paintTerrain(lot.id, hh.id, [{ x: 12, z: 12 }], 'lava')).ok).toBe(false);
    expect(run(paintTerrain(lot.id, hh.id, [], 'mulch')).ok).toBe(false);
    // a mixed drag paints what it can
    const mixed = paintTerrain(lot.id, hh.id, [{ x: 5, z: 5 }, { x: 12, z: 12 }], 'mulch');
    expect(run(mixed).ok).toBe(true);
    expect(Object.keys(lot.terrain!)).toEqual([tileKey(0, 12, 12)]);
  });

  it('all paints are real, priced and distinct', () => {
    expect(new Set(TERRAIN_PAINTS.map((p) => p.id)).size).toBe(TERRAIN_PAINTS.length);
    for (const id of ['grass', 'dirt', 'paving']) expect(EXTERIOR.terrain[id]).toBeDefined();
    for (const p of TERRAIN_PAINTS) expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
