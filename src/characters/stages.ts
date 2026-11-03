// Life stages: how tall each is, which have a body of their own and where its file is. Pure (no three.js), so the creator, the sim's
// helpers and the tests can use it; characters/assets.ts re-exports it and loads the bodies.

import type { BodyFrame, LifeStage } from '../core/types';


/**
 * Standing height of a person of each life stage in metres (UI and camera framing). The adult bodies are 1.80 m; the stage bodies are
 * built to these heights (tools/mpfb/build_body.py STAGES; the teen and elder bodies differ a little by sex, these are the means). The
 * baby is its length held upright, a baby never stands. youngAdult uses the adult body.
 */
export const STAGE_HEIGHTS: Record<LifeStage, number> = { baby: 0.68, toddler: 0.93, child: 1.28, teen: 1.63, youngAdult: 1.8, adult: 1.8, elder: 1.71 };
/** Height of the adult body (the skeleton of the clips). */
export const ADULT_HEIGHT = 1.8;

/** The stage bodies that exist as GLBs next to the adults (`mpfb_<stage>_{f,m}.glb`, `mpfb_baby.glb`); youngAdult and adult use the adult bodies. */
export type StageBody = 'baby' | 'toddler' | 'child' | 'teen' | 'elder';
export const STAGE_BODIES: readonly StageBody[] = ['baby', 'toddler', 'child', 'teen', 'elder'];

/** The stage body that draws a life stage, or null for the adult bodies. */
export function stageBodyOf(stage: LifeStage): StageBody | null {
  return stage === 'adult' || stage === 'youngAdult' ? null : stage;
}

/** GLB file name (without extension) of a stage body: the baby is one body for both sexes. */
export function stageBodyFile(body: StageBody, frame: BodyFrame): string {
  return body === 'baby' ? 'mpfb_baby' : `mpfb_${body}_${frame === 'a' ? 'm' : 'f'}`;
}

/**
 * Whether a body exists for the life stage, so the creator can offer it. Every stage has one: the natural (MPFB) style loads a stage
 * body on first use; the classic and detailed styles scale the adult body uniformly to the stage's height (approximate, see
 * `stageFallbackScale`).
 */
export function stageBodyAvailable(stage: LifeStage): boolean {
  return (LIFE_STAGE_LIST as readonly string[]).includes(stage);
}
const LIFE_STAGE_LIST: readonly LifeStage[] = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];

/** Uniform scale of the adult rig that approximates a stage when its own body is not (yet) loaded: the classic and detailed styles. */
export function stageFallbackScale(stage: LifeStage): number {
  return STAGE_HEIGHTS[stage] / ADULT_HEIGHT;
}
