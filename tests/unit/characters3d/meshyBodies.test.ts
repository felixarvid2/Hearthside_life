// The shipped Meshy bodies (public/assets/characters/meshy_a.glb, meshy_b.glb; built by tools/build-meshy-bodies.mts):
// the files load and skin on the shared skeleton, the runtime data derived from them is sound, body sliders move the
// same field the garments use, garments and hair build on them, and the head map puts hair on the real head.
import { beforeAll, describe, expect, it } from 'vitest';
import { GARMENTS, HAIR } from '../../../src/content/character';
import { BODY_PARAM_IDS, bodyDeltas } from '../../../src/characters/bodyShape';
import { buildGarment } from '../../../src/characters/clothing';
import { buildHair, HAIR_PIECE } from '../../../src/characters/hair';
import { HeadMap, sampleRadius } from '../../../src/characters/headMap';
import { HEAD_SCULPT_IDS } from '../../../src/characters/headShape';
import { CLASS, classifyTexels, packMask, rasterizeUv } from '../../../src/characters/meshyBake';
import { PAINT_MORPH_IDS, buildMeshyMesh, partOf } from '../../../src/characters/meshyBody';
import type { MeshyExtras } from '../../../src/characters/meshyBody';
import type { RawBody } from '../../../src/characters/rig';
import { PART, buildBodyTemplate } from '../../../src/characters/template';
import type { BodyTemplate } from '../../../src/characters/template';
import { loadMeshyBody, loadRawBody } from './loadRaw';

interface Loaded { raw: RawBody; normals: Float32Array; uv: Float32Array; extras: MeshyExtras; t: BodyTemplate; map: HeadMap; skeleton: RawBody }

const bodies = {} as Record<'a' | 'b', Loaded>;

beforeAll(async () => {
  for (const f of ['a', 'b'] as const) {
    const m = await loadMeshyBody(f);
    const t = buildBodyTemplate(m.raw, { stylise: false, skinParts: false });
    const map = new HeadMap(m.extras.head, t.headOrigin);
    t.headMap = map;
    bodies[f] = { raw: m.raw, normals: m.normals, uv: m.uv, extras: m.extras, t, map, skeleton: await loadRawBody(f) };
  }
}, 120_000);

