// Moving around and leaving the lot: goHere, goToWork, leaveLot (visitors going home), and the phone
// interactions that reach people off-lot (phoneInvite schedules a visit, phoneChat keeps in touch).

import { addFeed } from '../core/state';
import type { Tile } from '../core/nav';
import type { ActionInstance, Person } from '../core/types';
import { abortQueue } from './actions';
import { commutableShift, nextShift, shiftText, startShift } from './careers';
import type { SimCtx } from './context';
import { clamp, interactionDef, lotLoc, setAnim, tileOfLoc } from './context';
import { addMoodlet } from './mood';
import { applyRelDelta, decayRecent, ensureRel, peekRel } from './relationships';
import type { Behavior, Step } from './steps';
import { defDuration, performRates } from './steps';
import { INVITE_DELAY_MINUTES, PHONE_FRIENDSHIP_CAP, SOCIAL_RECENT_DECAY_MINUTES } from './tuning';
import { isVisitPending, scheduleVisit } from './visitors';

/** A walkable tile a few steps from the lot entry toward the lot centre (for arrivals). */
export function walkInTile(ctx: SimCtx, p: Person): Tile | null {
  const loc = lotLoc(p);
  const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
  if (!loc || !lot) return null;
  const centre = { x: Math.floor(lot.width / 2), z: Math.floor(lot.depth / 2) };
  const goals: Tile[] = [];
  for (let r = 0; r <= 3 && goals.length === 0; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (ctx.nav.isWalkable(loc.lotId, loc.level, centre.x + dx, centre.z + dz)) goals.push({ x: centre.x + dx, z: centre.z + dz });
    }
  }
  if (goals.length === 0) return null;
  ctx.counters.routeRequests++;
  const path = ctx.nav.findPath(loc.lotId, loc.level, tileOfLoc(loc), goals);
  if (!path || path.length === 0) return null;
  return path[Math.min(3, path.length - 1)] ?? null;
}

function entryGoal(ctx: SimCtx, p: Person): Step['goal'] | string {
  const loc = lotLoc(p);
  const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
  if (!loc || !lot) return `${p.firstName} isn't on a lot.`;
  return { kind: 'tile', tile: { x: lot.entry.x, z: lot.entry.z }, label: 'street' };
}

function walkStep(goal: Step['goal']): Step {
  return { goal, posture: 'standing', performAnim: 'idle', duration: { kind: 'instant' }, rates: {} };
}

/** Takes a person off the lot (work, home...). Their remaining queue is ended. */
export function goOffLot(ctx: SimCtx, p: Person, place: 'home' | 'work' | 'visiting' | 'errand', keepActionId?: string): void {
  if (!lotLoc(p)) return;
  abortQueue(ctx, p, null, keepActionId);
  const homeLotId = ctx.state.households[p.householdId]?.homeLotId ?? undefined;
  p.location = { kind: 'offlot', place, ...(place === 'home' && homeLotId ? { lotId: homeLotId } : {}), since: ctx.now, until: null };
  p.thought = null;
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
}

/** Walk to a tile. */
export const goHereBehavior: Behavior = {
  check(ctx, p, a) {
    const loc = lotLoc(p);
    if (!loc || a.target.kind !== 'tile') return "Can't go there.";
    if (!ctx.nav.isWalkable(loc.lotId, loc.level, a.target.x, a.target.z)) return "Can't go there.";
    return null;
  },
  reserve: () => null,
  step(_ctx, _p, a) {
    if (a.target.kind !== 'tile') return "Can't go there.";
    return walkStep({ kind: 'tile', tile: { x: a.target.x, z: a.target.z }, label: 'there' });
  },
  interruptible: true,
};

/** Walk to the lot entry and leave for the current shift. */
export const goToWorkBehavior: Behavior = {
  check(ctx, p) {
    const cs = p.career;
    if (!cs) return "Doesn't have a job.";
    if (!commutableShift(ctx, p)) return shiftText(nextShift(ctx.state, ctx.content, p, ctx.now));
    return null;
  },
  reserve(_ctx, p) {
    if (p.career?.shift && p.career.shift.status === 'upcoming') p.career.shift.status = 'commuting';
    return null;
  },
  step: (ctx, p) => { const g = entryGoal(ctx, p); return typeof g === 'string' ? g : walkStep(g); },
  apply(ctx, p, a) { startShift(ctx, p, a.id); },
  end(_ctx, p, _a, result) {
    if (result !== 'done' && p.career?.shift?.status === 'commuting') p.career.shift.status = 'upcoming';
  },
};

/** Walk to the lot entry and go home (visitors). Leaves even when the way is blocked. */
export const leaveLotBehavior: Behavior = {
  check: () => null,
  reserve: () => null,
  step: (ctx, p) => { const g = entryGoal(ctx, p); return typeof g === 'string' ? g : walkStep(g); },
  apply(ctx, p, a) { leaveForHome(ctx, p, a); },
  end(ctx, p, a, result) { if (result === 'failed') leaveForHome(ctx, p, a); },
};

