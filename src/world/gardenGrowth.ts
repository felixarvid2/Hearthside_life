// Milestone 9 gardening, pure rules: growth state of crop beds (vegetable patch, orchard tree, herb planter), the daily growth step,
// harvests and why an interaction is not possible (content/exterior.ts has the crops). sim/garden.ts wraps them in the 'garden' behaviour.
//
// Growth runs on game days and is deterministic: PlacedObject.garden holds the state, advanceGardens(state, day) steps it once per
// rollover (a missed stretch is caught up, at most CATCH_UP_DAYS), and the only "randomness" is a hash of the object id and the day.
//   - A crop needs `need` effective growing days. A watered bed (water above WET) grows a full day, a dry one a third, a weedy one half.
//     Nothing ever dies or rots: a dry plant just wilts (visual) and grows slowly, so neglect costs time, never the garden.
//   - Water falls by half a day's worth each day, weeds creep in by 0.1 to 0.2 per day.
//   - Annual crops are spent after the harvest (the bed is empty again); perennials (herbs, fruit trees, strawberries) regrow in `regrow` days.
//   - A harvest yields the crop's range plus one piece per three gardening levels; the produce is sold at the market stall for 75 % of
//     its value, paid to the household with transact() under the once-only occurrence `harvest:<object>:<count>` (sim/garden.ts).

import { CROPS, type CropDef } from '../content/exterior';
import type { EventBus } from '../core/events';
import type { GardenState, PlacedObject, WorldState } from '../core/types';

/** FNV-1a hash of a string (same function as sim/context.ts hashString; kept here so world code does not import the simulation). */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Water above this counts as a watered bed. */
export const WET = 0.15;
/** Growth per day of a dry bed, and of a watered bed choked with weeds. */
export const DRY_GROWTH = 1 / 3;
export const WEEDY_GROWTH = 0.5;
export const WEEDY = 0.8;
export const WATER_DECAY = 0.5;
export const CATCH_UP_DAYS = 30;
/** Share of the market value the household receives for harvested produce. */
export const SELL_SHARE = 0.75;

export const CROP_BY_ID: Readonly<Record<string, CropDef>> = Object.fromEntries(CROPS.map((c) => [c.id, c]));

/** Crops a bed definition grows (empty for anything else). */
export function cropsFor(defId: string): CropDef[] { return CROPS.filter((c) => c.grownIn.includes(defId)); }

export const isCropBed = (defId: string): boolean => CROPS.some((c) => c.grownIn.includes(defId));

/** Deterministic 0..1 from an object id and a number. */
function hash01(id: string, n: number): number { return (hashString(`${id}:${n}`) % 100000) / 100000; }

export type GardenStage = 0 | 1 | 2 | 3;

/** 0 empty, 1 seedling, 2 growing, 3 ripe. */
export function gardenStage(g: GardenState | undefined): GardenStage {
  if (!g || !g.crop) return 0;
  if (g.growth >= g.need - 1e-9) return 3;
  return g.growth < g.need * 0.34 ? 1 : 2;
}

/** True when the bed is dry enough to wilt (shown, never fatal). */
export const isWilted = (g: GardenState | undefined): boolean => !!g && !!g.crop && g.water <= 0 && gardenStage(g) < 3;

/** The crop a planting of this bed will take: the beds rotate through their crops, offset by the object id. */
export function nextCrop(obj: Pick<PlacedObject, 'id' | 'garden'>, defId: string): CropDef | null {
  const list = cropsFor(defId);
  if (list.length === 0) return null;
  return list[(hashString(obj.id) + (obj.garden?.harvests ?? 0)) % list.length]!;
}

/** The bed's state, created empty (fruit trees start with their first crop growing). */
export function gardenOf(obj: PlacedObject, day: number): GardenState {
  if (obj.garden) return obj.garden;
  const crop = CROPS.find((c) => c.kind === 'fruit' && c.grownIn.includes(obj.defId));
  const own = crop ? nextCrop(obj, obj.defId) : null;
  obj.garden = own
    ? { crop: own.id, growth: 0, need: own.days, water: 0.5, weeds: 0, day, harvests: 0 }
    : { crop: null, growth: 0, need: 0, water: 0, weeds: 0, day, harvests: 0 };
  return obj.garden;
}

export function plant(obj: PlacedObject, day: number): CropDef | null {
  const crop = nextCrop(obj, obj.defId);
  if (!crop) return null;
  const g = gardenOf(obj, day);
  g.crop = crop.id;
  g.growth = 0;
  g.need = crop.days;
  g.day = day;
  g.weeds = Math.min(g.weeds, 0.3);
  return crop;
}

