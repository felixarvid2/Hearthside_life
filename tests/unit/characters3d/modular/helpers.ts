// Test helpers: parse the modular GLBs from disk in Node (no network, no textures) and build a test manifest that adds the
// fixture shell garment to the real manifest.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModularAssetCache } from '../../../../src/characters/modular/cache';
import type { CoverMaskFile, GarmentDef, ModularLook, ModularManifest } from '../../../../src/characters/modular/types';

export const repo = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

export function parseGlb(file: string): Promise<GLTF> {
  const b = readFileSync(file);
  // Node has no image decoding: textured materials get an empty Texture so `material.map` still exists.
  const loader = new GLTFLoader().register(() => ({ name: 'TestEmptyTextures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '', res, rej));
}

export const realManifest = (): ModularManifest => JSON.parse(readFileSync(repo('public/assets/characters/modular/manifest.json'), 'utf8')) as ModularManifest;

export const BODY = 'ubc_male';

export function shellGarment(extra: Partial<GarmentDef> = {}): GarmentDef {
  return {
    id: 'shell_top', label: 'Shell', category: 'top', slot: 'top', files: { [BODY]: 'fixture/shell_top_m.glb' }, rig: 'ual-standard',
    hides: ['chest', 'belly'], layer: 1, conflicts: [], source: 'tests', license: 'test',
    colorRegions: [{ id: 'main', label: 'Fabric', materials: ['M_Fabric'], default: '#336699' }], ...extra,
  };
}

export function testManifest(extra: Partial<GarmentDef> = {}): ModularManifest {
  const m = realManifest();
  m.garments.push(shellGarment(extra));
  return m;
}

export function testCache(masks: Record<string, CoverMaskFile> = {}): ModularAssetCache {
  return new ModularAssetCache({
    root: 'mem://',
    load: (url) => {
      const path = url.slice('mem://'.length);
      return parseGlb(path.startsWith('fixture/') ? repo(`tests/fixtures/modular/${path.slice(8)}`) : repo(`public/assets/characters/modular/${path}`));
    },
    loadMask: async (url) => { const f = masks[url.slice('mem://'.length)]; if (!f) throw new Error('no such mask'); return f; },
  });
}

export async function loadClips(): Promise<THREE.AnimationClip[]> {
  return (await parseGlb(repo('public/assets/characters/anims_1.glb'))).animations;
}

export const look = (over: Partial<ModularLook> = {}): ModularLook => ({
  v: 2, bodyId: BODY, hairId: null, facialHairId: null, outfits: {}, colors: { skin: '#c68642', eyes: '#5b4636', hair: '#222222', garments: {} }, morphs: {}, ...over,
});

export const shellLook = (over: Partial<ModularLook> = {}): ModularLook => look({ outfits: { everyday: { top: 'shell_top' } }, ...over });

/** Meshes (by name) under an object. */
export function meshesNamed(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
}
