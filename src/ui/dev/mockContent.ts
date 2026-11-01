// Mock content for the UI dev page (dev/ui.html). Small but complete definitions so every HUD panel has
// something to show while the real registries are still being written. mergeContent() lets real content
// (when it loads) win over these entries.

import type {
  AspirationDef, CareerDef, ContentDB, InteractionDef, MoodletDef, ObjectDef, SkillDef, SocialDef, SurfaceDesign, TraitDef,
} from '../../content/types';
import type { NeedId } from '../../core/types';

const byId = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.id, x]));

function interaction(id: string, name: string, icon: string, kind: InteractionDef['kind'], minutes: number, needs: Partial<Record<NeedId, number>> = {}, behavior?: string): InteractionDef {
  return {
    id, name, description: `${name}.`, icon, kind, slotKinds: [], anims: { perform: 'interact' }, posture: 'standing',
    duration: { kind: 'fixed', minutes }, needsPerHour: needs, needsOnComplete: {}, autonomy: { enabled: true, ads: needs, tags: [] },
    allowVisitors: false, status: 'ready', ...(behavior ? { behavior } : {}),
  };
}

const INTERACTIONS: InteractionDef[] = [
  interaction('sleep', 'Sleep', 'bed', 'object', 480, { energy: 12 }, 'sleep'),
  interaction('nap', 'Nap', 'bed', 'object', 90, { energy: 10 }, 'rest'),
  interaction('sit', 'Sit', 'person', 'object', 30, {}, 'sit'),
  interaction('grabSnack', 'Grab a Snack', 'hunger', 'object', 5, { hunger: 25 }, 'snack'),
  interaction('cookMeal', 'Cook a Meal', 'hunger', 'object', 45, {}, 'cook'),
  interaction('eatMeal', 'Eat', 'hunger', 'item', 25, { hunger: 60 }, 'eatMeal'),
  interaction('watchTv', 'Watch TV', 'fun', 'object', 60, { fun: 30 }, 'watchTv'),
  interaction('readBook', 'Read a Book', 'book', 'object', 60, { fun: 15 }, 'read'),
  interaction('takeShower', 'Take a Shower', 'hygiene', 'object', 20, { hygiene: 200 }, 'shower'),
  interaction('useToilet', 'Use Toilet', 'bladder', 'object', 6, { bladder: 600 }, 'toilet'),
  interaction('changeOutfit', 'Change Outfit', 'shirt', 'object', 3, {}, 'changeOutfit'),
  interaction('editOutfits', 'Edit Outfits', 'shirt', 'object', 1, {}, 'editOutfits'),
  interaction('waterPlant', 'Water Plant', 'sparkle', 'object', 5, { fun: 5 }),
  interaction('goToWork', 'Go to Work', 'briefcase', 'self', 30, {}, 'goToWork'),
  interaction('goHere', 'Go Here', 'move', 'tile', 2, {}, 'goHere'),
  interaction('danceSolo', 'Dance', 'fun', 'self', 30, { fun: 25 }),
  interaction('jogInPlace', 'Jog in Place', 'energy', 'self', 30, { energy: -10 }),
  interaction('phoneInvite', 'Invite Over', 'phone', 'self', 5, {}, 'invite'),
  interaction('phoneChat', 'Chat on the Phone', 'phone', 'self', 20, { social: 30 }, 'phoneChat'),
];

function social(id: string, name: string, category: SocialDef['category'], icon = 'social'): SocialDef {
  const out = { actor: { friendship: 3 }, target: { friendship: 3 }, social: 10 };
  return {
    id, name, description: `${name}.`, icon, category, minutes: 10, anim: 'talk', requires: {}, acceptance: 0.8,
    targetTraits: {}, actorTraits: {}, success: out, failure: { actor: {}, target: { friendship: -2 }, social: 2 },
    lines: { success: ['{a} and {b} had a nice chat.'], failure: ['{b} was not in the mood.'] }, topics: [],
    autonomy: { enabled: true, weight: 1 }, alsoActivity: false, status: 'ready',
  };
}

const SOCIALS: SocialDef[] = [
  social('introduce', 'Introduce Yourself', 'greeting'),
  social('chat', 'Chat', 'friendly'),
  social('tellJoke', 'Tell a Joke', 'funny', 'fun'),
  social('compliment', 'Compliment', 'friendly', 'star'),
  social('deepTalk', 'Deep Conversation', 'deep', 'book'),
  social('flirt', 'Flirt', 'romantic', 'heart'),
  social('hug', 'Hug', 'support', 'heart'),
];

function trait(id: string, name: string, icon: string, category: TraitDef['category'], effectText: string[], conflicts: string[] = []): TraitDef {
  return { id, name, description: `${name} people ${effectText[0]?.toLowerCase() ?? ''}`, icon, category, conflicts, effects: {}, effectText, status: 'ready' };
}

