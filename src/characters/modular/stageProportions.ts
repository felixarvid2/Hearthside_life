// Life-stage proportions of the modular (Quaternius) bodies, done at runtime on the cloned skeleton: the two adult bodies
// (ubc_male, ubc_female) are the only meshes, and every garment, hair and accessory is skinned to the same bones, so a scaled
// bone carries all of them along.
//
// Method. Every bone of the profile gets a world scale `e` (uniform, so a bone that is rotated against its parent never
// shears). A bone's local scale is `e / e(parent)`: a scaled bone does not inflate its children, they keep their own `e` and are
// only moved, because a joint sits at the parent's scale times its bind offset. The Head bone at 1.6 makes a big head with the
// hair and hat that are skinned to it; the neck, torso, arms and legs each have their own. The numbers in a profile are
// relative to the overall height: the whole figure is then scaled uniformly (`rootScale`) so that its crown ends up at
// `height` x the body's adult height.
//
// Feet: shorter legs lift the feet off the floor, so the pelvis is lowered by the gap. The shared clips move the pelvis with
// `.position` tracks authored for the adult hip height; `hipRatio` is the new hip height over the bind one (retarget.ts scales
// the tracks by it), which keeps the soles on the floor while walking, sitting and lying.

import * as THREE from 'three';
import type { LifeStage } from '../../core/types';

/** Proportions of one life stage; every number is 1 for the adult body. */
export interface StageProportions {
  /** Standing height of the figure (crown above the floor) over the adult body's height. */
  height: number;
  /** Head size (Head bone): hair, hats and glasses follow. */
  head: number;
  neck: number;
  /** Spine and chest: torso length and girth. */
  torso: number;
  /** Pelvis: hip width. */
  hips: number;
  /** Clavicles: shoulder width. */
  shoulders: number;
  upperArm: number;
  foreArm: number;
  /** Hand with its fingers. */
  hand: number;
  thigh: number;
  shin: number;
  /** Foot with its ball. */
  foot: number;
  /** Added to the look's `weight` morph (-0.5..1) when drawn: rounder babies, slimmer children (0 for adults). */
  weight: number;
  /**
   * The `young` morph (0..1.5): a child's soft body and face in place of the adult's muscles, bust, jaw and nose (authored by
   * tools/characters/blender/stage_morph.py; 1 is a child; babies and toddlers stay at 1, as more turns the relaxed chest inside out).
   */
  young: number;
}

const ADULT: StageProportions = { height: 1, head: 1, neck: 1, torso: 1, hips: 1, shoulders: 1, upperArm: 1, foreArm: 1, hand: 1, thigh: 1, shin: 1, foot: 1, weight: 0, young: 0 };

/**
 * The stage table. Heights relative to the adult: baby about 0.38, toddler 0.5, child 0.68, teen 0.93, elder 0.97 with
 * slightly narrower shoulders. Head and shoulders of the young stages follow measured children (2026-11-14; Snyder et al.
 * 1975 via math.nist.gov/~SRessler/anthrokids, and the drawing canon in heads): a baby is about 4 heads tall, a toddler
 * about 5, a child of 1.23 m about 6.2, with shoulders wider than the head throughout. The numbers and the reference rows
 * are checked in tests/unit/characters3d/modular/stageReference.test.ts. The rest is tuned by eye (dev/stages.html).
 */
