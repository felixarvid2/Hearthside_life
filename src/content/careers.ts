// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Career ladders. Workplaces are off-lot: a person walks to the lot entry, is at work for the shift and
// returns afterwards (src/sim). Conventions:
// - `days`: 0 = Monday ... 6 = Sunday; `start`/`end`: minutes after midnight, same day (no overnight shifts).
// - `hourlyWage` in cents, paid once per completed or partial shift for the minutes actually worked.
// - `promotion` on a level lists what is needed to be promoted FROM that level to the next one: career
//   performance (-100..100) at or above `performance`, the listed skill levels, and optionally a friendship
//   outside the household. The top level's promotion block is unreachable by design (performance 100 is the
//   cap) and is not used.
// - `perks` are short player-facing advantages shown on the career panel; they describe the flavour of the
//   level (the wage and schedule are the mechanical reward).
// Only careers with all ten levels are added here (brief section 11). Teenagers work the part-time jobs at the end
// of the list: three levels, lower pay, and shifts that start after school ends or fall on a weekend.

import type { CareerDef, CareerLevelDef } from './types';
import { dollars } from '../core/money';

const WEEKDAYS = [0, 1, 2, 3, 4];
const WED_SUN = [2, 3, 4, 5, 6];
const TUE_SAT = [1, 2, 3, 4, 5];
const MON_THU = [0, 1, 2, 3];
const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const level = (
  n: number, title: string, wage: number, days: number[], start: number, end: number, performance: number,
  skills: Record<string, number>, perks?: string[], relationship?: { minFriendship: number; label: string },
): CareerLevelDef => ({
  level: n, title, hourlyWage: dollars(wage), days, start, end,
  // Every promotion needs the level's number of days worked in the career as well as performance and skills.
  promotion: { performance, skills, days: n, ...(relationship ? { relationship } : {}) },
  ...(perks && perks.length ? { perks } : {}),
});

