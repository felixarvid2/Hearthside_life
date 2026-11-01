// The offline build of the AI hairstyles (tools/hair-ai): segmentation by chroma, registration of the mannequin head onto the
// parametric head, simplification that keeps the uv, the tint bake and the scalp cap. Synthetic inputs, no network, no GLB.
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { H_MAX, headColumns, headPoint, headRows } from '../../../src/characters/headShape';
import { hairlineY } from '../../../src/characters/hair';
import * as headShape from '../../../src/characters/headShape';
import * as hairMod from '../../../src/characters/hair';

// the tools are .mts files for node's type stripping: load them untyped
const dir = fileURLToPath(new URL('../../../tools/hair-ai/', import.meta.url));
let register: any, segment: any, bake: any, process_: any, styles: any;
beforeAll(async () => {
  register = await import(/* @vite-ignore */ `${dir}register.mts`);
  segment = await import(/* @vite-ignore */ `${dir}segment.mts`);
  bake = await import(/* @vite-ignore */ `${dir}bake.mts`);
  process_ = await import(/* @vite-ignore */ `${dir}process.mts`);
  styles = await import(/* @vite-ignore */ `${dir}styles.mts`);
});

describe('hair build: segmentation', () => {
  it('tells brown hair from mannequin grey, also in the shade', () => {
    const rel = segment.relChroma as (c: number[]) => number;
    expect(rel([0.8, 0.8, 0.8])).toBeLessThan(0.03);
    expect(rel([0.35, 0.35, 0.36])).toBeLessThan(0.07);
    expect(rel([0.45, 0.28, 0.18])).toBeGreaterThan(0.3);
    expect(rel([0.12, 0.07, 0.05])).toBeGreaterThan(0.3); // dark hair keeps its chroma
  });
});

describe('hair build: registration', () => {
  it('finds a known scale, shift and yaw of the head surface among outliers', { timeout: 120_000 }, () => {
    const surf: number[] = [], face: number[] = [];
    for (const h of headRows()) for (const th of headColumns(72)) {
      const p = headPoint(th, h);
      surf.push(...p);
      if (Math.abs(th) < 0.9 || h > 0.15) face.push(...p);
    }
    // a "mannequin" = the head surface seen through a known transform (inverse), plus a neck column below it
    const T = { s: [0.31, 0.34, 0.31] as [number, number, number], t: [0.004, 0.06, -0.003] as [number, number, number], yaw: 0.12 };
    const head: number[] = [];
    for (let i = 0; i < surf.length; i += 3) {
      const x = surf[i]! - T.t[0], y = surf[i + 1]! - T.t[1], z = surf[i + 2]! - T.t[2];
      const c = Math.cos(-T.yaw), s = Math.sin(-T.yaw);
      head.push((c * x + s * z) / T.s[0], y / T.s[1], (-s * x + c * z) / T.s[2]);
    }
    for (let k = 0; k < 600; k++) { const a = k * 2.4; head.push(0.18 * Math.sin(a), -0.35 - 0.0004 * k, 0.18 * Math.cos(a)); }
    const fit = register.fitHead({ head: new Float32Array(head), surface: new Float32Array(surf), face: new Float32Array(face) }, { yE: 0.0 });
    expect(fit.T.s[0]).toBeCloseTo(T.s[0], 1);
    expect(fit.T.s[1]).toBeCloseTo(T.s[1], 1);
    expect(Math.abs(fit.T.s[0] - T.s[0]) / T.s[0]).toBeLessThan(0.1);
    expect(Math.abs(fit.T.t[1] - T.t[1])).toBeLessThan(0.012);
    expect(Math.abs(fit.T.yaw - T.yaw)).toBeLessThan(0.1);
    expect(fit.cost).toBeLessThan(0.01);
  });

  it('measures distances on a voxel grid', () => {
    const f = new register.DistanceField([0, 0, 0], [-0.2, -0.2, -0.2], [0.2, 0.2, 0.2], 0.005);
    expect(f.at(0.05, 0, 0)).toBeGreaterThan(0.045);
    expect(f.at(0.05, 0, 0)).toBeLessThan(0.056);
    expect(f.at(0, 0, 0)).toBeLessThan(0.004);
    expect(f.at(5, 0, 0)).toBeGreaterThan(0.3); // outside the grid: far
  });
});

