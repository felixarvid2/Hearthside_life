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
// Housework: chores cost a little energy per hour; Handiness shortens them.
// Object stats scale the matching effect: energy (sleep/rest), comfort (sit), fun (fun gains), hygiene, skill.
// Autonomy `ads` advertise the need gains used by utility scoring; `tags` feed trait/preference biasing
// (preference ids 'activity:<tag>' match these tags).

import type { InteractionDef } from './types';
import { dollars } from '../core/money';
import { POOL_INTERACTIONS } from './poolInteractions';
import { FURNISHING_INTERACTIONS } from './interactionsFurnishings';

type Def = Omit<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'> &
  Partial<Pick<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'>>;

const def = (d: Def): InteractionDef => ({
  needsPerHour: {}, needsOnComplete: {}, slotKinds: [], allowVisitors: false, status: 'ready', ...d,
});

/** Overnight offsets shared by sleep and nap (see the header). */
const LYING_OFFSETS = { hunger: 3.5, bladder: 6 };

const REST: InteractionDef[] = [
  def({
    id: 'sleep', ages: ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'], name: 'Sleep', description: 'Go to bed and sleep until fully rested (at most 10 hours). Changes into sleepwear while in bed.',
    icon: 'bed', kind: 'object', slotKinds: ['sleep'], behavior: 'sleep', posture: 'lying',
    anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
    duration: { kind: 'untilFull', need: 'energy', maxMinutes: 600 },
    needsPerHour: { energy: 12, ...LYING_OFFSETS }, moodletOnComplete: 'wellRested',
    autonomy: { enabled: true, ads: { energy: 80 }, tags: ['rest', 'sleep'] },
  }),
  def({
    id: 'nap', ages: ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'], name: 'Nap', description: 'Lie down for a 90-minute nap. Beds restore more energy than sofas.',
    icon: 'moon', kind: 'object', slotKinds: ['sleep', 'sit'], behavior: 'rest', posture: 'lying',
    anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
    duration: { kind: 'fixed', minutes: 90 },
    needsPerHour: { energy: 14, ...LYING_OFFSETS },
    autonomy: { enabled: true, ads: { energy: 20 }, tags: ['rest', 'nap'] },
  }),
  def({
    id: 'sit', ages: ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'], name: 'Sit', description: 'Sit down for a while. Comfortable seats lift the mood.',
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
    id: 'eatMeal', ages: ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'], name: 'Eat', description: 'Take a portion and eat it at a table when a chair is free, otherwise standing.',
    icon: 'hunger', kind: 'item', behavior: 'eatMeal', posture: 'seated',
    anims: { prepare: 'pickUp', perform: 'eat' },
    // Hunger comes from the portion (RecipeDef.hunger scaled by meal quality; fish use their species' hunger),
    // applied by the eatMeal behaviour.
    duration: { kind: 'fixed', minutes: 25 }, moodletOnComplete: 'goodMeal', itemKinds: ['meal', 'fish'],
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
    id: 'watchTv', ages: ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'], name: 'Watch TV', description: 'Watch from a free seat within 5 m that faces the screen, or standing in front of it.',
    icon: 'fun', kind: 'object', slotKinds: ['use'], behavior: 'watchTv', posture: 'seated',
    anims: { perform: 'watchTv' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 24 }, moodletOnComplete: 'entertained',
    autonomy: { enabled: true, ads: { fun: 24 }, tags: ['tv', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'playComputerGames', venues: ['home'], name: 'Play Computer Games', description: 'Play games at the computer, seated at a chair in front of the desk when there is one.',
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
    id: 'readSkillBook', name: 'Study a Skill Book',
    description: 'Study a how-to book (action data.skillId: cooking, handiness, gardening, charisma or programming). Teaches the skill up to level 5.',
    icon: 'book', kind: 'object', slotKinds: ['use'], behavior: 'read', posture: 'seated',
    anims: { prepare: 'pickUp', perform: 'read' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 6 }, skill: { id: 'logic', xpPerHour: 45 },
    autonomy: { enabled: true, ads: { fun: 6 }, tags: ['reading', 'skill', 'book'] },
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

/**
 * Hobbies, kids' play and quick kitchen bites, offered by the furniture of the hobby, kids, outdoor and small-appliance
 * designs. They follow the same numbers as the activities above: practice gives 40-60 skill xp/h, fun about
 * +12..+22 fun/h. Instrument and board-game interactions use the 'computer' behaviour (sit at a chair facing the object
 * within 1.6 m, else stand at it); workouts and painting use the generic behaviour at a 'use' slot or a free side.
 */
const HOBBY: InteractionDef[] = [
  def({
    id: 'paintCanvas', name: 'Paint', description: 'Paint at the easel: creative fun that trains Painting.',
    icon: 'roller', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 16, energy: -3 }, skill: { id: 'painting', xpPerHour: 50 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    moodletOnComplete: 'inspired',
    autonomy: { enabled: true, ads: { fun: 16 }, tags: ['painting', 'creative', 'skill', 'fun'] },
  }),
  def({
    id: 'playPiano', name: 'Play Piano', description: 'Sit at the piano (or stand at it) and play for 45 minutes. Fun, and trains Music.',
    icon: 'sound', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 18, energy: -2 }, skill: { id: 'music', xpPerHour: 55 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    moodletOnComplete: 'goodTunes',
    autonomy: { enabled: true, ads: { fun: 14 }, tags: ['music', 'instrument', 'creative', 'skill', 'fun'] },
  }),
  // Freelance work: paid once by the simulation when the piece is finished (occurrence `freelance:<person>:<action>`).
  def({
    id: 'writeArticle', name: 'Write an Article', description: 'Write and sell a freelance article at the computer. Paid on completion; better Writing earns more.',
    icon: 'book', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 4, energy: -3 }, skill: { id: 'writing', xpPerHour: 65 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'writing', 'creative', 'skill'] },
  }),
  def({
    id: 'writeBook', name: 'Write a Book', description: 'Write a full book at the computer. It takes three hours but pays far more than an article.',
    icon: 'book', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 180 }, needsPerHour: { fun: 2, energy: -4 }, skill: { id: 'writing', xpPerHour: 45 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'writing', 'creative', 'skill'] },
  }),
  def({
    id: 'programGig', name: 'Take a Programming Gig', description: 'Finish a small freelance programming job at the computer. Paid on completion.',
    icon: 'chart', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 90 }, needsPerHour: { fun: 3, energy: -4 }, skill: { id: 'programming', xpPerHour: 65 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'programming', 'skill'] },
  }),
  def({
    id: 'paintToSell', name: 'Paint to Sell', description: 'Paint a canvas at the easel and sell it when it is finished. Better Painting earns more.',
    icon: 'roller', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'standing',
    anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 75 }, needsPerHour: { fun: 14, energy: -3 }, skill: { id: 'painting', xpPerHour: 60 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    moodletOnComplete: 'inspired',
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'painting', 'creative', 'skill'] },
  }),
  def({
    id: 'busk', name: 'Busk for Tips', description: 'Play at the piano for passers-by and collect tips. Better Music earns more.',
    icon: 'sound', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 14, energy: -2 }, skill: { id: 'music', xpPerHour: 60 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'music', 'creative', 'skill'] },
  }),
  def({
    id: 'jobSearch', name: 'Job Search', description: 'Browse job listings at the computer (part-time jobs for teens, careers for grown-ups) and open the career panel to apply, quit or change effort.',
    icon: 'briefcase', kind: 'object', slotKinds: ['use'], behavior: 'openCareers', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 10 },
    autonomy: { enabled: false, ads: {}, tags: ['career', 'computer'] },
  }),
  def({
    id: 'workOut', name: 'Work Out', description: 'Run on the treadmill: trains Fitness but costs energy and hygiene.',
    icon: 'energy', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'exercise' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { energy: -10, hygiene: -8, fun: 6 }, skill: { id: 'fitness', xpPerHour: 60 },
    moodletOnComplete: 'energized',
    autonomy: { enabled: true, ads: { fun: 6 }, tags: ['active', 'fitness', 'skill'] },
  }),
  def({
    id: 'liftWeights', name: 'Lift Weights', description: 'Press the barbell: a harder workout than a jog that trains Fitness.',
    icon: 'energy', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'clean' }, // the push loop reads as pressing the bar
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { energy: -12, hygiene: -7, fun: 4 }, skill: { id: 'fitness', xpPerHour: 70 },
    moodletOnComplete: 'energized',
    autonomy: { enabled: true, ads: { fun: 4 }, tags: ['active', 'fitness', 'skill'] },
  }),
  def({
    id: 'playChess', name: 'Play Chess', description: 'Think a few moves ahead over the board, seated at a chair facing it when there is one. Trains Logic.',
    icon: 'book', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 12, energy: -1 }, skill: { id: 'logic', xpPerHour: 50 },
    moodletOnComplete: 'sharpMind',
    autonomy: { enabled: true, ads: { fun: 12 }, tags: ['chess', 'game', 'skill', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'playWithToys', ages: ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'], name: 'Play with Toys', description: 'Dig through the toys and build, stack and make-believe for half an hour.',
    icon: 'fun', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 22, energy: -2 },
    moodletOnComplete: 'playtime',
    autonomy: { enabled: true, ads: { fun: 20 }, tags: ['toys', 'play', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'grillFood', name: 'Grill Some Food', description: 'Fire up the barbecue and grill a plateful outdoors (+40 hunger for $6). Practises Cooking.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 25 }, needsPerHour: { fun: 6 }, needsOnComplete: { hunger: 40 }, cost: dollars(6),
    skill: { id: 'cooking', xpPerHour: 40 }, moodletOnComplete: 'goodMeal', weather: { not: ['rain', 'snow'] },
    autonomy: { enabled: true, ads: { hunger: 40 }, tags: ['food', 'cooking', 'grill', 'outdoor'] }, allowVisitors: true,
  }),
  def({
    id: 'makeCoffee', name: 'Make Coffee', description: 'Brew a cup of coffee for $2: +12 energy and a little cheer.',
    icon: 'energy', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 4 }, needsOnComplete: { energy: 12, fun: 2 }, cost: dollars(2),
    moodletOnComplete: 'caffeinated',
    autonomy: { enabled: true, ads: { energy: 12 }, tags: ['food', 'coffee', 'drink'] }, allowVisitors: true,
  }),
  def({
    id: 'makeToast', name: 'Make Toast', description: 'Pop a slice in the toaster for $1: +15 hunger.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 4 }, needsOnComplete: { hunger: 15 }, cost: dollars(1),
    autonomy: { enabled: true, ads: { hunger: 15 }, tags: ['food', 'snack', 'toast'] }, allowVisitors: true,
  }),
  def({
    id: 'blendSmoothie', name: 'Blend a Smoothie', description: 'Whizz up a fruit smoothie for $3: +20 hunger and +6 energy.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 5 }, needsOnComplete: { hunger: 20, energy: 6 }, cost: dollars(3),
    autonomy: { enabled: true, ads: { hunger: 20 }, tags: ['food', 'snack', 'drink'] }, allowVisitors: true,
  }),
];

