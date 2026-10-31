// The action lifecycle runner: validate -> reserve -> route -> prepare -> perform -> apply -> cleanup.
//
// Cancellation and failure are defined for every phase:
// - queued / validate / reserve / route: the person stops where they are, reservations are released.
// - prepare / perform: partial skill xp is kept, then cleanup runs (stand up / get up, step back to the
//   approach tile) and reservations are released at its end.
// - apply is instantaneous; cleanup always completes (a cancel request during cleanup changes nothing).
// endAction() is the single exit: it releases reservations, calls the behavior's end hook once and emits
// action.finished.

import { TICK_MINUTES } from '../core/clock';
import { facingTo } from '../core/geometry';
import type { ActionInstance, ActionPhase, Person } from '../core/types';
import type { SimCtx } from './context';
import { interactionDef, lotLoc, objectName, objectRef, setAnim, socialDef } from './context';
import { recordInteraction } from './aspirations';
import { behaviorFor } from './behaviors';
import { addMoodlet } from './mood';
import { routeTick, unstick } from './movement';
import { changeNeed } from './needs';
import { addSkillXp } from './skills';
import type { Behavior, EndResult, Step } from './steps';
import { enjoyMult, syncReservations } from './steps';
import { AUTONOMY_REPEAT_COOLDOWN, POSTURE_CHANGE_MINUTES } from './tuning';

const EPS = 1e-9;

function setPhase(ctx: SimCtx, a: ActionInstance, phase: ActionPhase): void {
  a.phase = phase;
  a.phaseSince = ctx.now;
}

/** Runs the head action of an on-lot person for one tick. */
export function runPerson(ctx: SimCtx, p: Person): void {
  if (!lotLoc(p)) return;
  const a = p.queue[0];
  if (!a) { idle(ctx, p); return; }
  runAction(ctx, p, a);
  if (p.queue.length === 0) idle(ctx, p);
}

function idle(ctx: SimCtx, p: Person): void {
  const loc = lotLoc(p);
  if (!loc) return;
  if (loc.posture !== 'standing') loc.posture = 'standing';
  setAnim(p, 'idle', ctx.now);
  unstick(ctx, p);
}

function stillHead(p: Person, a: ActionInstance): boolean {
  return p.queue[0] === a;
}

