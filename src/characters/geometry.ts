// MeshData -> THREE.BufferGeometry conversion for skinned character parts.

import * as THREE from 'three';
import type { MeshData } from './meshData';

/** Generous object-space bounds that contain every pose (standing, seated, lying) of a character. */
export const CHARACTER_BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.8, -0.2), 2.2);

/**
 * Builds an indexed, skinned BufferGeometry. Morph targets are stored as relative deltas
 * (`morphTargetsRelative`) and named through `userData.morphNames` (mesh.morphTargetDictionary).
 * Morph targets that are zero everywhere are dropped to keep GPU memory and shader work down.
 */
export function toGeometry(m: MeshData, name = ''): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.name = name;
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.skinWeight, 4));
  for (const [k, a] of Object.entries(m.attrs)) g.setAttribute(k, new THREE.Float32BufferAttribute(a.data, a.size));
  const n = m.positions.length / 3;
  const targets: THREE.BufferAttribute[] = [];
  const names: string[] = [];
  for (const [k, d] of Object.entries(m.morphs)) {
    if (d.length !== n * 3) continue;
    let any = false;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i] as number) > 1e-7) { any = true; break; }
    if (!any) continue;
    const attr = new THREE.Float32BufferAttribute(d, 3);
    attr.name = k;
    targets.push(attr);
    names.push(k);
  }
  if (targets.length) {
    g.morphAttributes.position = targets;
    g.morphTargetsRelative = true;
  }
  g.userData.morphNames = names;
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(m.indices, 1) : new THREE.Uint16BufferAttribute(m.indices, 1));
  g.boundingSphere = CHARACTER_BOUNDS.clone();
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.5, -2), new THREE.Vector3(1.2, 2.3, 1.2));
  return g;
}

/** Triangle count of an indexed or non-indexed geometry. */
export function triangleCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
}
