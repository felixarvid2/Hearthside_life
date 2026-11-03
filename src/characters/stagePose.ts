// Pose tweaks that depend on the life stage or on what a person is doing, applied to the skeleton after the clips have been sampled:
// the elder's stoop, the carrier's cradle arms for a held baby, a baby's curled limbs, and how fast a small person's walk cycle runs.
// Directions are in the character's model space (feet at the origin, facing +z, +y up, the character's left at +x), the space the
// bind skeleton is in; the helpers below only need bone quaternions, so the maths is testable without a renderer.

import * as THREE from 'three';
import type { LifeStage } from '../core/types';

/** Per-stage pose settings. */
export interface StageLook {
  /** Forward lean of the spine when standing, in radians (spread over the spine bones; the head tilts back to keep looking ahead). */
  stoop: number;
  /** Cadence of the walk and jog cycles: short legs take quicker steps to keep up with the same ground speed. */
  cadence: number;
}

const NEUTRAL: StageLook = { stoop: 0, cadence: 1 };
const LOOKS: Partial<Record<LifeStage, StageLook>> = {
  toddler: { stoop: 0, cadence: 1.6 },
  child: { stoop: 0, cadence: 1.28 },
  teen: { stoop: 0, cadence: 1.05 },
  elder: { stoop: 0.15, cadence: 0.85 },
};

export function stageLook(stage: LifeStage): StageLook { return LOOKS[stage] ?? NEUTRAL; }

/** Source clips that move the person over the ground (their speed follows the cadence of the stage). */
export const LOCOMOTION_CLIPS: ReadonlySet<string> = new Set(['Walk_Loop', 'Jog_Fwd_Loop', 'Walk_Carry_Loop', 'Walk_Formal_Loop']);

// ---------------------------------------------------------------------------------------------
// Bone maths
// ---------------------------------------------------------------------------------------------

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Orientation of a bone in model space (the product of the local rotations from the skeleton's root joint down to it). */
export function modelQuat(bone: THREE.Object3D, out: THREE.Quaternion = new THREE.Quaternion()): THREE.Quaternion {
  const chain: THREE.Object3D[] = [];
  for (let o: THREE.Object3D | null = bone; o && (o as THREE.Bone).isBone; o = o.parent) chain.push(o);
  out.identity();
  for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i]!.quaternion);
  return out;
}

/** Rotates a bone about an axis given in model space by `angle` (positive about +x leans the part above it forward). */
export function rotateInModel(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  if (!angle) return;
  const parent = bone.parent;
  const qp = parent && (parent as THREE.Bone).isBone ? modelQuat(parent, _q) : _q.identity();
  // local' = qp^-1 * R * qp * local
  _q2.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(qp).premultiply(_q2).premultiply(qp.clone().invert());
}

/** What a bone needs for aiming: its bind orientation and the direction to its child in model space. */
export interface BindBone { q: THREE.Quaternion; axis: THREE.Vector3 }

/**
 * Bind data of the bones: from the bind-pose hierarchy (matrices in model space) the orientation of each bone and the unit direction
 * toward the given child (the bone's own length axis).
 */
export function bindBones(root: THREE.Object3D, pairs: Record<string, string>): Map<string, BindBone> {
  root.updateMatrixWorld(true);
  const out = new Map<string, BindBone>();
  const pos = new THREE.Vector3(), childPos = new THREE.Vector3(), s = new THREE.Vector3();
  for (const [name, child] of Object.entries(pairs)) {
    const b = root.getObjectByName(name), c = root.getObjectByName(child);
    if (!b || !c) continue;
    const q = new THREE.Quaternion();
    b.matrixWorld.decompose(pos, q, s);
    c.matrixWorld.decompose(childPos, _q, s);
    out.set(name, { q, axis: childPos.clone().sub(pos).normalize() });
  }
  return out;
}

/**
 * Points a bone along `dir` (model space, any length) with the least rotation from its bind orientation, then twists it about that
 * direction by `twist`. The result replaces the bone's local rotation, blended in by `weight` (0 keeps the animation).
 */
