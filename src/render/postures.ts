// Posture alignment: where a seated or lying character's root must go so the body meets a furniture slot
// anchor (seat centre at seat height, mattress centre at mattress height).
//
// The numbers are measured once at start-up from the actual clips on a temporary CharacterView (pelvis,
// head and feet bone positions in the sitting pose and the lying pose), so they stay right when the
// character module changes its clips. Slot heights in content were ray-cast from the scaled furniture models.

import * as THREE from 'three';
import type { CharacterAssets } from '../characters/assets';
import { CharacterView } from '../characters/CharacterView';
import type { ContentDB } from '../content/types';
import type { Appearance, Outfit } from '../core/types';

export interface PostureAnchors {
  /** Sitting pose: height of the seat contact (buttocks) above the root, and the pelvis offset along the facing. */
  seatContact: number;
  seatForward: number;
  /** Lying pose: height of the back contact above the root; the body's mid point (head..feet) in root space
   *  (x right, z forward of the root's facing); and the head-to-feet direction angle relative to the root facing. */
  lieContact: number;
  lieMidX: number;
  lieMidZ: number;
  lieAxis: number;
}

/** Conservative defaults used until (or if) the measurement fails. */
export const DEFAULT_POSTURE_ANCHORS: PostureAnchors = { seatContact: 0.45, seatForward: -0.12, lieContact: 0.1, lieMidX: 0, lieMidZ: -0.85, lieAxis: Math.PI };

/** Pelvis bone origin to the seat surface under it (flesh + garment). */
const PELVIS_TO_SEAT = 0.11;
/** Spine/pelvis bone line to the back surface when lying. */
const BONE_TO_BACK = 0.1;

function boneWorld(root: THREE.Object3D, name: string, out: THREE.Vector3): THREE.Vector3 | null {
  const b = root.getObjectByName(name);
  if (!b) return null;
  b.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(b.matrixWorld);
}

export function measurePostureAnchors(assets: CharacterAssets, content: ContentDB, appearance: Appearance, outfit: Outfit): PostureAnchors {
  const out = { ...DEFAULT_POSTURE_ANCHORS };
  let view: CharacterView | null = null;
  try {
    view = new CharacterView(assets, content, appearance, outfit);
    const root = view.root;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const p = new THREE.Vector3(), h = new THREE.Vector3(), fl = new THREE.Vector3(), fr = new THREE.Vector3();
    // sitting: hold the seated idle
    view.play('sitIdle', { fade: 0, posture: 'seated' });
    for (let i = 0; i < 3; i++) view.update(0.05);
    root.updateMatrixWorld(true);
    if (boneWorld(root, 'pelvis', p)) {
      out.seatContact = p.y - PELVIS_TO_SEAT;
      out.seatForward = p.z;
    }
    // lying: the sleep pose
    view.play('sleep', { fade: 0, posture: 'lying' });
    for (let i = 0; i < 3; i++) view.update(0.05);
    root.updateMatrixWorld(true);
    if (boneWorld(root, 'Head', h) && boneWorld(root, 'pelvis', p) && boneWorld(root, 'foot_l', fl) && boneWorld(root, 'foot_r', fr)) {
      const feet = fl.add(fr).multiplyScalar(0.5);
      out.lieMidX = (h.x + feet.x) / 2;
      out.lieMidZ = (h.z + feet.z) / 2;
      out.lieAxis = Math.atan2(feet.x - h.x, feet.z - h.z); // facing-style angle of head -> feet
      out.lieContact = Math.min(p.y, h.y - 0.05) - BONE_TO_BACK;
    }
  } catch (e) {
    console.warn('[render] posture measurement failed, using defaults', e);
  } finally {
    view?.dispose();
  }
  return out;
}
