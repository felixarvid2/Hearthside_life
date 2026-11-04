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
  skill('baking', 'Baking', 'hunger', 'ready', 'Breads, cakes and pastries from the oven. Practised at a stove or a bread oven; better bakers burn less and know more recipes.', [
    { level: 1, text: `Bake bread, muffins, scones, cakes and pies at any stove or bread oven. A beginner burns ${fx.bakingMishap1} of batches.` },
    { level: 2, text: 'Recipe: Berry Muffins.' },
    { level: 3, text: 'Recipe: Buttermilk Scones.' },
    { level: 5, text: 'Recipe: Celebration Layer Cake. Sell a box of bakes at the oven for money.' },
    { level: 7, text: 'Recipe: Apple Pie.' },
    { level: 10, text: `Bakes take ${fx.bakingTime10} less time and almost never burn.` },
  ]),
  skill('logic', 'Logic', 'book', 'ready', 'Reasoning and problem solving. Practised by reading books and playing chess.', [
    { level: 2, text: 'A quick study: every other skill gains 3% more experience per Logic level, and repairs succeed a little more often.' },
    { level: 10, text: `Other skills learn ${fx.logicStudy10} faster.` },
    { level: 2, text: 'Required for promotion in the Software, Medicine and Business careers.' },
    { level: 4, text: '(later) Solve puzzles with friends.' },
  ]),
  skill('programming', 'Programming', 'chart', 'ready', 'Writing software. Practised at a computer or from a programming book.', [
    { level: 2, text: 'Understands electronics: repairs of TVs, computers and audio gear succeed 3% more often per level and shock less.' },
    { level: 2, text: 'Take freelance programming gigs at a computer for money.' },
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
    { level: 2, text: 'Required for promotion in the Landscaping career.' },
    { level: 3, text: 'Plant, tend and harvest garden crops: bigger harvests from every third level.' },
  ]),
  skill('painting', 'Painting', 'roller', 'ready', 'Putting brush to canvas. Practised at an easel.', [
    { level: 2, text: 'Painting is more fun: 4% more fun per level.' },
    { level: 10, text: `Painting gives ${fx.painting10} more fun.` },
    { level: 3, text: 'Sell finished paintings at an easel.' },
  ]),
  skill('music', 'Music', 'sound', 'ready', 'A trained ear for melody and rhythm. Practised by listening closely to music and by playing the piano.', [
    { level: 2, text: 'Music is more enjoyable: 4% more fun per level. Busking at a piano earns tips.' },
    { level: 10, text: `Music gives ${fx.music10} more fun.` },
    { level: 3, text: '(later) Play more instruments.' },
  ]),
  skill('writing', 'Writing', 'book', 'ready', 'Turning ideas into prose. Practised by writing articles and books at a computer; better writers are paid more and finish sooner.', [
    { level: 2, text: 'Freelance articles sell for more as Writing improves.' },
    { level: 3, text: 'Write and sell books at a computer.' },
    { level: 6, text: 'Book advances grow sharply; articles rarely come back rejected.' },
    { level: 2, text: 'Required for promotion in the Journalism career from Copy Runner upward.' },
  ]),
  skill('photography', 'Photography', 'eyedropper', 'ready', 'Framing the perfect shot. Practised at a camera tripod at home and on photo walks at outdoor venues.', [
    { level: 1, text: 'Take photos at a camera tripod; every level improves the pictures and the fees.' },
    { level: 2, text: 'Sell photographs: finish a freelance photo job at a camera. Fees rise with Photography.' },
    { level: 3, text: 'Take photo walks at the park, market, arts centre and cafe.' },
    { level: 5, text: 'Gallery-grade prints: photo sales pay 25% more.' },
    { level: 8, text: 'Photo essays: a further 20% on every photo sale.' },
    { level: 10, text: `Master photographer: photo sales pay ${fx.photoBonus10} more than a beginner's.` },
  ]),
  skill('charisma', 'Charisma', 'face', 'ready', 'Confidence and charm with people. Practised by rehearsing speeches at a mirror or from a public speaking guide.', [
    { level: 2, text: 'People accept social interactions more often (1.2% per level) and the repairperson gives a 2% discount per level.' },
    { level: 10, text: `Social interactions land ${fx.charismaAcceptance10} more often; repairperson fees drop ${fx.charismaDiscount10}.` },
    { level: 2, text: 'Required for promotion in the Culinary, Journalism, Medicine, Music, Business and Landscaping careers.' },
    { level: 5, text: '(later) Unlocks persuasive social interactions.' },
  ]),
  skill('fitness', 'Fitness', 'energy', 'ready', 'Strength and stamina. Practised by jogging, dancing, running on a treadmill and lifting weights.', [
    { level: 2, text: 'Energy drains 1.5% slower per level, and workouts tire and sweat less.' },
    { level: 10, text: `Energy drains ${fx.fitnessEnergy10} slower and workouts cost ${fx.fitnessSweat10} less hygiene.` },
    { level: 2, text: 'Required for promotion in the Landscaping career from Gardener upward.' },
    { level: 4, text: '(later) Workout routines and classes.' },
  ]),
  skill('wellness', 'Wellness', 'heart', 'ready', 'Calm, balance and self-care. Practised by meditating anywhere at home, and by yoga and stretching on a mat.', [
    { level: 1, text: 'Meditate anywhere at home: a quiet half hour that leaves a Calm moodlet.' },
    { level: 2, text: 'Do yoga or stretch on a yoga mat for faster progress.' },
    { level: 5, text: 'A steady practice: energy and fun decay 1% slower per level, and bad moodlets weigh less.' },
    { level: 10, text: `Energy and fun decay ${fx.wellnessDecay10} slower; bad moodlets weigh ${fx.wellnessStress10} less.` },
  ]),
  skill('fishing', 'Fishing', 'sun', 'ready', 'Patience at the water\'s edge. Practised at the garden pond at home and at Lakeside Park.', [
    { level: 1, text: 'Fish the garden pond at home; every level improves the catch and its price.' },
    { level: 2, text: 'Cast a line at Lakeside Park.' },
    { level: 3, text: 'Land up to two fish per trip.' },
    { level: 5, text: 'Hook pike, and usually two or three fish a trip.' },
    { level: 8, text: 'Golden carp, and never an empty net.' },
    { level: 10, text: 'Master angler: the best catches sell for the most.' },
  ]),
  skill('creativity', 'Creativity', 'star', 'ready', 'Imagination that feeds every artistic pursuit. Practised by sketching ideas in a sketchbook, and by painting, music, writing and baking at a lower rate.', [
    { level: 1, text: 'Sketch ideas in a sketchbook at a desk or table.' },
    { level: 2, text: 'Painting, music, writing and baking also train Creativity, at a third of the rate.' },
    { level: 5, text: `Creative activities are 3% more fun per level (${fx.creativityFun10} by level 10).` },
    { level: 8, text: `Creative freelance work pays 4% more per level (${fx.creativityPay10} by level 10).` },
  ]),
  skill('motor', 'Motor Skills', 'energy', 'ready', 'Crawling, standing and walking. Little ones learn by being helped to their feet and by playing.', [
    { level: 2, text: 'Walks steadily.' },
    { level: 5, text: 'Runs and climbs.' },
  ]),
  skill('talking', 'Talking', 'social', 'ready', 'First words and sentences. Little ones learn by being talked to and read to.', [
    { level: 2, text: 'Says first words.' },
    { level: 5, text: 'Speaks in full sentences.' },
  ]),
  skill('potty', 'Potty Training', 'bladder', 'ready', 'Learning to use the potty. A toddler needs the potty chair and a patient helper.', [
    { level: 3, text: 'Uses the potty without help.' },
  ]),
  skill('research', 'Research', 'search', 'ready', 'Finding and connecting information. Practised at a computer or through a telescope.', [
    { level: 1, text: 'Research online at a computer or study the sky through a telescope.' },
    { level: 2, text: `Sharpens Logic and Programming study: ${fx.researchStudy10} more xp at level 10 (2% per level above 1).` },
    { level: 2, text: `Improves Science career performance (${fx.researchScience10} by level 10).` },
    { level: 5, text: 'Write and sell research papers at a computer.' },
    { level: 8, text: `Published research: papers pay ${fx.researchPaper10} more.` },
    { level: 10, text: 'A recognised researcher: the best paper fees and the sharpest study habits.' },
  ]),
];
