// Life-stage bodies (Milestone 8): the GLBs built by tools/build-mpfb-bodies.mts (mpfb_baby, mpfb_{toddler,child,teen,elder}_{f,m}) and
// the code around them: heights and availability, the skeleton the clips run on, the clips' translation tracks, garments, hair and
// accessories on the stage bodies, posture anchors, the stoop and the cradle hold. Format: tools/mpfb/README.md ("Life stages").
import { NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCESSORIES, GARMENTS, HAIR } from '../../../src/content/character';
import { buildAccessory } from '../../../src/characters/accessories';
import type { FrameAssets } from '../../../src/characters/assets';
import { ADULT_HEIGHT, STAGE_BODIES, STAGE_HEIGHTS, retargetClips, stageBodyAvailable, stageBodyFile, stageBodyOf, stageFallbackScale } from '../../../src/characters/assets';
import { buildGarment } from '../../../src/characters/clothing';
import { buildHair } from '../../../src/characters/hair';
import { assembleMpfb } from '../../../src/characters/mpfbBody';
import { POSTURE_ANCHORS, STAGE_LYING, STAGE_SEATED, lyingPlacement, seatedPlacement } from '../../../src/characters/posture';
import { CRADLE, CRADLE_PAIRS, LOCOMOTION_CLIPS, applyCradle, applyStoop, bindBones, stageLook } from '../../../src/characters/stagePose';
import type { LifeStage } from '../../../src/core/types';
import { loadMpfbBody } from './loadRaw';

const dir = fileURLToPath(new URL('../../../public/assets/characters/', import.meta.url));

interface StageFile { file: string; sex: 'f' | 'm'; frame: 'a' | 'b'; stage: Exclude<LifeStage, 'youngAdult' | 'adult'> }
const FILES: StageFile[] = [
  { file: 'mpfb_baby', sex: 'f', frame: 'b', stage: 'baby' },
  ...(['toddler', 'child', 'teen', 'elder'] as const).flatMap((stage) => [
    { file: `mpfb_${stage}_f`, sex: 'f' as const, frame: 'b' as const, stage }, { file: `mpfb_${stage}_m`, sex: 'm' as const, frame: 'a' as const, stage }]),
];
const FACE_MORPHS = ['face_length', 'face_width', 'face_jaw_width', 'face_chin_length', 'face_chin_prominence', 'face_cheek_fullness', 'face_nose_width',
  'face_nose_length', 'face_eye_size', 'face_eye_spacing', 'face_lip_fullness', 'face_mouth_width', 'face_brow_height', 'face_smile'];
const have = FILES.every((f) => existsSync(`${dir}${f.file}.glb`));

async function read(file: string): Promise<Document> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(`${dir}${file}`);
}
const extrasOf = (doc: Document) => (doc.getRoot().listNodes().find((n) => n.getMesh())!.getExtras() as { mpfbBody: Record<string, any> }).mpfbBody;

// ---------------------------------------------------------------------------------------------
// Heights, availability, names
// ---------------------------------------------------------------------------------------------

