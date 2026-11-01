// What skill levels actually do in the daily-life simulation. Pure functions of a skill level (1..10) shared by
// the simulation and by the level texts in skills.ts, so the promises shown to players are the numbers used.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const lv = (level: number) => Math.max(0, Math.round(level) - 1);

// --- Cooking --------------------------------------------------------------------------------------------------
/** Meal quality before stove and cleanliness modifiers (0.35 at level 1, 0.89 at level 10). */
export const cookingQuality = (level: number): number => 0.35 + Math.max(1, level) * 0.06;
/** Chance that a meal is burnt (quality x0.6); a dirty stove adds 0.2 x dirt. */
export const cookingMishap = (level: number): number => Math.max(0, 0.22 - 0.03 * lv(level));
/** Chance of leaving a spill on the floor while cooking (none from level 8). */
export const cookingSpill = (level: number): number => Math.max(0, 0.3 - 0.045 * lv(level));
/** Cooking time multiplier. */
export const cookingTime = (level: number): number => clamp(1 - 0.025 * lv(level), 0.78, 1);

// --- Handiness ------------------------------------------------------------------------------------------------
/** Minutes a repair takes (40 at level 1, 17 at level 10). */
export const repairMinutes = (level: number): number => Math.max(12, Math.round(40 * (1 - 0.065 * lv(level))));
/** Cleaning and servicing time multiplier (0.64 at level 10). */
export const cleaningTime = (level: number): number => clamp(1 - 0.04 * lv(level), 0.6, 1);
/** Base chance a repair attempt succeeds (before logic, programming, quality and earlier failures). */
export const repairBase = (level: number): number => 0.4 + 0.06 * lv(level);
/** Chance of a shock when a repair of an electrical object fails (none from level 6). */
export const repairShock = (level: number): number => Math.max(0, 0.3 - 0.06 * lv(level));

// --- Fitness --------------------------------------------------------------------------------------------------
/** Energy decay multiplier for fitter people (0.865 at level 10). */
export const fitnessEnergyDecay = (level: number): number => 1 - 0.015 * lv(level);
/** Multiplier on the energy cost of active interactions. */
export const fitnessEnergyCost = (level: number): number => 1 - 0.04 * lv(level);
/** Multiplier on the hygiene lost by active interactions (they sweat less). */
export const fitnessSweat = (level: number): number => 1 - 0.05 * lv(level);

// --- Others ---------------------------------------------------------------------------------------------------
/** Logic: extra xp for every other skill (a quick study). */
export const logicStudy = (level: number): number => 0.03 * lv(level);
/** Logic: added to the repair success chance. */
export const logicRepair = (level: number): number => 0.02 * lv(level);
/** Programming: added to the success chance when repairing electronics. */
export const programmingRepair = (level: number): number => 0.03 * lv(level);
/** Charisma: added to the chance that others accept the person's social interactions. */
export const charismaAcceptance = (level: number): number => 0.012 * lv(level);
/** Charisma: discount on the repairperson's fee (talks the price down). */
export const charismaDiscount = (level: number): number => Math.min(0.18, 0.02 * lv(level));
/** Gardening: discount on grocery cost (home-grown herbs and vegetables). */
export const gardeningGroceries = (level: number): number => Math.min(0.18, 0.02 * lv(level));
/** Music: multiplier on the fun gained from music. */
export const musicFun = (level: number): number => 1 + 0.04 * lv(level);
/** Painting: multiplier on the fun gained from painting. */
export const paintingFun = (level: number): number => 1 + 0.04 * lv(level);

/** Highest skill level a skill book can teach. */
export const BOOK_MAX_LEVEL = 5;

/** Text for the level promises in skills.ts (generated from the functions above). */
export const effectText = {
  cookingTime: pct(1 - cookingTime(10)),
  cookingMishap1: pct(cookingMishap(1)),
  repairMinutes1: repairMinutes(1),
  repairMinutes10: repairMinutes(10),
  repairBase1: pct(repairBase(1)),
  repairBase10: pct(repairBase(10)),
  cleaningTime10: pct(1 - cleaningTime(10)),
  fitnessEnergy10: pct(1 - fitnessEnergyDecay(10)),
  fitnessSweat10: pct(1 - fitnessSweat(10)),
  logicStudy10: pct(logicStudy(10)),
  charismaAcceptance10: pct(charismaAcceptance(10)),
  charismaDiscount10: pct(charismaDiscount(10)),
  gardening10: pct(gardeningGroceries(10)),
  music10: pct(musicFun(10) - 1),
  painting10: pct(paintingFun(10) - 1),
};
