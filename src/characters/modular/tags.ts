// Creator filter chips for long garment lists: built from the optional `tags` of GarmentDef. Pure helpers.

import type { GarmentDef } from './types';

/** A slot with more garments than this gets a row of filter chips made from the garments' `tags`. */
export const FILTER_MIN_ITEMS = 12;

/** Filter chips offered for a slot's garments: the distinct tags in order of first appearance (empty = no filter row). */
export function tagFilters(list: readonly GarmentDef[]): string[] {
  if (list.length <= FILTER_MIN_ITEMS) return [];
  const tags: string[] = [];
  for (const g of list) for (const t of g.tags ?? []) if (!tags.includes(t)) tags.push(t);
  return tags;
}

/** Does a garment show under the chosen filter ('' = all)? */
export const matchesTag = (g: GarmentDef, tag: string): boolean => tag === '' || (g.tags ?? []).includes(tag);
