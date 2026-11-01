// Game animation ids. The simulation only names animations; src/characters maps each id to a clip of
// the shared skeleton (Quaternius Universal Animation Library) and handles blending, holds and reversal.

export const ANIM_IDS = [
  'idle', 'walk', 'jog',
  'sitDown', 'sitIdle', 'sitTalk', 'standUp',
  'talk', 'phone', 'foldArms', 'laugh', 'disagree', 'agree', 'wave',
  'interact', 'cook', 'openFridge', 'eat', 'pickUp', 'carry', 'kneelFix', 'clean',
  'lieDown', 'sleep', 'getUp',
  'water', 'plant', 'harvest', 'dance', 'exercise', 'shower', 'toilet', 'read', 'watchTv', 'computer',
] as const;

export type AnimId = (typeof ANIM_IDS)[number];

/** Animations that loop while held; others play once then hold or return to idle. */
export const LOOPING_ANIMS: ReadonlySet<AnimId> = new Set<AnimId>([
  'idle', 'walk', 'jog', 'sitIdle', 'sitTalk', 'talk', 'phone', 'foldArms', 'cook', 'carry', 'sleep',
  'kneelFix', 'clean', 'water', 'dance', 'exercise', 'shower', 'read', 'watchTv', 'computer', 'eat',
]);