export function aimBone(bone: THREE.Object3D, bind: BindBone, dir: THREE.Vector3, twist: number, weight: number): void {
  if (weight <= 0) return;
  const parent = bone.parent;
  const qp = parent && (parent as THREE.Bone).isBone ? modelQuat(parent, _q) : _q.identity();
  const want = _q2.setFromUnitVectors(bind.axis, _v.copy(dir).normalize()).multiply(bind.q);
  if (twist) want.premultiply(new THREE.Quaternion().setFromAxisAngle(_v, twist));
  const local = qp.clone().invert().multiply(want);
  if (weight >= 1) bone.quaternion.copy(local); else bone.quaternion.slerp(local, weight);
}

// ---------------------------------------------------------------------------------------------
// Stoop
// ---------------------------------------------------------------------------------------------

const X_AXIS = new THREE.Vector3(1, 0, 0);
/** Spine bones with their share of the stoop; the neck leans a little more and the head tilts back. */
const STOOP_SHARES: Array<[string, number]> = [['spine_01', 0.3], ['spine_02', 0.3], ['spine_03', 0.25], ['neck_01', 0.2], ['Head', -0.35]];

/** The bones the stoop turns. */
export const STOOP_BONES: readonly string[] = STOOP_SHARES.map(([n]) => n);

/** Leans the spine forward by `amount` radians in total (model space, bone by bone from the pelvis up). */
export function applyStoop(bones: Map<string, THREE.Bone>, amount: number): void {
  if (!amount) return;
  for (const [name, share] of STOOP_SHARES) {
    const b = bones.get(name);
    if (b) rotateInModel(b, X_AXIS, amount * share);
  }
}

// ---------------------------------------------------------------------------------------------
// Holding a baby
// ---------------------------------------------------------------------------------------------

/** Bones aimed by the cradle and the child bone that gives each its direction. */
export const CRADLE_PAIRS: Record<string, string> = {
  upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_01_l',
  upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_01_r',
};

/**
 * Where the cradled baby lies, in the carrier's model space and in units of the carrier's height / 1.8: the middle of the baby on
 * the forearms, a little left of centre so the head rests at the crook of the left arm. `yaw` turns the baby's long axis (0: along
 * +z, head toward -z) so the head points to the carrier's left chest and the feet away to the right.
 */
export const CRADLE = { x: -0.02, y: 1.05, z: 0.26, yaw: -Math.PI / 2 + 0.3 };

/** Directions (model space; the left arm, mirrored for the right) of the upper arm, forearm and hand of the cradle. */
const CRADLE_DIRS = {
  upper: new THREE.Vector3(0.12, -0.88, 0.45),
  fore: new THREE.Vector3(-0.58, 0.12, 0.8),
  hand: new THREE.Vector3(-0.5, 0.12, 0.86),
};

/** Overrides both arms with the cradle hold, blended in by `weight` (the arms of the clip stay when it is 0). */
export function applyCradle(bones: Map<string, THREE.Bone>, bind: Map<string, BindBone>, weight: number): void {
  if (weight <= 0) return;
  for (const side of ['l', 'r'] as const) {
    const m = side === 'l' ? 1 : -1;
    const dir = (d: THREE.Vector3) => new THREE.Vector3(d.x * m, d.y, d.z);
    // top down: each bone's parent has its final rotation when it is aimed
    const steps: Array<[string, THREE.Vector3, number]> = [
      [`upperarm_${side}`, dir(CRADLE_DIRS.upper), 0],
      [`lowerarm_${side}`, dir(CRADLE_DIRS.fore), m * 0.5],
      [`hand_${side}`, dir(CRADLE_DIRS.hand), m * 0.5],
    ];
    for (const [name, d, twist] of steps) {
      const b = bones.get(name), bb = bind.get(name);
      if (b && bb) aimBone(b, bb, d, twist, weight);
    }
  }
}
