// Milestone 11.5: which placed objects are in use right now, derived from the running actions.
// Render-only helper (no sim writes). Object animations, screen contents and hand props all read this,
// so the sim does not need an extra "in use" field and saves stay unchanged.

import type { ActionInstance, ActionPhase, GameState, Id, Person } from '../core/types';

export interface ObjectUse {
  personId: Id;
  /** Interaction id of the running action (e.g. 'cookMeal', 'useComputer'). */
  interactionId: string;
  phase: ActionPhase;
  /** The person's current animation id (e.g. 'openFridge', 'cook', 'computer'). */
  anim: string;
  /** Game minute the current animation started. */
  animSince: number;
  /** `action.data.stage` when the action is a multi-stage chain, else null. */
  stage: string | number | null;
  /** Perform progress in game minutes and the planned duration (null = until a need is full). */
  elapsed: number;
  duration: number | null;
  /** Free-form action data (recipe id, topic...), JSON only. Read-only. */
  data: ActionInstance['data'];
}

/** Phases in which the target object is actually being handled (walking to it does not count). */
const USING: ReadonlySet<ActionPhase> = new Set<ActionPhase>(['prepare', 'perform', 'apply']);

export function runningAction(p: Person): ActionInstance | null {
  const a = p.queue[0];
  return a && USING.has(a.phase) ? a : null;
}

/** objectId -> uses (normally one) for people standing on `lotId`. */
export function objectUses(state: GameState, lotId: Id = state.activeLotId): Map<Id, ObjectUse[]> {
  const out = new Map<Id, ObjectUse[]>();
  for (const p of Object.values(state.people)) {
    if (p.location.kind !== 'lot' || p.location.lotId !== lotId) continue;
    const a = runningAction(p);
    if (!a || a.target.kind !== 'object') continue;
    const stage = a.data?.stage;
    const use: ObjectUse = {
      personId: p.id,
      interactionId: a.interactionId,
      phase: a.phase,
      anim: p.anim?.id ?? 'idle',
      animSince: p.anim?.since ?? a.phaseSince,
      stage: typeof stage === 'string' || typeof stage === 'number' ? stage : null,
      elapsed: a.elapsed,
      duration: a.duration,
      data: a.data,
    };
    const list = out.get(a.target.objectId);
    if (list) list.push(use); else out.set(a.target.objectId, [use]);
  }
  return out;
}
