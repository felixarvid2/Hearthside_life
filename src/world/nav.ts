// LotNav: the world's NavProvider (core/nav.ts). Grid A* over a lot level with walls, doors, windows and
// blocking furniture (rules in ./navgrid.ts). Grids are built lazily per lot and level and cached until
// invalidate(lotId); a cached grid is also dropped automatically when the lot record itself was replaced
// (new game or load). Pass an EventBus to invalidate on 'lot.changed' and 'state.replaced' automatically.

import type { ContentDB } from '../content/types';
import type { EventBus } from '../core/events';
import { tileKey } from '../core/ids';
import type { NavProvider, Tile, WorldSlot } from '../core/nav';
import type { Id, Lot, WorldState } from '../core/types';
import { hasLevel } from './lots';
import { buildNavGrid, canStepGrid, findPathGrid, isFree, type NavGrid } from './navgrid';
import { slotAccess, standTiles } from './slots';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Key of a tile in `findPath(..., { blocked })` sets: tileKey(level, x, z) from core/ids
 * (the shorter `${x},${z}` form is accepted too).
 */
export function navBlockKey(level: number, x: number, z: number): string { return tileKey(level, x, z); }

export class LotNav implements NavProvider {
  private cache = new Map<string, { lot: Lot; grid: NavGrid }>();
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
      const free = blocked && blocked.size > 0
        ? (x: number, z: number) => isFree(g, x, z) && !blocked.has(tileKey(level, x, z)) && !blocked.has(`${x},${z}`)
        : (x: number, z: number) => isFree(g, x, z);
      result = findPathGrid(g, from, goals, free);
    }
    this.lastRouteMs = now() - t0;
    return result;
  }

  isWalkable(lotId: Id, level: number, x: number, z: number): boolean {
    const g = this.grid(lotId, level);
    return !!g && isFree(g, x, z);
  }

  canStep(lotId: Id, level: number, from: Tile, to: Tile): boolean {
    const g = this.grid(lotId, level);
    return !!g && canStepGrid(g, from, to);
  }

  /** Slots with the approach tile people actually use on the current lot (see world/slots.ts). */
  slotsOf(lotId: Id, objectId: Id): WorldSlot[] {
    const lot = this.getState().lots[lotId];
    const obj = lot?.objects[objectId];
    const def = obj ? this.content.objects[obj.defId] : undefined;
    if (!lot || !obj || !def) return [];
    const g = this.grid(lotId, obj.level);
    if (!g) return [];
    return slotAccess({ grid: g, content: this.content, objectById: (id) => lot.objects[id] }, obj, def).map((a) => a.slot);
  }

  standTilesNear(lotId: Id, objectId: Id): Tile[] {
    const lot = this.getState().lots[lotId];
    const obj = lot?.objects[objectId];
    const def = obj ? this.content.objects[obj.defId] : undefined;
    if (!obj || !def) return [];
    const g = this.grid(lotId, obj.level);
    return g ? standTiles(g, obj, def) : [];
  }

  invalidate(lotId: Id): void {
    const prefix = `${lotId}#`;
    for (const k of [...this.cache.keys()]) if (k.startsWith(prefix)) this.cache.delete(k);
  }

  /** Drops every cached grid (after loading or replacing the state). */
  invalidateAll(): void { this.cache.clear(); }

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
