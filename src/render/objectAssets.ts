// Furniture model cache: one GLTF load per manifest model, shared geometry, lit materials converted from the
// Kenney unlit ones, finish-coloured material sets shared between instances with the same finishes, and
// reference counting so models nobody uses can be dropped (purgeUnused).
//
// Kenney colour factors are authored as sRGB (that is how the catalog thumbnails look), so they are read with
// color.setRGB(r, g, b, SRGBColorSpace). Within a finish region the first listed material takes the swatch
// colour and the other materials keep their shade relative to it (src/content/objects.ts header).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ObjectDef } from '../content/types';
import { isProceduralAsset, proceduralModel, proceduralThumb } from './stairModel';

export interface ManifestModel { file: string; thumb?: string; min: number[]; max: number[]; materials: Array<{ name: string; color: number[] }> }
export interface Manifest { furniture: Record<string, ManifestModel> }

interface Template {
  scene: THREE.Group;
  /** Lit base material per source material name. */
  base: Map<string, THREE.MeshStandardMaterial>;
  refs: number;
  /** Finish-coloured material sets keyed by finishes JSON. */
  sets: Map<string, Map<string, THREE.MeshStandardMaterial>>;
  ghost: Map<string, THREE.MeshStandardMaterial> | null;
}

/** Materials whose name marks a light-emitting part. */
export const LAMP_MATERIAL = 'lamp';

/**
 * GLB sub-nodes that must stay separate because the renderer pivots them (Milestone 11.5, doors and lids).
 * Keyed by asset. Every other node is merged by material as before; each listed node keeps its own origin
 * (the hinge in these models) and becomes a group named `part:<node>` inside the template.
 */
export const PART_NODES: Record<string, readonly string[]> = {
  kitchenFridge: ['doorFridge'],
  kitchenFridgeLarge: ['doorLeft', 'doorRight'],
  kitchenFridgeSmall: ['doorFridge'],
  kitchenFridgeBuiltIn: ['doorFridge'],
  kitchenStove: ['door'],
  kitchenMicrowave: ['Group'],
  washer: ['washerDoor'],
  dryer: ['dryerDoor'],
  toilet: ['cover'],
  toiletSquare: ['Group'],
  bookcaseClosedDoors: ['doorLeft', 'doorRight'],
};

export class ObjectAssets {
  private readonly loader = new GLTFLoader();
  private readonly templates = new Map<string, Template>();
  private readonly pending = new Map<string, Promise<Template | null>>();
  private readonly failed = new Set<string>();
  /** Lamp materials of every finish set (night glow is driven by GameView). */
  readonly lampMaterials = new Set<THREE.MeshStandardMaterial>();
  manifest: Manifest | null = null;

  constructor(readonly baseUrl: string) {}

