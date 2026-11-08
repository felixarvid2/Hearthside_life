import { describe, expect, it } from 'vitest';
import { POSTURE_ANCHORS, lyingPlacement, seatedPlacement } from '../../../../src/characters/posture';

describe('modular posture anchors', () => {
  it('seats and lays a modular adult with its own measurements', () => {
    const a = seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'a', 'mpfb', { modular: true });
    expect(a.y).toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.modular.a.seatHeight, 6);
    expect(a.z).toBeCloseTo(-POSTURE_ANCHORS.seated.modular.a.seatZ, 6);
    const b = seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'b', 'mpfb', { modular: true });
    expect(b.y).toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.modular.b.seatHeight, 6);
    const l = lyingPlacement({ x: 0, y: 0.5, z: 0 }, 0, { modular: true, frame: 'b' });
    expect(l.y).toBeCloseTo(0.5 - POSTURE_ANCHORS.lying.modular.b.backY, 6);
    expect(l.z).toBeCloseTo(-POSTURE_ANCHORS.lying.modular.b.centerZ, 6);
  });
  it('keeps the classic anchors for other people and for children', () => {
    const c = seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'a', 'mpfb', {});
    expect(c.y).toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.mpfb.a.seatHeight, 6);
    const kid = seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'a', 'mpfb', { modular: true, stage: 'child', own: true });
    expect(kid.y).not.toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.modular.a.seatHeight, 3);
  });
});
