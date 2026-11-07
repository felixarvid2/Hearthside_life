import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { frameCamera, frameShot, shotPoints, SHOTS } from '../../../../src/characters/modular/creator/framing';
import type { Shot } from '../../../../src/characters/modular/creator/framing';

/** A bone hierarchy with our joint names, standing 1.75 m tall, arms hanging at the sides. */
function rig(): THREE.Group {
  const root = new THREE.Group();
  const add = (parent: THREE.Object3D, name: string, x: number, y: number, z = 0) => {
    const o = new THREE.Bone(); o.name = name; o.position.set(x, y, z); parent.add(o); return o;
  };
  const pelvis = add(root, 'pelvis', 0, 0.95);
  const s1 = add(pelvis, 'spine_01', 0, 0.1), s2 = add(s1, 'spine_02', 0, 0.12), s3 = add(s2, 'spine_03', 0, 0.12);
  const neck = add(s3, 'neck_01', 0, 0.15), head = add(neck, 'Head', 0, 0.08);
  void head;
  for (const [side, sx] of [['l', 1], ['r', -1]] as const) {
    const cl = add(s3, `clavicle_${side}`, sx * 0.05, 0.1);
    const ua = add(cl, `upperarm_${side}`, sx * 0.15, 0);
    const la = add(ua, `lowerarm_${side}`, sx * 0.01, -0.3);
    add(la, `hand_${side}`, sx * 0.01, -0.28);
    const th = add(pelvis, `thigh_${side}`, sx * 0.09, 0);
    const ca = add(th, `calf_${side}`, 0, -0.45);
    const ft = add(ca, `foot_${side}`, 0, -0.4);
    add(ft, `ball_${side}`, 0, -0.03, 0.12);
  }
  root.updateMatrixWorld(true);
  return root;
}

const inside = (cam: THREE.PerspectiveCamera, p: THREE.Vector3) => {
  const n = p.clone().project(cam);
  return Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1 && n.z > -1 && n.z < 1;
};

describe('framing', () => {
  const shots: Shot[] = ['face', 'upper', 'full'];
  for (const aspect of [0.5, 1, 2]) {
    it(`fits every shot's bones in the viewport at aspect ${aspect}`, () => {
      const root = rig();
      for (const shot of shots) {
        const cam = new THREE.PerspectiveCamera(30, aspect);
        expect(frameCamera(cam, root, shot)).not.toBeNull();
        const pts = shotPoints(root, shot);
        expect(pts.length).toBeGreaterThan(1);
        for (const p of pts) expect(inside(cam, p), `${shot} @${aspect}`).toBe(true);
      }
    });
  }

  it("'face' is closer than 'upper' and 'full'", () => {
    const root = rig();
    const cam = new THREE.PerspectiveCamera(30, 1);
    const d = (s: Shot) => frameShot(cam, root, s)!.distance;
    expect(d('face')).toBeLessThan(d('upper'));
    expect(d('upper')).toBeLessThan(d('full'));
  });

  it('looks from +Z by default, from the given direction otherwise, and centres the shot', () => {
    const root = rig();
    const cam = new THREE.PerspectiveCamera(30, 1);
    const f = frameShot(cam, root, 'full')!;
    expect(f.position.z).toBeGreaterThan(f.target.z);
    expect(Math.abs(f.position.x - f.target.x)).toBeLessThan(1e-6);
    expect(f.target.y).toBeGreaterThan(0.7);
    expect(f.target.y).toBeLessThan(1.1);
    const side = frameShot(cam, root, 'full', { direction: new THREE.Vector3(1, 0, 0) })!;
    expect(side.position.x).toBeGreaterThan(side.target.x);
    const cam2 = new THREE.PerspectiveCamera(30, 1);
    frameCamera(cam2, root, 'full', { direction: new THREE.Vector3(1, 0.2, 1) });
    for (const p of shotPoints(root, 'full')) expect(inside(cam2, p)).toBe(true);
  });

  it('a narrower view needs a larger distance (limiting axis)', () => {
    const root = rig();
    const wide = frameShot(new THREE.PerspectiveCamera(30, 2), root, 'upper')!.distance;
    const tall = frameShot(new THREE.PerspectiveCamera(30, 0.5), root, 'upper')!.distance;
    expect(tall).toBeGreaterThan(wide);
  });

  it('returns null without bones and ignores missing ones', () => {
    const cam = new THREE.PerspectiveCamera(30, 1);
    expect(frameShot(cam, new THREE.Group(), 'face')).toBeNull();
    const r = rig(); r.getObjectByName('hand_l')!.removeFromParent();
    expect(frameShot(cam, r, 'upper')).not.toBeNull();
    expect(Object.keys(SHOTS)).toEqual(['face', 'upper', 'full']);
  });
});
