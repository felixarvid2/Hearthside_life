// Test helper: reads a body GLB in Node with @gltf-transform (dev dependency) into the generators' RawBody.
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { fileURLToPath } from 'node:url';
import type { MeshyExtras } from '../../../src/characters/meshyBody';
import type { RawBody, Vec3 } from '../../../src/characters/rig';

const root = fileURLToPath(new URL('../../../public/assets/characters/', import.meta.url));

export async function loadRawBody(frame: 'a' | 'b'): Promise<RawBody> {
  const doc = await new NodeIO().read(`${root}body_${frame}.glb`);
  const r = doc.getRoot();
  const skin = r.listSkins()[0]!;
  const joints = skin.listJoints();
  const prim = r.listMeshes()[0]!.listPrimitives()[0]!;
  const positions = new Float32Array(prim.getAttribute('POSITION')!.getArray()!);
  const J = prim.getAttribute('JOINTS_0')!.getArray()!;
  const W = prim.getAttribute('WEIGHTS_0')!.getArray()!;
  const scale = W instanceof Float32Array ? 1 : W instanceof Uint8Array ? 255 : 65535;
  const weights = new Float32Array(W.length);
  for (let i = 0; i < W.length; i += 4) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += (W[i + k] as number) / scale;
    for (let k = 0; k < 4; k++) weights[i + k] = (W[i + k] as number) / scale / (s || 1);
  }
  const bonePos: Vec3[] = joints.map((j) => { const m = j.getWorldMatrix(); return [m[12], m[13], m[14]]; });
  return {
    frame, positions, joints: new Uint16Array(J), weights, index: new Uint32Array(prim.getIndices()!.getArray()!),
    boneNames: joints.map((j) => j.getName()), bonePos,
    boneParent: joints.map((j) => { const p = j.getParentNode(); return p ? joints.indexOf(p) : -1; }),
  };
}

/** A built Meshy body GLB (public/assets/characters/meshy_*.glb): the generators' RawBody plus the extra mesh data and textures. */
export async function loadMeshyBody(frame: 'a' | 'b') {
  const doc = await new NodeIO().registerExtensions([EXTTextureWebP]).read(`${root}meshy_${frame}.glb`);
  const r = doc.getRoot();
  const skin = r.listSkins()[0]!;
  const joints = skin.listJoints();
  const prim = r.listMeshes()[0]!.listPrimitives()[0]!;
  const bonePos: Vec3[] = joints.map((j) => { const m = j.getWorldMatrix(); return [m[12], m[13], m[14]]; });
  const raw: RawBody = {
    frame, positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!), joints: new Uint16Array(prim.getAttribute('JOINTS_0')!.getArray()!),
    weights: new Float32Array(prim.getAttribute('WEIGHTS_0')!.getArray()!), index: new Uint32Array(prim.getIndices()!.getArray()!),
    boneNames: joints.map((j) => j.getName()), bonePos, boneParent: joints.map((j) => { const p = j.getParentNode(); return p ? joints.indexOf(p as never) : -1; }),
  };
  const mat = prim.getMaterial()!;
  return {
    raw, doc,
    normals: new Float32Array(prim.getAttribute('NORMAL')!.getArray()!),
    uv: new Float32Array(prim.getAttribute('TEXCOORD_0')!.getArray()!),
    extras: r.listNodes().find((n) => n.getMesh())!.getExtras().meshyBody as MeshyExtras,
    albedo: mat.getBaseColorTexture()!, mask: mat.getOcclusionTexture()!,
  };
}
