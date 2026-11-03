// OWNER: Task C (skills photography, fishing, research). Fishing catches and their value.
//
// A catch is resolved once, at the moment the fishing action completes, from stable hashes of the person and the
// action (sim/behaviors.ts), so the same action always lands the same fish and saving/loading cannot reroll it.
// Higher Fishing levels unlock better species, more fish per trip and, from level 8, never an empty net. The
// returned WorldItem is a 'fish' item: it can be eaten like a meal portion or sold through sellCatch.

import { dollars } from '../core/money';
import type { Cents } from '../core/types';

export interface FishSpecies {
  id: string;
  name: string;
  /** Hunger restored by one portion at quality 1 (eaten like a meal). */
  hunger: number;
  /** Base sale value of one fish at Fishing level 1. */
  value: Cents;
  /** Fishing level needed before this species can be hooked. */
  minLevel: number;
}

/** Species from the common to the rare. `minLevel` gates them; higher levels also bias the roll upward. */
export const FISH_SPECIES: readonly FishSpecies[] = [
  { id: 'fish-roach', name: 'Roach', hunger: 35, value: dollars(5), minLevel: 1 },
  { id: 'fish-perch', name: 'Perch', hunger: 40, value: dollars(9), minLevel: 1 },
  { id: 'fish-bream', name: 'Bream', hunger: 44, value: dollars(14), minLevel: 2 },
  { id: 'fish-trout', name: 'Brown Trout', hunger: 48, value: dollars(22), minLevel: 3 },
  { id: 'fish-pike', name: 'Northern Pike', hunger: 52, value: dollars(34), minLevel: 5 },
  { id: 'fish-carp', name: 'Golden Carp', hunger: 56, value: dollars(55), minLevel: 8 },
];

/** The species with this id, or undefined (e.g. a fish from a removed species). */
export function fishSpecies(id: string): FishSpecies | undefined {
  return FISH_SPECIES.find((s) => s.id === id);
}

/** Species that can be hooked at a level. */
export function fishForLevel(level: number): readonly FishSpecies[] {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const list = FISH_SPECIES.filter((s) => s.minLevel <= lv);
  return list.length > 0 ? list : FISH_SPECIES.slice(0, 1);
}

export interface Catch {
  /** null when nothing was caught. */
  species: FishSpecies | null;
  /** Number of fish landed (0 on an empty trip). */
  portions: number;
}

/**
 * Resolve a catch from two stable rolls in 0..1 (`speciesRoll`, `countRoll`). Deterministic: the same person,
 * action and level always give the same result.
 * - levels 1-2: one fish, and a one-in-five chance of an empty trip;
 * - level 3: up to two fish; level 5: usually two, sometimes three; level 8+: never empty.
 * - the species roll is biased toward the rarer end as the level rises.
 */
export function resolveCatch(level: number, speciesRoll: number, countRoll: number): Catch {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const emptyChance = lv >= 8 ? 0 : lv >= 5 ? 0.08 : 0.2;
  if (countRoll < emptyChance) return { species: null, portions: 0 };
  const list = fishForLevel(lv);
  // bias: 0 at level 1 (uniform) up to 0.6 at level 10 (leaning to the rare end)
  const bias = (lv - 1) * 0.066;
  const idx = Math.min(list.length - 1, Math.floor((speciesRoll * (1 - bias) + bias) * list.length));
  const species = list[Math.max(0, idx)]!;
  let portions = 1;
  if (lv >= 3) portions = 1 + (countRoll > 0.64 ? 1 : 0);
  if (lv >= 5) portions = 2 + (countRoll > 0.74 ? 1 : 0);
  if (lv >= 9) portions = 3;
  if (species.minLevel >= 8) portions = Math.max(1, portions - 1); // a rare fish is a prize in itself
  return { species, portions };
}

/** Sale value of one portion: base value, improved by level (level 8+ adds a further 15%). */
export function fishPortionValue(species: FishSpecies, level: number): Cents {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const levelBonus = 1 + 0.05 * (lv - 1);
  const rareBonus = lv >= 8 ? 1.15 : 1;
  return Math.round(species.value * levelBonus * rareBonus);
}
