// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// The sixteen skills (brief section 11). Every skill has ten levels: a person starts at level 1 with 0 xp and
// reaches levels 2..10 at the cumulative xp thresholds below. Practice activities give 20-120 xp per game hour
// (see interactions.ts), so level 2 takes about two hours of focused practice and level 10 roughly 55 hours.
//
// Skills without a practice activity in the current build are status 'dev' (defined, never shown as finished
// content). Unlock texts only promise what exists; features of later milestones are marked "(later)".

import type { SkillDef } from './types';

/** Cumulative xp for levels 2..10. */
export const SKILL_THRESHOLDS: readonly number[] = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

const skill = (id: string, name: string, icon: string, status: SkillDef['status'], description: string, unlocks: SkillDef['unlocks']): SkillDef =>
  ({ id, name, icon, description, thresholds: [...SKILL_THRESHOLDS], unlocks, status });

/** Every skill definition. */
export const SKILLS: SkillDef[] = [
  skill('cooking', 'Cooking', 'hunger', 'ready', 'Preparing meals at the stove. Practised by cooking; better cooks know more recipes.', [
    { level: 2, text: 'Recipe: Vegetable Stir-Fry.' },
    { level: 3, text: 'Recipe: Spaghetti with Tomato Sauce.' },
    { level: 5, text: 'Recipe: Herb Roast Chicken.' },
    { level: 6, text: 'Recipe: Lemon Salmon with Greens.' },
    { level: 2, text: 'Required for promotion in the Culinary career from Prep Cook upward.' },
  ]),
  skill('baking', 'Baking', 'hunger', 'dev', 'Breads, cakes and pastries from the oven.', [
    { level: 3, text: '(later) Bake bread and cakes in the oven.' },
  ]),
  skill('logic', 'Logic', 'book', 'ready', 'Reasoning and problem solving. Practised by reading books.', [
    { level: 4, text: '(later) Play chess and solve puzzles with friends.' },
  ]),
  skill('programming', 'Programming', 'chart', 'ready', 'Writing software. Practised at a computer.', [
    { level: 4, text: '(later) Take freelance programming jobs for money.' },
  ]),
  skill('handiness', 'Handiness', 'build', 'dev', 'Fixing and upgrading things around the house.', [
    { level: 2, text: '(later) Repair broken objects.' },
  ]),
  skill('gardening', 'Gardening', 'sparkle', 'ready', 'Caring for plants. Practised by watering houseplants.', [
    { level: 3, text: '(later) Plant, tend and harvest garden crops.' },
  ]),
  skill('painting', 'Painting', 'roller', 'dev', 'Putting brush to canvas.', [
    { level: 3, text: '(later) Sell finished paintings.' },
  ]),
  skill('music', 'Music', 'sound', 'ready', 'A trained ear for melody and rhythm. Practised by listening closely to music (instruments come later).', [
    { level: 3, text: '(later) Play an instrument.' },
  ]),
  skill('writing', 'Writing', 'book', 'dev', 'Turning ideas into prose.', [
    { level: 3, text: '(later) Write and sell books.' },
  ]),
  skill('photography', 'Photography', 'eyedropper', 'dev', 'Framing the perfect shot.', [
    { level: 3, text: '(later) Sell photographs.' },
  ]),
  skill('charisma', 'Charisma', 'face', 'ready', 'Confidence and charm with people. Practised by rehearsing speeches at a mirror.', [
    { level: 2, text: 'Required for promotion in the Culinary career from Station Cook upward.' },
    { level: 5, text: '(later) Unlocks persuasive social interactions.' },
  ]),
  skill('fitness', 'Fitness', 'energy', 'ready', 'Strength and stamina. Practised by jogging and dancing.', [
    { level: 4, text: '(later) Workout equipment routines.' },
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
