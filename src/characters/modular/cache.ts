// Reference-counted loader of modular body and part GLBs. One load per URL however many characters use it; when the last
// reference is released the file's geometry, textures and materials are disposed and the entry is forgotten.
// Characters never mutate the loaded scene (they clone skeletons and materials), so sharing is safe.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CoverMaskFile } from './types';

export type GltfLoadFn = (url: string) => Promise<GLTF>;

export interface ModularCacheOptions {
  /** Where the manifest's relative paths live (default './assets/characters/modular/'). */
  root?: string;
  /** Replaces the network loader (tests parse files from disk). */
  load?: GltfLoadFn;
  /** Replaces the fetch of cover mask JSON files. */
  loadMask?: (url: string) => Promise<CoverMaskFile>;
  /** Replaces the image loader of loose textures (a body's young skin). */
  loadTexture?: (url: string) => Promise<THREE.Texture>;
}

interface MaskEntry { refs: number; promise: Promise<CoverMaskFile> }

async function defaultLoadMask(url: string): Promise<CoverMaskFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CoverMaskFile;
}

interface TextureEntry { refs: number; promise: Promise<THREE.Texture> }

function defaultLoadTexture(url: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url);
}

interface Entry { url: string; refs: number; promise: Promise<GLTF>; gltf: GLTF | null }

async function defaultLoad(url: string): Promise<GLTF> {
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
}

/** Frees the GPU resources a loaded glTF scene owns. */
export function disposeGltf(gltf: GLTF): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton?.dispose();
  });
  for (const g of geos) g.dispose();
  for (const mat of mats) {
    for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
    mat.dispose();
  }
}

export class ModularAssetCache {
  private readonly entries = new Map<string, Entry>();
  private readonly root: string;
  private readonly loadFn: GltfLoadFn;
  private readonly loadMaskFn: (url: string) => Promise<CoverMaskFile>;
  private readonly masks = new Map<string, MaskEntry>();
  private readonly textures = new Map<string, TextureEntry>();
  private readonly loadTextureFn: (url: string) => Promise<THREE.Texture>;

  constructor(opts: ModularCacheOptions = {}) {
    const r = opts.root ?? './assets/characters/modular/';
    this.root = r.endsWith('/') ? r : `${r}/`;
    this.loadFn = opts.load ?? defaultLoad;
    this.loadMaskFn = opts.loadMask ?? defaultLoadMask;
    this.loadTextureFn = opts.loadTexture ?? defaultLoadTexture;
  }

  /** Reference-counted cover mask JSON (see GarmentDef.covers); a failed load drops the reference and rejects. */
  acquireMask(url: string): Promise<CoverMaskFile> {
    const e = this.masks.get(url);
    if (e) { e.refs++; return e.promise; }
    const entry: MaskEntry = { refs: 1, promise: null as unknown as Promise<CoverMaskFile> };
    entry.promise = this.loadMaskFn(url).catch((err) => { if (this.masks.get(url) === entry) this.masks.delete(url); throw err; });
    this.masks.set(url, entry);
    return entry.promise;
  }

  releaseMask(url: string): void {
    const e = this.masks.get(url);
    if (e && --e.refs <= 0) this.masks.delete(url);
  }

  /**
   * Reference-counted loose texture (shared by every character that draws it). A failed load drops the reference and rejects,
   * so the caller must not release it.
   */
  acquireTexture(url: string): Promise<THREE.Texture> {
    const e = this.textures.get(url);
    if (e) { e.refs++; return e.promise; }
    const entry: TextureEntry = { refs: 1, promise: null as unknown as Promise<THREE.Texture> };
    // the loader may throw at once where there is no DOM (unit tests): that is a failed load like any other
    entry.promise = new Promise<THREE.Texture>((res) => res(this.loadTextureFn(url))).catch((err) => { if (this.textures.get(url) === entry) this.textures.delete(url); throw err; });
    this.textures.set(url, entry);
    return entry.promise;
  }

  releaseTexture(url: string): void {
    const e = this.textures.get(url);
    if (!e || --e.refs > 0) return;
    this.textures.delete(url);
    void e.promise.then((t) => t.dispose(), () => { /* failed load */ });
  }

  /** Full URL of a manifest-relative path. */
  urlFor(path: string): string { return `${this.root}${path}`; }

  /**
   * Takes a reference to the file (loading it on the first request). The reference is counted at once, before the load ends;
   * if the load fails the reference is dropped again and the promise rejects, so the caller must not release it.
   */
  acquire(url: string): Promise<GLTF> {
    const e = this.entries.get(url);
    if (e) { e.refs++; return e.promise; }
    const entry: Entry = { url, refs: 1, gltf: null, promise: null as unknown as Promise<GLTF> };
    entry.promise = this.loadFn(url).then(
      (g) => { entry.gltf = g; return g; },
      (err) => { if (this.entries.get(url) === entry) this.entries.delete(url); throw err; },
    );
    this.entries.set(url, entry);
    return entry.promise;
  }

  /** Gives a reference back; the last one disposes the file's resources (once its load has finished). */
  release(url: string): void {
    const e = this.entries.get(url);
    if (!e) return;
    if (--e.refs > 0) return;
    this.entries.delete(url);
    void e.promise.then((g) => disposeGltf(g), () => { /* failed load: nothing to free */ });
  }

  /** Entries held, total references, and distinct geometries of the loaded entries. */
  stats(): { entries: number; refs: number; geometries: number; masks: number } {
    let refs = 0;
    const geos = new Set<THREE.BufferGeometry>();
    for (const e of this.entries.values()) {
      refs += e.refs;
      e.gltf?.scene.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) geos.add(g); });
    }
    return { entries: this.entries.size, refs, geometries: geos.size, masks: this.masks.size };
  }

  /** Releases everything (leaving the modular style for good); characters must be disposed first. */
  dispose(): void {
    for (const e of this.entries.values()) void e.promise.then((g) => disposeGltf(g), () => { /* ignore */ });
    this.entries.clear();
    this.masks.clear();
    for (const t of this.textures.values()) void t.promise.then((x) => x.dispose(), () => { /* ignore */ });
    this.textures.clear();
  }
}