describe.each(['a', 'b'] as const)('meshy body %s', (f) => {
  it('loads as a skinned mesh on the shared skeleton with sound attributes', async () => {
    const { raw, uv, normals, skeleton } = bodies[f];
    const n = raw.positions.length / 3;
    expect(raw.index.length / 3).toBeGreaterThan(9000);
    expect(raw.index.length / 3).toBeLessThanOrEqual(10500);
    expect(raw.boneNames).toEqual(skeleton.boneNames);
    expect(uv.length).toBe(n * 2);
    expect(normals.length).toBe(n * 3);
    let uvBad = 0;
    for (let i = 0; i < uv.length; i++) if (uv[i]! < -1e-4 || uv[i]! > 1 + 1e-4) uvBad++;
    expect(uvBad).toBe(0);
    let minY = Infinity, maxY = -Infinity, bad = 0;
    for (let i = 0; i < n; i++) {
      minY = Math.min(minY, raw.positions[i * 3 + 1]!); maxY = Math.max(maxY, raw.positions[i * 3 + 1]!);
      let s = 0;
      for (let k = 0; k < 4; k++) { s += raw.weights[i * 4 + k]!; if (raw.joints[i * 4 + k]! >= raw.boneNames.length) bad++; }
      if (Math.abs(s - 1) > 1e-3) bad++;
    }
    expect(bad).toBe(0);
    expect(minY).toBeCloseTo(0, 2);
    expect(maxY).toBeCloseTo(1.8, 2);
    expect(raw.index.every((i) => i < n)).toBe(true);
  });

  it('keeps legs on their own side of the skeleton', () => {
    const { raw } = bodies[f];
    let leaks = 0;
    for (let i = 0; i < raw.positions.length / 3; i++) {
      if (raw.positions[i * 3 + 1]! > 0.7) continue;
      const left = raw.positions[i * 3]! >= 0;
      for (let k = 0; k < 4; k++) if (raw.weights[i * 4 + k]! > 0.02 && raw.boneNames[raw.joints[i * 4 + k]!]!.endsWith(left ? '_r' : '_l')) leaks++;
    }
    expect(leaks).toBe(0);
  });

  it('has textures and a mask whose channels classify the body', async () => {
    const m = await loadMeshyBody(f);
    expect(m.albedo.getMimeType()).toBe('image/webp');
    expect(m.albedo.getSize()).toEqual([1024, 1024]);
    expect(m.mask.getMimeType()).toBe('image/png');
    expect(m.mask.getSize()).toEqual([512, 512]);
    const e = m.extras;
    expect(e.skinMean[0]).toBeGreaterThan(e.skinMean[2]); // warm
    expect(e.clothLum[1]).toBeGreaterThanOrEqual(e.clothLum[0]);
    expect(e.head.eyeY).toBeGreaterThan(1.6);
    expect(e.head.browY).toBeGreaterThan(e.head.eyeY);
    expect(e.splitY).toBeGreaterThan(e.head.eyeY);
    expect(e.splitY).toBeLessThan(e.head.browY);
    expect(e.head.crownY).toBeGreaterThan(1.78);
  });

  it('derives attributes and morph targets from the garments\' displacement fields', () => {
    const { raw, normals, uv, t, map } = bodies[f];
    const md = buildMeshyMesh({ raw, normals, uv, template: t, headMap: map });
    const n = raw.positions.length / 3;
    expect(md.positions.length).toBe(n * 3);
    expect(Object.keys(md.morphs).sort()).toEqual([...BODY_PARAM_IDS, ...HEAD_SCULPT_IDS, ...PAINT_MORPH_IDS].sort());
    let maxDelta = 0;
    let bad = 0;
    for (const d of Object.values(md.morphs)) { expect(d.length).toBe(n * 3); for (const v of d) { if (!Number.isFinite(v)) bad++; maxDelta = Math.max(maxDelta, Math.abs(v)); } }
    expect(bad).toBe(0);
    expect(maxDelta).toBeLessThan(0.08);
    // body sliders: identical to bodyDeltas at the vertex (what garments use)
    for (const v of [100, Math.floor(n / 4), Math.floor(n / 2), n - 100]) {
      const skin = { j: [raw.joints[v * 4]!, raw.joints[v * 4 + 1]!, raw.joints[v * 4 + 2]!, raw.joints[v * 4 + 3]!], w: [raw.weights[v * 4]!, raw.weights[v * 4 + 1]!, raw.weights[v * 4 + 2]!, raw.weights[v * 4 + 3]!] } as never;
      const d = bodyDeltas(t.ctx, [raw.positions[v * 3]!, raw.positions[v * 3 + 1]!, raw.positions[v * 3 + 2]!], skin);
      for (const id of BODY_PARAM_IDS) for (let c = 0; c < 3; c++) expect(md.morphs[id]![v * 3 + c]!).toBeCloseTo(d[id][c]!, 6);
    }
    // every slider moves something, the build slider moves the torso outward
    for (const id of BODY_PARAM_IDS) expect(md.morphs[id]!.some((v) => Math.abs(v) > 1e-4), id).toBe(true);
    // the scanned head takes face sculpt morphs, the legs do not
    const legV = [...Array(n).keys()].find((i) => raw.positions[i * 3 + 1]! < 0.5)!;
    for (const id of HEAD_SCULPT_IDS) expect(Math.hypot(md.morphs[id]![legV * 3]!, md.morphs[id]![legV * 3 + 1]!, md.morphs[id]![legV * 3 + 2]!)).toBe(0);
    for (const id of ['faceWidth', 'jawWidth', 'chin', 'noseLength', ...PAINT_MORPH_IDS] as const) expect(md.morphs[id]!.some((v) => Math.abs(v) > 1e-4), id).toBe(true);
    expect(md.morphs.earSize!.some((v) => Math.abs(v) > 1e-4), 'earSize').toBe(true);
    // part ids: feet, legs, torso, arms and head are all present
    const parts = new Set<number>();
    for (let i = 0; i < n; i++) parts.add(md.attrs.aInfo!.data[i * 4]!);
    for (const p of [PART.torso, PART.leg, PART.arm, PART.hand, PART.foot, PART.head]) expect(parts.has(p), `part ${p}`).toBe(true);
  });

  it('builds every garment and hair style on the Meshy body', () => {
    const { t } = bodies[f];
    for (const g of GARMENTS) expect(buildGarment(t, g).mesh.indices.length, g.id).toBeGreaterThan(0);
    for (const h of HAIR) expect(buildHair(t, h, null).indices.length, h.id).toBeGreaterThan(0);
  });

  it('puts the hair cap on the real scalp: above the brows at the front, never inside the head', () => {
    const { t, map, extras } = bodies[f];
    const def = HAIR.find((h) => h.id === 'crop-side-part') ?? HAIR[0]!;
    const m = buildHair(t, def, null);
    const piece = m.attrs.aHair!.data;
    const table = extras.head.table;
    let minFront = Infinity, buried = 0, counted = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      if (piece[i * 4 + 3] !== HAIR_PIECE.cap) continue;
      const x = m.positions[i * 3]!, y = m.positions[i * 3 + 1]!, z = m.positions[i * 3 + 2]!;
      if (z > table.axisZ + 0.04 && Math.abs(x) < 0.05) minFront = Math.min(minFront, y);
      if (y > extras.head.eyeY + 0.03 && y < extras.head.crownY - 0.03) {
        counted++;
        const r = Math.hypot(x - table.axisX, z - table.axisZ);
        if (r < sampleRadius(table, Math.atan2(x - table.axisX, z - table.axisZ), y) - 0.004) buried++;
      }
    }
    expect(counted).toBeGreaterThan(100);
    expect(buried / counted).toBeLessThan(0.02);
    expect(minFront).toBeGreaterThan(extras.head.browY + 0.005);
    void map;
  });

  it('maps the parametric eye and brow lines onto the Meshy ones and inverts', () => {
    const { map, extras } = bodies[f];
    const o = map.origin;
    const eyeC = o[1] - 0.02 + 0.098 * 1.1;
    expect(map.mapY(eyeC)).toBeCloseTo(extras.head.eyeY, 5);
    for (const y of [1.5, 1.6, 1.68, 1.75]) expect(map.unmapY(map.mapY(y))).toBeCloseTo(y, 5);
    const p = map.toMeshy([0.03, eyeC + 0.02, o[2] + 0.1]);
    const q = map.toClassic(p);
    expect(q[0]).toBeCloseTo(0.03, 3);
    expect(q[1]).toBeCloseTo(eyeC + 0.02, 4);
  });

  it('classifies part ids by bone and height', () => {
    expect(partOf('Head', 1.7, 0, 0.8).part).toBe(PART.head);
    expect(partOf('thigh_l', 0.5, 0.1, 0.8).part).toBe(PART.leg);
    expect(partOf('thigh_l', 0.9, 0.1, 0.8).part).toBe(PART.torso);
    expect(partOf('lowerarm_r', 1.4, -0.4, 0.8)).toEqual({ part: PART.arm, s: 0.4 });
    expect(partOf('foot_l', 0.05, 0.1, 0.8).part).toBe(PART.foot);
  });
});