/**
 * Housework (cleaning and repairs). The object interactions are offered by tag (content/capabilities.ts), not listed
 * on objects: 'cleanable' objects offer cleanObject; 'plumbing', 'appliance' and 'electronics' objects offer
 * repairObject, serviceObject and callRepairperson. Durations, success chances and costs depend on skills and the
 * object and are computed by the simulation (sim/housework.ts); the minutes below are only defaults. Item
 * interactions apply to dirty dishes and floor messes (`itemKinds`).
 */
const HOUSEWORK: InteractionDef[] = [
  def({
    id: 'cleanObject', name: 'Clean', description: 'Scrub away the grime. Dirty things make meals worse, wash less well and drag the mood down. Faster with Handiness.',
    icon: 'sparkle', kind: 'object', behavior: 'clean', posture: 'standing',
    anims: { perform: 'clean' }, duration: { kind: 'fixed', minutes: 15 }, needsPerHour: { energy: -2 },
    skill: { id: 'handiness', xpPerHour: 20 }, moodletOnComplete: 'sparkling',
    autonomy: { enabled: true, ads: {}, tags: ['cleaning', 'chore'] },
  }),
  def({
    id: 'washDishes', name: 'Wash Dishes', description: 'Carry the dirty plates to a sink (or dishwasher) and wash them.',
    icon: 'sparkle', kind: 'item', itemKinds: ['dishes'], behavior: 'washDishes', posture: 'standing',
    anims: { prepare: 'pickUp', perform: 'clean' }, duration: { kind: 'fixed', minutes: 6 }, needsPerHour: { energy: -1 },
    skill: { id: 'handiness', xpPerHour: 10 },
    autonomy: { enabled: true, ads: {}, tags: ['cleaning', 'chore', 'dishes'] },
  }),
  def({
    id: 'mopFloor', name: 'Mop Up', description: 'Wipe up a puddle, spill or crumbs from the floor.',
    icon: 'sparkle', kind: 'item', itemKinds: ['mess'], behavior: 'mop', posture: 'standing',
    anims: { perform: 'clean' }, duration: { kind: 'fixed', minutes: 6 }, needsPerHour: { energy: -1 },
    skill: { id: 'handiness', xpPerHour: 15 },
    autonomy: { enabled: true, ads: {}, tags: ['cleaning', 'chore', 'mop'] },
  }),
  def({
    id: 'tidyUp', name: 'Tidy Up', description: 'A quick tidy of the area around you: wipes the worst grime off nearby things and sweeps up crumbs.',
    icon: 'sparkle', kind: 'self', behavior: 'tidy', posture: 'standing',
    anims: { perform: 'clean' }, duration: { kind: 'fixed', minutes: 12 }, needsPerHour: { energy: -2 },
    skill: { id: 'handiness', xpPerHour: 10 },
    autonomy: { enabled: true, ads: {}, tags: ['cleaning', 'chore', 'tidy'] },
  }),
  def({
    id: 'repairObject', name: 'Repair', description: 'Fix a broken object. Handiness makes it quicker and more likely to work; a failed attempt wastes time and can give a shock.',
    icon: 'settings', kind: 'object', behavior: 'repair', posture: 'standing',
    anims: { perform: 'kneelFix' }, duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { energy: -3 },
    skill: { id: 'handiness', xpPerHour: 60 },
    autonomy: { enabled: true, ads: {}, tags: ['repair', 'chore', 'skill'] },
  }),
  def({
    id: 'serviceObject', name: 'Service', description: 'Maintain a worn object so it breaks down less often. Practises Handiness.',
    icon: 'settings', kind: 'object', behavior: 'service', posture: 'standing',
    anims: { perform: 'kneelFix' }, duration: { kind: 'fixed', minutes: 20 }, needsPerHour: { energy: -3 },
    skill: { id: 'handiness', xpPerHour: 50 },
    autonomy: { enabled: true, ads: {}, tags: ['repair', 'chore', 'skill'] },
  }),
  def({
    id: 'callRepairperson', name: 'Call a Repairperson', description: 'Phone a repairperson for a fixed fee. They fix the broken object within a few hours.',
    icon: 'phone', kind: 'object', behavior: 'callRepair', posture: 'standing',
    anims: { perform: 'phone' }, duration: { kind: 'fixed', minutes: 4 },
    autonomy: { enabled: true, ads: {}, tags: ['repair', 'phone'] },
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
    id: 'danceSolo', venues: ['home', 'park', 'cafe', 'gym', 'arts', 'market'], name: 'Dance', description: 'Dance like nobody is watching. Fun, and a little Fitness.',
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
  def({
    id: 'planEvent', name: 'Plan an Event', description: 'Open the phone planner: choose a date, dinner party, house party or celebration, the guests and the time.',
    icon: 'phone', kind: 'self', behavior: 'planEvent', posture: 'standing',
    anims: { perform: 'phone' },
    duration: { kind: 'fixed', minutes: 1 },
    autonomy: { enabled: false, ads: {}, tags: ['social', 'phone'] },
  }),
  def({
    id: 'phoneDate', name: 'Ask on a Date', description: 'Phone someone you like (action data.personId) and invite them to a date at home this evening.',
    icon: 'heart', kind: 'self', behavior: 'phoneDate', posture: 'standing',
    anims: { perform: 'phone' },
    duration: { kind: 'fixed', minutes: 4 }, needsOnComplete: { social: 4 },
    autonomy: { enabled: false, ads: {}, tags: ['social', 'phone'] },
  }),
  def({
    id: 'phoneBills', name: 'Bills and Payments', description: 'Open the household bills on the phone: see what is due, pay a bill or turn automatic payment on or off.',
    icon: 'money', kind: 'self', behavior: 'openBills', posture: 'standing',
    anims: { perform: 'phone' },
    duration: { kind: 'fixed', minutes: 2 },
    autonomy: { enabled: false, ads: {}, tags: ['money', 'phone'] },
  }),
  def({
    id: 'checkMailbox', name: 'Check the Mailbox', description: 'Collect the post and open the household bills: see what is due and pay it.',
    icon: 'money', kind: 'self', behavior: 'openBills', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 3 },
    autonomy: { enabled: false, ads: {}, tags: ['money', 'home'] },
  }),
  def({
    id: 'phoneJobs', name: 'Find a Job or Quit', description: 'Open the career panel on the phone: apply for a job (teens see part-time work), quit the current one or change how hard to work.',
    icon: 'briefcase', kind: 'self', behavior: 'openCareers', posture: 'standing',
    anims: { perform: 'phone' },
    duration: { kind: 'fixed', minutes: 3 },
    autonomy: { enabled: false, ads: {}, tags: ['career', 'phone'] },
  }),
];

/**
 * Venue activities (Milestone 7). Everything bought here is paid once through the interaction `cost`: a transaction with the
 * occurrence `cost:<actionId>`, charged when the action starts, so a cancelled order costs nothing and a finished one can never
 * charge twice. On a public venue everyone is a patron who may use what the venue offers (sim/context.ts isVisitor), so the
 * counters, stands, gym equipment, easels and desks need no visitor flag; the self activity `goForJog` lists its venue type.
 * Prices are about twice the home equivalents (a $2 coffee at home is $4 at the cafe) and buy a little more.
 */
const VENUE: InteractionDef[] = [
  // Cafe counter
  def({
    id: 'buyCoffee', name: 'Buy a Coffee', description: 'Order a fresh coffee at the counter for $4: +18 energy and a little cheer.',
    icon: 'energy', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 5 }, needsOnComplete: { energy: 18, fun: 2 }, cost: dollars(4),
    moodletOnComplete: 'caffeinated',
    autonomy: { enabled: true, ads: { energy: 18 }, tags: ['food', 'coffee', 'drink', 'cafe'] }, allowVisitors: true,
  }),
  def({
    id: 'buyPastry', name: 'Buy a Pastry', description: 'A flaky pastry from the display case for $5: +28 hunger and a sweet moment.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 6 }, needsOnComplete: { hunger: 28, fun: 4 }, cost: dollars(5),
    moodletOnComplete: 'sweetTreat',
    autonomy: { enabled: true, ads: { hunger: 28 }, tags: ['food', 'snack', 'cafe'] }, allowVisitors: true,
  }),
  def({
    id: 'buySandwich', name: 'Buy a Sandwich', description: 'A proper lunch from the counter for $9: +50 hunger and a little energy.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 8 }, needsOnComplete: { hunger: 50, energy: 4 }, cost: dollars(9),
    moodletOnComplete: 'goodMeal',
    autonomy: { enabled: true, ads: { hunger: 50 }, tags: ['food', 'meal', 'cafe'] }, allowVisitors: true,
  }),
  // Vending machine (gym, library, arts centre, market)
  def({
    id: 'buyVendingSnack', name: 'Buy a Snack', description: 'Pick a bag of crisps or a cereal bar from the machine for $2.50: +16 hunger.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 3 }, needsOnComplete: { hunger: 16, fun: 1 }, cost: 250,
    autonomy: { enabled: true, ads: { hunger: 16 }, tags: ['food', 'snack', 'vending'] }, allowVisitors: true,
  }),
  def({
    id: 'buyVendingDrink', name: 'Buy a Drink', description: 'A cold drink from the machine for $2: +8 energy and +2 fun.',
    icon: 'energy', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 3 }, needsOnComplete: { energy: 8, fun: 2 }, cost: dollars(2),
    autonomy: { enabled: true, ads: { energy: 8 }, tags: ['food', 'drink', 'vending'] }, allowVisitors: true,
  }),
  // Market stall
  def({
    id: 'buyProduce', name: 'Buy Fresh Fruit', description: 'A bag of fruit from the stall for $3: +20 hunger and +3 energy.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 6 }, needsOnComplete: { hunger: 20, energy: 3 }, cost: dollars(3),
    moodletOnComplete: 'freshFruit',
    autonomy: { enabled: true, ads: { hunger: 20 }, tags: ['food', 'snack', 'market', 'fresh'] }, allowVisitors: true,
  }),
  def({
    id: 'buyGroceries', name: 'Buy Groceries', description: 'Stock up the pantry for $24. For three days every meal you cook costs 40% less in groceries.',
    icon: 'money', kind: 'object', slotKinds: ['use'], behavior: 'snack', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 15 }, cost: dollars(24),
    moodletOnComplete: 'stockedPantry',
    autonomy: { enabled: false, ads: {}, tags: ['food', 'groceries', 'market'] }, allowVisitors: true,
  }),
  // Park and playground
  def({
    id: 'goForJog', venues: ['park'], name: 'Go for a Jog', description: 'Jog laps of the park paths: trains Fitness but costs energy and hygiene, and it clears the head.',
    icon: 'energy', kind: 'self', behavior: 'generic', posture: 'standing',
    anims: { perform: 'jog' },
    duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { energy: -9, hygiene: -6, fun: 9 }, skill: { id: 'fitness', xpPerHour: 55 },
    moodletOnComplete: 'energized', weather: { not: ['rain', 'snow'] },
    autonomy: { enabled: true, ads: { fun: 9 }, tags: ['active', 'fitness', 'skill', 'outdoor', 'jog'] }, allowVisitors: true,
  }),
  def({
    id: 'havePicnic', venues: ['park', 'home'], name: 'Have a Picnic', description: 'Unpack a picnic basket at the table for $8: +36 hunger and plenty of fresh air.',
    icon: 'hunger', kind: 'object', behavior: 'snack', posture: 'standing',
    anims: { perform: 'eat' },
    duration: { kind: 'fixed', minutes: 35 }, needsOnComplete: { hunger: 36, fun: 8 }, cost: dollars(8),
    moodletOnComplete: 'picnicJoy', weather: { not: ['rain', 'snow'], seasons: ['spring', 'summer'] },
    autonomy: { enabled: true, ads: { hunger: 36, fun: 8 }, tags: ['food', 'picnic', 'outdoor', 'social'] }, allowVisitors: true,
  }),
  def({
    id: 'watchClouds', name: 'Watch the Clouds', description: 'Lean back and watch the clouds go by for 40 minutes. Free, restful and good for the mood.',
    icon: 'sparkle', kind: 'object', slotKinds: ['sit'], behavior: 'generic', posture: 'seated',
    anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { fun: 10, energy: 5 },
    moodletOnComplete: 'peaceful', weather: { not: ['rain', 'snow'] },
    autonomy: { enabled: true, ads: { fun: 8, energy: 4 }, tags: ['relax', 'outdoor', 'clouds'] }, allowVisitors: true,
  }),
  def({
    id: 'playOnSlide', name: 'Play on the Slide', description: 'Climb the ladder and whoosh down the slide, again and again. Great fun.',
    icon: 'fun', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'dance' },
    duration: { kind: 'fixed', minutes: 25 }, needsPerHour: { fun: 26, energy: -6 },
    moodletOnComplete: 'playtime', weather: { not: ['rain', 'snow'] },
    autonomy: { enabled: true, ads: { fun: 20 }, tags: ['play', 'outdoor', 'fun', 'playground'] }, allowVisitors: true,
  }),
  def({
    id: 'swing', name: 'Swing', description: 'Sit on a swing and pump your legs. A little Fitness, a lot of fun.',
    icon: 'fun', kind: 'object', slotKinds: ['sit'], behavior: 'generic', posture: 'seated',
    anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'fixed', minutes: 25 }, needsPerHour: { fun: 22, energy: -4 }, skill: { id: 'fitness', xpPerHour: 12 },
    moodletOnComplete: 'playtime', weather: { not: ['rain', 'snow'] },
    autonomy: { enabled: true, ads: { fun: 18 }, tags: ['play', 'outdoor', 'fun', 'playground'] }, allowVisitors: true,
  }),
  // Library study desk
  def({
    id: 'studyHard', name: 'Study', description: 'Work through logic puzzles and problem sets in the quiet of the reading room. Trains Logic.',
    icon: 'book', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'read' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 4, energy: -3 }, skill: { id: 'logic', xpPerHour: 60 },
    moodletOnComplete: 'studious',
    autonomy: { enabled: true, ads: { fun: 4 }, tags: ['study', 'reading', 'skill', 'logic'] },
  }),
  def({
    id: 'writeJournal', name: 'Write in a Journal', description: 'Put thoughts, stories and drafts on paper at a quiet desk. Trains Writing.',
    icon: 'book', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 50 }, needsPerHour: { fun: 8, energy: -3 }, skill: { id: 'writing', xpPerHour: 55 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    moodletOnComplete: 'clearHead',
    autonomy: { enabled: true, ads: { fun: 8 }, tags: ['study', 'writing', 'creative', 'skill'] },
  }),
];

