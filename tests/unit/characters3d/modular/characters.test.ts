import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModularCharacter, applyMorphInfluences, decodeBitset } from '../../../../src/characters/modular/ModularCharacter';
import { migrateModularLook } from '../../../../src/characters/modular/look';
import type { CoverMaskFile } from '../../../../src/characters/modular/types';
import { BODY, loadClips, look, meshesNamed, shellLook, testCache, testManifest } from './helpers';

const clips = await loadClips();
const regionVisible = (c: ModularCharacter, r: string) => c.root.getObjectByName(`Body_${r}`)!.visible;
const mixerTime = (c: ModularCharacter) => (c as unknown as { animator: { mixer: THREE.AnimationMixer } }).animator.mixer.time;
const skinColor = (c: ModularCharacter) => ((c as unknown as { body: { skin: Array<{ mat: THREE.MeshStandardMaterial }> } }).body.skin[0]!.mat.color).getHexString();

describe('ModularCharacter', () => {
  it('keeps two characters from the same body independent', async () => {
    const cache = testCache(), manifest = testManifest();
    const a = new ModularCharacter(cache, manifest, clips), b = new ModularCharacter(cache, manifest, clips);
    await Promise.all([a.apply(look()), b.apply(look())]);
    const before = skinColor(b);
    await a.apply(shellLook({ colors: { skin: '#ffffff', eyes: '#000000', hair: '#000000', garments: { shell_top: { main: '#ff0000' } } } }));
    expect(skinColor(b)).toBe(before);
    expect(skinColor(a)).not.toBe(before);
    expect(regionVisible(a, 'chest')).toBe(false);
    expect(regionVisible(b, 'chest')).toBe(true);
    expect(meshesNamed(b.root, 'Shell')).toHaveLength(0);
    // one body GLB shared by both, loaded once
    expect(cache.stats().entries).toBe(2);
    a.play('walk', { fade: 0 }); b.play('idle', { fade: 0 });
    a.update(0.1); a.update(0.1); a.update(0.1); b.update(0.05);
    expect(mixerTime(a)).toBeCloseTo(0.3, 5);
    expect(mixerTime(b)).toBeCloseTo(0.05, 5);
    a.dispose(); b.dispose();
  });

  it('hides regions while a garment is worn and restores them; no duplicates', async () => {
    const cache = testCache();
    const c = new ModularCharacter(cache, testManifest(), clips);
    await c.apply(shellLook());
    expect(regionVisible(c, 'chest')).toBe(false);
    expect(regionVisible(c, 'belly')).toBe(false);
    expect(regionVisible(c, 'hips')).toBe(true);
    await c.apply(shellLook());
    await Promise.all([c.apply(shellLook()), c.apply(shellLook())]);
    expect(meshesNamed(c.root, 'Shell')).toHaveLength(1);
    expect(cache.stats().refs).toBe(2);
    expect(c.issues).toEqual([]);
    await c.apply(look());
    expect(regionVisible(c, 'chest')).toBe(true);
    expect(regionVisible(c, 'belly')).toBe(true);
    expect(meshesNamed(c.root, 'Shell')).toHaveLength(0);
    c.dispose();
  });

  it('does not grow under repeated equip / recolor / body swap cycles', async () => {
    const cache = testCache();
    const c = new ModularCharacter(cache, testManifest(), clips);
    await c.apply(look());
    const base = { ...cache.stats() };
    const children = c.root.children.length;
    let steady = base;
    for (let i = 0; i < 50; i++) {
      const bodyId = i % 10 === 9 ? 'ubc_female' : BODY;
      await c.apply(i % 2 ? look({ bodyId }) : shellLook({ bodyId, colors: { skin: `#${(i * 5000 + 100000).toString(16).slice(0, 6).padStart(6, '0')}`, eyes: '#000000', hair: '#000000', garments: {} } }));
      if (i === 49) steady = cache.stats();
    }
    await c.apply(look());
    const end = cache.stats();
    expect(end.entries).toBe(base.entries);
    expect(end.refs).toBe(base.refs);
    expect(end.geometries).toBe(base.geometries);
    expect(c.root.children.length).toBe(children);
    expect(steady.entries).toBeLessThanOrEqual(2);
    c.dispose();
    expect(cache.stats().entries).toBe(0);
  });

  it('dispose of one character leaves the shared geometry alive for the other', async () => {
    const cache = testCache(), manifest = testManifest();
    const a = new ModularCharacter(cache, manifest, clips), b = new ModularCharacter(cache, manifest, clips);
    await Promise.all([a.apply(shellLook()), b.apply(shellLook())]);
    const disposed: string[] = [];
    const url = cache.urlFor('fixture/shell_top_m.glb');
    const gltf = await cache.acquire(url);
    gltf.scene.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) g.addEventListener('dispose', () => disposed.push(o.name)); });
    cache.release(url);
    a.dispose(); a.dispose();
    await Promise.resolve();
    expect(disposed).toEqual([]);
    expect(cache.stats().entries).toBe(2);
    expect(meshesNamed(b.root, 'Shell')).toHaveLength(1);
    b.dispose();
    await new Promise((r) => setTimeout(r, 0));
    expect(disposed.length).toBeGreaterThan(0);
    expect(cache.stats()).toMatchObject({ entries: 0, refs: 0 });
  });

  it('rejects a part whose bind pose differs from the body', async () => {
    const cache = testCache();
    const url = cache.urlFor('fixture/shell_top_m.glb');
    const gltf = await cache.acquire(url);
    gltf.scene.traverse((o) => { const s = (o as THREE.SkinnedMesh).skeleton; if (s) s.boneInverses[10]!.elements[13]! += 0.05; });
    const c = new ModularCharacter(cache, testManifest(), clips);
    await c.apply(shellLook());
    expect(c.issues.some((i) => i.includes('rig-mismatch'))).toBe(true);
    expect(meshesNamed(c.root, 'Shell')).toHaveLength(0);
    expect(regionVisible(c, 'chest')).toBe(true);
    expect(c.equipped().garments).toEqual({});
    // a part made for another rig is rejected before binding
    cache.release(url);
    const c2 = new ModularCharacter(cache, testManifest({ rig: 'nope' }), clips);
    await c2.apply(shellLook());
    expect(c2.equipped().garments).toEqual({});
    c.dispose(); c2.dispose();
  });

  it('round-trips through serialize, JSON and migrateModularLook', async () => {
    const cache = testCache(), manifest = testManifest();
    const a = new ModularCharacter(cache, manifest, clips);
    await a.apply(shellLook({ colors: { skin: '#aa8866', eyes: '#112233', hair: '#445566', garments: { shell_top: { main: '#ff00aa' } } } }));
    const stored = migrateModularLook(JSON.parse(JSON.stringify(a.serialize())));
    expect(stored).not.toBeNull();
    const b = new ModularCharacter(cache, manifest, clips);
    await b.apply(stored!);
    expect(b.equipped()).toEqual(a.equipped());
    expect(b.serialize()).toEqual(a.serialize());
    expect(skinColor(b)).toBe(skinColor(a));
    const fabric = (c: ModularCharacter) => ((meshesNamed(c.root, 'Shell')[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();
    expect(fabric(b)).toBe(fabric(a));
    expect(fabric(b)).toBe(new THREE.Color('#ff00aa').getHexString());
    a.dispose(); b.dispose();
  });

  it('drives declared morphs only', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geo.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(9), 3)];
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.morphTargetDictionary = { Wide: 0 };
    mesh.morphTargetInfluences = [0];
    const declared = [{ id: 'wide', label: 'Wide', target: 'Wide', range: [0, 1] as [number, number], group: 'body' as const }];
    applyMorphInfluences([mesh], declared, { wide: 0.4, unknown: 1 });
    expect(mesh.morphTargetInfluences[0]).toBeCloseTo(0.4);
    applyMorphInfluences([mesh], declared, { wide: 5 });
    expect(mesh.morphTargetInfluences[0]).toBe(1);
    applyMorphInfluences([mesh], declared, {}, ['other']);
    expect(mesh.morphTargetInfluences[0]).toBe(1);
  });
});

