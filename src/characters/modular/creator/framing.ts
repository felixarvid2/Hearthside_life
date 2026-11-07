// Adapted from CharacterStudio (https://github.com/M3-org/CharacterStudio), src/library/cameraFrameManager.js, commit 293182b.
//
// MIT License
//
// Copyright (c) 2022 Atlas Foundation
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// What changed: CharacterStudio frames a shot between a bottom and a top VRM humanoid bone (frameShot / setCameraFrameWithName)
// with offsets measured from skin weights and a fixed vertical extent. Here the shot's bones are our rig joints (Head,
// spine_01, hand_l/r, foot_l/r, ...), every bone is a point with a padding radius, and the camera distance is solved exactly
// for the perspective frustum on the limiting axis, so portrait and landscape both fit. Pure functions, no renderer.
// Dropped: the async skin-weight offset scan (calculateBoneOffsets) and the VRM-only camera helpers; the original has no
// camera transition, the creator's own easing (render/creatorScene.ts) stays in charge of that.

import * as THREE from 'three';

export type Shot = 'face' | 'upper' | 'full';

export interface ShotSpec {
  /** Joint names whose world positions must be inside the frame. 'crown' is the estimated top of the head. */
  bones: readonly string[];
  /** Radius (metres) around each point that must also fit: limbs and the head have thickness the joint does not show. */
  pad: number;
}

/** The bones of each shot (our rig joint names). */
export const SHOTS: Record<Shot, ShotSpec> = {
  face: { bones: ['Head', 'crown'], pad: 0.1 },
  upper: { bones: ['crown', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'spine_01', 'hand_l', 'hand_r'], pad: 0.1 },
  full: { bones: ['crown', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'], pad: 0.08 },
};

/** Camera direction used by the creator: from the target towards the camera, +Z with a slight rise (render/creatorScene.ts). */
export const FRONT = new THREE.Vector3(0, 0.1, 1).normalize();

export interface FrameOptions {
  /** Direction from the target to the camera (any length). Default FRONT. */
  direction?: THREE.Vector3;
  /** Extra room around the shot as a fraction of its half extent. Default 0.12. */
  margin?: number;
  /** Metres from the Head joint to the crown of the head. Default 0.16. */
  crownAbove?: number;
}

export interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
}

/** World positions of a shot's bones that exist under `root` (the crown is estimated above the Head joint). */
export function shotPoints(root: THREE.Object3D, shot: Shot, crownAbove = 0.16): THREE.Vector3[] {
  root.updateWorldMatrix(true, true);
  const out: THREE.Vector3[] = [];
  for (const name of SHOTS[shot].bones) {
    if (name === 'crown') {
      const head = root.getObjectByName('Head');
      if (head) out.push(head.getWorldPosition(new THREE.Vector3()).addScaledVector(new THREE.Vector3(0, 1, 0), crownAbove));
      continue;
    }
    const b = root.getObjectByName(name);
    if (b) out.push(b.getWorldPosition(new THREE.Vector3()));
  }
  return out;
}

/**
 * Camera position and look target that fit `points` (each with a `pad` radius) into the view of a camera with this vertical
 * fov (degrees) and aspect, seen from `direction`. The distance is the smallest one for which every point is inside the
 * frustum, so the limiting axis (vertical in landscape, horizontal in portrait) decides.
 */
export function fitPoints(points: readonly THREE.Vector3[], fov: number, aspect: number, pad: number, opts: FrameOptions = {}): Framing | null {
  if (points.length === 0) return null;
  const margin = opts.margin ?? 0.12;
  const dir = (opts.direction ?? FRONT).clone().normalize();
  // camera basis: z towards the camera, y up as close to world up as the direction allows
  const right = new THREE.Vector3().crossVectors(Math.abs(dir.y) > 0.999 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0), dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const proj = points.map((p) => {
    const x = p.dot(right), y = p.dot(up), z = p.dot(dir);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    return { x, y, z };
  });
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const tanV = Math.tan((fov * Math.PI) / 360), tanH = tanV * aspect;
  const zMid = proj.reduce((s, p) => s + p.z, 0) / proj.length;
  // a point at offset (x, y) and depth z (towards the camera) is inside when |x| <= tanH * (D - z) and |y| <= tanV * (D - z)
  let dist = 0;
  for (const p of proj) {
    const ex = (Math.abs(p.x - cx) + pad) * (1 + margin), ey = (Math.abs(p.y - cy) + pad) * (1 + margin);
    dist = Math.max(dist, p.z - zMid + ex / tanH, p.z - zMid + ey / tanV);
  }
  const target = new THREE.Vector3().addScaledVector(right, cx).addScaledVector(up, cy).addScaledVector(dir, zMid);
  return { position: target.clone().addScaledVector(dir, dist), target, distance: dist };
}

/** Frames `shot` of the character under `root`. Null when none of the shot's bones exist. */
export function frameShot(camera: THREE.PerspectiveCamera, root: THREE.Object3D, shot: Shot, opts: FrameOptions = {}): Framing | null {
  return fitPoints(shotPoints(root, shot, opts.crownAbove), camera.fov, camera.aspect, SHOTS[shot].pad, opts);
}

/** Puts the camera on a framing (position, look-at, projection). */
export function applyFraming(camera: THREE.PerspectiveCamera, f: Framing): void {
  camera.position.copy(f.position);
  camera.lookAt(f.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Frame and apply in one step. */
export function frameCamera(camera: THREE.PerspectiveCamera, root: THREE.Object3D, shot: Shot, opts: FrameOptions = {}): Framing | null {
  const f = frameShot(camera, root, shot, opts);
  if (f) applyFraming(camera, f);
  return f;
}