/**
 * Milestone 11, task C: Photography, Fishing and Research practice. Photo walks and park fishing are self activities
 * restricted to outdoor venues (InteractionDef.venues); the simulation gates venue fishing at Fishing 2, photo walks
 * at Photography 3 and research papers at Research 5 (sim/behaviors.ts). Sale and paper payouts use the freelance
 * behaviour with a once-only occurrence id.
 */
const M11_SKILLS: InteractionDef[] = [
  def({
    id: 'takePhotos', name: 'Take Photos', description: 'Set up the camera and shoot for an hour: fun, and the practice builds Photography. Every level improves the pictures.',
    icon: 'eyedropper', kind: 'object', slotKinds: ['use'], behavior: 'photo', posture: 'standing',
    anims: { prepare: 'interact', perform: 'interact' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 8, energy: -2 }, skill: { id: 'photography', xpPerHour: 55 },
    moodletOnComplete: 'inspired',
    autonomy: { enabled: true, ads: { fun: 8 }, tags: ['camera', 'photography', 'creative', 'skill', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'sellPhotos', name: 'Sell Photo Prints', description: 'Finish and sell a set of prints. Paid on completion; better Photography earns more.',
    icon: 'eyedropper', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 75 }, needsPerHour: { fun: 6, energy: -3 }, skill: { id: 'photography', xpPerHour: 60 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'photography', 'creative', 'skill'] },
  }),
  def({
    id: 'photoWalk', venues: ['park', 'market', 'arts', 'cafe'], name: 'Take a Photo Walk',
    description: 'Walk about with the camera and shoot what catches your eye. Needs Photography level 3.',
    icon: 'eyedropper', kind: 'self', behavior: 'photo', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 50 }, needsPerHour: { fun: 12, energy: -3 }, skill: { id: 'photography', xpPerHour: 55 },
    moodletOnComplete: 'inspired', weather: { not: ['rain', 'snow'] },
    autonomy: { enabled: true, ads: { fun: 12 }, tags: ['camera', 'photography', 'creative', 'skill', 'outdoor'] }, allowVisitors: true,
  }),
  def({
    id: 'fishPond', name: 'Fish the Pond', description: 'Cast a line into the garden pond. Catches can be eaten or sold at the market.',
    icon: 'sun', kind: 'object', slotKinds: ['use'], behavior: 'fish', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 5, energy: -2 }, skill: { id: 'fishing', xpPerHour: 55 },
    weather: { not: ['snow'] }, // fishing in the rain is fine; a frozen pond is not
    autonomy: { enabled: true, ads: { fun: 5 }, tags: ['fishing', 'water', 'skill', 'outdoor'] }, allowVisitors: true,
  }),
  def({
    id: 'fishVenue', venues: ['park'], name: 'Go Fishing', description: 'Fish the lake at the park. Needs Fishing level 2. Catches can be eaten or sold.',
    icon: 'sun', kind: 'self', behavior: 'fish', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 6, energy: -3 }, skill: { id: 'fishing', xpPerHour: 60 },
    weather: { not: ['snow'] }, // fishing in the rain is fine; the lake does not freeze for skating
    autonomy: { enabled: true, ads: { fun: 6 }, tags: ['fishing', 'water', 'skill', 'outdoor'] }, allowVisitors: true,
  }),
  def({
    id: 'sellCatch', name: 'Sell Catch', description: 'Sell the fish you caught. A better angler gets a better price per fish.',
    icon: 'money', kind: 'item', itemKinds: ['fish'], behavior: 'sellCatch', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 10 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'fishing'] }, allowVisitors: true,
  }),
  def({
    id: 'researchOnline', name: 'Research Online', description: 'Read papers, follow sources and take notes at the computer. Trains Research.',
    icon: 'search', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 2, energy: -3 }, skill: { id: 'research', xpPerHour: 55 },
    autonomy: { enabled: true, ads: { fun: 2 }, tags: ['computer', 'research', 'science', 'skill', 'study'] }, allowVisitors: true,
  }),
  def({
    id: 'researchSky', name: 'Study the Night Sky', description: 'Track the sky through the telescope: relaxing, and it trains Research.',
    icon: 'search', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 8, energy: -2 }, skill: { id: 'research', xpPerHour: 60 },
    moodletOnComplete: 'inspired',
    autonomy: { enabled: true, ads: { fun: 8 }, tags: ['telescope', 'research', 'science', 'skill', 'fun'] }, allowVisitors: true,
  }),
  def({
    id: 'writePaper', name: 'Write a Research Paper', description: 'Write and submit a research paper at the computer. Needs Research level 5; paid on completion.',
    icon: 'search', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'seated',
    anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 120 }, needsPerHour: { fun: 1, energy: -4 }, skill: { id: 'research', xpPerHour: 45 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'research', 'science', 'skill'] },
  }),
];

