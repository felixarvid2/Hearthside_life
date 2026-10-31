// Aspiration tracking: objectives are evaluated on events (completed actions, skill levels, socials,
// career changes) and hourly; a completed stage advances once and pays its reward exactly once.

import type { AspirationObjective } from '../content/types';
import { addFeed, transact } from '../core/state';
import type { Person, WorldState } from '../core/types';
import type { ContentDB } from '../content/types';
import type { SimCtx } from './context';
import { addMoodlet } from './mood';
import { addMemory, friendsCount } from './relationships';

export interface ObjectiveView { id: string; text: string; current: number; target: number; done: boolean }
export interface AspirationView {
  aspirationId: string;
  name: string;
  stage: number;
  stageCount: number;
  stageName: string | null;
  complete: boolean;
  objectives: ObjectiveView[];
  reward: { money: number; text: string } | null;
}

/** Progress of one objective for a person (pure). */
export function objectiveProgress(state: WorldState, content: ContentDB, p: Person, o: AspirationObjective): ObjectiveView {
  const base = { id: o.id, text: o.text };
  const view = (current: number, target: number): ObjectiveView => ({ ...base, current: Math.min(current, target), target, done: current >= target });
  switch (o.type) {
    case 'skill': return view(p.skills[o.skillId]?.level ?? 0, o.level);
    case 'interactionCount': return view(p.aspiration?.progress[o.id] ?? 0, o.count);
    case 'friends': return view(friendsCount(state, p.id, o.minFriendship), o.count);
    case 'funds': return view(state.households[p.householdId]?.funds ?? 0, o.amount);
    case 'careerLevel': return view(p.career?.level ?? 0, o.level);
    case 'ownObjects': {
      const lot = homeLot(state, p);
      let n = 0;
      if (lot) for (const obj of Object.values(lot.objects)) {
        const def = content.objects[obj.defId];
        if (def && (def.id === o.tag || def.tags.includes(o.tag) || def.category === o.tag)) n++;
      }
      return view(n, o.count);
    }
    case 'homeValue': {
      const lot = homeLot(state, p);
      let v = lot?.landValue ?? 0;
      if (lot) {
        for (const obj of Object.values(lot.objects)) v += obj.purchasePrice;
        for (const op of Object.values(lot.openings)) v += op.purchasePrice;
      }
      return view(v, o.amount);
    }
    case 'bond': {
      let has = false;
      for (const b of Object.values(state.bonds)) if ((b.a === p.id || b.b === p.id) && b.status === o.status) { has = true; break; }
      return view(has ? 1 : 0, 1);
    }
  }
}

function homeLot(state: WorldState, p: Person) {
  const id = state.households[p.householdId]?.homeLotId;
  return id ? state.lots[id] : undefined;
}

/** Readable aspiration state for the UI. */
export function aspirationView(state: WorldState, content: ContentDB, p: Person): AspirationView | null {
  const asp = p.aspiration;
  if (!asp) return null;
  const def = content.aspirations[asp.aspirationId];
  if (!def) return null;
  const stage = def.stages[asp.stage];
  return {
    aspirationId: def.id,
    name: def.name,
    stage: asp.stage,
    stageCount: def.stages.length,
    stageName: stage?.name ?? null,
    complete: !stage,
    objectives: stage ? stage.objectives.map((o) => objectiveProgress(state, content, p, o)) : [],
    reward: stage ? { money: stage.reward.money, text: stage.reward.text } : null,
  };
}

/**
 * Counts a completed interaction (or social) toward interactionCount objectives, then re-evaluates.
 * An objective's `match` is an interaction/social id, `tag:<autonomy tag>` or `category:<social category>`;
 * `keys` holds the prefixed tag/category keys of the completed action.
 */
export function recordInteraction(ctx: SimCtx, p: Person, interactionId: string, keys: readonly string[]): void {
  const asp = p.aspiration;
  if (!asp) return;
  const stage = ctx.content.aspirations[asp.aspirationId]?.stages[asp.stage];
  if (!stage) return;
  let changed = false;
  for (const o of stage.objectives) {
    if (o.type !== 'interactionCount') continue;
    if (o.match === interactionId || keys.includes(o.match)) {
      asp.progress[o.id] = (asp.progress[o.id] ?? 0) + 1;
      changed = true;
    }
  }
  if (changed) checkAspiration(ctx, p);
}

/**
 * Evaluates the current stage: emits an event for each newly met objective and, when every objective is
 * met, pays the reward (occurrence `aspiration:<personId>:<aspirationId>:<stage>`) and advances one stage.
 */
export function checkAspiration(ctx: SimCtx, p: Person): void {
  const asp = p.aspiration;
  if (!asp) return;
  const def = ctx.content.aspirations[asp.aspirationId];
  const stage = def?.stages[asp.stage];
  if (!def || !stage) return;
  let all = true;
  for (const o of stage.objectives) {
    const v = objectiveProgress(ctx.state, ctx.content, p, o);
    const metKey = `met:${asp.stage}:${o.id}`;
    if (v.done && !asp.progress[metKey]) {
      asp.progress[metKey] = 1;
      ctx.events.emit({ type: 'aspiration', personId: p.id, what: 'objective', text: o.text });
    }
    if (!v.done) all = false;
  }
  if (!all) return;
  const occurrence = `aspiration:${p.id}:${def.id}:${asp.stage}`;
  if (stage.reward.money > 0) {
    transact(ctx.state, ctx.events, p.householdId, stage.reward.money, 'reward', `${def.name}: ${stage.name}`, { occurrence });
  }
  if (stage.reward.moodlet) addMoodlet(ctx.content, p, stage.reward.moodlet, ctx.now, def.id);
  asp.rewards.push(occurrence);
  if (asp.rewards.length > 20) asp.rewards.splice(0, asp.rewards.length - 20);
  // Clear per-stage bookkeeping so the next stage starts fresh.
  for (const k of Object.keys(asp.progress)) if (k.startsWith(`met:${asp.stage}:`)) delete asp.progress[k];
  for (const o of stage.objectives) if (o.type === 'interactionCount') delete asp.progress[o.id];
  asp.stage += 1;
  asp.completedStages += 1;
  const complete = asp.stage >= def.stages.length;
  const text = complete
    ? `${p.firstName} fulfilled the aspiration ${def.name}!`
    : `${p.firstName} completed "${stage.name}" (${def.name}).`;
  ctx.events.emit({ type: 'aspiration', personId: p.id, what: complete ? 'complete' : 'stage', text });
  if (complete) addMoodlet(ctx.content, p, 'dreamFulfilled', ctx.now, def.id);
  addFeed(ctx.state, ctx.events, 'aspiration', text, p.id);
  addMemory(ctx.state, p, { kind: 'aspiration', importance: complete ? 3 : 2, text: complete ? `Fulfilled ${def.name}` : `Reached ${stage.name}` });
}
