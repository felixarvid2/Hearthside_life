// AI hairstyles (public/assets/characters/hair/*.glb, built by tools/build-ai-hair.mts): the shipped files are small and
// sound, the tint map is a bright greyscale, the loader reads them, and the runtime fits them to both body frames in both
// character styles (head-local data -> classic head directly, Meshy head through HeadMap), with skin, morphs and no
// hair inside the torso.
import * as THREE from 'three';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { HAIR } from '../../../src/content/character';
import { HAIR_MORPHS } from '../../../src/characters/hair';
import { AI_HAIR_ATTRS, buildAiHair, clearBody, isMeshHair } from '../../../src/characters/aiHair';
import type { AiHairData } from '../../../src/characters/aiHair';
import { aiHairFromScene } from '../../../src/characters/assets';
import { HeadMap } from '../../../src/characters/headMap';
import { createAiHairMaterial } from '../../../src/characters/materials';
import { sampleProfile } from '../../../src/characters/fit';
import { buildBodyTemplate } from '../../../src/characters/template';
import type { BodyTemplate } from '../../../src/characters/template';
import { toGeometry } from '../../../src/characters/geometry';
import { loadAiHairFile, loadMeshyBody, loadRawBody } from './loadRaw';

const defs = HAIR.filter(isMeshHair);
const files = {} as Record<string, Awaited<ReturnType<typeof loadAiHairFile>>>;
const templates = {} as Record<string, BodyTemplate>;

beforeAll(async () => {
  for (const d of defs) files[d.id] = await loadAiHairFile(d.id);
  for (const f of ['a', 'b'] as const) {
    templates[`classic-${f}`] = buildBodyTemplate(await loadRawBody(f));
    const m = await loadMeshyBody(f);
    const t = buildBodyTemplate(m.raw, { stylise: false, skinParts: false });
    t.headMap = new HeadMap(m.extras.head, t.headOrigin);
    templates[`meshy-${f}`] = t;
  }
}, 120_000);

describe('AI hairstyle content', () => {
  it('has at least 14 generated styles, each with a procedural stand-in build and an asset path', () => {
    expect(defs.length).toBeGreaterThanOrEqual(14);
    expect(HAIR.filter((h) => h.status === 'ready').length).toBeGreaterThanOrEqual(24);
    for (const d of defs) {
      expect(d.build.asset, d.id).toBe(`hair/${d.id}.glb`);
      expect(['none', 'curls', 'bob', 'long', 'ponytail', 'bun', 'afro', 'braids'], d.id).toContain(d.build.piece);
    }
    expect(new Set(HAIR.map((h) => h.id)).size).toBe(HAIR.length);
  });
});

