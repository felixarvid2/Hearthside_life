// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Recipes for the cookMeal interaction. `cost` is the grocery cost of the whole dish (all servings), charged
// once when cooking starts; `hunger` is restored by one portion of a perfect (quality 1) meal; `minutes` is the
// cooking time at the stove; `minCookingLevel` 0 means anyone can cook it.

import type { RecipeDef } from './types';
import { dollars } from '../core/money';

/** Every recipe definition, easiest first. */
export const RECIPES: RecipeDef[] = [
  {
    id: 'grilled-cheese', name: 'Grilled Cheese Sandwiches', minutes: 20, cost: dollars(8), servings: 4, hunger: 45, minCookingLevel: 0,
    description: 'Golden, crispy and impossible to get wrong. Cheap and quick.', status: 'ready',
  },
  {
    id: 'pancakes', name: 'Pancake Stack', minutes: 25, cost: dollars(9), servings: 4, hunger: 48, minCookingLevel: 0,
    description: 'Fluffy pancakes with syrup - breakfast, lunch or dinner.', status: 'ready',
  },
  {
    id: 'veggie-stir-fry', name: 'Vegetable Stir-Fry', minutes: 30, cost: dollars(14), servings: 4, hunger: 52, minCookingLevel: 2,
    description: 'Crunchy vegetables tossed in a hot pan with ginger and soy.', status: 'ready',
  },
  {
    id: 'spaghetti', name: 'Spaghetti with Tomato Sauce', minutes: 35, cost: dollars(16), servings: 4, hunger: 56, minCookingLevel: 3,
    description: 'A slow-simmered sauce over a big pot of pasta.', status: 'ready',
  },
  {
    id: 'roast-chicken', name: 'Herb Roast Chicken', minutes: 60, cost: dollars(30), servings: 6, hunger: 60, minCookingLevel: 5,
    description: 'A whole roast bird with herbs and potatoes - feeds a crowd.', status: 'ready',
  },
  {
    id: 'lemon-salmon', name: 'Lemon Salmon with Greens', minutes: 40, cost: dollars(32), servings: 4, hunger: 60, minCookingLevel: 6,
    description: 'Pan-seared salmon with lemon butter and green beans.', status: 'ready',
  },
];

/** Food preference ids ('food:*' in preferences.ts) each recipe satisfies; used for likes/dislikes when eating. */
export const RECIPE_FOOD_TAGS: Record<string, string[]> = {
  'grilled-cheese': ['food:comfort-food'],
  pancakes: ['food:breakfast', 'food:comfort-food'],
  'veggie-stir-fry': ['food:vegetables'],
  spaghetti: ['food:pasta', 'food:comfort-food'],
  'roast-chicken': ['food:roasts'],
  'lemon-salmon': ['food:seafood'],
};
