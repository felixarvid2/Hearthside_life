// Interactions for furnishings that used to be display pieces: games (pool, darts, foosball, table tennis), pottery,
// drums, harp and cello, the recliner, the microwave and the laundry. The objects that offer them are listed in
// furnishingUse.ts (older designs) and objectsM10/decor-hobby.ts (the new games and the pottery wheel).

import type { InteractionDef } from './types';
import { dollars } from '../core/money';

type Def = Omit<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'> &
  Partial<Pick<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'>>;
const def = (d: Def): InteractionDef => ({ needsPerHour: {}, needsOnComplete: {}, status: 'ready', allowVisitors: false, slotKinds: ['use'], ...d });

/** Interactions that can be done with two people: a social with the same tag ("Play Pool Together") needs the object. */
export const GAME_OBJECT_TAGS: Readonly<Record<string, string>> = {
  playPool: 'pool-table', throwDarts: 'dartboard', playFoosball: 'foosball', playTableTennis: 'table-tennis',
};

/** Minutes of Laundry at each end of the run during which the machine door stands open (loading and unloading). */
export const LAUNDRY_DOOR_MINUTES = 3;
/** Minutes at each end of a microwave run during which its door is open. */
export const MICROWAVE_DOOR_MINUTES = 1;

export const FURNISHING_INTERACTIONS: InteractionDef[] = [
  def({
    id: 'playPool', name: 'Play Pool', description: 'Rack the balls and practise your break on the pool table. Fun, and you can play it together with someone from the social menu.',
    icon: 'fun', kind: 'object', behavior: 'generic', posture: 'standing', anims: { perform: 'clean' },
    duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { fun: 20, energy: -2 }, moodletOnComplete: 'wellPlayed',
    autonomy: { enabled: true, ads: { fun: 16 }, tags: ['pool-table', 'game', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'throwDarts', name: 'Throw Darts', description: 'Stand at the line and aim for the bullseye. A quick, cheerful game.',
    icon: 'fun', kind: 'object', behavior: 'generic', posture: 'standing', anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 25 }, needsPerHour: { fun: 16, energy: -1 }, moodletOnComplete: 'wellPlayed',
    autonomy: { enabled: true, ads: { fun: 13 }, tags: ['dartboard', 'game', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'playFoosball', name: 'Play Foosball', description: 'Spin the rods and slam the ball into the goal. Loud, silly and very good fun.',
    icon: 'fun', kind: 'object', behavior: 'generic', posture: 'standing', anims: { perform: 'clean' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 21, energy: -3 }, moodletOnComplete: 'wellPlayed',
    autonomy: { enabled: true, ads: { fun: 17 }, tags: ['foosball', 'game', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'playTableTennis', name: 'Play Table Tennis', description: 'Rally across the net. A little exercise and a lot of fun.',
    icon: 'energy', kind: 'object', behavior: 'generic', posture: 'standing', anims: { perform: 'exercise' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 18, energy: -6, hygiene: -3 }, skill: { id: 'fitness', xpPerHour: 25 }, moodletOnComplete: 'wellPlayed',
    autonomy: { enabled: true, ads: { fun: 15 }, tags: ['table-tennis', 'game', 'active', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'throwPottery', name: 'Throw a Pot', description: 'Centre a lump of clay on the wheel and pull up a pot. Trains Creativity, and leaves a handmade pot to place or sell.',
    icon: 'sparkle', kind: 'object', behavior: 'pottery', posture: 'standing', anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 75 }, needsPerHour: { fun: 14, energy: -3, hygiene: -3 }, skill: { id: 'creativity', xpPerHour: 55 },
    moodletOnComplete: 'inspired',
    autonomy: { enabled: true, ads: { fun: 12 }, tags: ['pottery', 'creative', 'skill', 'fun'] },
  }),
  def({
    id: 'sellPottery', name: 'Sell a Pot', description: 'Glaze and pack a pot for the weekend stall. Paid on completion; better Creativity earns more.',
    icon: 'money', kind: 'object', behavior: 'freelance', posture: 'standing', anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 5, energy: -2 }, skill: { id: 'creativity', xpPerHour: 45 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'pottery', 'creative', 'skill'] },
  }),
  def({
    id: 'playDrums', name: 'Play Drums', description: 'Sit behind the kit and beat out a rhythm. Loud fun that trains Music.',
    icon: 'sound', kind: 'object', behavior: 'computer', posture: 'seated', anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { fun: 19, energy: -4, hygiene: -2 }, skill: { id: 'music', xpPerHour: 50 },
    secondarySkill: { id: 'creativity', fraction: 0.35 }, moodletOnComplete: 'goodTunes',
    autonomy: { enabled: true, ads: { fun: 14 }, tags: ['music', 'instrument', 'drums', 'creative', 'skill', 'fun'] },
  }),
  def({
    id: 'playHarp', name: 'Play the Harp', description: 'Pluck a slow, shimmering tune on the concert harp. Calm fun that trains Music.',
    icon: 'sound', kind: 'object', behavior: 'computer', posture: 'seated', anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 17, energy: -1 }, skill: { id: 'music', xpPerHour: 55 },
    secondarySkill: { id: 'creativity', fraction: 0.35 }, moodletOnComplete: 'goodTunes',
    autonomy: { enabled: true, ads: { fun: 13 }, tags: ['music', 'instrument', 'harp', 'creative', 'skill', 'fun'] },
  }),
  def({
    id: 'playCello', name: 'Play the Cello', description: 'Draw the bow across the strings for a warm, dark tune. Trains Music.',
    icon: 'sound', kind: 'object', behavior: 'computer', posture: 'seated', anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 17, energy: -2 }, skill: { id: 'music', xpPerHour: 55 },
    secondarySkill: { id: 'creativity', fraction: 0.35 }, moodletOnComplete: 'goodTunes',
    autonomy: { enabled: true, ads: { fun: 13 }, tags: ['music', 'instrument', 'cello', 'creative', 'skill', 'fun'] },
  }),
  def({
    id: 'reclineBack', name: 'Recline', description: 'Pull the lever, lean right back and put your feet up. A comfortable way to rest.',
    icon: 'moon', kind: 'object', slotKinds: ['sit'], behavior: 'sit', posture: 'seated', anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { energy: 12, fun: 3 },
    autonomy: { enabled: true, ads: { energy: 8 }, tags: ['rest', 'recline'] }, allowVisitors: true,
  }),
  def({
    id: 'microwaveMeal', name: 'Microwave a Meal', description: 'Heat a ready meal or yesterday\'s leftovers in a few minutes (+35 hunger for $4).',
    icon: 'hunger', kind: 'object', slotKinds: [], behavior: 'snack', posture: 'standing', anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 6 }, needsOnComplete: { hunger: 35 }, cost: dollars(4),
    autonomy: { enabled: true, ads: { hunger: 30 }, tags: ['food', 'snack', 'microwave'] }, allowVisitors: true,
  }),
  def({
    id: 'storeFish', name: 'Put in the Fridge', description: 'Take the fish to the fridge. It keeps three times longer there and can be cooked later with Cook the Catch.',
    icon: 'hunger', kind: 'item', itemKinds: ['fish'], slotKinds: [], behavior: 'storeFish', posture: 'standing', anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 3 }, autonomy: { enabled: false, ads: {}, tags: ['food', 'fishing'] }, allowVisitors: true,
  }),
  def({
    id: 'doLaundry', name: 'Do the Laundry', description: 'Load the machine, run a wash and hang the clothes out. Fresh clothes make you feel clean.',
    icon: 'clean', kind: 'object', slotKinds: [], behavior: 'laundry', posture: 'standing', anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { energy: -3 }, needsOnComplete: { hygiene: 14 }, skill: { id: 'handiness', xpPerHour: 10 },
    moodletOnComplete: 'freshLaundry',
    autonomy: { enabled: true, ads: { hygiene: 8 }, tags: ['laundry', 'chore', 'household'] },
  }),
];
