// LotNav: the world's NavProvider (core/nav.ts). Grid A* over a lot level with walls, doors, windows and
// blocking furniture (rules in ./navgrid.ts). Grids are built lazily per lot and level and cached until
// invalidate(lotId); a cached grid is also dropped automatically when the lot record itself was replaced
// (new game or load). Pass an EventBus to invalidate on 'lot.changed' and 'state.replaced' automatically.

import type { ContentDB } from '../content/types';
import type { EventBus } from '../core/events';
import { tileKey } from '../core/ids';
import type { NavProvider, Tile, WorldSlot } from '../core/nav';
import type { Id, Lot, WorldState } from '../core/types';
import { findPathAll, usableLinks, type MultiGoal } from './levelNav';
import { stairLinks, type StairLink } from './levels';
import { hasLevel } from './lots';
import { buildNavGrid, canStepGrid, findPathGrid, isFree, type NavGrid } from './navgrid';
import { standTiles, usableSlots } from './slots';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Key of a tile in `findPath(..., { blocked })` sets: tileKey(level, x, z) from core/ids
 * (the shorter `${x},${z}` form is accepted too).
 */
export function navBlockKey(level: number, x: number, z: number): string { return tileKey(level, x, z); }

export class LotNav implements NavProvider {
  private cache = new Map<string, { lot: Lot; grid: NavGrid }>();
  private linkCache = new Map<string, { lot: Lot; links: StairLink[] }>();
  private routeRequests = 0;
  private lastRouteMs = 0;

  constructor(private getState: () => WorldState, private content: ContentDB, events?: EventBus) {
    if (events) {
      events.on('lot.changed', (e) => this.invalidate(e.lotId));
      events.on('state.replaced', () => this.invalidateAll());
    }
  }

  findPath(lotId: Id, level: number, from: Tile, goals: Tile[], opts?: { blocked?: ReadonlySet<string> }): Tile[] | null {
    const t0 = now();
    this.routeRequests++;
    const g = this.grid(lotId, level);
    let result: Tile[] | null = null;
    if (g) {
      const blocked = opts?.blocked;
      const freeOn = (l: number, gr: NavGrid) => (blocked && blocked.size > 0
        ? (x: number, z: number) => isFree(gr, x, z) && !blocked.has(tileKey(l, x, z)) && !(l === level && blocked.has(`${x},${z}`))
        : (x: number, z: number) => isFree(gr, x, z));
      const here = goals.filter((t) => (t.level ?? level) === level);
      // the usual case first: everything on one level (and byte-for-byte the pre-stairs search)
      if (here.length > 0) result = findPathGrid(g, from, here, freeOn(level, g));
      if (result === null) {
        const links = this.links(lotId);
        if (links.length > 0) result = this.crossLevels(lotId, level, from, goals, freeOn, links);
      }
    }
    this.lastRouteMs = now() - t0;
    return result;
  }

  /** The multi-level search (staircases); null when the lot has no usable staircase. */
  private crossLevels(
    lotId: Id, level: number, from: Tile, goals: Tile[], freeOn: (l: number, g: NavGrid) => (x: number, z: number) => boolean, all: StairLink[],
  ): Tile[] | null {
    const lot = this.getState().lots[lotId];
    if (!lot) return null;
    const grids: NavGrid[] = [];
    for (let l = 0; l < Math.max(lot.levels, level + 1); l++) {
      const gr = this.grid(lotId, l);
      if (!gr) break;
      grids.push(gr);
    }
    const links = usableLinks(grids, all);
    if (links.length === 0) return null;
    const mg: MultiGoal[] = goals.filter((t) => (t.level ?? level) < grids.length).map((t) => ({ x: t.x, z: t.z, level: t.level ?? level }));
    return findPathAll({ grids, links }, { x: from.x, z: from.z, level }, mg, (l) => freeOn(l, grids[l]!));
  }

  /** Staircase links of a lot (cached with its grids). */
  links(lotId: Id): StairLink[] {
    const lot = this.getState().lots[lotId];
    if (!lot) return [];
    const key = `${lotId}#links`;
    const hit = this.linkCache.get(key);
    if (hit && hit.lot === lot) return hit.links;
    const links = stairLinks(lot, this.content);
    this.linkCache.set(key, { lot, links });
    return links;
  }

  isWalkable(lotId: Id, level: number, x: number, z: number): boolean {
    const g = this.grid(lotId, level);
    return !!g && isFree(g, x, z);
  }

  canStep(lotId: Id, level: number, from: Tile, to: Tile): boolean {
    const g = this.grid(lotId, level);
    return !!g && canStepGrid(g, from, to);
  }

  /** Usable slots only, with the approach tile people actually use on the current lot (see world/slots.ts). */
  slotsOf(lotId: Id, objectId: Id): WorldSlot[] {
    const lot = this.getState().lots[lotId];
    const obj = lot?.objects[objectId];
    const def = obj ? this.content.objects[obj.defId] : undefined;
    if (!lot || !obj || !def) return [];
    const g = this.grid(lotId, obj.level);
    if (!g) return [];
    const slots = usableSlots({ grid: g, content: this.content, objectById: (id) => lot.objects[id] }, obj, def);
    // above the ground floor the approach tile says which floor it is on
    return obj.level > 0 ? slots.map((s) => ({ ...s, level: obj.level, approach: { ...s.approach, level: obj.level } })) : slots;
  }

  standTilesNear(lotId: Id, objectId: Id): Tile[] {
    const lot = this.getState().lots[lotId];
    const obj = lot?.objects[objectId];
    const def = obj ? this.content.objects[obj.defId] : undefined;
    if (!obj || !def) return [];
    const g = this.grid(lotId, obj.level);
    if (!g) return [];
    const tiles = standTiles(g, obj, def);
    return obj.level > 0 ? tiles.map((t) => ({ ...t, level: obj.level })) : tiles;
  }

  invalidate(lotId: Id): void {
    const prefix = `${lotId}#`;
    for (const k of [...this.cache.keys()]) if (k.startsWith(prefix)) this.cache.delete(k);
    this.linkCache.delete(`${lotId}#links`);
  }

  /** Drops every cached grid (after loading or replacing the state). */
  invalidateAll(): void { this.cache.clear(); this.linkCache.clear(); }

  stats(): { routeRequests: number; lastRouteMs: number } {
    return { routeRequests: this.routeRequests, lastRouteMs: this.lastRouteMs };
  }

  /** The cached grid of a lot level (built on demand); null for unknown lots or levels. */
  grid(lotId: Id, level: number): NavGrid | null {
    const lot = this.getState().lots[lotId];
    if (!lot || !hasLevel(lot, level)) return null;
    const key = `${lotId}#${level}`;
    const hit = this.cache.get(key);
    if (hit && hit.lot === lot) return hit.grid;
    const grid = buildNavGrid(lot, this.content, level);
    this.cache.set(key, { lot, grid });
    return grid;
  }
}