export const STAGE_PROPORTIONS: Readonly<Record<LifeStage, Readonly<StageProportions>>> = {
  baby: { height: 0.38, head: 1.74, neck: 0.7, torso: 1.05, hips: 1.05, shoulders: 0.95, upperArm: 0.8, foreArm: 0.8, hand: 0.95, thigh: 0.62, shin: 0.55, foot: 0.85, weight: 0.7, young: 1 },
  toddler: { height: 0.5, head: 1.47, neck: 0.8, torso: 0.95, hips: 0.95, shoulders: 0.86, upperArm: 0.8, foreArm: 0.8, hand: 0.92, thigh: 0.66, shin: 0.64, foot: 0.88, weight: 0.35, young: 1 },
  child: { height: 0.68, head: 1.17, neck: 0.86, torso: 0.92, hips: 0.92, shoulders: 0.85, upperArm: 0.83, foreArm: 0.83, hand: 0.92, thigh: 0.77, shin: 0.77, foot: 0.9, weight: -0.4, young: 1 },
  teen: { height: 0.93, head: 1.05, neck: 0.97, torso: 0.97, hips: 0.97, shoulders: 0.95, upperArm: 0.98, foreArm: 0.98, hand: 0.98, thigh: 1.0, shin: 1.0, foot: 0.98, weight: -0.15, young: 0.4 },
  youngAdult: ADULT,
  adult: ADULT,
  elder: { height: 0.97, head: 1.0, neck: 0.98, torso: 1.0, hips: 1.0, shoulders: 0.94, upperArm: 0.98, foreArm: 0.98, hand: 1.0, thigh: 0.98, shin: 0.98, foot: 1.0, weight: 0.1, young: 0 },
};

export function proportionsFor(stage: LifeStage): Readonly<StageProportions> { return STAGE_PROPORTIONS[stage]; }

/** Whether a stage is drawn with the plain adult skeleton. */
export function isAdultProportions(stage: LifeStage): boolean { return STAGE_PROPORTIONS[stage] === ADULT; }

/** Bone name -> field of the profile that sets its world scale; bones not named inherit their parent's (fingers, ball, leaf joints). */
const BONE_FIELD: Readonly<Record<string, keyof StageProportions>> = {
  pelvis: 'hips', spine_01: 'torso', spine_02: 'torso', spine_03: 'torso', neck_01: 'neck', Head: 'head',
  clavicle_l: 'shoulders', clavicle_r: 'shoulders',
  upperarm_l: 'upperArm', upperarm_r: 'upperArm', lowerarm_l: 'foreArm', lowerarm_r: 'foreArm', hand_l: 'hand', hand_r: 'hand',
  thigh_l: 'thigh', thigh_r: 'thigh', calf_l: 'shin', calf_r: 'shin', foot_l: 'foot', foot_r: 'foot',
};

/** What a stage does to a body (all measured with the figure's rootScale not yet applied, in the armature's space). */
export interface StageFit {
  /** Uniform scale of the character's root group that brings the crown to the stage's height. */
  rootScale: number;
  /** Hip height now over the bind hip height: the factor for the clips' `.position` tracks (on top of the body's own ratio). */
  hipRatio: number;
  /** Crown above the Head bone (bare head, before rootScale). */
  crownAboveHead: number;
  /** World scale of the head relative to the figure (before rootScale). */
  headScale: number;
}

/** Local transform matrix of a bone chain member without touching the scene graph's world matrices. */
const _m = new THREE.Matrix4();

/** Position of `bone` in the armature's space (the space of the topmost bone's parent), from the bones' local matrices. */
function armaturePosition(bone: THREE.Object3D, top: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  _m.identity();
  for (let o: THREE.Object3D | null = bone; o && o !== top.parent; o = o.parent) {
    o.updateMatrix();
    _m.premultiply(o.matrix);
  }
  return out.setFromMatrixPosition(_m);
}

/**
 * Holds a body's bind transforms and applies life-stage proportions to its bones. Create it on a freshly cloned skeleton (bones
 * at their bind pose); `apply` can be called again for another stage.
 */
export class StageRig {
  private readonly bind = new Map<THREE.Bone, { p: THREE.Vector3; s: THREE.Vector3 }>();
  private readonly top: THREE.Bone;
  private readonly pelvis: THREE.Bone | null;
  private readonly foot: THREE.Bone | null;
  private readonly head: THREE.Bone | null;
  private readonly bindFootY: number;
  private readonly bindPelvisY: number;
  private readonly bindHeadY: number;
  /** Crown above the Head bone at bind (bare head). */
  readonly crownAboveHead: number;
  /** Height of the body (crown) at bind. */
  readonly bodyHeight: number;

