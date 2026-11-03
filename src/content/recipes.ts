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
  // Milestone 11: baked goods. `skill: 'baking'` gates them by Baking level instead of Cooking, and the bake
  // interaction (sim/baking.ts) uses them; the cookMeal chain ignores them.
  {
    id: 'rustic-bread', name: 'Rustic Loaf', minutes: 45, cost: dollars(6), servings: 6, hunger: 45, minCookingLevel: 1, skill: 'baking',
    description: 'A crusty country loaf, still warm from the oven. The first thing every baker learns.', status: 'ready',
  },
  {
    id: 'berry-muffins', name: 'Berry Muffins', minutes: 30, cost: dollars(7), servings: 6, hunger: 46, minCookingLevel: 2, skill: 'baking',
    description: 'A tray of golden muffins studded with berries. Breakfast for the whole family.', status: 'ready',
  },
  {
    id: 'buttermilk-scones', name: 'Buttermilk Scones', minutes: 35, cost: dollars(8), servings: 6, hunger: 47, minCookingLevel: 3, skill: 'baking',
    description: 'Light, flaky scones to split and butter while they are still warm.', status: 'ready',
  },
  {
    id: 'celebration-cake', name: 'Celebration Layer Cake', minutes: 60, cost: dollars(18), servings: 8, hunger: 50, minCookingLevel: 5, skill: 'baking',
    description: 'Three sponge layers, jam and a swirl of frosting. Worth an occasion.', status: 'ready',
  },
  {
    id: 'apple-pie', name: 'Apple Pie', minutes: 70, cost: dollars(16), servings: 8, hunger: 52, minCookingLevel: 7, skill: 'baking',
    description: 'Cinnamon apples under a lattice crust. The test of a proper baker.', status: 'ready',
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
  'rustic-bread': ['food:breakfast', 'food:comfort-food'],
  'berry-muffins': ['food:breakfast'],
  'buttermilk-scones': ['food:breakfast', 'food:comfort-food'],
  'celebration-cake': ['food:comfort-food'],
  'apple-pie': ['food:comfort-food'],
};
