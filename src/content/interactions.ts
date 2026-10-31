// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Object, item, tile and self interactions. The simulation implements each `behavior` (see the interaction
// table in docs/ARCHITECTURE.md); this file only holds data.
//
// Balance reference - base need decay per game hour, implemented by the simulation (src/sim):
//   hunger -6.5, energy -5 (awake only), hygiene -4, bladder -11, fun -5, social -3.5.
// Targets used below:
// - Sleep on a standard bed (stats.energy 1) restores +12 energy/h: 10 -> 100 in 7.5 h. Budget beds
//   (energy 0.85) take ~8.8 h, sofas (0.7) are for naps only.
// - Sleep and nap also add +3.5 hunger/h and +6 bladder/h, which slows overnight decay to a net -3 hunger/h and
//   -5 bladder/h; the simulation therefore needs no extra posture-specific decay rule for lying people.
// - A meal portion restores 45-60 hunger (RecipeDef.hunger, applied by the eatMeal behaviour); a snack +25.
// - The toilet refills bladder at +600/h (empty -> full in 10 min); a shower refills hygiene in ~25 min.
// - Fun activities give +16..+28 fun/h before object `fun` multipliers; practice activities give 40-60 skill xp/h
//   (see SKILLS thresholds: level 2 at 100 xp, level 10 at 3,200 xp).
// Object stats scale the matching effect: energy (sleep/rest), comfort (sit), fun (fun gains), hygiene, skill.
// Autonomy `ads` advertise the need gains used by utility scoring; `tags` feed trait/preference biasing
// (preference ids 'activity:<tag>' match these tags).

import type { InteractionDef } from './types';
import { dollars } from '../core/money';

type Def = Omit<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'> &
  Partial<Pick<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'>>;

const def = (d: Def): InteractionDef => ({
  needsPerHour: {}, needsOnComplete: {}, slotKinds: [], allowVisitors: false, status: 'ready', ...d,
});

/** Overnight offsets shared by sleep and nap (see the header). */
const LYING_OFFSETS = { hunger: 3.5, bladder: 6 };

const REST: InteractionDef[] = [
  def({
    id: 'sleep', name: 'Sleep', description: 'Go to bed and sleep until fully rested (at most 10 hours). Changes into sleepwear while in bed.',
    icon: 'bed', kind: 'object', slotKinds: ['sleep'], behavior: 'sleep', posture: 'lying',
    anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
    duration: { kind: 'untilFull', need: 'energy', maxMinutes: 600 },
    needsPerHour: { energy: 12, ...LYING_OFFSETS }, moodletOnComplete: 'wellRested',
    autonomy: { enabled: true, ads: { energy: 80 }, tags: ['rest', 'sleep'] },
  }),
  def({
    id: 'nap', name: 'Nap', description: 'Lie down for a 90-minute nap. Beds restore more energy than sofas.',
    icon: 'moon', kind: 'object', slotKinds: ['sleep', 'sit'], behavior: 'rest', posture: 'lying',
    anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
    duration: { kind: 'fixed', minutes: 90 },
    needsPerHour: { energy: 14, ...LYING_OFFSETS },
    autonomy: { enabled: true, ads: { energy: 20 }, tags: ['rest', 'nap'] },
  }),
  def({
    id: 'sit', name: 'Sit', description: 'Sit down for a while. Comfortable seats lift the mood.',
    icon: 'person', kind: 'object', slotKinds: ['sit'], behavior: 'sit', posture: 'seated',
    anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'fixed', minutes: 30 },
    needsPerHour: { energy: 2 },
    autonomy: { enabled: true, ads: { energy: 3 }, tags: ['rest', 'sit'] }, allowVisitors: true,
  }),
];

const FOOD: InteractionDef[] = [
  def({
    id: 'grabSnack', name: 'Grab a Snack', description: 'Take something quick from the fridge. Restores 25 hunger for $3.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { prepare: 'openFridge', perform: 'eat' },
    duration: { kind: 'fixed', minutes: 5 }, needsOnComplete: { hunger: 25 }, cost: dollars(3),
    autonomy: { enabled: true, ads: { hunger: 25 }, tags: ['food', 'snack'] }, allowVisitors: true,
  }),
  def({
    id: 'cookMeal', name: 'Cook a Meal',
    description: 'Gather ingredients at the fridge, cook at a stove and serve portions for the household on the nearest free counter or table. Groceries cost depends on the recipe.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'cook', posture: 'standing',
    anims: { prepare: 'openFridge', perform: 'cook' },
    // The cook behaviour uses RecipeDef.minutes and RecipeDef.cost for the chosen recipe; 30 min is the default.
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 4 }, skill: { id: 'cooking', xpPerHour: 60 },
    moodletOnComplete: 'proudCook',
    autonomy: { enabled: true, ads: { hunger: 55 }, tags: ['food', 'cooking', 'creative'] },
  }),
  def({
    id: 'eatMeal', name: 'Eat', description: 'Take a portion and eat it at a table when a chair is free, otherwise standing.',
    icon: 'hunger', kind: 'item', behavior: 'eatMeal', posture: 'seated',
    anims: { prepare: 'pickUp', perform: 'eat' },
    // Hunger comes from the portion (RecipeDef.hunger scaled by meal quality), applied by the eatMeal behaviour.
    duration: { kind: 'fixed', minutes: 25 }, moodletOnComplete: 'goodMeal',
    autonomy: { enabled: true, ads: { hunger: 50 }, tags: ['food', 'meal'] }, allowVisitors: true,
  }),
];