export const water = (obj: PlacedObject, day: number): void => { gardenOf(obj, day).water = 1; };
export const weed = (obj: PlacedObject, day: number): void => { gardenOf(obj, day).weeds = 0; };

/** One game day of growth. */
function growDay(obj: PlacedObject, g: GardenState): void {
  g.day += 1;
  const crop = g.crop ? CROP_BY_ID[g.crop] : undefined;
  if (crop && g.growth < g.need) {
    const gain = g.water > WET ? (g.weeds >= WEEDY ? WEEDY_GROWTH : 1) : DRY_GROWTH;
    g.growth = Math.min(g.need, g.growth + gain);
  }
  g.water = Math.max(0, g.water - WATER_DECAY);
  g.weeds = Math.min(1, g.weeds + 0.1 + 0.1 * hash01(obj.id, g.day));
}

/** Steps every crop bed of every lot up to `day` (a bed untouched for a long time is caught up by at most CATCH_UP_DAYS). */
export function advanceGardens(state: WorldState, events: EventBus | null, day: number): number {
  let changed = 0;
  for (const lot of Object.values(state.lots)) {
    for (const obj of Object.values(lot.objects)) {
      if (!isCropBed(obj.defId)) continue;
      const before = obj.garden ? gardenStage(obj.garden) : -1;
      const g = gardenOf(obj, day - 1);
      if (g.day >= day) continue;
      if (day - g.day > CATCH_UP_DAYS) g.day = day - CATCH_UP_DAYS;
      while (g.day < day) growDay(obj, g);
      changed++;
      if (events && (gardenStage(g) !== before || g.crop)) events.emit({ type: 'object.changed', objectId: obj.id, lotId: lot.id, what: 'garden' });
    }
  }
  return changed;
}

/** Pieces a harvest yields for a gardener of this level (deterministic per bed and harvest). */
export function harvestYield(crop: CropDef, obj: Pick<PlacedObject, 'id' | 'garden'>, gardeningLevel: number): number {
  const [lo, hi] = crop.yield;
  const roll = Math.floor(hash01(obj.id, (obj.garden?.harvests ?? 0) + 101) * (hi - lo + 1));
  return lo + roll + Math.floor(Math.max(0, gardeningLevel - 1) / 3);
}

export interface HarvestResult { crop: CropDef; pieces: number; earned: number }

/** Harvests a ripe bed: resets the crop (annuals are spent) and returns what was picked. Money moves in the behaviour. */
export function harvest(obj: PlacedObject, day: number, gardeningLevel: number): HarvestResult | null {
  const g = gardenOf(obj, day);
  const crop = g.crop ? CROP_BY_ID[g.crop] : undefined;
  if (!crop || gardenStage(g) < 3) return null;
  const pieces = harvestYield(crop, obj, gardeningLevel);
  const earned = Math.round(pieces * crop.unitPrice * SELL_SHARE);
  g.harvests += 1;
  g.growth = 0;
  if (crop.regrow > 0) { g.need = crop.regrow; } else { g.crop = null; g.need = 0; }
  if (crop.kind === 'fruit') { // the next fruit may be the other kind of fruit the tree bears
    const next = nextCrop(obj, obj.defId);
    if (next) { g.crop = next.id; g.need = next.regrow || next.days; }
  }
  return { crop, pieces, earned };
}

/** Why a gardening interaction cannot be done on this bed right now, or null. */
export function gardenReason(interactionId: string, obj: PlacedObject, day: number): string | null {
  if (!isCropBed(obj.defId)) return 'Nothing grows here.';
  const g = obj.garden ?? { crop: null, growth: 0, need: 0, water: 0, weeds: 0, day, harvests: 0 };
  const stage = gardenStage(g);
  switch (interactionId) {
    case 'gardenPlant': return g.crop ? 'Something is already growing.' : null;
    case 'gardenWater': return !g.crop && cropsFor(obj.defId)[0]?.kind !== 'fruit' ? 'Nothing is planted.' : g.water >= 0.85 ? 'Already watered.' : null;
    case 'gardenWeed': return g.weeds < 0.2 ? 'No weeds to pull.' : null;
    case 'gardenHarvest': return !g.crop ? 'Nothing is planted.' : stage < 3 ? 'Not ripe yet.' : null;
    default: return null;
  }
}
