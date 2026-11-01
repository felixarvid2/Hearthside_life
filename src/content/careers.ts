// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Career ladders. Workplaces are off-lot in Milestone 1: a person walks to the lot entry, is at work for the
// shift and returns afterwards (src/sim). Conventions:
// - `days`: 0 = Monday ... 6 = Sunday; `start`/`end`: minutes after midnight, same day (no overnight shifts).
// - `hourlyWage` in cents, paid once per completed or partial shift for the minutes actually worked.
// - `promotion` on a level lists what is needed to be promoted FROM that level to the next one: career
//   performance (-100..100) at or above `performance` plus the listed skill levels. The top level's
//   promotion block is unreachable by design (performance 100 is the cap) and is not used.
// Only careers with all ten levels are added here (brief section 11).

import type { CareerDef, CareerLevelDef } from './types';
import { dollars } from '../core/money';

const WEEKDAYS = [0, 1, 2, 3, 4];
const WED_SUN = [2, 3, 4, 5, 6];
const TUE_SAT = [1, 2, 3, 4, 5];
const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const level = (n: number, title: string, wage: number, days: number[], start: number, end: number, performance: number, skills: Record<string, number>): CareerLevelDef =>
  ({ level: n, title, hourlyWage: dollars(wage), days, start, end, promotion: { performance, skills } });

/** Every career definition. */
export const CAREERS: CareerDef[] = [
  {
    id: 'culinary',
    name: 'Culinary',
    description: 'From scrubbing pots to running your own celebrated kitchen. Promotions need strong shifts, cooking skill and, higher up, the charisma to lead a team.',
    icon: 'hunger',
    skills: ['cooking', 'charisma'],
    levels: [
      level(1, 'Dishwasher', 14, WEEKDAYS, h(10), h(16), 40, {}),
      level(2, 'Prep Cook', 17, WEEKDAYS, h(9), h(16), 45, { cooking: 2 }),
      level(3, 'Line Cook', 21, WED_SUN, h(11), h(19), 50, { cooking: 3 }),
      level(4, 'Station Cook', 25, WED_SUN, h(11), h(19), 55, { cooking: 4, charisma: 2 }),
      level(5, 'Chef de Partie', 30, WED_SUN, h(12), h(20), 60, { cooking: 5, charisma: 3 }),
      level(6, 'Sous Chef', 37, TUE_SAT, h(12), h(20), 65, { cooking: 6, charisma: 4 }),
      level(7, 'Head Chef', 45, TUE_SAT, h(13), h(21), 70, { cooking: 7, charisma: 5 }),
      level(8, 'Executive Chef', 55, TUE_SAT, h(10), h(17), 75, { cooking: 8, charisma: 6 }),
      level(9, 'Culinary Director', 68, [0, 1, 2, 3], h(10), h(16), 80, { cooking: 9, charisma: 7 }),
      level(10, 'Celebrated Restaurateur', 85, [0, 1, 2], h(11), h(16), 100, {}),
    ],
    status: 'ready',
  },
];