/**
 * Milestone 11, task B: Baking, Wellness and Creativity practice. `bakeTreat` runs at a stove or bread oven and
 * serves baked goods as portion items; `sellBakes` is freelance work gated at Baking 5; `meditate` is a self
 * activity for residential lots; the mat offers yoga and stretching; the sketchbook trains Creativity directly.
 */
const M11_B_SKILLS: InteractionDef[] = [
  def({
    id: 'bakeTreat', name: 'Bake a Treat', description: 'Bake bread, muffins, scones, a cake or a pie in the oven. The batch feeds the household and practises Baking.',
    icon: 'hunger', kind: 'object', slotKinds: ['use'], behavior: 'bake', posture: 'standing',
    anims: { perform: 'cook' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 8, energy: -2 }, skill: { id: 'baking', xpPerHour: 55 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    moodletOnComplete: 'proudBake',
    autonomy: { enabled: true, ads: { fun: 8 }, tags: ['baking', 'cooking', 'creative', 'skill', 'food'] },
  }),
  def({
    id: 'sellBakes', name: 'Sell a Box of Bakes', description: 'Box up a batch of your baking and sell it to the neighbours. Needs Baking level 5; paid on completion.',
    icon: 'money', kind: 'object', slotKinds: ['use'], behavior: 'freelance', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 4, energy: -3 }, skill: { id: 'baking', xpPerHour: 45 },
    secondarySkill: { id: 'creativity', fraction: 0.35 },
    requiresSkill: { id: 'baking', level: 5 },
    autonomy: { enabled: false, ads: {}, tags: ['freelance', 'baking', 'creative', 'skill'] },
  }),
  def({
    id: 'meditate', name: 'Meditate', description: 'Sit quietly and breathe, anywhere at home or on a yoga mat. Leaves a Calm moodlet and trains Wellness.',
    icon: 'heart', kind: 'self', behavior: 'generic', posture: 'seated',
    anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 5, energy: 2 }, skill: { id: 'wellness', xpPerHour: 45 },
    moodletOnComplete: 'calm',
    venues: ['home'],
    autonomy: { enabled: false, ads: {}, tags: ['wellness', 'meditation', 'calm'] },
  }),
  def({
    id: 'doYoga', name: 'Do Yoga', description: 'Work through a yoga flow on the mat. Trains Wellness quickly and leaves you calm.',
    icon: 'heart', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'exercise' },
    duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { fun: 8, energy: -3, hygiene: -3 }, skill: { id: 'wellness', xpPerHour: 60 },
    moodletOnComplete: 'calm',
    autonomy: { enabled: true, ads: { fun: 8 }, tags: ['wellness', 'exercise', 'active', 'yoga'] }, allowVisitors: true,
  }),
  def({
    id: 'stretch', name: 'Stretch', description: 'A gentle stretch on the mat: quick, restful and good for Wellness.',
    icon: 'heart', kind: 'object', slotKinds: ['use'], behavior: 'generic', posture: 'standing',
    anims: { perform: 'exercise' },
    duration: { kind: 'fixed', minutes: 15 }, needsPerHour: { fun: 6, energy: 1 }, skill: { id: 'wellness', xpPerHour: 40 },
    autonomy: { enabled: true, ads: { fun: 4 }, tags: ['wellness', 'exercise', 'stretch'] }, allowVisitors: true,
  }),
  def({
    id: 'sketchIdeas', name: 'Sketch Ideas', description: 'Fill a page of the sketchbook with ideas and thumbnails. Trains Creativity.',
    icon: 'star', kind: 'object', slotKinds: ['use'], behavior: 'computer', posture: 'seated',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 12, energy: -2 }, skill: { id: 'creativity', xpPerHour: 55 },
    moodletOnComplete: 'inspired',
    autonomy: { enabled: true, ads: { fun: 12 }, tags: ['creative', 'sketch', 'skill', 'fun'] }, allowVisitors: true,
  }),
];

