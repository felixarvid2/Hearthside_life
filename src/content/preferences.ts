// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Likes and dislikes offered by the character creator (Person.likes / Person.dislikes hold these ids).
// Id format '<group>:<name>'. Groups:
// - activity: matches interaction autonomy tags ('activity:cooking' <-> tag 'cooking'), so the simulation can
//   bias autonomy and enjoyment toward liked activities and away from disliked ones;
// - music: genres heard from radios and speakers;
// - decor: object/surface `style` values ('decor:modern' <-> style 'modern');
// - food: dish families; recipes.ts RECIPE_FOOD_TAGS maps each recipe to the food ids it satisfies;
// - topic: conversation topics (SocialDef.topics entries with the same id).

import type { ContentDB } from './types';

const p = (group: string, key: string, name: string) => ({ id: `${group}:${key}`, group, name });

/** Every preference, grouped by `group`. */
export const PREFERENCES: ContentDB['preferences'] = [
  p('activity', 'cooking', 'Cooking'), p('activity', 'reading', 'Reading'), p('activity', 'gaming', 'Video Games'),
  p('activity', 'tv', 'Watching TV'), p('activity', 'fitness', 'Working Out'), p('activity', 'dance', 'Dancing'),
  p('activity', 'gardening', 'Gardening'), p('activity', 'music', 'Listening to Music'),

  p('music', 'jazz', 'Jazz'), p('music', 'pop', 'Pop'), p('music', 'classical', 'Classical'),
  p('music', 'folk', 'Folk'), p('music', 'electronic', 'Electronic'), p('music', 'rock', 'Rock'),

  p('decor', 'modern', 'Modern'), p('decor', 'classic', 'Classic'), p('decor', 'cottage', 'Cottage'),
  p('decor', 'mid-century', 'Mid-Century'), p('decor', 'botanical', 'Botanical'), p('decor', 'retro', 'Retro'),

  p('food', 'comfort-food', 'Comfort Food'), p('food', 'pasta', 'Pasta'), p('food', 'vegetables', 'Vegetable Dishes'),
  p('food', 'seafood', 'Seafood'), p('food', 'breakfast', 'Breakfast Food'), p('food', 'roasts', 'Roasts'),

  p('topic', 'sports', 'Sports'), p('topic', 'books', 'Books'), p('topic', 'travel', 'Travel'),
  p('topic', 'food', 'Food'), p('topic', 'technology', 'Technology'), p('topic', 'music', 'Music'),
  p('topic', 'nature', 'Nature'), p('topic', 'movies', 'Movies'),

  // Milestone 12: weather preferences (sim/weather.ts reads these ids for the weather moodlets).
  p('weather', 'rain', 'Rainy Days'), p('weather', 'snow', 'Snow'), p('weather', 'sun', 'Sunshine'),
  p('weather', 'cold', 'Cold Weather'),
];
