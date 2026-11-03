// Milestone 8: interactions and socials of the family life stages.
//
// - care*: a teen or adult looks after a baby or toddler (sim/care.ts). They are offered in the menu of the little one, never
//   as self interactions, and need a person target.
// - ageUpNow: at a birthday cake, celebrate a birthday early (sim/aging.ts).
// - doHomework: at a desk, table or computer (a tag capability: content/capabilities.ts); the child's school work of the day.
// - usePotty: the potty chair, for toddlers learning to go by themselves.
// - socials for little ones and families: playing, teaching, helping with homework and asking somebody to move in.

import type { InteractionDef, SocialDef, SocialOutcome } from './types';
import type { LifeStage } from '../core/types';
import { dollars } from '../core/money';

type Def = Omit<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'> &
  Partial<Pick<InteractionDef, 'needsPerHour' | 'needsOnComplete' | 'status' | 'allowVisitors' | 'slotKinds'>>;
const def = (d: Def): InteractionDef => ({ needsPerHour: {}, needsOnComplete: {}, slotKinds: [], allowVisitors: false, status: 'ready', ...d });

const CARERS: LifeStage[] = ['teen', 'youngAdult', 'adult', 'elder'];

const care = (id: string, name: string, description: string, icon: string, minutes: number, anim: InteractionDef['anims']['perform'], tag: string): InteractionDef => def({
  id, name, description, icon, kind: 'self', behavior: 'care', posture: 'standing', anims: { perform: anim },
  duration: { kind: 'fixed', minutes }, ages: CARERS, autonomy: { enabled: false, ads: {}, tags: ['care', tag] },
});

export const FAMILY_INTERACTIONS: InteractionDef[] = [
  care('careFeed', 'Feed', 'Give a bottle or spoon-feed a meal. Restores hunger.', 'hunger', 12, 'interact', 'feed'),
  care('careChange', 'Change Diaper', 'Change the nappy and freshen up. Restores bladder and hygiene (a changing table helps).', 'hygiene', 6, 'interact', 'diaper'),
  care('careBed', 'Put to Bed', 'Tuck into the crib, bassinet or bed for a proper sleep. Restores energy.', 'bed', 10, 'interact', 'bed'),
  care('careCuddle', 'Cuddle', 'Pick up and cuddle. Restores the social need and cheers everybody up.', 'heart', 10, 'carry', 'cuddle'),
  care('carePlay', 'Play', 'Play peek-a-boo and shake the rattle. Restores fun.', 'fun', 15, 'interact', 'play'),
  care('careBirthday', 'Celebrate a Birthday (Age Up)', 'Light the candles on a birthday cake and age the little one up to the next life stage. Needs a birthday cake on a table or counter.', 'star', 20, 'interact', 'birthday'),
  def({
    id: 'ageUpNow', name: 'Age Up Now', description: 'Gather round the birthday cake and blow out the candles: grow into the next life stage today instead of waiting. A cheerful moodlet for the birthday child.',
    icon: 'star', kind: 'object', slotKinds: ['use'], behavior: 'ageUp', posture: 'standing', anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 20 }, needsPerHour: { fun: 12 }, moodletOnComplete: 'celebrating', ages: ['child', 'teen', 'youngAdult', 'adult'],
    autonomy: { enabled: false, ads: {}, tags: ['birthday', 'party'] },
  }),
  def({
    id: 'doHomework', name: 'Do Homework', description: 'Sit down at a desk, table or computer and finish the day\'s homework. Good homework raises school performance; it can be done once for each school day.',
    icon: 'book', kind: 'object', behavior: 'homework', posture: 'seated', anims: { perform: 'read' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: -6, energy: -2 }, skill: { id: 'logic', xpPerHour: 20 }, moodletOnComplete: 'homeworkDone',
    ages: ['child', 'teen'], autonomy: { enabled: false, ads: {}, tags: ['homework', 'school'] },
  }),
  def({
    id: 'usePotty', name: 'Use the Potty', description: 'Sit on the potty chair until done. Practising it trains Potty Training.',
    icon: 'bladder', kind: 'object', slotKinds: ['sit'], behavior: 'toilet', posture: 'seated', anims: { prepare: 'sitDown', perform: 'toilet', cleanup: 'standUp' },
    duration: { kind: 'untilFull', need: 'bladder', maxMinutes: 20 }, needsPerHour: { bladder: 500 }, needsOnComplete: { hygiene: -2 },
    skill: { id: 'potty', xpPerHour: 160 }, ages: ['toddler', 'child'],
    autonomy: { enabled: true, ads: { bladder: 100 }, tags: ['bathroom', 'potty'] }, allowVisitors: true,
  }),
  def({
    id: 'babble', name: 'Babble and Chatter', description: 'Chatter away to nobody in particular and repeat the words heard today. Trains Talking.',
    icon: 'social', kind: 'self', behavior: 'generic', posture: 'standing', anims: { perform: 'talk' },
    duration: { kind: 'fixed', minutes: 20 }, needsPerHour: { fun: 10, social: 8 }, skill: { id: 'talking', xpPerHour: 40 }, ages: ['toddler'],
    autonomy: { enabled: true, ads: { fun: 10, social: 8 }, tags: ['toddler', 'talk'] }, allowVisitors: true,
  }),
  def({
    id: 'toddleAround', name: 'Toddle Around', description: 'Practise walking, falling over and getting up again. Trains Motor Skills.',
    icon: 'person', kind: 'self', behavior: 'generic', posture: 'standing', anims: { perform: 'dance' },
    duration: { kind: 'fixed', minutes: 20 }, needsPerHour: { fun: 12, energy: -4 }, skill: { id: 'motor', xpPerHour: 40 }, ages: ['toddler'],
    autonomy: { enabled: true, ads: { fun: 12 }, tags: ['toddler', 'active'] }, allowVisitors: true,
  }),
  def({
    id: 'adoptOnline', name: 'Adopt a Child Online...', description: 'Browse the adoption agency at the computer: adopt a baby, toddler, child or teen (a fee applies). The household needs room for another member.',
    icon: 'heart', kind: 'object', slotKinds: ['use'], behavior: 'openAdopt', posture: 'seated', anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 2 }, ages: ['youngAdult', 'adult', 'elder'], autonomy: { enabled: false, ads: {}, tags: ['computer', 'family'] },
  }),
  def({
    id: 'phoneAdopt', name: 'Adopt a Child...', description: 'Phone the adoption agency to adopt a baby, toddler, child or teen (a fee applies). The household needs room for another member.',
    icon: 'heart', kind: 'self', behavior: 'openAdopt', posture: 'standing', anims: { perform: 'phone' },
    duration: { kind: 'fixed', minutes: 2 }, ages: ['youngAdult', 'adult', 'elder'], autonomy: { enabled: false, ads: {}, tags: ['phone', 'family'] },
  }),
];