describe.each(defs.map((d) => d.id))('shipped hair GLB %s', (id) => {
  it('is small, hair-only and in head-local metres', () => {
    const { data, bytes, extras } = files[id]!;
    const tris = data.index.length / 3;
    expect(tris).toBeGreaterThan(1500);
    expect(tris).toBeLessThanOrEqual(4300);
    expect(bytes).toBeLessThan(400_000);
    expect(extras.space).toBe('head-local');
    let minY = Infinity, maxY = -Infinity, maxR = 0;
    for (let i = 0; i < data.positions.length; i += 3) {
      minY = Math.min(minY, data.positions[i + 1]!); maxY = Math.max(maxY, data.positions[i + 1]!);
      maxR = Math.max(maxR, Math.hypot(data.positions[i]!, data.positions[i + 2]!));
    }
    // sits on a head: the top is near the crown (0.229), nothing floats or sinks far from the head
    expect(maxY).toBeGreaterThan(0.2);
    expect(maxY).toBeLessThan(0.5);
    expect(minY).toBeGreaterThan(-0.4);
    expect(maxR).toBeLessThan(0.35);
    for (let i = 0; i < data.index.length; i++) expect(data.index[i]!).toBeLessThan(data.positions.length / 3);
  });

  it('has unit normals, uv inside the map and a root shade in 0..1', () => {
    const { data } = files[id]!;
    let badN = 0, badUv = 0, badS = 0;
    for (let i = 0; i < data.positions.length / 3; i++) {
      if (Math.abs(Math.hypot(data.normals[i * 3]!, data.normals[i * 3 + 1]!, data.normals[i * 3 + 2]!) - 1) > 0.02) badN++;
      if (data.uv[i * 2]! < -1e-4 || data.uv[i * 2]! > 1 + 1e-4 || data.uv[i * 2 + 1]! < -1e-4 || data.uv[i * 2 + 1]! > 1 + 1e-4) badUv++;
      if (data.shade[i]! < 0.3 || data.shade[i]! > 1.0001) badS++;
    }
    expect([badN, badUv, badS]).toEqual([0, 0, 0]);
  });

  it('has a 512 px greyscale tint map that is bright enough to be tinted to any colour', async () => {
    const { texture, material } = files[id]!;
    expect(material.getMetallicFactor()).toBe(0);
    expect(material.getDoubleSided()).toBe(true);
    const img = await sharp(Buffer.from(texture.getImage()!)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([img.info.width, img.info.height]).toEqual([512, 512]);
    let grey = 0, sum = 0, sum2 = 0;
    const n = img.info.width * img.info.height;
    for (let i = 0; i < n; i++) {
      const r = img.data[i * 3]!, g = img.data[i * 3 + 1]!, b = img.data[i * 3 + 2]!;
      if (Math.abs(r - g) < 2 && Math.abs(g - b) < 2) grey++;
      sum += g / 255; sum2 += (g / 255) ** 2;
    }
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    expect(grey / n).toBeGreaterThan(0.99);
    expect(mean).toBeGreaterThan(0.6);
    expect(mean).toBeLessThan(0.97);
    expect(sd).toBeGreaterThan(0.03); // strand detail survives
  });
});

describe('loading and tinting', () => {
  it('reads a GLB scene into AiHairData and a tint map', () => {
    const id = defs[0]!.id;
    const f = files[id]!;
    // a THREE scene with the file's arrays, as GLTFLoader would produce
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(f.data.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(f.data.normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(f.data.uv, 2));
    const col = new Uint8Array((f.data.shade.length) * 4);
    f.data.shade.forEach((s, i) => { col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = Math.round(s * 255); col[i * 4 + 3] = 255; });
    g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    g.setIndex(new THREE.BufferAttribute(Uint16Array.from(f.data.index), 1));
    const map = new THREE.Texture();
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map })));
    const a = aiHairFromScene(id, scene);
    expect(a.data.positions.length).toBe(f.data.positions.length);
    expect(a.data.index.length).toBe(f.data.index.length);
    expect(a.data.shade[5]).toBeCloseTo(f.data.shade[5]!, 2);
    expect(a.map).toBe(map);
    expect(a.map.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('multiplies the hair colour with the tint map and lifts highlight clumps', () => {
    const map = new THREE.Texture();
    const { material, uniforms } = createAiHairMaterial(map);
    expect(material.map).toBe(map);
    expect(material.vertexColors).toBe(true);
    expect(material.metalness).toBe(0);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.transparent).toBe(false);
    material.color.set('#c8a064');
    expect(material.color.getHexString()).toBe('c8a064');
    expect(uniforms.uHighlight.value.w).toBe(0);
    // the shader is patched (highlight and selection live there)
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '', fragmentShader: '#include <common>\n#include <color_fragment>' } as unknown as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, null as never);
    expect(shader.fragmentShader).toContain('uHighlight');
    expect(shader.fragmentShader).toContain('texture2D(map, vMapUv)');
    expect(shader.uniforms.uHighlight).toBe(uniforms.uHighlight);
    expect(shader.uniforms.uSelect).toBe(uniforms.uSelect);
  });
});