  constructor(bones: ReadonlyMap<string, THREE.Bone>, bodyHeight: number) {
    this.top = bones.get('root') ?? [...bones.values()][0]!;
    for (const b of bones.values()) this.bind.set(b, { p: b.position.clone(), s: b.scale.clone() });
    this.pelvis = bones.get('pelvis') ?? null;
    this.foot = bones.get('foot_l') ?? null;
    this.head = bones.get('Head') ?? null;
    const v = new THREE.Vector3();
    this.bindFootY = this.foot ? armaturePosition(this.foot, this.top, v).y : 0;
    this.bindPelvisY = this.pelvis ? armaturePosition(this.pelvis, this.top, v).y : 1;
    this.bindHeadY = this.head ? armaturePosition(this.head, this.top, v).y : bodyHeight - 0.2;
    this.bodyHeight = bodyHeight;
    this.crownAboveHead = Math.max(0.1, bodyHeight - this.bindHeadY);
  }

  /** Puts the bones at the bind pose again. */
  reset(): void {
    for (const [b, t] of this.bind) { b.position.copy(t.p); b.scale.copy(t.s); }
  }

  /** Applies the stage's proportions, and the body's own on top (resets first, so any stage can follow any other). */
  apply(stage: LifeStage, own?: Partial<Record<keyof StageProportions, number>>): StageFit {
    this.reset();
    let prof = proportionsFor(stage);
    // a body's own proportions (BodyPresetDef.proportions) are factors on the stage's bone scales
    const mine = own ? (Object.entries(own) as Array<[keyof StageProportions, number]>).filter(([k, v]) => k !== 'height' && k !== 'weight' && k !== 'young' && v !== 1) : [];
    if (mine.length) { const p = { ...prof }; for (const [k, v] of mine) p[k] *= v; prof = p; }
    if ((prof === ADULT) || !this.pelvis) return { rootScale: 1, hipRatio: 1, crownAboveHead: this.crownAboveHead, headScale: 1 };
    // world scale e of every bone, top down; a bone's local scale is e over its parent's
    const eOf = new Map<THREE.Object3D, number>();
    const walk = (o: THREE.Object3D, parentE: number): void => {
      let e = parentE;
      if ((o as THREE.Bone).isBone) {
        const field = BONE_FIELD[o.name];
        if (field) e = prof[field];
        if (e !== parentE) o.scale.multiplyScalar(e / parentE);
        eOf.set(o, e);
      }
      for (const c of o.children) walk(c, e);
    };
    walk(this.top, 1);

    const v = new THREE.Vector3();
    // the sole follows the foot's own scale: it sat `bindFootY` below the foot joint
    const footE = this.foot ? eOf.get(this.foot) ?? 1 : 1;
    const sole = this.foot ? armaturePosition(this.foot, this.top, v).y - this.bindFootY * footE : 0;
    // lower the pelvis by the gap (the root bone is turned, so go through its rotation)
    if (this.pelvis) {
      const down = new THREE.Vector3(0, -sole, 0).applyQuaternion(this.top.quaternion.clone().invert());
      this.pelvis.position.add(down);
    }
    const pelvisY = this.pelvis ? armaturePosition(this.pelvis, this.top, v).y : this.bindPelvisY;
    const headE = this.head ? eOf.get(this.head) ?? 1 : 1;
    const headY = this.head ? armaturePosition(this.head, this.top, v).y : this.bindHeadY;
    const crown = headY + this.crownAboveHead * headE;
    return {
      rootScale: (prof.height * this.bodyHeight) / crown,
      hipRatio: pelvisY / this.bindPelvisY,
      crownAboveHead: this.crownAboveHead * headE,
      headScale: headE,
    };
  }
}
