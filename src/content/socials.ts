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
// Milestone 5 additions: `minTrust`/`maxTrust` (trust gates depth: deep talks, secrets and favours), `exclusive`
// (romantic commitments need both people free), `private` (kisses and proposals need privacy), `memory`
// (making up needs something to make up for), `section` (menu: Friendly / Romantic / Mean / Special), `cost`
// (gifts), `unilateral` (breaking up), `startsEvent` (an accepted invitation plans a date) and `resolves`
// (an apology settles earlier arguments). Romantic socials are adults only and need both people to be interested
// (sim/social.ts); a declined advance is always gentle: no friendship loss, a small moodlet for both.

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
    success: out({ actor: { familiarity: 3, friendship: 3, trust: 1 }, target: { familiarity: 3, friendship: 3, trust: 1 }, social: 10, targetMoodlet: 'pleasantChat' }),
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
    success: out({ actor: { familiarity: 4, friendship: 5, trust: 1 }, target: { familiarity: 4, friendship: 5, trust: 1 }, social: 12, fun: 4, targetMoodlet: 'pleasantChat', actorMoodlet: 'pleasantChat' }),
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
    minutes: 8, anim: 'talk', requires: { minFamiliarity: 30, minFriendship: 25, minTrust: 10 }, acceptance: 0.65,
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
    success: out({ actor: { friendship: 3 }, target: { friendship: 8, trust: 4 }, social: 6, actorMoodlet: 'forgiven', resolves: ['argument', 'insult'] }),
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
      actor: { friendship: -4, trust: -4 }, target: { friendship: -8, trust: -8 }, social: 2, targetMoodlet: 'furious',
      memory: { kind: 'argument', importance: 2, text: '{a} and {b} had a heated argument.' },
    }),
    failure: out({
      actor: { friendship: -8, trust: -8 }, target: { friendship: -8, trust: -8 }, social: 0, actorMoodlet: 'furious', targetMoodlet: 'furious',
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
      actor: { friendship: -3, trust: -2 }, target: { friendship: -12, trust: -18 }, social: 0, targetMoodlet: 'insulted',
      memory: { kind: 'insult', importance: 2, text: '{a} insulted {b}.' },
    }),
    failure: out({ actor: { trust: -3 }, target: { friendship: -5, trust: -8 }, social: 0, actorMoodlet: 'embarrassed' }),
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
    failure: out({ actor: { romance: -2 }, target: { romance: -2 }, social: 2, actorMoodlet: 'flustered', targetMoodlet: 'flustered', memory: { kind: 'rejected', importance: 1, text: '{b} gently turned down a romantic advance from {a}.' } }),
    lines: {
      success: ['{a} catches {b}\'s eye and smiles. {b} blushes.', '"Has anyone told you your laugh is wonderful, {b}?"', '{b} laughs a little too long at {a}\'s joke.'],
      failure: ['{b} smiles kindly. "You\'re sweet, {a}, but let\'s keep it friendly."', '{a}\'s line falls flat. {b} laughs it off, gently, and changes the subject.'],
    },
    topics: ['romance'], autonomy: { enabled: true, weight: 0.2 },
  }),
  social({
    id: 'complimentAppearance', name: 'Compliment Looks', description: 'Tell them they look great today.', icon: 'heart', category: 'romantic',
    minutes: 2, anim: 'agree', requires: { romantic: true, minFamiliarity: 15 }, acceptance: 0.65, targetTraits: { romantic: 0.1 },
    success: out({ actor: { romance: 4 }, target: { romance: 5, friendship: 2 }, social: 8, targetMoodlet: 'flattered' }),
    failure: out({ actor: { romance: -1 }, target: { romance: -1 }, social: 2, actorMoodlet: 'flustered', targetMoodlet: 'flustered' }),
    lines: {
      success: ['"You look amazing today, {b}." {b} can\'t stop smiling.', '{a} admires {b}\'s outfit out loud.'],
      failure: ['"Thanks, {a}, that\'s kind." {b} smiles politely, but keeps their distance.', '{b} laughs, a little shy. "You are too nice, {a}."'],
    },
    topics: ['romance', 'fashion'], autonomy: { enabled: true, weight: 0.2 },
  }),
];


