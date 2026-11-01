// Runtime reservations of specific object slots, stand tiles, serving surfaces, meal portions and
// conversation partners. Reservations are never stored in WorldState: they are a pure function of the
// people's action queues (see reservationKeys) and Simulation.rebuild() recreates them after a load.

import type { ActionInstance, ActionPhase, Id } from '../core/types';

/** Phases in which an action holds its reservations. */
export const RESERVING_PHASES: ReadonlySet<ActionPhase> = new Set<ActionPhase>([
  'reserve', 'route', 'prepare', 'perform', 'apply', 'cleanup',
]);

/**
 * Use points stored in ActionInstance.data under these prefixes: `<p>Obj` (object id), and either
 * `<p>Slot` (slot id) or `<p>X`/`<p>Z` (stand tile). 'use' = the primary object, 'stove' = cooking
 * station, 'seat' = a chair/sofa used for the activity, 'surf' = serving surface, 'wash' = sink or dishwasher.
 */
export const USE_POINT_PREFIXES = ['use', 'stove', 'seat', 'surf', 'wash'] as const;
export type UsePointPrefix = (typeof USE_POINT_PREFIXES)[number];

/** Reservation keys an action holds, derived only from its serializable fields. */
export function reservationKeys(a: ActionInstance): string[] {
  const keys: string[] = [];
  const d = a.data;
  for (const p of USE_POINT_PREFIXES) {
    const obj = d[`${p}Obj`];
    if (typeof obj !== 'string') continue;
    const slot = d[`${p}Slot`];
    const x = d[`${p}X`], z = d[`${p}Z`];
    if (typeof slot === 'string') keys.push(`slot:${obj}:${slot}`);
    else if (typeof x === 'number' && typeof z === 'number') keys.push(`tile:${x},${z}`);
    if (p === 'surf') keys.push(`surface:${obj}`);
  }
  if (a.target.kind === 'item' && d.itemTaken !== true) keys.push(`item:${a.target.itemId}`);
  if (a.target.kind === 'person' && d.social === true && d.role !== 'listen') keys.push(`person:${a.target.personId}`);
  return keys;
}

export const slotKey = (objectId: Id, slotId: string) => `slot:${objectId}:${slotId}`;
export const tileResKey = (x: number, z: number) => `tile:${x},${z}`;
export const personKey = (personId: Id) => `person:${personId}`;
export const surfaceKey = (objectId: Id) => `surface:${objectId}`;

/** Runtime reservation table. Item keys (`item:<id>`) are counted against the item's portions. */
export class Reservations {
  private holders = new Map<string, Id>();
  private items = new Map<Id, Set<Id>>();
  private byAction = new Map<Id, string[]>();

  clear(): void {
    this.holders.clear();
    this.items.clear();
    this.byAction.clear();
  }

  /** Action id holding a (non-item) key. */
  holder(key: string): Id | undefined { return this.holders.get(key); }

  /** True when nobody but `actionId` holds the key. */
  isFree(key: string, actionId?: Id): boolean {
    const h = this.holders.get(key);
    return h === undefined || h === actionId;
  }

  /** Number of portions of an item reserved by actions other than `exceptActionId`. */
  itemReserved(itemId: Id, exceptActionId?: Id): number {
    const set = this.items.get(itemId);
    if (!set) return 0;
    return exceptActionId !== undefined && set.has(exceptActionId) ? set.size - 1 : set.size;
  }

  /** Acquires every key or none. `itemCapacity` returns how many portions an item can serve. */
  acquire(actionId: Id, keys: string[], itemCapacity: (itemId: Id) => number): boolean {
    for (const key of keys) {
      if (key.startsWith('item:')) {
        const id = key.slice(5);
        if (this.itemReserved(id, actionId) >= itemCapacity(id)) return false;
      } else if (!this.isFree(key, actionId)) return false;
    }
    const held = new Set(this.byAction.get(actionId) ?? []);
    for (const key of keys) {
      if (key.startsWith('item:')) {
        const id = key.slice(5);
        let set = this.items.get(id);
        if (!set) { set = new Set(); this.items.set(id, set); }
        set.add(actionId);
      } else this.holders.set(key, actionId);
      held.add(key);
    }
    this.byAction.set(actionId, [...held]);
    return true;
  }

  /** Releases everything an action holds. */
  release(actionId: Id): void {
    const keys = this.byAction.get(actionId);
    if (!keys) return;
    for (const key of keys) {
      if (key.startsWith('item:')) {
        const id = key.slice(5);
        const set = this.items.get(id);
        set?.delete(actionId);
        if (set && set.size === 0) this.items.delete(id);
      } else if (this.holders.get(key) === actionId) this.holders.delete(key);
    }
    this.byAction.delete(actionId);
  }

  /** Replaces an action's holdings with exactly `keys` (all or nothing; on failure it holds nothing). */
  sync(actionId: Id, keys: string[], itemCapacity: (itemId: Id) => number): boolean {
    this.release(actionId);
    return this.acquire(actionId, keys, itemCapacity);
  }

  /** Keys an action currently holds. */
  heldBy(actionId: Id): string[] { return [...(this.byAction.get(actionId) ?? [])]; }

  /** Sorted list of `key=actionId` entries for tests and the developer overlay. */
  snapshot(): string[] {
    const out: string[] = [];
    for (const [k, a] of this.holders) out.push(`${k}=${a}`);
    for (const [id, set] of this.items) for (const a of set) out.push(`item:${id}=${a}`);
    return out.sort();
  }

  get size(): number {
    let n = this.holders.size;
    for (const set of this.items.values()) n += set.size;
    return n;
  }
}