/**
 * Milestone 12, task O: weather- and season-bound outdoor life. Every entry is listed in the menu when its weather
 * rules out nothing, and greyed with the reason from sim/weather.ts otherwise; autonomy skips it just the same.
 */
const M12_OUTDOOR: InteractionDef[] = [
  def({
    id: 'buildSnowman', ages: ['child', 'teen', 'youngAdult', 'adult', 'elder'],
    name: 'Build a Snowman', description: 'Roll the fresh snow into three balls and stack them up. Leaves a snowman in the garden until the thaw.',
    icon: 'snow', kind: 'self', behavior: 'buildSnowman', posture: 'standing',
    anims: { perform: 'exercise', cleanup: 'interact' },
    duration: { kind: 'fixed', minutes: 40 }, needsPerHour: { fun: 14, energy: -5, hygiene: -2 },
    moodletOnComplete: 'snowmanBuilt', weather: { seasons: ['winter'], snowCover: true, outdoor: true },
    autonomy: { enabled: true, ads: { fun: 12 }, tags: ['outdoor', 'snow', 'play', 'fun', 'creative'] },
  }),
  def({
    id: 'makeSnowAngel', ages: ['child', 'teen', 'youngAdult', 'adult', 'elder'],
    name: 'Make a Snow Angel', description: 'Lie back in the untouched snow and sweep your arms and legs. Childish, and all the better for it.',
    icon: 'snow', kind: 'self', behavior: 'outdoor', posture: 'lying',
    anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
    duration: { kind: 'fixed', minutes: 25 }, needsPerHour: { fun: 18, energy: -3, hygiene: -2 },
    moodletOnComplete: 'snowAngel', weather: { seasons: ['winter'], snowCover: true, outdoor: true },
    autonomy: { enabled: true, ads: { fun: 14 }, tags: ['outdoor', 'snow', 'play', 'fun'] },
  }),
  def({
    id: 'flyKite', name: 'Fly a Kite', description: 'Unwind the line and let the kite ride the breeze over the lawn. Best on a clear or cloudy day.',
    icon: 'sparkle', kind: 'object', behavior: 'generic', posture: 'standing',
    anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 15, energy: -2 },
    moodletOnComplete: 'kiteHigh', weather: { seasons: ['spring', 'autumn'], only: ['clear', 'cloudy'], outdoor: true },
    autonomy: { enabled: true, ads: { fun: 14 }, tags: ['outdoor', 'play', 'fun', 'kite'] }, allowVisitors: true,
  }),
  def({
    id: 'rakeLeaves', name: 'Rake Leaves', description: 'Sweep the autumn leaves into tidy piles. A chore that trains Handiness, with a crisp reward.',
    icon: 'leaf', kind: 'self', behavior: 'outdoor', posture: 'standing',
    anims: { perform: 'exercise' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 2, energy: -7, hygiene: -3 },
    skill: { id: 'handiness', xpPerHour: 35 }, moodletOnComplete: 'crispAutumnAir',
    weather: { seasons: ['autumn'], not: ['rain', 'snow'], outdoor: true },
    autonomy: { enabled: true, ads: { fun: 2 }, tags: ['chore', 'outdoor', 'autumn', 'handiness', 'skill'] },
  }),
  def({
    id: 'jumpInPuddles', ages: ['child', 'teen'], name: 'Jump in Puddles',
    description: 'Find every puddle in the garden and jump in it. Fabulous fun; the laundry can wait.',
    icon: 'fun', kind: 'self', behavior: 'outdoor', posture: 'standing',
    anims: { perform: 'exercise' },
    duration: { kind: 'fixed', minutes: 15 }, needsPerHour: { fun: 40, hygiene: -22, energy: -3 },
    moodletOnComplete: 'puddleSplash', weather: { rainedRecently: true, outdoor: true },
    autonomy: { enabled: true, ads: { fun: 18 }, tags: ['outdoor', 'play', 'fun', 'rain', 'puddle'] },
  }),
  def({
    id: 'stargaze', ages: ['child', 'teen', 'youngAdult', 'adult', 'elder'],
    name: 'Stargaze', description: 'Lie back on the grass and pick out constellations. Clear nights train Logic and feed the imagination.',
    icon: 'moon', kind: 'self', behavior: 'outdoor', posture: 'lying',
    anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
    duration: { kind: 'fixed', minutes: 60 }, needsPerHour: { fun: 7, energy: 2 },
    skill: { id: 'logic', xpPerHour: 30 }, secondarySkill: { id: 'creativity', fraction: 0.4 },
    moodletOnComplete: 'starryEyed', weather: { only: ['clear'], night: true, outdoor: true },
    autonomy: { enabled: true, ads: { fun: 6 }, tags: ['outdoor', 'night', 'stars', 'skill', 'relax'] },
  }),
  def({
    id: 'watchRain', name: 'Watch the Rain', description: 'Settle by a window or under the porch roof and listen to the rain. Quiet, restful and rather lovely.',
    icon: 'rain', kind: 'self', behavior: 'generic', posture: 'seated',
    anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 8, energy: 4 },
    moodletOnComplete: 'cosyRain', weather: { only: ['rain'], sheltered: true },
    autonomy: { enabled: true, ads: { fun: 7 }, tags: ['rain', 'relax', 'cosy', 'indoor'] },
  }),
  def({
    id: 'sunbathe', name: 'Sunbathe', description: 'Stretch out on the lounger and soak up the summer sun. Warms you right through.',
    icon: 'sun', kind: 'object', behavior: 'generic', posture: 'lying',
    anims: { prepare: 'lieDown', perform: 'sleep', cleanup: 'getUp' },
    duration: { kind: 'fixed', minutes: 90 }, needsPerHour: { fun: 11, energy: 6, hygiene: -1 },
    moodletOnComplete: 'sunKissed', weather: { seasons: ['summer'], only: ['clear'], outdoor: true },
    autonomy: { enabled: true, ads: { fun: 10, energy: 5 }, tags: ['outdoor', 'summer', 'sun', 'relax'] }, allowVisitors: true,
  }),
];

/** Every object, item, tile and self interaction. Social interactions live in socials.ts. */
export const INTERACTIONS: InteractionDef[] = [...REST, ...FOOD, ...BATHROOM, ...LEISURE, ...HOBBY, ...HOUSEWORK, ...WARDROBE, ...SELF, ...VENUE, ...M11_SKILLS, ...M11_B_SKILLS, ...POOL_INTERACTIONS, ...M12_OUTDOOR, ...FURNISHING_INTERACTIONS];
