// The second builds (Lean, Slim): another man and another woman drawn from the base bodies' files with their own build, face,
// proportions and skin texture, at every life stage (BodyPresetDef.base / .shape / .proportions / .skin).
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import { validateManifest } from '../../../../src/characters/modular/manifest';
import { randomizeLook } from '../../../../src/characters/modular/equip';
import { STAGE_PROPORTIONS } from '../../../../src/characters/modular/stageProportions';
import type { LifeStage } from '../../../../src/core/types';
import { Rng } from '../../../../src/core/rng';
import { loadClips, look, realManifest, repo, testCache } from './helpers';

const m = realManifest();
const seconds = m.bodies.filter((b) => b.base !== undefined);
const STAGES: LifeStage[] = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];

function influences(c: ModularCharacter, name: string): number[] {
  const out: number[] = [];
  c.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const i = mesh.morphTargetDictionary?.[name];
    if (i !== undefined && mesh.morphTargetInfluences) out.push(mesh.morphTargetInfluences[i]!);
  });
  return out;
}

const boneX = (c: ModularCharacter, name: string): number => { c.root.updateMatrixWorld(true); return c.bone(name)!.getWorldPosition(new THREE.Vector3()).x; };

describe('second builds', () => {
  it('the manifest is valid and has one more man and one more woman', () => {
    expect(validateManifest(m)).toEqual([]);
    expect(seconds.map((b) => b.frame).sort()).toEqual(['a', 'b']);
    for (const b of seconds) {
      const base = m.bodies.find((x) => x.id === b.base)!;
      expect(base.frame, b.id).toBe(b.frame);
      expect(b.file).toBe(base.file);
      expect(b.label).not.toBe(base.label);
      expect(b.shape!.map((s) => s.morph).sort()).toEqual(['build2', 'face2']);
      expect(existsSync(repo(`public/assets/characters/modular/${b.skin}`)), b.skin).toBe(true);
    }
  });

  it('wear everything their base body wears, from the same files', () => {
    for (const b of seconds) {
      for (const part of [...m.garments, ...m.hairstyles, ...(m.facialHair ?? [])]) {
        expect(part.files[b.id], `${part.id} on ${b.id}`).toBe(part.files[b.base!]);
      }
      for (const g of m.garments) expect(g.covers?.[b.id], `${g.id} cover on ${b.id}`).toBe(g.covers?.[b.base!]);
    }
  });

  it.each(seconds.map((b) => b.id))('%s: every life stage draws, with its build on grown-ups and the child\'s body on children', async (bodyId) => {
    const c = new ModularCharacter(testCache(), m, await loadClips());
    const outfit = { everyday: { top: 'tshirt_crew', bottom: 'trousers_straight' } };
    for (const stage of STAGES) {
      await c.apply(look({ bodyId, outfits: outfit }), 'everyday', stage);
      expect(c.equipped().bodyId, stage).toBe(bodyId);
      const y = Math.min(1, STAGE_PROPORTIONS[stage].young);
      const build = influences(c, 'build2'), face = influences(c, 'face2');
      expect(build.length, stage).toBeGreaterThan(17);          // skin regions and both garments
      for (const v of build) expect(v, `${stage} build`).toBeCloseTo(1 - y, 5);
      for (const v of face) expect(v, `${stage} face`).toBeCloseTo(1 - 0.5 * y, 5);
      for (const v of influences(c, 'young')) expect(v, `${stage} young`).toBeCloseTo(STAGE_PROPORTIONS[stage].young, 5);
    }
    c.dispose();
  });

  it.each(seconds.map((b) => [b.id, b.base!]))('%s is narrower in the shoulders than %s and as tall', async (bodyId, baseId) => {
    const a = new ModularCharacter(testCache(), m, await loadClips()), b = new ModularCharacter(testCache(), m, await loadClips());
    await a.apply(look({ bodyId }), 'everyday', 'adult');
    await b.apply(look({ bodyId: baseId }), 'everyday', 'adult');
    for (const v of [...influences(b, 'build2'), ...influences(b, 'face2')]) expect(v).toBe(0);      // the base body is untouched
    const wide = (c: ModularCharacter) => Math.abs(boneX(c, 'upperarm_l') - boneX(c, 'upperarm_r'));
    expect(wide(a)).toBeLessThan(wide(b) * 0.99);
    const headY = (c: ModularCharacter) => c.bone('Head')!.getWorldPosition(new THREE.Vector3()).y;
    expect(headY(a) / headY(b)).toBeGreaterThan(0.97);
    expect(headY(a) / headY(b)).toBeLessThan(1.03);
    const footY = (c: ModularCharacter) => c.bone('foot_l')!.getWorldPosition(new THREE.Vector3()).y;
    expect(footY(a)).toBeCloseTo(footY(b), 2);                // soles on the floor
    a.dispose(); b.dispose();
  });

  it('a look never sets the stage morphs, and random looks do not roll them', async () => {
    const c = new ModularCharacter(testCache(), m, await loadClips());
    await c.apply(look({ morphs: { build2: 1, face2: 1, young: 1 } }), 'everyday', 'adult');
    for (const k of ['build2', 'face2', 'young']) for (const v of influences(c, k)) expect(v, k).toBe(0);
    c.dispose();
    const rng = new Rng([11, 22, 33, 44]);
    const picked = new Set<string>();
    for (let k = 0; k < 60; k++) {
      const l = look({});
      randomizeLook(m, l, rng, { body: true });
      picked.add(l.bodyId);
      expect(Object.keys(l.morphs).filter((id) => ['build2', 'face2', 'young'].includes(id))).toEqual([]);
    }
    expect(picked.size).toBe(m.bodies.length);                // random people come in every build
  });
});
