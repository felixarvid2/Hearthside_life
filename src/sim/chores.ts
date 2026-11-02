// Autonomy for housework: which chores a person takes on without being told. Cleaning scores grow with the
// dirt of a thing (tidy people start earlier, slobs only when it is filthy); dishes and floor messes build
// pressure the longer they stay; broken things are repaired (more urgently when they are the last working
// toilet, shower, stove or fridge), serviced when worn, or handed to a repairperson when the household cannot
// manage. Chores wait for urgent needs and for the night, and never run for visitors.

import { isCleanable, isRepairable } from '../content/capabilities';
import { hourOfDay } from '../core/clock';
import type { Person } from '../core/types';
import type { Candidate } from './autonomy';
import type { SimCtx } from './context';
import { behaviorOf, dist, isVisitor, lotLoc, lotObjects, objectCenter } from './context';
import {
  CHORE_BEHAVIORS, dirtOf, failsOf, hasDishStation, isBroken, isEssential, wearOf,
} from './housekeeping';
import { repairFee, repairPending, workingStations } from './housework';
import {
  CHORE_DIRT_START, CHORE_DRIVE, CHORE_FUN_FLOOR, CHORE_NEEDS_FLOOR, CHORE_QUIET_FROM, CHORE_QUIET_TO, DISH_PRESSURE_PER_HOUR, DISH_PRESSURE_PER_PLATE,
  REPAIRPERSON_BUFFER, SERVICE_AUTONOMY_WEAR,
} from './tuning';

export interface ChoreHelpers {
  biasFor(ctx: SimCtx, p: Person, id: string, tags: readonly string[]): number;
  cooldownMult(ctx: SimCtx, p: Person, id: string, targetKey: string): number;
}

const skill = (p: Person, id: string) => p.skills[id]?.level ?? 1;

/** Best Handiness level in the household (who could fix things). */
function bestHandiness(ctx: SimCtx, p: Person): number {
  let best = 1;
  for (const id of ctx.state.households[p.householdId]?.memberIds ?? []) best = Math.max(best, skill(ctx.state.people[id] ?? p, 'handiness'));
  return best;
}

