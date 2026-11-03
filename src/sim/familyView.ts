// Read-only view of a person's family life for the interface (GameAPI.family, Milestone 8): stage and birthday countdown,
// relatives, school, and whether the household can adopt or split. Pure: building it never changes the world.

import { daysToBirthday, isDependentStage, STAGE_LABELS, stageLength } from '../core/lifeStages';
import type { Id, LifeStage, Person, SimSettings, WorldState } from '../core/types';
import { ageUpProblem } from './aging';
import { adoptionStartProblem } from './adoption';
import { cakeOnLot } from './care';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { relativesOf, treeMembersOf } from './family';
import { placeOf } from './places';
import { schoolInfo } from './school';
import type { SchoolInfo } from './school';
import { MAX_HOUSEHOLD_SIZE } from './tuning';

export interface RelativeInfo {
  id: Id;
  name: string;
  stage: LifeStage;
  stageLabel: string;
  /** "Parent", "Grandparent", "Cousin"... */
  text: string;
  /** Lives in the household the player runs. */
  household: boolean;
  where: string;
}

export interface FamilyInfo {
  personId: Id;
  name: string;
  stage: LifeStage;
  stageLabel: string;
  stageDays: number;
  /** Days in the stage at the aging setting; null when aging is off. */
  stageLength: number | null;
  daysToBirthday: number | null;
  aging: SimSettings['aging'];
  relatives: RelativeInfo[];
  /** People to draw in the family tree (the person first). */
  treeIds: Id[];
  /** Whether "Age up now" can be done (needs a birthday cake on the lot), and why not. */
  ageUp: { ok: boolean; reason?: string };
  adopt: { ok: boolean; reason?: string };
  school: SchoolInfo | null;
  /** Babies and toddlers of the household with their lowest need, for the care strip. */
  household: { members: number; maxMembers: number; dependents: number };
}

export function familyInfo(ctx: Pick<SimCtx, 'state' | 'content' | 'now'>, personId: Id): FamilyInfo | null {
  const state: WorldState = ctx.state;
  const p: Person | undefined = state.people[personId];
  if (!p) return null;
  const hh = state.households[p.householdId];
  const settings = state.settings;
  const relatives = relativesOf(state, p.id).map((r) => ({
    id: r.person.id, name: `${r.person.firstName} ${r.person.lastName}`.trim(), stage: r.person.lifeStage, stageLabel: STAGE_LABELS[r.person.lifeStage],
    text: r.text, household: r.person.householdId === p.householdId, where: placeOf(state, r.person).text,
  }));
  let ageUp: FamilyInfo['ageUp'];
  const problem = ageUpProblem(ctx, p);
  const loc = lotLoc(p);
  const lotId = loc?.lotId ?? state.activeLotId;
  if (problem) ageUp = { ok: false, reason: problem };
  else if (!lotId || !cakeOnLot(ctx, lotId)) ageUp = { ok: false, reason: 'Needs a birthday cake on a table or counter (Buy mode, Decor).' };
  else ageUp = { ok: true };
  const start = adoptionStartProblem(ctx, p);
  const members = hh?.memberIds.length ?? 0;
  return {
    personId: p.id, name: `${p.firstName} ${p.lastName}`.trim(), stage: p.lifeStage, stageLabel: STAGE_LABELS[p.lifeStage], stageDays: Math.floor(p.stageDays ?? 0),
    stageLength: stageLength(settings, p.lifeStage), daysToBirthday: daysToBirthday(settings, p.lifeStage, p.stageDays), aging: settings.aging,
    relatives, treeIds: treeMembersOf(state, p.id), ageUp,
    adopt: start ? { ok: false, reason: start } : { ok: true },
    school: schoolInfo(state, ctx.content, p),
    household: { members, maxMembers: MAX_HOUSEHOLD_SIZE, dependents: (hh?.memberIds ?? []).filter((id) => state.people[id] && isDependentStage(state.people[id]!.lifeStage)).length },
  };
}