describe('life stage heights and bodies', () => {
  it('grows from baby to adult (STAGE_HEIGHTS, metres) and the elder is a little shorter than the adult', () => {
    const order: LifeStage[] = ['baby', 'toddler', 'child', 'teen', 'youngAdult'];
    for (let i = 1; i < order.length; i++) expect(STAGE_HEIGHTS[order[i]!]).toBeGreaterThan(STAGE_HEIGHTS[order[i - 1]!]);
    expect(STAGE_HEIGHTS.adult).toBe(ADULT_HEIGHT);
    expect(STAGE_HEIGHTS.youngAdult).toBe(ADULT_HEIGHT);
    expect(STAGE_HEIGHTS.elder).toBeLessThan(STAGE_HEIGHTS.adult);
    expect(STAGE_HEIGHTS.elder).toBeGreaterThan(STAGE_HEIGHTS.teen);
    expect(Object.keys(STAGE_HEIGHTS).sort()).toEqual(['adult', 'baby', 'child', 'elder', 'teen', 'toddler', 'youngAdult']);
  });

  it('offers every life stage to the creator (stageBodyAvailable), and nothing else', () => {
    for (const s of Object.keys(STAGE_HEIGHTS) as LifeStage[]) expect(stageBodyAvailable(s)).toBe(true);
    expect(stageBodyAvailable('nobody' as LifeStage)).toBe(false);
  });

  it('draws youngAdult and adult with the adult bodies and the others with a body of their own', () => {
    expect(stageBodyOf('adult')).toBeNull();
    expect(stageBodyOf('youngAdult')).toBeNull();
    expect(STAGE_BODIES.map((b) => stageBodyOf(b))).toEqual([...STAGE_BODIES]);
    expect(stageBodyFile('baby', 'a')).toBe('mpfb_baby');
    expect(stageBodyFile('baby', 'b')).toBe('mpfb_baby');
    expect(stageBodyFile('child', 'a')).toBe('mpfb_child_m');
    expect(stageBodyFile('elder', 'b')).toBe('mpfb_elder_f');
    expect(FILES.map((f) => f.file).sort()).toEqual(STAGE_BODIES.flatMap((b) => (['a', 'b'] as const).map((fr) => stageBodyFile(b, fr))).filter((f, i, all) => all.indexOf(f) === i).sort());
  });

  it('scales the adult rig uniformly to the stage as the classic and detailed styles fall back', () => {
    expect(stageFallbackScale('adult')).toBe(1);
    expect(stageFallbackScale('child')).toBeCloseTo(STAGE_HEIGHTS.child / 1.8, 6);
    expect(stageFallbackScale('baby')).toBeLessThan(stageFallbackScale('toddler'));
  });
});

// ---------------------------------------------------------------------------------------------
// The GLBs
// ---------------------------------------------------------------------------------------------

