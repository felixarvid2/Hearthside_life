// The PersonView hooks of the modular view for the life stages: a baby that lies curled or sits up, the carrier's cradle arms,
// the elder's stoop, a stage change on a living person, and the factory.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Appearance, LifeStage } from '../../../../src/core/types';
import { ModularCharacterView } from '../../../../src/characters/modular/ModularCharacterView';
import { wantsModular } from '../../../../src/characters/personView';
import type { CharacterAssets } from '../../../../src/characters/assets';
import { loadClips, parseGlb, realManifest, testCache } from './helpers';

const manifest = realManifest();
const app = { frame: 'a', skin: '#c68642', hair: { color: '#442211' }, face: { eyeColor: '#336699' } } as unknown as Appearance;
let clipsP: Promise<THREE.AnimationClip[]> | null = null;
const clips = () => (clipsP ??= Promise.all([loadClips(), parseGlb('public/assets/characters/anims_2.glb').then((g) => g.animations)]).then((x) => x.flat()));

async function view(stage: LifeStage): Promise<ModularCharacterView> {
  const v = new ModularCharacterView({ manifest, cache: testCache() }, await clips(), app, {} as never, stage);
  while (v.busy) await new Promise((r) => setTimeout(r, 5));
  return v;
}
const run = (v: ModularCharacterView, seconds: number) => { for (let t = 0; t < seconds; t += 0.05) v.update(0.05); };
const angle = (v: ModularCharacterView, bone: string) => { const q = v.bone(bone)!.quaternion; return 2 * Math.acos(Math.min(1, Math.abs(q.w))); };

describe('modular view for every life stage', () => {
  it('is used for every stage while the quaternius style is on', () => {
    const on = { modular: {} } as unknown as CharacterAssets, off = { modular: null } as unknown as CharacterAssets;
    for (const s of ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'] as const) {
      expect(wantsModular(on, s)).toBe(true);
      expect(wantsModular(off, s)).toBe(false);
    }
  });

  it('draws the stage at its own size and follows a stage change', async () => {
    const v = await view('adult');
    expect(v.root.scale.x).toBe(1);
    expect(v.hasOwnBody).toBe(true);
    const adultTop = v.headTop(new THREE.Vector3()).y;
    v.setAppearance(app, 'child');
    while (v.busy) await new Promise((r) => setTimeout(r, 5));
    expect(v.lifeStage).toBe('child');
    expect(v.root.scale.x).toBeLessThan(1);
    expect(v.pelvisRatio).toBeLessThan(1);
    v.root.updateMatrixWorld(true);
    const childTop = v.headTop(new THREE.Vector3()).y;
    expect(childTop / adultTop).toBeGreaterThan(0.6);
    expect(childTop / adultTop).toBeLessThan(0.78);
    v.setAppearance(app, 'adult');
    while (v.busy) await new Promise((r) => setTimeout(r, 5));
    expect(v.root.scale.x).toBe(1);
    v.dispose();
  });

  it('keeps a baby lying (curled) until it is set upright, and lowers an upright one onto the floor', async () => {
    const v = await view('baby');
    v.play('idle', { fade: 0, posture: 'standing' });
    run(v, 1);
    expect(v.posture).toBe('lying');
    expect(v.floorDrop).toBe(0);
    const curled = angle(v, 'calf_l');
    expect(curled).toBeGreaterThan(1.2); // the knees are drawn up
    v.setBabyUpright(true);
    run(v, 0.5);
    expect(v.posture).toBe('seated');
    expect(v.floorDrop).toBeGreaterThan(0.05);
    v.dispose();
  });

  it('cradles a baby in the carrier\'s arms and lets go again', async () => {
    const v = await view('adult');
    v.play('idle', { fade: 0 });
    run(v, 0.5);
    const free = v.bone('lowerarm_l')!.quaternion.clone();
    v.setCarrying(true);
    run(v, 1.5);
    expect(v.carrying).toBe(true);
    expect(v.bone('lowerarm_l')!.quaternion.angleTo(free)).toBeGreaterThan(0.5);
    const p = v.cradlePoint(new THREE.Vector3());
    expect(p.y).toBeGreaterThan(0.8);
    v.setCarrying(false);
    run(v, 2);
    expect(v.bone('lowerarm_l')!.quaternion.angleTo(free)).toBeLessThan(0.2);
    v.dispose();
  });

  it('stoops an elder and leans a recliner back', async () => {
    const adult = await view('adult'), elder = await view('elder');
    for (const v of [adult, elder]) { v.play('idle', { fade: 0 }); run(v, 1.5); }
    const lean = (v: ModularCharacterView) => v.bone('spine_02')!.quaternion.angleTo(new THREE.Quaternion());
    expect(Math.abs(lean(elder) - lean(adult))).toBeGreaterThan(0.01);
    const seat = await view('adult');
    seat.play('sitIdle', { fade: 0, posture: 'seated' });
    run(seat, 1);
    const before = seat.bone('spine_01')!.quaternion.clone();
    seat.setRecline(true);
    run(seat, 2.5);
    expect(seat.bone('spine_01')!.quaternion.angleTo(before)).toBeGreaterThan(0.05);
    for (const v of [adult, elder, seat]) v.dispose();
  });
});
