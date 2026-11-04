// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Small on-the-job decisions. At the start of some shifts the simulation offers one of these; the player
// chooses an option in the person panel's Career tab. The choice changes performance, may add or cost a little
// money and can grant skill experience. If nothing is chosen by the end of the shift the first option happens.

import type { CareerEventDef } from './types';
import { dollars } from '../core/money';

/** Every career event definition. */
export const CAREER_EVENTS: CareerEventDef[] = [
  {
    id: 'cover-shift',
    title: 'A colleague calls in sick',
    text: 'The shift is short-handed and the supervisor asks whether you can cover the busy section.',
    options: [
      {
        id: 'cover', label: 'Cover the shift', description: 'More performance, but a long day.',
        performance: 5, pay: dollars(35), moodlet: 'workPraise', result: 'covered the busy section and earned a little extra.',
      },
      {
        id: 'decline', label: 'Say no', description: 'Keep your energy. The supervisor notices.',
        performance: -2, result: 'declined to cover the shift.',
      },
    ],
  },
  {
    id: 'difficult-customer',
    title: 'A difficult customer',
    text: 'Someone is unhappy and getting louder. Everyone is looking at you.',
    options: [
      {
        id: 'calm', label: 'Calm them down', description: 'Chance to shine if you keep your head.',
        performance: 4, result: 'calmed an upset customer and kept the room calm.',
      },
      {
        id: 'manager', label: 'Fetch the manager', description: 'Safe, but it does not show initiative.',
        performance: 0, result: 'handed a difficult customer to the manager.',
      },
      {
        id: 'argue', label: 'Argue back', description: 'Satisfying for a moment. Bad for the review.',
        performance: -5, pay: dollars(-10), moodlet: 'workBlunder', result: 'argued with a customer and lost their temper.',
      },
    ],
  },
  {
    id: 'extra-training',
    title: 'A training session',
    text: 'A senior colleague is running an optional session after the shift. It is unpaid, but useful.',
    options: [
      {
        id: 'attend', label: 'Stay and learn', description: 'A little skill experience, no pay.',
        performance: 2, skill: { id: 'charisma', xp: 60 }, result: 'stayed late for extra training.',
      },
      {
        id: 'home', label: 'Go home', description: 'Rest instead.',
        performance: 0, result: 'skipped the optional training.',
      },
    ],
  },
  {
    id: 'mistake',
    title: 'A small mistake',
    text: 'You spot a mistake you made earlier. Nobody has noticed yet.',
    options: [
      {
        id: 'own', label: 'Own up and fix it', description: 'Honest, and it costs a little to put right.',
        performance: 3, pay: dollars(-15), result: 'owned up to a mistake and fixed it.',
      },
      {
        id: 'hide', label: 'Hide it', description: 'Hope nobody checks.',
        performance: -4, moodlet: 'workBlunder', result: 'hid a mistake at work.',
      },
    ],
  },
  {
    id: 'praise',
    title: 'The boss notices',
    text: 'Your work has been getting attention. The boss asks to see you for a moment.',
    options: [
      {
        id: 'modest', label: 'Share the credit', description: 'The team likes you for it.',
        performance: 3, moodlet: 'workPraise', result: 'shared credit for a job well done.',
      },
      {
        id: 'bold', label: 'Ask for more responsibility', description: 'Confident. It could pay off.',
        performance: 5, pay: dollars(20), result: 'asked for more responsibility and got it.',
      },
    ],
  },
  // ---------------------------------------------------------------------------------------------
  // Milestone 11: two decisions each for the six careers added with the twelve-track scope. The
  // simulation offers one event per shift from the whole pool, so these read as moments that could
  // happen in any workplace, coloured by the career they were written for.
  // ---------------------------------------------------------------------------------------------
  {
    id: 'mentor-student',
    title: 'A student needs help',
    text: 'A student stays behind after class, stuck on the same problem. The room is already emptying.',
    options: [
      {
        id: 'stay', label: 'Stay and explain it', description: 'A little longer at school, but the lesson lands.',
        performance: 4, skill: { id: 'charisma', xp: 60 }, result: 'stayed behind to help a struggling student.',
      },
      {
        id: 'tomorrow', label: 'Offer to help tomorrow', description: 'Set a time and keep the evening.',
        performance: 1, result: 'arranged to help a student before class tomorrow.',
      },
    ],
  },
  {
    id: 'parent-meeting',
    title: 'An unhappy parent',
    text: 'A parent disagrees with a grade and wants to talk about it now, in front of everyone.',
    options: [
      {
        id: 'listen', label: 'Listen and explain', description: 'Patience usually wins the room.',
        performance: 4, skill: { id: 'charisma', xp: 60 }, result: 'talked a parent through a grade with patience.',
      },
      {
        id: 'firm', label: 'Hold the grade', description: 'The marking was fair, and you say so.',
        performance: 2, result: 'stood by a fair grade and offered a formal review.',
      },
      {
        id: 'snap', label: 'Cut the meeting short', description: 'It ends the conversation, not the problem.',
        performance: -4, moodlet: 'workBlunder', result: 'cut a parent meeting short and regretted it.',
      },
    ],
  },
  {
    id: 'gallery-opening',
    title: 'A gallery opening',
    text: 'Your work hangs in a group show. The room is filling with people who might buy something.',
    options: [
      {
        id: 'mingle', label: 'Work the room', description: 'Meet the collectors, talk about the work.',
        performance: 4, pay: dollars(40), skill: { id: 'charisma', xp: 60 }, result: 'worked the room at a gallery opening and sold a small piece.',
      },
      {
        id: 'corner', label: 'Stay near your work', description: 'Let the paintings speak for themselves.',
        performance: 1, result: 'spent the opening beside their own work.',
      },
    ],
  },
  {
    id: 'commission-revision',
    title: 'A client wants changes',
    text: 'The client loves the piece except for everything they asked for last week.',
    options: [
      {
        id: 'revise', label: 'Revise it patiently', description: 'The client signs off, and the work improves.',
        performance: 4, skill: { id: 'painting', xp: 60 }, result: 'reworked a commission until the client was happy.',
      },
      {
        id: 'charge', label: 'Charge for a second draft', description: 'Fair, and it protects your time.',
        performance: 2, pay: dollars(25), result: 'quoted a fair price for a second draft.',
      },
      {
        id: 'refuse', label: 'Refuse the changes', description: 'The original brief was clear. The client is not pleased.',
        performance: -4, moodlet: 'workBlunder', result: 'refused a client\'s revisions and lost the commission.',
      },
    ],
  },
  {
    id: 'failed-experiment',
    title: 'The experiment failed',
    text: 'Three weeks of work produced nothing but a flat line and a lot of cleaning up.',
    options: [
      {
        id: 'rerun', label: 'Rerun it carefully', description: 'Check every step before trying again.',
        performance: 3, skill: { id: 'logic', xp: 60 }, result: 'reran a failed experiment and found the fault.',
      },
      {
        id: 'publish', label: 'Write up the negative result', description: 'Someone else will need this answer.',
        performance: 2, skill: { id: 'research', xp: 60 }, result: 'wrote up a negative result for the team.',
      },
      {
        id: 'hide', label: 'Quietly start something else', description: 'Nobody has to know it failed.',
        performance: -4, moodlet: 'workBlunder', result: 'buried a failed experiment instead of reporting it.',
      },
    ],
  },
  {
    id: 'conference-talk',
    title: 'A conference invitation',
    text: 'The organisers ask you to present your work to a room of people who will ask hard questions.',
    options: [
      {
        id: 'present', label: 'Give the talk', description: 'A chance to be known for the work.',
        performance: 5, skill: { id: 'charisma', xp: 60 }, result: 'presented their work at a conference.',
      },
      {
        id: 'send', label: 'Send a colleague', description: 'The team gets the credit, and you get the evening back.',
        performance: 1, result: 'sent a colleague to present the team\'s work.',
      },
    ],
  },
  {
    id: 'team-slump',
    title: 'The team is in a slump',
    text: 'Three losses in a row. The players are quiet and the next match is close.',
    options: [
      {
        id: 'training', label: 'Add an extra session', description: 'Hard work, but it clears the air.',
        performance: 4, skill: { id: 'fitness', xp: 60 }, result: 'ran an extra training session to break a losing streak.',
      },
      {
        id: 'talk', label: 'Give a team talk', description: 'Sometimes they need words more than drills.',
        performance: 3, skill: { id: 'wellness', xp: 60 }, result: 'gave the team a talk that lifted the mood.',
      },
      {
        id: 'blame', label: 'Call out the players', description: 'Honest, perhaps. Helpful, no.',
        performance: -4, moodlet: 'workBlunder', result: 'blamed the players for a loss and soured the changing room.',
      },
    ],
  },
  {
    id: 'sponsor-offer',
    title: 'A sponsor comes calling',
    text: 'A local business offers kit and a little cash in exchange for their name on the shirts.',
    options: [
      {
        id: 'accept', label: 'Accept the offer', description: 'The team gets new kit.',
        performance: 3, pay: dollars(30), result: 'accepted a local sponsorship for the team.',
      },
      {
        id: 'decline', label: 'Politely decline', description: 'The club prefers to stay independent.',
        performance: 1, result: 'declined a sponsorship to keep the club independent.',
      },
    ],
  },
  {
    id: 'client-change',
    title: 'The brief changes',
    text: 'A client wants a different layout two days before the plans are due.',
    options: [
      {
        id: 'redo', label: 'Redraw the plans', description: 'Long nights, but the client is happy.',
        performance: 4, skill: { id: 'handiness', xp: 60 }, result: 'redrew a set of plans after a late brief change.',
      },
      {
        id: 'charge', label: 'Charge for the change', description: 'The contract was clear about revisions.',
        performance: 2, pay: dollars(35), result: 'charged a fair fee for a late brief change.',
      },
      {
        id: 'ignore', label: 'Keep the original plans', description: 'They asked for this last week.',
        performance: -5, moodlet: 'workBlunder', result: 'ignored a client\'s revised brief and lost the job.',
      },
    ],
  },
  {
    id: 'site-visit',
    title: 'A problem on site',
    text: 'The builder finds a pipe exactly where the new wall should go. Everyone looks at you.',
    options: [
      {
        id: 'solve', label: 'Rework it on the spot', description: 'A quick sketch and a sensible fix.',
        performance: 5, skill: { id: 'handiness', xp: 60 }, result: 'solved a problem on site with a quick redesign.',
      },
      {
        id: 'survey', label: 'Order a proper survey', description: 'Slower, but no surprises later.',
        performance: 2, pay: dollars(-10), result: 'paused the work for a proper site survey.',
      },
      {
        id: 'ignore', label: 'Tell them to build around it', description: 'It will probably be fine.',
        performance: -5, moodlet: 'workBlunder', result: 'told the builders to work around a problem, and it was not fine.',
      },
    ],
  },
  {
    id: 'dinner-rush',
    title: 'The dinner rush',
    text: 'Every table fills at once, the kitchen is two orders behind and a plate is going cold.',
    options: [
      {
        id: 'floor', label: 'Jump on the floor', description: 'Take tables yourself until the queue clears.',
        performance: 4, skill: { id: 'cooking', xp: 60 }, result: 'jumped on the floor during a dinner rush and saved the service.',
      },
      {
        id: 'help', label: 'Call in extra staff', description: 'It costs the shift budget, but the guests are looked after.',
        performance: 2, pay: dollars(-15), result: 'called in extra staff to get through a dinner rush.',
      },
      {
        id: 'hide', label: 'Stay in the office', description: 'The floor will sort itself out. Probably.',
        performance: -4, moodlet: 'workBlunder', result: 'hid in the office during the dinner rush.',
      },
    ],
  },
  {
    id: 'tough-guest',
    title: 'A guest is unhappy',
    text: 'A guest says the room is not what they booked and wants something done about it.',
    options: [
      {
        id: 'upgrade', label: 'Offer an upgrade', description: 'Generous, and it turns the review around.',
        performance: 4, pay: dollars(-20), skill: { id: 'charisma', xp: 60 }, result: 'upgraded an unhappy guest and earned a glowing review.',
      },
      {
        id: 'dessert', label: 'Send up a dessert', description: 'A small gesture and a sincere apology.',
        performance: 2, pay: dollars(-5), result: 'sent a dessert up to an unhappy guest.',
      },
      {
        id: 'policy', label: 'Explain the booking policy', description: 'Technically correct. The guest is not comforted.',
        performance: 0, result: 'explained the booking policy to a disappointed guest.',
      },
    ],
  },
];
