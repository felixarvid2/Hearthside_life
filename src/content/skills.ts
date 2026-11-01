// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// The sixteen skills (brief section 11). Every skill has ten levels: a person starts at level 1 with 0 xp and
// reaches levels 2..10 at the cumulative xp thresholds below. Practice activities give 20-120 xp per game hour
// (see interactions.ts), so level 2 takes about two hours of focused practice and level 10 roughly 55 hours.
//
// Skills without a practice activity in the current build are status 'dev' (defined, never shown as finished
// content). Unlock texts only promise what exists; features of later milestones are marked "(later)".
// Every skill with a practice activity also changes the daily-life simulation; the numbers live in skillEffects.ts
// (shared with the simulation) and are quoted here, so the texts cannot drift from the game.

import type { SkillDef } from './types';
import { effectText as fx } from './skillEffects';

/** Cumulative xp for levels 2..10. */
export const SKILL_THRESHOLDS: readonly number[] = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

const skill = (id: string, name: string, icon: string, status: SkillDef['status'], description: string, unlocks: SkillDef['unlocks']): SkillDef =>
  ({ id, name, icon, description, thresholds: [...SKILL_THRESHOLDS], unlocks, status });

/** Every skill definition. */
export const SKILLS: SkillDef[] = [
  skill('cooking', 'Cooking', 'hunger', 'ready', 'Preparing meals at the stove. Practised by cooking and by reading cookbooks; better cooks know more recipes and waste less.', [
    { level: 1, text: `Meals improve with every level; a beginner burns ${fx.cookingMishap1} of dishes and spills often. Spills stop at level 8.` },
    { level: 2, text: 'Recipe: Vegetable Stir-Fry.' },
    { level: 3, text: 'Recipe: Spaghetti with Tomato Sauce.' },
    { level: 5, text: 'Recipe: Herb Roast Chicken.' },
    { level: 6, text: 'Recipe: Lemon Salmon with Greens.' },
    { level: 10, text: `Cooks ${fx.cookingTime} faster than a beginner.` },
    { level: 2, text: 'Required for promotion in the Culinary career from Prep Cook upward.' },
  ]),
  skill('baking', 'Baking', 'hunger', 'dev', 'Breads, cakes and pastries from the oven.', [
    { level: 3, text: '(later) Bake bread and cakes in the oven.' },
  ]),
  skill('logic', 'Logic', 'book', 'ready', 'Reasoning and problem solving. Practised by reading books and playing chess.', [
    { level: 2, text: 'A quick study: every other skill gains 3% more experience per Logic level, and repairs succeed a little more often.' },
    { level: 10, text: `Other skills learn ${fx.logicStudy10} faster.` },
    { level: 4, text: '(later) Solve puzzles with friends.' },
  ]),
  skill('programming', 'Programming', 'chart', 'ready', 'Writing software. Practised at a computer or from a programming book.', [
    { level: 2, text: 'Understands electronics: repairs of TVs, computers and audio gear succeed 3% more often per level and shock less.' },
    { level: 4, text: '(later) Take freelance programming jobs for money.' },
  ]),
  skill('handiness', 'Handiness', 'build', 'ready', 'Fixing and maintaining things around the house. Practised by repairing and servicing objects, cleaning and reading repair manuals.', [
    { level: 1, text: `Repairs take ${fx.repairMinutes1} minutes and succeed ${fx.repairBase1} of the time; failures can waste time or give a shock.` },
    { level: 5, text: 'Repairs are quicker and far more reliable, and a shock is unlikely.' },
    { level: 6, text: 'No more shocks when a repair fails.' },
    { level: 10, text: `Repairs take ${fx.repairMinutes10} minutes and succeed ${fx.repairBase10} of the time; cleaning is ${fx.cleaningTime10} quicker.` },
  ]),
  skill('gardening', 'Gardening', 'sparkle', 'ready', 'Caring for plants. Practised by watering houseplants or reading the gardening almanac.', [
    { level: 2, text: 'Home-grown herbs and vegetables cut grocery bills by 2% per level.' },
    { level: 10, text: `Groceries cost ${fx.gardening10} less.` },
    { level: 3, text: '(later) Plant, tend and harvest garden crops.' },
  ]),
  skill('painting', 'Painting', 'roller', 'ready', 'Putting brush to canvas. Practised at an easel.', [
    { level: 2, text: 'Painting is more fun: 4% more fun per level.' },
    { level: 10, text: `Painting gives ${fx.painting10} more fun.` },
    { level: 3, text: '(later) Sell finished paintings.' },
  ]),
  skill('music', 'Music', 'sound', 'ready', 'A trained ear for melody and rhythm. Practised by listening closely to music and by playing the piano.', [
    { level: 2, text: 'Music is more enjoyable: 4% more fun per level.' },
    { level: 10, text: `Music gives ${fx.music10} more fun.` },
    { level: 3, text: '(later) Play more instruments.' },
  ]),
  skill('writing', 'Writing', 'book', 'dev', 'Turning ideas into prose.', [
    { level: 3, text: '(later) Write and sell books.' },
  ]),
  skill('photography', 'Photography', 'eyedropper', 'dev', 'Framing the perfect shot.', [
    { level: 3, text: '(later) Sell photographs.' },
  ]),
  skill('charisma', 'Charisma', 'face', 'ready', 'Confidence and charm with people. Practised by rehearsing speeches at a mirror or from a public speaking guide.', [
    { level: 2, text: 'People accept social interactions more often (1.2% per level) and the repairperson gives a 2% discount per level.' },
    { level: 10, text: `Social interactions land ${fx.charismaAcceptance10} more often; repairperson fees drop ${fx.charismaDiscount10}.` },
    { level: 2, text: 'Required for promotion in the Culinary career from Station Cook upward.' },
    { level: 5, text: '(later) Unlocks persuasive social interactions.' },
  ]),
  skill('fitness', 'Fitness', 'energy', 'ready', 'Strength and stamina. Practised by jogging, dancing, running on a treadmill and lifting weights.', [
    { level: 2, text: 'Energy drains 1.5% slower per level, and workouts tire and sweat less.' },
    { level: 10, text: `Energy drains ${fx.fitnessEnergy10} slower and workouts cost ${fx.fitnessSweat10} less hygiene.` },
    { level: 4, text: '(later) Workout routines and classes.' },
  ]),
  skill('wellness', 'Wellness', 'heart', 'dev', 'Calm, balance and self-care.', [
    { level: 2, text: '(later) Meditate to recover mood.' },
  ]),
  skill('fishing', 'Fishing', 'sun', 'dev', 'Patience at the water\'s edge.', [
    { level: 2, text: '(later) Fish at public venues.' },
  ]),
  skill('creativity', 'Creativity', 'star', 'dev', 'Imagination that feeds every artistic pursuit.', [
    { level: 3, text: '(later) Creative projects finish faster.' },
  ]),
  skill('research', 'Research', 'search', 'dev', 'Finding and connecting information.', [
    { level: 3, text: '(later) Research topics at the computer.' },
  ]),
];