describe.skipIf(!have).each(FILES)('$file.glb', ({ file, sex, frame, stage }) => {
  let doc: Document;
  let adult: Document;
  beforeAll(async () => { doc = await read(`${file}.glb`); adult = await read(`body_${frame}.glb`); }, 60_000);

  it('is small: at most 900 kB, under 15k triangles', () => {
    expect(statSync(`${dir}${file}.glb`).size).toBeLessThanOrEqual(900_000);
    let tris = 0;
    for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) tris += p.getIndices()!.getCount() / 3;
    expect(tris).toBeLessThanOrEqual(15000);
    expect(tris).toBeGreaterThan(5000);
  });

  it('has the same joints in the same order as the game skeleton, with the adult rest rotations, so the clips apply', () => {
    const a = adult.getRoot().listSkins()[0]!.listJoints(), s = doc.getRoot().listSkins()[0]!.listJoints();
    expect(s.map((j) => j.getName())).toEqual(a.map((j) => j.getName()));
    s.forEach((j, i) => { const r = j.getRotation(), q = a[i]!.getRotation(); for (let k = 0; k < 4; k++) expect(r[k]).toBeCloseTo(q[k]!, 5); });
  });

  it('fits the bones to the stage: shorter than the adult rig (a shoulder offset may differ a little), the root at the origin', () => {
    const a = adult.getRoot().listSkins()[0]!.listJoints(), s = doc.getRoot().listSkins()[0]!.listJoints();
    expect(s[0]!.getWorldTranslation()).toEqual([0, 0, 0]);
    const len = (j: (typeof s)[number]) => Math.hypot(...j.getTranslation());
    for (const [i, j] of s.entries()) {
      if (len(a[i]!) < 0.02) continue;
      const k = len(j) / len(a[i]!);
      expect(k, j.getName()).toBeGreaterThan(0.2);
      expect(k, j.getName()).toBeLessThan(1.25);
    }
    const pelvisK = len(s.find((j) => j.getName() === 'pelvis')!) / len(a.find((j) => j.getName() === 'pelvis')!);
    expect(pelvisK).toBeGreaterThan(0.25);
    expect(pelvisK).toBeLessThan(STAGE_HEIGHTS[stage] / 1.8 + 0.2);
  });

  it('has inverse bind matrices that match the scaled skeleton (the skin does not collapse)', () => {
    const skin = doc.getRoot().listSkins()[0]!;
    const ibm = skin.getInverseBindMatrices()!;
    const m = new Array<number>(16).fill(0);
    skin.listJoints().forEach((j, i) => {
      ibm.getElement(i, m);
      const w = j.getWorldMatrix();
      // ibm * world = identity
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let v = 0;
        for (let k = 0; k < 4; k++) v += m[k * 4 + r]! * w[c * 4 + k]!;
        expect(v, `${j.getName()}[${r},${c}]`).toBeCloseTo(r === c ? 1 : 0, 3);
      }
    });
  });

  it('stands on the floor and is as tall as its stage (STAGE_HEIGHTS, within 8 %)', () => {
    const skin = doc.getRoot().listMeshes()[0]!.listPrimitives().find((p) => p.getMaterial()!.getName() === 'mpfb_skin')!;
    const pos = skin.getAttribute('POSITION')!;
    const v = [0, 0, 0];
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); minY = Math.min(minY, v[1]!); maxY = Math.max(maxY, v[1]!); }
    expect(minY).toBeGreaterThan(-0.03);
    expect(minY).toBeLessThan(0.04);
    expect(maxY / STAGE_HEIGHTS[stage]).toBeGreaterThan(0.92);
    expect(maxY / STAGE_HEIGHTS[stage]).toBeLessThan(1.08);
  });

  it('keeps the format: six primitives, 14 signed face morphs and the weight and muscle morphs, extras of format 2 with the stage', () => {
    const mesh = doc.getRoot().listMeshes()[0]!;
    expect(mesh.listPrimitives().map((p) => p.getMaterial()!.getName().replace(/^mpfb_/, '')).sort()).toEqual(['brows', 'eyes', 'iris', 'lashes', 'skin', 'underwear']);
    const names = (mesh.getExtras() as { targetNames: string[] }).targetNames;
    for (const p of mesh.listPrimitives()) expect(p.listTargets().length).toBe(names.length);
    for (const m of [...FACE_MORPHS, 'weight_up', 'weight_down', 'muscle_up', 'muscle_down']) expect(names, m).toContain(m);
    const x = extrasOf(doc);
    expect(x.format).toBe(2);
    expect(x.sex).toBe(sex);
    expect(x.frame).toBe(frame);
    expect(x.morphs).toEqual(names);
    expect(x.faceMorphs).toEqual(FACE_MORPHS);
    expect(x.iris.primitive).toBe('iris');
    expect(x.lips.attribute).toBe('_LIPS');
    const skin = mesh.listPrimitives().find((p) => p.getMaterial()!.getName() === 'mpfb_skin')!;
    expect(skin.getAttribute('_LIPS')).toBeTruthy();
  });

  it('records only CC0 licences, with the generated underwear among them', () => {
    const lic = extrasOf(doc).licenses as Record<string, { license: string }>;
    expect(Object.keys(lic).length).toBeGreaterThanOrEqual(5);
    for (const [name, l] of Object.entries(lic)) expect(l.license, name).toBe('CC0');
    const generated = Object.keys(lic).some((k) => k.startsWith('trunks (generated'));
    // generated trunks, briefs or diaper for boys, children and babies; the teen girl and the elder woman wear the CC0 MakeHuman set
    expect(generated).toBe(!(sex === 'f' && (stage === 'teen' || stage === 'elder')));
  });

  it('has underwear that suits the stage: a diaper for the baby, briefs for toddlers and children, trunks or the MakeHuman set above', () => {
    const under = doc.getRoot().listMeshes()[0]!.listPrimitives().find((p) => p.getMaterial()!.getName() === 'mpfb_underwear')!;
    const tris = under.getIndices()!.getCount() / 3;
    expect(tris).toBeGreaterThan(300);
    const c = under.getMaterial()!.getBaseColorFactor();
    if (stage === 'baby') expect(Math.min(c[0]!, c[1]!, c[2]!)).toBeGreaterThan(0.9); // white
    // the underwear sits on the body: its lowest vertex is above the knees (briefs, diaper) or at mid-thigh at most
    const pos = under.getAttribute('POSITION')!;
    const v = [0, 0, 0];
    let minY = Infinity;
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); minY = Math.min(minY, v[1]!); }
    const H = STAGE_HEIGHTS[stage];
    expect(minY).toBeGreaterThan(H * 0.2);
    if (stage === 'baby' || stage === 'toddler' || stage === 'child') expect(minY).toBeGreaterThan(H * 0.3);
  });
});

