// Adoption (Milestone 8). A young adult, adult or elder of the player's household phones the agency (or uses the computer) and
// adopts a baby, toddler, child or teen: the player chooses the life stage, sex and name, pays a fee through transact
// (occurrence `adopt:<householdId>:<n>`, once only) and the new family member is created with parentIds and family ties. Their
// looks come from the parents' palette (skin, hair and eye colours), the rest is a seeded random person of that stage.
// Households hold at most MAX_HOUSEHOLD_SIZE people. Pregnancy is not part of this milestone.

import { browFor, NAME_MAX_LENGTH, PRONOUN_PRESETS, randomPersonDraft } from '../characters/names';
import { mixHex, shadeHex } from '../characters/outfits';
import { isGrownStage } from '../core/lifeStages';
import { addFeed, isProcessed, markProcessed, transact } from '../core/state';
import type { Cents, Id, LifeStage, Person, PersonLocation } from '../core/types';
import { settleBaby } from './care';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { linkParent, partnerOf, setFamilyTie } from './family';
import { entrySpots, homeLocation, placeOnLot } from './places';
import { createPerson } from './people';
import { addMemory } from './relationships';
import { addMoodlet } from './mood';
import { ADOPTION_FEES, MAX_HOUSEHOLD_SIZE } from './tuning';

export type AdoptStage = 'baby' | 'toddler' | 'child' | 'teen';
export const ADOPT_STAGES: readonly AdoptStage[] = ['baby', 'toddler', 'child', 'teen'];

export interface AdoptionSpec {
  stage: AdoptStage;
  /** 'girl' = she/her, 'boy' = he/him. */
  sex: 'girl' | 'boy';
  firstName: string;
  /** Default: the adopter's last name. */
  lastName?: string;
}

export interface AdoptionPreview {
  ok: boolean;
  reason?: string;
  fee: Cents;
  /** The people who become the parents. */
  parents: string[];
  /** Members after the adoption, and the most a household holds. */
  members: number;
  maxMembers: number;
}

/** Why this person cannot start an adoption now (the phone entry), or null. */
export function adoptionStartProblem(ctx: Pick<SimCtx, 'state'>, p: Person): string | null {
  const hh = ctx.state.households[p.householdId];
  if (!hh || !hh.isPlayable) return `${p.firstName} decides for themself.`;
  if (!isGrownStage(p.lifeStage)) return 'Only young adults and older can adopt.';
  if (hh.memberIds.length >= MAX_HOUSEHOLD_SIZE) return `The household is full (${MAX_HOUSEHOLD_SIZE} people).`;
  return null;
}

/** Fee of an adoption by stage. */
export function adoptionFee(stage: AdoptStage): Cents { return ADOPTION_FEES[stage]; }

/** Checks an adoption without changing anything. */
export function adoptionPreview(ctx: SimCtx, adopterId: Id, spec: AdoptionSpec): AdoptionPreview {
  const adopter = ctx.state.people[adopterId];
  const none = (reason: string): AdoptionPreview => ({ ok: false, reason, fee: 0, parents: [], members: 0, maxMembers: MAX_HOUSEHOLD_SIZE });
  if (!adopter) return none('Unknown person.');
  const hh = ctx.state.households[adopter.householdId];
  const members = hh?.memberIds.length ?? 0;
  const base = { fee: ADOPT_STAGES.includes(spec.stage) ? adoptionFee(spec.stage) : 0, members: members + 1, maxMembers: MAX_HOUSEHOLD_SIZE };
  const parents = parentsFor(ctx, adopter).map((p) => p.firstName);
  const bad = (reason: string): AdoptionPreview => ({ ...base, ok: false, reason, parents });
  const start = adoptionStartProblem(ctx, adopter);
  if (start) return bad(start);
  if (!ADOPT_STAGES.includes(spec.stage)) return bad('Choose a baby, toddler, child or teen.');
  if (spec.sex !== 'girl' && spec.sex !== 'boy') return bad('Choose a girl or a boy.');
  const name = spec.firstName.trim();
  if (!name) return bad('Give the child a first name.');
  if (name.length > NAME_MAX_LENGTH || (spec.lastName ?? '').length > NAME_MAX_LENGTH) return bad(`Names can have at most ${NAME_MAX_LENGTH} letters.`);
  if (hh && hh.funds < base.fee && !ctx.state.settings.unlimitedFunds) return bad(`Not enough household funds ($${(base.fee / 100).toFixed(0)} needed).`);
  return { ...base, ok: true, parents };
}

/** The parents of an adopted child: the adopter and their partner or spouse when they live in the same household. */
function parentsFor(ctx: SimCtx, adopter: Person): Person[] {
  const out = [adopter];
  const pk = partnerOf(ctx.state, adopter.id);
  if (pk && pk.person.householdId === adopter.householdId && isGrownStage(pk.person.lifeStage)) out.push(pk.person);
  return out;
}

