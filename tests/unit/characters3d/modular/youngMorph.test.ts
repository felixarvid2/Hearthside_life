// The `young` morph (tools/characters/blender/stage_morph.py): children are drawn with a child's body and face, not a scaled adult.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import { STAGE_PROPORTIONS } from '../../../../src/characters/modular/stageProportions';
import { applyStance, modelQuat, stageLook } from '../../../../src/characters/stagePose';
import { ModularAssetCache } from '../../../../src/characters/modular/cache';
import { existsSync } from 'node:fs';
import { parseGlb, repo } from './helpers';
import { loadClips, look, realManifest, testCache } from './helpers';

const m = realManifest();

function influence(c: ModularCharacter, name: string): number[] {
  const out: number[] = [];
  c.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const i = mesh.morphTargetDictionary?.[name];
    if (i !== undefined && mesh.morphTargetInfluences) out.push(mesh.morphTargetInfluences[i]!);
  });
  return out;
}

describe('young morph', () => {
  it('is declared by both bodies as a stage morph the creator does not list', () => {
    for (const b of m.bodies) {
      const y = b.morphs.find((x) => x.id === 'young');
      expect(y, b.id).toBeDefined();
      expect(y!.group).toBe('stage');
      expect(y!.range[1]).toBeGreaterThanOrEqual(Math.max(...Object.values(STAGE_PROPORTIONS).map((p) => p.young)));
    }
  });

  it('is followed by the clothes a child wears', () => {
    for (const id of ['tshirt_crew', 'trousers_straight', 'hoodie_pullover']) {
      expect(m.garments.find((g) => g.id === id)!.followsMorphs, id).toContain('young');
    }
  });

  it.each(['ubc_male', 'ubc_female'])('%s: body and garments are young on a child and not on an adult', async (bodyId) => {
    const c = new ModularCharacter(testCache(), m, await loadClips());
    await c.apply(look({ bodyId }), 'everyday', 'child');
    const bare = influence(c, 'young').length;
    expect(bare).toBeGreaterThanOrEqual(17);                  // the skin regions
    await c.apply(look({ bodyId, outfits: { everyday: { top: 'tshirt_crew', bottom: 'trousers_straight' } } }), 'everyday', 'child');
    expect(c.issues.filter((x) => !/cover/i.test(x))).toEqual([]);   // the test cache serves no cover masks
    const child = influence(c, 'young');
    expect(child.length).toBeGreaterThanOrEqual(bare + 2);    // and both garments
    for (const v of child) expect(v).toBeCloseTo(STAGE_PROPORTIONS.child.young, 5);
    await c.apply(look({ bodyId }), 'everyday', 'adult');
    for (const v of influence(c, 'young')) expect(v).toBe(0);
    c.dispose();
  });

  it('hair follows it, so a fringe stays on the child\'s forehead', async () => {
    expect(m.hairstyles.length).toBeGreaterThan(0);
    for (const h of m.hairstyles) expect(h.followsMorphs, h.id).toContain('young');
    const c = new ModularCharacter(testCache(), m, await loadClips());
    const hairId = m.hairstyles[0]!.id;
    await c.apply(look({ hairId }), 'everyday', 'child');
    const bodyOnly = new ModularCharacter(testCache(), m, await loadClips());
    await bodyOnly.apply(look({}), 'everyday', 'child');
    expect(influence(c, 'young').length).toBeGreaterThan(influence(bodyOnly, 'young').length);
    c.dispose(); bodyOnly.dispose();
  });

  it.each(['ubc_male', 'ubc_female'])('%s: the child\'s skin texture exists and is put on young stages only', async (bodyId) => {
    const def = m.bodies.find((b) => b.id === bodyId)!;
    expect(def.youngSkin).toBeDefined();
    expect(existsSync(repo(`public/assets/characters/modular/${def.youngSkin}`))).toBe(true);
    const young = new THREE.Texture();
    const asked: string[] = [];
    const cache = new ModularAssetCache({
      root: 'mem://',
      load: (url) => parseGlb(repo(`public/assets/characters/modular/${url.slice(6)}`)),
      loadMask: async () => { throw new Error('no mask'); },
      loadTexture: async (url) => { asked.push(url); return young; },
    });
    const skinMap = (c: ModularCharacter): THREE.Texture | null => {
      let map: THREE.Texture | null = null;
      c.root.traverse((o) => { const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mat && !Array.isArray(mat) && mat.name === def.skinMaterials[0]) map = mat.map; });
      return map;
    };
    const c = new ModularCharacter(cache, m, await loadClips());
    await c.apply(look({ bodyId }), 'everyday', 'adult');
    const adult = skinMap(c);
    expect(adult).not.toBeNull();
    expect(asked).toEqual([]);                               // grown-ups never fetch it
    await c.apply(look({ bodyId }), 'everyday', 'toddler');
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual([`mem://${def.youngSkin}`]);
    const drawn = skinMap(c)!;
    expect(drawn).not.toBe(adult);
    expect(drawn.flipY).toBe(adult!.flipY);                  // laid out like the body's own map
    expect(drawn.colorSpace).toBe(adult!.colorSpace);
    await c.apply(look({ bodyId }), 'everyday', 'teen');
    expect(skinMap(c)).toBe(adult);
    c.dispose();
  });
});

describe('narrow stance', () => {
  it('is set for the small stages only', () => {
    for (const s of ['toddler', 'child'] as const) expect(stageLook(s).stance).toBeGreaterThan(0.1);
    for (const s of ['adult', 'youngAdult', 'elder'] as const) expect(stageLook(s).stance ?? 0).toBe(0);
  });

  it('draws the legs in and keeps the feet level', () => {
    const root = new THREE.Bone(); root.name = 'root';
    const mk = (name: string, parent: THREE.Bone, x: number, y: number) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, 0); parent.add(b); return b; };
    const bones = new Map<string, THREE.Bone>([['root', root]]);
    for (const [side, sx] of [['l', 1], ['r', -1]] as const) {
      const thigh = mk(`thigh_${side}`, root, sx * 0.1, 0.9); thigh.rotation.z = sx * 0.2;          // splayed like the shared idle
      const calf = mk(`calf_${side}`, thigh, 0, -0.45);
      const foot = mk(`foot_${side}`, calf, 0, -0.45);
      bones.set(thigh.name, thigh); bones.set(calf.name, calf); bones.set(foot.name, foot);
    }
    root.updateMatrixWorld(true);
    const x0 = bones.get('foot_l')!.getWorldPosition(new THREE.Vector3()).x;
    const q0 = modelQuat(bones.get('foot_l')!).clone();
    applyStance(bones, 0.15);
    root.updateMatrixWorld(true);
    const l = bones.get('foot_l')!.getWorldPosition(new THREE.Vector3()), r = bones.get('foot_r')!.getWorldPosition(new THREE.Vector3());
    expect(l.x).toBeLessThan(x0 - 0.1);                      // the left foot came in
    expect(l.x).toBeCloseTo(-r.x, 5);                        // both sides alike
    expect(l.x).toBeGreaterThan(0);                          // and they did not cross
    expect(modelQuat(bones.get('foot_l')!).angleTo(q0)).toBeLessThan(1e-6);   // the sole is as level as before
  });
});