// ---------------------------------------------------------------------------------------------
// Garments, hair and accessories on the stage bodies
// ---------------------------------------------------------------------------------------------

describe.skipIf(!have).each(FILES)('generators on $file', ({ file, sex, stage }) => {
  let t: ReturnType<typeof assembleMpfb>['template'];
  let skinTop = 0, skinBottom = 0, halfWidth = 0;
  beforeAll(async () => {
    const loaded = await loadMpfbBody(sex, file);
    t = assembleMpfb(loaded.raw, loaded.prims, loaded.extras).template;
    const p = loaded.prims.skin!.positions;
    skinBottom = Infinity;
    for (let i = 0; i < p.length; i += 3) { skinTop = Math.max(skinTop, p[i + 1]!); skinBottom = Math.min(skinBottom, p[i + 1]!); halfWidth = Math.max(halfWidth, Math.abs(p[i]!)); }
  }, 120_000);

  const bounds = (pos: ArrayLike<number>) => {
    let lo = Infinity, hi = -Infinity, wide = 0;
    for (let i = 0; i < pos.length; i += 3) { lo = Math.min(lo, pos[i + 1]!); hi = Math.max(hi, pos[i + 1]!); wide = Math.max(wide, Math.abs(pos[i]!)); }
    return { lo, hi, wide };
  };

  it('puts the landmarks of the body in order, scaled to the stage', () => {
    const lm = t.lm;
    expect(lm.crotchY).toBeGreaterThan(skinTop * 0.3);
    expect(lm.crotchY).toBeLessThan(skinTop * 0.6);
    expect(lm.chestY).toBeGreaterThan(lm.waistY);
    expect(lm.neckBaseY).toBeGreaterThan(lm.chestY);
    expect(lm.headY).toBeGreaterThan(lm.neckBaseY);
    expect(lm.headY).toBeLessThan(skinTop);
    expect(lm.ankleY).toBeLessThan(lm.kneeY);
  });

  it.each(['tee-crew', 'jeans-straight', 'sneakers', 'sundress', 'hoodie', 'overalls'])('fits the garment %s to the body, not to an adult', (id) => {
    const def = GARMENTS.find((g) => g.id === id)!;
    const g = buildGarment(t, def);
    const b = bounds(g.mesh.positions);
    expect(g.mesh.positions.length).toBeGreaterThan(300);
    expect(b.lo).toBeGreaterThan(skinBottom - 0.04 * skinTop);
    expect(b.hi).toBeLessThan(skinTop + 0.02 * skinTop);
    expect(b.wide).toBeLessThan(halfWidth + 0.14 * skinTop);
  });

  it.each(HAIR.filter((h) => h.build.kind !== 'mesh').slice(0, 8).map((h) => h.id))('puts the hairstyle %s on the head', (id) => {
    const g = buildHair(t, HAIR.find((h) => h.id === id)!, null);
    const b = bounds(g.positions);
    expect(b.hi, 'crown').toBeLessThan(skinTop + 0.14 * skinTop);
    expect(b.hi).toBeGreaterThan(skinTop * 0.8);
    expect(b.lo).toBeGreaterThan(t.lm.shoulderY - 0.6 * skinTop);
    expect(b.wide).toBeLessThan(0.35 * skinTop + 0.1);
  });

  it('puts a hat on the head and glasses on the face', () => {
    for (const kind of ['hat', 'glasses'] as const) {
      const def = ACCESSORIES.find((a) => a.kind === kind)!;
      const b = bounds(buildAccessory(t, def).positions);
      expect(b.lo, def.id).toBeGreaterThan(t.lm.neckBaseY - 0.05 * skinTop);
      expect(b.hi, def.id).toBeLessThan(skinTop + 0.2 * skinTop);
    }
    expect(stage).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// Garment fit across the life stages, and elder wrinkles
// ---------------------------------------------------------------------------------------------

describe.skipIf(!have)('garment fit by stage', () => {
  const stages = ['toddler', 'child', 'teen', 'adult'] as const;
  const fit: Record<string, { bs: number; standoff: number; flare: number }> = {};

  beforeAll(async () => {
    const { bodyScale } = await import('../../../src/characters/clothing');
    for (const stage of stages) {
      const file = stage === 'adult' ? 'mpfb_f' : `mpfb_${stage}_f`;
      const loaded = await loadMpfbBody('f', file);
      const { template: t } = assembleMpfb(loaded.raw, loaded.prims, loaded.extras);
      const lm = t.lm;
      // mean distance from the tee to the nearest skin vertex, around the torso: the garment's stand-off from the body
      const tee = buildGarment(t, GARMENTS.find((x) => x.id === 'tee-crew')!).mesh.positions;
      const body = loaded.prims.skin!.positions;
      let sumD = 0, n = 0;
      for (let i = 0; i < tee.length; i += 3 * 7) {
        const y = tee[i + 1]!;
        if (y < lm.crotchY + 0.02 || y > lm.chestY) continue;
        let best = 1e9;
        for (let j = 0; j < body.length; j += 3) {
          const dx = body[j]! - tee[i]!, dy = body[j + 1]! - y, dz = body[j + 2]! - tee[i + 2]!;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < best) best = d;
        }
        sumD += Math.sqrt(best); n++;
      }
      // hem flare of the A-line skirt: the hem radius beyond the radius at the waist
      const skirt = buildGarment(t, GARMENTS.find((x) => x.id === 'skirt-aline')!).mesh.positions;
      const yW = lm.crotchY + 0.95 * (lm.waistY - lm.crotchY);
      const yH = lm.crotchY + 0.52 * (lm.ankleY - 0.035 - lm.crotchY);
      const rAt = (y0: number, dy: number) => {
        let r = 0;
        for (let i = 0; i < skirt.length; i += 3) {
          const y = skirt[i + 1]!;
          if (Math.abs(y - y0) <= dy) r = Math.max(r, Math.hypot(skirt[i]!, skirt[i + 2]!));
        }
        return r;
      };
      fit[stage] = { bs: bodyScale(t), standoff: sumD / n, flare: rAt(yH, 0.03) - rAt(yW, 0.03) };
    }
  }, 300_000);

  it('scales garment offsets down with the body', () => {
    const toddler = fit.toddler!, child = fit.child!, teen = fit.teen!, adult = fit.adult!;
    expect(toddler.bs).toBeLessThan(child.bs);
    expect(child.bs).toBeLessThan(teen.bs);
    expect(teen.bs).toBeLessThan(adult.bs);
    expect(toddler.standoff).toBeLessThan(adult.standoff * 0.6);
    expect(child.standoff).toBeLessThan(adult.standoff);
    // the fit as a fraction of the body is the same at every age, rather than growing on small bodies
    expect(toddler.standoff / toddler.bs).toBeLessThan(adult.standoff * 1.15);
    expect(child.standoff / child.bs).toBeLessThan(adult.standoff * 1.15);
  });

  it('reduces skirt flare for toddlers and children', () => {
    expect(fit.toddler!.flare).toBeLessThan(fit.adult!.flare * 0.6);
    expect(fit.child!.flare).toBeLessThan(fit.adult!.flare * 0.8);
  });
});

describe.skipIf(!have)('elder wrinkles', () => {
  it('darkens the forehead, crow\'s feet and under-eye lines and not the back of the head', async () => {
    const { ageShading, wrinkleIntensity } = await import('../../../src/characters/materials');
    expect(wrinkleIntensity([0, 0.152, 0.07])).toBeGreaterThan(0.3);
    expect(wrinkleIntensity([0, 0.169, 0.07])).toBeGreaterThan(0.2);
    expect(wrinkleIntensity([0.05, 0.0985, 0.06])).toBeGreaterThan(0.3); // crow's feet
    expect(wrinkleIntensity([0.03, 0.0837, 0.07])).toBeGreaterThan(0.2); // under-eye line
    expect(wrinkleIntensity([0, 0.152, -0.07])).toBe(0);
    expect(wrinkleIntensity([0, 0.0, 0.07])).toBe(0); // chin
    // broad age shading: the under-eye hollow and the nasolabial region, never the back of the head
    expect(ageShading([0.032, 0.0835, 0.07])).toBeGreaterThan(0.2);
    expect(ageShading([0.029, 0.048, 0.07])).toBeGreaterThan(0.1);
    expect(ageShading([0, 0.152, -0.07])).toBe(0);
  });

  it('gives only the elder a shared wrinkle map', async () => {
    const { toGeometry } = await import('../../../src/characters/geometry');
    const { createMpfbSkinMaterial, wrinkleMapForStage } = await import('../../../src/characters/materials');
    const elder = await loadMpfbBody('f', 'mpfb_elder_f');
    const adult = await loadMpfbBody('f', 'mpfb_f');
    const elderGeo = toGeometry(assembleMpfb(elder.raw, elder.prims, elder.extras).meshes.skin!, 'skin');
    const adultGeo = toGeometry(assembleMpfb(adult.raw, adult.prims, adult.extras).meshes.skin!, 'skin');
    const map = wrinkleMapForStage('elder', elderGeo);
    expect(map).not.toBeNull();
    expect(map!.image.width).toBe(512);
    const data = map!.image.data as Uint8Array;
    expect(data.length).toBe(512 * 512 * 2); // red: lines, green: broad age shading
    expect(data.some((v) => v > 40)).toBe(true);
    let shadedTexels = 0;
    for (let i = 1; i < data.length; i += 2) if ((data[i] as number) > 40) shadedTexels++;
    expect(shadedTexels).toBeGreaterThan(500);
    expect(wrinkleMapForStage('elder', elderGeo)).toBe(map); // one texture, built once
    expect(wrinkleMapForStage('adult', adultGeo)).toBeNull();
    expect(wrinkleMapForStage('teen', elderGeo)).toBeNull();
    expect(createMpfbSkinMaterial(map).uniforms.uWrinkleMap.value).toBe(map);
    expect(createMpfbSkinMaterial().uniforms.uWrinkleMap.value).toBeNull();
  }, 120_000);
});

describe('retargetClips', () => {
  const bone = (name: string, y: number, z: number, parent?: THREE.Bone) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(0, y, z);
    parent?.add(b);
    return b;
  };
  const frameOf = (k: number): FrameAssets => {
    const root = bone('root', 0, 0);
    bone('pelvis', 0.05 * k, 0.917 * k, root);
    return { rootBone: root } as unknown as FrameAssets;
  };
  const clip = new THREE.AnimationClip('Walk_Loop', 1, [
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 1], [0, 0.05, 0.9, 0, 0.05, 0.8]),
    new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0.1, 0, 0]),
    new THREE.QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
  ]);

  it('scales the root and pelvis translation tracks by how much lower the stage pelvis is, and leaves rotations alone', () => {
    const out = retargetClips(new Map([['Walk_Loop', clip]]), frameOf(1), frameOf(0.5)).get('Walk_Loop')!;
    const pel = out.tracks.find((t) => t.name === 'pelvis.position')!;
    expect(Array.from(pel.values)).toEqual([0, 0.025, 0.45, 0, 0.025, 0.4].map((v) => expect.closeTo(v, 5)));
    expect(Array.from(out.tracks.find((t) => t.name === 'root.position')!.values).map((v) => +v.toFixed(4))).toEqual([0, 0, 0, 0.05, 0, 0]);
    expect(Array.from(out.tracks.find((t) => t.name === 'spine_01.quaternion')!.values)).toEqual(Array.from(clip.tracks[2]!.values));
    expect(out.duration).toBe(clip.duration);
  });

  it('does not touch the source clip', () => {
    retargetClips(new Map([['Walk_Loop', clip]]), frameOf(1), frameOf(0.5));
    expect(clip.tracks[0]!.values[2]).toBeCloseTo(0.9, 6);
  });
});

