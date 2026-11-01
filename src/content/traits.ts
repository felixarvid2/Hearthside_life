// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Personality traits (brief section 6.7). Adults pick three; conflicting traits cannot be combined (conflicts
// are symmetric). Every trait has at least one effect the simulation applies:
// - needDecay: multiplies the base decay of a need (1 = normal).
// - autonomyBias: multiplies the autonomy score of an interaction or social id, or of every interaction carrying
//   that autonomy tag. The key 'social' covers all social interactions as well as interactions tagged 'social'.
// - skillRate: multiplies skill xp gains.
// - socialReceive: added to the acceptance chance of social interactions of that category aimed AT this person.
//   For 'mean' socials acceptance means the jab lands; a negative value means they push back and it backfires.
// - workPerformance: added to the daily career performance change.
// - enjoys: multiplies the need gains of interactions carrying that autonomy tag.
// `effectText` is generated from `effects` (describeTraitEffects), so the UI text always matches the data.

import type { NeedId } from '../core/types';
import type { SocialCategory, TraitDef } from './types';
import { INTERACTIONS } from './interactions';
import { SOCIALS } from './socials';
import { SKILLS } from './skills';

const NEED_LABELS: Record<NeedId, string> = { hunger: 'Hunger', energy: 'Energy', hygiene: 'Hygiene', bladder: 'Bladder', fun: 'Fun', social: 'Social' };

const CATEGORY_LABELS: Record<SocialCategory, string> = {
  greeting: 'Greeting', friendly: 'Friendly', funny: 'Funny', deep: 'Deep', support: 'Supportive', mean: 'Mean',
  romantic: 'Romantic', family: 'Family', status: 'Relationship-status',
};

/** Readable labels for autonomy tags used as trait keys. */
export const TAG_LABELS: Record<string, string> = {
  social: 'social', reading: 'reading', active: 'active', creative: 'creative', computer: 'computer', food: 'food',
  music: 'music', skill: 'skill-building', rest: 'resting', tv: 'TV', hygiene: 'washing', gaming: 'gaming', sleep: 'sleep', cleaning: 'cleaning', repair: 'repair',
};

const pct = (m: number) => `${Math.round(Math.abs(m - 1) * 100)}%`;

function keyLabel(key: string): string {
  const i = INTERACTIONS.find((d) => d.id === key);
  if (i) return `"${i.name}"`;
  const s = SOCIALS.find((d) => d.id === key);
  if (s) return `"${s.name}"`;
  return `${TAG_LABELS[key] ?? key} activities`;
}

/** Plain-English lines for exactly the given effects (used as TraitDef.effectText). */
export function describeTraitEffects(e: TraitDef['effects']): string[] {
  const out: string[] = [];
  for (const [need, m] of Object.entries(e.needDecay ?? {})) {
    out.push(`${NEED_LABELS[need as NeedId]} drops ${pct(m)} ${m > 1 ? 'faster' : 'slower'}.`);
  }
  for (const [key, m] of Object.entries(e.autonomyBias ?? {})) {
    const what = key === 'social' ? 'social interactions' : keyLabel(key);
    out.push(`Chooses ${what} ${pct(m)} ${m > 1 ? 'more' : 'less'} often on their own.`);
  }
  for (const [id, m] of Object.entries(e.skillRate ?? {})) {
    const name = SKILLS.find((s) => s.id === id)?.name ?? id;
    out.push(`Learns ${name} ${pct(m)} ${m > 1 ? 'faster' : 'slower'}.`);
  }
  for (const [cat, v] of Object.entries(e.socialReceive ?? {})) {
    const label = CATEGORY_LABELS[cat as SocialCategory];
    out.push(`${label} interactions aimed at them succeed ${Math.round(Math.abs(v) * 100)}% ${v > 0 ? 'more' : 'less'} often.`);
  }
  if (e.workPerformance) out.push(`${e.workPerformance > 0 ? '+' : ''}${e.workPerformance} career performance per workday.`);
  for (const [tag, m] of Object.entries(e.enjoys ?? {})) {
    out.push(`Gets ${pct(m)} ${m > 1 ? 'more' : 'less'} out of ${TAG_LABELS[tag] ?? tag} activities.`);
  }
  return out;
}

const trait = (id: string, name: string, category: TraitDef['category'], icon: string, conflicts: string[], description: string, effects: TraitDef['effects']): TraitDef =>
  ({ id, name, category, icon, conflicts, description, effects, effectText: describeTraitEffects(effects), status: 'ready' });

