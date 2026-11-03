import type { LifeStage } from '../core/types';
import { ADULT_HEIGHT, STAGE_HEIGHTS } from './stages';

// Measured posture anchors of the shared clips, so the renderer can line a seated or lying person up with a
// furniture slot. Values were measured on the skinned skin mesh in the dev lab (dev/characters.html,
// lab.measure) for both frames at default body shape; heavier body presets sit up to ~1 cm lower.
// Root space: feet at the origin, facing +z (character rotation.y = facing). Pure module.
//
// Life stages: a stage body (characters/assets.ts) sits and lies with the same clips on a skeleton whose pelvis is lower, so its anchors
// are the adult's scaled by the stage (STAGE_SEATED and STAGE_LYING hold the ones measured on the bodies: `dev/mpfb/shootStages.mjs --plan=measure`);
// a child on an adult chair sits on the seat with the feet hanging, a baby lies in a crib or is held in a carrier's arms.

export const POSTURE_ANCHORS = {
  seated: {
    /** Height of the seat surface the Sitting_* pose rests on (lowest buttock point above the root). */
    seatHeight: 0.465,
    /** Root-space z of the seat contact (buttocks): the pelvis sits 18 cm behind the feet origin. */
    seatZ: -0.18,
    /** Per frame measurements (a: broader frame, b: curvier frame). */
    frames: { a: { seatHeight: 0.462, seatZ: -0.2 }, b: { seatHeight: 0.468, seatZ: -0.153 } },
    /** The same for the scanned (Meshy) bodies (`dev/meshy/shootLab.mjs --plan=measure`). */
    detailed: { a: { seatHeight: 0.442, seatZ: -0.156 }, b: { seatHeight: 0.477, seatZ: -0.197 } },
    /** The MPFB bodies (mpfb_m = frame a, mpfb_f = frame b), measured the same way (`dev/meshy/shootLab.mjs --style=mpfb --plan=measure`). */
    mpfb: { a: { seatHeight: 0.462, seatZ: -0.305 }, b: { seatHeight: 0.461, seatZ: -0.308 } },
    /** Feet rest on the floor at about this root-space z. */
    feetZ: 0.19,
  },
  lying: {
    /** Height of the back (pelvis underside) above the root in the LayToIdle start pose (sleep). */
    backY: -0.04,
    /** The body lies along +z of the root: head toward -z, feet toward +z. */
    headZ: -0.97,
    feetZ: 0.645,
    /** Root-space z of the middle of the body (crown to heels). */
    centerZ: -0.175,
    /** Length crown to heels. */
    length: 1.9,
    /** Arms rest slightly below the back (frame a up to 7 cm), sinking into the mattress. */
    lowestY: -0.11,
  },
  standing: {
    /** Interaction anchors for standing slots are at the feet (root origin). */
    feetY: 0,
  },
} as const;

/** Seat anchors of the stage bodies of the natural style, per body frame (measured: `node dev/mpfb/shootStages.mjs --plan=measure`; the baby's is the floor it sits on). */
export const STAGE_SEATED: Partial<Record<LifeStage, { a: { seatHeight: number; seatZ: number }; b: { seatHeight: number; seatZ: number } }>> = {
  baby: { a: { seatHeight: -0.028, seatZ: -0.077 }, b: { seatHeight: -0.028, seatZ: -0.077 } },
  toddler: { a: { seatHeight: 0.195, seatZ: -0.149 }, b: { seatHeight: 0.2, seatZ: -0.153 } },
  child: { a: { seatHeight: 0.297, seatZ: -0.202 }, b: { seatHeight: 0.304, seatZ: -0.229 } },
  teen: { a: { seatHeight: 0.41, seatZ: -0.274 }, b: { seatHeight: 0.398, seatZ: -0.289 } },
  elder: { a: { seatHeight: 0.465, seatZ: -0.304 }, b: { seatHeight: 0.407, seatZ: -0.26 } },
};
/** Lying anchors of the stage bodies (same measure, the women's bodies); the baby has one body for both frames. */
export const STAGE_LYING: Partial<Record<LifeStage, { backY: number; centerZ: number; length: number }>> = {
  baby: { backY: -0.028, centerZ: -0.097, length: 0.7 },
  toddler: { backY: -0.028, centerZ: -0.121, length: 0.955 },
  child: { backY: -0.036, centerZ: -0.137, length: 1.314 },
  teen: { backY: -0.044, centerZ: -0.157, length: 1.651 },
  elder: { backY: -0.058, centerZ: -0.155, length: 1.726 },
};

export interface StageOpts {
  /** Life stage of the person (default adult). */
  stage?: LifeStage;
  /** The stage's own body is drawn (else the adult rig scaled uniformly to the stage's height: the classic and detailed styles, or a body still loading). */
  own?: boolean;
}

/** Scale of the adult anchors that stands in for a stage (1 for adults). */
export function stageScale(stage: LifeStage | undefined): number {
  return stage ? STAGE_HEIGHTS[stage] / ADULT_HEIGHT : 1;
}

export interface RootPlacement { x: number; y: number; z: number; yaw: number }

/**
 * Root transform that seats a person on a seat anchor (seat surface centre at height y) facing `facing`
 * (radians, 0 = +z). Pass the frame for its exact measurement (and the style: the scanned bodies sit a little differently).
 */
export function seatedPlacement(anchor: { x: number; y: number; z: number }, facing: number, frame?: 'a' | 'b', style: 'classic' | 'detailed' | 'mpfb' = 'classic', opts: StageOpts = {}): RootPlacement {
  let m: { seatHeight: number; seatZ: number } = frame ? (style === 'mpfb' ? POSTURE_ANCHORS.seated.mpfb : style === 'detailed' ? POSTURE_ANCHORS.seated.detailed : POSTURE_ANCHORS.seated.frames)[frame] : POSTURE_ANCHORS.seated;
  const stage = opts.stage;
  if (stage && stage !== 'adult' && stage !== 'youngAdult') {
    const own = opts.own !== false && style === 'mpfb' ? STAGE_SEATED[stage] : undefined;
    if (own) m = own[frame ?? 'a'];
    else { const k = stageScale(stage); m = { seatHeight: m.seatHeight * k, seatZ: m.seatZ * k }; }
  }
  const dx = Math.sin(facing), dz = Math.cos(facing);
  return { x: anchor.x - dx * m.seatZ, y: anchor.y - m.seatHeight, z: anchor.z - dz * m.seatZ, yaw: facing };
}

/**
 * Root transform that lays a person on a mattress: `center` = middle of the sleeping area on the mattress
 * surface, `headToFeet` = direction (radians, 0 = +z) from the pillow end toward the foot end.
 */
export function lyingPlacement(center: { x: number; y: number; z: number }, headToFeet: number, opts: StageOpts = {}): RootPlacement {
  const stage = opts.stage;
  const k = stage && stage !== 'adult' && stage !== 'youngAdult' ? stageScale(stage) : 1;
  const own = k !== 1 && opts.own !== false ? STAGE_LYING[stage!] : undefined;
  const L = own ?? { backY: POSTURE_ANCHORS.lying.backY * k, centerZ: POSTURE_ANCHORS.lying.centerZ * k };
  const dx = Math.sin(headToFeet), dz = Math.cos(headToFeet);
  return { x: center.x - dx * L.centerZ, y: center.y - L.backY, z: center.z - dz * L.centerZ, yaw: headToFeet };
}
