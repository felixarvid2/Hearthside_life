// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md "Neighbourhood".
//
// Community events: things that happen at the public venues on a weekly calendar. The calendar is pure data (a weekday and a
// start time), so what is on is a function of the clock and needs no stored state. The townspeople turn out (sim/townlife.ts),
// and a household member who stays at least `attendMinutes` earns the reward once (sim/community.ts). Every event lies inside
// the opening hours of its venue type (checked by the content validator). Weekday 0 = Monday.

import type { CommunityEventDef } from './types';

const ev = (d: Omit<CommunityEventDef, 'status' | 'attendMinutes'> & { attendMinutes?: number }): CommunityEventDef => ({ status: 'ready', attendMinutes: 30, ...d });

export const COMMUNITY_EVENTS: CommunityEventDef[] = [
  ev({
    id: 'bookClub', name: 'Book Club', icon: 'book', venueType: 'library', weekday: 2, start: 17 * 60 + 30, minutes: 90,
    description: 'Neighbours talk about the book of the month in the reading room.', reward: { fun: 12, social: 25, friendship: 3 },
  }),
  ev({
    id: 'quizNight', name: 'Quiz Night', icon: 'star', venueType: 'cafe', weekday: 3, start: 18 * 60 + 30, minutes: 120,
    description: 'Teams, tea and terrible puns at the cafe.', reward: { fun: 20, social: 25, friendship: 3 },
  }),
  ev({
    id: 'openMic', name: 'Open Mic Night', icon: 'sound', venueType: 'arts', weekday: 4, start: 18 * 60, minutes: 120,
    description: 'Songs, poems and stand-up from anyone brave enough, at the arts centre.', reward: { fun: 22, social: 20, friendship: 3 },
  }),
  ev({
    id: 'makersMarket', name: "Makers' Market", icon: 'market', venueType: 'market', weekday: 5, start: 10 * 60, minutes: 180,
    description: 'Local makers set up stalls: bread, candles, ceramics and plants.', reward: { fun: 14, social: 18, friendship: 2 },
  }),
  ev({
    id: 'danceNight', name: 'Dance Night', icon: 'sound', venueType: 'arts', weekday: 5, start: 18 * 60, minutes: 150,
    description: 'A band, a caller and a floor full of beginners.', reward: { fun: 25, social: 25, friendship: 4 },
  }),
  ev({
    id: 'parkPicnic', name: 'Sunday Picnic', icon: 'park', venueType: 'park', weekday: 6, start: 12 * 60, minutes: 120,
    description: 'Everybody brings something to share on the lawn by the lake.', reward: { fun: 14, social: 25, friendship: 3 },
  }),
  ev({
    id: 'familySplash', name: 'Family Splash', icon: 'pool', venueType: 'pool', weekday: 6, start: 15 * 60, minutes: 120,
    description: 'Open swimming with floats, noodles and a lot of splashing.', reward: { fun: 22, social: 15, friendship: 2 },
  }),
];
