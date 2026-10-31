// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Social interactions between two people. The simulation resolves acceptance once per interaction:
//   chance = acceptance + targetTraits[t] (target's traits) + actorTraits[t] (actor's traits)
//            + the target's trait socialReceive for this category + mood/relationship/topic modifiers (sim),
// then applies `success` or `failure` once. RelDelta `actor` changes the actor's opinion of the target and
// `target` the target's opinion of the actor. `setStatus` changes the shared bond only on success.
// For 'mean' socials "success" means the jab lands as intended; "failure" means it backfires.
// Requirements are read from the actor's relationship toward the target (familiarity 0..100, the others
// -100..100); `status`/`notStatus` check the shared bond. Topics starting with 'topic:' are preference ids.
// Lines are authored English snippets: {a} = actor first name, {b} = target first name.

import type { SocialDef, SocialOutcome } from './types';

type Def = Omit<SocialDef, 'targetTraits' | 'actorTraits' | 'alsoActivity' | 'status' | 'topics'> &
  Partial<Pick<SocialDef, 'targetTraits' | 'actorTraits' | 'alsoActivity' | 'status' | 'topics'>>;
const social = (d: Def): SocialDef => ({ targetTraits: {}, actorTraits: {}, alsoActivity: false, status: 'ready', topics: [], ...d });
const out = (o: Partial<SocialOutcome> & { social: number }): SocialOutcome => ({ actor: {}, target: {}, ...o });

/** Statuses that already include friendship (used to gate the status-change socials). */
const FRIENDLY_BONDS = ['friend', 'closeFriend', 'partner', 'engaged', 'spouse'] as const;

