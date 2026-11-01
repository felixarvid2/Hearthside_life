// Raw TRELLIS GLB -> typed arrays (positions, uv, indices, albedo pixels) and small mesh helpers for the hair build.

import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

export type Vec3 = [number, number, number];

export interface RawModel {
  pos: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
  tex: { w: number; h: number; rgb: Uint8Array };
}

export async function readModel(file: string): Promise<RawModel> {
  const doc = await new NodeIO().read(file);
  const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const img = await sharp(Buffer.from(prim.getMaterial()!.getBaseColorTexture()!.getImage()!)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    pos: new Float32Array(prim.getAttribute('POSITION')!.getArray()!),
    uv: new Float32Array(prim.getAttribute('TEXCOORD_0')!.getArray()!),
    index: new Uint32Array(prim.getIndices()!.getArray()!),
    tex: { w: img.info.width, h: img.info.height, rgb: new Uint8Array(img.data) },
  };
}

/** Bilinear texel colour (0..1 sRGB) at a glTF uv (origin top left). */
export function sampleTex(t: RawModel['tex'], u: number, v: number, out: Vec3): Vec3 {
  const x = Math.min(t.w - 1.001, Math.max(0, u * t.w - 0.5)), y = Math.min(t.h - 1.001, Math.max(0, v * t.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let c = 0; c < 3; c++) {
    const g = (xx: number, yy: number) => t.rgb[(yy * t.w + xx) * 3 + c] as number;
    out[c] = ((g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy) / 255;
  }
  return out;
}

/** Vertex -> vertex adjacency lists of a triangle index (duplicated UV-seam vertices stay separate: use `welded` first). */
export function adjacency(n: number, index: ArrayLike<number>): number[][] {
  const adj: Array<Set<number>> = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] as number, b = index[t + 1] as number, c = index[t + 2] as number;
    adj[a]!.add(b); adj[a]!.add(c); adj[b]!.add(a); adj[b]!.add(c); adj[c]!.add(a); adj[c]!.add(b);
  }
  return adj.map((s) => [...s]);
}

/** Maps vertices sharing a position (UV seams) to one representative. */
export function weldMap(pos: ArrayLike<number>, q = 1e5): { rep: Uint32Array; count: number } {
  const n = pos.length / 3;
  const key = new Map<string, number>();
  const rep = new Uint32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round((pos[i * 3] as number) * q)},${Math.round((pos[i * 3 + 1] as number) * q)},${Math.round((pos[i * 3 + 2] as number) * q)}`;
    let r = key.get(k);
    if (r === undefined) { r = i; key.set(k, i); count++; }
    rep[i] = r;
  }
  return { rep, count };
}
