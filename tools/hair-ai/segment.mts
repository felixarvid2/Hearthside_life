// Splits a TRELLIS "hair on a grey mannequin head" model into hair and mannequin. The mannequin is neutral grey and the
// hair is generated in a chromatic mid brown, so the texel chroma separates them; vertices that are dark and neutral
// (shadowed hair under a bun, shadowed mannequin under the chin) are decided by their neighbours on the surface.

import type { RawModel, Vec3 } from './mesh.mts';
import { adjacency, sampleTex, weldMap } from './mesh.mts';
import { DistanceField } from './register.mts';

export interface Segmentation {
  /** Per vertex: 1 hair, 0 mannequin (after propagation). */
  hair: Uint8Array;
  /** Per triangle: kept as hair. */
  keepTri: Uint8Array;
  /** Per vertex colour chroma relative to brightness. */
  chroma: Float32Array;
  stats: { hairTris: number; headTris: number; floaterTris: number };
}

/** Chroma relative to brightness of an sRGB colour: about 0 for greys, 0.3 .. 0.6 for brown hair. */
export function relChroma(c: Vec3): number {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  return (mx - mn) / (mx + 0.04);
}

export function segment(m: RawModel, opts: { hairAbove?: number } = {}): Segmentation {
  const n = m.pos.length / 3;
  const { rep } = weldMap(m.pos);
  // average chroma over the duplicated vertices of a position
  const sum = new Float32Array(n), cnt = new Float32Array(n), lsum = new Float32Array(n);
  const c: Vec3 = [0, 0, 0];
  for (let i = 0; i < n; i++) { sampleTex(m.tex, m.uv[i * 2] as number, m.uv[i * 2 + 1] as number, c); const r = rep[i] as number; sum[r] = (sum[r] as number) + relChroma(c); cnt[r] = (cnt[r] as number) + 1; lsum[r] = (lsum[r] as number) + Math.max(c[0], c[1], c[2]); }
  const chroma = new Float32Array(n), lum = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = rep[i] as number; chroma[i] = (sum[r] as number) / (cnt[r] as number); lum[i] = (lsum[r] as number) / (cnt[r] as number); }
  // welded adjacency
  const widx = Uint32Array.from(m.index, (v) => rep[v] as number);
  const adj = adjacency(n, widx);
  const p = new Float32Array(n).fill(0.5);
  const fixed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (rep[i] !== i) continue;
    if (chroma[i]! > 0.16) { p[i] = 1; fixed[i] = 1; } else if (chroma[i]! < 0.07 && lum[i]! > 0.3) { p[i] = 0; fixed[i] = 1; }
  }
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < n; i++) {
      if (rep[i] !== i || fixed[i]) continue;
      const a = adj[i]!;
      if (!a.length) continue;
      let s = 0;
      for (const j of a) s += p[j] as number;
      p[i] = s / a.length;
    }
  }
  const hair = new Uint8Array(n);
  for (let i = 0; i < n; i++) hair[i] = (p[rep[i] as number] as number) > 0.5 ? 1 : 0;
  // dark neutral vertices touching the mannequin (its shaded bust, chin and cheeks) are mannequin, not hair
  const sure: number[] = [];
  for (let i = 0; i < n; i++) if (rep[i] === i && p[i] === 0 && chroma[i]! < 0.07 && lum[i]! > 0.3) sure.push(m.pos[i * 3] as number, m.pos[i * 3 + 1] as number, m.pos[i * 3 + 2] as number);
  const near = new DistanceField(sure, [-0.7, -0.7, -0.7], [0.7, 0.7, 0.7], 0.01);
  for (let i = 0; i < n; i++) {
    const r = rep[i] as number;
    if ((p[r] as number) > 0.5 && chroma[i]! <= 0.1 && lum[i]! < 0.24 && near.at(m.pos[i * 3] as number, m.pos[i * 3 + 1] as number, m.pos[i * 3 + 2] as number) < 0.025) p[r] = 0;
  }
  const hair2 = new Uint8Array(n);
  for (let i = 0; i < n; i++) hair2[i] = (p[rep[i] as number] as number) > 0.5 ? 1 : 0;
  hair.set(hair2);
  // triangles: all three vertices hair (the border ring of mixed grey/brown texels is dropped)
  const nt = m.index.length / 3;
  const keep = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = m.index[t * 3] as number, b = m.index[t * 3 + 1] as number, d = m.index[t * 3 + 2] as number;
    // the grey fringe of mixed texels at the mannequin border is dropped, but dark texels (the shaded back of the hair) carry no chroma and stay
    const ok = (v: number) => chroma[v]! > 0.1 || lum[v]! < 0.24;
    if (hair[a] && hair[b] && hair[d] && ok(a) && ok(b) && ok(d)) keep[t] = 1;
  }
  // drop floaters: connected components (by welded vertices) much smaller than the largest
  const comp = new Int32Array(n).fill(-1);
  const tv = new Map<number, number[]>();
  for (let t = 0; t < nt; t++) if (keep[t]) for (let k = 0; k < 3; k++) { const v = widx[t * 3 + k] as number; (tv.get(v) ?? tv.set(v, []).get(v)!).push(t); }
  const sizes: number[] = [];
  const triComp = new Int32Array(nt).fill(-1);
  for (let t0 = 0; t0 < nt; t0++) {
    if (!keep[t0] || triComp[t0]! >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [t0];
    triComp[t0] = id;
    while (stack.length) {
      const t = stack.pop() as number;
      size++;
      for (let k = 0; k < 3; k++) for (const u of tv.get(widx[t * 3 + k] as number) ?? []) if (triComp[u]! < 0) { triComp[u] = id; stack.push(u); }
    }
    sizes.push(size);
  }
  void comp;
  const biggest = Math.max(0, ...sizes);
  let floater = 0, hairTris = 0;
  for (let t = 0; t < nt; t++) {
    if (!keep[t]) continue;
    if ((sizes[triComp[t] as number] as number) < Math.max(40, biggest * 0.02)) { keep[t] = 0; floater++; } else hairTris++;
  }
  void opts;
  return { hair, keepTri: keep, chroma, stats: { hairTris, headTris: nt - hairTris - floater, floaterTris: floater } };
}
