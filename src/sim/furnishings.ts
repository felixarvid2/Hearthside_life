// Milestone 13: behaviours of the furnishings that gained interactions (pottery, laundry) and the object test shared by the
// two-player game socials. Pure simulation.

import { potValue } from '../content/furnishingUse';
import { addFeed } from '../core/state';
import type { ActionInstance, Id, Person, WorldItem } from '../core/types';
import type { ObjRef, SimCtx } from './context';
import { isFridge, lotLoc, lotObjects, objectCenter } from './context';
import { interactionCheckNoCost } from './behaviors';
import { isBroken } from './housekeeping';
import type { Behavior, Step } from './steps';
import { clearUsePoint, objectCandidates, pickUsePoint, usePointGoal, usePointObject } from './steps';
import { makePlacedObject } from '../world/objects';
import { validatePlacement } from '../world/placement';

/** True when the person's lot and level has a working object with this tag (a pool table for Play Pool Together). */
export function nearbyObjectWithTag(ctx: SimCtx, p: Person, tag: string): boolean {
  const loc = lotLoc(p);
  if (!loc) return false;
  return lotObjects(ctx, loc.lotId, loc.level).some((r) => r.def.functional && r.def.tags.includes(tag) && !r.obj.condition.broken);
}

/**
 * Throw a Pot (behavior 'pottery' in behaviors.ts): an ordinary timed activity (Creativity xp, fun); on completion a Handmade Pot is placed on a free tile next to
 * the potter. Its recorded price is its value at the potter's Creativity level, so selling it in Build mode returns 80% of it.
 */
export function placePot(ctx: SimCtx, p: Person): void {
  {
    const loc = lotLoc(p);
    const def = ctx.content.objects['pot-handmade'];
    const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
    if (!loc || !def || !lot) return;
    const level = p.skills.creativity?.level ?? 1;
    const from = { x: Math.floor(loc.x), z: Math.floor(loc.z) };
    for (let r = 1; r <= 2; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const at = { x: from.x + dx, z: from.z + dz, rot: 0 as const, level: loc.level };
          if (!validatePlacement(ctx.state, ctx.content, lot.id, { defId: def.id, ...at }).ok) continue;
          const obj = makePlacedObject(ctx.state, def, at, {
            ownerHouseholdId: lot.ownerHouseholdId, purchasePrice: potValue(level), boughtAt: ctx.now - 1440,
          });
          lot.objects[obj.id] = obj;
          ctx.events.emit({ type: 'lot.changed', lotId: lot.id, what: 'objects' });
          addFeed(ctx.state, ctx.events, 'info', `${p.firstName} threw a pot.`, p.id);
          return;
        }
      }
    }
    addFeed(ctx.state, ctx.events, 'info', `${p.firstName} threw a pot, but there was no room to put it down.`, p.id);
  }
}

// ---------------------------------------------------------------------------------------------
// Fish in the fridge (Milestone 13)
// ---------------------------------------------------------------------------------------------

/** A stored fish spoils this many times more slowly than one lying about. */
export const FRIDGE_SPOIL_FACTOR = 3;

