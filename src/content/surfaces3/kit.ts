// Shared helpers for the Milestone 10 surface files (surfaces3/*.ts): the same builders surfaces2.ts uses, so a
// design here is written exactly like the older ones. wall() and floor() take the price in dollars and derive the
// tier; palettes come from pal() or from make(roles)(tuples) (see ramp, duoP, stripeP, plain).
export {
  DUO, NEUTRAL_RAMP, TRIM, checkP, dollars, duoP, floor, fibreP, make, pal, plain, ramp, shd, stripeP, tierOf, wall, woodP,
  WOODS, WEATHERED,
} from '../surfaces2';
export type { DesignInput, Tuple } from '../surfaces2';
