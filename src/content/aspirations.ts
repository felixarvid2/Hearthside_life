// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Aspirations: three stages each, completed in order; a stage completes when all its objectives are met and pays
// its reward once (occurrence id `aspiration:<personId>:<aspirationId>:<stage>`).
// Objective conventions for the simulation:
// - interactionCount.match: an interaction or social id ('cookMeal', 'introduce'), 'tag:<autonomy tag>' (any
//   interaction carrying the tag) or 'category:<social category>' (any accepted social of that category).
//   Counts completed (accepted, for socials) uses after the aspiration was chosen.
// - friends: number of people whose friendship toward this person (and back) is at least minFriendship.
// - ownObjects: placed objects owned by the household whose definition has `tag` in its tags; with `bought`, only
//   objects bought after move-in (the starter furnishings are pre-owned and do not count).
// - homeValue: household home lot value (land + placed objects at purchase price).
// - funds: household funds; careerLevel: current career level; bond: has at least one bond with that status.

import type { AspirationDef } from './types';
import { dollars } from '../core/money';

const stage = (name: string, objectives: AspirationDef['stages'][number]['objectives'], money: number, final = false): AspirationDef['stages'][number] => ({
  name, objectives,
  reward: {
    money: dollars(money), moodlet: final ? 'dreamFulfilled' : 'milestoneReached',
    text: `$${money.toLocaleString('en-US')} and the ${final ? 'Dream Fulfilled' : 'Milestone Reached'} mood boost.`,
  },
});

