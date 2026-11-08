// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md "Relationships and events (Milestone 5)".
//
// Social event types. The simulation (src/sim/events.ts) runs them: an event has invited guests, a start and an
// end, goals the guests and hosts work through, a score from goal progress, attendance and mood, and a reward
// scaled by the resulting rating (poor 0.. / fair / good / great). The reward is applied once.
// Planned types are offered on the phone; visits, welcome wagons, drop-ins and reconciliations start by themselves.
// Goal kinds: chat (accepted friendly/support/deep talk between participants), eat (people eating the shared
// food), romantic (an accepted romantic social), laugh (an accepted joke or tease), mingle (distinct pairs of
// participants talking), reconcile (an accepted apology or make-up), ceremony (the wedding vows were exchanged).
// A wedding runs in two stages: the ceremony (the couple marries `ceremonyMinutes` after the start) and the celebration.

import type { EventDef, EventGoalDef, EventRewardDef } from './types';

const goal = (kind: EventGoalDef['kind'], text: string, target: number, weight: number, perGuest?: number): EventGoalDef =>
  ({ kind, text, target, weight, ...(perGuest !== undefined ? { perGuest } : {}) });

const reward = (r: Partial<EventRewardDef> & Pick<EventRewardDef, 'moodlet' | 'badMoodlet' | 'memory'>): EventRewardDef =>
  ({ friendship: 6, trust: 2, romance: 0, social: 25, fun: 10, ...r });

const event = (d: Omit<EventDef, 'status' | 'romantic'> & { romantic?: boolean }): EventDef => ({ romantic: false, status: 'ready', ...d });