function leaveForHome(ctx: SimCtx, p: Person, a: ActionInstance): void {
  if (!lotLoc(p)) return;
  goOffLot(ctx, p, 'home', a.id);
  addFeed(ctx.state, ctx.events, 'social', `${p.firstName} went home.`, p.id);
}

function phoneTarget(ctx: SimCtx, a: ActionInstance): Person | undefined {
  const id = a.data.personId;
  return typeof id === 'string' ? ctx.state.people[id] : undefined;
}

function phoneStep(ctx: SimCtx, p: Person, a: ActionInstance, fallbackMinutes: number): Step {
  const def = interactionDef(ctx, a.interactionId);
  const duration = def ? defDuration(def) : { kind: 'fixed' as const, minutes: fallbackMinutes };
  return {
    goal: { kind: 'here' }, posture: 'standing', performAnim: def?.anims.perform && def.anims.perform !== 'idle' ? def.anims.perform : 'phone',
    duration: duration.kind === 'instant' ? { kind: 'fixed', minutes: fallbackMinutes } : duration,
    rates: def ? performRates(ctx, p, def, null, null, 'standing') : {},
  };
}

/** Phone a neighbour and invite them over: schedules a visit in 60 minutes. data.personId = guest. */
export const inviteBehavior: Behavior = {
  check(ctx, p, a) {
    const other = phoneTarget(ctx, a);
    if (!other || other.id === p.id) return 'Choose someone to invite.';
    if (other.householdId === p.householdId) return 'They live here.';
    if (other.location.kind === 'lot') return `${other.firstName} is already visiting somewhere.`;
    if (other.location.place !== 'home') return `${other.firstName} isn't home right now.`;
    if (isVisitPending(ctx.state, other.id)) return `${other.firstName} is already on the way.`;
    return null;
  },
  reserve: () => null,
  step: (ctx, p, a) => phoneStep(ctx, p, a, 3),
  apply(ctx, p, a) {
    const other = phoneTarget(ctx, a);
    if (!other) return;
    if (peekRel(ctx.state, other.id, p.id).friendship < -30) {
      addFeed(ctx.state, ctx.events, 'social', `${other.firstName} declined ${p.firstName}'s invitation.`, p.id);
      return;
    }
    const at = ctx.now + INVITE_DELAY_MINUTES;
    scheduleVisit(ctx.state, other.id, at, `invite:${other.id}:${Math.round(ctx.now)}`, { invitedBy: p.id });
    applyRelDelta(ctx.state, p.id, other.id, { familiarity: 1 }, ctx.now);
    applyRelDelta(ctx.state, other.id, p.id, { familiarity: 1, friendship: 1 }, ctx.now);
    addFeed(ctx.state, ctx.events, 'social', `${p.firstName} invited ${other.firstName} over. They'll arrive in about an hour.`, p.id);
  },
};

/** Phone someone you know: social need, a small friendship gain both ways. data.personId = callee. */
export const phoneChatBehavior: Behavior = {
  check(ctx, p, a) {
    const other = phoneTarget(ctx, a);
    if (!other || other.id === p.id) return 'Choose someone to call.';
    if (peekRel(ctx.state, p.id, other.id).familiarity <= 0) return `Hasn't met ${other.firstName} yet.`;
    const ol = lotLoc(other), pl = lotLoc(p);
    if (ol && pl && ol.lotId === pl.lotId) return `${other.firstName} is right here.`;
    if (other.location.kind === 'offlot' && other.location.place === 'work') return `${other.firstName} is at work.`;
    return null;
  },
  reserve: () => null,
  step(ctx, p, a) {
    const s = phoneStep(ctx, p, a, 15);
    if (s.rates.social === undefined) s.rates.social = 30;
    return s;
  },
  apply(ctx, p, a) {
    const other = phoneTarget(ctx, a);
    if (!other) return;
    // Diminishing returns: repeated calls in a short time count less (like socials' recent-use dampening)
    // and phone calls alone cannot build a friendship beyond PHONE_FRIENDSHIP_CAP.
    const rel = ensureRel(ctx.state, p.id, other.id);
    decayRecent(rel, ctx.now, SOCIAL_RECENT_DECAY_MINUTES);
    const recent = rel.recent.phoneChat ?? 0;
    const gain = (base: number) => 2 * clamp((PHONE_FRIENDSHIP_CAP - base) / PHONE_FRIENDSHIP_CAP, 0, 1) / (1 + recent);
    const back = peekRel(ctx.state, other.id, p.id);
    applyRelDelta(ctx.state, p.id, other.id, { familiarity: 1, friendship: gain(rel.friendship) }, ctx.now);
    applyRelDelta(ctx.state, other.id, p.id, { familiarity: 1, friendship: gain(back.friendship) }, ctx.now);
    rel.recent.phoneChat = recent + 1;
    other.needs.social = Math.min(100, other.needs.social + 10);
    ctx.events.emit({ type: 'relationship', fromId: p.id, toId: other.id, what: 'value' });
    const greatChat = ctx.content.moodlets.greatChat ? 'greatChat' : null;
    if (greatChat && peekRel(ctx.state, p.id, other.id).friendship >= 40) addMoodlet(ctx.content, p, greatChat, ctx.now, 'phoneChat');
  },
};