// ---------------------------------------------------------------------------------------------
// Socials
// ---------------------------------------------------------------------------------------------

type SDef = Omit<SocialDef, 'targetTraits' | 'actorTraits' | 'alsoActivity' | 'status' | 'topics'> &
  Partial<Pick<SocialDef, 'targetTraits' | 'actorTraits' | 'alsoActivity' | 'status' | 'topics'>>;
const social = (d: SDef): SocialDef => ({ targetTraits: {}, actorTraits: {}, alsoActivity: false, status: 'ready', topics: [], ...d });
const out = (o: Partial<SocialOutcome> & { social: number }): SocialOutcome => ({ actor: {}, target: {}, ...o });

const GROWN: LifeStage[] = ['teen', 'youngAdult', 'adult', 'elder'];
const ADULTS: LifeStage[] = ['youngAdult', 'adult', 'elder'];
const LITTLE: LifeStage[] = ['toddler'];

export const FAMILY_SOCIALS: SocialDef[] = [
  social({
    id: 'playPeekaboo', name: 'Play Peek-a-boo', description: 'Hide behind your hands and pop out again. A toddler never tires of it.', icon: 'fun', category: 'funny',
    minutes: 4, anim: 'laugh', requires: { actorStages: ['child', ...GROWN], targetStages: LITTLE }, acceptance: 0.95,
    success: out({ actor: { friendship: 3, trust: 1 }, target: { friendship: 4, trust: 2 }, social: 10, fun: 10, targetMoodlet: 'playedWith', actorMoodlet: 'pleasantChat' }),
    failure: out({ social: 2 }),
    lines: {
      success: ['{a} hides behind both hands... "Peek-a-boo!" {b} shrieks with laughter.', '{b} giggles helplessly as {a} pops up again.'],
      failure: ['{b} is too sleepy to play with {a}.', '{b} wanders off after the toys.'],
    },
    topics: ['play'], autonomy: { enabled: true, weight: 0.6 },
  }),
  social({
    id: 'tickle', name: 'Tickle', description: 'A gentle tickle for a giggle.', icon: 'fun', category: 'funny',
    minutes: 3, anim: 'laugh', requires: { actorStages: ['child', ...GROWN], targetStages: ['toddler', 'child'] }, acceptance: 0.9,
    success: out({ actor: { friendship: 3 }, target: { friendship: 4, trust: 1 }, social: 8, fun: 8, targetMoodlet: 'playedWith' }),
    failure: out({ actor: { friendship: -1 }, target: { friendship: -2 }, social: 1 }),
    lines: {
      success: ['{a} tickles {b} until they squeal.', '"Tickle monster!" {b} wriggles away laughing at {a}.'],
      failure: ['{b} squirms away from {a}: not now.', '"Stop it!" {b} frowns at {a}.'],
    },
    topics: ['play'], autonomy: { enabled: true, weight: 0.5 },
  }),
  social({
    id: 'playTag', name: 'Play Tag', description: 'Chase around the garden or the living room. Children love it.', icon: 'fun', category: 'funny',
    minutes: 8, anim: 'laugh', requires: { actorStages: ['child', 'teen', ...ADULTS], targetStages: ['child'] }, acceptance: 0.9,
    success: out({ actor: { friendship: 4, trust: 1 }, target: { friendship: 5, trust: 1 }, social: 12, fun: 14, targetMoodlet: 'playedWith', actorMoodlet: 'pleasantChat' }),
    failure: out({ social: 2 }),
    lines: {
      success: ['"You are it!" {a} chases {b} round the room, both out of breath.', '{b} dodges {a} again and wins the game.'],
      failure: ['{b} does not feel like running around.', '"Later, {a}." {b} sits down instead.'],
    },
    topics: ['play'], autonomy: { enabled: true, weight: 0.6 },
  }),
  social({
    id: 'readStory', name: 'Read a Story', description: 'Read a picture book aloud. Helps little ones learn to talk.', icon: 'book', category: 'friendly',
    minutes: 10, anim: 'talk', requires: { actorStages: GROWN, targetStages: ['toddler', 'child'] }, acceptance: 0.9, effect: 'teach:talking',
    success: out({ actor: { friendship: 3, trust: 1 }, target: { friendship: 4, trust: 2 }, social: 10, fun: 6, targetMoodlet: 'playedWith' }),
    failure: out({ social: 2 }),
    lines: {
      success: ['{a} reads a story about a bear and a bunny while {b} listens wide-eyed.', '{b} snuggles up to {a} for another page.'],
      failure: ['{b} will not sit still for a story.', '{a} reads two pages before {b} runs off.'],
    },
    topics: ['books'], autonomy: { enabled: true, weight: 0.5 },
  }),
  social({
    id: 'teachTalking', name: 'Teach to Talk', description: 'Name things and repeat the words. Trains the toddler\'s Talking skill.', icon: 'social', category: 'support',
    minutes: 8, anim: 'talk', requires: { actorStages: GROWN, targetStages: LITTLE }, acceptance: 0.9, effect: 'teach:talking',
    success: out({ actor: { friendship: 2, trust: 2 }, target: { friendship: 3, trust: 3 }, social: 8, targetMoodlet: 'playedWith', actorMoodlet: 'proudParent' }),
    failure: out({ social: 2 }),
    lines: {
      success: ['"Say ball. Ba-all." {b} beams and tries the word at {a}.', '{a} points to the cat. "Cat!" {b} repeats, almost.'],
      failure: ['{b} is more interested in the spoon than in words.', '"No!" is all {b} has to say to {a} today.'],
    },
    topics: ['teaching'], autonomy: { enabled: true, weight: 0.5 },
  }),
  social({
    id: 'helpWalking', name: 'Help Walk', description: 'Hold both hands and shuffle across the floor. Trains the toddler\'s motor skills.', icon: 'person', category: 'support',
    minutes: 8, anim: 'interact', requires: { actorStages: GROWN, targetStages: LITTLE }, acceptance: 0.9, effect: 'teach:motor',
    success: out({ actor: { friendship: 2, trust: 2 }, target: { friendship: 3, trust: 3 }, social: 8, targetMoodlet: 'playedWith', actorMoodlet: 'proudParent' }),
    failure: out({ social: 2 }),
    lines: {
      success: ['{b} takes three wobbly steps toward {a} and sits down with a bump.', '{a} holds {b}\'s hands: step, step, step!'],
      failure: ['{b} would rather crawl than walk today.', '{b} sits on the floor and refuses to stand for {a}.'],
    },
    topics: ['teaching'], autonomy: { enabled: true, weight: 0.5 },
  }),
  social({
    id: 'pottyTraining', name: 'Potty Training', description: 'Cheer the toddler on at the potty. Trains Potty Training.', icon: 'bladder', category: 'support',
    minutes: 8, anim: 'interact', requires: { actorStages: GROWN, targetStages: LITTLE }, acceptance: 0.85, effect: 'teach:potty',
    success: out({ actor: { friendship: 2, trust: 2 }, target: { friendship: 2, trust: 3 }, social: 6, targetMoodlet: 'playedWith', actorMoodlet: 'proudParent' }),
    failure: out({ social: 1 }),
    lines: {
      success: ['"Good job, {b}!" {a} claps for the potty triumph.', '{b} proudly shows {a} the potty.'],
      failure: ['{b} is not ready and says so, loudly.', '{a} tries to get {b} to sit on the potty; no luck today.'],
    },
    topics: ['teaching'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'helpWithHomework', name: 'Help with Homework', description: 'Sit beside a child or teen and work through today\'s homework together. Counts as the homework done, and helps school performance.', icon: 'book', category: 'support',
    minutes: 20, anim: 'talk', requires: { actorStages: GROWN, targetStages: ['child', 'teen'] }, acceptance: 0.9, effect: 'homework',
    success: out({ actor: { friendship: 2, trust: 3 }, target: { friendship: 3, trust: 4 }, social: 8, targetMoodlet: 'homeworkDone', actorMoodlet: 'proudParent' }),
    failure: out({ actor: { friendship: -1 }, target: { friendship: -1 }, social: 1 }),
    lines: {
      success: ['{a} and {b} work through the sums until the last page is done.', '"Now it makes sense!" {b} grins at {a}.'],
      failure: ['{b} is too grumpy to do homework with {a}.', '"I can do it myself!" {b} shoos {a} away.'],
    },
    topics: ['school'], autonomy: { enabled: true, weight: 0.8 },
  }),
  social({
    id: 'askToMoveIn', name: 'Ask to Move In', description: 'Ask a good friend to move in with your household. They bring their family along. Needs a close friendship and room in the household (up to 8 people).', icon: 'home', category: 'status',
    minutes: 5, anim: 'talk', requires: { actorStages: ADULTS, targetStages: ADULTS, otherHousehold: true, minFamiliarity: 40, minFriendship: 55, minTrust: 20 }, acceptance: 0.55,
    section: 'special', effect: 'moveIn',
    success: out({
      actor: { friendship: 6, trust: 4 }, target: { friendship: 6, trust: 4 }, social: 14, actorMoodlet: 'newFamily', targetMoodlet: 'newFamily',
      memory: { kind: 'movedIn', importance: 3, text: '{b} moved in with {a}.' },
    }),
    failure: out({ actor: { friendship: -1 }, target: { friendship: -1 }, social: 2, actorMoodlet: 'rebuffed' }),
    lines: {
      success: ['"Would you like to move in with us?" "I would love to, {a}!"', '{b} laughs and starts packing. "Yes, {a}. Yes!"'],
      failure: ['"I love my own place, {a}. Maybe someday."', '{b} smiles kindly but shakes their head.'],
    },
    topics: ['home'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'askPartnerToMoveIn', name: 'Ask Your Partner to Move In', description: 'Ask your partner to share your home. They bring their family along. Needs room in the household (up to 8 people).', icon: 'home', category: 'status',
    minutes: 5, anim: 'talk', requires: { actorStages: ADULTS, targetStages: ADULTS, otherHousehold: true, status: ['partner', 'engaged', 'spouse'], minTrust: 10 }, acceptance: 0.8,
    section: 'special', effect: 'moveIn',
    success: out({
      actor: { friendship: 5, romance: 5, trust: 4 }, target: { friendship: 5, romance: 5, trust: 4 }, social: 14, actorMoodlet: 'newFamily', targetMoodlet: 'newFamily',
      memory: { kind: 'movedIn', importance: 3, text: '{b} moved in with {a}.' },
    }),
    failure: out({ actor: { friendship: -1 }, target: { friendship: -1 }, social: 2, actorMoodlet: 'rebuffed' }),
    lines: {
      success: ['"Move in with me?" {b} kisses {a}. "Yes!"', '{b} grins. "I thought you would never ask, {a}."'],
      failure: ['"Not yet, {a}. I am not quite ready."', '{b} hesitates. "Let us wait a little."'],
    },
    topics: ['home', 'romance'], autonomy: { enabled: false, weight: 0 },
  }),
];

/** Cost of one birthday cake, shown in hints. */
export const CAKE_PRICE = dollars(25);