  async loadManifest(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}manifest.json`);
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      this.manifest = (await res.json()) as Manifest;
    } catch (e) {
      console.warn('[render] furniture manifest unavailable', e);
      this.manifest = { furniture: {} };
    }
  }

  thumbUrl(asset: string): string {
    if (isProceduralAsset(asset)) return proceduralThumb(asset);
    const m = this.manifest?.furniture[asset];
    return `${this.baseUrl}${m?.thumb ?? `furniture/thumbs/${asset}.png`}`;
  }

  get loadedCount(): number { return this.templates.size; }

  isLoaded(asset: string): boolean { return this.templates.has(asset); }
  hasFailed(asset: string): boolean { return this.failed.has(asset); }

  /** Loads a model (once). Resolves null when it is missing or broken. */
  load(asset: string): Promise<Template | null> {
    const t = this.templates.get(asset);
    if (t) return Promise.resolve(t);
    let p = this.pending.get(asset);
    if (p) return p;
    p = (async () => {
      // Milestone 9: staircases are meshes built at runtime
      if (isProceduralAsset(asset)) {
        const scene = proceduralModel(asset);
        if (!scene) { this.failed.add(asset); return null; }
        const tpl = this.makeTemplate(scene, asset);
        this.templates.set(asset, tpl);
        return tpl;
      }
      const entry = this.manifest?.furniture[asset];
      if (!entry) { this.failed.add(asset); return null; }
      try {
        const gltf = await this.loader.loadAsync(`${this.baseUrl}${entry.file}`);
        const tpl = this.makeTemplate(gltf.scene, asset);
        this.templates.set(asset, tpl);
        return tpl;
      } catch (e) {
        console.warn(`[render] model ${asset} failed to load`, e);
        this.failed.add(asset);
        return null;
      }
    })();
    // cleared once settled (never inside the loader: the procedural branch settles synchronously, before this set,
    // and would leave a stale entry that hides a later purge of its template)
    this.pending.set(asset, p);
    const mine = p;
    void mine.finally(() => { if (this.pending.get(asset) === mine) this.pending.delete(asset); });
    return p;
  }

  /** Loads several models in parallel; reports progress (done, total). */
  async preload(assets: Iterable<string>, onProgress?: (done: number, total: number) => void): Promise<void> {
    const list = [...new Set(assets)];
    let done = 0;
    await Promise.all(list.map(async (a) => { await this.load(a); done++; onProgress?.(done, list.length); }));
  }

  private makeTemplate(scene: THREE.Group, asset: string): Template {
    const base = new Map<string, THREE.MeshStandardMaterial>();
    const convert = (m: THREE.Material): THREE.MeshStandardMaterial => {
      let out = base.get(m.name);
      if (out) return out;
      const src = m as THREE.MeshBasicMaterial;
      out = new THREE.MeshStandardMaterial({ name: m.name, roughness: 0.8, metalness: 0 });
      const c = src.color ?? new THREE.Color(1, 1, 1);
      out.color.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
      if (m.name.startsWith('metal')) { out.roughness = 0.45; out.metalness = 0.35; }
      if (m.name === 'glass') { out.transparent = true; out.opacity = 0.5; out.roughness = 0.15; out.depthWrite = false; }
      if (m.name.startsWith('carpet') || m.name === 'fur') out.roughness = 0.95;
      out.userData.base = out.color.clone();
      base.set(m.name, out);
      return out;
    };
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
    });
    return { scene: mergeByMaterial(scene, PART_NODES[asset] ?? []), base, refs: 0, sets: new Map(), ghost: null };
  }

  /** Material set for a definition's finishes (shared by every instance with the same choices). */
  private materialSet(tpl: Template, def: ObjectDef, finishes: Record<string, string>): Map<string, THREE.MeshStandardMaterial> {
    const key = JSON.stringify(def.finishes.map((r) => finishes[r.id] ?? r.swatches[0]?.id ?? ''));
    let set = tpl.sets.get(key);
    if (set) return set;
    set = new Map();
    for (const [name, m] of tpl.base) {
      const c = m.clone();
      c.userData.base = (m.userData.base as THREE.Color).clone();
      set.set(name, c);
      if (name === LAMP_MATERIAL) {
        c.emissive = new THREE.Color(0xffd9a0);
        c.emissiveIntensity = 0;
        this.lampMaterials.add(c);
      }
    }
    for (const region of def.finishes) {
      const swatch = region.swatches.find((s) => s.id === finishes[region.id]) ?? region.swatches[0];
      const first = set.get(region.materials[0] ?? '');
      if (!swatch || !first) continue;
      const target = new THREE.Color(swatch.color);
      const base0 = first.userData.base as THREE.Color;
      for (const name of region.materials) {
        const m = set.get(name);
        if (!m) continue;
        const b = m.userData.base as THREE.Color;
        m.color.setRGB(
          Math.min(1, target.r * (b.r / Math.max(1e-4, base0.r))),
          Math.min(1, target.g * (b.g / Math.max(1e-4, base0.g))),
          Math.min(1, target.b * (b.b / Math.max(1e-4, base0.b))),
        );
      }
    }
    tpl.sets.set(key, set);
    return set;
  }

  /**
   * A new instance of a definition's model inside its rot-0 local space (def.model transform applied).
   * Null when the model is not loaded (call load() first) or missing. Pair with release().
   */
  instance(def: ObjectDef, finishes: Record<string, string>, ghost = false): THREE.Object3D | null {
    const tpl = this.templates.get(def.model.asset);
    if (!tpl) return null;
    const mats = ghost ? this.ghostSet(tpl) : this.materialSet(tpl, def, finishes);
    const inner = tpl.scene.clone(true);
    inner.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => mats.get(m.name) ?? (m as THREE.MeshStandardMaterial);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      if (ghost) { mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 3; }
    });
    const root = new THREE.Group();
    root.name = `model:${def.model.asset}`;
    root.add(inner);
    root.scale.setScalar(def.model.scale);
    root.rotation.y = def.model.yaw;
    root.position.set(def.model.offset[0], def.model.offset[1], def.model.offset[2]);
    root.userData.asset = def.model.asset;
    tpl.refs++;
    return root;
  }

  private ghostSet(tpl: Template): Map<string, THREE.MeshStandardMaterial> {
    if (tpl.ghost) return tpl.ghost;
    const set = new Map<string, THREE.MeshStandardMaterial>();
    for (const [name, m] of tpl.base) {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.82;
      c.depthWrite = false;
      c.emissive = new THREE.Color(0x2a2418);
      set.set(name, c);
    }
    tpl.ghost = set;
    return set;
  }

  release(model: THREE.Object3D | null): void {
    const asset = model?.userData.asset as string | undefined;
    if (!asset) return;
    const tpl = this.templates.get(asset);
    if (tpl && tpl.refs > 0) tpl.refs--;
    model?.removeFromParent();
  }

  /** Disposes models no instance uses any more (call after a world change). */
  purgeUnused(keep: ReadonlySet<string> = new Set()): number {
    let n = 0;
    for (const [asset, tpl] of this.templates) {
      // runtime-built models (stairs) are small and may have been built synchronously during the same lot change
      if (tpl.refs > 0 || keep.has(asset) || isProceduralAsset(asset)) continue;
      tpl.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      const all = [...tpl.base.values(), ...[...tpl.sets.values()].flatMap((s) => [...s.values()]), ...(tpl.ghost ? [...tpl.ghost.values()] : [])];
      for (const m of all) { this.lampMaterials.delete(m); m.dispose(); }
      this.templates.delete(asset);
      n++;
    }
    return n;
  }
}

/**
 * Flattens a model into one mesh per material (geometry baked in the model's root space), so an instance costs
 * one draw call per material instead of one per node primitive. Named nodes in `keep` (doors/lids) are not
 * flattened: each becomes a `part:<name>` group whose origin is the node origin and whose rotation/scale is the
 * node's, so the renderer can swing it around its hinge. Falls back to the original hierarchy when the primitives
 * cannot be merged (different attribute sets).
 */
function mergeByMaterial(scene: THREE.Group, keep: readonly string[] = []): THREE.Group {
  scene.updateMatrixWorld(true);
  const parts: THREE.Object3D[] = [];
  const partOf = new Map<THREE.Object3D, THREE.Object3D>();
  for (const name of keep) {
    const node = scene.getObjectByName(name);
    if (!node || node === scene) continue;
    parts.push(node);
    node.traverse((o) => partOf.set(o, node));
  }
  type GeoGroups = Map<THREE.Material, THREE.BufferGeometry[]>;
  const body: GeoGroups = new Map();
  const partGeos = new Map<THREE.Object3D, GeoGroups>();
  let ok = true;
  const add = (groups: GeoGroups, mat: THREE.Material, g: THREE.BufferGeometry) => {
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.morphAttributes = {};
    const list = groups.get(mat) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    groups.set(mat, list);
  };
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) { ok = false; return; }
    const owner = partOf.get(mesh);
    const g = mesh.geometry.clone();
    if (owner) {
      // geometry in the kept node's local frame, so the pivot can rotate around the node origin
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(owner.matrixWorld.clone().invert(), mesh.matrixWorld));
      let groups = partGeos.get(owner);
      if (!groups) partGeos.set(owner, groups = new Map());
      add(groups, mesh.material, g);
    } else {
      g.applyMatrix4(mesh.matrixWorld);
      add(body, mesh.material, g);
    }
  });
  const out = new THREE.Group();
  const build = (groups: GeoGroups, target: THREE.Group) => {
    for (const [mat, list] of groups) {
      const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
      if (!merged) { ok = false; break; }
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      target.add(m);
    }
  };
  if (ok) {
    build(body, out);
    for (const node of parts) {
      const groups = partGeos.get(node);
      if (!groups || groups.size === 0) continue;
      const pivot = new THREE.Group();
      pivot.name = `part:${node.name}`;
      pivot.userData.partName = node.name;
      node.matrixWorld.decompose(pivot.position, pivot.quaternion, pivot.scale);
      // plain array: Object3D.clone() JSON-copies userData
      pivot.userData.baseQuaternion = [pivot.quaternion.x, pivot.quaternion.y, pivot.quaternion.z, pivot.quaternion.w];
      build(groups, pivot);
      out.add(pivot);
    }
  }
  if (!ok) {
    out.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return scene;
  }
  scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  return out;
}

/** Labelled placeholder for a definition whose model is missing (rot-0 local space). */
export function placeholderModel(def: ObjectDef): THREE.Object3D {
  const g = new THREE.Group();
  const h = Math.max(0.15, def.layer === 'surface' ? Math.min(def.height, 0.6) : def.height || 0.5);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(def.footprint.w * 0.86, h, def.footprint.d * 0.86),
    new THREE.MeshStandardMaterial({ color: 0xd9c7a8, roughness: 0.9, transparent: true, opacity: 0.85 }),
  );
  box.position.set(def.footprint.w / 2, h / 2, def.footprint.d / 2);
  g.add(box);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fbf6ee'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#2f2a26'; ctx.font = '600 24px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(def.name.slice(0, 18), 128, 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  label.scale.set(1, 0.25, 1);
  label.position.set(def.footprint.w / 2, h + 0.3, def.footprint.d / 2);
  g.add(label);
  g.userData.placeholder = true;
  return g;
}

export function disposePlaceholder(o: THREE.Object3D): void {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
    if (mat) { const map = (mat as THREE.SpriteMaterial).map; map?.dispose(); mat.dispose(); }
  });
}