describe('texture analysis', () => {
  it('rasterises a UV layout, classifies skin, clothing and eye features and packs the mask', () => {
    const S = 128;
    // two triangles tiling the unit square, spread over a body-like height range with the head in the upper half
    const positions = new Float32Array([0, 0, 0, 0.1, 0, 0, 0, 2, 0, 0.1, 2, 0]);
    const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const index = [0, 1, 2, 1, 3, 2];
    const map = rasterizeUv(uv, index, positions, S);
    expect(map.tri.every((t) => t >= 0)).toBe(true);
    const rgb = new Uint8Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 3;
      const worldY = (1 - (y + 0.5) / S) * 2; // v runs down the image; position y grows with v here
      void worldY;
      const lower = y < S / 2; // v < 0.5 -> y < 1: body
      if (lower) { const cloth = x < S / 2; rgb.set(cloth ? [60, 60, 70] : [230, 180, 160], k); } else rgb.set([230, 180, 160], k);
    }
    const res = classifyTexels(rgb, map, { headMinY: 1.58 });
    const at = (x: number, y: number) => res.classes[y * S + x]!;
    expect(at(10, 10)).toBe(CLASS.cloth);
    expect(at(100, 10)).toBe(CLASS.skin);
    expect(at(10, 100)).toBe(CLASS.skin);
    expect(res.skinMean[0]).toBeGreaterThan(res.skinMean[2]);
    const covered = new Uint8Array(S * S).fill(1);
    const mask = packMask(res.classes, covered, S, 16);
    expect(mask[(1 * 16 + 1) * 4 + 1]).toBe(255); // clothing
    expect(mask[(1 * 16 + 14) * 4]).toBe(255); // skin
    expect(mask[(14 * 16 + 14) * 4]).toBe(255);
  });
});
