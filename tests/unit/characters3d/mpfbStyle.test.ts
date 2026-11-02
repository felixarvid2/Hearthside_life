// The MPFB character style (src/characters/mpfbBody.ts): slider -> morph mapping, the skin tone maths, the morph transfer onto
// generated meshes and the assembly of the shipped GLBs (mpfb_f.glb, mpfb_m.glb) into a body template that garments, hair and
// accessories build on.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCESSORIES, GARMENTS, HAIR } from '../../../src/content/character';
import { buildAccessory } from '../../../src/characters/accessories';
import { bodyMorphIds } from '../../../src/characters/bodyShape';
import { buildGarment } from '../../../src/characters/clothing';
import { buildHair } from '../../../src/characters/hair';
import { HEAD_SCULPT_IDS } from '../../../src/characters/headShape';
import { MorphField, MPFB_FACE_SLIDERS, MPFB_SLIDERS, TONE_CHROMA, assembleMpfb, familyOf, mpfbFaceInfluences, mpfbFieldIds, mpfbInfluences, recolourTexel } from '../../../src/characters/mpfbBody';
import { POSTURE_ANCHORS, seatedPlacement } from '../../../src/characters/posture';
import type { BodyTemplate } from '../../../src/characters/template';
import { loadMpfbBody } from './loadRaw';

const have = existsSync(fileURLToPath(new URL('../../../public/assets/characters/mpfb_f.glb', import.meta.url)));

describe('mpfb sliders to morph targets', () => {
  const all = () => true;
  it('drives the up target of a positive slider and the down target of a negative one, never both', () => {
    expect(mpfbInfluences({ build: 0.5 }, 'f', all)).toMatchObject({ weight_up: 0.5 * MPFB_SLIDERS.build!.gainUp, weight_down: 0 });
    expect(mpfbInfluences({ build: -0.5 }, 'f', all)).toMatchObject({ weight_up: 0, weight_down: 0.5 * MPFB_SLIDERS.build!.gainDown });
    expect(mpfbInfluences({ muscle: 1 }, 'm', all)).toMatchObject({ muscle_up: MPFB_SLIDERS.muscle!.gainUp, muscle_down: 0 });
  });

  it('narrows with a negative influence where only a widening target exists', () => {
    const i = mpfbInfluences({ waist: -1, hips: 0.5, shoulders: 0, belly: -0.5 }, 'f', all);
    expect(i.waist_wide).toBeCloseTo(-MPFB_SLIDERS.waist!.gainDown);
    expect(i.hips_wide).toBeCloseTo(0.5 * MPFB_SLIDERS.hips!.gainUp);
    expect(i.shoulders_wide).toBe(0);
    expect(i.belly_round).toBeLessThan(0);
  });

  it('uses the bust targets for the female chest and the displacement field for the male chest', () => {
    expect(mpfbInfluences({ chest: 0.5 }, 'f', all).bust_up).toBeGreaterThan(0);
    expect(mpfbInfluences({ chest: 0.5 }, 'f', all).chest).toBeUndefined();
    const m = mpfbInfluences({ chest: 0.5 }, 'm', all);
    expect(m.bust_up).toBeUndefined();
    expect(m.chest).toBe(0.5);
    expect(mpfbFieldIds('f')).toEqual(['arms', 'legs', 'neck']);
    expect(mpfbFieldIds('m')).toContain('chest');
  });

  it('passes the field sliders through, clamps sliders and only returns morphs the body has', () => {
    const i = mpfbInfluences({ arms: 0.4, legs: -2, neck: Number.NaN, build: 9 }, 'f', (n) => n !== 'weight_down');
    expect(i.arms).toBe(0.4);
    expect(i.legs).toBe(-1);
    expect(i.neck).toBe(0);
    expect(i.weight_up).toBeLessThanOrEqual(2);
    expect('weight_down' in i).toBe(false);
  });

  it('keeps every influence within what a full slider should do', () => {
    for (const v of [-1, -0.3, 0, 0.3, 1]) {
      const i = mpfbInfluences(Object.fromEntries(Object.keys(MPFB_SLIDERS).map((k) => [k, v])), 'f', all);
      for (const x of Object.values(i)) expect(Math.abs(x)).toBeLessThanOrEqual(2);
    }
  });
});