function runAction(ctx: SimCtx, p: Person, a: ActionInstance): void {
  const beh = behaviorFor(ctx, a);
  if (!beh) { endAction(ctx, p, a, 'failed', 'That interaction is not available.'); return; }
  for (let guard = 0; guard < 12; guard++) {
    if (!stillHead(p, a)) return;
    if (a.cancelRequested) {
      a.cancelRequested = false;
      if (a.phase !== 'cleanup') { interrupt(ctx, p, a, beh, 'cancelled', null); continue; }
    }
    switch (a.phase) {
      case 'queued':
        setPhase(ctx, a, 'validate');
        ctx.events.emit({ type: 'action.started', personId: p.id, actionId: a.id, interactionId: a.interactionId });
        continue;
      case 'validate': {
        const r = baseCheck(p) ?? beh.check(ctx, p, a);
        if (r) { endAction(ctx, p, a, 'failed', r); return; }
        setPhase(ctx, a, 'reserve');
        continue;
      }
      case 'reserve': {
        let r = beh.reserve(ctx, p, a);
        if (!r && !syncReservations(ctx, a)) r = 'Someone else is using it.';
        if (r) { endAction(ctx, p, a, 'failed', r); return; }
        rememberTargetName(ctx, p, a);
        setPhase(ctx, a, 'route');
        continue;
      }
      case 'route': {
        const step = beh.step(ctx, p, a);
        if (typeof step === 'string') { interrupt(ctx, p, a, beh, 'failed', step); continue; }
        const res = routeTick(ctx, p, a, step.goal);
        if (res === 'moving') return;
        if (typeof res === 'object') { interrupt(ctx, p, a, beh, 'failed', res.fail); continue; }
        const w = beh.arrive ? beh.arrive(ctx, p, a) : null;
        if (w === 'wait') return;
        if (w) { interrupt(ctx, p, a, beh, 'failed', w); continue; }
        beginPrepare(ctx, p, a, step);
        continue;
      }
      case 'prepare': {
        const step = beh.step(ctx, p, a);
        if (typeof step === 'string') { interrupt(ctx, p, a, beh, 'failed', step); continue; }
        if (ctx.now - a.phaseSince < prepareMinutes(step) - EPS) return;
        // Revalidate right before performing.
        let r = baseCheck(p) ?? beh.check(ctx, p, a);
        if (!r && !syncReservations(ctx, a)) r = 'Someone else is using it.';
        if (!r && beh.begin) r = beh.begin(ctx, p, a);
        if (r) { interrupt(ctx, p, a, beh, 'failed', r); continue; }
        setPhase(ctx, a, 'perform');
        a.elapsed = 0;
        a.duration = step.duration.kind === 'fixed' ? step.duration.minutes : step.duration.kind === 'instant' ? 0 : null;
        setAnim(p, step.performAnim, ctx.now);
        continue;
      }
      case 'perform': {
        const step = beh.step(ctx, p, a);
        if (typeof step === 'string') { interrupt(ctx, p, a, beh, 'failed', step); continue; }
        const res = performTick(ctx, p, a, beh, step);
        if (res === 'continue') return;
        if (res !== 'done') { interrupt(ctx, p, a, beh, 'failed', res.fail); continue; }
        // Standing at a use point: step back to its approach tile first so the next stage routes from there.
        const ploc = lotLoc(p);
        const lowered = !!ploc && (ploc.posture === 'seated' || ploc.posture === 'lying');
        if (beh.next && !lowered) standUpNow(p, a);
        const nx = beh.next ? beh.next(ctx, p, a) : false;
        if (typeof nx === 'string') { interrupt(ctx, p, a, beh, 'failed', nx); continue; }
        if (nx) {
          if (!stillHead(p, a)) return;
          if (lowered) { standUpNow(p, a); a.route = []; }
          if (!syncReservations(ctx, a)) { interrupt(ctx, p, a, beh, 'failed', 'Someone else is using it.'); continue; }
          a.elapsed = 0;
          a.duration = null;
          a.replans = 0;
          setPhase(ctx, a, 'route');
          return;
        }
        setPhase(ctx, a, 'apply');
        continue;
      }
      case 'apply':
        applyEffects(ctx, p, a, beh);
        if (!stillHead(p, a)) return;
        a.data.result = 'done';
        beginCleanup(ctx, p, a, beh);
        continue;
      case 'cleanup': {
        const need = typeof a.data.cleanupMin === 'number' ? a.data.cleanupMin : 0;
        if (ctx.now - a.phaseSince < need - EPS) return;
        finishCleanup(ctx, p, a);
        const result = (a.data.result === 'failed' || a.data.result === 'cancelled') ? a.data.result : 'done';
        endAction(ctx, p, a, result, result === 'done' ? null : a.failureReason);
        return;
      }
      default:
        endAction(ctx, p, a, a.phase === 'failed' ? 'failed' : a.phase === 'cancelled' ? 'cancelled' : 'done', a.failureReason);
        return;
    }
  }
}

/** Keeps the target object's name so a later "it was removed" message stays readable. */
function rememberTargetName(ctx: SimCtx, p: Person, a: ActionInstance): void {
  const loc = lotLoc(p);
  if (!loc || a.target.kind !== 'object') return;
  const ref = objectRef(ctx, loc.lotId, a.target.objectId);
  if (ref) a.data.what = objectName(ctx, ref.def.id);
}

function baseCheck(p: Person): string | null {
  return lotLoc(p) ? null : `${p.firstName} isn't on the lot.`;
}

function prepareMinutes(step: Step): number {
  return step.posture === 'seated' || step.posture === 'lying' ? POSTURE_CHANGE_MINUTES : 0;
}

function beginPrepare(ctx: SimCtx, p: Person, a: ActionInstance, step: Step): void {
  setPhase(ctx, a, 'prepare');
  const loc = lotLoc(p);
  if (!loc) return;
  const g = step.goal;
  if (g.kind === 'slot') {
    a.data.backX = g.slot.approach.x + 0.5;
    a.data.backZ = g.slot.approach.z + 0.5;
    loc.x = g.slot.x;
    loc.z = g.slot.z;
    loc.facing = g.slot.facing;
  } else if (g.kind === 'tile' && g.face) {
    loc.facing = facingTo(loc.x, loc.z, g.face.x, g.face.z);
  } else if (g.kind === 'person') {
    const o = ctx.state.people[g.personId];
    const ol = o ? lotLoc(o) : null;
    if (ol) loc.facing = facingTo(loc.x, loc.z, ol.x, ol.z);
  }
  loc.posture = step.posture === 'walking' ? 'standing' : step.posture;
  const anim = step.prepareAnim ?? (loc.posture === 'seated' ? 'sitDown' : loc.posture === 'lying' ? 'lieDown' : step.performAnim);
  setAnim(p, anim, ctx.now);
}