/** Every aspiration definition. */
export const ASPIRATIONS: AspirationDef[] = [
  {
    id: 'home-chef', name: 'Home Chef', icon: 'hunger', category: 'cooking', status: 'ready',
    description: 'Master the kitchen, one home-cooked meal at a time.',
    stages: [
      stage('Kitchen Curious', [
        { id: 'cook-2', text: 'Reach Cooking level 2', type: 'skill', skillId: 'cooking', level: 2 },
        { id: 'meals-3', text: 'Cook 3 meals', type: 'interactionCount', match: 'cookMeal', count: 3 },
      ], 200),
      stage('Weeknight Cook', [
        { id: 'cook-5', text: 'Reach Cooking level 5', type: 'skill', skillId: 'cooking', level: 5 },
        { id: 'meals-15', text: 'Cook 15 meals', type: 'interactionCount', match: 'cookMeal', count: 15 },
        { id: 'eat-20', text: 'Eat 20 home-cooked meals', type: 'interactionCount', match: 'eatMeal', count: 20 },
      ], 500),
      stage('Hearthside Chef', [
        { id: 'cook-8', text: 'Reach Cooking level 8', type: 'skill', skillId: 'cooking', level: 8 },
        { id: 'meals-40', text: 'Cook 40 meals', type: 'interactionCount', match: 'cookMeal', count: 40 },
      ], 1500, true),
    ],
  },
  {
    id: 'social-butterfly', name: 'Social Butterfly', icon: 'people', category: 'friendship', status: 'ready',
    description: 'Know everyone on the street and be welcome in every home.',
    stages: [
      stage('Friendly Face', [
        { id: 'introduce-3', text: 'Introduce yourself to 3 people', type: 'interactionCount', match: 'introduce', count: 3 },
        { id: 'friends-1', text: 'Have 1 friend (friendship 30+)', type: 'friends', count: 1, minFriendship: 30 },
      ], 200),
      stage('Life of the Party', [
        { id: 'friendly-25', text: 'Have 25 friendly conversations', type: 'interactionCount', match: 'category:friendly', count: 25 },
        { id: 'friends-3', text: 'Have 3 friends (friendship 40+)', type: 'friends', count: 3, minFriendship: 40 },
        { id: 'charisma-3', text: 'Reach Charisma level 3', type: 'skill', skillId: 'charisma', level: 3 },
      ], 500),
      stage('Beloved by All', [
        { id: 'friends-6', text: 'Have 6 friends (friendship 50+)', type: 'friends', count: 6, minFriendship: 50 },
        { id: 'close-friend', text: 'Have a close friend', type: 'bond', status: 'closeFriend' },
        { id: 'charisma-6', text: 'Reach Charisma level 6', type: 'skill', skillId: 'charisma', level: 6 },
      ], 1500, true),
    ],
  },
  {
    id: 'bookworm', name: 'Bookworm', icon: 'book', category: 'knowledge', status: 'ready',
    description: 'Read everything, remember most of it, and own the shelves to prove it.',
    stages: [
      stage('Page Turner', [
        { id: 'read-5', text: 'Read 5 books', type: 'interactionCount', match: 'readBook', count: 5 },
        { id: 'logic-2', text: 'Reach Logic level 2', type: 'skill', skillId: 'logic', level: 2 },
      ], 200),
      stage('Well Read', [
        { id: 'read-20', text: 'Read 20 books', type: 'interactionCount', match: 'readBook', count: 20 },
        { id: 'logic-5', text: 'Reach Logic level 5', type: 'skill', skillId: 'logic', level: 5 },
        { id: 'bookcases-2', text: 'Buy 2 bookcases', type: 'ownObjects', tag: 'bookcase', count: 2, bought: true },
      ], 500),
      stage('Living Library', [
        { id: 'read-50', text: 'Read 50 books', type: 'interactionCount', match: 'readBook', count: 50 },
        { id: 'logic-8', text: 'Reach Logic level 8', type: 'skill', skillId: 'logic', level: 8 },
      ], 1500, true),
    ],
  },
  {
    id: 'career-climber', name: 'Career Climber', icon: 'briefcase', category: 'career', status: 'ready',
    description: 'Work hard, network harder and reach the top of your field.',
    stages: [
      stage('Foot in the Door', [
        { id: 'level-3', text: 'Reach career level 3', type: 'careerLevel', level: 3 },
        { id: 'charisma-2', text: 'Reach Charisma level 2', type: 'skill', skillId: 'charisma', level: 2 },
      ], 300),
      stage('Rising Star', [
        { id: 'level-6', text: 'Reach career level 6', type: 'careerLevel', level: 6 },
        { id: 'charisma-4', text: 'Reach Charisma level 4', type: 'skill', skillId: 'charisma', level: 4 },
      ], 750),
      stage('Top of the Ladder', [
        { id: 'level-9', text: 'Reach career level 9', type: 'careerLevel', level: 9 },
        { id: 'funds-50k', text: 'Have $50,000 in household funds', type: 'funds', amount: dollars(50000) },
      ], 2500, true),
    ],
  },
  {
    id: 'successful-career', name: 'Successful Career', icon: 'briefcase', category: 'career', status: 'ready',
    description: 'Build a reputation, keep getting promoted and become the person everyone asks for advice.',
    stages: [
      stage('Reliable', [
        { id: 'level-2', text: 'Reach career level 2', type: 'careerLevel', level: 2 },
        { id: 'charisma-2', text: 'Reach Charisma level 2', type: 'skill', skillId: 'charisma', level: 2 },
      ], 300),
      stage('Respected', [
        { id: 'level-5', text: 'Reach career level 5', type: 'careerLevel', level: 5 },
        { id: 'skill-4', text: 'Reach Logic level 4', type: 'skill', skillId: 'logic', level: 4 },
        { id: 'funds-15k', text: 'Have $15,000 in household funds', type: 'funds', amount: dollars(15000) },
      ], 800),
      stage('Leader in the Field', [
        { id: 'level-8', text: 'Reach career level 8', type: 'careerLevel', level: 8 },
        { id: 'charisma-7', text: 'Reach Charisma level 7', type: 'skill', skillId: 'charisma', level: 7 },
        { id: 'funds-40k', text: 'Have $40,000 in household funds', type: 'funds', amount: dollars(40000) },
      ], 2500, true),
    ],
  },
  {
    id: 'fortune-builder', name: 'Fortune Builder', icon: 'money', category: 'wealth', status: 'ready',
    description: 'Turn wages and freelance work into a comfortable cushion, then into real security.',
    stages: [
      stage('Nest Egg', [
        { id: 'funds-10k', text: 'Save $10,000 in household funds', type: 'funds', amount: dollars(10000) },
        { id: 'freelance-1', text: 'Sell 3 pieces of freelance work', type: 'interactionCount', match: 'tag:freelance', count: 3 },
      ], 250),
      stage('Comfortable', [
        { id: 'funds-35k', text: 'Save $35,000 in household funds', type: 'funds', amount: dollars(35000) },
        { id: 'freelance-12', text: 'Sell 12 pieces of freelance work', type: 'interactionCount', match: 'tag:freelance', count: 12 },
        { id: 'value-70k', text: 'Raise your home value to $70,000', type: 'homeValue', amount: dollars(70000) },
      ], 900),
      stage('Old Money', [
        { id: 'funds-120k', text: 'Save $120,000 in household funds', type: 'funds', amount: dollars(120000) },
        { id: 'value-180k', text: 'Raise your home value to $180,000', type: 'homeValue', amount: dollars(180000) },
        { id: 'freelance-30', text: 'Sell 30 pieces of freelance work', type: 'interactionCount', match: 'tag:freelance', count: 30 },
      ], 4000, true),
    ],
  },
  {
    id: 'fitness-devotee', name: 'Fitness Devotee', icon: 'energy', category: 'fitness', status: 'ready',
    description: 'Make movement a daily habit and get into the best shape of your life.',
    stages: [
      stage('Getting Moving', [
        { id: 'fitness-2', text: 'Reach Fitness level 2', type: 'skill', skillId: 'fitness', level: 2 },
        { id: 'jog-5', text: 'Jog in place 5 times', type: 'interactionCount', match: 'jogInPlace', count: 5 },
      ], 200),
      stage('Daily Routine', [
        { id: 'fitness-5', text: 'Reach Fitness level 5', type: 'skill', skillId: 'fitness', level: 5 },
        { id: 'active-30', text: 'Complete 30 active sessions (jogging or dancing)', type: 'interactionCount', match: 'tag:active', count: 30 },
      ], 500),
      stage('Peak Condition', [
        { id: 'fitness-8', text: 'Reach Fitness level 8', type: 'skill', skillId: 'fitness', level: 8 },
        { id: 'active-80', text: 'Complete 80 active sessions', type: 'interactionCount', match: 'tag:active', count: 80 },
        { id: 'dance-20', text: 'Dance 20 times', type: 'interactionCount', match: 'danceSolo', count: 20 },
      ], 1500, true),
    ],
  },
  {
    id: 'dream-home', name: 'Dream Home', icon: 'home', category: 'home design', status: 'ready',
    description: 'Turn a house into a home worth showing off.',
    stages: [
      stage('Making It Home', [
        { id: 'decor-5', text: 'Own 5 decorative pieces', type: 'ownObjects', tag: 'decor', count: 5, bought: true },
        { id: 'plants-2', text: 'Own 2 plants', type: 'ownObjects', tag: 'plant', count: 2, bought: true },
      ], 250),
      stage('Room by Room', [
        { id: 'decor-12', text: 'Own 12 decorative pieces', type: 'ownObjects', tag: 'decor', count: 12, bought: true },
        { id: 'lamps-3', text: 'Own 3 lamps', type: 'ownObjects', tag: 'lamp', count: 3, bought: true },
        { id: 'rugs-2', text: 'Own 2 rugs', type: 'ownObjects', tag: 'rug', count: 2, bought: true },
      ], 750),
      stage('Dream Home', [
        { id: 'value-150k', text: 'Raise your home value to $150,000', type: 'homeValue', amount: dollars(150000) },
        { id: 'decor-25', text: 'Own 25 decorative pieces', type: 'ownObjects', tag: 'decor', count: 25, bought: true },
      ], 2500, true),
    ],
  },
];