describe.each(['classic-a', 'classic-b', 'meshy-a', 'meshy-b'])('AI hair on the %s body', (key) => {
  it.each(defs.map((d) => d.id))('fits %s: skinned, morphed, on the head and out of the torso', { timeout: 30_000 }, (id) => {
    const t = templates[key]!;
    const data = files[id]!.data as AiHairData;
    const m = buildAiHair(t, data);
    const n = data.positions.length / 3;
    expect(m.positions.length).toBe(n * 3);
    expect(m.indices.length).toBe(data.index.length);
    for (const [name, a] of Object.entries(AI_HAIR_ATTRS)) expect(m.attrs[name]!.data.length, name).toBe(n * a);
    for (const name of HAIR_MORPHS) expect(m.morphs[name], name).toHaveLength(n * 3);
    // skin: weights sum to one, the skull part follows the Head bone alone
    const head = t.raw.boneNames.indexOf('Head');
    let crownAbove = 0, crownRigid = 0;
    for (let i = 0; i < n; i++) {
      const w = m.skinWeight;
      expect(w[i * 4]! + w[i * 4 + 1]! + w[i * 4 + 2]! + w[i * 4 + 3]!).toBeCloseTo(1, 4);
      if (data.positions[i * 3 + 1]! > 0.12) { crownAbove++; if (m.skinIndex[i * 4] === head && w[i * 4]! > 0.999) crownRigid++; }
    }
    expect(crownRigid / Math.max(1, crownAbove)).toBeGreaterThan(0.99);
    // the face sculpt moves the scalp part, hairClear moves the hanging part
    expect(m.morphs.faceWidth!.some((v) => Math.abs(v) > 1e-5), 'faceWidth').toBe(true);
    // never inside the torso: every vertex below the shoulders keeps its distance from the torso surface
    let inside = 0;
    for (let i = 0; i < n; i++) {
      const x = m.positions[i * 3]!, y = m.positions[i * 3 + 1]!, z = m.positions[i * 3 + 2]!;
      if (y > t.lm.neckBaseY || y < t.lm.chestY) continue;
      const q = sampleProfile(t.profiles.torso, y, 0);
      const a = Math.atan2(x - q.ca, z - q.cb);
      const s = sampleProfile(t.profiles.torso, y, a);
      if (Math.hypot(x - s.ca, z - s.cb) < s.r - 0.004) inside++;
    }
    expect(inside, 'vertices inside the torso').toBe(0);
    // converts to a GPU geometry with uv and colour attributes
    const g = toGeometry(m, id);
    expect(g.getAttribute('uv').count).toBe(n);
    expect(g.getAttribute('color').itemSize).toBe(3);
  });
});

describe('Meshy head fit', () => {
  it.each(['a', 'b'] as const)('puts the hair top of every style near the real crown of frame %s', (f) => {
    const t = templates[`meshy-${f}`]!;
    const crown = t.headMap!.info.crownY;
    for (const d of defs) {
      const m = buildAiHair(t, files[d.id]!.data);
      let top = -Infinity;
      for (let i = 1; i < m.positions.length; i += 3) top = Math.max(top, m.positions[i]!);
      expect(top, d.id).toBeGreaterThan(crown - 0.01);
      expect(top, d.id).toBeLessThan(crown + 0.2);
    }
  });

  it('pushes hair that hangs inside the torso out to its surface', () => {
    const t = templates['meshy-b']!;
    const y = t.lm.chestY + 0.1;
    const q = sampleProfile(t.profiles.torso, y, Math.PI);
    const m = { positions: [q.ca, y, q.cb - q.r * 0.5], normals: [], indices: [], skinIndex: [], skinWeight: [], attrs: {}, morphs: {} };
    clearBody(t, m);
    expect(Math.hypot(m.positions[0]! - q.ca, m.positions[2]! - q.cb)).toBeGreaterThanOrEqual(q.r);
  });
});