function performTick(ctx: SimCtx, p: Person, a: ActionInstance, beh: Behavior, step: Step): 'continue' | 'done' | { fail: string } {
  const dt = TICK_MINUTES;
  if (step.duration.kind === 'instant') return 'done';
  for (const [need, rate] of Object.entries(step.rates) as Array<[keyof Person['needs'], number]>) {
    if (rate) changeNeed(ctx, p, need, (rate / 60) * dt);
  }
  if (step.skill) {
    a.data.skillId = step.skill.id;
    a.data.xp = (typeof a.data.xp === 'number' ? a.data.xp : 0) + (step.skill.xpPerHour / 60) * dt;
  }
  a.elapsed += dt;
  setAnim(p, step.performAnim, ctx.now);
  const h = beh.tick ? beh.tick(ctx, p, a) : null;
  if (h === 'done') return 'done';
  if (h) return { fail: h };
  const d = step.duration;
  if (d.kind === 'fixed') return a.elapsed >= d.minutes - EPS ? 'done' : 'continue';
  if (d.kind === 'untilFull') return p.needs[d.need] >= 99.9 || a.elapsed >= d.maxMinutes - EPS ? 'done' : 'continue';
  return 'continue';
}

function grantXp(ctx: SimCtx, p: Person, a: ActionInstance): void {
  const xp = a.data.xp, skillId = a.data.skillId;
  if (typeof xp === 'number' && typeof skillId === 'string' && xp > 0) addSkillXp(ctx, p, skillId, xp);
  delete a.data.xp;
}

function applyEffects(ctx: SimCtx, p: Person, a: ActionInstance, beh: Behavior): void {
  if (a.data.role === 'listen') { beh.apply?.(ctx, p, a); return; }
  const def = interactionDef(ctx, a.interactionId);
  if (def) {
    const enjoy = enjoyMult(ctx, p, def);
    for (const [need, v] of Object.entries(def.needsOnComplete) as Array<[keyof Person['needs'], number]>) {
      if (v) changeNeed(ctx, p, need, v > 0 ? v * enjoy : v);
    }
    if (def.moodletOnComplete) addMoodlet(ctx.content, p, def.moodletOnComplete, ctx.now, def.id);
  }
  grantXp(ctx, p, a);
  beh.apply?.(ctx, p, a);
  const social = def ? undefined : socialDef(ctx, a.interactionId);
  // Socials count toward aspirations only when accepted (resolveSocial stores the outcome).
  if (social && a.data.accepted !== true) return;
  recordInteraction(ctx, p, a.interactionId, def ? def.autonomy.tags.map((t) => `tag:${t}`) : social ? [`category:${social.category}`] : []);
}

function beginCleanup(ctx: SimCtx, p: Person, a: ActionInstance, beh: Behavior): void {
  setPhase(ctx, a, 'cleanup');
  const loc = lotLoc(p);
  const lowered = !!loc && (loc.posture === 'seated' || loc.posture === 'lying');
  a.data.cleanupMin = lowered ? POSTURE_CHANGE_MINUTES : 0;
  if (lowered && loc) {
    const step = beh.step(ctx, p, a);
    const anim = typeof step !== 'string' && step.cleanupAnim ? step.cleanupAnim : loc.posture === 'lying' ? 'getUp' : 'standUp';
    setAnim(p, anim, ctx.now);
  } else setAnim(p, 'idle', ctx.now);
}

function finishCleanup(ctx: SimCtx, p: Person, a: ActionInstance): void {
  const loc = lotLoc(p);
  if (!loc) return;
  if (typeof a.data.backX === 'number' && typeof a.data.backZ === 'number') {
    loc.x = a.data.backX;
    loc.z = a.data.backZ;
  }
  delete a.data.backX;
  delete a.data.backZ;
  loc.posture = 'standing';
  setAnim(p, 'idle', ctx.now);
}

/** Between stages: get up immediately and step back to the approach tile. */
function standUpNow(p: Person, a: ActionInstance): void {
  const loc = lotLoc(p);
  if (!loc) return;
  if (typeof a.data.backX === 'number' && typeof a.data.backZ === 'number') {
    loc.x = a.data.backX;
    loc.z = a.data.backZ;
  }
  delete a.data.backX;
  delete a.data.backZ;
  loc.posture = 'standing';
}