/** A random person of the stage whose skin, hair and eyes come from the parents. */
function palettedDraft(ctx: SimCtx, parents: Person[], spec: AdoptionSpec, lastName: string) {
  const pronouns = { ...PRONOUN_PRESETS[spec.sex === 'girl' ? 'she' : 'he'] };
  const draft = randomPersonDraft(ctx.rng, ctx.content, {
    firstName: spec.firstName.trim(), lastName, pronouns, frame: spec.sex === 'girl' ? 'b' : 'a', lifeStage: spec.stage, careerChance: 0,
  });
  const a = draft.appearance;
  const pick = <T>(f: (p: Person) => T): T => f(ctx.rng.pick(parents));
  const skin = parents.length > 1 ? mixHex(parents[0]!.appearance.skin, parents[1]!.appearance.skin, ctx.rng.range(0.2, 0.8)) : parents[0]!.appearance.skin;
  a.skin = shadeHex(skin, ctx.rng.range(-0.04, 0.04));
  a.hair.color = pick((p) => p.appearance.hair.color);
  a.hair.highlight = null;
  a.face.eyeColor = pick((p) => p.appearance.face.eyeColor);
  a.face.browColor = browFor(a.hair.color);
  draft.bio = '';
  // Little ones have fewer traits and no career; teens the full three.
  draft.traits = draft.traits.slice(0, spec.stage === 'baby' ? 1 : spec.stage === 'teen' ? 3 : 2);
  draft.careerId = null;
  return draft;
}

export type AdoptResult = { ok: true; personId: Id } | { ok: false; reason: string };

/** Adopts: pays the fee once, creates the person, the parent links and ties, memories and the notice. */
export function adopt(ctx: SimCtx, adopterId: Id, spec: AdoptionSpec): AdoptResult {
  const preview = adoptionPreview(ctx, adopterId, spec);
  if (!preview.ok) return { ok: false, reason: preview.reason ?? 'That adoption is not possible.' };
  const state = ctx.state;
  const adopter = state.people[adopterId]!;
  const hh = state.households[adopter.householdId]!;
  let n = 0;
  while (isProcessed(state, `adopt:${hh.id}:${n}`)) n++;
  const occ = `adopt:${hh.id}:${n}`;
  const parents = parentsFor(ctx, adopter);
  const lastName = spec.lastName?.trim() || adopter.lastName;
  const draft = palettedDraft(ctx, parents, spec, lastName);

  const paid = transact(state, ctx.events, hh.id, -preview.fee, 'family', `Adoption fee: ${spec.firstName.trim()}`, { occurrence: occ });
  if (!paid.ok) return { ok: false, reason: paid.reason };
  markProcessed(state, occ);

  let location: PersonLocation = homeLocation(state, adopter, ctx.now);
  const here = lotLoc(adopter);
  const lot = here ? state.lots[here.lotId] : undefined;
  if (here && lot) location = { kind: 'lot', lotId: here.lotId, level: here.level, x: here.x, z: here.z, facing: here.facing, posture: 'standing' };
  const child = createPerson(state, ctx.content, draft, hh.id, location);
  child.stageDays = 0;
  if (lot && spec.stage !== 'baby') {
    const spot = entrySpots(ctx, lot, 1)[0];
    if (spot) placeOnLot(ctx, child, lot, spot);
  }
  for (const par of parents) linkParent(state, child.id, par.id);
  for (const other of hh.memberIds) {
    if (other === child.id) continue;
    const o = state.people[other];
    if (!o) continue;
    const sharesParent = (o.parentIds ?? []).some((x) => parents.some((par) => par.id === x));
    setFamilyTie(state, child.id, other, sharesParent ? 'sibling' : 'none');
  }
  for (const par of parents) {
    addMemory(state, par, { kind: 'adopted', importance: 3, withId: child.id, text: `Adopted ${child.firstName}.` });
    addMemory(state, child, { kind: 'adopted', importance: 3, withId: par.id, text: `${par.firstName} adopted me.` });
  }
  for (const m of hh.memberIds) { const mp = state.people[m]; if (mp) addMoodlet(ctx.content, mp, 'newFamily', ctx.now, 'adoption'); }
  if (child.lifeStage === 'baby' && lotLoc(child)) settleBaby(ctx, child);
  addFeed(state, ctx.events, 'family', `${child.firstName} ${child.lastName} joined the family! ${parents.map((p) => p.firstName).join(' and ')} adopted a ${spec.stage}.`, child.id);
  ctx.events.emit({ type: 'person.added', personId: child.id });
  ctx.events.emit({ type: 'family', what: 'adopted', personIds: [child.id], householdId: hh.id });
  return { ok: true, personId: child.id };
}

/** Stages that can be adopted, for the dialog. */
export const ADOPT_STAGE_LABELS: Readonly<Record<AdoptStage, string>> = { baby: 'Baby', toddler: 'Toddler', child: 'Child', teen: 'Teen' };
export type { LifeStage };
