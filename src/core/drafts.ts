// Drafts are the creator's output and the input for creating people and households. Confirming a draft
// creates real Person records (src/sim/people.ts createPerson).

import type { Appearance, FamilyTie, LifeStage, Pronouns, Wardrobe } from './types';

export interface PersonDraft {
  firstName: string;
  lastName: string;
  pronouns: Pronouns;
  lifeStage: LifeStage;
  bio: string;
  voice: { preset: string; pitch: number };
  walkStyle: string;
  romance: { interestedIn: Array<'a' | 'b' | 'any'>; open: boolean };
  appearance: Appearance;
  outfits: Wardrobe;
  traits: string[];
  likes: string[];
  dislikes: string[];
  aspirationId: string | null;
  careerId: string | null;
}

export interface HouseholdDraft {
  name: string;
  members: PersonDraft[];
  /** Family/household ties between members by index; `tie` is what b is to a. */
  ties: Array<{ a: number; b: number; tie: FamilyTie }>;
}