describe('stage cadence', () => {
  it('quickens the steps of the short-legged stages and slows the elder', () => {
    expect(stageLook('toddler').cadence).toBeGreaterThan(stageLook('child').cadence);
    expect(stageLook('child').cadence).toBeGreaterThan(stageLook('teen').cadence);
    expect(stageLook('adult').cadence).toBe(1);
    expect(stageLook('elder').cadence).toBeLessThan(1);
    expect(LOCOMOTION_CLIPS.has('Walk_Loop')).toBe(true);
    expect(LOCOMOTION_CLIPS.has('Idle_Loop')).toBe(false);
  });
  it('gives only the elder a stoop', () => {
    for (const s of ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult'] as const) expect(stageLook(s).stoop).toBe(0);
    expect(stageLook('elder').stoop).toBeGreaterThan(0.05);
    expect(stageLook('elder').stoop).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------------------------
// Posture anchors
// ---------------------------------------------------------------------------------------------

describe('posture anchors by stage', () => {
  const anchor = { x: 1, y: 0.45, z: 2 };
  it('seats a child lower in the clip than an adult (the pelvis is closer to the floor), so the feet hang above the floor', () => {
    const adult = seatedPlacement(anchor, 0, 'a', 'mpfb');
    const child = seatedPlacement(anchor, 0, 'a', 'mpfb', { stage: 'child' });
    expect(adult.y).toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.mpfb.a.seatHeight, 6);
    expect(child.y).toBeGreaterThan(adult.y);
    expect(child.y).toBeGreaterThan(0.05); // the root floats above the floor: the child's legs do not reach it
    expect(child.y).toBeLessThan(0.45);
  });

  it('scales the adult anchors when the stage has no body of its own (classic, detailed, still loading) and uses the measured ones otherwise', () => {
    const k = stageFallbackScale('toddler');
    const scaled = seatedPlacement(anchor, 0, 'b', 'classic', { stage: 'toddler' });
    expect(scaled.y).toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.frames.b.seatHeight * k, 6);
    const notOwn = seatedPlacement(anchor, 0, 'b', 'mpfb', { stage: 'toddler', own: false });
    expect(notOwn.y).toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.mpfb.b.seatHeight * k, 6);
    const own = seatedPlacement(anchor, 0, 'b', 'mpfb', { stage: 'toddler', own: true });
    const m = STAGE_SEATED.toddler?.b;
    expect(own.y).toBeCloseTo(0.45 - (m?.seatHeight ?? POSTURE_ANCHORS.seated.mpfb.b.seatHeight * k), 6);
  });

  it('measured anchors of every stage body are plausible (sitting and lying)', () => {
    // the baby does not sit on chairs: its anchor is the floor it sits up on (the root rides a little above the lowest point)
    expect(Math.abs(STAGE_SEATED.baby!.a.seatHeight)).toBeLessThan(0.08);
    for (const [stage, m] of Object.entries(STAGE_SEATED)) {
      if (stage === 'baby') continue;
      const k = STAGE_HEIGHTS[stage as LifeStage] / 1.8;
      for (const f of ['a', 'b'] as const) {
        expect(m[f].seatHeight, `${stage} ${f}`).toBeGreaterThan(0.3 * k * POSTURE_ANCHORS.seated.mpfb.a.seatHeight);
        expect(m[f].seatHeight, `${stage} ${f}`).toBeLessThan(1.4 * k * POSTURE_ANCHORS.seated.mpfb.a.seatHeight);
        expect(m[f].seatZ).toBeLessThan(0);
      }
    }
    for (const [stage, l] of Object.entries(STAGE_LYING)) {
      expect(l.length, stage).toBeGreaterThan(0.2);
      expect(l.length, stage).toBeLessThan(2);
    }
  });

  it('lays a baby lower and shorter than an adult: the middle of the body sits closer to the sleeping centre', () => {
    const c = { x: 0, y: 0.5, z: 0 };
    const adult = lyingPlacement(c, 0);
    const baby = lyingPlacement(c, 0, { stage: 'baby' });
    expect(Math.abs(baby.z)).toBeLessThan(Math.abs(adult.z));
    expect(baby.y).toBeLessThan(0.5 + 0.1);
    expect(baby.yaw).toBe(0);
    // adults and the youngAdult are untouched by a stage option
    expect(lyingPlacement(c, 1, { stage: 'youngAdult' })).toEqual(lyingPlacement(c, 1));
  });
});

// ---------------------------------------------------------------------------------------------
// Stoop and cradle (on the real skeleton of the game)
// ---------------------------------------------------------------------------------------------

describe.skipIf(!existsSync(`${dir}body_a.glb`))('stoop and cradle', () => {
  let root: THREE.Bone;
  let bones: Map<string, THREE.Bone>;
  beforeAll(async () => {
    const doc = await new NodeIO().read(`${dir}body_a.glb`);
    const joints = doc.getRoot().listSkins()[0]!.listJoints();
    bones = new Map();
    for (const j of joints) {
      const b = new THREE.Bone();
      b.name = j.getName();
      b.position.fromArray(j.getTranslation());
      b.quaternion.fromArray(j.getRotation());
      bones.set(b.name, b);
    }
    for (const j of joints) { const p = j.getParentNode(); if (p && bones.has(p.getName())) bones.get(p.getName())!.add(bones.get(j.getName())!); }
    root = bones.get('root')!;
  });
  const world = (name: string) => { root.updateMatrixWorld(true); return bones.get(name)!.getWorldPosition(new THREE.Vector3()); };
  const reset = (snapshot: Map<string, THREE.Quaternion>) => { for (const [n, q] of snapshot) bones.get(n)!.quaternion.copy(q); };
  const snapshot = () => new Map([...bones].map(([n, b]) => [n, b.quaternion.clone()] as const));

  it('leans the head forward and down with the stoop, and keeps the pelvis where it is', () => {
    const rest = snapshot();
    const head0 = world('Head').clone(), pelvis0 = world('pelvis').clone();
    applyStoop(bones, 0.15);
    const head1 = world('Head');
    expect(head1.z - head0.z).toBeGreaterThan(0.03);
    expect(head1.y).toBeLessThan(head0.y);
    expect(head0.y - head1.y).toBeLessThan(0.06);
    expect(world('pelvis').distanceTo(pelvis0)).toBeLessThan(1e-6);
    reset(rest);
    applyStoop(bones, 0);
    expect(world('Head').distanceTo(head0)).toBeLessThan(1e-6);
  });

  it('holds the forearms out in front, below the chest, under a baby: both arms, mirrored', () => {
    const rest = snapshot();
    const bind = bindBones(root, CRADLE_PAIRS);
    expect([...bind.keys()].sort()).toEqual(Object.keys(CRADLE_PAIRS).sort());
    applyCradle(bones, bind, 0);
    expect(world('hand_l').distanceTo(new THREE.Vector3().setFromMatrixPosition(bones.get('hand_l')!.matrixWorld))).toBeLessThan(1e-6);
    applyCradle(bones, bind, 1);
    for (const side of ['l', 'r'] as const) {
      const dir = world(`hand_${side}`).sub(world(`lowerarm_${side}`)).normalize();
      expect(dir.z, side).toBeGreaterThan(0.6); // forward
      expect(Math.abs(dir.y), side).toBeLessThan(0.5);
      const fore = world(`lowerarm_${side}`).sub(world(`upperarm_${side}`)).normalize();
      expect(fore.y, side).toBeLessThan(-0.4); // the upper arm hangs down
    }
    const l = world('hand_l'), r = world('hand_r');
    expect(l.x).toBeGreaterThan(0);
    expect(r.x).toBeLessThan(0);
    expect(Math.abs(l.x + r.x)).toBeLessThan(0.02); // symmetric
    expect(l.z).toBeGreaterThan(world('pelvis').z + 0.3);
    expect(l.y).toBeGreaterThan(world('pelvis').y);
    expect(l.y).toBeLessThan(world('neck_01').y);
    // the baby lies at the cradle point of the carrier's own height: in front of the hands' height band
    expect(CRADLE.z).toBeGreaterThan(0.15);
    reset(rest);
  });

  it('blends the cradle in smoothly: half weight lies between the clip pose and the cradle', () => {
    const rest = snapshot();
    const bind = bindBones(root, CRADLE_PAIRS);
    const z0 = world('hand_l').z;
    applyCradle(bones, bind, 1);
    const z1 = world('hand_l').z;
    reset(rest);
    applyCradle(bones, bind, 0.5);
    const zh = world('hand_l').z;
    expect(zh).toBeGreaterThan(Math.min(z0, z1) - 1e-6);
    expect(zh).toBeLessThan(Math.max(z0, z1) + 1e-6);
    reset(rest);
  });
});
