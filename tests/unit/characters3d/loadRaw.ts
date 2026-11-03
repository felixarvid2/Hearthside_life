// Test helper: reads a body GLB in Node with @gltf-transform (dev dependency) into the generators' RawBody.
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import type { MpfbExtras, MpfbPart, MpfbPrim } from '../../../src/characters/mpfbBody';
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

/** A built AI hair GLB (public/assets/characters/hair/<id>.glb) as the runtime's AiHairData plus its tint map bytes and extras. */
export async function loadAiHairFile(id: string) {
  const doc = await new NodeIO().registerExtensions([EXTTextureWebP]).read(`${root}hair/${id}.glb`);
  const r = doc.getRoot();
  const prim = r.listMeshes()[0]!.listPrimitives()[0]!;
  const color = prim.getAttribute('COLOR_0')!;
  const shade = new Float32Array(color.getCount());
  const tmp: number[] = [0, 0, 0, 0];
  for (let i = 0; i < shade.length; i++) shade[i] = color.getElement(i, tmp)[0]!;
  const mat = prim.getMaterial()!;
  return {
    data: {
      id, positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!), normals: new Float32Array(prim.getAttribute('NORMAL')!.getArray()!),
      uv: new Float32Array(prim.getAttribute('TEXCOORD_0')!.getArray()!), shade, index: new Uint32Array(prim.getIndices()!.getArray()!),
    },
    material: mat, texture: mat.getBaseColorTexture()!, extras: r.listNodes().find((n) => n.getMesh())!.getExtras().aiHair as Record<string, unknown>,
    bytes: (await new NodeIO().registerExtensions([EXTTextureWebP]).writeBinary(doc)).length,
  };
}

/**
 * A built MPFB body GLB (public/assets/characters/mpfb_{f,m}.glb, or another body of the same format such as a life stage's
 * `mpfb_child_f`): the skin primitive's RawBody, every primitive's arrays and the extras.
 */
export async function loadMpfbBody(sex: 'f' | 'm', file = `mpfb_${sex}`) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(`${root}${file}.glb`);
  const r = doc.getRoot();
  const mesh = r.listMeshes()[0]!;
  const names = (mesh.getExtras() as { targetNames: string[] }).targetNames;
  const joints = r.listSkins()[0]!.listJoints();
  const bonePos: Vec3[] = joints.map((j) => { const m = j.getWorldMatrix(); return [m[12]!, m[13]!, m[14]!]; });
  const prims: Partial<Record<MpfbPart, MpfbPrim>> = {};
  for (const prim of mesh.listPrimitives()) {
    const part = prim.getMaterial()!.getName().replace(/^mpfb_/, '') as MpfbPart;
    const w = new Float32Array(prim.getAttribute('WEIGHTS_0')!.getArray()!);
    for (let i = 0; i < w.length; i += 4) { const s = w[i]! + w[i + 1]! + w[i + 2]! + w[i + 3]! || 1; for (let k = 0; k < 4; k++) w[i + k] = w[i + k]! / s; }
    const targets: Record<string, Float32Array> = {};
    prim.listTargets().forEach((t, i) => { targets[names[i]!] = new Float32Array(t.getAttribute('POSITION')!.getArray()!); });
    const uv = prim.getAttribute('TEXCOORD_0');
    const lips = prim.getAttribute('_LIPS');
    prims[part] = {
      lips: lips ? new Float32Array(lips.getArray()!) : null,
      positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!), normals: new Float32Array(prim.getAttribute('NORMAL')!.getArray()!),
      uv: uv ? new Float32Array(uv.getArray()!) : null, joints: new Uint16Array(prim.getAttribute('JOINTS_0')!.getArray()!), weights: w,
      index: new Uint32Array(prim.getIndices()!.getArray()!), targets,
    };
  }
  const skin = prims.skin!;
  const frame = sex === 'f' ? 'b' : 'a';
  const raw: RawBody = {
    frame, positions: skin.positions, joints: skin.joints, weights: skin.weights, index: skin.index,
    boneNames: joints.map((j) => j.getName()), bonePos, boneParent: joints.map((j) => { const p = j.getParentNode(); return p ? joints.indexOf(p as never) : -1; }),
  };
  const extras = r.listNodes().find((n) => n.getMesh())!.getExtras().mpfbBody as MpfbExtras;
  return { raw, prims, extras, names };
}
