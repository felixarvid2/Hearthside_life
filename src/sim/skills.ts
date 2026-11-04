// Skill experience and levels. Skills are recorded on a person the first time they are practiced.

import type { ContentDB, SkillDef } from '../content/types';
import { logicStudy, researchStudy } from '../content/skillEffects';
import { addFeed } from '../core/state';
import type { Person, SkillState } from '../core/types';
import type { SimCtx } from './context';
import { householdOf } from './context';
import { checkAspiration } from './aspirations';
import { addMoodlet } from './mood';

export const MAX_SKILL_LEVEL = 10;

/** Level for a cumulative xp amount (thresholds are the xp needed for levels 2..10). */
export function skillLevelFor(def: SkillDef, xp: number): number {
  let level = 1;
  for (const t of def.thresholds) if (xp >= t) level++; else break;
  return Math.min(level, MAX_SKILL_LEVEL);
}

/** Readable progress toward the next level. */
export function skillProgress(content: ContentDB, skillId: string, s: SkillState): { level: number; xp: number; nextAt: number | null; fraction: number } {
  const def = content.skills[skillId];
  if (!def) return { level: s.level, xp: s.xp, nextAt: null, fraction: 1 };
  const prev = s.level >= 2 ? def.thresholds[s.level - 2] ?? 0 : 0;
  const next = s.level < MAX_SKILL_LEVEL ? def.thresholds[s.level - 1] ?? null : null;
  const fraction = next === null ? 1 : Math.max(0, Math.min(1, (s.xp - prev) / Math.max(1, next - prev)));
  return { level: s.level, xp: s.xp, nextAt: next, fraction };
}

/** Product of the person's trait skill-rate multipliers for a skill. */
export function traitSkillMult(content: ContentDB, p: Person, skillId: string): number {
  let m = 1;
  for (const t of p.traits) {
    const v = content.traits[t]?.effects.skillRate?.[skillId];
    if (v !== undefined) m *= v;
  }
  return m;
}

/** Grants xp (after trait multipliers); handles level-ups with events, feed and aspiration checks. */
export function addSkillXp(ctx: SimCtx, p: Person, skillId: string, baseXp: number): void {
  const def = ctx.content.skills[skillId];
  if (!def || baseXp <= 0) return;
  const s = (p.skills[skillId] ??= { level: 1, xp: 0 });
  // Logical people are quick studies: every other skill gains a little extra. Research sharpens the study of
  // Logic and Programming specifically (Milestone 11, task C).
  let study = skillId === 'logic' ? 1 : 1 + logicStudy(p.skills.logic?.level ?? 1);
  if (skillId === 'logic' || skillId === 'programming') study *= 1 + researchStudy(p.skills.research?.level ?? 1);
  s.xp = Math.round((s.xp + baseXp * traitSkillMult(ctx.content, p, skillId) * study) * 100) / 100;
  const level = skillLevelFor(def, s.xp);
  if (level > s.level) {
    s.level = level;
    ctx.events.emit({ type: 'skill.level', personId: p.id, skillId, level });
    addMoodlet(ctx.content, p, 'skillUp', ctx.now, skillId);
    if (householdOf(ctx, p)?.isPlayable) addFeed(ctx.state, ctx.events, 'info', `${p.firstName} reached ${def.name} level ${level}.`, p.id);
    checkAspiration(ctx, p);
  }
}
