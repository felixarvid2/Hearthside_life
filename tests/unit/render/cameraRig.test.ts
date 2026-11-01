import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, REVEAL_PPM } from '../../../src/render/cameraRig';

function rig(ppm: number, size = { w: 390, h: 844 }): CameraRig {
  const r = new CameraRig();
  r.reducedMotion = true; // glides finish at once
  r.setBounds(-2, -2, 26, 26);
  r.setSize(size.w, size.h);
  r.setZoom(ppm);
  r.target.set(12, 0, 12);
  r.update(0);
  return r;
}
const box = (x: number, z: number, w = 1, d = 1, h = 1) => ({ min: new THREE.Vector3(x, 0, z), max: new THREE.Vector3(x + w, h, z + d) });

describe('CameraRig.reveal', () => {
  it('leaves a visible, big enough target alone', () => {
    const r = rig(66);
    const b = box(11.5, 11.5, 2, 1);
    expect(r.reveal(b.min, b.max)).toBe(false);
    expect(r.ppm).toBe(66);
    expect(r.target.x).toBe(12);
  });

  it('zooms in on a small target (zoomed far out) and centres it', () => {
    const r = rig(20);
    const b = box(14, 9, 2, 1);
    expect(r.reveal(b.min, b.max)).toBe(true);
    r.update(0);
    expect(r.ppm).toBeGreaterThanOrEqual(REVEAL_PPM);
    expect(r.target.x).toBeCloseTo(15, 5);
    expect(r.target.z).toBeCloseTo(9.5, 5);
  });

  it('without zoomIn a small but visible target stays put, an off-screen one only pans', () => {
    const r = rig(20, { w: 200, h: 200 });
    const near = box(11.5, 11.5, 1, 1);
    expect(r.reveal(near.min, near.max, 0.5, false)).toBe(false);
    const far = box(20, 20, 2, 2);
    expect(r.reveal(far.min, far.max, 0.5, false)).toBe(true);
    r.update(0);
    expect(r.ppm).toBe(20);
  });

  it('pans to a target outside the visible area without zooming when already close', () => {
    const r = rig(66);
    const b = box(20, 20, 2, 2);
    expect(r.reveal(b.min, b.max)).toBe(true);
    r.update(0);
    expect(r.ppm).toBe(66);
    expect(r.target.x).toBeCloseTo(21, 5);
    expect(r.target.z).toBeCloseTo(21, 5);
  });

  it('treats the area covered by panels as off-screen', () => {
    const r = rig(66);
    r.setInsets({ left: 0, right: 0, top: 0, bottom: 600 }); // a tall sheet: only the top 244 px stay free
    r.update(0);
    const hidden = box(16, 16, 1, 1); // projects ~220 px below the focus, under the sheet
    expect(r.reveal(hidden.min, hidden.max)).toBe(true);
    const free = box(11.5, 11.5, 1, 1);
    r.target.set(12, 0, 12);
    r.update(0);
    expect(r.reveal(free.min, free.max)).toBe(false);
  });

  it('never zooms in past the point where the target fits', () => {
    const r = rig(20, { w: 390, h: 300 });
    const b = box(8, 8, 7, 3.5); // a long sofa
    r.reveal(b.min, b.max);
    r.update(0);
    expect(r.ppm).toBeLessThan(REVEAL_PPM);
    expect(r.ppm).toBeGreaterThanOrEqual(20);
  });

  it('keeps the target inside the lot bounds', () => {
    const r = rig(20);
    const b = box(40, 40);
    r.reveal(b.min, b.max);
    r.update(0);
    expect(r.target.x).toBeLessThanOrEqual(26);
    expect(r.target.z).toBeLessThanOrEqual(26);
  });
});
