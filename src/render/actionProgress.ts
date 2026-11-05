// Milestone 11.5, task B: how far along a person's running action is, as data for the progress pill.
// Pure render-side helper (no three, no DOM, no sim writes). Everything comes from `person.queue[0]`, the person's
// needs and (optionally) the content database for names and stage plans. See dev/ds-tasks/m115/B-progress.md.

import type { ContentDB, InteractionDef } from '../content/types';
import { cookingTime } from '../content/skillEffects';
import type { ActionInstance, NeedId, Person, WorldState } from '../core/types';
import { NEED_IDS } from '../core/types';

export type ProgressStatus = 'running' | 'done' | 'cancelled' | 'failed';

export interface ActionProgress {
  /** Stable id of the action this progress belongs to (the view clamps per action id). */
  actionId: string;
  /** 0..1 across the whole action (all stages where the chain is known). */
  fraction: number;
  /** Interaction icon id (`src/ui/kit/icons.ts`). */
  icon: string;
  /** Readable action name ("Cook a Meal", "Chat", ...). */
  label: string;
  /** True once the action has completed (apply / successful cleanup). */
  done: boolean;
  status: ProgressStatus;
  /** Walking to the next stage's target; fraction is the completed share so far. */
  walking: boolean;
  /** Current action phase, for callers that want to special-case it. */
  phase: ActionInstance['phase'];
}

/** Phases that belong to a running action. queued/validate/reserve are not shown yet. */
const SHOWN: ReadonlySet<ActionInstance['phase']> = new Set<ActionInstance['phase']>([
  'route', 'prepare', 'perform', 'apply', 'cleanup',
]);

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function minutesOf(def: InteractionDef | undefined, fallback: number): number {
  if (def && def.duration.kind === 'fixed') return Math.max(0, def.duration.minutes);
  return fallback;
}

/** The need an untilFull interaction drives: the declared one, else the largest positive rate. */
function drivingNeed(def: InteractionDef | undefined): NeedId | null {
  if (!def) return null;
  if (def.duration.kind === 'untilFull') return def.duration.need;
  let best: NeedId | null = null;
  let bestRate = 0;
  for (const id of NEED_IDS) {
    const rate = def.needsPerHour[id] ?? 0;
    if (rate > bestRate) { best = id; bestRate = rate; }
  }
  return best;
}

/** Progress from the start value recorded by the sim to full; falls back to elapsed / max for older actions. */
function untilFullFraction(p: Person, a: ActionInstance, def: InteractionDef | undefined): number {
  const need = typeof a.data.startNeedId === 'string' ? (a.data.startNeedId as NeedId) : drivingNeed(def);
  const start = typeof a.data.startNeed === 'number' ? a.data.startNeed : null;
  if (need && start !== null && NEED_IDS.includes(need)) {
    const span = 100 - start;
    if (span > 0.5) return clamp01((p.needs[need] - start) / span);
  }
  const max = def && def.duration.kind === 'untilFull' ? def.duration.maxMinutes : 60;
  return clamp01(a.elapsed / Math.max(1, max));
}

/** Progress inside the current perform stage (0..1). */
function stageFraction(p: Person, a: ActionInstance, def: InteractionDef | undefined, content: ContentDB | undefined): number {
  if (a.phase === 'route') return 0;
  if (a.phase === 'prepare') return 0;
  if (a.phase === 'apply') return 1;
  if (a.phase === 'perform' || a.phase === 'cleanup') {
    if (a.duration !== null) {
      if (a.duration <= 0) return 1;
      return clamp01(a.elapsed / a.duration);
    }
    // A social listener has no duration in the action (external); the social def knows how long it lasts.
    const social = content?.socials[a.interactionId];
    if (social) return clamp01(a.elapsed / Math.max(1, social.minutes));
    return untilFullFraction(p, a, def);
  }
  return 0;
}

interface StagePlan {
  /** Planned minutes of every stage, in order. */
  weights: number[];
  /** Index of the current stage; -1 = walking to the first stage. */
  index: number;
}

const POOL_STAGES = ['enter', 'swim', 'exit'] as const;

