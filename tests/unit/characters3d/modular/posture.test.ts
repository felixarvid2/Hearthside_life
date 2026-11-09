import { describe, expect, it } from 'vitest';
import { MODULAR_STAGE_LYING, MODULAR_STAGE_SEATED, POSTURE_ANCHORS, lyingPlacement, seatedPlacement } from '../../../../src/characters/posture';

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
  it('seats and lays children with the stage anchors of the modular figures', () => {
    for (const stage of ['baby', 'toddler', 'child', 'teen', 'elder'] as const) {
      const s = seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'b', 'mpfb', { modular: true, stage });
      expect(s.y).toBeCloseTo(0.45 - MODULAR_STAGE_SEATED[stage]!.b.seatHeight, 6);
      const l = lyingPlacement({ x: 0, y: 0.5, z: 0 }, 0, { modular: true, stage, frame: 'a' });
      expect(l.y).toBeCloseTo(0.5 - MODULAR_STAGE_LYING[stage]!.a.backY, 6);
    }
    const heights = (['baby', 'toddler', 'child', 'teen', 'adult'] as const).map((stage) => 0.45 - seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'a', 'mpfb', { modular: true, stage }).y);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });
  it('keeps the classic anchors for other people and for children', () => {
    const c = seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'a', 'mpfb', {});
    expect(c.y).toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.mpfb.a.seatHeight, 6);
    const kid = seatedPlacement({ x: 0, y: 0.45, z: 0 }, 0, 'a', 'mpfb', { stage: 'child', own: true });
    expect(kid.y).not.toBeCloseTo(0.45 - POSTURE_ANCHORS.seated.modular.a.seatHeight, 3);
  });
});
