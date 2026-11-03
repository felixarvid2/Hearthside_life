// Small authoring kit for generated lot layouts (venues and homes): shorthand for furnishings, openings and floor areas, plan
// translation for lots larger than the plan, and the check that a plan fits its lot.

import { footprintTiles } from '../core/geometry';
import type { Tile } from '../core/nav';
import type { ContentDB } from '../content/types';
import type { Lot, PlacedObject, Rot } from '../core/types';
import type { HousePlan, SurfaceChoice } from './housekit';

export type Furn = HousePlan['furniture'][number];
export type Opening = HousePlan['openings'][number];

export const P = (design: string, palette = 0): SurfaceChoice => ({ design, palette });

/** One furnishing. */
export const F = (defId: string, x: number, z: number, rot: Rot = 0): Furn => ({ defId, x, z, rot });

/** `n` copies of a furnishing in a row from (x, z), stepping (dx, dz) per copy. */
export function line(defId: string, x: number, z: number, n: number, dx: number, dz: number, rot: Rot = 0): Furn[] {
  return Array.from({ length: n }, (_, i) => F(defId, x + i * dx, z + i * dz, rot));
}

/** A window or door on every tile of a wall stretch. `dir` 'h' runs along +x from (x, z), 'v' along +z. */
export function openings(defId: string, dir: 'h' | 'v', x: number, z: number, n: number, flip = false): Opening[] {
  return Array.from({ length: n }, (_, i) => ({ dir, x: dir === 'h' ? x + i : x, z: dir === 'v' ? z + i : z, defId, flip }));
}

/** Rectangular tile area (inclusive corners) for HousePlan.floorAreas. */
export function area(x0: number, z0: number, x1: number, z1: number, finish: SurfaceChoice): NonNullable<HousePlan['floorAreas']>[number] {
  return { x0, z0, x1, z1, finish };
}

/** Wall run helper: a rectangle outline as four runs between grid vertices. */
export function outline(x0: number, z0: number, x1: number, z1: number): HousePlan['walls'] {
  return [
    [{ x: x0, z: z0 }, { x: x1, z: z0 }], [{ x: x0, z: z1 }, { x: x1, z: z1 }],
    [{ x: x0, z: z0 }, { x: x0, z: z1 }], [{ x: x1, z: z0 }, { x: x1, z: z1 }],
  ];
}

/** Translates a plan by whole tiles (layouts are centred on lots larger than the plan). */
export function shiftPlan(plan: HousePlan, dx: number, dz: number): HousePlan {
  if (dx === 0 && dz === 0) return plan;
  const t = (p: Tile): Tile => ({ x: p.x + dx, z: p.z + dz });
  return {
    ...plan,
    walls: plan.walls.map(([a, b]) => [t(a), t(b)]),
    openings: plan.openings.map((o) => ({ ...o, x: o.x + dx, z: o.z + dz })),
    rooms: plan.rooms.map((r) => ({ ...r, probe: t(r.probe) })),
    ...(plan.featureWalls ? { featureWalls: plan.featureWalls.map((w) => ({ ...w, x: w.x + dx, z: w.z + dz })) } : {}),
    ...(plan.floorAreas ? { floorAreas: plan.floorAreas.map((a) => ({ ...a, x0: a.x0 + dx, x1: a.x1 + dx, z0: a.z0 + dz, z1: a.z1 + dz })) } : {}),
    path: { ...plan.path, to: t(plan.path.to) },
    furniture: plan.furniture.map((f) => ({ ...f, x: f.x + dx, z: f.z + dz })),
    ...(plan.upper ? {
      upper: {
        ...plan.upper,
        walls: plan.upper.walls.map(([a, b]) => [t(a), t(b)] as [Tile, Tile]),
        openings: plan.upper.openings.map((o) => ({ ...o, x: o.x + dx, z: o.z + dz })),
        rooms: plan.upper.rooms.map((r) => ({ ...r, probe: t(r.probe) })),
        furniture: plan.upper.furniture.map((f) => ({ ...f, x: f.x + dx, z: f.z + dz })),
      },
    } : {}),
  };
}

/** Checks the lot is big enough and empty, and returns the offset that centres a plan of `size` tiles on it. */
export function planOffset(lot: Lot, size: number, label: string): { dx: number; dz: number } {
  if (lot.width < size || lot.depth < size) throw new Error(`${label}: lot ${lot.id} must be at least ${size} x ${size} tiles`);
  if (lot.entry.level !== 0) throw new Error(`${label}: the lot entry must be on the ground floor`);
  return { dx: Math.floor((lot.width - size) / 2), dz: Math.floor((lot.depth - size) / 2) };
}

/**
 * A finish chosen for every placed object of a design (recolours chairs, sofas and the like to suit a room). A list of swatches
 * is handed out in turn in placement order, so a row of chairs or stalls gets a pleasant mix.
 */
export interface Tint { defId: string; region: string; swatch: string | readonly string[] }

/** Applies tints to the placed objects of a lot. Throws on a region or swatch the design does not have, so a typo surfaces in tests. */
export function applyTints(content: ContentDB, objects: Iterable<PlacedObject>, tints: readonly Tint[], label: string): void {
  for (const t of tints) {
    const def = content.objects[t.defId];
    const region = def?.finishes.find((r) => r.id === t.region);
    const list = typeof t.swatch === 'string' ? [t.swatch] : t.swatch;
    if (!def || !region || list.length === 0 || !list.every((id) => region.swatches.some((sw) => sw.id === id))) throw new Error(`${label}: bad tint ${t.defId}/${t.region}/${list.join(',')}`);
  }
  const used = new Map<Tint, number>();
  for (const o of objects) {
    for (const t of tints) {
      if (o.defId !== t.defId) continue;
      const list = typeof t.swatch === 'string' ? [t.swatch] : t.swatch;
      const n = used.get(t) ?? 0;
      used.set(t, n + 1);
      o.finishes[t.region] = list[n % list.length]!;
    }
  }
}

/** Shorthand for a tint. */
export const T = (defId: string, region: string, swatch: string | readonly string[]): Tint => ({ defId, region, swatch });

/**
 * Drops purely decorative furnishings (trees, shrubs, lamps, planters, plants, benches, bins) that stand on the lot entry, so a
 * lot whose entry is not in the middle of the south edge still gets built (the layouts assume the usual entry).
 */
export function withoutDecorOnEntry(content: ContentDB, lot: Pick<Lot, 'entry'>, plan: HousePlan): HousePlan {
  const onEntry = (f: HousePlan['furniture'][number]): boolean => {
    const def = content.objects[f.defId];
    if (!def || def.interactions.some((i) => i !== 'waterPlant' && i !== 'sit')) return false;
    return footprintTiles(f.x, f.z, def.footprint, f.rot).some((t) => t.x === lot.entry.x && t.z === lot.entry.z);
  };
  return plan.furniture.some(onEntry) ? { ...plan, furniture: plan.furniture.filter((f) => !onEntry(f)) } : plan;
}