const BATHROOM: InteractionDef[] = [
  def({
    id: 'useToilet', name: 'Use Toilet', description: 'Relieve yourself.',
    icon: 'bladder', kind: 'object', slotKinds: ['sit'], behavior: 'toilet', posture: 'seated',
    anims: { prepare: 'sitDown', perform: 'toilet', cleanup: 'standUp' },
    duration: { kind: 'untilFull', need: 'bladder', maxMinutes: 15 },
    needsPerHour: { bladder: 600 }, needsOnComplete: { hygiene: -3 },
    autonomy: { enabled: true, ads: { bladder: 100 }, tags: ['bathroom'] }, allowVisitors: true,
  }),
  def({
    id: 'takeShower', name: 'Take a Shower', description: 'Shower until fully clean (at most 30 minutes).',
    icon: 'hygiene', kind: 'object', slotKinds: ['use'], behavior: 'shower', posture: 'standing',
    anims: { perform: 'shower' },
    duration: { kind: 'untilFull', need: 'hygiene', maxMinutes: 30 },
    needsPerHour: { hygiene: 240, energy: 4 }, moodletOnComplete: 'freshAndClean',
    autonomy: { enabled: true, ads: { hygiene: 70 }, tags: ['bathroom', 'hygiene'] },
  }),
  def({
    id: 'takeBath', name: 'Take a Bath', description: 'A long soak: cleans more slowly than a shower (at most 45 minutes) but is fun and relaxing.',
    icon: 'hygiene', kind: 'object', slotKinds: ['use'], behavior: 'shower', posture: 'seated',
    anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'untilFull', need: 'hygiene', maxMinutes: 45 },
    needsPerHour: { hygiene: 150, fun: 10, energy: 6 }, moodletOnComplete: 'longSoak',
    autonomy: { enabled: true, ads: { hygiene: 60, fun: 8 }, tags: ['bathroom', 'hygiene', 'relax'] },
  }),
  def({
    id: 'washHands', name: 'Wash Hands', description: 'A quick wash at the sink: +10 hygiene.',
    icon: 'hygiene', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 3 }, needsOnComplete: { hygiene: 10 },
    autonomy: { enabled: true, ads: { hygiene: 10 }, tags: ['hygiene'] }, allowVisitors: true,
  }),
];