describe('mpfb face sliders', () => {
  it('drives the signed face morph of each covered slider and reports which sliders it covers', () => {
    const r = mpfbFaceInfluences({ jawWidth: 0.5, eyeSize: -2, cheekbones: 0.7 });
    expect(r.influences.face_jaw_width).toBe(0.5);
    expect(r.influences.face_eye_size).toBe(-1);
    expect(r.influences.face_length).toBe(0);
    expect([...r.covered].sort()).toEqual(Object.keys(MPFB_FACE_SLIDERS).sort());
    expect(r.covered.has('cheekbones')).toBe(false);
  });

  it('leaves a slider to its displacement field when the file has no morph for it', () => {
    const r = mpfbFaceInfluences({ chin: 1 }, (n) => n !== 'face_chin_length');
    expect(r.covered.has('chin')).toBe(false);
    expect(r.influences.face_chin_length).toBeUndefined();
  });
});

describe('mpfb seating', () => {
  it('seats the MPFB bodies with their own measurements', () => {
    const p = seatedPlacement({ x: 2, y: 0.5, z: 3 }, 0, 'a', 'mpfb');
    expect(p.y).toBeCloseTo(0.5 - POSTURE_ANCHORS.seated.mpfb.a.seatHeight, 6);
    expect(p.z).toBeCloseTo(3 - POSTURE_ANCHORS.seated.mpfb.a.seatZ, 6);
  });
});

describe('mpfb skin tone', () => {
  const mean: [number, number, number] = [0.3986, 0.2295, 0.1613];
  it('maps the mean skin texel to exactly the chosen tone', () => {
    const tone: [number, number, number] = [0.5, 0.3, 0.2];
    recolourTexel(mean, mean, tone).forEach((c, k) => expect(c).toBeCloseTo(tone[k]!, 6));
  });

  it('carries the painted shading over to any tone: a texel half as bright gives a tone about half as bright', () => {
    const dark = recolourTexel([mean[0] / 2, mean[1] / 2, mean[2] / 2], mean, [0.8, 0.6, 0.4]);
    dark.forEach((c, k) => expect(c).toBeCloseTo([0.4, 0.3, 0.2][k]!, 6));
  });

  it('keeps a fraction of the texel hue: a redder texel stays redder than the tone', () => {
    const red = recolourTexel([mean[0] * 1.3, mean[1], mean[2]], mean, [0.5, 0.5, 0.5]);
    expect(red[0]).toBeGreaterThan(red[1]);
    const full = recolourTexel([mean[0] * 1.3, mean[1], mean[2]], mean, [0.5, 0.5, 0.5], 1);
    expect(full[0]).toBeCloseTo(0.65, 6);
    expect(TONE_CHROMA).toBeGreaterThan(0);
    expect(TONE_CHROMA).toBeLessThan(1);
  });
});

describe('morph field', () => {
  // two columns of vertices, a left-leg one and a torso one, 5 cm apart
  const pos = new Float32Array([0, 1, 0, 0, 1.1, 0, 0.05, 1, 0, 0.05, 1.1, 0]);
  const bones = ['pelvis', 'spine_01', 'thigh_l', 'calf_l'];
  const f = new MorphField(pos, (v) => bones[v]!, { m: new Float32Array([1, 0, 0, 1, 0, 0, 5, 0, 0, 5, 0, 0]) });

  it('takes the deltas of the nearest vertices of the allowed parts', () => {
    expect(f.at([0, 1.02, 0], familyOf('pelvis')).m![0]).toBeCloseTo(1, 1);
    expect(f.at([0.05, 1.02, 0], familyOf('thigh_l')).m![0]).toBeCloseTo(5, 1);
  });

  it('never borrows from another body part when its own part is near, and falls back to any part when it has none', () => {
    expect(f.at([0.02, 1.0, 0], familyOf('thigh_l')).m![0]).toBeGreaterThan(4.9);
    expect(f.at([0, 1.02, 0], familyOf('upperarm_r')).m![0]).toBeDefined();
  });

  it('blends smoothly between vertices of the same part', () => {
    const g = new MorphField(new Float32Array([0, 0, 0, 0.1, 0, 0]), () => 'pelvis', { m: new Float32Array([0, 0, 0, 2, 0, 0]) });
    expect(g.at([0.05, 0, 0]).m![0]).toBeCloseTo(1, 5);
    expect(g.at([0.01, 0, 0]).m![0]).toBeLessThan(0.5);
  });
});

