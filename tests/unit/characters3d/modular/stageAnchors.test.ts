// Life-stage figures of the modular bodies: heights, feet on the floor after hip retargeting, and the seat / bed anchors that
// posture.ts holds for them. `MEASURE=1 npx vitest run tests/unit/characters3d/modular/stageAnchors.test.ts` prints the anchors.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LifeStage } from '../../../../src/core/types';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import { STAGE_PROPORTIONS } from '../../../../src/characters/modular/stageProportions';
import { MODULAR_STAGE_LYING, MODULAR_STAGE_SEATED, POSTURE_ANCHORS } from '../../../../src/characters/posture';
import { loadClips, look, parseGlb, realManifest, testCache } from './helpers';

const m = realManifest();
const STAGES: LifeStage[] = ['baby', 'toddler', 'child', 'teen', 'adult', 'elder'];
const BODIES = [['a', 'ubc_male'], ['b', 'ubc_female']] as const;
const MEASURE = !!process.env.MEASURE;
let clipsP: Promise<THREE.AnimationClip[]> | null = null;
/** Both clip files, as the game loads them (the lying clips are in the second). */
const allClips = (): Promise<THREE.AnimationClip[]> => (clipsP ??= Promise.all([loadClips(), parseGlb('public/assets/characters/anims_2.glb').then((g) => g.animations)]).then((x) => x.flat()));

/** Skinned vertices of the body (hips and legs by default) in the character's world space after the pose. */
function skinnedPoints(c: ModularCharacter, regions: RegExp): THREE.Vector3[] {
  c.root.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  c.root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.visible) return;
    let n: THREE.Object3D | null = mesh;
    while (n && !n.name.startsWith('Body_')) n = n.parent;
    if (!n || !regions.test(n.name)) return;
    mesh.skeleton.update();
    const count = mesh.geometry.getAttribute('position').count;
    for (let i = 0; i < count; i++) pts.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  });
  return pts;
}

async function posed(bodyId: string, stage: LifeStage, anim: 'idle' | 'walk' | 'sitIdle' | 'sleep', t = 0.3): Promise<ModularCharacter> {
  const c = new ModularCharacter(testCache(), m, await allClips());
  await c.apply(look({ bodyId }), 'everyday', stage);
  c.play(anim, { fade: 0 });
  for (let i = 0; i < Math.round(t / 0.05) + 1; i++) c.update(0.05);
  return c;
}

const minY = (pts: THREE.Vector3[]) => Math.min(...pts.map((p) => p.y));

describe('stage figures', () => {
  it('stand at the stage height, monotonic from baby to adult', async () => {
    const heights: number[] = [];
    for (const stage of STAGES.filter((x) => x !== 'baby')) {
      const c = await posed('ubc_male', stage, 'idle', 0);
      const pts = skinnedPoints(c, /./);
      const top = Math.max(...pts.map((p) => p.y));
      heights.push(top);
      // the bare head's crown is the figure's top; the profile's height is that of the crown above the floor
      expect(top).toBeGreaterThan(STAGE_PROPORTIONS[stage].height * 1.82 * 0.97);
      expect(top).toBeLessThan(STAGE_PROPORTIONS[stage].height * 1.82 * 1.04);
      expect(minY(pts)).toBeGreaterThan(-0.03);
      c.dispose();
    }
    // elder is a little shorter than the adult, which is the tallest
    expect(heights.slice(0, 4).every((h, i, a) => i === 0 || h > a[i - 1]!)).toBe(true);
    expect(heights[4]).toBeLessThan(heights[3]!);
  });

  it('keep the soles on the floor while standing, walking and sitting down on a chair', async () => {
    for (const stage of STAGES.filter((x) => x !== 'baby')) {
      for (const [, bodyId] of BODIES) {
        for (const anim of ['idle', 'walk'] as const) {
          const c = await posed(bodyId, stage, anim, 0.4);
          const low = minY(skinnedPoints(c, /foot|calf/));
          // the lowest foot point stays within 6 cm of the floor over a walk cycle (adults: the same band)
          expect(low, `${bodyId} ${stage} ${anim}`).toBeGreaterThan(-0.06);
          expect(low, `${bodyId} ${stage} ${anim}`).toBeLessThan(0.08);
          c.dispose();
        }
      }
    }
  });

  it('have child-like proportions: the head is a larger share of the height the younger the stage', async () => {
    const share: number[] = [];
    for (const stage of ['toddler', 'child', 'teen', 'adult'] as const) {
      const c = await posed('ubc_male', stage, 'idle', 0);
      const head = c.bone('Head')!;
      const hp = head.getWorldPosition(new THREE.Vector3()).y;
      const top = Math.max(...skinnedPoints(c, /./).map((p) => p.y));
      share.push((top - hp) / top);
      c.dispose();
    }
    for (let i = 1; i < share.length; i++) expect(share[i]!).toBeLessThan(share[i - 1]!);
  });
});

describe('stage anchors', () => {
  it('seat and bed anchors in posture.ts match the figures (and grow with the stage)', async () => {
    for (const stage of STAGES) {
      if (stage === 'adult') continue;
      for (const [frame, bodyId] of BODIES) {
        const c = await posed(bodyId, stage, stage === 'baby' ? 'sitIdle' : 'sitIdle', 2);
        if (stage === 'baby') c.setBabyUpright(true);
        for (let i = 0; i < 20; i++) c.update(0.05);
        const hips = skinnedPoints(c, /hips|thigh/);
        const low = minY(hips);
        const near = hips.filter((p) => p.y < low + 0.01);
        const seatZ = near.reduce((s, p) => s + p.z, 0) / near.length;
        c.dispose();
        const l = await posed(bodyId, stage, 'sleep', 2);
        const all = skinnedPoints(l, /./);
        const backY = minY(skinnedPoints(l, /hips|thigh/));
        const zs = all.map((p) => p.z);
        const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
        l.dispose();
        if (MEASURE) console.log(`${stage} ${frame} seated { seatHeight: ${low.toFixed(3)}, seatZ: ${seatZ.toFixed(3)} } lying { backY: ${backY.toFixed(3)}, centerZ: ${centerZ.toFixed(3)} }`);
        else {
          const s = MODULAR_STAGE_SEATED[stage]?.[frame], ly = MODULAR_STAGE_LYING[stage]?.[frame];
          expect(s, `${stage} ${frame} seated anchor`).toBeDefined();
          expect(ly, `${stage} ${frame} lying anchor`).toBeDefined();
          expect(s!.seatHeight).toBeCloseTo(low, 2);
          expect(s!.seatZ).toBeCloseTo(seatZ, 2);
          expect(ly!.backY).toBeCloseTo(backY, 2);
          expect(ly!.centerZ).toBeCloseTo(centerZ, 2);
        }
      }
    }
    // an adult uses the existing adult anchors
    expect(POSTURE_ANCHORS.seated.modular.a.seatHeight).toBeGreaterThan(MODULAR_STAGE_SEATED.child!.a.seatHeight);
  });
});