const TRUST: SocialDef[] = [
  social({
    id: 'shareSecret', name: 'Share a Secret', description: 'Confide something private. Needs real trust, and builds more of it.', icon: 'heart', category: 'deep', section: 'special',
    minutes: 6, anim: 'talk', requires: { minFamiliarity: 30, minFriendship: 30, minTrust: 30 }, acceptance: 0.7,
    targetTraits: { reserved: 0.05, 'family-oriented': 0.05, 'hot-tempered': -0.05 },
    success: out({
      actor: { trust: 8, friendship: 3 }, target: { trust: 10, friendship: 5 }, social: 16, actorMoodlet: 'pleasantChat', targetMoodlet: 'trusted',
      memory: { kind: 'secretShared', importance: 2, text: '{a} confided a secret to {b}.' },
    }),
    failure: out({ target: { trust: -2 }, social: 4, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"Can I tell you something I have never told anyone?" {b} leans in. "Always, {a}."', '{a} lowers their voice and confides in {b}. It stays between them.', '{b} squeezes {a}\'s hand. "Thank you for trusting me."'],
      failure: ['{b} is not ready to hear it. "Maybe later, {a}."', '{a} starts to speak, then stops. The moment has passed.'],
    },
    topics: ['feelings', 'life'], autonomy: { enabled: true, weight: 0.25 },
  }),
  social({
    id: 'askAdvice', name: 'Ask for Advice', description: 'Ask a friend what they would do. Flattering, and a little trust goes both ways.', icon: 'social', category: 'support',
    minutes: 5, anim: 'talk', requires: { minFamiliarity: 20, minFriendship: 15, minTrust: 10 }, acceptance: 0.8,
    targetTraits: { bookish: 0.05, patient: 0.05 },
    success: out({
      actor: { friendship: 2, trust: 3 }, target: { friendship: 3, trust: 2 }, social: 10, actorMoodlet: 'goodAdvice', targetMoodlet: 'flattered',
      memory: { kind: 'advice', importance: 1, text: '{b} gave {a} some good advice.' },
    }),
    failure: out({ target: { friendship: -1 }, social: 3, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"What would you do, {b}?" {b} thinks it over and offers a surprisingly good answer.', '{b} listens, nods, and gives {a} a plan.', '"That helps a lot, thanks {b}."'],
      failure: ['"I am not the right person to ask, {a}."', '{b} shrugs. "Honestly? No idea."'],
    },
    topics: ['advice', 'life'], autonomy: { enabled: true, weight: 0.3 },
  }),
  social({
    id: 'gossip', name: 'Gossip', description: 'Swap stories about people you both know. Fun, but not exactly trustworthy.', icon: 'fun', category: 'friendly',
    minutes: 4, anim: 'laugh', requires: { minFamiliarity: 25, minFriendship: 20 }, acceptance: 0.65,
    targetTraits: { cheerful: 0.05, 'family-oriented': -0.1, patient: -0.05 }, actorTraits: { outgoing: 0.05 },
    success: out({ actor: { friendship: 3, trust: -1 }, target: { friendship: 4, trust: -1 }, social: 12, fun: 6, actorMoodlet: 'pleasantChat', targetMoodlet: 'pleasantChat' }),
    failure: out({ actor: { trust: -2 }, target: { friendship: -2, trust: -3 }, social: 2, actorMoodlet: 'embarrassed' }),
    lines: {
      success: ['{a} and {b} trade whispers and giggle behind their hands.', '"You did not hear this from me, {b}, but..." "No way!"', '{b} gasps. "{a}, you are terrible. Go on."'],
      failure: ['"I would rather not talk about people behind their backs, {a}."', '{b} frowns. "That is not very kind, {a}."'],
    },
    topics: ['news', 'gossip'], autonomy: { enabled: true, weight: 0.35 },
  }),
  social({
    id: 'tease', name: 'Tease', description: 'Playful teasing between friends. Stranger or touchy people may not find it funny.', icon: 'fun', category: 'funny',
    minutes: 2, anim: 'laugh', requires: { minFamiliarity: 20, minFriendship: 15 }, acceptance: 0.55,
    targetTraits: { cheerful: 0.1, 'hot-tempered': -0.15, reserved: -0.1, patient: 0.05 }, actorTraits: { cheerful: 0.05 },
    success: out({ actor: { friendship: 3 }, target: { friendship: 4 }, social: 9, fun: 8, actorMoodlet: 'goodLaugh', targetMoodlet: 'goodLaugh' }),
    failure: out({ actor: { friendship: -1 }, target: { friendship: -5, trust: -2 }, social: 1, actorMoodlet: 'remorseful', targetMoodlet: 'stung' }),
    lines: {
      success: ['{a} teases {b} about the hat. {b} throws a cushion back.', '"Nice moves, {b}." "Says the person who tripped on the rug!"', '{b} rolls their eyes, grinning. "Very funny, {a}."'],
      failure: ['The tease lands wrong. {b} goes quiet and {a} wishes they had not said it.', '"That was not funny, {a}."'],
    },
    topics: ['jokes'], autonomy: { enabled: true, weight: 0.35 },
  }),
  social({
    id: 'askFavor', name: 'Ask for a Favour', description: 'Ask a trusted friend to do something for you. Asking too soon feels pushy.', icon: 'check', category: 'support', section: 'special',
    minutes: 4, anim: 'talk', requires: { minFamiliarity: 30, minFriendship: 25, minTrust: 25 }, acceptance: 0.7,
    targetTraits: { 'family-oriented': 0.05, patient: 0.05 },
    success: out({
      actor: { friendship: 1, trust: 2 }, target: { friendship: -1, trust: 3 }, social: 6, actorMoodlet: 'favourDone',
      memory: { kind: 'helped', importance: 1, text: '{b} did {a} a favour.' },
    }),
    failure: out({ actor: { friendship: -2 }, target: { friendship: -2, trust: -1 }, social: 2, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"Could you do me a favour, {b}?" "Of course, {a}. Leave it to me."', '{b} nods. "Consider it done."', '{a} thanks {b} warmly for helping out.'],
      failure: ['"I cannot this time, {a}. Sorry."', '{b} sighs. "You are asking a lot, {a}."'],
    },
    topics: ['favour'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'giveGift', name: 'Give a Gift', description: 'Bring a small present ($20). Charged to your household when accepted.', icon: 'star', category: 'friendly', section: 'special',
    minutes: 2, anim: 'agree', requires: { minFamiliarity: 15 }, acceptance: 0.9, cost: 2000,
    success: out({
      actor: { friendship: 2, trust: 1 }, target: { friendship: 6, trust: 2 }, social: 8, targetMoodlet: 'giftReceived', actorMoodlet: 'pleasantChat',
      memory: { kind: 'gift', importance: 1, text: '{a} gave {b} a thoughtful gift.' },
    }),
    failure: out({ actor: { friendship: -1 }, target: { friendship: 1 }, social: 2, actorMoodlet: 'awkward' }),
    lines: {
      success: ['"I saw this and thought of you, {b}." {b} is delighted.', '{b} unwraps the gift and beams at {a}.', '"You should not have, {a}!" {b} very much likes it.'],
      failure: ['{b} politely turns the gift down. "That is too much, {a}."', '"Oh. Thank you, {a}," says {b}, a bit stiffly.'],
    },
    topics: ['gift'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'makeUp', name: 'Make Up', description: 'Clear the air after an argument or insult. Works best with patience and a sincere attempt.', icon: 'check', category: 'support', section: 'special',
    minutes: 5, anim: 'talk', requires: { minFamiliarity: 15, memory: { kinds: ['argument', 'insult'], withinMinutes: 7 * 1440 } }, acceptance: 0.75,
    targetTraits: { patient: 0.15, 'hot-tempered': -0.1, cheerful: 0.05 },
    success: out({
      actor: { friendship: 6, trust: 4 }, target: { friendship: 12, trust: 10 }, social: 10, actorMoodlet: 'forgiven', targetMoodlet: 'forgiven',
      memory: { kind: 'reconciled', importance: 2, text: '{a} and {b} made up after a fight.' }, resolves: ['argument', 'insult'],
    }),
    failure: out({ target: { friendship: -2 }, social: 2, actorMoodlet: 'rebuffed' }),
    lines: {
      success: ['"I do not want to fight, {b}." "Neither do I, {a}." They hug it out.', '{a} and {b} talk it through and both admit they were wrong.', '{b} softens. "Let us just put it behind us."'],
      failure: ['"Not yet, {a}. I am still too angry."', '{b} turns away. "Give me some time."'],
    },
    topics: ['conflict', 'feelings'], autonomy: { enabled: true, weight: 0.4 },
  }),
];

const BETRAYAL: SocialDef[] = [
  social({
    id: 'betraySecret', name: 'Spill Their Secret', description: 'Tell others something they confided in you. Trust is shattered, and nobody forgets.', icon: 'warning', category: 'mean',
    minutes: 3, anim: 'disagree', requires: { minFamiliarity: 30, minTrust: 20 }, acceptance: 0.8,
    success: out({
      actor: { friendship: -5, trust: -5 }, target: { friendship: -25, trust: -45 }, social: 0, targetMoodlet: 'betrayed', actorMoodlet: 'remorseful',
      memory: { kind: 'betrayal', importance: 3, text: '{a} betrayed {b}\'s trust.' },
    }),
    failure: out({
      actor: { friendship: -8, trust: -8 }, target: { friendship: -15, trust: -30 }, social: 0, targetMoodlet: 'betrayed', actorMoodlet: 'embarrassed',
      memory: { kind: 'betrayal', importance: 3, text: '{a} betrayed {b}\'s trust.' },
    }),
    lines: {
      success: ['{a} lets {b}\'s secret slip. {b} finds out, and goes cold.', '"You promised, {a}." {b} walks away without another word.', 'Everyone now knows what {b} told {a} in confidence.'],
      failure: ['{a} tries to spill {b}\'s secret and gets caught doing it. It is a disaster.', '{b} overhears {a}. "How could you?"'],
    },
    topics: ['conflict'], autonomy: { enabled: false, weight: 0 },
  }),
];

/** Romantic gestures: soft failures (no friendship loss), `exclusive` for commitments, `private` for kisses. */
const ROMANTIC_PLUS: SocialDef[] = [
  social({
    id: 'holdHands', name: 'Hold Hands', description: 'A small, sweet gesture between two people who like each other.', icon: 'heart', category: 'romantic',
    minutes: 2, anim: 'agree', requires: { romantic: true, minFamiliarity: 25, minFriendship: 20, minRomance: 12, exclusive: true }, acceptance: 0.6,
    targetTraits: { romantic: 0.1, reserved: -0.1 }, actorTraits: { romantic: 0.05 },
    success: out({ actor: { romance: 5, friendship: 2, trust: 1 }, target: { romance: 5, friendship: 2, trust: 1 }, social: 8, actorMoodlet: 'handsHeld', targetMoodlet: 'handsHeld' }),
    failure: out({ actor: { romance: -1 }, target: { romance: -1 }, social: 2, actorMoodlet: 'flustered', targetMoodlet: 'flustered', memory: { kind: 'rejected', importance: 1, text: '{b} gently declined to hold hands with {a}.' } }),
    lines: {
      success: ['{a} reaches out and {b} takes their hand.', '{a} and {b} walk hand in hand for a while.', '{b} smiles and laces their fingers through {a}\'s.'],
      failure: ['{b} gently withdraws their hand. "Not yet, {a}. I am sorry."', '"I like you, {a}, but I need a bit more time," says {b} kindly.'],
    },
    topics: ['romance'], autonomy: { enabled: true, weight: 0.3 },
  }),
  social({
    id: 'kiss', name: 'Kiss', description: 'A kiss, in private. Both people must want it.', icon: 'heart', category: 'romantic',
    minutes: 2, anim: 'agree', requires: { romantic: true, minFamiliarity: 35, minFriendship: 35, minRomance: 35, exclusive: true, private: true }, acceptance: 0.55,
    targetTraits: { romantic: 0.1, reserved: -0.1 }, actorTraits: { romantic: 0.05 },
    success: out({
      actor: { romance: 9, friendship: 2, trust: 2 }, target: { romance: 9, friendship: 2, trust: 2 }, social: 14, fun: 6, actorMoodlet: 'sweetKiss', targetMoodlet: 'sweetKiss',
      memory: { kind: 'kiss', importance: 2, text: '{a} and {b} shared a kiss.' },
    }),
    failure: out({ actor: { romance: -3 }, target: { romance: -1 }, social: 2, actorMoodlet: 'flustered', targetMoodlet: 'flustered', memory: { kind: 'rejected', importance: 1, text: '{b} kindly stopped {a} from kissing them.' } }),
    lines: {
      success: ['{a} leans in and {b} meets them halfway.', 'A long, soft kiss between {a} and {b}.', '{b} kisses {a} and smiles. "I have wanted to do that for a while."'],
      failure: ['{b} turns their cheek, kindly. "I am not ready for that, {a}. I hope that is okay."', '"{a}, wait. Let us slow down," says {b} gently.'],
    },
    topics: ['romance'], autonomy: { enabled: true, weight: 0.3 },
  }),
  social({
    id: 'askOnDate', name: 'Ask on a Date', description: 'Invite them to a date at home this evening. Plans a dinner for two.', icon: 'heart', category: 'romantic',
    minutes: 3, anim: 'talk', requires: { romantic: true, minFamiliarity: 25, minFriendship: 25, minRomance: 20, exclusive: true }, acceptance: 0.6, startsEvent: 'date',
    targetTraits: { romantic: 0.1, outgoing: 0.05, reserved: -0.1 }, actorTraits: { romantic: 0.05, outgoing: 0.05 },
    success: out({ actor: { romance: 4, friendship: 1 }, target: { romance: 4, friendship: 1 }, social: 8, actorMoodlet: 'butterflies', targetMoodlet: 'butterflies' }),
    failure: out({
      actor: { romance: -2 }, target: { romance: -1 }, social: 2, actorMoodlet: 'rebuffed', targetMoodlet: 'flustered',
      memory: { kind: 'rejected', importance: 1, text: '{b} kindly said no to a date with {a}.' },
    }),
    lines: {
      success: ['"Would you like to have dinner with me, {b}?" {b} grins. "I would love to, {a}."', '{b} blushes. "A date? Yes. Yes, I would like that."', '{a} asks and {b} says yes before the question is finished.'],
      failure: ['"That is so kind, {a}, but I do not think so. I hope we can stay friends."', '{b} smiles apologetically. "Thank you for asking, {a}. It is a no from me."'],
    },
    topics: ['romance'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'askToBePartners', name: 'Ask to Be Partners', description: 'Make it official: become a couple. Needs a lot of romance, trust and friendship.', icon: 'heart', category: 'romantic',
    minutes: 4, anim: 'talk', requires: { romantic: true, minFamiliarity: 40, minFriendship: 45, minRomance: 50, minTrust: 30, exclusive: true, notStatus: ['partner', 'engaged', 'spouse', 'rival'] }, acceptance: 0.5,
    targetTraits: { romantic: 0.1, reserved: -0.05 },
    success: out({
      actor: { romance: 8, friendship: 4, trust: 4 }, target: { romance: 8, friendship: 4, trust: 4 }, social: 18, actorMoodlet: 'newPartner', targetMoodlet: 'newPartner',
      memory: { kind: 'becamePartners', importance: 3, text: '{a} and {b} became partners.' }, setStatus: 'partner',
    }),
    failure: out({
      actor: { romance: -3 }, target: { romance: -2 }, social: 2, actorMoodlet: 'rebuffed', targetMoodlet: 'flustered',
      memory: { kind: 'rejected', importance: 1, text: '{b} kindly asked {a} for more time.' },
    }),
    lines: {
      success: ['"Will you be my partner, {b}?" "Yes, {a}. A hundred times yes."', '{a} and {b} are officially a couple.', '{b} laughs and cries a little. "Of course, {a}."'],
      failure: ['"I care about you, {a}, but I am not there yet. I hope you understand."', '{b} takes {a}\'s hands. "Give me time. Please do not be hurt."'],
    },
    topics: ['romance'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'propose', name: 'Propose', description: 'Ask your partner to marry you. A big question, in private.', icon: 'star', category: 'romantic',
    minutes: 4, anim: 'talk', requires: { romantic: true, status: ['partner'], minFriendship: 55, minRomance: 65, minTrust: 45, exclusive: true, private: true }, acceptance: 0.7,
    success: out({
      actor: { romance: 10, friendship: 5, trust: 6 }, target: { romance: 10, friendship: 5, trust: 6 }, social: 20, actorMoodlet: 'engagedGlow', targetMoodlet: 'engagedGlow',
      memory: { kind: 'engaged', importance: 3, text: '{a} and {b} got engaged.' }, setStatus: 'engaged',
    }),
    failure: out({
      actor: { romance: -4 }, target: { romance: -2 }, social: 3, actorMoodlet: 'rebuffed', targetMoodlet: 'flustered',
      memory: { kind: 'rejected', importance: 1, text: '{b} asked {a} to wait before getting engaged.' },
    }),
    lines: {
      success: ['{a} kneels down. "{b}, will you marry me?" "Yes!"', '{b} says yes through happy tears.', '{a} and {b} are engaged.'],
      failure: ['"I love you, {a}, but not yet. Can we wait?" says {b} softly.', '{b} hugs {a}. "Ask me again when the time is right."'],
    },
    topics: ['romance'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'marry', name: 'Get Married', description: 'Marry your fiance(e). A small ceremony at home.', icon: 'star', category: 'romantic',
    minutes: 6, anim: 'agree', requires: { romantic: true, status: ['engaged'], minRomance: 60, minTrust: 40 }, acceptance: 0.9,
    success: out({
      actor: { romance: 10, friendship: 5, trust: 6 }, target: { romance: 10, friendship: 5, trust: 6 }, social: 25, fun: 10, actorMoodlet: 'newlywed', targetMoodlet: 'newlywed',
      memory: { kind: 'married', importance: 3, text: '{a} and {b} got married.' }, setStatus: 'spouse',
    }),
    failure: out({ social: 3, actorMoodlet: 'flustered', targetMoodlet: 'flustered' }),
    lines: {
      success: ['{a} and {b} say their vows. They are married.', '"I do." "I do." {a} and {b} are married.', 'Confetti and cheers for {a} and {b}.'],
      failure: ['{b} needs a little more time before the wedding.', 'The ceremony is postponed. {a} and {b} laugh it off.'],
    },
    topics: ['romance'], autonomy: { enabled: false, weight: 0 },
  }),
  social({
    id: 'breakUp', name: 'Break Up', description: 'End the relationship. It hurts, and it stays a major memory for both.', icon: 'warning', category: 'status', section: 'special',
    minutes: 4, anim: 'disagree', requires: { status: ['partner', 'engaged', 'spouse'] }, acceptance: 1, unilateral: true,
    success: out({
      actor: { romance: -45, friendship: -15, trust: -15 }, target: { romance: -55, friendship: -25, trust: -20 }, social: 0, actorMoodlet: 'remorseful', targetMoodlet: 'heartbroken',
      memory: { kind: 'breakup', importance: 3, text: '{a} and {b} ended their relationship.' }, setStatus: 'exPartner',
    }),
    failure: out({ social: 0 }),
    lines: {
      success: ['"I think we should end this, {b}." {b} stares at the floor.', '{a} says it quietly. It is over between {a} and {b}.', '{b} nods slowly, eyes wet. "I understand, {a}."'],
      failure: ['{a} cannot find the words.', '{b} stops {a} before they finish.'],
    },
    topics: ['romance', 'conflict'], autonomy: { enabled: false, weight: 0 },
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
    minutes: 4, anim: 'talk', requires: { minFamiliarity: 50, minFriendship: 65, minTrust: 25, status: ['friend'] }, acceptance: 0.75,
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

/**
 * Milestone 12, task O: weather-bound socials. Both are only offered in fitting weather and season (the menu greys
 * them with the reason, autonomy skips them); snowball fights need snow lying on the ground.
 */
const M12_OUTDOOR: SocialDef[] = [
  social({
    id: 'snowballFight', name: 'Have a Snowball Fight', description: 'Pack a snowball and let fly. Great fun for both, if a little cold.', icon: 'snow', category: 'funny',
    minutes: 15, anim: 'dance', requires: { minFamiliarity: 10 }, acceptance: 0.85,
    success: out({
      actor: { familiarity: 4, friendship: 5 }, target: { familiarity: 4, friendship: 5 }, social: 16, fun: 22,
      actorMoodlet: 'playtime', targetMoodlet: 'playtime',
    }),
    failure: out({ actor: { friendship: -1 }, target: { friendship: -2 }, social: 4, fun: 6, targetMoodlet: 'shocked' }),
    lines: {
      success: ['{a} catches {b} square in the shoulder. Snow everywhere, laughter louder.', '{a} and {b} pelt each other until they can barely stand up straight.', '{b} ducks behind the hedge. {a} waits, snowball ready.'],
      failure: ['{a}\'s snowball lands in a bush. {b} raises an eyebrow.', '"Not the face, {a}!" {b} brushes snow off their collar.'],
    },
    weather: { seasons: ['winter'], snowCover: true, outdoor: true },
    topics: ['play', 'snow'], autonomy: { enabled: true, weight: 0.9 },
  }),
  social({
    id: 'sharePicnic', name: 'Share a Picnic', description: 'Split the picnic blanket and the basket: a meal, some sun and good company.', icon: 'hunger', category: 'friendly',
    minutes: 30, anim: 'eat', requires: { minFamiliarity: 10 }, acceptance: 0.9,
    success: out({
      actor: { familiarity: 5, friendship: 4 }, target: { familiarity: 5, friendship: 4 }, social: 20, fun: 10, hunger: 28,
      actorMoodlet: 'picnicJoy', targetMoodlet: 'picnicJoy',
    }),
    failure: out({ social: 4, hunger: 8, actorMoodlet: 'awkward' }),
    lines: {
      success: ['{a} and {b} spread out the blanket and share the basket.', 'Sandwiches, fruit and a flask of something cold: {a} and {b} take their time.', '{b} passes {a} the last pastry. "Go on, you brought it."'],
      failure: ['{a} and {b} eat a little awkwardly side by side.', '"Is that... all for us?" {b} eyes the basket.'],
    },
    weather: { not: ['rain', 'snow'], seasons: ['spring', 'summer'] },
    topics: ['food', 'picnic'], autonomy: { enabled: true, weight: 0.6 },
  }),
];

/** Every social interaction. None of them is also counted as an activity (alsoActivity false). */
export const SOCIALS: SocialDef[] = [
  ...GREETING, ...FRIENDLY, ...FUNNY, ...DEEP_AND_SUPPORT, ...TRUST, ...MEAN, ...BETRAYAL, ...ROMANTIC, ...ROMANTIC_PLUS, ...STATUS, ...M12_OUTDOOR,
];
