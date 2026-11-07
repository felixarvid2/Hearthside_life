// Hip retargeting of the shared animation clips. The clips were authored on a rig whose pelvis bone sits at
// `RigProfile.clipPelvisHeight` above the root; a body with other proportions gets the clips' `.position` tracks scaled by
// the ratio of its own pelvis rest height to that, so its feet stay on the floor. Rotation tracks are shared, not copied.

import * as THREE from 'three';

/** Ratios closer to 1 than this use the original clips. */
export const RETARGET_EPSILON = 1e-3;

/** Source clip -> (ratio in 1e-4 steps -> scaled clip). Module-level so every character on the same body shares one set. */
const scaled = new WeakMap<THREE.AnimationClip, Map<number, THREE.AnimationClip>>();

/** Ratio of the body's pelvis rest height to the clips' (1 when the rig declares none or the difference is negligible). */
export function hipRatio(bodyPelvisHeight: number, clipPelvisHeight: number | undefined): number {
  if (!clipPelvisHeight || !(bodyPelvisHeight > 0)) return 1;
  const r = bodyPelvisHeight / clipPelvisHeight;
  return Math.abs(r - 1) < RETARGET_EPSILON ? 1 : r;
}

/** One clip with its `.position` tracks multiplied by `ratio`; rotation and other tracks are the source's own objects. */
function scaledClip(src: THREE.AnimationClip, key: number): THREE.AnimationClip {
  let byRatio = scaled.get(src);
  if (!byRatio) { byRatio = new Map(); scaled.set(src, byRatio); }
  let out = byRatio.get(key);
  if (!out) {
    const ratio = key / 1e4;
    const tracks = src.tracks.map((tr) => {
      if (!tr.name.endsWith('.position')) return tr;
      const c = tr.clone();
      const v = c.values;
      for (let i = 0; i < v.length; i++) v[i] = v[i]! * ratio;
      return c;
    });
    out = new THREE.AnimationClip(src.name, src.duration, tracks, src.blendMode);
    out.userData = {}; // the Animator caches masked variants here: never share the source's
    byRatio.set(key, out);
  }
  return out;
}

/** The clips with hip height scaled by `ratio` (rounded to 1e-4); the same source clip and ratio always give the same object. */
export function scaledClipsFor(clips: ReadonlyMap<string, THREE.AnimationClip>, ratio: number): Map<string, THREE.AnimationClip> {
  const key = Math.round(ratio * 1e4);
  const out = new Map<string, THREE.AnimationClip>();
  for (const [name, c] of clips) out.set(name, key === 1e4 ? c : scaledClip(c, key));
  return out;
}