describe.skipIf(!have).each(['f', 'm'] as const)('mpfb body %s on the generators', (sex) => {
  let t: BodyTemplate;
  let loaded: Awaited<ReturnType<typeof loadMpfbBody>>;
  let meshes: ReturnType<typeof assembleMpfb>['meshes'];
  beforeAll(async () => {
    loaded = await loadMpfbBody(sex);
    const a = assembleMpfb(loaded.raw, loaded.prims, loaded.extras);
    t = a.template;
    meshes = a.meshes;
  }, 120_000);

  it('gives every part the body morphs by name and the face sculpt morphs next to them', () => {
    const ids = bodyMorphIds(t.ctx);
    for (const n of loaded.names) expect(ids).toContain(n);
    for (const id of mpfbFieldIds(sex)) expect(ids).toContain(id);
    for (const part of ['skin', 'underwear', 'eyes', 'brows', 'lashes'] as const) {
      const m = meshes[part]!;
      expect(m, part).toBeDefined();
      for (const id of [...ids, ...HEAD_SCULPT_IDS]) expect(m.morphs[id], `${part}.${id}`).toHaveLength(m.positions.length);
    }
  });

  it('keeps the authored morph targets exactly on the skin', () => {
    const m = meshes.skin!;
    const src = loaded.prims.skin!.targets.weight_up!;
    for (let i = 0; i < 300; i++) expect(m.morphs.weight_up![i * 17]).toBeCloseTo(src[i * 17]!, 6);
    expect(m.morphs.weight_up!.some((x) => Math.abs(x) > 1e-3)).toBe(true);
  });

  it('makes garments carry the body morphs of the nearest skin, so clothing follows the sliders', () => {
    const g = buildGarment(t, GARMENTS.find((x) => x.id === 'tee-crew')!);
    const ids = bodyMorphIds(t.ctx);
    for (const id of ids) expect(g.mesh.morphs[id], id).toHaveLength(g.mesh.positions.length);
    // a vertex of the shirt on the belly moves about as far as the skin right under it
    const skin = meshes.skin!, up = skin.morphs.weight_up!;
    let checked = 0;
    for (let v = 0; v < g.mesh.positions.length / 3 && checked < 40; v += 29) {
      const y = g.mesh.positions[v * 3 + 1]!;
      if (y < t.lm.waistY - 0.02 || y > t.lm.waistY + 0.02) continue;
      const d = Math.hypot(g.mesh.morphs.weight_up![v * 3]!, g.mesh.morphs.weight_up![v * 3 + 1]!, g.mesh.morphs.weight_up![v * 3 + 2]!);
      expect(d).toBeLessThan(0.05);
      checked++;
    }
    expect(up.length).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(0);
  });

  it('builds hair and accessories on the body morph ids and carries the head map', () => {
    expect(t.headMap).toBeDefined();
    const h = buildHair(t, HAIR.find((x) => x.build.kind !== 'mesh')!, null);
    for (const id of bodyMorphIds(t.ctx)) expect(h.morphs[id], id).toHaveLength(h.positions.length);
    const a = buildAccessory(t, ACCESSORIES.find((x) => x.kind === 'necklace')!);
    for (const id of bodyMorphIds(t.ctx)) expect(a.morphs[id], id).toHaveLength(a.positions.length);
  });

  it('puts face-paint coordinates on the head of the skin and none on the legs', () => {
    const m = meshes.skin!;
    const face = m.attrs.aFace!.data;
    let head = 0, legs = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const nonZero = Math.abs(face[i * 3]!) + Math.abs(face[i * 3 + 1]!) + Math.abs(face[i * 3 + 2]!) > 0;
      const y = m.positions[i * 3 + 1]!;
      if (nonZero && y > 1.55) head++;
      if (nonZero && y < 1.2) legs++;
    }
    expect(head).toBeGreaterThan(300);
    expect(legs).toBe(0);
  });
});
