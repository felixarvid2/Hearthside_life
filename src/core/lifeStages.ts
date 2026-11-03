// Life stages (Milestone 8): the order, how long each lasts at each aging setting, and small predicates the simulation and
// the interface share. Pure: no state is read or written here.

import type { LifeStage, SimSettings } from './types';

export const STAGE_ORDER: readonly LifeStage[] = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];

export const STAGE_LABELS: Readonly<Record<LifeStage, string>> = {
  baby: 'Baby', toddler: 'Toddler', child: 'Child', teen: 'Teen', youngAdult: 'Young adult', adult: 'Adult', elder: 'Elder',
};

/** Game days spent in each stage at the 'normal' aging setting. */
export const NORMAL_STAGE_DAYS: Readonly<Record<LifeStage, number>> = {
  baby: 3, toddler: 5, child: 10, teen: 10, youngAdult: 14, adult: 20, elder: 14,
};

/** 'long' aging takes this many times as long as normal. */
export const LONG_AGING_FACTOR = 2.5;

/** Bounds for a custom number of days per stage. */
export const MIN_STAGE_DAYS = 1;
export const MAX_STAGE_DAYS = 120;

export function stageIndex(stage: LifeStage): number { return STAGE_ORDER.indexOf(stage); }

/** The stage after `stage`, or null for an elder. */
export function nextStage(stage: LifeStage): LifeStage | null { return STAGE_ORDER[stageIndex(stage) + 1] ?? null; }

/** Babies and toddlers cannot look after themselves. */
export function isDependentStage(stage: LifeStage): boolean { return stage === 'baby' || stage === 'toddler'; }

/** Children and teens go to school. */
export function isSchoolStage(stage: LifeStage): boolean { return stage === 'child' || stage === 'teen'; }

/** Who may look after dependents: teens and every adult stage. */
export function isCaregiverStage(stage: LifeStage): boolean { return stageIndex(stage) >= stageIndex('teen'); }

/** Young adults and older: run a household, adopt, take a job. */
export function isGrownStage(stage: LifeStage): boolean { return stageIndex(stage) >= stageIndex('youngAdult'); }

/**
 * Days a person spends in `stage` under the world's aging setting, or null when aging is off. Custom values are
 * clamped to MIN_STAGE_DAYS..MAX_STAGE_DAYS; a stage without a custom value uses the normal length.
 */
export function stageLength(settings: Pick<SimSettings, 'aging' | 'agingDays'>, stage: LifeStage): number | null {
  switch (settings.aging) {
    case 'off': return null;
    case 'normal': return NORMAL_STAGE_DAYS[stage];
    case 'long': return Math.round(NORMAL_STAGE_DAYS[stage] * LONG_AGING_FACTOR);
    case 'custom': {
      const v = settings.agingDays?.[stage];
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NORMAL_STAGE_DAYS[stage];
      return Math.max(MIN_STAGE_DAYS, Math.min(MAX_STAGE_DAYS, n));
    }
    default: return null;
  }
}

/** Whole days until the next birthday, or null when aging is off (an elder counts to the end of the stage). */
export function daysToBirthday(settings: Pick<SimSettings, 'aging' | 'agingDays'>, stage: LifeStage, stageDays: number | undefined): number | null {
  const len = stageLength(settings, stage);
  if (len === null) return null;
  return Math.max(0, len - Math.max(0, Math.floor(stageDays ?? 0)));
}
