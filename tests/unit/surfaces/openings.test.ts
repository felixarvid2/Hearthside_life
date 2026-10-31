import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { OPENINGS } from '../../../src/content/surfaces';
import type { OpeningDef } from '../../../src/content/types';
import {
  OPENING_LEAF_NAME, WALL_THICKNESS, buildOpeningMesh, disposeOpeningMeshes, openingCutout, setDoorOpen,
} from '../../../src/render/openingMeshes';

const byId = (id: string) => OPENINGS.find((o) => o.id === id) as OpeningDef;

function meshes(g: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => { if (o instanceof THREE.Mesh) out.push(o); });
  return out;
}

afterAll(() => disposeOpeningMeshes());

describe('opening cutouts', () => {
  it('doors start at the floor, windows at the sill', () => {
    expect(openingCutout(byId('door-panel'))).toEqual({ bottom: 0, top: 2.1, halfWidth: 0.43 });
    const w = openingCutout(byId('window-sash'));
    expect(w.bottom).toBeCloseTo(0.9, 6);
    expect(w.top).toBeCloseTo(2.1, 6);
    expect(w.halfWidth).toBeCloseTo(0.39, 6);
  });
  it('stay inside the tile', () => {
    for (const o of OPENINGS) {
      const c = openingCutout(o);
      expect(c.halfWidth, o.id).toBeLessThan(o.width / 2);
      expect(c.top, o.id).toBeGreaterThan(c.bottom);
      expect(c.top, o.id).toBeLessThan(2.8);
    }
  });
});

describe('opening meshes', () => {
  it('build every opening inside its tile, few draw calls, sensible heights', () => {
    for (const o of OPENINGS) {
      const g = buildOpeningMesh(o);
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const c = openingCutout(o);
      expect(box.min.x, o.id).toBeGreaterThanOrEqual(-o.width / 2 - 1e-6);
      expect(box.max.x, o.id).toBeLessThanOrEqual(o.width / 2 + 1e-6);
      expect(box.min.y, o.id).toBeGreaterThanOrEqual(-1e-6 + (o.kind === 'door' ? 0 : c.bottom - 0.2));
      expect(box.max.y, o.id).toBeLessThanOrEqual(c.top + 0.1);
      expect(box.max.y, o.id).toBeGreaterThan(c.top);
      expect(Math.abs(box.min.z), o.id).toBeLessThan(0.15);
      expect(box.max.z, o.id).toBeGreaterThan(WALL_THICKNESS / 2);
      const ms = meshes(g);
      expect(ms.length, o.id).toBeGreaterThanOrEqual(2);
      expect(ms.length, o.id).toBeLessThanOrEqual(5);
      for (const m of ms) expect(m.geometry.getAttribute('position').count, `${o.id}/${m.name}`).toBeGreaterThan(0);
    }
  });

  it('windows have transparent glass; doors have a named, swinging leaf', () => {
    for (const o of OPENINGS) {
      const g = buildOpeningMesh(o);
      const leaf = g.getObjectByName(OPENING_LEAF_NAME);
      if (o.kind === 'window') {
        expect(leaf, o.id).toBeUndefined();
        const glass = g.getObjectByName('glass');
        expect(glass instanceof THREE.Mesh, o.id).toBe(true);
        expect(((glass as THREE.Mesh).material as THREE.Material).transparent, o.id).toBe(true);
      } else {
        expect(leaf, o.id).toBeDefined();
        expect(leaf?.parent, o.id).toBe(g);
        // hinge on the frame edge at -x
        expect(leaf?.position.x ?? 0, o.id).toBeLessThan(-0.3);
      }
    }
  });

  it('setDoorOpen swings the far edge of the leaf toward +z without entering the hinge jamb', () => {
    const g = buildOpeningMesh(byId('door-panel'));
    const leaf = g.getObjectByName(OPENING_LEAF_NAME) as THREE.Object3D;
    const width = leaf.userData.width as number;
    const edge = () => {
      g.updateMatrixWorld(true);
      return leaf.localToWorld(new THREE.Vector3(width, 1, -0.04));
    };
    const closed = edge();
    setDoorOpen(g, 1);
    const open = edge();
    expect(open.z).toBeGreaterThan(closed.z + width * 0.9);
    const back = (() => { g.updateMatrixWorld(true); return leaf.localToWorld(new THREE.Vector3(0, 1, -0.04)); })();
    expect(back.x).toBeGreaterThanOrEqual(leaf.position.x - 1e-6);
    setDoorOpen(g, 0);
    expect(leaf.rotation.y).toBe(-0);
  });

  it('instances share geometry but swing independently; flip turns the opening around', () => {
    const a = buildOpeningMesh(byId('door-glazed'));
    const b = buildOpeningMesh(byId('door-glazed'), { flip: true });
    expect(meshes(a)[0]?.geometry).toBe(meshes(b)[0]?.geometry);
    setDoorOpen(a, 1);
    expect(b.getObjectByName(OPENING_LEAF_NAME)?.rotation.y).toBe(0);
    expect(b.rotation.y).toBeCloseTo(Math.PI, 6);
    expect(a.userData.openingId).toBe('door-glazed');
  });
});