const GREETING: SocialDef[] = [
  social({
    id: 'introduce', name: 'Introduce Yourself', description: 'Say hello to someone you have not met yet.', icon: 'social', category: 'greeting',
    minutes: 3, anim: 'wave', requires: { maxFamiliarity: 9 }, acceptance: 0.95, targetTraits: { reserved: -0.1 }, actorTraits: { outgoing: 0.05 },
    success: out({
      actor: { familiarity: 15, friendship: 4 }, target: { familiarity: 15, friendship: 4 }, social: 8,
      actorMoodlet: 'niceToMeetYou', targetMoodlet: 'niceToMeetYou',
      memory: { kind: 'met', importance: 1, text: '{a} and {b} introduced themselves.' },
    }),
    failure: out({ actor: { familiarity: 8 }, target: { familiarity: 8, friendship: -2 }, social: 3, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"Hi, I\'m {a}. I don\'t think we\'ve met!" "{b}. Nice to meet you!"', '{a} waves. "Hello there, I\'m {a}." {b} smiles back.', '"{a}, by the way." "{b}. Great to finally put a name to the face."'],
      failure: ['{b} gives {a} a distracted nod and looks away.', '"Sorry, {a}, was it? I\'m in a bit of a hurry."'],
    },
    topics: ['greeting'], autonomy: { enabled: true, weight: 1.2 },
  }),
  social({
    id: 'waveGoodbye', name: 'Say Goodbye', description: 'Wrap up the conversation politely.', icon: 'social', category: 'greeting',
    minutes: 1, anim: 'wave', requires: { minFamiliarity: 10 }, acceptance: 1,
    success: out({ actor: { familiarity: 1 }, target: { familiarity: 1 }, social: 3 }),
    failure: out({ social: 1 }),
    lines: {
      success: ['"See you around, {b}!" "Take care, {a}!"', '{a} waves goodbye to {b}.', '"Catch you later, {b}."'],
      failure: ['{a} waves, but {b} has already turned away.', '"Bye, {b}!" No answer.'],
    },
    topics: ['greeting'], autonomy: { enabled: true, weight: 0.5 },
  }),
];

const FRIENDLY: SocialDef[] = [
  social({
    id: 'chat', name: 'Chat', description: 'Some easy small talk.', icon: 'social', category: 'friendly',
    minutes: 4, anim: 'talk', requires: { minFamiliarity: 10 }, acceptance: 0.85, targetTraits: { outgoing: 0.05 },
    success: out({ actor: { familiarity: 3, friendship: 3 }, target: { familiarity: 3, friendship: 3 }, social: 10, targetMoodlet: 'pleasantChat' }),
    failure: out({ actor: { familiarity: 1 }, target: { familiarity: 1, friendship: -1 }, social: 3, actorMoodlet: 'awkward' }),
    lines: {
      success: ['{a} and {b} chat about the weather and the neighbourhood.', '"Busy week, {b}?" "Oh, you have no idea, {a}."', '{a} tells {b} about the new café down the road.'],
      failure: ['{b} answers {a} in single words.', '"Mm-hm." {b} is clearly not in the mood to talk, {a}.'],
    },
    topics: ['smalltalk', 'topic:food', 'topic:movies'], autonomy: { enabled: true, weight: 1 },
  }),
  social({
    id: 'askAboutDay', name: 'Ask About Their Day', description: 'Show some interest in how things are going.', icon: 'social', category: 'friendly',
    minutes: 4, anim: 'talk', requires: { minFamiliarity: 10 }, acceptance: 0.85, targetTraits: { 'family-oriented': 0.05 },
    success: out({ actor: { familiarity: 3, friendship: 2 }, target: { familiarity: 3, friendship: 4, trust: 1 }, social: 10, targetMoodlet: 'pleasantChat' }),
    failure: out({ target: { friendship: -1 }, social: 3, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"How was your day, {b}?" {b} happily tells {a} all about it.', '{b} lights up. "Thanks for asking, {a}! Actually, it was great."', '"Long day?" "The longest, {a}. Let me tell you..."'],
      failure: ['"Fine." {b} does not elaborate.', '"Can we not, {a}? It was a day."'],
    },
    topics: ['day', 'work'], autonomy: { enabled: true, weight: 0.9 },
  }),
  social({
    id: 'discussInterests', name: 'Discuss Interests', description: 'Talk about hobbies and favourite things. Shared likes go a long way.', icon: 'social', category: 'friendly',
    minutes: 6, anim: 'talk', requires: { minFamiliarity: 20 }, acceptance: 0.75, targetTraits: { bookish: 0.05, 'music-lover': 0.05 },
    success: out({ actor: { familiarity: 4, friendship: 5 }, target: { familiarity: 4, friendship: 5 }, social: 12, fun: 4, targetMoodlet: 'pleasantChat', actorMoodlet: 'pleasantChat' }),
    failure: out({ actor: { familiarity: 2 }, target: { familiarity: 2, friendship: -2 }, social: 4, actorMoodlet: 'awkward' }),
    lines: {
      success: ['{a} and {b} discover they love the same things.', '"You too? No way!" {b} grins at {a}.', '{a} and {b} trade recommendations for half an hour.'],
      failure: ['{b} politely pretends to care about {a}\'s hobby.', '"That sounds... nice, {a}." {b} stifles a yawn.'],
    },
    topics: ['topic:sports', 'topic:books', 'topic:music', 'topic:movies', 'topic:technology', 'topic:nature', 'topic:travel', 'topic:food'],
    autonomy: { enabled: true, weight: 0.8 },
  }),
  social({
    id: 'compliment', name: 'Compliment', description: 'Say something nice about them.', icon: 'star', category: 'friendly',
    minutes: 2, anim: 'agree', requires: { minFamiliarity: 10 }, acceptance: 0.85, targetTraits: { cheerful: 0.05 },
    success: out({ actor: { friendship: 2 }, target: { friendship: 4, trust: 1 }, social: 8, targetMoodlet: 'flattered' }),
    failure: out({ target: { friendship: -1, trust: -1 }, social: 2, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"You always know how to brighten the room, {b}." {b} beams.', '{a} compliments {b}\'s great taste.', '"Thanks, {a}. That really made my day."'],
      failure: ['{b} narrows their eyes. "What do you want, {a}?"', '{b} shrugs off the compliment.'],
    },
    topics: ['praise'], autonomy: { enabled: true, weight: 0.6 },
  }),
  social({
    id: 'shareNews', name: 'Share News', description: 'Tell them what has been happening lately.', icon: 'social', category: 'friendly',
    minutes: 4, anim: 'talk', requires: { minFamiliarity: 15 }, acceptance: 0.85,
    success: out({ actor: { familiarity: 3, trust: 2 }, target: { familiarity: 3, friendship: 3, trust: 2 }, social: 10 }),
    failure: out({ target: { friendship: -1 }, social: 3, actorMoodlet: 'awkward' }),
    lines: {
      success: ['{a} fills {b} in on the latest news.', '"Guess what happened at work, {b}!"', '{b} listens closely as {a} shares the news.'],
      failure: ['{b} already heard, and does not hide it.', '"Old news, {a}."'],
    },
    topics: ['news', 'work', 'topic:travel'], autonomy: { enabled: true, weight: 0.6 },
  }),
];

const FUNNY: SocialDef[] = [
  social({
    id: 'tellJoke', name: 'Tell a Joke', description: 'Try to get a laugh. Not everyone shares the same sense of humour.', icon: 'fun', category: 'funny',
    minutes: 2, anim: 'laugh', requires: { minFamiliarity: 10 }, acceptance: 0.7,
    targetTraits: { cheerful: 0.1, reserved: -0.05, 'hot-tempered': -0.05 }, actorTraits: { cheerful: 0.05 },
    success: out({
      actor: { friendship: 2 }, target: { friendship: 4 }, social: 10, fun: 8, targetMoodlet: 'goodLaugh', actorMoodlet: 'goodLaugh',
      memory: { kind: 'joke', importance: 1, text: '{a} made {b} laugh out loud.' },
    }),
    failure: out({ target: { friendship: -2 }, social: 3, actorMoodlet: 'embarrassed' }),
    lines: {
      success: ['{a} tells a joke and {b} bursts out laughing.', '"Stop it, {a}, I can\'t breathe!"', '{b} snorts with laughter at {a}\'s punchline.'],
      failure: ['The punchline lands with a thud. {b} just stares at {a}.', '"I don\'t get it, {a}."', 'Crickets. {a} laughs alone.'],
    },
    topics: ['jokes'], autonomy: { enabled: true, weight: 0.7 },
  }),
  social({
    id: 'highFive', name: 'High Five', description: 'Celebrate something together.', icon: 'fun', category: 'funny',
    minutes: 1, anim: 'wave', requires: { minFamiliarity: 15, minFriendship: 5 }, acceptance: 0.9, targetTraits: { athletic: 0.05 },
    success: out({ actor: { friendship: 2 }, target: { friendship: 2 }, social: 6, fun: 5 }),
    failure: out({ target: { friendship: -1 }, social: 2, actorMoodlet: 'awkward' }),
    lines: {
      success: ['{a} and {b} share a perfect high five.', '"Up top, {b}!" Smack!'],
      failure: ['{a} is left hanging. {b} did not see it.', '{b} misses the high five entirely.'],
    },
    topics: ['celebration'], autonomy: { enabled: true, weight: 0.4 },
  }),
];

const DEEP_AND_SUPPORT: SocialDef[] = [
  social({
    id: 'deepConversation', name: 'Deep Conversation', description: 'Talk about hopes, fears and the big questions. Builds trust.', icon: 'heart', category: 'deep',
    minutes: 8, anim: 'talk', requires: { minFamiliarity: 30, minFriendship: 25 }, acceptance: 0.65,
    targetTraits: { reserved: 0.05, bookish: 0.05, 'hot-tempered': -0.05 },
    success: out({
      actor: { friendship: 7, trust: 5 }, target: { friendship: 7, trust: 5 }, social: 18,
      actorMoodlet: 'greatConversation', targetMoodlet: 'greatConversation',
      memory: { kind: 'greatChat', importance: 2, text: '{a} and {b} had a long, honest talk.' },
    }),
    failure: out({ target: { friendship: -2 }, social: 5, actorMoodlet: 'awkward' }),
    lines: {
      success: ['{a} and {b} lose track of time talking about life.', '"I\'ve never told anyone this, {a}..."', '{b} nods slowly. "I know exactly what you mean, {a}."', 'Hours fly by as {a} and {b} talk.'],
      failure: ['{b} changes the subject. Too much, too soon, {a}.', '"That\'s... a lot, {a}. Maybe another time."'],
    },
    topics: ['life', 'feelings'], autonomy: { enabled: true, weight: 0.5 },
  }),
  social({
    id: 'hug', name: 'Hug', description: 'A warm hug between friends.', icon: 'heart', category: 'support',
    minutes: 1, anim: 'agree', requires: { status: [...FRIENDLY_BONDS] }, acceptance: 0.85, targetTraits: { reserved: -0.1, 'family-oriented': 0.05 },
    success: out({ actor: { friendship: 4, trust: 2 }, target: { friendship: 5, trust: 3 }, social: 10, actorMoodlet: 'warmHug', targetMoodlet: 'warmHug' }),
    failure: out({ target: { friendship: -4, trust: -2 }, social: 2, actorMoodlet: 'awkward', targetMoodlet: 'awkward' }),
    lines: {
      success: ['{a} wraps {b} in a big hug.', '"Come here, {b}." A long, warm hug.', '{b} hugs {a} back tightly.'],
      failure: ['{b} steps back from {a}\'s hug. Awkward.', '"Whoa, {a}, personal space!"'],
    },
    topics: ['affection'], autonomy: { enabled: true, weight: 0.4 },
  }),
  social({
    id: 'comfort', name: 'Comfort', description: 'Offer support when they need it.', icon: 'heart', category: 'support',
    minutes: 5, anim: 'talk', requires: { minFamiliarity: 20, minFriendship: 15 }, acceptance: 0.8, actorTraits: { patient: 0.05 },
    success: out({
      actor: { friendship: 3, trust: 2 }, target: { friendship: 5, trust: 6 }, social: 12, targetMoodlet: 'comforted',
      memory: { kind: 'comforted', importance: 2, text: '{a} was there for {b} when it mattered.' },
    }),
    failure: out({ target: { trust: -1 }, social: 4, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"Hey, {b}. It\'s going to be okay." {b} takes a deep breath.', '{a} listens patiently while {b} talks it through.', '"Thanks, {a}. I needed that."'],
      failure: ['"I\'m fine, {a}. Really." {b} is clearly not fine.', '{b} would rather be alone right now.'],
    },
    topics: ['feelings'], autonomy: { enabled: true, weight: 0.3 },
  }),
  social({
    id: 'apologize', name: 'Apologize', description: 'Make amends after a falling-out.', icon: 'check', category: 'support',
    minutes: 3, anim: 'talk', requires: { minFamiliarity: 10, maxFriendship: 30 }, acceptance: 0.6,
    targetTraits: { patient: 0.15, 'hot-tempered': -0.1, cheerful: 0.05 },
    success: out({ actor: { friendship: 3 }, target: { friendship: 8, trust: 4 }, social: 6, actorMoodlet: 'forgiven' }),
    failure: out({ target: { friendship: -2 }, social: 2, actorMoodlet: 'rebuffed' }),
    lines: {
      success: ['"I\'m sorry, {b}. I was out of line." "Apology accepted, {a}."', '{b} softens. "Thanks for saying that, {a}."', '{a} and {b} clear the air.'],
      failure: ['"Sorry doesn\'t fix it, {a}."', '{b} is not ready to forgive {a} yet.'],
    },
    topics: ['conflict'], autonomy: { enabled: true, weight: 0.3 },
  }),
];

const MEAN: SocialDef[] = [
  social({
    id: 'criticize', name: 'Criticize', description: 'Point out something they are doing wrong. It rarely helps the friendship.', icon: 'warning', category: 'mean',
    minutes: 3, anim: 'disagree', requires: { minFamiliarity: 10 }, acceptance: 0.5, targetTraits: { patient: 0.15 },
    success: out({ actor: { friendship: -1 }, target: { friendship: -4, trust: -1 }, social: 2, targetMoodlet: 'stung' }),
    failure: out({ actor: { friendship: -4 }, target: { friendship: -6, trust: -2 }, social: 0, actorMoodlet: 'furious', targetMoodlet: 'furious' }),
    lines: {
      success: ['"Honestly, {b}, you could try harder." {b} winces but takes it in.', '{a} lists everything {b} did wrong today.', '"Fair point, {a}," {b} mutters.'],
      failure: ['"Who asked you, {a}?" It turns into a spat.', '{b} snaps back at {a}, and both storm off.'],
    },
    topics: ['conflict'], autonomy: { enabled: true, weight: 0.08 },
  }),
  social({
    id: 'argue', name: 'Argue', description: 'Have it out over a disagreement. Expect hurt feelings on both sides.', icon: 'warning', category: 'mean',
    minutes: 5, anim: 'disagree', requires: { minFamiliarity: 15 }, acceptance: 0.45, targetTraits: { patient: 0.1 },
    success: out({
      actor: { friendship: -4, trust: -2 }, target: { friendship: -8, trust: -4 }, social: 2, targetMoodlet: 'furious',
      memory: { kind: 'argument', importance: 2, text: '{a} and {b} had a heated argument.' },
    }),
    failure: out({
      actor: { friendship: -8, trust: -4 }, target: { friendship: -8, trust: -4 }, social: 0, actorMoodlet: 'furious', targetMoodlet: 'furious',
      memory: { kind: 'argument', importance: 2, text: '{a} and {b} had a shouting match.' },
    }),
    lines: {
      success: ['{a} wins the argument, but {b} is seething.', '"You know I\'m right, {b}." {b} storms off.', '{a} gets the last word in.'],
      failure: ['{a} and {b} shout over each other.', '"Unbelievable, {a}!" "Me? You started it, {b}!"', 'The argument between {a} and {b} goes nowhere, and everyone ends up angry.'],
    },
    topics: ['conflict'], autonomy: { enabled: true, weight: 0.05 },
  }),
  social({
    id: 'insult', name: 'Insult', description: 'Say something deliberately hurtful.', icon: 'warning', category: 'mean',
    minutes: 2, anim: 'foldArms', requires: { minFamiliarity: 10 }, acceptance: 0.5, targetTraits: { cheerful: -0.1 },
    success: out({
      actor: { friendship: -3 }, target: { friendship: -12, trust: -8 }, social: 0, targetMoodlet: 'insulted',
      memory: { kind: 'insult', importance: 2, text: '{a} insulted {b}.' },
    }),
    failure: out({ target: { friendship: -5, trust: -3 }, social: 0, actorMoodlet: 'embarrassed' }),
    lines: {
      success: ['{a} makes a cruel remark about {b}. It hits hard.', '"Is that really the best you can do, {b}?"', '{b} goes quiet after {a}\'s jab.'],
      failure: ['{b} just laughs it off. "Nice try, {a}."', '"Wow, {a}. That says more about you than me."'],
    },
    topics: ['conflict'], autonomy: { enabled: true, weight: 0.03 },
  }),
];

const ROMANTIC: SocialDef[] = [
  social({
    id: 'flirt', name: 'Flirt', description: 'Turn on the charm. Only between adults who are open to it.', icon: 'heart', category: 'romantic',
    minutes: 3, anim: 'laugh', requires: { romantic: true, minFamiliarity: 20, minFriendship: 10 }, acceptance: 0.55,
    targetTraits: { romantic: 0.1, reserved: -0.05 }, actorTraits: { romantic: 0.05, outgoing: 0.05 },
    success: out({ actor: { romance: 8, friendship: 2 }, target: { romance: 6, friendship: 2 }, social: 10, fun: 4, actorMoodlet: 'butterflies', targetMoodlet: 'butterflies' }),
    failure: out({ actor: { romance: -2 }, target: { romance: -4, friendship: -2 }, social: 2, actorMoodlet: 'rebuffed' }),
    lines: {
      success: ['{a} catches {b}\'s eye and smiles. {b} blushes.', '"Has anyone told you your laugh is wonderful, {b}?"', '{b} laughs a little too long at {a}\'s joke.'],
      failure: ['{b} raises an eyebrow. "Let\'s keep it friendly, {a}."', '{a}\'s line falls flat. {b} looks away.'],
    },
    topics: ['romance'], autonomy: { enabled: true, weight: 0.2 },
  }),
  social({
    id: 'complimentAppearance', name: 'Compliment Looks', description: 'Tell them they look great today.', icon: 'heart', category: 'romantic',
    minutes: 2, anim: 'agree', requires: { romantic: true, minFamiliarity: 15 }, acceptance: 0.65, targetTraits: { romantic: 0.1 },
    success: out({ actor: { romance: 4 }, target: { romance: 5, friendship: 2 }, social: 8, targetMoodlet: 'flattered' }),
    failure: out({ target: { romance: -3 }, social: 2, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"You look amazing today, {b}." {b} can\'t stop smiling.', '{a} admires {b}\'s outfit out loud.'],
      failure: ['"Um. Thanks, {a}." {b} shifts uncomfortably.', '{b} pretends not to hear {a}.'],
    },
    topics: ['romance', 'fashion'], autonomy: { enabled: true, weight: 0.2 },
  }),
];

const STATUS: SocialDef[] = [
  social({
    id: 'becomeFriends', name: 'Ask to Be Friends', description: 'Make the friendship official. Needs a decent friendship first.', icon: 'people', category: 'status',
    minutes: 3, anim: 'talk', requires: { minFamiliarity: 25, minFriendship: 30, notStatus: [...FRIENDLY_BONDS, 'rival'] }, acceptance: 0.8,
    targetTraits: { outgoing: 0.05, reserved: -0.05 },
    success: out({
      actor: { friendship: 6, trust: 3 }, target: { friendship: 6, trust: 3 }, social: 12, actorMoodlet: 'newFriend', targetMoodlet: 'newFriend',
      memory: { kind: 'becameFriends', importance: 3, text: '{a} and {b} became friends.' }, setStatus: 'friend',
    }),
    failure: out({ actor: { friendship: -3 }, target: { friendship: -1 }, social: 2, actorMoodlet: 'rebuffed' }),
    lines: {
      success: ['"Friends?" "Friends, {a}!" {a} and {b} shake on it.', '{b} grins. "I thought we already were, {a}!"', 'A new friendship: {a} and {b}.'],
      failure: ['"Let\'s not rush it, {a}." Ouch.', '{b} gives {a} a noncommittal shrug.'],
    },
    topics: ['friendship'], autonomy: { enabled: true, weight: 0.3 },
  }),
  social({
    id: 'becomeCloseFriends', name: 'Ask to Be Close Friends', description: 'Become each other\'s go-to person. Needs a strong friendship.', icon: 'people', category: 'status',
    minutes: 4, anim: 'talk', requires: { minFamiliarity: 50, minFriendship: 65, status: ['friend'] }, acceptance: 0.75,
    success: out({
      actor: { friendship: 8, trust: 6 }, target: { friendship: 8, trust: 6 }, social: 15, actorMoodlet: 'closeFriendship', targetMoodlet: 'closeFriendship',
      memory: { kind: 'becameFriends', importance: 3, text: '{a} and {b} became close friends.' }, setStatus: 'closeFriend',
    }),
    failure: out({ actor: { friendship: -4 }, target: { friendship: -2 }, social: 3, actorMoodlet: 'rebuffed' }),
    lines: {
      success: ['"You\'re my best friend, {b}." "And you\'re mine, {a}."', '{a} and {b} are now inseparable.', '{b} hugs {a}. "Always."'],
      failure: ['"You\'re a good friend, {a}. Let\'s leave it there for now."', '{b} hesitates a little too long.'],
    },
    topics: ['friendship'], autonomy: { enabled: true, weight: 0.2 },
  }),
];

/** Every social interaction. None of them is also counted as an activity (alsoActivity false). */
export const SOCIALS: SocialDef[] = [...GREETING, ...FRIENDLY, ...FUNNY, ...DEEP_AND_SUPPORT, ...MEAN, ...ROMANTIC, ...STATUS];
