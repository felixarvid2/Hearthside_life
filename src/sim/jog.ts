// Go for a Jog (Milestone 13): the person runs laps of the park track instead of jogging on the spot. The action is a chain of
// stages, one per corner of the track (world/venues.ts parkTrack), each walked with the jog gait at a faster pace; needs and
// Fitness xp for the minutes run are applied when a leg ends (so they follow the real time spent, not a fixed block), and the
// session ends at the first corner reached after the interaction's duration. On a lot without a track (an older or edited park)
// the person jogs in place as before.

import type { ActionInstance, Person } from '../core/types';
import { parkTrack } from '../world/venues';
import { defOf, interactionCheck, primaryStep } from './behaviors';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { changeNeed } from './needs';
import type { Behavior, Step } from './steps';
import { performRates, skillRate } from './steps';
import { JOG_PACE } from './tuning';

/** The corners of the track on the person's lot, or null. */
function trackOf(ctx: SimCtx, p: Person) {
  const loc = lotLoc(p);
  const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
  return lot ? parkTrack(lot) : null;
}

/** The legs a jog may walk without stopping short: the nearest corner first, then round the loop. */
function firstLeg(track: Array<{ x: number; z: number }>, p: Person): number {
  const loc = lotLoc(p)!;
  let best = 0, bd = Infinity;
  track.forEach((t, i) => { const d = Math.hypot(t.x + 0.5 - loc.x, t.z + 0.5 - loc.z); if (d < bd) { bd = d; best = i; } });
  return best;
}

export const jogLoopBehavior: Behavior = {
  check: (ctx, p, a) => interactionCheck(ctx, p, a),
  reserve(ctx, p, a) {
    const track = trackOf(ctx, p);
    if (!track) return null;
    a.data.moveAnim = 'jog';
    a.data.pace = JOG_PACE;
    a.data.leg = firstLeg(track, p);
    a.data.laps = 0;
    return null;
  },
  step(ctx, p, a): Step | string {
    const track = trackOf(ctx, p);
    const def = defOf(ctx, a);
    if (!track || typeof a.data.leg !== 'number') return primaryStep(ctx, p, a);
    const t = track[a.data.leg % track.length]!;
    return {
      goal: { kind: 'tile', tile: { x: t.x, z: t.z, level: 0 }, label: 'the track' }, posture: 'standing', performAnim: 'jog',
      duration: { kind: 'instant' }, rates: performRates(ctx, p, def, null, null, 'standing'), ...(def.skill ? { skill: skillRate(def, null) } : {}),
    };
  },
  begin(_ctx, _p, a) {
    if (a.data.jogStart === undefined) { a.data.jogStart = _ctx.now; a.data.legAt = _ctx.now; }
    return null;
  },
  next(ctx, p, a) {
    const track = trackOf(ctx, p);
    const def = defOf(ctx, a);
    if (!track || typeof a.data.leg !== 'number' || typeof a.data.legAt !== 'number' || typeof a.data.jogStart !== 'number') return false;
    // The minutes run on this leg: needs and Fitness xp in proportion, like a timed block would give.
    const minutes = Math.max(0, ctx.now - a.data.legAt);
    const rates = performRates(ctx, p, def, null, null, 'standing');
    for (const [need, rate] of Object.entries(rates) as Array<[keyof Person['needs'], number]>) if (rate) changeNeed(ctx, p, need, (rate / 60) * minutes);
    if (def.skill) {
      a.data.skillId = def.skill.id;
      a.data.xp = (typeof a.data.xp === 'number' ? a.data.xp : 0) + (skillRate(def, null)!.xpPerHour / 60) * minutes;
    }
    a.data.legAt = ctx.now;
    a.data.leg += 1;
    if (a.data.leg % track.length === 0) a.data.laps = (typeof a.data.laps === 'number' ? a.data.laps : 0) + 1;
    const limit = def.duration.kind === 'fixed' ? def.duration.minutes : 40;
    // Out of breath: stop at a corner once the session is long enough or the energy is gone.
    return ctx.now - a.data.jogStart < limit && p.needs.energy > 8;
  },
  interruptible: true,
};

/** Laps (full circuits of the track) an action has run so far. */
export const lapsOf = (a: Pick<ActionInstance, 'data'>): number => (typeof a.data.laps === 'number' ? a.data.laps : 0);
