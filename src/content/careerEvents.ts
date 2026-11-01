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
];