export const EVENTS: EventDef[] = [
  event({
    venueOk: true, id: 'date', name: 'Date', icon: 'heart', planned: true, minGuests: 1, maxGuests: 1, minutes: 150, leadMinutes: 45,
    description: 'A quiet evening for two, at home or out at a venue: dinner, conversation and a little romance. Both of you must be adults who are interested in each other.',
    cateringPerPerson: 1400, romantic: true,
    goals: [goal('chat', 'Talk with each other', 2, 1.2), goal('eat', 'Share dinner', 2, 1), goal('romantic', 'Share a romantic moment', 1, 1.6)],
    reward: reward({
      friendship: 5, trust: 3, romance: 12, social: 30, fun: 12, moodlet: 'greatDateGlow', badMoodlet: 'awkwardDate',
      memory: { kind: 'greatDate', badKind: 'badDate', text: 'A wonderful evening at home with {b}.', badText: 'The date with {b} never really got going.', importance: 3 },
    }),
  }),
  event({
    venueOk: true, id: 'dinnerParty', name: 'Dinner Party', icon: 'hunger', planned: true, minGuests: 2, maxGuests: 4, minutes: 180, leadMinutes: 60,
    description: 'Invite two to four friends for a sit-down dinner. Good food and conversation make the evening.',
    cateringPerPerson: 1200,
    goals: [goal('eat', 'Everyone eats', 3, 1.2, 1), goal('chat', 'Keep the conversation going', 3, 1, 1.5), goal('mingle', 'Get guests talking to each other', 1, 0.8, 0.5)],
    reward: reward({
      friendship: 6, trust: 2, social: 30, fun: 10, moodlet: 'partyGlow', badMoodlet: 'flatParty',
      memory: { kind: 'party', text: 'A lovely dinner party at home.', badText: 'The dinner party fell a bit flat.', importance: 2 },
    }),
  }),
  event({
    id: 'houseParty', name: 'House Party', icon: 'sound', planned: true, minGuests: 3, maxGuests: 6, minutes: 210, leadMinutes: 90,
    description: 'Three to six guests, snacks and loud laughter. The more people mingle and laugh, the better the party.',
    cateringPerPerson: 900,
    goals: [goal('mingle', 'Get everyone mingling', 2, 1.2, 1), goal('laugh', 'Share some laughs', 2, 1, 0.7), goal('eat', 'Snacks for everyone', 2, 0.8, 0.8), goal('chat', 'Good conversations', 3, 0.8, 1)],
    reward: reward({
      friendship: 7, trust: 1, social: 40, fun: 25, moodlet: 'partyGlow', badMoodlet: 'flatParty',
      memory: { kind: 'party', text: 'A great house party.', badText: 'The house party was a letdown.', importance: 2 },
    }),
  }),
  event({
    venueOk: true, id: 'celebration', name: 'Celebration', icon: 'star', planned: true, minGuests: 1, maxGuests: 5, minutes: 150, leadMinutes: 60,
    description: 'A birthday-style celebration for the first guest on the list, with cake and company.',
    cateringPerPerson: 1000,
    goals: [goal('eat', 'Cake for everyone', 2, 1, 1), goal('laugh', 'Make the guest of honour laugh', 1, 1, 0.5), goal('chat', 'Chat with the guests', 2, 1, 1)],
    reward: reward({
      friendship: 9, trust: 3, social: 35, fun: 18, moodlet: 'partyGlow', badMoodlet: 'flatParty',
      memory: { kind: 'party', text: 'A cheerful celebration at home.', badText: 'The celebration did not go to plan.', importance: 2 },
    }),
  }),
  event({
    venueOk: true, id: 'wedding', name: 'Wedding', icon: 'heart', planned: true, minGuests: 1, maxGuests: 9, minutes: 240, leadMinutes: 240,
    description: 'Marry your fiance(e) in a ceremony, then celebrate with the guests. The first person you invite is the one you marry, so you must be engaged. Everyone eats cake and dances afterwards.',
    cateringPerPerson: 1800, wedding: true, ceremonyMinutes: 30,
    goals: [goal('ceremony', 'Exchange vows', 1, 2.2), goal('eat', 'Cake for everyone', 3, 1, 1), goal('mingle', 'Get the guests mingling', 1, 0.8, 0.5), goal('laugh', 'Share some laughs', 2, 0.7, 0.4), goal('chat', 'Congratulate the couple', 2, 0.9, 0.8)],
    reward: reward({
      friendship: 8, trust: 3, social: 40, fun: 25, moodlet: 'partyGlow', badMoodlet: 'flatParty',
      memory: { kind: 'party', text: 'The wedding of {a} and {b}.', badText: 'The wedding was a bit of a letdown.', importance: 3 },
    }),
  }),
  event({
    id: 'visit', name: 'Visit', icon: 'home', planned: false, minGuests: 1, maxGuests: 1, minutes: 150, leadMinutes: 0,
    description: 'A friend you invited by phone comes over, stays a while and goes home.',
    cateringPerPerson: 0,
    goals: [goal('chat', 'Make time to talk', 2, 1)],
    reward: reward({
      friendship: 3, trust: 1, social: 15, fun: 5, moodlet: 'goodVisit', badMoodlet: 'coldVisit',
      memory: { kind: 'visit', text: '{b} came over for a visit.', badText: '{b} left early.', importance: 1 },
    }),
  }),
  event({
    id: 'welcomeWagon', name: 'Welcome Wagon', icon: 'people', planned: false, minGuests: 1, maxGuests: 4, minutes: 150, leadMinutes: 0,
    description: 'The neighbours drop by to welcome the new household.',
    cateringPerPerson: 0,
    goals: [goal('chat', 'Greet the neighbours', 2, 1)],
    reward: reward({
      friendship: 4, trust: 2, social: 18, fun: 6, moodlet: 'goodVisit', badMoodlet: 'coldVisit',
      memory: { kind: 'visit', text: '{b} welcomed the household to the street.', badText: '{b} left without much of a chat.', importance: 1 },
    }),
  }),
  event({
    id: 'dropIn', name: 'Unexpected Visitor', icon: 'bell', planned: false, minGuests: 1, maxGuests: 1, minutes: 120, leadMinutes: 0,
    description: 'Somebody you know drops by unannounced.',
    cateringPerPerson: 0,
    goals: [goal('chat', 'Be a good host', 1, 1)],
    reward: reward({
      friendship: 3, trust: 1, social: 12, fun: 4, moodlet: 'goodVisit', badMoodlet: 'coldVisit',
      memory: { kind: 'visit', text: '{b} dropped by.', badText: '{b} dropped by but left quickly.', importance: 1 },
    }),
  }),
  event({
    id: 'reconciliation', name: 'Clearing the Air', icon: 'check', planned: false, minGuests: 1, maxGuests: 1, minutes: 120, leadMinutes: 0,
    description: 'Somebody you fell out with comes by to talk. An honest apology could repair things.',
    cateringPerPerson: 0,
    goals: [goal('reconcile', 'Make up', 1, 3), goal('chat', 'Talk it through', 1, 1)],
    reward: reward({
      friendship: 12, trust: 8, social: 20, fun: 4, moodlet: 'reconciledGlow', badMoodlet: 'unresolved',
      memory: { kind: 'reconciled', badKind: 'argument', text: '{a} and {b} cleared the air.', badText: '{b} left angry; nothing was resolved.', importance: 2 },
    }),
  }),
];
