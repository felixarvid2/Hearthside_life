import { describe, expect, it } from 'vitest';
import { FAMILY_INTERACTIONS, FAMILY_SOCIALS } from '../../../src/content/family';
import { INTERACTIONS } from '../../../src/content/interactions';
import { SOCIALS } from '../../../src/content/socials';
import type { LifeStage } from '../../../src/core/types';
import { candidatesFor } from '../../../src/sim/autonomy';
import { interactionStages, socialStageReason, stageAllows } from '../../../src/sim/gating';
import { socialRequirementReason } from '../../../src/sim/social';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import { pureCtx, setNeeds } from './fixtures';
import { addMember, familyWorld } from './familyFixtures';
import { setBoth } from './socialFixtures';

const ALL = [...INTERACTIONS, ...FAMILY_INTERACTIONS];
const get = (id: string) => ALL.find((i) => i.id === id)!;
const stagesOf = (id: string): LifeStage[] => [...interactionStages(get(id))];

describe('age gating of interactions', () => {
  it('babies can do nothing on their own', () => {
    for (const d of ALL) {
      if (d.ages?.includes('baby')) throw new Error(`${d.id} lists baby`);
      expect(stageAllows(d, 'baby'), d.id).toBe(false);
    }
  });

  it('toddlers only do what lists toddler: toys, naps, sleeping, sitting, meals, TV, the potty, babbling, toddling, paddling at the pool edge and being walked somewhere', () => {
    const toddler = ALL.filter((d) => stageAllows(d, 'toddler')).map((d) => d.id).sort();
    expect(toddler).toEqual(['babble', 'eatMeal', 'goHere', 'nap', 'paddleAtEdge', 'playWithToys', 'sit', 'sleep', 'toddleAround', 'usePotty', 'watchTv']);
  });

  it('a toddler can be walked to a spot but a baby cannot', () => {
    const go = { behavior: 'goHere', autonomy: { enabled: false, ads: {}, tags: [] }, kind: 'tile' as const };
    expect(stageAllows(go, 'toddler')).toBe(true);
    expect(stageAllows(go, 'baby')).toBe(false);
  });

  it('children eat, sleep, use the bathroom, play, use the computer, do homework and socialise, but do not cook, work, pay bills or plan events', () => {
    for (const id of ['sleep', 'nap', 'eatMeal', 'grabSnack', 'useToilet', 'takeShower', 'watchTv', 'playComputerGames', 'doHomework', 'playWithToys', 'readBook', 'phoneChat', 'danceSolo', 'ageUpNow']) {
      expect(stageAllows(get(id), 'child'), id).toBe(true);
    }
    for (const id of ['cookMeal', 'grillFood', 'phoneBills', 'phoneJobs', 'planEvent', 'phoneDate', 'writeArticle', 'cleanObject', 'repairObject', 'goToWork', 'phoneInvite', 'phoneAdopt']) {
      if (INTERACTIONS.some((i) => i.id === id) || FAMILY_INTERACTIONS.some((i) => i.id === id)) expect(stageAllows(get(id), 'child'), id).toBe(false);
    }
  });

  it('teens may do almost everything (part-time job search included) except bills, event planning and dating', () => {
    for (const id of ['cookMeal', 'grillFood', 'cleanObject', 'repairObject', 'writeArticle', 'phoneChat', 'doHomework', 'phoneJobs']) {
      expect(stageAllows(get(id), 'teen'), id).toBe(true);
    }
    // The built-in goToWork is open to teens too; options.ts only offers it when they hold a job.
    expect(stageAllows({ behavior: 'goToWork', autonomy: { enabled: false, ads: {}, tags: [] }, kind: 'self' }, 'teen')).toBe(true);
    for (const id of ['phoneBills', 'planEvent', 'phoneDate', 'phoneAdopt']) expect(stageAllows(get(id), 'teen'), id).toBe(false);
    expect(stagesOf('careFeed')).toEqual(['teen', 'youngAdult', 'adult', 'elder']);
  });

  it('adults can do everything that is not specifically for children', () => {
    for (const d of ALL.filter((i) => !i.ages)) expect(stageAllows(d, 'adult'), d.id).toBe(true);
    expect(stageAllows(get('doHomework'), 'adult')).toBe(false);
    expect(stageAllows(get('usePotty'), 'adult')).toBe(false);
  });

  it('every interaction and social with explicit stages lists real life stages only', () => {
    const real = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];
    for (const d of ALL) for (const a of d.ages ?? []) expect(real, d.id).toContain(a);
    for (const s of [...SOCIALS, ...FAMILY_SOCIALS]) for (const a of [...(s.requires.actorStages ?? []), ...(s.requires.targetStages ?? [])]) expect(real, s.id).toContain(a);
  });
});