/** Every career definition. */
export const CAREERS: CareerDef[] = [
  {
    id: 'culinary',
    name: 'Culinary',
    description: 'From scrubbing pots to running your own celebrated kitchen. Promotions need strong shifts, Cooking skill and, higher up, the Charisma to lead a team.',
    icon: 'hunger',
    skills: ['cooking', 'charisma'],
    levels: [
      level(1, 'Dishwasher', 14, WEEKDAYS, h(10), h(16), 40, {}, ['Free staff meal each shift']),
      level(2, 'Prep Cook', 17, WEEKDAYS, h(9), h(16), 45, { cooking: 2 }),
      level(3, 'Line Cook', 21, WED_SUN, h(11), h(19), 50, { cooking: 3 }, ['A share of the tip jar']),
      level(4, 'Station Cook', 25, WED_SUN, h(11), h(19), 55, { cooking: 4, charisma: 2 }),
      level(5, 'Chef de Partie', 30, WED_SUN, h(12), h(20), 60, { cooking: 5, charisma: 3 }, ['Your name on the menu']),
      level(6, 'Sous Chef', 37, TUE_SAT, h(12), h(20), 65, { cooking: 6, charisma: 4 }, ['A dedicated prep station']),
      level(7, 'Head Chef', 45, TUE_SAT, h(13), h(21), 70, { cooking: 7, charisma: 5 }, ['You design the menu']),
      level(8, 'Executive Chef', 55, TUE_SAT, h(10), h(17), 75, { cooking: 8, charisma: 6 }, ['Profit share']),
      level(9, 'Culinary Director', 68, MON_THU, h(10), h(16), 80, { cooking: 9, charisma: 7 }, ['Company car']),
      level(10, 'Celebrated Restaurateur', 85, [0, 1, 2], h(11), h(16), 100, {}),
    ],
    status: 'ready',
  },
  {
    id: 'journalism',
    name: 'Journalism',
    description: 'Chase stories, build an audience and write your way to the editor\'s chair. Writing opens doors; Charisma gets interviews.',
    icon: 'book',
    skills: ['writing', 'charisma'],
    levels: [
      level(1, 'Copy Runner', 15, WEEKDAYS, h(9), h(15), 40, {}, ['Free newspaper']),
      level(2, 'Junior Reporter', 18, WEEKDAYS, h(9), h(16), 45, { writing: 2 }, ['Your first byline']),
      level(3, 'Staff Writer', 22, WEEKDAYS, h(10), h(17), 50, { writing: 3, charisma: 2 }),
      level(4, 'Feature Writer', 27, WEEKDAYS, h(10), h(17), 55, { writing: 4, charisma: 2 }, ['Choose your own assignments']),
      level(5, 'Columnist', 33, TUE_SAT, h(10), h(16), 60, { writing: 5, charisma: 3 }, ['A weekly column in your name']),
      level(6, 'Desk Editor', 40, WEEKDAYS, h(9), h(17), 65, { writing: 6, charisma: 4 }),
      level(7, 'Senior Editor', 48, WEEKDAYS, h(9), h(17), 70, { writing: 7, charisma: 5 }, ['A team of reporters']),
      level(8, 'Managing Editor', 58, WEEKDAYS, h(10), h(18), 75, { writing: 8, charisma: 6 }, ['Expense account']),
      level(9, 'Executive Editor', 70, MON_THU, h(10), h(16), 80, { writing: 9, charisma: 7 }),
      level(10, 'Editor-in-Chief', 82, [0, 1, 2], h(10), h(15), 100, {}, ['Your name on the masthead']),
    ],
    status: 'ready',
  },
  {
    id: 'software',
    name: 'Software',
    description: 'Ship code, survive the on-call rota and climb from support to the corner office. Programming and Logic carry you; every level pays well.',
    icon: 'chart',
    skills: ['programming', 'logic'],
    levels: [
      level(1, 'Support Technician', 16, WEEKDAYS, h(9), h(17), 40, {}, ['Free coffee and a decent chair']),
      level(2, 'Junior Developer', 22, WEEKDAYS, h(10), h(18), 45, { programming: 2 }),
      level(3, 'Developer', 28, WEEKDAYS, h(10), h(18), 50, { programming: 3, logic: 2 }, ['Remote Fridays']),
      level(4, 'Senior Developer', 35, WEEKDAYS, h(10), h(18), 55, { programming: 4, logic: 3 }),
      level(5, 'Tech Lead', 43, WEEKDAYS, h(10), h(18), 60, { programming: 5, logic: 4 }, ['You run the stand-up']),
      level(6, 'Engineering Manager', 52, WEEKDAYS, h(9), h(17), 65, { programming: 6, logic: 5 }, ['A team of your own']),
      level(7, 'Principal Engineer', 62, WEEKDAYS, h(10), h(18), 70, { programming: 7, logic: 6 }),
      level(8, 'Director of Engineering', 74, WEEKDAYS, h(9), h(17), 75, { programming: 8, logic: 7 }, ['Stock options']),
      level(9, 'Vice President', 86, MON_THU, h(9), h(16), 80, { programming: 9, logic: 8 }, ['Company car']),
      level(10, 'Chief Technology Officer', 100, [0, 1, 2], h(9), h(15), 100, {}, ['A seat on the board']),
    ],
    status: 'ready',
  },
  {
    id: 'medicine',
    name: 'Medicine',
    description: 'Care for patients, pass your exams and earn the trust of the hospital. Logic keeps you sharp; Charisma keeps patients calm.',
    icon: 'heart',
    skills: ['logic', 'charisma'],
    levels: [
      level(1, 'Clinic Aide', 15, TUE_SAT, h(8), h(14), 40, {}, ['Free check-ups']),
      level(2, 'Medical Assistant', 19, TUE_SAT, h(8), h(15), 45, { logic: 2 }),
      level(3, 'Student Nurse', 24, WED_SUN, h(7), h(15), 50, { logic: 3, charisma: 2 }, ['Staff canteen discount']),
      level(4, 'Staff Nurse', 30, WED_SUN, h(7), h(15), 55, { logic: 4, charisma: 3 }),
      level(5, 'Resident Doctor', 38, WED_SUN, h(7), h(17), 60, { logic: 5, charisma: 4 }, ['Your own patients']),
      level(6, 'Registrar', 47, TUE_SAT, h(7), h(16), 65, { logic: 6, charisma: 5 }, ['Hospital housing allowance']),
      level(7, 'Consultant', 58, TUE_SAT, h(8), h(16), 70, { logic: 7, charisma: 6 }, ['Private clinic hours']),
      level(8, 'Senior Consultant', 70, MON_THU, h(8), h(15), 75, { logic: 8, charisma: 7 }),
      level(9, 'Head of Department', 84, MON_THU, h(8), h(15), 80, { logic: 9, charisma: 8 }, ['A departmental budget']),
      level(10, 'Chief of Medicine', 100, [0, 1, 2], h(8), h(14), 100, {}, ['Your portrait in the lobby']),
    ],
    status: 'ready',
  },
  {
    id: 'music',
    name: 'Music',
    description: 'Play the small stages first, then the big ones. Music skill wins the crowd; Charisma wins the encore. Evening and weekend work.',
    icon: 'sound',
    skills: ['music', 'charisma'],
    levels: [
      level(1, 'Session Hand', 13, WED_SUN, h(17), h(23), 40, {}, ['Free entry to the club']),
      level(2, 'Support Act', 17, WED_SUN, h(17), h(23), 45, { music: 2 }),
      level(3, 'Club Performer', 22, WED_SUN, h(18), h(23), 50, { music: 3, charisma: 2 }, ['A regular slot']),
      level(4, 'Touring Musician', 28, [3, 4, 5, 6], h(16), h(23), 55, { music: 4, charisma: 3 }, ['Travel with the band']),
      level(5, 'Recording Artist', 35, [2, 3, 4, 5], h(14), h(22), 60, { music: 5, charisma: 4 }, ['Studio time']),
      level(6, 'Headliner', 43, [2, 3, 4, 5], h(15), h(23), 65, { music: 6, charisma: 5 }, ['Your name on the poster']),
      level(7, 'Chart Artist', 52, [1, 2, 3, 4], h(14), h(22), 70, { music: 7, charisma: 6 }, ['Royalties on every play']),
      level(8, 'Award Winner', 63, [1, 2, 3], h(13), h(21), 75, { music: 8, charisma: 7 }, ['A shelf of trophies']),
      level(9, 'Label Owner', 76, MON_THU, h(11), h(18), 80, { music: 9, charisma: 8 }, ['Your own label']),
      level(10, 'Legend of the Stage', 92, [0, 1, 2], h(12), h(18), 100, {}, ['Sold-out arenas']),
    ],
    status: 'ready',
  },
  {
    id: 'business',
    name: 'Business',
    description: 'Start in the mailroom and network your way up. Charisma opens doors, Logic closes deals, and a good contact can make your career.',
    icon: 'briefcase',
    skills: ['charisma', 'logic'],
    levels: [
      level(1, 'Mailroom Clerk', 16, WEEKDAYS, h(9), h(17), 40, {}, ['A company coffee card']),
      level(2, 'Office Assistant', 20, WEEKDAYS, h(9), h(17), 45, { charisma: 2 }),
      level(3, 'Sales Associate', 25, WEEKDAYS, h(9), h(17), 50, { charisma: 3 }, ['Commission on sales']),
      level(4, 'Account Manager', 31, WEEKDAYS, h(9), h(18), 55, { charisma: 4, logic: 2 }, ['Your own client list'],
        { minFriendship: 25, label: 'a business contact (friendship 25)' }),
      level(5, 'Sales Director', 38, WEEKDAYS, h(9), h(18), 60, { charisma: 5, logic: 3 }, ['A company phone']),
      level(6, 'Regional Manager', 46, WEEKDAYS, h(9), h(18), 65, { charisma: 6, logic: 4 }, ['A regional team']),
      level(7, 'Vice President', 56, WEEKDAYS, h(9), h(17), 70, { charisma: 7, logic: 5 }, ['Profit share']),
      level(8, 'Chief Operating Officer', 68, WEEKDAYS, h(9), h(17), 75, { charisma: 8, logic: 6 }, ['Company car']),
      level(9, 'Chief Executive', 82, MON_THU, h(9), h(16), 80, { charisma: 9, logic: 7 }, ['A seat on the board']),
      level(10, 'Chair of the Board', 98, [0, 1, 2], h(10), h(15), 100, {}, ['Your name on the building']),
    ],
    status: 'ready',
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    description: 'Work outdoors with your hands and grow a business from the soil up. Gardening shapes the work; Fitness keeps you going.',
    icon: 'sparkle',
    skills: ['gardening', 'fitness'],
    levels: [
      level(1, 'Garden Helper', 14, TUE_SAT, h(8), h(14), 40, {}, ['Fresh air and a free plant cutting']),
      level(2, 'Groundskeeper', 18, TUE_SAT, h(7), h(14), 45, { gardening: 2 }),
      level(3, 'Gardener', 23, TUE_SAT, h(7), h(15), 50, { gardening: 3, fitness: 2 }, ['Use of the company tools']),
      level(4, 'Head Gardener', 29, WED_SUN, h(7), h(15), 55, { gardening: 4, fitness: 2 }),
      level(5, 'Landscape Designer', 36, WED_SUN, h(8), h(16), 60, { gardening: 5, fitness: 3 }, ['You plan the gardens']),
      level(6, 'Project Supervisor', 44, WEEKDAYS, h(8), h(16), 65, { gardening: 6, fitness: 4 }, ['A crew of your own']),
      level(7, 'Landscape Architect', 53, WEEKDAYS, h(8), h(17), 70, { gardening: 7, fitness: 5 }, ['Design fees']),
      level(8, 'Contracts Manager', 63, WEEKDAYS, h(8), h(17), 75, { gardening: 8, fitness: 6 }),
      level(9, 'Director of Grounds', 75, MON_THU, h(8), h(16), 80, { gardening: 9, fitness: 7 }, ['Company truck']),
      level(10, 'Botanical Garden Curator', 88, [0, 1, 2], h(9), h(15), 100, {}, ['A garden named after you']),
    ],
    status: 'ready',
  },

  // ---------------------------------------------------------------------------------------------
  // Milestone 11: six more ten-level tracks so every career in brief section 11 exists
  // (Education, Visual Arts, Science, Athletics, Design and Architecture, Hospitality). The brief's
  // Photography, Wellness, Creativity and Research skills live in the higher promotion steps only,
  // so a new hire can climb the first few levels with the skills that already have practice
  // activities; those skills still train on every shift through CareerDef.skills.
  // ---------------------------------------------------------------------------------------------
  {
    id: 'education',
    name: 'Education',
    description: 'Help young minds grow, then run the school that does it. Charisma wins the classroom; Logic builds the lessons. Weekdays only, with the school holidays off.',
    icon: 'book',
    skills: ['charisma', 'logic'],
    levels: [
      level(1, 'Playground Assistant', 16, WEEKDAYS, h(8), h(14, 30), 40, {}, ['School holidays off']),
      level(2, 'Teaching Assistant', 20, WEEKDAYS, h(8), h(14, 30), 45, { charisma: 2 }, ['Your own reading group']),
      level(3, 'Classroom Aide', 24, WEEKDAYS, h(8), h(15), 50, { charisma: 3, logic: 2 }),
      level(4, 'Substitute Teacher', 29, WEEKDAYS, h(8), h(15), 55, { charisma: 4, logic: 2 }, ['You can pick your schools']),
      level(5, 'Teacher', 35, WEEKDAYS, h(8), h(15, 30), 60, { charisma: 5, logic: 3 }, ['Your own classroom']),
      level(6, 'Subject Lead', 43, WEEKDAYS, h(8), h(15, 30), 65, { charisma: 6, logic: 4 }, ['A budget for classroom books'],
        { minFriendship: 30, label: 'a trusted colleague (friendship 30)' }),
      level(7, 'Head of Year', 52, WEEKDAYS, h(8), h(16), 70, { charisma: 7, logic: 5 }, ['You shape the school calendar']),
      level(8, 'Vice Principal', 62, WEEKDAYS, h(8), h(16), 75, { charisma: 8, logic: 6 }),
      level(9, 'Principal', 76, MON_THU, h(8), h(16), 80, { charisma: 9, logic: 7 }, ['A school of your own']),
      level(10, 'Superintendent of Schools', 92, [0, 1, 2], h(9), h(15), 100, {}, ['A seat on the school board']),
    ],
    status: 'ready',
  },
  {
    id: 'visualArts',
    name: 'Visual Arts',
    description: 'From stretching canvases to a retrospective in the city gallery. Painting carries the work; Photography and Creativity open the higher doors. Studio days, Tuesday to Saturday at first.',
    icon: 'arts',
    skills: ['painting', 'photography', 'creativity'],
    levels: [
      level(1, 'Studio Assistant', 13, TUE_SAT, h(10), h(17), 40, {}, ['Free studio materials']),
      level(2, 'Gallery Attendant', 16, TUE_SAT, h(10), h(17), 45, { painting: 2 }),
      level(3, 'Art Technician', 20, TUE_SAT, h(10), h(18), 50, { painting: 3 }, ['You stretch your own canvases']),
      level(4, 'Illustrator', 26, TUE_SAT, h(10), h(18), 55, { painting: 4, photography: 2 }, ['Art supplies on the studio tab']),
      level(5, 'Exhibiting Artist', 32, WED_SUN, h(11), h(19), 60, { painting: 5, creativity: 2, photography: 2 }, ['Your first solo show']),
      level(6, 'Portrait Artist', 39, WED_SUN, h(11), h(19), 65, { painting: 6, creativity: 3, photography: 3 }, ['Commissions come to you']),
      level(7, 'Gallery Curator', 48, WED_SUN, h(10), h(18), 70, { painting: 7, creativity: 4, photography: 4 }, ['You choose what hangs on the walls'],
        { minFriendship: 30, label: 'a gallery contact (friendship 30)' }),
      level(8, 'Art Director', 58, WEEKDAYS, h(10), h(18), 75, { painting: 8, creativity: 5, photography: 5 }),
      level(9, 'Creative Director', 70, MON_THU, h(10), h(17), 80, { painting: 9, creativity: 6, photography: 6 }, ['Your name on the studio door']),
      level(10, 'Renowned Artist', 86, [0, 1, 2], h(11), h(17), 100, {}, ['A retrospective in the city gallery']),
    ],
    status: 'ready',
  },
  {
    id: 'science',
    name: 'Science',
    description: 'Run experiments, publish papers and build a lab worth funding. Logic keeps the method sound, Programming runs the analysis and Research finds the next question. Weekday hours.',
    icon: 'search',
    skills: ['logic', 'programming', 'research'],
    levels: [
      level(1, 'Lab Assistant', 17, WEEKDAYS, h(9), h(17), 40, {}, ['Lab coat and safety goggles']),
      level(2, 'Research Assistant', 21, WEEKDAYS, h(9), h(17), 45, { logic: 2 }),
      level(3, 'Technician', 26, WEEKDAYS, h(9), h(17, 30), 50, { logic: 3, programming: 2 }, ['Your own bench']),
      level(4, 'Junior Researcher', 32, WEEKDAYS, h(9), h(17, 30), 55, { logic: 4, programming: 2 }, ['A small research budget']),
      level(5, 'Research Scientist', 39, WEEKDAYS, h(9), h(18), 60, { logic: 5, programming: 3, research: 2 }, ['Your name on a paper']),
      level(6, 'Senior Scientist', 48, WEEKDAYS, h(9), h(18), 65, { logic: 6, programming: 4, research: 3 }, ['You lead a project']),
      level(7, 'Principal Scientist', 58, WEEKDAYS, h(9), h(18), 70, { logic: 7, programming: 5, research: 4 }, ['A team of researchers'],
        { minFriendship: 25, label: 'a peer reviewer (friendship 25)' }),
      level(8, 'Lab Director', 70, WEEKDAYS, h(9), h(17), 75, { logic: 8, programming: 6, research: 5 }),
      level(9, 'Science Director', 84, MON_THU, h(9), h(17), 80, { logic: 9, programming: 7, research: 6 }, ['The whole institute reports to you']),
      level(10, 'Nobel Laureate', 102, [0, 1, 2], h(10), h(16), 100, {}, ['A medal and a very long speech']),
    ],
    status: 'ready',
  },
  {
    id: 'athletics',
    name: 'Athletics',
    description: 'Train before the sun is up and turn a love of movement into a career. Fitness does the work, Wellness keeps you in one piece. Early-morning shifts, with longer weeks as you climb.',
    icon: 'gym',
    skills: ['fitness', 'wellness'],
    levels: [
      level(1, 'Gym Attendant', 15, WEEKDAYS, h(6), h(10), 40, {}, ['Free gym membership']),
      level(2, 'Fitness Instructor', 19, [0, 1, 2, 3, 4, 5], h(6), h(10), 45, { fitness: 2 }),
      level(3, 'Personal Trainer', 24, [0, 1, 2, 3, 4, 5], h(6), h(11), 50, { fitness: 3 }, ['Clients book you out']),
      level(4, 'Team Coach', 30, [0, 1, 2, 3, 5], h(6), h(11, 30), 55, { fitness: 4, wellness: 2 }, ['A whistle and a clipboard']),
      level(5, 'Head Coach', 37, TUE_SAT, h(6), h(12), 60, { fitness: 5, wellness: 3 }, ['You pick the starting line-up']),
      level(6, 'Performance Analyst', 45, TUE_SAT, h(7), h(13), 65, { fitness: 6, wellness: 4 }, ['Sport science support']),
      level(7, 'Sports Director', 54, MON_THU, h(7), h(14), 70, { fitness: 7, wellness: 5 }, ['You run the whole programme'],
        { minFriendship: 30, label: 'a team sponsor (friendship 30)' }),
      level(8, 'Academy Manager', 65, MON_THU, h(7), h(14), 75, { fitness: 8, wellness: 6 }),
      level(9, 'Club Director', 78, MON_THU, h(8), h(15), 80, { fitness: 9, wellness: 7 }, ['Your club, your rules']),
      level(10, 'Olympic Champion', 95, [0, 1, 2], h(8), h(13), 100, {}, ['A lap of honour']),
    ],
    status: 'ready',
  },
  {
    id: 'design',
    name: 'Design and Architecture',
    description: 'Draw, model and build the places people live in. Handiness keeps the drawings honest and Creativity gives them a soul. Studio weekdays, with site days later on.',
    icon: 'build',
    skills: ['creativity', 'handiness'],
    levels: [
      level(1, 'Drafting Assistant', 15, WEEKDAYS, h(9), h(17), 40, {}, ['A company drawing board']),
      level(2, 'Junior Drafter', 19, WEEKDAYS, h(9), h(17), 45, { handiness: 2 }),
      level(3, 'CAD Technician', 24, WEEKDAYS, h(9), h(17, 30), 50, { handiness: 3 }, ['A licence for the good software']),
      level(4, 'Interior Designer', 30, WEEKDAYS, h(9), h(17, 30), 55, { handiness: 4, creativity: 2 }, ['Clients bring you mood boards']),
      level(5, 'Project Designer', 37, TUE_SAT, h(9), h(18), 60, { handiness: 5, creativity: 3 }, ['You sign off the plans']),
      level(6, 'Architect', 45, TUE_SAT, h(9), h(18), 65, { handiness: 6, creativity: 4 }, ['Your first finished building']),
      level(7, 'Senior Architect', 55, WEEKDAYS, h(9), h(18), 70, { handiness: 7, creativity: 5 }, ['A studio of your own'],
        { minFriendship: 25, label: 'a satisfied client (friendship 25)' }),
      level(8, 'Design Principal', 66, WEEKDAYS, h(9), h(18), 75, { handiness: 8, creativity: 6 }),
      level(9, 'Studio Director', 79, MON_THU, h(9), h(17), 80, { handiness: 9, creativity: 7 }, ['You choose the projects']),
      level(10, 'Celebrated Architect', 94, [0, 1, 2], h(10), h(16), 100, {}, ['A building with your name on it']),
    ],
    status: 'ready',
  },
  {
    id: 'hospitality',
    name: 'Hospitality',
    description: 'Look after people at their table, then run the room and the whole hotel group. Cooking and Charisma share the load. Evenings and weekends, when the guests arrive.',
    icon: 'cafe',
    skills: ['cooking', 'charisma'],
    levels: [
      level(1, 'Front Desk Assistant', 13, WED_SUN, h(16), h(22), 40, {}, ['A free meal on shift']),
      level(2, 'Server', 17, WED_SUN, h(16), h(22), 45, { cooking: 2 }),
      level(3, 'Bartender', 21, WED_SUN, h(16), h(23), 50, { cooking: 3, charisma: 2 }, ['A share of the tip pool']),
      level(4, 'Shift Supervisor', 26, [3, 4, 5, 6], h(15), h(23), 55, { cooking: 4, charisma: 2 }, ['You close the till']),
      level(5, 'Assistant Manager', 32, [3, 4, 5, 6], h(15), h(23), 60, { cooking: 5, charisma: 3 }, ['A say in the menu']),
      level(6, 'Restaurant Manager', 40, WED_SUN, h(14), h(23), 65, { cooking: 6, charisma: 4 }, ['You hire the kitchen team']),
      level(7, 'Guest Experience Manager', 48, WED_SUN, h(14), h(23), 70, { cooking: 7, charisma: 5 }, ['Regulars ask for you'],
        { minFriendship: 30, label: 'a regular guest (friendship 30)' }),
      level(8, 'Hotel Manager', 58, [4, 5, 6], h(10), h(20), 75, { cooking: 8, charisma: 6 }),
      level(9, 'Regional Director', 70, MON_THU, h(11), h(19), 80, { cooking: 9, charisma: 7 }, ['A portfolio of venues']),
      level(10, 'Hospitality Magnate', 84, [0, 1, 2], h(12), h(19), 100, {}, ['Your own hotel group']),
    ],
    status: 'ready',
  },

  // ---------------------------------------------------------------------------------------------
  // Part-time jobs for teenagers (Milestone 8 gap). Three levels each, teen-only, paid less than
  // any adult entry job. Weekday shifts begin at 16:00 or later (high school ends at 15:00); the
  // lifeguard works weekend mornings, when there is no school.
  // ---------------------------------------------------------------------------------------------
  {
    id: 'cafeHelper',
    name: 'Kettle & Crumb Cafe',
    description: 'Clear tables, take orders and learn the coffee machine after school. Weekday evenings, with shifts from 4:00 to 7:30 PM.',
    icon: 'hunger',
    skills: ['cooking', 'charisma'],
    partTime: true,
    levels: [
      level(1, 'Trainee Barista', 7, WEEKDAYS, h(16), h(19, 30), 40, {}, ['A free hot drink each shift']),
      level(2, 'Cafe Helper', 9, WEEKDAYS, h(16), h(19, 30), 50, { cooking: 2 }),
      level(3, 'Shift Barista', 11, WEEKDAYS, h(16), h(19, 30), 55, {}, ['You lock up on a Friday']),
    ],
    status: 'ready',
  },
  {
    id: 'shelfStocker',
    name: 'Greengage Market',
    description: 'Fill the shelves and help customers after school on weekday evenings, from 4:30 to 8:00 PM.',
    icon: 'money',
    skills: ['logic', 'handiness'],
    partTime: true,
    levels: [
      level(1, 'Stockroom Assistant', 7, WEEKDAYS, h(16, 30), h(20), 40, {}, ['A staff discount at the market']),
      level(2, 'Shelf Stocker', 8, WEEKDAYS, h(16, 30), h(20), 50, { logic: 2 }),
      level(3, 'Floor Supervisor', 10, WEEKDAYS, h(16, 30), h(20), 55, {}, ['You arrange the window display']),
    ],
    status: 'ready',
  },
  {
    id: 'lifeguard',
    name: 'Lakeside Pool',
    description: 'Watch the water and keep the pool tidy on weekend mornings, from 9:00 AM to 1:00 PM. Fitness helps.',
    icon: 'energy',
    skills: ['fitness', 'logic'],
    partTime: true,
    levels: [
      level(1, 'Pool Attendant', 8, [5, 6], h(9), h(13), 40, {}, ['Free entry to the pool']),
      level(2, 'Junior Lifeguard', 10, [5, 6], h(9), h(13), 50, { fitness: 3 }),
      level(3, 'Senior Lifeguard', 12, [5, 6], h(9), h(13), 55, {}, ['You brief the other lifeguards']),
    ],
    status: 'ready',
  },
  {
    id: 'dogWalker',
    name: 'Happy Tails Dog Walking',
    description: 'Walk the neighbourhood dogs on Monday, Wednesday and Friday afternoons, from 4:00 to 7:00 PM.',
    icon: 'people',
    skills: ['charisma', 'fitness'],
    partTime: true,
    levels: [
      level(1, 'Dog Walker', 7, [0, 2, 4], h(16), h(19), 40, {}, ['The dogs know you by name']),
      level(2, 'Reliable Dog Walker', 9, [0, 2, 4], h(16), h(19), 50, { charisma: 2 }),
      level(3, 'Dog Walking Pro', 11, [0, 2, 4], h(16), h(19), 55, {}, ['Clients ask for you by name']),
    ],
    status: 'ready',
  },
];
