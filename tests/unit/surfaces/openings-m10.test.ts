import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { OPENINGS } from '../../../src/content/surfaces';
import { buildOpeningMesh, disposeOpeningMeshes, openingCutout, setDoorOpen } from '../../../src/render/openingMeshes';

const doors = OPENINGS.filter((o) => o.kind === 'door');
const windows = OPENINGS.filter((o) => o.kind === 'window');
afterAll(() => disposeOpeningMeshes());

describe('Milestone 10 doors and windows', () => {
  it('reach the catalogue targets', () => {
    expect(doors.length).toBe(48);
    expect(windows.length).toBe(64);
  });
  it('keep the original ids', () => {
    for (const id of ['door-panel', 'door-glazed', 'door-plank', 'door-flush', 'door-closet', 'door-french', 'door-dutch', 'door-louvre', 'door-modern-glass',
      'window-sash', 'window-wide', 'window-high', 'window-picture', 'window-tall', 'window-cottage', 'window-slider', 'window-clerestory', 'window-georgian', 'window-steel-grid', 'window-awning']) {
      expect(OPENINGS.some((o) => o.id === id), id).toBe(true);
    }
  });
  it('have unique ids, names and models', () => {
    expect(new Set(OPENINGS.map((o) => o.id)).size).toBe(OPENINGS.length);
    expect(new Set(OPENINGS.map((o) => o.name)).size).toBe(OPENINGS.length);
    const sig = OPENINGS.map((o) => JSON.stringify([o.kind, o.width, o.height, o.sill, o.style]));
    expect(new Set(sig).size).toBe(OPENINGS.length);
  });
  it('have text, tags, packs and a price', () => {
    for (const o of OPENINGS) {
      expect(o.name.length, o.id).toBeGreaterThan(2);
      expect(o.description.length, o.id).toBeGreaterThan(20);
      expect(o.tags.length, o.id).toBeGreaterThanOrEqual(2);
      expect(o.packs.length, o.id).toBeGreaterThan(0);
      expect(Number.isInteger(o.price) && o.price > 0, o.id).toBe(true);
    }
  });
  it('fit the wall height and their tiles', () => {
    for (const o of OPENINGS) {
      expect(o.sill + o.height, o.id).toBeLessThanOrEqual(2.8);
      const c = openingCutout(o);
      expect(c.halfWidth * 2, o.id).toBeLessThanOrEqual(o.width - 0.04 + 1e-9);
      if (o.kind === 'door') { expect(o.sill, o.id).toBe(0); expect(c.halfWidth * 2, o.id).toBeGreaterThanOrEqual(0.6); }
    }
  });
  it('doors are walkable: the hole is at least 0.8 m wide, except closets, and 2 m high', () => {
    for (const o of doors) {
      if (o.id !== 'door-closet') expect(openingCutout(o).halfWidth * 2, o.id).toBeGreaterThanOrEqual(0.8);
      expect(o.height, o.id).toBeGreaterThanOrEqual(2.0);
    }
  });
  it('doors have a moving leaf that changes with the open amount', () => {
    for (const o of doors) {
      const g = buildOpeningMesh(o);
      const leaf = g.getObjectByName('leaf');
      expect(leaf, o.id).toBeDefined();
      const snap = () => JSON.stringify([g.children.filter((c) => /^leaf\d*$/.test(c.name)).map((c) => [c.position.toArray(), c.rotation.toArray(), c.scale.toArray(), c.children.map((k) => k.rotation.y)])]);
      const closed = snap();
      setDoorOpen(g, 1);
      expect(snap(), o.id).not.toBe(closed);
      setDoorOpen(g, 0);
      expect(JSON.parse(snap()), o.id).toEqual(JSON.parse(closed));
    }
  });
  it('windows keep a glass mesh and stay inside the wall hole width plus casing', () => {
    for (const o of windows) {
      const g = buildOpeningMesh(o);
      expect(g.getObjectByName('glass'), o.id).toBeDefined();
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.max.x - box.min.x, o.id).toBeLessThanOrEqual(o.width + 1e-6);
    }
  });
  it('cover the requested variety', () => {
    const has = (pred: (o: (typeof OPENINGS)[number]) => boolean) => OPENINGS.some(pred);
    for (const m of ['cafe', 'bifold', 'slide', 'pocket', 'barn', 'rollup']) expect(has((o) => o.style.motion === m), m).toBe(true);
    expect(has((o) => o.kind === 'door' && o.width === 3)).toBe(true);
    for (const sh of ['arch', 'round', 'oval', 'lunette', 'octagon', 'gothic', 'gable']) expect(has((o) => o.style.shape === sh), sh).toBe(true);
    for (const w of ['sash', 'casement', 'slider', 'jalousie', 'ribbon', 'bay']) expect(has((o) => o.style.window === w), w).toBe(true);
    expect(has((o) => o.style.glass === 'frosted')).toBe(true);
    expect(has((o) => !!o.style.shutters)).toBe(true);
  });
});
