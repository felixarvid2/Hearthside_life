// Measured posture anchors of the shared clips, so the renderer can line a seated or lying person up with a
// furniture slot. Values were measured on the skinned skin mesh in the dev lab (dev/characters.html,
// lab.measure) for both frames at default body shape; heavier body presets sit up to ~1 cm lower.
// Root space: feet at the origin, facing +z (character rotation.y = facing). Pure module.

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

export interface RootPlacement { x: number; y: number; z: number; yaw: number }

/**
 * Root transform that seats a person on a seat anchor (seat surface centre at height y) facing `facing`
 * (radians, 0 = +z). Pass the frame for its exact measurement (and the style: the scanned bodies sit a little differently).
 */
export function seatedPlacement(anchor: { x: number; y: number; z: number }, facing: number, frame?: 'a' | 'b', style: 'classic' | 'detailed' = 'classic'): RootPlacement {
  const m = frame ? (style === 'detailed' ? POSTURE_ANCHORS.seated.detailed : POSTURE_ANCHORS.seated.frames)[frame] : POSTURE_ANCHORS.seated;
  const dx = Math.sin(facing), dz = Math.cos(facing);
  return { x: anchor.x - dx * m.seatZ, y: anchor.y - m.seatHeight, z: anchor.z - dz * m.seatZ, yaw: facing };
}

/**
 * Root transform that lays a person on a mattress: `center` = middle of the sleeping area on the mattress
 * surface, `headToFeet` = direction (radians, 0 = +z) from the pillow end toward the foot end.
 */
export function lyingPlacement(center: { x: number; y: number; z: number }, headToFeet: number): RootPlacement {
  const L = POSTURE_ANCHORS.lying;
  const dx = Math.sin(headToFeet), dz = Math.cos(headToFeet);
  return { x: center.x - dx * L.centerZ, y: center.y - L.backY, z: center.z - dz * L.centerZ, yaw: headToFeet };
}