describe('cover masks', () => {
  const bits = (n: number, on: (i: number) => boolean) => {
    const bytes = new Uint8Array(Math.ceil(n / 8));
    for (let i = 0; i < n; i++) if (on(i)) bytes[i >> 3]! |= 1 << (i & 7);
    return Buffer.from(bytes).toString('base64');
  };
  const counts = { 'Body_chest/0': 684, 'Body_belly/0': 194 };
  const mask = (over: Partial<CoverMaskFile> = {}): CoverMaskFile => ({
    v: 1, body: BODY, garment: 'shell_top', coverDist: 0.06, vertexCounts: counts,
    meshes: {
      'Body_chest/0': bits(684, () => true),
      'Body_belly/0': bits(194, (i) => i < 97),
    }, ...over,
  });
  const hiddenOf = (c: ModularCharacter, key: string) => {
    const m = (c as unknown as { body: { masked: Array<{ key: string; hidden: THREE.BufferAttribute; mesh: THREE.Mesh }> } }).body.masked.find((x) => x.key === key)!;
    return { arr: m.hidden.array as Float32Array, mesh: m.mesh };
  };

  it('decodes LSB-first bitsets', () => {
    expect([...decodeBitset(Buffer.from([0b00000101, 1]).toString('base64'), 10)]).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  });

  it('hides covered vertices per character, restores on unequip, shares attributes', async () => {
    const cache = testCache({ 'covers/shell.json': mask() });
    const manifest = testManifest({ hides: [], covers: { [BODY]: 'covers/shell.json' } });
    const a = new ModularCharacter(cache, manifest, clips), b = new ModularCharacter(cache, manifest, clips);
    await Promise.all([a.apply(shellLook()), b.apply(look())]);
    expect(a.issues).toEqual([]);
    const ca = hiddenOf(a, 'Body_chest/0'), ba = hiddenOf(a, 'Body_belly/0');
    expect(ca.arr.every((v) => v === 1)).toBe(true);
    expect(ca.mesh.visible).toBe(false);
    expect(ba.arr.slice(0, 97).every((v) => v === 1)).toBe(true);
    expect(ba.arr.slice(97).every((v) => v === 0)).toBe(true);
    expect(ba.mesh.visible).toBe(true);
    expect(regionVisible(a, 'belly')).toBe(true); // no whole-region hide: the mask decides (chest is now a single mesh, so its node is the fully masked mesh itself)
    const cb = hiddenOf(b, 'Body_chest/0');
    expect(cb.arr.every((v) => v === 0)).toBe(true);
    expect(cb.arr).not.toBe(ca.arr);
    // attributes other than aHidden are the cached geometry's own objects
    const shared = (ca.mesh.geometry.getAttribute('position') === cb.mesh.geometry.getAttribute('position'));
    expect(shared).toBe(true);
    await a.apply(look());
    expect(hiddenOf(a, 'Body_chest/0').arr.every((v) => v === 0)).toBe(true);
    expect(hiddenOf(a, 'Body_chest/0').mesh.visible).toBe(true);
    expect(cache.stats().masks).toBe(0);
    a.dispose(); b.dispose();
  });

  it('rejects a mask made for another body export', async () => {
    const cache = testCache({ 'covers/shell.json': mask({ vertexCounts: { ...counts, 'Body_chest/0': 5 } }) });
    const c = new ModularCharacter(cache, testManifest({ hides: [], covers: { [BODY]: 'covers/shell.json' } }), clips);
    await c.apply(shellLook());
    expect(c.issues.some((i) => i.includes('cover-mask-mismatch'))).toBe(true);
    expect(hiddenOf(c, 'Body_chest/0').arr.every((v) => v === 0)).toBe(true);
    expect(cache.stats().masks).toBe(0);
    c.dispose();
  });
});

describe('skinMaterialColor', () => {
  it('keeps the hue of a light skin instead of clipping red', async () => {
    const THREE = await import('three');
    const { skinMaterialColor } = await import('../../../../src/characters/modular/ModularCharacter');
    const light = new THREE.Color('#f5ddc9');
    const out = skinMaterialColor(light, 1.4, new THREE.Color());
    expect(Math.max(out.r, out.g, out.b)).toBeCloseTo(1, 5);
    expect(out.g / out.r).toBeCloseTo(light.g / light.r, 5);
    expect(out.b / out.r).toBeCloseTo(light.b / light.r, 5);
    const dark = new THREE.Color('#5a3a26');
    const d = skinMaterialColor(dark, 1.4, new THREE.Color());
    expect(d.r).toBeCloseTo(dark.r * 1.4, 5);
  });
});
