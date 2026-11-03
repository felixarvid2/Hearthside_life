// Extra effects of the family socials (Milestone 8, SocialDef.effect): teaching a toddler, helping with homework and asking
// somebody to move in. `socialEffectProblem` is part of the social's requirements (menus and autonomy); `applySocialEffect` runs
// once when the social was accepted.

import type { SocialDef } from '../content/types';
import type { Person } from '../core/types';
import type { SimCtx } from './context';
import { completeHomework, homeworkProblem } from './school';
import { addSkillXp } from './skills';
import { moveInNpc, moveInProblem } from './split';

const TEACH: Record<string, string> = { 'teach:talking': 'talking', 'teach:motor': 'motor', 'teach:potty': 'potty' };

/** Why the social's special effect is not possible between these two right now, or null. */
export function socialEffectProblem(ctx: SimCtx, actor: Person, target: Person, def: SocialDef): string | null {
  switch (def.effect) {
    case 'homework': return homeworkProblem(ctx, target) ? 'Nothing to help with right now.' : null;
    case 'moveIn': return moveInProblem(ctx, actor, target);
    default: return null;
  }
}

/** Runs the effect of an accepted social. */
export function applySocialEffect(ctx: SimCtx, actor: Person, target: Person, def: SocialDef): void {
  const effect = def.effect;
  if (!effect) return;
  const skill = TEACH[effect];
  if (skill) {
    if (target.lifeStage === 'toddler') addSkillXp(ctx, target, skill, 30);
    return;
  }
  if (effect === 'homework') completeHomework(ctx, target, true);
  else if (effect === 'moveIn') moveInNpc(ctx, actor, target);
}