describe('age gating of socials', () => {
  const soc = (id: string) => [...SOCIALS, ...FAMILY_SOCIALS].find((s) => s.id === id)!;
  const p = (lifeStage: LifeStage) => ({ lifeStage, firstName: 'X' });

  it('ordinary socials are for children and older; babies and toddlers are too little', () => {
    expect(socialStageReason(soc('chat'), p('child'), p('adult'))).toBeNull();
    expect(socialStageReason(soc('chat'), p('adult'), p('toddler'))).toMatch(/too little/);
    expect(socialStageReason(soc('chat'), p('toddler'), p('adult'))).toMatch(/too little/);
    expect(socialStageReason(soc('chat'), p('baby'), p('adult'))).toMatch(/too little/);
  });

  it('there is no romance under young adult', () => {
    expect(socialStageReason(soc('flirt'), p('teen'), p('teen'))).toBe('Only between adults.');
    expect(socialStageReason(soc('kiss'), p('adult'), p('teen'))).toBe('Only between adults.');
    expect(socialStageReason(soc('flirt'), p('youngAdult'), p('adult'))).toBeNull();
  });

  it('child socials: Play tag and Tickle go from grown-ups to children, Play peek-a-boo to toddlers', () => {
    expect(socialStageReason(soc('playTag'), p('adult'), p('child'))).toBeNull();
    expect(socialStageReason(soc('playTag'), p('child'), p('child'))).toBeNull();
    expect(socialStageReason(soc('playTag'), p('adult'), p('adult'))).toMatch(/Not with/);
    expect(socialStageReason(soc('tickle'), p('adult'), p('toddler'))).toBeNull();
    expect(socialStageReason(soc('tickle'), p('toddler'), p('adult'))).toMatch(/too little/);
    expect(socialStageReason(soc('playPeekaboo'), p('teen'), p('toddler'))).toBeNull();
    expect(socialStageReason(soc('playPeekaboo'), p('adult'), p('child'))).toMatch(/Not with/);
    expect(socialStageReason(soc('helpWithHomework'), p('child'), p('child'))).toMatch(/Not for/);
    expect(socialStageReason(soc('askToMoveIn'), p('teen'), p('adult'))).toMatch(/Not for/);
  });

  it('applies to the real requirement check, with a clear reason', () => {
    const fw = familyWorld();
    const hh = fw.w.state.activeHouseholdId;
    const teen = addMember(fw, hh, 'Tess', { lifeStage: 'teen' }, { x: 8, z: 9 });
    const ctx = pureCtx(fw.h);
    setBoth(fw.w.state, teen.id, fw.w.mira, { familiarity: 80, friendship: 80, romance: 80 });
    expect(socialRequirementReason(ctx, teen, fw.w.state.people[fw.w.mira]!, soc('flirt'))).toBe('Only between adults.');
    const baby = addMember(fw, hh, 'Bea', { lifeStage: 'baby' });
    expect(socialRequirementReason(ctx, fw.w.state.people[fw.w.mira]!, baby, soc('chat'))).toMatch(/too little/);
  });
});

describe('autonomy follows the gates', () => {
  it('a child never chooses to cook, work out the bills or run a chore; a toddler only toddler things; a baby nothing', () => {
    const fw = familyWorld({ startMinute: 5 * MINUTES_PER_DAY + 12 * 60, autonomy: true });
    const s = fw.w.state;
    const hh = s.activeHouseholdId;
    const child = addMember(fw, hh, 'Kit', { lifeStage: 'child' }, { x: 8, z: 8 });
    const tod = addMember(fw, hh, 'Tom', { lifeStage: 'toddler' }, { x: 9, z: 8 });
    const baby = addMember(fw, hh, 'Bea', { lifeStage: 'baby' }, { x: 7, z: 8 });
    for (const id of [child.id, tod.id, baby.id]) { setNeeds(s, id, 15); }
    const ctx = pureCtx(fw.h);
    const ids = (pid: string) => candidatesFor(ctx, s.people[pid]!).map((c) => c.req.interactionId);
    expect(ids(baby.id)).toEqual([]);
    const todIds = ids(tod.id);
    expect(todIds.length).toBeGreaterThan(0);
    for (const id of todIds) expect(stageAllows(get(id) ?? { behavior: 'social', autonomy: { enabled: true, ads: {}, tags: [] }, kind: 'self' }, 'toddler') || !get(id), id).toBe(true);
    expect(todIds).not.toContain('cookMeal');
    const childIds = ids(child.id);
    expect(childIds).not.toContain('cookMeal');
    expect(childIds.some((id) => /^(clean|repair|service|mop|tidy|washDishes)/.test(id))).toBe(false);
  });
});
