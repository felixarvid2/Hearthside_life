// Hair-only model -> game GLB: head-local positions, simplified, smooth normals, root-darkening vertex colour, 512 px tint map.

import { Document, NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RawModel, Vec3 } from './mesh.mts';
import { applyTransform } from './register.mts';
import type { DistanceField, Transform } from './register.mts';

export interface HairMesh {
  pos: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
}

/** Keeps the triangles flagged in `keep`, moves them into head-local space and renumbers the vertices. */
export function extractHair(m: RawModel, keep: Uint8Array, T: Transform): HairMesh {
  const remap = new Map<number, number>();
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  const q: Vec3 = [0, 0, 0];
  for (let t = 0; t < keep.length; t++) {
    if (!keep[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = m.index[t * 3 + k] as number;
      let r = remap.get(v);
      if (r === undefined) {
        r = pos.length / 3;
        remap.set(v, r);
        applyTransform(T, m.pos, v * 3, q);
        pos.push(q[0], q[1], q[2]);
        uv.push(m.uv[v * 2] as number, m.uv[v * 2 + 1] as number);
      }
      index.push(r);
    }
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), index: Uint32Array.from(index) };
}

/** Simplifies to about `tris` triangles; UVs ride along as attributes so the tint map stays on the strands. */
export async function simplifyHair(h: HairMesh, tris: number): Promise<HairMesh> {
  await MeshoptSimplifier.ready;
  const n = h.pos.length / 3;
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(h.index, h.pos, 3, h.uv, 2, [0.6, 0.6], new Uint8Array(n), tris * 3, 0.02, ['Prune', 'ErrorAbsolute']);
  const map = new Map<number, number>();
  const pos: number[] = [], uv: number[] = [];
  const index = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let r = map.get(idx[i] as number);
    if (r === undefined) {
      r = pos.length / 3;
      map.set(idx[i] as number, r);
      const v = idx[i] as number;
      pos.push(h.pos[v * 3] as number, h.pos[v * 3 + 1] as number, h.pos[v * 3 + 2] as number);
      uv.push(h.uv[v * 2] as number, h.uv[v * 2 + 1] as number);
    }
    index[i] = r;
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), index };
}

/** Smooth vertex normals (angle-weighted, shared across vertices at the same position so UV seams do not show). */
export function smoothNormals(h: HairMesh): Float32Array {
  const n = h.pos.length / 3;
  const key = new Map<string, number>();
  const group = new Uint32Array(n);
  let ng = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round((h.pos[i * 3] as number) * 1e5)},${Math.round((h.pos[i * 3 + 1] as number) * 1e5)},${Math.round((h.pos[i * 3 + 2] as number) * 1e5)}`;
    let g = key.get(k);
    if (g === undefined) { g = ng++; key.set(k, g); }
    group[i] = g;
  }
  const acc = new Float64Array(ng * 3);
  for (let t = 0; t < h.index.length; t += 3) {
    const ids = [h.index[t] as number, h.index[t + 1] as number, h.index[t + 2] as number];
    const p = ids.map((i) => [h.pos[i * 3] as number, h.pos[i * 3 + 1] as number, h.pos[i * 3 + 2] as number]);
    for (let c = 0; c < 3; c++) {
      const a = p[c] as number[], b = p[(c + 1) % 3] as number[], d = p[(c + 2) % 3] as number[];
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], e2 = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
      const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!, ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!, nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
      const len = Math.hypot(nx, ny, nz) || 1;
      const l1 = Math.hypot(e1[0]!, e1[1]!, e1[2]!) || 1, l2 = Math.hypot(e2[0]!, e2[1]!, e2[2]!) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (e1[0]! * e2[0]! + e1[1]! * e2[1]! + e1[2]! * e2[2]!) / (l1 * l2))));
      const g = group[ids[c] as number] as number;
      acc[g * 3] = (acc[g * 3] as number) + (nx / len) * ang;
      acc[g * 3 + 1] = (acc[g * 3 + 1] as number) + (ny / len) * ang;
      acc[g * 3 + 2] = (acc[g * 3 + 2] as number) + (nz / len) * ang;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const g = group[i] as number;
    const x = acc[g * 3] as number, y = acc[g * 3 + 1] as number, z = acc[g * 3 + 2] as number;
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  return out;
}

/** Orients the normals away from the head: hair is a double-sided shell, the light must see its outer face as the front. */
export function orientNormals(h: HairMesh, normals: Float32Array): void {
  for (let i = 0; i < normals.length / 3; i++) {
    const x = h.pos[i * 3] as number, y = (h.pos[i * 3 + 1] as number) - 0.09, z = h.pos[i * 3 + 2] as number;
    if (x * (normals[i * 3] as number) + y * (normals[i * 3 + 1] as number) + z * (normals[i * 3 + 2] as number) < 0) {
      normals[i * 3] = -(normals[i * 3] as number); normals[i * 3 + 1] = -(normals[i * 3 + 1] as number); normals[i * 3 + 2] = -(normals[i * 3 + 2] as number);
    }
  }
}

/** Root darkening: close to the scalp the hair is darker (ambient occlusion and root shade), free hair is full brightness. */
export function rootShade(h: HairMesh, surface: DistanceField): Uint8Array {
  const n = h.pos.length / 3;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const d = surface.at(h.pos[i * 3] as number, h.pos[i * 3 + 1] as number, h.pos[i * 3 + 2] as number);
    const t = Math.max(0, Math.min(1, (d - 0.003) / 0.032));
    const v = 0.58 + 0.42 * (t * t * (3 - 2 * t));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = Math.round(v * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

export interface HairGlb { id: string; mesh: HairMesh; normals: Float32Array; colors: Uint8Array; tint: Buffer; tintSize: number; extras: Record<string, unknown> }

export async function writeHairGlb(file: string, g: HairGlb): Promise<number> {
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'hearthside tools/build-ai-hair.mts';
  const buffer = doc.createBuffer();
  const acc = (type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR', array: Float32Array | Uint16Array | Uint8Array, normalized = false) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer).setNormalized(normalized);
  const png = await sharp(g.tint, { raw: { width: g.tintSize, height: g.tintSize, channels: 3 } }).webp({ quality: 86, effort: 6 }).toBuffer();
  const tex = doc.createTexture('tint').setImage(png).setMimeType('image/webp');
  const mat = doc.createMaterial('AiHair').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(0.62).setDoubleSided(true);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', g.mesh.pos))
    .setAttribute('NORMAL', acc('VEC3', g.normals))
    .setAttribute('TEXCOORD_0', acc('VEC2', g.mesh.uv))
    .setAttribute('COLOR_0', acc('VEC4', g.colors, true))
    .setIndices(acc('SCALAR', Uint16Array.from(g.mesh.index)))
    .setMaterial(mat);
  const mesh = doc.createMesh(g.id).addPrimitive(prim);
  const node = doc.createNode(g.id).setMesh(mesh).setExtras({ aiHair: g.extras });
  doc.createScene().addChild(node);
  mkdirSync(dirname(file), { recursive: true });
  const io = new NodeIO().registerExtensions([EXTTextureWebP]);
  const bytes = await io.writeBinary(doc);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, bytes);
  return bytes.length;
}