/** Fish kept in a fridge on the lot, usable by the household (oldest first). */
export function storedFish(ctx: Pick<SimCtx, 'state'>, lotId: Id, householdId: Id): WorldItem[] {
  return Object.values(ctx.state.items)
    .filter((it) => it.kind === 'fish' && it.stored === true && it.lotId === lotId && (it.ownerHouseholdId === null || it.ownerHouseholdId === householdId))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/** Puts a fish into a fridge: it leaves the floor view, and its remaining shelf life is stretched. */
export function storeFishIn(ctx: SimCtx, item: WorldItem, fridge: ObjRef): void {
  const c = objectCenter(fridge);
  item.position = { x: c.x, z: c.z, level: fridge.obj.level, onObjectId: fridge.obj.id };
  item.stored = true;
  item.spoilsAt = ctx.now + Math.max(0, item.spoilsAt - ctx.now) * FRIDGE_SPOIL_FACTOR;
  ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
}

/** Takes the oldest stored fish of the household out of the fridge for cooking (deleted); null when there is none. */
export function takeStoredFish(ctx: SimCtx, lotId: Id, householdId: Id): WorldItem | null {
  const fish = storedFish(ctx, lotId, householdId)[0];
  if (!fish) return null;
  delete ctx.state.items[fish.id];
  ctx.events.emit({ type: 'item.changed', itemId: fish.id, lotId: fish.lotId });
  return fish;
}

/** Working fridges on the person's level and lot (broken ones excluded). */
function fridgesOn(ctx: SimCtx, p: Person): ObjRef[] {
  const loc = lotLoc(p);
  return loc ? lotObjects(ctx, loc.lotId, loc.level).filter((r) => isFridge(r.def) && !isBroken(r.obj)) : [];
}

function itemOf(ctx: SimCtx, a: ActionInstance): WorldItem | undefined {
  return a.target.kind === 'item' ? ctx.state.items[a.target.itemId] : undefined;
}

/**
 * Put a caught fish in the fridge (item interaction on a fish): walk to the fish, pick it up, walk to a fridge, put it
 * away. The fish then counts as a raw ingredient for "Cook the Catch" and is hidden from the floor.
 */
export const storeFishBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheckNoCost(ctx, p, a);
    if (r) return r;
    const loc = lotLoc(p);
    const item = itemOf(ctx, a);
    if (!item || item.kind !== 'fish' || !loc || item.lotId !== loc.lotId) return 'The fish is gone.';
    if (item.stored) return 'It is already in the fridge.';
    if (item.ownerHouseholdId && item.ownerHouseholdId !== p.householdId) return "That's someone else's catch.";
    return fridgesOn(ctx, p).length > 0 ? null : 'Needs a fridge.';
  },
  reserve(ctx, p, a) {
    const loc = lotLoc(p);
    const item = itemOf(ctx, a);
    if (!loc || !item) return 'The fish is gone.';
    a.data.stage = 0;
    return pickUsePoint(ctx, p, a, 'use', [{ objectId: item.id, tile: { x: Math.floor(item.position.x), z: Math.floor(item.position.z), level: item.position.level } }], { plan: true, what: 'fish' });
  },
  step(ctx, p, a): Step | string {
    const stage = typeof a.data.stage === 'number' ? a.data.stage : 0;
    if (stage === 0) {
      const item = itemOf(ctx, a);
      if (!item) return 'The fish is gone.';
      const x = a.data.useX, z = a.data.useZ;
      if (typeof x !== 'number' || typeof z !== 'number') return 'The fish is gone.';
      return {
        goal: { kind: 'tile', tile: { x, z, level: item.position.level }, face: { x: item.position.x, z: item.position.z }, label: 'the fish' },
        posture: 'standing', performAnim: 'pickUp', duration: { kind: 'fixed', minutes: 1 }, rates: {},
      };
    }
    const goal = usePointGoal(ctx, p, a, 'use');
    if (typeof goal === 'string') return goal;
    return { goal, posture: 'standing', performAnim: 'openFridge', duration: { kind: 'fixed', minutes: 2 }, rates: {} };
  },
  next(ctx, p, a) {
    if ((typeof a.data.stage === 'number' ? a.data.stage : 0) !== 0) return false;
    const loc = lotLoc(p);
    if (!loc) return `${p.firstName} isn't here.`;
    clearUsePoint(a, 'use');
    a.data.stage = 1;
    a.route = [];
    const cands = fridgesOn(ctx, p).flatMap((f) => objectCandidates(ctx, loc.lotId, f.obj.id, []));
    return pickUsePoint(ctx, p, a, 'use', cands, { plan: true, what: 'fridge' }) ?? true;
  },
  apply(ctx, p, a) {
    const item = itemOf(ctx, a);
    const fridge = usePointObject(ctx, p, a, 'use');
    if (!item || item.kind !== 'fish' || !fridge) return;
    storeFishIn(ctx, item, fridge);
    addFeed(ctx.state, ctx.events, 'info', `${p.firstName} put the fish in the fridge.`, p.id);
  },
  interruptible: false,
};
