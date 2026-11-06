// The real authored assets (OpenSew-2 T-shirt, GBH Tool short hair, cover mask) on the stand-in body: they pass the
// rig check, the mask matches the body export, and two people wearing them stay independent.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import type { CoverMaskFile } from '../../../../src/characters/modular/types';
import { BODY, loadClips, look, realManifest, testCache } from './helpers';

const repo = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const mask = (p: string) => JSON.parse(readFileSync(repo(`public/assets/characters/modular/${p}`), 'utf8')) as CoverMaskFile;

function hiddenCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const a = (o as THREE.Mesh).geometry?.getAttribute?.('aHidden');
    if (a) for (let i = 0; i < a.count; i++) n += a.getX(i) > 0.5 ? 1 : 0;
  });
  return n;
}

describe('authored assets on the stand-in body', () => {
  const m = realManifest();
  const tee = m.garments.find((g) => g.id === 'tshirt_crew')!;
  const maskPath = tee.covers![BODY]!;

  it('equip the real T-shirt and hair without rig or mask issues, hiding only covered skin', async () => {
    const cache = testCache({ [maskPath]: mask(maskPath) });
    const clips = await loadClips();
    const c = new ModularCharacter(cache, m, clips);
    await c.apply(look({ hairId: 'short_crop', outfits: { everyday: { top: 'tshirt_crew' } } }));
    expect(c.issues).toEqual([]);
    expect(c.equipped()).toEqual({ bodyId: BODY, hairId: 'short_crop', garments: { top: 'tshirt_crew' } });
    const covered = Object.values(mask(maskPath).meshes).length;
    expect(covered).toBeGreaterThan(0);
    const hidden = hiddenCount(c.root);
    expect(hidden).toBeGreaterThan(300);
    // Unequip restores every vertex.
    await c.apply(look({ hairId: 'short_crop' }));
    expect(hiddenCount(c.root)).toBe(0);
    c.dispose();
  });

  it('two people: own colors, own mixers, shared geometry', async () => {
    const cache = testCache({ [maskPath]: mask(maskPath) });
    const clips = await loadClips();
    const a = new ModularCharacter(cache, m, clips);
    const b = new ModularCharacter(cache, m, clips);
    const outfit = { everyday: { top: 'tshirt_crew' } };
    await a.apply(look({ hairId: 'short_crop', outfits: outfit, colors: { skin: '#8d5524', eyes: '#333333', hair: '#111111', garments: { tshirt_crew: { main: '#c94f4f' } } } }));
    await b.apply(look({ hairId: 'short_crop', outfits: outfit, colors: { skin: '#f1c27d', eyes: '#333333', hair: '#e0c070', garments: { tshirt_crew: { main: '#3f6fa8' } } } }));
    const colorOf = (c: ModularCharacter, name: string) => {
      let hex = '';
      c.root.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm && !Array.isArray(mm) && mm.name === name && !hex) hex = `#${mm.color.getHexString()}`; });
      return hex;
    };
    expect(colorOf(a, 'M_Tshirt')).not.toBe(colorOf(b, 'M_Tshirt'));
    expect(colorOf(a, 'M_Hair')).not.toBe(colorOf(b, 'M_Hair'));
    a.play('walk', { fade: 0 }); b.play('idle', { fade: 0 });
    a.update(0.4); b.update(0.1);
    const head = (c: ModularCharacter) => { let q = new THREE.Quaternion(); c.root.traverse((o) => { if (o.name === 'Head') q = o.quaternion.clone(); }); return q; };
    expect(head(a).angleTo(head(b))).toBeGreaterThan(1e-4);
    // Garment geometry is shared, materials are not.
    const geo = (c: ModularCharacter) => { let g: THREE.BufferGeometry | null = null; c.root.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.Material | undefined; if (mm && !Array.isArray(mm) && mm.name === 'M_Tshirt') g = (o as THREE.Mesh).geometry; }); return g; };
    expect(geo(a)).toBe(geo(b));
    a.dispose();
    expect(cache.stats().entries).toBeGreaterThan(0); // b still holds them
    b.dispose();
    expect(cache.stats().refs).toBe(0);
  });
});
