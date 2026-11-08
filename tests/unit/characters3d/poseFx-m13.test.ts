// Milestone 13: the baby's curled pose and the recliner's lean as bone maths on a small skeleton, and the walk-cycle speed
// factor of the Animator (feet should not skate when the game runs faster than normal).

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Animator } from '../../../src/characters/animation';
import { CURL_BONES, RECLINE_LEAN, applyCurl, applyStoop } from '../../../src/characters/stagePose';

function skeleton() {
  const bones = new Map<string, THREE.Bone>();
  const add = (name: string, parent: THREE.Object3D | null, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent?.add(b);
    bones.set(name, b);
    return b;
  };
  const root = add('root', null, 0, 0, 0);
  const pelvis = add('pelvis', root, 0, 1, 0);
  const s1 = add('spine_01', pelvis, 0, 0.1, 0), s2 = add('spine_02', s1, 0, 0.15, 0), s3 = add('spine_03', s2, 0, 0.15, 0);
  const neck = add('neck_01', s3, 0, 0.2, 0);
  add('Head', neck, 0, 0.1, 0);
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 0.1 : -0.1;
    const thigh = add(`thigh_${side}`, pelvis, sx, -0.05, 0), calf = add(`calf_${side}`, thigh, 0, -0.45, 0);
    add(`foot_${side}`, calf, 0, -0.45, 0);
    const up = add(`upperarm_${side}`, s3, side === 'l' ? 0.2 : -0.2, 0.1, 0), low = add(`lowerarm_${side}`, up, 0, -0.28, 0);
    add(`hand_${side}`, low, 0, -0.25, 0);
  }
  root.updateMatrixWorld(true);
  const at = (n: string) => { root.updateMatrixWorld(true); return bones.get(n)!.getWorldPosition(new THREE.Vector3()); };
  return { bones, at, root };
}

describe('curled baby', () => {
  it('draws the feet and hands in, symmetrically, and does nothing at zero', () => {
    const { bones, at } = skeleton();
    const rest = { foot: at('foot_l').clone(), hand: at('hand_l').clone() };
    applyCurl(bones, 0);
    expect(at('foot_l').distanceTo(rest.foot)).toBeLessThan(1e-9);
    applyCurl(bones, 1);
    expect(at('foot_l').distanceTo(rest.foot)).toBeGreaterThan(0.2);
    expect(at('hand_l').distanceTo(rest.hand)).toBeGreaterThan(0.1);
    // mirrored: both sides end at the same height and depth
    expect(at('foot_l').y).toBeCloseTo(at('foot_r').y, 6);
    expect(at('foot_l').z).toBeCloseTo(at('foot_r').z, 6);
    // the pelvis stays put
    expect(at('pelvis').y).toBeCloseTo(1, 9);
  });

  it('only turns the listed bones, and blends in proportion to the amount', () => {
    const { bones, at } = skeleton();
    const names = new Set(CURL_BONES.map(([n]) => n));
    applyCurl(bones, 0.5);
    for (const [n, b] of bones) if (!names.has(n)) expect(b.quaternion.angleTo(new THREE.Quaternion()), n).toBeLessThan(1e-9);
    const half = at('foot_l').clone();
    const { bones: b2, at: at2 } = skeleton();
    applyCurl(b2, 1);
    expect(at2('foot_l').distanceTo(half)).toBeGreaterThan(0.01); // the full curl goes further than half
  });
});

describe('recliner lean', () => {
  it('a negative stoop leans the head back, and a larger lean goes further', () => {
    const a = skeleton(), b = skeleton();
    const head0 = a.at('Head').clone();
    applyStoop(a.bones, -RECLINE_LEAN);
    applyStoop(b.bones, -RECLINE_LEAN / 2);
    expect(a.at('Head').z).toBeLessThan(head0.z - 0.05); // back (the character faces +z)
    expect(a.at('Head').z).toBeLessThan(b.at('Head').z);
    expect(a.at('pelvis').y).toBeCloseTo(1, 9);
  });
});

describe('walk rate', () => {
  function animatorWith(cadence = 1) {
    const root = new THREE.Group();
    const clip = new THREE.AnimationClip('Walk_Loop', 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);
    const idle = new THREE.AnimationClip('Idle_Loop', 1, [new THREE.NumberKeyframeTrack('.position[y]', [0, 1], [0, 0.1])]);
    const a = new Animator(root, new Map([['Walk_Loop', clip], ['Idle_Loop', idle]]), cadence);
    return { a, root };
  }
  it('speeds the playing walk clip up and slows it down to match the ground speed', () => {
    const { a, root } = animatorWith();
    a.play('walk', { fade: 0 });
    a.update(0.5);
    const normal = root.position.x;
    expect(normal).toBeCloseTo(0.5, 1);
    a.setWalkRate(2);
    a.update(0.1); // 0.1 s at double speed advances the clip by 0.2
    expect(root.position.x - normal).toBeCloseTo(0.2, 1);
    a.setWalkRate(0.5);
    const before = root.position.x;
    a.update(0.2);
    expect(root.position.x - before).toBeCloseTo(0.1, 1);
  });

  it('is clamped, applies to clips started later, and leaves idle alone', () => {
    const { a, root } = animatorWith(1.5);
    a.setWalkRate(100);
    a.play('walk', { fade: 0 });
    a.update(0.1);
    expect(root.position.x).toBeCloseTo(0.1 * 1.5 * 4, 1); // cadence x the 4x cap
    a.play('idle', { fade: 0 });
    a.update(0.5);
    expect(root.position.y).toBeCloseTo(0.05, 2); // idle is not a locomotion clip: plain speed
  });
});
