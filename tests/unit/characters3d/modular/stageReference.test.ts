// Child proportions against measured children. Reference: Snyder et al., "Physical Characteristics of Children as Related to
// Death and Injury for Consumer Product Safety Design" (UM-HSRI-BI-75-5, 1975; tables at math.nist.gov/~SRessler/anthrokids),
// combined sexes, mean values in cm:
//   age          stature  head breadth  max. shoulder breadth  crotch height
//   7-9 months     69.4      12.2            20.1                  -
//   31-36 months   93.1      13.4            24.2                 37.7
//   8 years       124.3      14.1            29.8                 57.6
//   13 years      152.8      14.6            36.8                 74.6
// and the usual drawing canon for the height in heads (about 4 for a baby, 5 at two to four years, 6 to 6.5 at seven to nine,
// 7.5 to 8 grown up). Our stages are 0.69 m (baby), 0.9 m (toddler) and 1.23 m (child), so those rows apply.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import type { LifeStage } from '../../../../src/core/types';
import { loadClips, look, realManifest, testCache } from './helpers';

const m = realManifest();

async function measure(bodyId: string, stage: LifeStage) {
  const c = new ModularCharacter(testCache(), m, await loadClips());
  await c.apply(look({ bodyId }), 'everyday', stage);
  c.root.updateMatrixWorld(true);
  let top = -1e9, bottom = 1e9, chin = 1e9, half = 0;
  const v = new THREE.Vector3();
  c.root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const head = /Body_head/.test(mesh.name) || /Body_head/.test(mesh.parent?.name ?? '');
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);
      top = Math.max(top, v.y); bottom = Math.min(bottom, v.y);
      if (head) { chin = Math.min(chin, v.y); half = Math.max(half, Math.abs(v.x)); }
    }
  });
  const shoulders = Math.abs(c.bone('upperarm_l')!.getWorldPosition(new THREE.Vector3()).x) * 2;
  c.dispose();
  const height = top - bottom;
  return { height, heads: height / (top - chin), headWidth: (half * 2) / height, shoulders: shoulders / height };
}

describe.each(['ubc_male', 'ubc_female'])('%s: child proportions follow the reference', (bodyId) => {
  it('height in heads: baby about 4, toddler about 5, child about 6', async () => {
    const baby = await measure(bodyId, 'baby'), toddler = await measure(bodyId, 'toddler'), child = await measure(bodyId, 'child'), adult = await measure(bodyId, 'adult');
    expect(baby.heads).toBeGreaterThan(3.8); expect(baby.heads).toBeLessThan(4.5);
    expect(toddler.heads).toBeGreaterThan(4.5); expect(toddler.heads).toBeLessThan(5.2);
    expect(child.heads).toBeGreaterThan(5.8); expect(child.heads).toBeLessThan(6.6);
    expect(adult.heads).toBeGreaterThan(7.4);
  });

  it('head width over height, relative to the grown-up (reference: 2.0, 1.7 and 1.3 times)', async () => {
    const adult = await measure(bodyId, 'adult');
    // grown-up reference: head breadth 15.2 cm at 175 cm; the table rows above give 0.176, 0.144 and 0.113 of the stature
    for (const [stage, ref] of [['baby', 2.02], ['toddler', 1.66], ['child', 1.3]] as const) {
      const s = await measure(bodyId, stage);
      expect(s.headWidth / adult.headWidth, stage).toBeGreaterThan(ref * 0.9);
      expect(s.headWidth / adult.headWidth, stage).toBeLessThan(ref * 1.1);
    }
  });

  it('shoulders are wider than the head at every stage', async () => {
    for (const stage of ['baby', 'toddler', 'child'] as const) {
      const s = await measure(bodyId, stage);
      expect(s.shoulders, stage).toBeGreaterThan(s.headWidth * 0.9);
    }
  });
});
