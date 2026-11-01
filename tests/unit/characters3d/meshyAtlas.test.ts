import { describe, expect, it } from 'vitest';
import { bakeAtlas, buildAtlas } from '../../../src/characters/meshyAtlas';

// A unit cube with vertices duplicated per face (flat normals), as a scanned mesh with a chart per face would have.
function cube() {
  const faces: Array<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
    { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
    { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];
  const positions: number[] = [], normals: number[] = [], uv: number[] = [], index: number[] = [];
  faces.forEach((f, k) => {
    const base = k * 4;
    f.v.forEach((p) => { positions.push(...p); normals.push(...f.n); });
    // face k owns the texel column k of an 8 x 1 texture
    const u0 = k / 6, u1 = (k + 1) / 6;
    uv.push(u0, 0, u0, 1, u1, 1, u1, 0);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uv: new Float32Array(uv), index: new Uint32Array(index), region: new Uint8Array(24) };
}

describe('meshy atlas', () => {
  it('cuts a mesh into planar charts that fit the atlas, one chart per triangle group, never mixing charts in a triangle', () => {
    const c = cube();
    const a = buildAtlas({ positions: c.positions, normals: c.normals, index: c.index, region: c.region }, { size: 256, pad: 2, density: {}, minChartTris: 1 });
    expect(a.index.length).toBe(c.index.length);
    expect(a.charts).toBe(6);
    expect(a.uv.every((v) => v >= 0 && v <= 1)).toBe(true);
    // no two triangles of different charts overlap in the atlas: sample the centroid of every triangle against the others
    const tri = (t: number) => [0, 1, 2].map((k) => a.index[t * 3 + k]!);
    const cen = (t: number) => { const v = tri(t); return [(a.uv[v[0]! * 2]! + a.uv[v[1]! * 2]! + a.uv[v[2]! * 2]!) / 3, (a.uv[v[0]! * 2 + 1]! + a.uv[v[1]! * 2 + 1]! + a.uv[v[2]! * 2 + 1]!) / 3]; };
    const inside = (t: number, p: number[]) => {
      const v = tri(t).map((i) => [a.uv[i * 2]!, a.uv[i * 2 + 1]!]);
      const s = (p1: number[], p2: number[], p3: number[]) => (p1[0]! - p3[0]!) * (p2[1]! - p3[1]!) - (p2[0]! - p3[0]!) * (p1[1]! - p3[1]!);
      const d1 = s(p, v[0]!, v[1]!), d2 = s(p, v[1]!, v[2]!), d3 = s(p, v[2]!, v[0]!);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    let overlaps = 0;
    for (let t = 0; t < 12; t++) for (let q = 0; q < 12; q++) if (t >> 1 !== q >> 1 && inside(q, cen(t))) overlaps++;
    expect(overlaps).toBe(0);
  });

  it('transfers colours and classes from the source texture through the closest surface point', () => {
    const c = cube();
    const a = buildAtlas({ positions: c.positions, normals: c.normals, index: c.index, region: c.region }, { size: 256, pad: 2, density: {}, minChartTris: 1 });
    // source: 6 x 1 texels scaled to 12 x 12, texel column k = face k with its own colour and class
    const S = 12;
    const rgb = new Uint8Array(S * S * 3), classes = new Uint8Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = Math.floor(x / 2); rgb.set([k * 40, 255 - k * 40, 7], (y * S + x) * 3); classes[y * S + x] = k + 1; }
    const baked = bakeAtlas(a, { positions: c.positions, index: c.index, uv: c.uv, rgb, classes, size: S }, 256, 2);
    let covered = 0, wrong = 0;
    for (let t = 0; t < 12; t++) {
      const v = [0, 1, 2].map((k) => a.index[t * 3 + k]!);
      const u = (a.uv[v[0]! * 2]! + a.uv[v[1]! * 2]! + a.uv[v[2]! * 2]!) / 3 * 256, w = (a.uv[v[0]! * 2 + 1]! + a.uv[v[1]! * 2 + 1]! + a.uv[v[2]! * 2 + 1]!) / 3 * 256;
      const k = Math.floor(u) + Math.floor(w) * 256;
      if (!baked.covered[k]) continue;
      covered++;
      // the source face of this triangle (cube faces are two triangles each)
      const face = t >> 1;
      if (baked.classes[k] !== face + 1 || Math.abs(baked.rgb[k * 3]! - face * 40) > 12) wrong++;
    }
    expect(covered).toBe(12);
    expect(wrong).toBe(0);
    expect(baked.padded.reduce((s, v) => s + v, 0)).toBeGreaterThan(baked.covered.reduce((s, v) => s + v, 0));
  });
});
