// Need decay, need changes from actions, and low-need feedback (events, thoughts, feed).

import { TICK_MINUTES } from '../core/clock';
import { fitnessEnergyDecay, wellnessDecay } from '../content/skillEffects';
import { addFeed } from '../core/state';
import type { NeedId, Person } from '../core/types';
import { NEED_IDS } from '../core/types';
import type { SimCtx } from './context';
import { clamp, householdOf, lotLoc, setThought } from './context';
import {
  COMPANY_SOCIAL_PER_HOUR, LYING_FUN_SOCIAL_DECAY, NEED_CRITICAL, NEED_DECAY_PER_HOUR, NEED_LOW, OFFLOT_DECAY_MULT, OFFLOT_HOME_DRIFT_PER_HOUR, OFFLOT_HOME_NEED_TARGET,
} from './tuning';

/** Player-facing need names. */
export const NEED_LABELS: Readonly<Record<NeedId, string>> = {
  hunger: 'Hunger', energy: 'Energy', hygiene: 'Hygiene', bladder: 'Bladder', fun: 'Fun', social: 'Social',
};

const LOW_THOUGHT: Readonly<Record<NeedId, string>> = {
  hunger: 'Hungry', energy: 'Tired', hygiene: 'Needs a wash', bladder: 'Needs the toilet', fun: 'Bored', social: 'Lonely',
};

const CRITICAL_FEED: Readonly<Record<NeedId, string>> = {
  hunger: 'is starving', energy: 'is exhausted', hygiene: 'badly needs a shower', bladder: 'urgently needs the toilet',
  fun: 'is miserably bored', social: 'feels very lonely',
};

/** Product of the person's trait decay multipliers for a need. */
export function traitDecayMult(ctx: Pick<SimCtx, 'content'>, p: Person, need: NeedId): number {
  let m = 1;
  for (const t of p.traits) {
    const v = ctx.content.traits[t]?.effects.needDecay?.[need];
    if (v !== undefined) m *= v;
  }
  return m;
}

/**
 * One tick of need decay. On the lot: base rate x traits; no energy decay while lying (sleeping, napping).
 * Off-lot at work/errands: reduced rate. Off-lot at home: needs drift toward a comfortable value.
 */
export function decayNeeds(ctx: SimCtx, p: Person): void {
  const loc = p.location;
  // At home, or enjoying themselves at a venue or a friend's house the player is not on: needs drift to comfortable.
  if (loc.kind === 'offlot' && (loc.place === 'home' || (loc.place === 'visiting' && !loc.transit))) {
    const step = (OFFLOT_HOME_DRIFT_PER_HOUR / 60) * TICK_MINUTES;
    for (const n of NEED_IDS) {
      const v = p.needs[n];
      p.needs[n] = v < OFFLOT_HOME_NEED_TARGET ? Math.min(OFFLOT_HOME_NEED_TARGET, v + step) : Math.max(OFFLOT_HOME_NEED_TARGET, v - step);
    }
    return;
  }
  const mult = loc.kind === 'offlot' ? OFFLOT_DECAY_MULT : 1;
  const lying = loc.kind === 'lot' && loc.posture === 'lying';
  const withOthers = loc.kind === 'offlot' && (loc.place === 'work' || loc.place === 'school');
  for (const n of NEED_IDS) {
    if (n === 'energy' && lying) continue;
    if (n === 'social' && withOthers) { changeNeed(ctx, p, n, (COMPANY_SOCIAL_PER_HOUR / 60) * TICK_MINUTES); continue; }
    const posture = lying && (n === 'fun' || n === 'social') ? LYING_FUN_SOCIAL_DECAY : 1;
    const fit = n === 'energy' ? fitnessEnergyDecay(p.skills.fitness?.level ?? 1) : 1;
    // A steady wellness practice slows how fast energy and fun run down (Milestone 11).
    const calm = n === 'energy' || n === 'fun' ? wellnessDecay(p.skills.wellness?.level ?? 1) : 1;
    const rate = (NEED_DECAY_PER_HOUR[n] / 60) * TICK_MINUTES * mult * posture * fit * calm * traitDecayMult(ctx, p, n);
    changeNeed(ctx, p, n, -rate);
  }
}

/** Changes a need with clamping and emits low-need feedback when a threshold is crossed downward. */
export function changeNeed(ctx: SimCtx, p: Person, need: NeedId, delta: number): void {
  const before = p.needs[need];
  const after = clamp(before + delta, 0, 100);
  p.needs[need] = after;
  if (delta >= 0 || !lotLoc(p)) return;
  if (before >= NEED_LOW && after < NEED_LOW) {
    ctx.events.emit({ type: 'need.low', personId: p.id, need, value: after });
    setThought(p, need, LOW_THOUGHT[need], ctx.now + 30);
  }
  if (before >= NEED_CRITICAL && after < NEED_CRITICAL && householdOf(ctx, p)?.isPlayable) {
    addFeed(ctx.state, ctx.events, 'need', `${p.firstName} ${CRITICAL_FEED[need]}.`, p.id);
  }
}

/** Urgency of a need value, 0 (full) .. about 4 (empty), steep below 25. */
export function needUrgency(v: number): number {
  const lack = (100 - clamp(v, 0, 100)) / 100;
  let u = lack * lack * 2.2;
  if (v < 40) u += ((40 - v) / 40) * 1.2;
  if (v < 15) u += ((15 - v) / 15) * 1.5;
  return u;
}
