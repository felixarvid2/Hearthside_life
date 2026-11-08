// Milestone 12: the swimming interactions offered on pool water (sim/pool.ts implements the behavior). Children and
// up may swim; babies and toddlers may not. Milestone 13: toddlers may paddle at the deck edge with a grown-up watching. Outdoor pools close in the snow, but the weather rule is checked by the
// behavior against the pool's own position (indoor pools stay open), so `weather` is not set here.

import type { InteractionDef } from './types';

const SWIMMERS = ['child', 'teen', 'youngAdult', 'adult', 'elder'] as const;

export const POOL_INTERACTIONS: InteractionDef[] = [
  {
    id: 'swimInPool', name: 'Swim in the Pool',
    description: 'Change into swimwear, climb in at the ladder and swim laps. Fun, a little hygiene, and Fitness.',
    icon: 'fun', kind: 'tile', slotKinds: [], anims: { perform: 'swim' }, posture: 'standing', behavior: 'poolSwim',
    duration: { kind: 'fixed', minutes: 90 },
    needsPerHour: { fun: 24, hygiene: 4, energy: -10 }, needsOnComplete: { fun: 4 },
    skill: { id: 'fitness', xpPerHour: 90 },
    autonomy: { enabled: true, ads: { fun: 22 }, tags: ['swim', 'swimming', 'active', 'fun'] },
    allowVisitors: true, ages: [...SWIMMERS], status: 'ready',
  },
  {
    id: 'relaxInPool', name: 'Relax in the Pool',
    description: 'Float in the water and unwind. Fun and a little hygiene, and easier on the energy.',
    icon: 'sparkle', kind: 'tile', slotKinds: [], anims: { perform: 'float' }, posture: 'standing', behavior: 'poolSwim',
    duration: { kind: 'fixed', minutes: 120 },
    needsPerHour: { fun: 16, hygiene: 3, energy: -3 }, needsOnComplete: { fun: 6 },
    moodletOnComplete: 'peaceful',
    autonomy: { enabled: true, ads: { fun: 15 }, tags: ['swim', 'swimming', 'relax', 'fun'] },
    allowVisitors: true, ages: [...SWIMMERS], status: 'ready',
  },
  {
    id: 'paddleAtEdge', name: 'Paddle at the Edge',
    description: 'Sit on the deck with bare feet in the water and splash. Toddlers only, and only while a grown-up (a teen or older) is awake and close by.',
    icon: 'fun', kind: 'tile', slotKinds: [], anims: { perform: 'interact' }, posture: 'standing', behavior: 'paddle',
    duration: { kind: 'fixed', minutes: 25 },
    needsPerHour: { fun: 22, hygiene: 3, energy: -2 }, needsOnComplete: {}, moodletOnComplete: 'puddleSplash',
    autonomy: { enabled: false, ads: {}, tags: ['swim', 'paddle', 'fun'] },
    allowVisitors: true, ages: ['toddler'], status: 'ready',
  },
  {
    id: 'getOutOfPool', name: 'Get Out', description: 'Climb out at the nearest ladder.',
    icon: 'move', kind: 'self', slotKinds: [], anims: { perform: 'swim' }, posture: 'standing', behavior: 'getOut',
    duration: { kind: 'fixed', minutes: 0 }, needsPerHour: {}, needsOnComplete: {},
    autonomy: { enabled: false, ads: {}, tags: ['swim'] },
    allowVisitors: true, ages: [...SWIMMERS], status: 'ready',
  },
];
