// A child's own movement on the shared clips (stagePose.applyChildMotion), and the fit that keeps a child out of its chair:
// the stage fit is measured on the bind pose whatever the figure is doing.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import { stageLook } from '../../../../src/characters/stagePose';
import { loadClips, look, parseGlb, realManifest, repo, testCache } from './helpers';

const m = realManifest();
const clips = async () => [...(await loadClips()), ...(await parseGlb(repo('public/assets/characters/anims_2.glb'))).animations];
const world = (c: ModularCharacter, bone: string) => { c.root.updateMatrixWorld(true); return c.bone(bone)!.getWorldPosition(new THREE.Vector3()); };

describe('stage fit while posed', () => {
  it.each([['ubc_male', 'child'], ['ubc_female', 'child'], ['ubc_male', 'toddler'], ['ubc_male', 'teen']] as const)('%s %s: a look change while sitting or lying keeps the figure its size', async (bodyId, stage) => {
    const c = new ModularCharacter(testCache(), m, await clips());
    c.childMotion = false;
    await c.apply(look({ bodyId }), 'everyday', stage);
    const standing = c.root.scale.x;
    for (const anim of ['sitIdle', 'sleep'] as const) {
      c.play(anim, { fade: 0 });
      for (let i = 0; i < 20; i++) c.update(0.05);
      const low = () => { let y = 1e9; const v = new THREE.Vector3(); c.root.updateMatrixWorld(true); c.root.traverse((o) => { const s = o as THREE.SkinnedMesh; if (!s.isSkinnedMesh) return; const p = s.geometry.getAttribute('position'); for (let i = 0; i < p.count; i += 7) { s.getVertexPosition(i, v); v.applyMatrix4(s.matrixWorld); y = Math.min(y, v.y); } }); return y; };
      const before = low();
      // pyjamas at bedtime, a part that finishes loading: the look is applied again in this pose
      await c.apply(look({ bodyId, outfits: { everyday: { top: 'tshirt_crew' } } }), 'everyday', stage);
      for (let i = 0; i < 4; i++) c.update(0.05);
      expect(c.root.scale.x, `${anim} scale`).toBeCloseTo(standing, 4);
      expect(low(), `${anim} lowest point`).toBeCloseTo(before, 2);
      await c.apply(look({ bodyId }), 'everyday', stage);
    }
    c.dispose();
  });
});

describe('facing', () => {
  it.each([0.4, 2.5, Math.PI, 4.2])('a body built while its person faces %f keeps turning by rotation.y alone', async (yaw) => {
    const c = new ModularCharacter(testCache(), m, await clips());
    c.root.rotation.y = yaw;                                   // the people view has placed the figure before its body arrives
    await c.apply(look({}), 'everyday', 'adult');
    expect(c.root.rotation.x).toBe(0);
    expect(c.root.rotation.z).toBe(0);
    expect(c.root.rotation.y).toBe(yaw);
    // and it faces where the view says: the toes are ahead of the heel along (sin, cos) of the yaw
    c.play('idle', { fade: 0 }); c.update(0.05);
    const toe = world(c, 'ball_l'), heel = world(c, 'foot_l');
    const ahead = (toe.x - heel.x) * Math.sin(yaw) + (toe.z - heel.z) * Math.cos(yaw);
    expect(ahead).toBeGreaterThan(0.03);
    await c.apply(look({}), 'everyday', 'child');             // a new stage rebuilds nothing it should not
    expect(c.root.rotation.x).toBe(0);
    c.dispose();
  });
});

describe('child motion', () => {
  it('is set for toddlers, children and teens, not for grown-ups', () => {
    expect(stageLook('toddler').motion!.armsOut).toBeGreaterThan(0);
    expect(stageLook('child').motion!.legSwing).toBeGreaterThan(0);
    expect(stageLook('teen').motion).toBeDefined();
    for (const s of ['youngAdult', 'adult', 'elder'] as const) expect(stageLook(s).motion).toBeUndefined();
  });

  it('a standing child shifts its weight and looks about, feet staying put; a grown-up plays the clip as it is', async () => {
    const run = async (stage: 'child' | 'adult', motion: boolean) => {
      const c = new ModularCharacter(testCache(), m, await clips());
      c.childMotion = motion; c.motionSeed = 0.25;
      await c.apply(look({}), 'everyday', stage);
      c.play('idle', { fade: 0 });
      const head: number[] = [], foot: number[] = [];
      for (let i = 0; i < 240; i++) { c.update(0.05); head.push(world(c, 'Head').x); foot.push(world(c, 'foot_l').x); }
      c.dispose();
      const span = (a: number[]) => Math.max(...a) - Math.min(...a);
      return { head: span(head), foot: span(foot) };
    };
    const child = await run('child', true), still = await run('child', false);
    expect(child.head).toBeGreaterThan(still.head + 0.01);          // the head moves at least a centimetre more
    expect(child.foot).toBeLessThan(still.foot + 0.012);            // the feet do not slide with it
    const adultOn = await run('adult', true), adultOff = await run('adult', false);
    expect(adultOn.head).toBeCloseTo(adultOff.head, 5);
  });

  it('a toddler walks with the arms out for balance and rocks over the standing foot', async () => {
    const run = async (motion: boolean) => {
      const c = new ModularCharacter(testCache(), m, await clips());
      c.childMotion = motion; c.motionSeed = 0.25;
      await c.apply(look({}), 'everyday', 'toddler');
      c.play('walk', { fade: 0 });
      let hands = 0, n = 0; const headX: number[] = [];
      for (let i = 0; i < 120; i++) { c.update(1 / 30); if (i > 30) { hands += Math.abs(world(c, 'hand_l').x - world(c, 'hand_r').x); n++; headX.push(world(c, 'Head').x); } }
      c.dispose();
      return { hands: hands / n, rock: Math.max(...headX) - Math.min(...headX) };
    };
    const on = await run(true), off = await run(false);
    expect(on.hands).toBeGreaterThan(off.hands * 1.1);
    expect(on.rock).toBeGreaterThan(off.rock);
  });

  it('seated: a toddler\'s legs lie out on the seat, a child\'s shins hang and swing over the edge', async () => {
    const seated = async (stage: 'toddler' | 'child', edge: number | null, motion = true) => {
      const c = new ModularCharacter(testCache(), m, await clips());
      c.childMotion = motion; c.motionSeed = 0.25;
      await c.apply(look({}), 'everyday', stage);
      c.setSeatEdge(edge);
      c.play('sitIdle', { fade: 0 });
      const footY: number[] = [];
      for (let i = 0; i < 1200; i++) { c.update(0.05); if (i > 60) footY.push(world(c, 'foot_l').y - world(c, 'calf_l').y); }
      c.dispose();
      return { mean: footY.reduce((a, b) => a + b, 0) / footY.length, span: Math.max(...footY) - Math.min(...footY) };
    };
    // foot height relative to the knee: about level when the legs lie out, well below when they hang
    const toddler = await seated('toddler', 0.3), child = await seated('child', -0.15), childDeep = await seated('child', 0.6);    // the edge is measured from the root, which a sitter's knees are only a little ahead of
    expect(toddler.mean).toBeGreaterThan(-0.06);
    expect(child.mean).toBeLessThan(-0.15);
    expect(child.span).toBeGreaterThan(0.02);                      // the legs swing
    expect(childDeep.mean).toBeGreaterThan(-0.08);                 // a deep sofa: legs out
    const plain = await seated('child', -0.15, false);
    expect(plain.span).toBeLessThan(0.005);                        // the clip itself is a still pose
  });
});