const LEISURE: InteractionDef[] = [
  def({
    id: 'watchTv', name: 'Watch TV', description: 'Watch from a free seat within 5 m that faces the screen, or standing in front of it.',
    icon: 'fun', kind: 'object', slotKinds: ['use'], behavior: 'watchTv', posture: 'seated',
    anims: { perform: 'watchTv' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 24 }, moodletOnComplete: 'entertained',
    autonomy: { enabled: true, ads: { fun: 24 }, tags: ['tv', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'playComputerGames', name: 'Play Computer Games', description: 'Play games at the computer, seated at a chair in front of the desk when there is one.',
    icon: 'fun', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 28, energy: -2 }, moodletOnComplete: 'gamingHigh',
    autonomy: { enabled: true, ads: { fun: 28 }, tags: ['computer', 'gaming', 'fun'] },
  }),
  def({
    id: 'practiceProgramming', name: 'Practice Programming', description: 'Work through coding exercises to train Programming.',
    icon: 'chart', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 5, energy: -3 }, skill: { id: 'programming', xpPerHour: 60 },
    autonomy: { enabled: true, ads: { fun: 5 }, tags: ['computer', 'skill', 'programming'] },
  }),
  def({
    id: 'readBook', name: 'Read a Book', description: 'Take a book and read it in a nearby free seat (or standing). Fun, and trains Logic.',
    icon: 'book', kind: 'object', slotKinds: ['use'], behavior: 'read', posture: 'seated',
    anims: { prepare: 'pickUp', perform: 'read' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 16 }, skill: { id: 'logic', xpPerHour: 40 },
    moodletOnComplete: 'lostInABook',
    autonomy: { enabled: true, ads: { fun: 12 }, tags: ['reading', 'skill', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'listenToMusic', name: 'Listen to Music', description: 'Put on some music and listen nearby for 30 minutes. Trains a musical ear (Music).',
    icon: 'sound', kind: 'object', behavior: 'generic', posture: 'standing',
    anims: { prepare: 'interact', perform: 'idle' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 16 }, skill: { id: 'music', xpPerHour: 20 },
    moodletOnComplete: 'goodTunes',
    autonomy: { enabled: true, ads: { fun: 10 }, tags: ['music', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'practiceSpeech', name: 'Practice Speech', description: 'Rehearse a speech in front of the mirror to train Charisma.',
    icon: 'face', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'talk' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 2 }, skill: { id: 'charisma', xpPerHour: 60 },
    moodletOnComplete: 'confidentSpeaker',
    autonomy: { enabled: true, ads: { fun: 2 }, tags: ['skill', 'charisma'] },
  }),
  def({
    id: 'waterPlant', name: 'Water Plant', description: 'Give the plant a drink. Trains Gardening a little.',
    icon: 'sparkle', kind: 'object', behavior: 'generic', posture: 'standing',
    anims: { perform: 'water' },
    duration: { kind: 'fixed', minutes: 5 }, needsOnComplete: { fun: 3 }, skill: { id: 'gardening', xpPerHour: 120 },
    moodletOnComplete: 'greenThumb',
    autonomy: { enabled: true, ads: { fun: 3 }, tags: ['gardening', 'skill'] },
  }),
];

const WARDROBE: InteractionDef[] = [
  def({
    id: 'changeOutfit', name: 'Change Outfit', description: 'Change into another outfit category (action data.category).',
    icon: 'shirt', kind: 'object', slotKinds: ['use'], behavior: 'changeOutfit', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 2 },
    autonomy: { enabled: false, ads: {}, tags: ['outfit'] },
  }),
  def({
    id: 'editOutfits', name: 'Plan Outfits', description: 'Open the wardrobe editor for this person.',
    icon: 'shirt', kind: 'object', slotKinds: ['use'], behavior: 'editOutfits', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 1 },
    autonomy: { enabled: false, ads: {}, tags: ['outfit'] },
  }),
];

const SELF: InteractionDef[] = [
  def({
    id: 'goToWork', name: 'Go to Work', description: 'Walk to the lot entry and leave for the current shift.',
    icon: 'briefcase', kind: 'self', behavior: 'goToWork', posture: 'walking',
    anims: { perform: 'walk' },
    duration: { kind: 'fixed', minutes: 0 },
    autonomy: { enabled: false, ads: {}, tags: ['work'] },
  }),
  def({
    id: 'goHere', name: 'Go Here', description: 'Walk to this spot.',
    icon: 'move', kind: 'tile', behavior: 'goHere', posture: 'walking',
    anims: { perform: 'walk' },
    duration: { kind: 'fixed', minutes: 0 },
    autonomy: { enabled: false, ads: {}, tags: [] }, allowVisitors: true,
  }),
  def({
    id: 'leaveLot', name: 'Leave', description: 'Walk to the lot entry and leave the lot (visitors going home, people leaving for work).',
    icon: 'move', kind: 'self', behavior: 'leaveLot', posture: 'walking',
    anims: { perform: 'walk' },
    duration: { kind: 'fixed', minutes: 0 },
    autonomy: { enabled: false, ads: {}, tags: [] }, allowVisitors: true,
  }),
  def({
    id: 'danceSolo', name: 'Dance', description: 'Dance like nobody is watching. Fun, and a little Fitness.',
    icon: 'fun', kind: 'self', behavior: 'generic', posture: 'standing',
    anims: { perform: 'dance' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 20, energy: -6 }, skill: { id: 'fitness', xpPerHour: 20 },
    moodletOnComplete: 'energized',
    autonomy: { enabled: true, ads: { fun: 18 }, tags: ['active', 'dance', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'jogInPlace', name: 'Jog in Place', description: 'A quick cardio session that trains Fitness but costs energy and hygiene.',
    icon: 'energy', kind: 'self', behavior: 'generic', posture: 'standing',
    anims: { perform: 'jog' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { energy: -10, hygiene: -8, fun: 4 }, skill: { id: 'fitness', xpPerHour: 60 },
    moodletOnComplete: 'energized',
    autonomy: { enabled: true, ads: { fun: 4 }, tags: ['active', 'fitness', 'skill'] },
  }),
  def({
    id: 'phoneInvite', name: 'Invite Over', description: 'Phone a neighbour (action data.personId) and invite them over; they arrive in about an hour.',
    icon: 'phone', kind: 'self', behavior: 'invite', posture: 'standing',
    anims: { perform: 'phone' },
    duration: { kind: 'fixed', minutes: 5 }, needsOnComplete: { social: 5 },
    autonomy: { enabled: false, ads: { social: 15 }, tags: ['social', 'phone'] },
  }),
  def({
    id: 'phoneChat', name: 'Chat on the Phone', description: 'Call someone (action data.personId) for a 20-minute chat. Social, and a small friendship gain.',
    icon: 'phone', kind: 'self', behavior: 'phoneChat', posture: 'standing',
    anims: { perform: 'phone' },
    duration: { kind: 'fixed', minutes: 20 }, needsPerHour: { social: 30, fun: 4 }, moodletOnComplete: 'caughtUp',
    autonomy: { enabled: true, ads: { social: 10 }, tags: ['social', 'phone'] },
  }),
];

/** Every object, item, tile and self interaction. Social interactions live in socials.ts. */
export const INTERACTIONS: InteractionDef[] = [...REST, ...FOOD, ...BATHROOM, ...LEISURE, ...WARDROBE, ...SELF];