describe('hair build: mesh processing', () => {
  /** A bowl of triangles whose uv equal (x, z) scaled into 0..1, so a simplification that drops a uv is easy to see. */
  function bowl(n: number): { pos: Float32Array; uv: Float32Array; index: Uint32Array } {
    const pos: number[] = [], uv: number[] = [], index: number[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = (i / n - 0.5) * 0.2, z = (j / n - 0.5) * 0.2;
      pos.push(x, 0.1 + 0.05 * (x * x + z * z) * 20, z);
      uv.push(i / n, j / n);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; index.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1); }
    return { pos: new Float32Array(pos), uv: new Float32Array(uv), index: Uint32Array.from(index) };
  }

  it('simplifies to the target and keeps each vertex on its own texture coordinates', async () => {
    const h = bowl(40);
    const s = await process_.simplifyHair(h, 400);
    expect(s.index.length / 3).toBeLessThanOrEqual(520);
    expect(s.index.length / 3).toBeGreaterThan(100);
    for (let i = 0; i < s.pos.length / 3; i++) {
      expect(s.uv[i * 2]!).toBeCloseTo(s.pos[i * 3]! / 0.2 + 0.5, 3);
      expect(s.uv[i * 2 + 1]!).toBeCloseTo(s.pos[i * 3 + 2]! / 0.2 + 0.5, 3);
    }
  });

  it('computes unit normals that face away from the head', () => {
    const h = bowl(8);
    const n = process_.smoothNormals(h) as Float32Array;
    process_.orientNormals(h, n);
    for (let i = 0; i < n.length / 3; i++) {
      expect(Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!)).toBeCloseTo(1, 4);
      // facing away from the head centre (0, 0.09, 0)
      expect(n[i * 3]! * h.pos[i * 3]! + n[i * 3 + 1]! * (h.pos[i * 3 + 1]! - 0.09) + n[i * 3 + 2]! * h.pos[i * 3 + 2]!).toBeGreaterThanOrEqual(0);
    }
  });

  it('finds a free texel block for the scalp tint', () => {
    const h = bowl(4);
    // map the bowl into the lower-right quarter only
    for (let i = 0; i < h.uv.length; i++) h.uv[i] = 0.5 + (h.uv[i] as number) * 0.5;
    const b = process_.freeUvBlock(h, 128, 20) as { u: number; v: number };
    expect(b).not.toBeNull();
    // the block does not overlap the used quarter
    expect(b.u + 20 / 128 <= 0.5 || b.v + 20 / 128 <= 0.5).toBe(true);
  });

  it('builds a scalp cap on the head surface from the hairline up to the crown', () => {
    const cap = process_.scalpCap(headShape, hairMod, { hairline: 'natural', fringe: 0, offset: 0.0035, block: { u: 0.1, v: 0.1 }, blockSize: 20, size: 512 });
    expect(cap.index.length / 3).toBe(30 * 9 * 2);
    let top = -Infinity, low = Infinity;
    for (let i = 0; i < cap.pos.length / 3; i++) { top = Math.max(top, cap.pos[i * 3 + 1]!); low = Math.min(low, cap.pos[i * 3 + 1]!); }
    expect(top).toBeGreaterThan(0.22);
    expect(top).toBeLessThan(0.24);
    expect(low).toBeLessThan(hairlineY(0, 'natural', 0) + 0.001);
    expect(H_MAX).toBeGreaterThan(top - 0.2);
    for (let i = 0; i < cap.uv.length; i++) { expect(cap.uv[i]!).toBeGreaterThanOrEqual(0.1); expect(cap.uv[i]!).toBeLessThan(0.2); }
  });
});

describe('hair build: tint bake', () => {
  it('turns brown strands and grey mannequin texels into a bright greyscale map without the grey', async () => {
    const w = 128;
    const rgb = new Uint8Array(w * w * 3);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 3;
      if (x < w / 2) { // brown hair with dark baked shade on one side and strand lines
        const v = (0.55 + 0.25 * Math.sin(x * 1.7)) * (y < w / 2 ? 0.4 : 1);
        rgb[k] = Math.round(255 * v * 0.8); rgb[k + 1] = Math.round(255 * v * 0.5); rgb[k + 2] = Math.round(255 * v * 0.3);
      } else { rgb[k] = rgb[k + 1] = rgb[k + 2] = 215; } // mannequin
    }
    const r = await bake.bakeTint({ w, h: w, rgb }, { size: 64, paint: { u: 0.8, v: 0.8, size: 10 } });
    expect(r.rgb.length).toBe(64 * 64 * 3);
    expect(r.stats.unknownShare).toBeGreaterThan(0.45);
    expect(r.stats.unknownShare).toBeLessThan(0.55);
    let min = 255, max = 0, sum = 0;
    for (let i = 0; i < 64 * 64; i++) { expect(r.rgb[i * 3]).toBe(r.rgb[i * 3 + 1]); min = Math.min(min, r.rgb[i * 3]!); max = Math.max(max, r.rgb[i * 3]!); sum += r.rgb[i * 3]!; }
    expect(sum / (64 * 64) / 255).toBeGreaterThan(0.7);
    expect(min).toBeGreaterThan(60);
    expect(max).toBeGreaterThan(220);
    // the dark baked shade of the top-left quarter is flattened: its mean is not far below the lower-left quarter
    const quarter = (y0: number) => { let s = 0, n = 0; for (let y = y0; y < y0 + 28; y++) for (let x = 2; x < 30; x++) { s += r.rgb[(y * 64 + x) * 3]!; n++; } return s / n; };
    expect(quarter(2) / quarter(34)).toBeGreaterThan(0.7);
  });

  it('bleeds known texels into the unknown ones', () => {
    const v = new Float32Array([0.5, 0, 0, 0]);
    bake.fillUnknown(v, new Uint8Array([1, 0, 0, 0]), 4, 1);
    for (const x of v) expect(x).toBeCloseTo(0.5, 5);
  });
});

describe('hair build: style list', () => {
  it('has unique ids, prompts that name the mannequin and a procedural stand-in for each style', () => {
    const ids = styles.AI_STYLES.map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(16);
    for (const s of styles.AI_STYLES) {
      expect(styles.stylePrompt(s)).toContain('mannequin');
      expect(['none', 'curls', 'bob', 'long', 'ponytail', 'bun', 'afro', 'braids']).toContain(s.fallback.piece);
    }
  });
});