const TRAITS: TraitDef[] = [
  trait('cheerful', 'Cheerful', 'sun', 'social', ['Mood stays brighter for longer.', 'Friendly chats are accepted more often.']),
  trait('foodie', 'Foodie', 'hunger', 'lifestyle', ['Enjoys cooking and eating more.', 'Learns Cooking 25 % faster.']),
  trait('bookworm', 'Bookworm', 'book', 'leisure', ['Has more fun reading.', 'Logic skill grows faster.']),
  trait('energetic', 'Energetic', 'energy', 'energy', ['Energy drains 15 % slower.'], ['lazy']),
  trait('neat', 'Neat', 'sparkle', 'tidiness', ['Hygiene drains slower.', 'Dislikes dirty dishes.']),
  trait('romantic', 'Romantic', 'heart', 'social', ['Romantic interactions succeed more often.']),
];

function skill(id: string, name: string, icon: string): SkillDef {
  return { id, name, description: `${name} skill.`, icon, thresholds: [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200], unlocks: [{ level: 3, text: `New ${name.toLowerCase()} options.` }], status: 'ready' };
}

const SKILLS: SkillDef[] = [
  skill('cooking', 'Cooking', 'hunger'), skill('logic', 'Logic', 'book'), skill('charisma', 'Charisma', 'social'),
  skill('fitness', 'Fitness', 'energy'), skill('gardening', 'Gardening', 'sparkle'), skill('music', 'Music', 'sound'),
  skill('programming', 'Programming', 'phone'),
];

const CULINARY_TITLES = ['Dishwasher', 'Prep Cook', 'Line Cook', 'Sous Chef', 'Chef de Partie', 'Head Cook', 'Executive Sous Chef', 'Head Chef', 'Executive Chef', 'Celebrated Chef'];
const CAREERS: CareerDef[] = [{
  id: 'culinary', name: 'Culinary', description: 'Cook your way up from the dish pit to your own celebrated menu.', icon: 'hunger',
  skills: ['cooking', 'charisma'],
  levels: CULINARY_TITLES.map((title, i) => ({
    level: i + 1, title, hourlyWage: 1400 + i * 450, days: i < 4 ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5],
    start: 9 * 60 + (i >= 6 ? 120 : 0), end: 17 * 60 + (i >= 6 ? 120 : 0),
    promotion: { performance: 40 + i * 4, skills: { cooking: Math.min(10, 1 + i), ...(i >= 3 ? { charisma: Math.min(10, i - 2) } : {}) } },
  })),
  status: 'ready',
}];

const ASPIRATIONS: AspirationDef[] = [{
  id: 'homeChef', name: 'Home Chef', description: 'Become known for meals that bring people together.', icon: 'hunger', category: 'food',
  stages: [
    { name: 'Kitchen Curious', objectives: [
      { id: 'cook3', text: 'Cook 3 meals', type: 'interactionCount', match: 'cookMeal', count: 3 },
      { id: 'cooking2', text: 'Reach Cooking level 2', type: 'skill', skillId: 'cooking', level: 2 },
    ], reward: { money: 25000, text: '$250 and the "Inspired Cook" mood' } },
    { name: 'Dinner Host', objectives: [
      { id: 'friends2', text: 'Have 2 friends', type: 'friends', count: 2, minFriendship: 40 },
      { id: 'cooking4', text: 'Reach Cooking level 4', type: 'skill', skillId: 'cooking', level: 4 },
    ], reward: { money: 50000, text: '$500' } },
    { name: 'Neighbourhood Chef', objectives: [
      { id: 'career4', text: 'Reach level 4 in a career', type: 'careerLevel', level: 4 },
      { id: 'funds', text: 'Have $30,000 in household funds', type: 'funds', amount: 3000000 },
    ], reward: { money: 100000, text: '$1,000 and a golden spatula' } },
  ],
  status: 'ready',
}, {
  id: 'socialButterfly', name: 'Social Butterfly', description: 'Know everyone on the street.', icon: 'people', category: 'social',
  stages: [{ name: 'Friendly Face', objectives: [{ id: 'friends3', text: 'Have 3 friends', type: 'friends', count: 3, minFriendship: 40 }], reward: { money: 20000, text: '$200' } }],
  status: 'ready',
}];

const MOODLETS: MoodletDef[] = [
  { id: 'wellRested', name: 'Well rested', description: 'A good night of sleep.', icon: 'bed', value: 15, minutes: 240 },
  { id: 'hungry', name: 'Hungry', description: 'Time to eat.', icon: 'hunger', value: -15, minutes: 0 },
  { id: 'greatChat', name: 'Great chat', description: 'Had a lovely conversation.', icon: 'social', value: 10, minutes: 180 },
  { id: 'cozyHome', name: 'Cozy home', description: 'The house feels nice.', icon: 'home', value: 8, minutes: 0 },
];

