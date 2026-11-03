// Milestone 9 gardening, simulation side: the 'garden' behaviour behind the plant, water, weed and harvest interactions
// (content/exterior.ts GARDEN_INTERACTIONS). The rules (growth by game day, watering and weeds, yields, perennials) are pure and live
// in world/gardenGrowth.ts, re-exported here; the daily growth step runs from Simulation.dailyRollover (advanceGardens).
//
// Seeds cost the interaction's `cost`, charged through the generic cost rules (chargeCost) when the work begins. Gardening XP comes from
// the interaction's `skill`. A harvest sells the produce at the market stall for 75 % of its value and pays the household once per
// harvest with transact() under the occurrence `harvest:<object>:<count>`; a feed entry says what was picked.

import { dayIndex } from '../core/clock';
import { addFeed, transact } from '../core/state';
import type { Person, PlacedObject } from '../core/types';
import { chargeCost, defOf, interactionCheck, primaryStep, reservePrimary, targetObject } from './behaviors';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import type { Behavior } from './steps';
import { gardenReason, harvest, plant, water, weed } from '../world/gardenGrowth';

export * from '../world/gardenGrowth';

const today = (ctx: SimCtx): number => dayIndex(ctx.now);

export const gardenBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const ref = targetObject(ctx, p, a);
    if (!ref) return 'It is gone.';
    return gardenReason(a.interactionId, ref.obj, today(ctx));
  },
  reserve: (ctx, p, a) => reservePrimary(ctx, p, a, []),
  step(ctx, p, a) {
    const s = primaryStep(ctx, p, a);
    return typeof s === 'string' ? s : { ...s, posture: 'standing', performAnim: defOf(ctx, a).anims.perform };
  },
  begin: chargeCost,
  apply(ctx, p, a) {
    const ref = targetObject(ctx, p, a), loc = lotLoc(p);
    if (!ref || !loc) return;
    const day = today(ctx);
    switch (a.interactionId) {
      case 'gardenPlant': plant(ref.obj, day); break;
      case 'gardenWater': water(ref.obj, day); break;
      case 'gardenWeed': weed(ref.obj, day); break;
      case 'gardenHarvest': harvestInto(ctx, p, ref.obj); break;
      default: return;
    }
    ctx.events.emit({ type: 'object.changed', objectId: ref.obj.id, lotId: loc.lotId, what: 'garden' });
  },
  interruptible: true,
};

function harvestInto(ctx: SimCtx, p: Person, obj: PlacedObject): void {
  const count = obj.garden?.harvests ?? 0;
  const r = harvest(obj, today(ctx), p.skills.gardening?.level ?? 1);
  if (!r) return;
  if (r.earned > 0) transact(ctx.state, ctx.events, p.householdId, r.earned, 'sale', `${r.crop.name} from the garden`, { occurrence: `harvest:${obj.id}:${count}` });
  addFeed(ctx.state, ctx.events, 'money', `${p.firstName} picked ${r.pieces} ${r.crop.name.toLowerCase()} and sold them for $${(r.earned / 100).toFixed(2)}.`, p.id);
}