/** Known multi-stage chains: planned stage times so the overall fraction never depends on seeing every stage. */
function stagePlan(a: ActionInstance, p: Person, def: InteractionDef | undefined, content: ContentDB | undefined): StagePlan | null {
  if (a.interactionId === 'swimInPool' || a.interactionId === 'relaxInPool') {
    const stage = typeof a.data.stage === 'string' ? a.data.stage : 'toDeck';
    const idx = POOL_STAGES.indexOf(stage as (typeof POOL_STAGES)[number]);
    const swim = minutesOf(def, a.interactionId === 'relaxInPool' ? 120 : 90);
    return { weights: [0.75, swim, 0.9], index: idx };
  }

  const numeric = typeof a.data.stage === 'number' ? a.data.stage : null;
  if (numeric === null) return null;
  const stage = Math.max(0, Math.round(numeric));

  if (a.interactionId === 'cookMeal' || def?.behavior === 'cook') {
    const recipeId = typeof a.data.recipeId === 'string' ? a.data.recipeId : '';
    const recipe = content?.recipes[recipeId];
    const base = recipe?.minutes ?? minutesOf(def, 30);
    const level = p.skills.cooking?.level ?? 1;
    const cook = Math.max(1, Math.round(base * cookingTime(level)));
    return { weights: [2, cook, 1], index: stage };
  }

  if (a.interactionId === 'eatMeal' || def?.behavior === 'eatMeal') {
    return { weights: [1, minutesOf(def, 25)], index: stage };
  }
  if (def?.behavior === 'read' || a.interactionId === 'readBook' || a.interactionId === 'readSkillBook') {
    return { weights: [1, minutesOf(def, 45)], index: stage };
  }
  if (def?.behavior === 'washDishes' || a.interactionId === 'washDishes') {
    return { weights: [1, 6], index: stage };
  }
  return null;
}

function planFraction(a: ActionInstance, p: Person, def: InteractionDef | undefined, content: ContentDB | undefined): number | null {
  const plan = stagePlan(a, p, def, content);
  if (!plan) return null;
  const weights = plan.weights.slice();
  const index = Math.min(weights.length - 1, plan.index);
  // Once the current stage is actually performing, its live duration is more accurate than the plan.
  if (index >= 0 && a.phase === 'perform' && a.duration !== null && a.duration > 0) weights[index] = a.duration;
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return clamp01(a.phase === 'route' ? 0 : 1);
  let base = 0;
  for (let i = 0; i < Math.max(0, index); i++) base += Math.max(0, weights[i] ?? 0);
  if (index < 0) return 0;
  const within = stageFraction(p, a, def, content);
  return clamp01((base + Math.max(0, weights[index] ?? 0) * within) / total);
}

function statusOf(a: ActionInstance): ProgressStatus {
  if (a.data.result === 'cancelled') return 'cancelled';
  if (a.data.result === 'failed') return 'failed';
  if (a.cancelRequested) return 'cancelled';
  if (a.phase === 'apply' || (a.phase === 'cleanup' && a.data.result === 'done')) return 'done';
  return 'running';
}

/**
 * Progress of the person's running action for the pill, or null when there is nothing to show
 * (no action, or only queued/validate/reserve). The caller decides whether the person is on screen and
 * whether their household is in scope.
 */
export function actionProgress(_state: WorldState, person: Person, content?: ContentDB): ActionProgress | null {
  const a = person.queue[0];
  if (!a || !SHOWN.has(a.phase)) return null;

  const def = content?.interactions[a.interactionId];
  const social = content?.socials[a.interactionId];
  const walking = a.phase === 'route';
  const status = statusOf(a);

  let fraction: number;
  if (status === 'cancelled' || status === 'failed') {
    // Keep the bar where it stopped; the pill greys it and fades.
    const plan = planFraction(a, person, def, content);
    fraction = plan ?? stageFraction(person, a, def, content);
  } else if (a.phase === 'apply' || (a.phase === 'cleanup' && a.data.result === 'done')) {
    fraction = 1;
  } else if (walking) {
    const plan = stagePlan(a, person, def, content);
    if (!plan || plan.index <= 0) fraction = 0;
    else fraction = planFraction(a, person, def, content) ?? 0;
  } else {
    fraction = planFraction(a, person, def, content) ?? stageFraction(person, a, def, content);
  }

  const label = def?.name ?? social?.name ?? a.interactionId;
  const icon = def?.icon ?? social?.icon ?? (walking ? 'move' : 'clock');
  return {
    actionId: a.id,
    fraction: clamp01(fraction),
    icon,
    label,
    done: status === 'done',
    status,
    walking,
    phase: a.phase,
  };
}