function obj(id: string, name: string, category: ObjectDef['category'], price: number, w: number, d: number, interactions: string[], tags: string[] = []): ObjectDef {
  return {
    id, name, description: `A ${name.toLowerCase()}.`, category, rooms: ['living'], style: 'warm', tags, packs: ['base'], tier: 'standard',
    price, quality: 3, functional: interactions.length > 0, model: { asset: id, scale: 2, offset: [0, 0, 0], yaw: 0 },
    footprint: { w, d }, layer: 'floor', blocksMovement: true, height: 1, slots: [], interactions, stats: { comfort: 5 },
    finishes: [{ id: 'wood', label: 'Wood', materials: [], swatches: [{ id: 'oak', name: 'Oak', color: '#b98a5a' }, { id: 'walnut', name: 'Walnut', color: '#6b4a32' }] }],
    status: 'ready',
  };
}

const OBJECTS: ObjectDef[] = [
  obj('bed-double-oak', 'Oak Double Bed', 'beds', 120000, 2, 2, ['sleep', 'nap'], ['bed']),
  obj('fridge-standard', 'Standard Fridge', 'kitchen', 85000, 1, 1, ['grabSnack', 'cookMeal'], ['kitchen']),
  obj('stove-basic', 'Basic Stove', 'kitchen', 60000, 1, 1, [], ['kitchen']),
  obj('sofa-tweed', 'Tweed Sofa', 'seating', 72000, 2, 1, ['sit', 'nap'], ['seat']),
  obj('tv-flatscreen', 'Flatscreen TV', 'electronics', 50000, 1, 1, ['watchTv'], ['tv']),
  obj('wardrobe-tall', 'Tall Wardrobe', 'storage', 45000, 1, 1, ['changeOutfit', 'editOutfits']),
  obj('bookcase-open', 'Open Bookcase', 'storage', 30000, 1, 1, ['readBook'], ['books']),
  obj('plant-potted', 'Potted Plant', 'decor', 6000, 1, 1, ['waterPlant'], ['plant']),
  obj('toilet-basic', 'Toilet', 'bathroom', 30000, 1, 1, ['useToilet']),
  obj('shower-stall', 'Shower Stall', 'bathroom', 65000, 1, 1, ['takeShower']),
  obj('table-dining-oak', 'Oak Dining Table', 'tables', 40000, 2, 1, []),
];

function surface(id: string, surfaceKind: 'wall' | 'floor', name: string, colors: string[][]): SurfaceDesign {
  return {
    id, surface: surfaceKind, name, description: `${name}.`, family: 'plain', tags: [], packs: ['base'], tier: 'standard',
    price: surfaceKind === 'wall' ? 300 : 500, painter: 'plain', params: {}, repeat: 1,
    palettes: colors.map((c, i) => ({ id: `p${i + 1}`, name: `Palette ${i + 1}`, colors: c })), status: 'ready',
  };
}

const WALLS: SurfaceDesign[] = [
  surface('plain-paint', 'wall', 'Plain Paint', [['#efe2cf'], ['#c9d8c5'], ['#d8c3d6']]),
  surface('subway-tile', 'wall', 'Subway Tile', [['#f4f1ea', '#cfc8bb']]),
  surface('stripes-regency', 'wall', 'Regency Stripes', [['#e8d9bd', '#c98f6a']]),
];
const FLOORS: SurfaceDesign[] = [
  surface('oak-planks', 'floor', 'Oak Planks', [['#b98a5a', '#9c7149']]),
  surface('checker-tile', 'floor', 'Checker Tile', [['#f1ece2', '#2f2a26']]),
  surface('carpet-plush', 'floor', 'Plush Carpet', [['#8fa7b5']]),
];

export function mockContent(): ContentDB {
  return {
    objects: byId(OBJECTS), openings: {}, wallDesigns: byId(WALLS), floorDesigns: byId(FLOORS),
    interactions: byId(INTERACTIONS), socials: byId(SOCIALS), events: {}, traits: byId(TRAITS), aspirations: byId(ASPIRATIONS),
    skills: byId(SKILLS), careers: byId(CAREERS), moodlets: byId(MOODLETS), recipes: {}, packs: { base: { id: 'base', name: 'Base', description: 'Base game' } },
    hair: {}, facialHair: {}, garments: {}, accessories: {}, patterns: {}, facePresets: {}, bodyPresets: {}, browStyles: {}, voices: {},
    faceParams: [], bodyParams: [], skinTones: [], hairColors: [], eyeColors: [], preferences: [],
  };
}

/** Real content wins; mock entries fill whatever the real registries do not define yet. */
export function mergeContent(mock: ContentDB, real: ContentDB | null): ContentDB {
  if (!real) return mock;
  const out = { ...mock } as Record<string, unknown>;
  for (const [k, v] of Object.entries(real)) {
    const m = (mock as unknown as Record<string, unknown>)[k];
    if (Array.isArray(v)) out[k] = v.length ? v : m;
    else if (v && typeof v === 'object') out[k] = { ...(m as object), ...(v as object) };
  }
  return out as unknown as ContentDB;
}
