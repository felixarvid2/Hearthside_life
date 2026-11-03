// Age gating (Milestone 8): which life stages may do which interaction or social. Pure rules on content and people; the
// callers are sim/options.ts requestReason (menus and commands), sim/autonomy.ts (what people choose by themselves) and
// sim/social.ts socialRequirementReason.
//
//   baby     nothing on their own (they are looked after: sim/care.ts)
//   toddler  only interactions that list 'toddler' in InteractionDef.ages (toys, naps, high chair meals, the potty...)
//   child    eat, sleep, bathroom, fun, computer, homework and social - no cooking, chores, jobs, bills or event planning
//   teen     everything except adult romance, careers and bills (cooking and its hazards are allowed)
//   adults   everything
//
// An InteractionDef with `ages` is allowed for exactly those stages; without it the default for its behaviour applies.

import type { InteractionDef, SocialDef } from '../content/types';
import { ADULT_STAGES } from '../core/relations';
import { STAGE_LABELS } from '../core/lifeStages';
import type { LifeStage, Person } from '../core/types';

/** Behaviours children may use by default (the rest needs an explicit `ages`). */
const CHILD_BEHAVIORS: ReadonlySet<string> = new Set([
  'generic', 'sit', 'rest', 'sleep', 'snack', 'toilet', 'shower', 'eatMeal', 'watchTv', 'computer', 'homework', 'read', 'changeOutfit',
  'editOutfits', 'goHere', 'goToSchool', 'leaveLot', 'travelTo', 'inviteHome', 'phoneChat', 'ageUp', 'social',
]);

/** Behaviours teens may not use by default: jobs, bills, event planning and dating. */
const TEEN_BLOCKED_BEHAVIORS: ReadonlySet<string> = new Set(['openBills', 'openCareers', 'goToWork', 'planEvent', 'phoneDate']);

/** Behaviours only for people who can look after dependents (teen and up). */
const CAREGIVER_BEHAVIORS: ReadonlySet<string> = new Set(['care']);

/** Interaction tags that stay off the list of children even for the 'generic' behaviour (hazards and grown-up chores). */
const CHILD_BLOCKED_TAGS: ReadonlySet<string> = new Set(['cooking', 'grill', 'repair', 'chore', 'work', 'freelance']);

/** Stages that may use `def`. */
export function interactionStages(def: Pick<InteractionDef, 'ages' | 'behavior' | 'autonomy' | 'kind'>): readonly LifeStage[] {
  if (def.ages) return def.ages;
  const beh = def.behavior ?? 'generic';
  const out: LifeStage[] = [];
  if (CAREGIVER_BEHAVIORS.has(beh)) return ['teen', 'youngAdult', 'adult', 'elder'];
  if (beh === 'goHere') return ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder']; // a toddler can be walked to a spot
  if (CHILD_BEHAVIORS.has(beh) && !def.autonomy.tags.some((t) => CHILD_BLOCKED_TAGS.has(t))) out.push('child');
  if (!TEEN_BLOCKED_BEHAVIORS.has(beh)) out.push('teen');
  out.push('youngAdult', 'adult', 'elder');
  return out;
}

export function stageAllows(def: Pick<InteractionDef, 'ages' | 'behavior' | 'autonomy' | 'kind'>, stage: LifeStage): boolean {
  return interactionStages(def).includes(stage);
}

/** Why a person of this stage cannot do the interaction, or null. */
export function interactionStageReason(def: Pick<InteractionDef, 'ages' | 'behavior' | 'autonomy' | 'kind' | 'name'>, p: Pick<Person, 'lifeStage' | 'firstName'>): string | null {
  if (stageAllows(def, p.lifeStage)) return null;
  if (def.behavior === 'planEvent') return 'Only adults can plan gatherings.';
  switch (p.lifeStage) {
    case 'baby': return `${p.firstName} is a baby and needs looking after.`;
    case 'toddler': return `${p.firstName} is too little to do that.`;
    case 'child': return `${p.firstName} is too young for that.`;
    case 'teen': return 'Only adults can do that.';
    default: return 'Not at this stage of life.';
  }
}

/** Stages a social is for on each side: its explicit list, else every stage from child up. */
const SOCIAL_DEFAULT_STAGES: readonly LifeStage[] = ['child', 'teen', 'youngAdult', 'adult', 'elder'];

export function socialActorStages(def: Pick<SocialDef, 'requires'>): readonly LifeStage[] { return def.requires.actorStages ?? SOCIAL_DEFAULT_STAGES; }
export function socialTargetStages(def: Pick<SocialDef, 'requires'>): readonly LifeStage[] { return def.requires.targetStages ?? SOCIAL_DEFAULT_STAGES; }

/** Why `actor` cannot do the social to `target` because of their life stages, or null. Romance is checked by the caller. */
export function socialStageReason(def: Pick<SocialDef, 'requires' | 'category'>, actor: Pick<Person, 'lifeStage' | 'firstName'>, target: Pick<Person, 'lifeStage' | 'firstName'>): string | null {
  if (actor.lifeStage === 'baby' || actor.lifeStage === 'toddler') {
    if (!socialActorStages(def).includes(actor.lifeStage)) return `${actor.firstName} is too little for that.`;
  } else if (!socialActorStages(def).includes(actor.lifeStage)) {
    return `Not for ${STAGE_LABELS[actor.lifeStage].toLowerCase()}s.`;
  }
  if (!socialTargetStages(def).includes(target.lifeStage)) {
    return target.lifeStage === 'baby' || target.lifeStage === 'toddler'
      ? `${target.firstName} is too little for that.`
      : `Not with ${STAGE_LABELS[target.lifeStage].toLowerCase()}s.`;
  }
  if ((def.requires as { romantic?: boolean }).romantic || def.category === 'romantic') {
    if (!ADULT_STAGES.includes(actor.lifeStage) || !ADULT_STAGES.includes(target.lifeStage)) return 'Only between adults.';
  }
  return null;
}