/** Every trait definition. */
export const TRAITS: TraitDef[] = [
  // --- Social behaviour
  trait('outgoing', 'Outgoing', 'social', 'people', ['reserved'], 'Lights up around people and gets lonely quickly without them.', {
    needDecay: { social: 1.3 }, autonomyBias: { social: 1.5 }, socialReceive: { friendly: 0.1, greeting: 0.1 },
  }),
  trait('reserved', 'Reserved', 'social', 'person', ['outgoing'], 'Enjoys company in small doses and recharges with a good book.', {
    needDecay: { social: 0.7 }, autonomyBias: { social: 0.7, reading: 1.2 }, socialReceive: { romantic: -0.1 },
  }),
  trait('cheerful', 'Cheerful', 'social', 'sun', [], 'Finds the bright side of most things and loves a good joke.', {
    needDecay: { fun: 0.85 }, socialReceive: { funny: 0.15 },
  }),
  trait('hot-tempered', 'Hot-Tempered', 'social', 'warning', ['patient'], 'Quick to anger and slow to back down.', {
    autonomyBias: { argue: 1.6, criticize: 1.4, insult: 1.3 }, socialReceive: { mean: -0.15, support: -0.05 }, workPerformance: -1,
  }),
  trait('romantic', 'Romantic', 'social', 'heart', [], 'Believes in grand gestures and lingering looks.', {
    autonomyBias: { flirt: 1.6, complimentAppearance: 1.4 }, socialReceive: { romantic: 0.15 },
  }),
  // --- Organisation and cleanliness
  trait('neat', 'Neat', 'tidiness', 'sparkle', ['messy'], 'Notices grime early and keeps everything spotless.', {
    needDecay: { hygiene: 1.15 }, autonomyBias: { washHands: 1.6, takeShower: 1.2, cleaning: 2 }, enjoys: { hygiene: 1.2 },
  }),
  trait('messy', 'Messy', 'tidiness', 'box', ['neat'], 'A little chaos never hurt anyone. Washing can wait.', {
    needDecay: { hygiene: 0.85 }, autonomyBias: { washHands: 0.5, cleaning: 0.3 },
  }),
  // --- Activity and energy
  trait('athletic', 'Athletic', 'energy', 'energy', [], 'Happiest when moving and full of stamina.', {
    needDecay: { energy: 0.9 }, autonomyBias: { active: 1.6 }, skillRate: { fitness: 1.5 }, enjoys: { active: 1.3 },
  }),
  trait('night-owl', 'Night Owl', 'energy', 'moon', ['early-bird'], 'Comes alive after dark and resists going to bed.', {
    needDecay: { energy: 0.9 }, autonomyBias: { sleep: 0.8, gaming: 1.2 },
  }),
  trait('early-bird', 'Early Bird', 'energy', 'sun', ['night-owl'], 'Early to bed, early to rise, and never late for work.', {
    autonomyBias: { sleep: 1.2 }, workPerformance: 2,
  }),
  // --- Creativity and curiosity
  trait('creative', 'Creative', 'creativity', 'star', [], 'Always making something, from dinner to doodles.', {
    autonomyBias: { creative: 1.4 }, skillRate: { creativity: 1.25, painting: 1.25, music: 1.25, writing: 1.25 }, enjoys: { creative: 1.25, music: 1.1 },
  }),
  trait('practical', 'Practical', 'creativity', 'check', [], 'Prefers useful skills and gets the job done.', {
    autonomyBias: { skill: 1.2, repair: 1.5 }, skillRate: { handiness: 1.25, cooking: 1.15 }, workPerformance: 1,
  }),
  trait('bookish', 'Bookish', 'creativity', 'book', [], 'Never without a book and always learning something.', {
    autonomyBias: { reading: 1.6 }, skillRate: { logic: 1.25, writing: 1.2, research: 1.25 }, enjoys: { reading: 1.3 },
  }),
  trait('tech-enthusiast', 'Tech Enthusiast', 'creativity', 'chart', [], 'Builds, codes and games on anything with a screen.', {
    autonomyBias: { computer: 1.5 }, skillRate: { programming: 1.3 }, enjoys: { computer: 1.25 },
  }),
  // --- Food and leisure
  trait('foodie', 'Foodie', 'leisure', 'hunger', [], 'Lives for the next great meal and loves to cook it.', {
    needDecay: { hunger: 1.1 }, autonomyBias: { cookMeal: 1.5 }, skillRate: { cooking: 1.25, baking: 1.25 }, enjoys: { food: 1.2 },
  }),
  trait('music-lover', 'Music Lover', 'leisure', 'sound', [], 'Always humming and always has something playing.', {
    autonomyBias: { music: 1.6 }, skillRate: { music: 1.4 }, enjoys: { music: 1.4 },
  }),
  // --- Ambition and lifestyle
  trait('ambitious', 'Ambitious', 'lifestyle', 'briefcase', ['relaxed'], 'Driven to climb the ladder, even at the cost of downtime.', {
    needDecay: { fun: 1.1 }, autonomyBias: { skill: 1.3 }, workPerformance: 3,
  }),
  trait('relaxed', 'Relaxed', 'lifestyle', 'home', ['ambitious'], 'Takes life slowly. Work can wait until after the nap.', {
    autonomyBias: { rest: 1.4, tv: 1.2, skill: 0.8 }, workPerformance: -1, enjoys: { rest: 1.2 },
  }),
  trait('family-oriented', 'Family-Oriented', 'lifestyle', 'family', [], 'Home is where the heart is, and the people in it come first.', {
    autonomyBias: { phoneChat: 1.3 }, socialReceive: { family: 0.15, support: 0.1, deep: 0.05 }, enjoys: { social: 1.2 },
  }),
  trait('patient', 'Patient', 'lifestyle', 'clock', ['hot-tempered'], 'Calm under pressure and steady in practice.', {
    skillRate: { gardening: 1.2, cooking: 1.1 }, socialReceive: { support: 0.1 }, workPerformance: 1,
  }),
];
