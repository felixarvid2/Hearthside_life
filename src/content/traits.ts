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

import type { NeedId, WeatherKind } from '../core/types';
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
const WEATHER_LABELS: Record<WeatherKind, string> = { clear: 'Sunny', cloudy: 'Cloudy', rain: 'Rainy', snow: 'Snowy' };

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
  for (const [kind, m] of Object.entries(e.weatherBias ?? {})) {
    out.push(`${WEATHER_LABELS[kind as WeatherKind]} weather lifts their mood ${pct(m)} ${m > 1 ? 'more' : 'less'}.`);
  }
  return out;
}

const trait = (id: string, name: string, category: TraitDef['category'], icon: string, conflicts: string[], description: string, effects: TraitDef['effects']): TraitDef =>
  ({ id, name, category, icon, conflicts, description, effects, effectText: describeTraitEffects(effects), status: 'ready' });

/** Every trait definition. */
export const TRAITS: TraitDef[] = [
  // --- Social behaviour
  trait('outgoing', 'Outgoing', 'social', 'people', ['reserved', 'homebody'], 'Lights up around people and gets lonely quickly without them.', {
    needDecay: { social: 1.3 }, autonomyBias: { social: 1.5 }, socialReceive: { friendly: 0.1, greeting: 0.1 },
  }),
  trait('reserved', 'Reserved', 'social', 'person', ['outgoing'], 'Enjoys company in small doses and recharges with a good book.', {
    needDecay: { social: 0.7 }, autonomyBias: { social: 0.7, reading: 1.2 }, socialReceive: { romantic: -0.1 },
  }),
  trait('cheerful', 'Cheerful', 'social', 'sun', [], 'Finds the bright side of most things and loves a good joke.', {
    needDecay: { fun: 0.85 }, socialReceive: { funny: 0.15 }, weatherBias: { clear: 1.15 },
  }),
  trait('hot-tempered', 'Hot-Tempered', 'social', 'warning', ['patient'], 'Quick to anger and slow to back down.', {
    autonomyBias: { argue: 1.6, criticize: 1.4, insult: 1.3 }, socialReceive: { mean: -0.15, support: -0.05 }, workPerformance: -1,
  }),
  trait('romantic', 'Romantic', 'social', 'heart', [], 'Believes in grand gestures and lingering looks.', {
    autonomyBias: { flirt: 1.6, complimentAppearance: 1.4 }, socialReceive: { romantic: 0.15 },
  }),
  trait('charismatic', 'Charismatic', 'social', 'star', ['awkward'], 'Works a room effortlessly and remembers everyone\'s name.', {
    autonomyBias: { social: 1.3 }, socialReceive: { friendly: 0.15, funny: 0.1, deep: 0.05 }, skillRate: { charisma: 1.25 },
  }),
  trait('awkward', 'Awkward', 'social', 'person', ['charismatic'], 'Finds small talk hard and often says the wrong thing.', {
    autonomyBias: { social: 0.7 }, socialReceive: { friendly: -0.15, romantic: -0.1 }, skillRate: { charisma: 0.85 },
  }),
  trait('compassionate', 'Compassionate', 'social', 'heart', [], 'Feels for others and always makes time to listen.', {
    autonomyBias: { comfort: 1.5, hug: 1.3, askAdvice: 1.2 }, socialReceive: { support: 0.15, deep: 0.1 }, enjoys: { social: 1.1 },
  }),
  trait('gossip', 'Gossipy', 'social', 'people', ['discreet'], 'Lives for the latest news about everyone on the street.', {
    autonomyBias: { gossip: 1.8, shareNews: 1.5, social: 1.2 }, socialReceive: { deep: -0.05 },
  }),
  trait('discreet', 'Discreet', 'social', 'check', ['gossip'], 'Keeps confidences and never repeats what was said in private.', {
    autonomyBias: { shareSecret: 1.4, gossip: 0.3 }, socialReceive: { deep: 0.15, support: 0.05 },
  }),
  // --- Organisation and cleanliness
  trait('neat', 'Neat', 'tidiness', 'sparkle', ['messy'], 'Notices grime early and keeps everything spotless.', {
    needDecay: { hygiene: 1.15 }, autonomyBias: { washHands: 1.6, takeShower: 1.2, cleaning: 2 }, enjoys: { hygiene: 1.2 },
  }),
  trait('messy', 'Messy', 'tidiness', 'box', ['neat'], 'A little chaos never hurt anyone. Washing can wait.', {
    needDecay: { hygiene: 0.85 }, autonomyBias: { washHands: 0.5, cleaning: 0.3 },
  }),
  trait('organised', 'Organised', 'tidiness', 'check', ['carefree'], 'Everything has a place, and everything is in it.', {
    autonomyBias: { cleaning: 1.6, tidyUp: 1.5, mopFloor: 1.2 }, needDecay: { hygiene: 1.1 },
  }),
  trait('carefree', 'Carefree', 'tidiness', 'sun', ['organised'], 'Labels the drawers "stuff" and means it.', {
    autonomyBias: { cleaning: 0.5, tidyUp: 0.4 }, needDecay: { fun: 0.9 }, skillRate: { wellness: 1.2 },
  }),
  trait('green-thumb', 'Green Thumb', 'tidiness', 'sparkle', [], 'Happiest with soil under their nails.', {
    autonomyBias: { gardening: 1.7, waterPlant: 1.5, outdoor: 1.2 }, skillRate: { gardening: 1.35 }, enjoys: { gardening: 1.25 },
    weatherBias: { rain: 1.15 },
  }),
  // --- Activity and energy
  trait('athletic', 'Athletic', 'energy', 'energy', ['lazy'], 'Happiest when moving and full of stamina.', {
    needDecay: { energy: 0.9 }, autonomyBias: { active: 1.6 }, skillRate: { fitness: 1.5 }, enjoys: { active: 1.3 },
  }),
  trait('night-owl', 'Night Owl', 'energy', 'moon', ['early-bird'], 'Comes alive after dark and resists going to bed.', {
    needDecay: { energy: 0.9 }, autonomyBias: { sleep: 0.8, gaming: 1.2 },
  }),
  trait('early-bird', 'Early Bird', 'energy', 'sun', ['night-owl'], 'Early to bed, early to rise, and never late for work.', {
    autonomyBias: { sleep: 1.2 }, workPerformance: 2,
  }),
  trait('energetic', 'Energetic', 'energy', 'energy', ['lazy'], 'Bounces out of bed and is ready to go.', {
    needDecay: { energy: 0.85 }, autonomyBias: { active: 1.3 }, workPerformance: 1,
  }),
  trait('lazy', 'Lazy', 'energy', 'moon', ['energetic', 'athletic'], 'Believes rest is an activity in its own right.', {
    needDecay: { energy: 1.15 }, autonomyBias: { active: 0.6, rest: 1.4 }, workPerformance: -1,
  }),
  trait('insomniac', 'Insomniac', 'energy', 'moon', [], 'Lies awake long after the house has gone quiet.', {
    needDecay: { energy: 1.2 }, autonomyBias: { sleep: 0.7, reading: 1.2 },
  }),
  // --- Creativity and curiosity
  trait('creative', 'Creative', 'creativity', 'star', [], 'Always making something, from dinner to doodles.', {
    autonomyBias: { creative: 1.4 }, skillRate: { creativity: 1.25, painting: 1.25, music: 1.25, writing: 1.25 }, enjoys: { creative: 1.25, music: 1.1 },
  }),
  trait('practical', 'Practical', 'creativity', 'check', ['daydreamer'], 'Prefers useful skills and gets the job done.', {
    autonomyBias: { skill: 1.2, repair: 1.5 }, skillRate: { handiness: 1.25, cooking: 1.15 }, workPerformance: 1,
  }),
  trait('bookish', 'Bookish', 'creativity', 'book', [], 'Never without a book and always learning something.', {
    autonomyBias: { reading: 1.6 }, skillRate: { logic: 1.25, writing: 1.2, research: 1.25 }, enjoys: { reading: 1.3 },
  }),
  trait('tech-enthusiast', 'Tech Enthusiast', 'creativity', 'chart', [], 'Builds, codes and games on anything with a screen.', {
    autonomyBias: { computer: 1.5 }, skillRate: { programming: 1.3 }, enjoys: { computer: 1.25 },
  }),
  trait('artistic', 'Artistic', 'creativity', 'star', [], 'Sees a canvas in every blank wall.', {
    autonomyBias: { painting: 1.6, creative: 1.3 }, skillRate: { painting: 1.35, creativity: 1.3, photography: 1.2 }, enjoys: { painting: 1.25 },
  }),
  trait('curious', 'Curious', 'creativity', 'search', [], 'Asks "why" until someone looks it up.', {
    autonomyBias: { reading: 1.35, computer: 1.2, study: 1.2 }, skillRate: { research: 1.3, logic: 1.15 }, enjoys: { reading: 1.15 },
  }),
  trait('daydreamer', 'Daydreamer', 'creativity', 'fun', ['practical'], 'Head in the clouds, but the clouds are interesting.', {
    autonomyBias: { creative: 1.3, watchClouds: 1.4 }, needDecay: { fun: 0.9 }, enjoys: { creative: 1.2 },
    weatherBias: { cloudy: 1.15, snow: 1.1 },
  }),
  // --- Food and leisure
  trait('foodie', 'Foodie', 'leisure', 'hunger', [], 'Lives for the next great meal and loves to cook it.', {
    needDecay: { hunger: 1.1 }, autonomyBias: { cookMeal: 1.5 }, skillRate: { cooking: 1.25, baking: 1.25 }, enjoys: { food: 1.2 },
  }),
  trait('music-lover', 'Music Lover', 'leisure', 'sound', [], 'Always humming and always has something playing.', {
    autonomyBias: { music: 1.6 }, skillRate: { music: 1.4 }, enjoys: { music: 1.4 },
  }),
  trait('sweet-tooth', 'Sweet Tooth', 'leisure', 'hunger', [], 'Would rather bake it than buy it.', {
    autonomyBias: { food: 1.2, cooking: 1.1 }, skillRate: { baking: 1.35, cooking: 1.1 }, enjoys: { food: 1.2 },
  }),
  trait('coffee-lover', 'Coffee Lover', 'leisure', 'cafe', [], 'The day does not start until the kettle does.', {
    autonomyBias: { makeCoffee: 1.8, buyCoffee: 1.4 }, needDecay: { energy: 0.95 }, enjoys: { coffee: 1.3 },
  }),
  trait('outdoorsy', 'Outdoorsy', 'leisure', 'leaf', [], 'Inside is for sleeping; everything else is outside.', {
    autonomyBias: { outdoor: 1.5, goForJog: 1.4 }, skillRate: { fishing: 1.25 }, enjoys: { outdoor: 1.2, jog: 1.15 },
    weatherBias: { clear: 1.2 },
  }),
  // --- Ambition and lifestyle
  trait('ambitious', 'Ambitious', 'lifestyle', 'briefcase', ['relaxed'], 'Driven to climb the ladder, even at the cost of downtime.', {
    needDecay: { fun: 1.1 }, autonomyBias: { skill: 1.3 }, workPerformance: 3,
  }),
  trait('relaxed', 'Relaxed', 'lifestyle', 'home', ['ambitious'], 'Takes life slowly. Work can wait until after the nap.', {
    autonomyBias: { rest: 1.4, tv: 1.2, skill: 0.8 }, workPerformance: -1, enjoys: { rest: 1.2 }, weatherBias: { rain: 1.1 },
  }),
  trait('family-oriented', 'Family-Oriented', 'lifestyle', 'family', [], 'Home is where the heart is, and the people in it come first.', {
    autonomyBias: { phoneChat: 1.3 }, socialReceive: { family: 0.15, support: 0.1, deep: 0.05 }, enjoys: { social: 1.2 },
  }),
  trait('patient', 'Patient', 'lifestyle', 'clock', ['hot-tempered'], 'Calm under pressure and steady in practice.', {
    skillRate: { gardening: 1.2, cooking: 1.1 }, socialReceive: { support: 0.1 }, workPerformance: 1,
  }),
  trait('competitive', 'Competitive', 'lifestyle', 'chart', [], 'Second place is only the first loser.', {
    autonomyBias: { playChess: 1.5, active: 1.2 }, socialReceive: { mean: -0.1 }, workPerformance: 2,
  }),
  trait('generous', 'Generous', 'lifestyle', 'heart', [], 'Gives freely and expects nothing back.', {
    autonomyBias: { giveGift: 1.6, comfort: 1.3 }, socialReceive: { support: 0.1 }, enjoys: { social: 1.15 },
  }),
  trait('homebody', 'Homebody', 'lifestyle', 'home', ['outgoing'], 'No place like home, and no reason to leave it.', {
    autonomyBias: { tv: 1.3, rest: 1.15, cleaning: 1.1 }, socialReceive: { greeting: -0.05 }, enjoys: { rest: 1.15 },
    weatherBias: { rain: 1.15, snow: 1.1, clear: 0.9 },
  }),
];