/** All chore candidates for a resident on their own lot. */
export function choreCandidates(ctx: SimCtx, p: Person, h: ChoreHelpers): Candidate[] {
  const loc = lotLoc(p);
  if (!loc || isVisitor(ctx, p) || ctx.state.lots[loc.lotId]?.kind === 'venue' || !ctx.content.interactions.cleanObject) return [];
  const level = ctx.state.settings.autonomyLevel;
  const hh = ctx.state.households[p.householdId];
  const funds = hh?.funds ?? 0;
  const out: Candidate[] = [];
  const hour = hourOfDay(ctx.now);
  const quiet = hour >= CHORE_QUIET_FROM || hour < CHORE_QUIET_TO ? 0.2 : 1;
  // Needs come first: with a pressing hunger, tiredness, bladder or hygiene need (or nothing left to enjoy), only
  // essential repairs go on.
  const pressed = (['hunger', 'energy', 'bladder', 'hygiene'] as const).some((n) => p.needs[n] < CHORE_NEEDS_FLOOR) || p.needs.fun < CHORE_FUN_FLOOR;
  const objs = lotObjects(ctx, loc.lotId, loc.level);
  const where = (cx: number, cz: number) => 1 / (1 + dist(loc.x, loc.z, cx, cz) / 15);
  // Things somebody else already queued a chore for are taken (two people do not scrub the same toilet).
  const taken = new Set<string>();
  for (const o of Object.values(ctx.state.people)) {
    if (o.id === p.id) continue;
    for (const a of o.queue) {
      if (!CHORE_BEHAVIORS.has(behaviorOf(ctx, a.interactionId) ?? '')) continue;
      if (a.target.kind === 'object') taken.add(a.target.objectId);
      else if (a.target.kind === 'item') taken.add(a.target.itemId);
    }
  }
  const push = (interactionId: string, target: Candidate['req']['target'], key: string, score: number) => {
    if (score > 0) out.push({ req: { interactionId, target }, score, key: `${interactionId}@${key}`, addresses: [] });
  };
  const defOf = (id: string) => ctx.content.interactions[id];

  for (const ref of objs) {
    if (taken.has(ref.obj.id)) continue;
    const c = objectCenter(ref);
    const objTarget = { kind: 'object', objectId: ref.obj.id, slotId: null } as const;

    // --- repairs -----------------------------------------------------------------------------------------
    if (isRepairable(ref.def) && isBroken(ref.obj)) {
      const essential = isEssential(ctx, loc.lotId, loc.level, ref);
      if (level === 0 && !essential) continue;
      const fails = failsOf(ref.obj);
      const call = defOf('callRepairperson');
      const fee = repairFee(p);
      const canCall = !!call && !repairPending(ctx, ref.obj.id) && funds - fee >= REPAIRPERSON_BUFFER;
      if (repairPending(ctx, ref.obj.id)) continue;
      const repair = defOf('repairObject');
      // Residents try first (it trains Handiness); after a failed try that leaves something essential broken with
      // nobody handy at home, or after two failures anywhere, pay for a professional.
      const wantsPro = canCall && ((essential && fails >= 1 && bestHandiness(ctx, p) < 3) || fails >= 2);
      if (repair && (!pressed || essential)) {
        const handy = 1 + 0.07 * (skill(p, 'handiness') - 1);
        const base = (essential ? 1.4 : 0.7) * h.biasFor(ctx, p, repair.id, repair.autonomy.tags) * handy * where(c.x, c.z);
        push(repair.id, objTarget, ref.obj.id, base * (wantsPro ? 0.35 : 1) * h.cooldownMult(ctx, p, repair.id, ref.obj.id) * (essential ? 1 : quiet));
      }
      if (call && wantsPro) push(call.id, objTarget, ref.obj.id, (essential ? 1 : 0.6) * h.cooldownMult(ctx, p, call.id, ref.obj.id));
      continue;
    }
    if (level === 0 || pressed) continue;

    // --- servicing worn things ---------------------------------------------------------------------------
    const service = defOf('serviceObject');
    if (service && isRepairable(ref.def) && wearOf(ref.obj) >= SERVICE_AUTONOMY_WEAR) {
      const pressure = (wearOf(ref.obj) - SERVICE_AUTONOMY_WEAR + 0.15) * 1.2;
      push(service.id, objTarget, ref.obj.id, pressure * h.biasFor(ctx, p, service.id, service.autonomy.tags) * quiet * where(c.x, c.z) * h.cooldownMult(ctx, p, service.id, ref.obj.id));
    }

    // --- cleaning ----------------------------------------------------------------------------------------
    const clean = defOf('cleanObject');
    if (clean && isCleanable(ref.def) && dirtOf(ref.obj) > CHORE_DIRT_START) {
      const pressure = (dirtOf(ref.obj) - 0.25) * CHORE_DRIVE * 1.45;
      push(clean.id, objTarget, ref.obj.id, pressure * h.biasFor(ctx, p, clean.id, clean.autonomy.tags) * quiet * where(c.x, c.z) * h.cooldownMult(ctx, p, clean.id, ref.obj.id));
    }
  }
  if (level === 0 || pressed) return out;

  // --- dirty dishes and floor messes ---------------------------------------------------------------------
  const wash = defOf('washDishes'), mop = defOf('mopFloor'), tidy = defOf('tidyUp');
  const stations = wash ? workingStations(ctx, loc.lotId, loc.level) : [];
  let crumbsNear = 0;
  for (const it of Object.values(ctx.state.items)) {
    if (it.lotId !== loc.lotId || it.position.level !== loc.level || taken.has(it.id)) continue;
    const d = where(it.position.x, it.position.z);
    if (it.kind === 'dishes' && wash && stations.length > 0 && hasDishStation(ctx, loc.lotId)) {
      if (it.ownerHouseholdId && it.ownerHouseholdId !== p.householdId) continue;
      if (ctx.res.itemReserved(it.id) > 0) continue;
      const waited = Math.max(0, ctx.now - it.createdAt) / 60;
      const pressure = 0.25 + it.portions * DISH_PRESSURE_PER_PLATE + waited * DISH_PRESSURE_PER_HOUR;
      push(wash.id, { kind: 'item', itemId: it.id }, it.id, pressure * h.biasFor(ctx, p, wash.id, wash.autonomy.tags) * quiet * d * h.cooldownMult(ctx, p, wash.id, it.id));
    } else if (it.kind === 'mess' && mop) {
      if (ctx.res.itemReserved(it.id) > 0) continue;
      const waited = Math.max(0, ctx.now - it.createdAt) / 60;
      if (it.recipeId === 'crumbs') crumbsNear++;
      const pressure = 0.3 + it.quality * 0.35 + waited * 0.06;
      push(mop.id, { kind: 'item', itemId: it.id }, it.id, pressure * h.biasFor(ctx, p, mop.id, mop.autonomy.tags) * quiet * d * h.cooldownMult(ctx, p, mop.id, it.id));
    }
  }
  // A tidy-up pass for tidy people when several things nearby are a little grubby.
  if (tidy) {
    let grubby = crumbsNear;
    for (const ref of objs) {
      if (!isCleanable(ref.def) || dirtOf(ref.obj) < 0.2) continue;
      const c = objectCenter(ref);
      if (dist(loc.x, loc.z, c.x, c.z) <= 5) grubby++;
    }
    if (grubby >= 3) push(tidy.id, { kind: 'self' }, 'self', Math.min(0.5, 0.1 * grubby) * h.biasFor(ctx, p, tidy.id, tidy.autonomy.tags) * quiet * h.cooldownMult(ctx, p, tidy.id, 'self'));
  }
  return out;
}
