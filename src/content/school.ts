// Milestone 8: the schools of children and teens. A school day has a schedule like a job shift (sim/school.ts): the pupil
// leaves for school ahead of the start, is away until the end, and is expected home afterwards with homework. Weekends and
// one week off after every four school weeks are holidays (sim/school.ts schoolHoliday).

import type { SchoolDef } from './types';

const WEEKDAYS = [0, 1, 2, 3, 4];
const h = (hours: number) => hours * 60;

export const SCHOOLS: SchoolDef[] = [
  {
    id: 'elementary', name: 'Willowbrook Elementary', icon: 'book', stages: ['child'], days: WEEKDAYS, start: h(8), end: h(14), status: 'ready',
    description: 'The neighbourhood primary school for children: reading, sums and playtime, Monday to Friday from 8:00 to 14:00.',
  },
  {
    id: 'high', name: 'Hillcrest High School', icon: 'star', stages: ['teen'], days: WEEKDAYS, start: h(8), end: h(15), status: 'ready',
    description: 'The high school for teenagers, Monday to Friday from 8:00 to 15:00, with a little more homework.',
  },
];
