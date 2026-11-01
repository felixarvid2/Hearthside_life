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
  let idx = h.index as Uint32Array;
  // generated hair has many non-manifold edges (curls, locs): when the strict simplifier stalls above the target, the permissive mode finishes the job
  for (const flags of [['Prune', 'ErrorAbsolute'], ['ErrorAbsolute', 'Permissive']] as const) {
    const [r] = MeshoptSimplifier.simplifyWithAttributes(h.index, h.pos, 3, h.uv, 2, [0.6, 0.6], new Uint8Array(n), Math.min(tris * 3, h.index.length), 0.02, [...flags]);
    if (r.length === 0) continue;
    idx = r;
    if (idx.length <= tris * 3 * 1.03) break;
  }
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
    const l = Math.hypot(x, y, z);
    // a vertex of degenerate triangles only: face outward from the head centre
    if (l < 1e-9) { const px = h.pos[i * 3] as number, py = (h.pos[i * 3 + 1] as number) - 0.09, pz = h.pos[i * 3 + 2] as number, pl = Math.hypot(px, py, pz) || 1; out[i * 3] = px / pl; out[i * 3 + 1] = py / pl; out[i * 3 + 2] = pz / pl; continue; }
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

/** Texel block (size px at `size` resolution) that no triangle of the mesh uses; null when the map is full. */
export function freeUvBlock(h: HairMesh, size: number, block: number): { u: number; v: number } | null {
  const used = new Uint8Array(size * size);
  for (let t = 0; t < h.index.length; t += 3) {
    const p = [0, 1, 2].map((k) => [(h.uv[(h.index[t + k] as number) * 2] as number) * size, (h.uv[(h.index[t + k] as number) * 2 + 1] as number) * size]);
    const x0 = Math.max(0, Math.floor(Math.min(p[0]![0]!, p[1]![0]!, p[2]![0]!)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(p[0]![0]!, p[1]![0]!, p[2]![0]!)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(p[0]![1]!, p[1]![1]!, p[2]![1]!)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(p[0]![1]!, p[1]![1]!, p[2]![1]!)) + 1);
    const [a, b, c] = p as [number[], number[], number[]];
    const den = (b[1]! - c[1]!) * (a[0]! - c[0]!) + (c[0]! - b[0]!) * (a[1]! - c[1]!);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((b[1]! - c[1]!) * (px - c[0]!) + (c[0]! - b[0]!) * (py - c[1]!)) / den;
      const l2 = ((c[1]! - a[1]!) * (px - c[0]!) + (a[0]! - c[0]!) * (py - c[1]!)) / den;
      const m = -0.12;
      if (l1 >= m && l2 >= m && 1 - l1 - l2 >= m) used[y * size + x] = 1;
    }
  }
  // dilate by the block margin through a summed-area table, then take the first free block
  const sat = new Int32Array((size + 1) * (size + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) sat[(y + 1) * (size + 1) + x + 1] = (used[y * size + x] as number) + (sat[y * (size + 1) + x + 1] as number) + (sat[(y + 1) * (size + 1) + x] as number) - (sat[y * (size + 1) + x] as number);
  const pad = 3;
  for (let y = pad; y + block + pad <= size; y += 4) for (let x = pad; x + block + pad <= size; x += 4) {
    const x0 = x - pad, y0 = y - pad, x1 = x + block + pad, y1 = y + block + pad;
    const n = (sat[y1 * (size + 1) + x1] as number) - (sat[y0 * (size + 1) + x1] as number) - (sat[y1 * (size + 1) + x0] as number) + (sat[y0 * (size + 1) + x0] as number);
    if (n === 0) return { u: x / size, v: y / size };
  }
  return null;
}

/**
 * A thin scalp cap on the head surface from a hairline up over the crown, UV-mapped into a free block of the tint map: it
 * keeps the skull covered under generated hair that leaves bare patches (puffs, ponytails, short crops).
 */
export function scalpCap(hs: Record<string, any>, hair: Record<string, any>, opts: { hairline: string; fringe: number; minY?: number; offset: number; block: { u: number; v: number }; blockSize: number; size: number; cols?: number; rows?: number }): HairMesh {
  const cols = opts.cols ?? 30, rows = opts.rows ?? 9;
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  const hx = hs.H_MAX as number, dome = hs.DOME_START as number;
  for (let i = 0; i < cols; i++) {
    const th = -Math.PI + ((i + 0.5) / cols) * Math.PI * 2;
    const y0 = Math.max(hair.hairlineY(th, opts.hairline, opts.fringe) as number, opts.minY ?? -1);
    for (let j = 0; j <= rows; j++) {
      const h = Math.min(y0, dome) + ((hx - Math.min(y0, dome)) * j) / rows;
      const p = hs.headPoint(th, h) as number[], n = hs.headNormal(th, h) as number[];
      pos.push(p[0]! + n[0]! * opts.offset, p[1]! + n[1]! * opts.offset, p[2]! + n[2]! * opts.offset);
      // one block texel row per cap row: the block holds a flat tint, so the exact coordinates do not matter
      const u = opts.block.u + (opts.blockSize / opts.size) * (0.15 + 0.7 * ((i % 4) / 3)), v = opts.block.v + (opts.blockSize / opts.size) * (0.15 + 0.7 * (j / rows));
      uv.push(u, v);
    }
  }
  const W = rows + 1;
  for (let i = 0; i < cols; i++) {
    const i2 = (i + 1) % cols;
    for (let j = 0; j < rows; j++) { const a = i * W + j, b = i2 * W + j, c = i * W + j + 1, d = i2 * W + j + 1; index.push(a, b, c, b, d, c); }
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), index: Uint32Array.from(index) };
}

export function mergeMeshes(a: HairMesh, b: HairMesh): HairMesh {
  const n = a.pos.length / 3;
  const pos = new Float32Array(a.pos.length + b.pos.length); pos.set(a.pos); pos.set(b.pos, a.pos.length);
  const uv = new Float32Array(a.uv.length + b.uv.length); uv.set(a.uv); uv.set(b.uv, a.uv.length);
  const index = new Uint32Array(a.index.length + b.index.length); index.set(a.index); for (let i = 0; i < b.index.length; i++) index[a.index.length + i] = (b.index[i] as number) + n;
  return { pos, uv, index };
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
