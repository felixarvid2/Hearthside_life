// Creating actions and inserting them into a person's queue with the priority rules:
// player, chain and schedule actions precede autonomous ones; queuing one while an autonomous action
// runs cancels that autonomous action (it cleans up first); the queue holds at most QUEUE_MAX actions.

import { newId } from '../core/ids';
import type { ActionInstance, Person } from '../core/types';
import type { SimCtx } from './context';
import { interactionDef, socialDef } from './context';
import { QUEUE_MAX } from './tuning';
import type { ActionRequest } from './types';

/** A fresh queued action for a request. Social actions are marked with data.social = true. */
export function makeAction(ctx: Pick<SimCtx, 'state' | 'content' | 'now'>, p: Person, req: ActionRequest, source: ActionInstance['source']): ActionInstance {
  const isSocial = !interactionDef(ctx, req.interactionId) && socialDef(ctx, req.interactionId) !== undefined;
  return {
    id: newId(ctx.state, 'act'),
    interactionId: req.interactionId,
    actorId: p.id,
    source,
    target: JSON.parse(JSON.stringify(req.target)) as ActionInstance['target'],
    phase: 'queued',
    phaseSince: ctx.now,
    route: [],
    elapsed: 0,
    duration: null,
    replans: 0,
    failureReason: null,
    data: { ...(req.data ?? {}), ...(isSocial ? { social: true } : {}) },
    cancelRequested: false,
    queuedAt: ctx.now,
  };
}

/** True when the action has started (left the 'queued' phase). */
export function isStarted(a: ActionInstance | undefined): boolean {
  return !!a && a.phase !== 'queued';
}

/**
 * Inserts an action. Returns false (and changes nothing) when the queue is full of non-autonomous actions.
 */
export function insertAction(ctx: SimCtx, p: Person, a: ActionInstance): boolean {
  const head = p.queue[0];
  const headRunning = isStarted(head);
  if (a.source === 'autonomy') {
    if (p.queue.length >= QUEUE_MAX) return false;
    p.queue.push(a);
    ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'queue' });
    return true;
  }
  // Drop autonomous actions that have not started yet: the new order replaces them.
  const kept: ActionInstance[] = [];
  p.queue.forEach((x, i) => {
    if (x.source === 'autonomy' && !(i === 0 && headRunning)) {
      ctx.events.emit({ type: 'action.finished', personId: p.id, actionId: x.id, interactionId: x.interactionId, result: 'cancelled' });
    } else kept.push(x);
  });
  p.queue = kept;
  if (p.queue.length >= QUEUE_MAX) return false;
  const h = p.queue[0];
  if (h && headRunning && h.source === 'autonomy' && h.phase !== 'apply' && h.phase !== 'cleanup') h.cancelRequested = true;
  let idx = p.queue.length;
  for (let i = headRunning ? 1 : 0; i < p.queue.length; i++) {
    if (p.queue[i]!.source === 'autonomy') { idx = i; break; }
  }
  p.queue.splice(idx, 0, a);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'queue' });
  return true;
}

/** Number of actions of an interaction in the queue (any phase). */
export function queuedCount(p: Person, interactionId: string): number {
  return p.queue.filter((a) => a.interactionId === interactionId).length;
}