/**
 * Cancels or fails the action in its current phase (see the header). Leaves the action in cleanup when
 * the person has to get up or step back first; otherwise ends it at once.
 */
function interrupt(ctx: SimCtx, p: Person, a: ActionInstance, beh: Behavior, result: 'failed' | 'cancelled', reason: string | null): void {
  switch (a.phase) {
    case 'queued': case 'validate': case 'reserve': case 'route':
      endAction(ctx, p, a, result, reason);
      return;
    case 'prepare': case 'perform': case 'apply':
      if (a.phase === 'perform') grantXp(ctx, p, a);
      a.data.result = result;
      a.failureReason = reason;
      beginCleanup(ctx, p, a, beh);
      return;
    case 'cleanup':
      return;
    default:
      endAction(ctx, p, a, result, reason);
  }
}

/**
 * Ends an action immediately: releases reservations, removes it from the queue, runs the behavior's end
 * hook once, sets autonomy cooldowns and emits action.finished.
 */
export function endAction(ctx: SimCtx, p: Person, a: ActionInstance, result: EndResult, reason: string | null): void {
  ctx.res.release(a.id);
  const idx = p.queue.indexOf(a);
  if (idx >= 0) p.queue.splice(idx, 1);
  const wasStarted = a.phase !== 'queued';
  a.phase = result;
  if (result !== 'done') a.failureReason = reason ?? a.failureReason;
  const loc = lotLoc(p);
  if (loc && loc.posture === 'walking') loc.posture = 'standing';
  behaviorFor(ctx, a)?.end?.(ctx, p, a, result);
  if (a.source === 'autonomy' && wasStarted) {
    if (result === 'done') p.cooldowns[a.interactionId] = ctx.now + AUTONOMY_REPEAT_COOLDOWN;
    else p.cooldowns[`${a.interactionId}@${targetKey(a)}`] = ctx.now + 30;
  }
  ctx.events.emit({
    type: 'action.finished', personId: p.id, actionId: a.id, interactionId: a.interactionId, result,
    ...(result !== 'done' && a.failureReason ? { reason: a.failureReason } : {}),
  });
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'queue' });
  if (loc && p.queue.length === 0 && loc.posture === 'standing') setAnim(p, 'idle', ctx.now);
}

/** Short key of an action's target for per-target autonomy cooldowns. */
export function targetKey(a: Pick<ActionInstance, 'target'>): string {
  const t = a.target;
  switch (t.kind) {
    case 'object': return t.objectId;
    case 'person': return t.personId;
    case 'item': return t.itemId;
    case 'tile': return `${t.x},${t.z}`;
    case 'self': return 'self';
  }
}

/**
 * Requests cancellation. Actions that have not started are removed at once; the running head action
 * gets cancelRequested and the next tick runs its phase-appropriate cleanup.
 */
export function requestCancel(ctx: SimCtx, p: Person, actionId: string): void {
  const a = p.queue.find((x) => x.id === actionId);
  if (!a) return;
  if (a === p.queue[0] && a.phase !== 'queued') { a.cancelRequested = true; return; }
  endAction(ctx, p, a, 'cancelled', null);
}

/**
 * Ends every action in a person's queue immediately (except `exceptId`), restoring a standing posture.
 * Used when a person leaves the lot or their household changes.
 */
export function abortQueue(ctx: SimCtx, p: Person, reason: string | null, exceptId?: string): void {
  for (const a of [...p.queue]) {
    if (a.id === exceptId) continue;
    const started = a.phase !== 'queued';
    if (started) {
      const loc = lotLoc(p);
      if (loc && typeof a.data.backX === 'number' && typeof a.data.backZ === 'number') { loc.x = a.data.backX; loc.z = a.data.backZ; }
      if (loc) loc.posture = 'standing';
    }
    endAction(ctx, p, a, reason ? 'failed' : 'cancelled', reason);
  }
}

/** Fails a specific action right away with phase-appropriate posture handling (used by onLotChanged/rebuild). */
export function failNow(ctx: SimCtx, p: Person, a: ActionInstance, reason: string): void {
  const loc = lotLoc(p);
  if (loc && a.phase !== 'queued') {
    if (typeof a.data.backX === 'number' && typeof a.data.backZ === 'number') { loc.x = a.data.backX; loc.z = a.data.backZ; }
    loc.posture = 'standing';
    unstick(ctx, p);
  }
  endAction(ctx, p, a, 'failed', reason);
}
