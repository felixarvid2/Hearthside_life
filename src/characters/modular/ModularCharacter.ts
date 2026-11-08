// A modular (GLB-part) character: one body GLB cloned per character (own skeleton), garments and hair as skinned meshes
// that share the part's geometry and are bound to THIS character's bones, plus an Animator. Feet at the origin, facing +z
// (the UAL rig of the shared clips). No game or UI coupling: the adapter in ModularCharacterView.ts does that.
//
// Ownership: geometry and textures belong to the ModularAssetCache (reference counted); skeletons, materials and the
// mixer belong to the character and are freed by unequip / dispose().

import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimId } from '../../core/anim';
import type { Hex, OutfitCategory, Posture } from '../../core/types';
import { Animator } from '../animation';
import type { ModularAssetCache } from './cache';
import { outfitFor, resolveLook } from './look';
import { hipRatio, scaledClipsFor } from './retarget';
import { findBody, findGarment, findHair } from './manifest';
import { BODY_REGIONS, MODULAR_LOOK_VERSION } from './types';
import type { BodyPresetDef, BodyRegion, ColorRegionDef, CoverMaskFile, GarmentDef, HairstyleDef, ModularLook, ModularManifest, ModularSlot, RigProfile } from './types';

type PartDef = GarmentDef | HairstyleDef;
type PartKey = ModularSlot | 'hair';

interface BodyInstance {
  def: BodyPresetDef;
  rig: RigProfile;
  url: string;
  scene: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
  /** Inverse bind matrices by joint name (the reference every part is checked against). */
  inverses: Map<string, THREE.Matrix4>;
  regions: Map<BodyRegion, THREE.Object3D>;
  meshes: THREE.SkinnedMesh[];
  skeletons: THREE.Skeleton[];
  materials: THREE.Material[];
  /** Cloned skin materials; `tone` scales the skin color (joints are a little darker). */
  skin: Array<{ mat: THREE.Material; tone: number }>;
  /** Cloned eye materials with their iris tint uniform (kept so recoloring after compile works). */
  eyes: Array<{ mat: THREE.Material; uniform: { value: THREE.Color } }>;
  /** Cloned eyebrow materials (colored like the hair). */
  brows: THREE.Material[];
  masked: MaskedMesh[];
  /** Height of the crown above the Head bone at rest. */
  crownAboveHead: number;
}

/** A body skinned mesh with its own geometry (shared attributes plus a per-character `aHidden` attribute). */
interface MaskedMesh {
  mesh: THREE.SkinnedMesh;
  /** The Body_<region> node it belongs to. */
  key: string;
  region: BodyRegion | null;
  geometry: THREE.BufferGeometry;
  hidden: THREE.BufferAttribute;
}

interface PartInstance {
  key: PartKey;
  /** Cover mask file this part holds a cache reference to, and its decoded bitsets by Body_<region> key. */
  maskUrl: string | null;
  mask: Map<string, Uint8Array> | null;
  id: string;
  url: string;
  def: PartDef;
  container: THREE.Group;
  meshes: THREE.Mesh[];
  skeletons: THREE.Skeleton[];
  materials: THREE.Material[];
}

const SKIN_JOINT_TONE = 0.86;
const FALLBACK_RIG: Pick<RigProfile, 'bindTolerance' | 'bindToleranceDeg'> = { bindTolerance: 0.002, bindToleranceDeg: 0.5 };

/** A color from a hex string (alpha digits are ignored). */
export function hexColor(hex: Hex, into = new THREE.Color()): THREE.Color {
  const h = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(hex) ? hex.slice(0, hex.length === 5 ? 4 : 7) : hex;
  try { return into.set(h); } catch { return into.set('#ffffff'); }
}

/**
 * Compares a part's skeleton with the body's bind pose: every joint must exist and its inverse bind matrix must agree in
 * translation (metres) and rotation (degrees) within the rig's tolerances. Returns what is wrong, or null when it fits.
 * Matching joint names alone is not enough: a part fitted to another body would deform wrongly.
 */
export function checkBindFit(skeleton: THREE.Skeleton, bodyInverses: ReadonlyMap<string, THREE.Matrix4>, rig: Pick<RigProfile, 'bindTolerance' | 'bindToleranceDeg'>): string | null {
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < skeleton.bones.length; i++) {
    const name = skeleton.bones[i]!.name;
    const ref = bodyInverses.get(name);
    if (!ref) return `joint '${name}' does not exist on the body`;
    const mine = skeleton.boneInverses[i];
    if (!mine) return `joint '${name}' has no inverse bind matrix`;
    mine.decompose(pa, qa, s);
    ref.decompose(pb, qb, s);
    const dist = pa.distanceTo(pb);
    if (dist > rig.bindTolerance) return `joint '${name}' sits ${(dist * 1000).toFixed(1)} mm off the body's bind pose`;
    const deg = THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))));
    if (deg > rig.bindToleranceDeg) return `joint '${name}' is rotated ${deg.toFixed(2)} degrees off the body's bind pose`;
  }
  return null;
}

/**
 * Sets morph influences on meshes from a look's morph values. Only morphs declared by the body are driven (value clamped to the
 * declared range, 0 when the look has none); `garmentMorphs` limits which declared morphs a garment's meshes follow.
 */
export function applyMorphInfluences(meshes: readonly THREE.Mesh[], declared: BodyPresetDef['morphs'], values: Record<string, number>, only?: readonly string[]): void {
  for (const m of declared) {
    if (only && !only.includes(m.id)) continue;
    const raw = values[m.id];
    const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(m.range[1], Math.max(m.range[0], raw)) : Math.min(m.range[1], Math.max(m.range[0], 0));
    for (const mesh of meshes) {
      const idx = mesh.morphTargetDictionary?.[m.target];
      if (idx !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = v;
    }
  }
}

/**
 * A mesh built anew from a loaded one's geometry only knows its morph targets by index; GLTFLoader puts the glTF target
 * names on the loaded mesh. Copy them, or a garment never follows the body's named morphs.
 */
export function copyMorphNames(src: THREE.Mesh, dst: THREE.Mesh): void {
  if (!src.morphTargetDictionary || !src.morphTargetInfluences) return;
  dst.morphTargetDictionary = { ...src.morphTargetDictionary };
  dst.morphTargetInfluences = src.morphTargetInfluences.map(() => 0);
}

/** Bit i of a base64 bitset (LSB first) per vertex, as 0/1 bytes. */
export function decodeBitset(b64: string, count: number): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = ((bin.charCodeAt(i >> 3) || 0) >> (i & 7)) & 1;
  return out;
}

/** A geometry that shares every attribute (and the index) of `src` and adds its own zeroed `aHidden`. */
function ownGeometry(src: THREE.BufferGeometry): { geometry: THREE.BufferGeometry; hidden: THREE.BufferAttribute } {
  const g = new THREE.BufferGeometry();
  g.name = src.name;
  for (const [k, a] of Object.entries(src.attributes)) g.setAttribute(k, a);
  if (src.index) g.setIndex(src.index);
  g.morphAttributes = src.morphAttributes;
  g.morphTargetsRelative = src.morphTargetsRelative;
  g.groups = src.groups.map((x) => ({ ...x }));
  g.drawRange = { ...src.drawRange };
  g.userData = src.userData;
  if (src.boundingSphere) g.boundingSphere = src.boundingSphere.clone();
  if (src.boundingBox) g.boundingBox = src.boundingBox.clone();
  const hidden = new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count), 1);
  g.setAttribute('aHidden', hidden);
  return { geometry: g, hidden };
}

/** Skin material patch: triangles whose three vertices are covered (interpolated aHidden > 0.999) are discarded. */
function patchCoverDiscard(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aHidden;\nvarying float vHidden;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHidden = aHidden;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vHidden;\nvoid main() {\n  if (vHidden > 0.999) discard;');
  };
  mat.customProgramCacheKey = () => 'modular-cover-discard';
  mat.needsUpdate = true;
}

/** Tints the iris of a textured eye material with `uniform.value` (linear): the texel's luminance sets the brightness. */
function patchIris(mat: THREE.Material, iris: NonNullable<BodyPresetDef['iris']>, uniform: { value: THREE.Color }): void {
  const f = (n: number) => n.toFixed(5);
  const [cx, cy] = iris.center;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uIrisColor = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uIrisColor;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
  #ifdef USE_MAP
  {
    float irisD = distance(vMapUv, vec2(${f(cx)}, ${f(cy)}));
    float irisMask = (1.0 - smoothstep(${f(iris.radius - iris.feather)}, ${f(iris.radius + iris.feather)}, irisD))
      * smoothstep(${f(iris.pupil - iris.feather)}, ${f(iris.pupil + iris.feather)}, irisD);
    float irisLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, uIrisColor * (irisLum / ${f(iris.refLuminance)}), irisMask);
  }
  #endif`);
  };
  mat.customProgramCacheKey = () => `modular-iris:${cx},${cy},${iris.radius},${iris.feather},${iris.pupil},${iris.refLuminance}`;
  mat.needsUpdate = true;
}

const emptyLook = (): ModularLook => ({ v: MODULAR_LOOK_VERSION, bodyId: '', hairId: null, outfits: {}, colors: { skin: '#d9a98a', eyes: '#5b4636', hair: '#3a2a20', garments: {} }, morphs: {} });

export class ModularCharacter {
  readonly root = new THREE.Group();
  /** Problems of the latest apply: unknown or unfitting things that were dropped, parts rejected by the rig check, failed loads. */
  issues: string[] = [];
  /** Resolves when the latest `apply` has finished (and nothing newer is waiting). */
  ready: Promise<void> = Promise.resolve();

  private readonly clips = new Map<string, THREE.AnimationClip>();
  private body: BodyInstance | null = null;
  private hair: PartInstance | null = null;
  private readonly garments = new Map<ModularSlot, PartInstance>();
  private look: ModularLook = emptyLook();
  private animator: Animator | null = null;
  private walkRate = 1;
  private lastAnim: { id: AnimId; opts: { fade?: number; posture?: Posture } } = { id: 'idle', opts: { fade: 0 } };
  private chain: Promise<void> = Promise.resolve();
  private target: { look: ModularLook; category: OutfitCategory } | null = null;
  private done: object | null = null;
  private applyIssues: string[] = [];
  private readonly rigIssues = new Map<PartKey, string>();
  private readonly rejected = new Map<PartKey, string>();
  private disposed = false;

  constructor(private readonly cache: ModularAssetCache, private readonly manifest: ModularManifest, clips: THREE.AnimationClip[]) {
    this.root.name = 'modular-character';
    for (const c of clips) this.clips.set(c.name, c);
  }

  /**
   * Makes the character wear `look` (the outfit of `category`, falling back to 'everyday'). Only the difference to what is
   * worn is loaded and changed; a body change rebuilds everything. Calls are serialized and only the newest look is applied.
   */
  apply(look: ModularLook, category: OutfitCategory = 'everyday'): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const target = { look: structuredClone(look), category };
    this.target = target;
    const run = this.chain.then(async () => {
      const t = this.target;
      if (!t || t === this.done || this.disposed) return;
      this.done = t;
      await this.applyNow(t.look, t.category);
    });
    this.chain = run.catch((e) => { console.warn('[modular] apply failed', e); });
    this.ready = this.chain;
    return this.chain;
  }

  // ---- queries ----

  /** The look as applied (sanitized against the manifest): a structured clone, safe to store. */
  serialize(): ModularLook { return structuredClone(this.look); }

  /** What is on the character right now. */
  equipped(): { bodyId: string | null; hairId: string | null; garments: Partial<Record<ModularSlot, string>> } {
    const garments: Partial<Record<ModularSlot, string>> = {};
    for (const [slot, p] of this.garments) garments[slot] = p.id;
    return { bodyId: this.body?.def.id ?? null, hairId: this.hair?.id ?? null, garments };
  }

  /** Rendered triangles, draw calls and visible meshes (one pass, no shadows). */
  stats(): { triangles: number; drawCalls: number; meshes: number } {
    let triangles = 0, drawCalls = 0, meshes = 0;
    this.root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      triangles += (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
      drawCalls += Array.isArray(m.material) ? Math.max(1, m.material.length) : 1;
      meshes++;
    });
    return { triangles, drawCalls, meshes };
  }

  /** Bone by joint name of this character's skeleton (null before the body is built). */
  bone(name: string): THREE.Bone | null { return this.body?.bones.get(name) ?? null; }

  /** Standing height of the body in metres. */
  get height(): number { return this.body?.def.height ?? 1.8; }

  get posture(): Posture { return this.animator?.posture ?? 'standing'; }

  /** World position of the top of the head, following the animated Head bone. */
  headTop(target: THREE.Vector3): THREE.Vector3 {
    const head = this.body?.bones.get('Head');
    if (!head || !this.body) return target.copy(this.root.position).setY(this.root.position.y + this.height + 0.05);
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(target);
    target.y += this.body.crownAboveHead * this.root.scale.y;
    return target;
  }

  // ---- animation ----

  /** Plays a game animation; before the body exists the request waits and plays once it does. */
  play(id: AnimId, opts: { fade?: number; posture?: Posture } = {}): void {
    if (this.disposed) return;
    this.lastAnim = { id, opts };
    this.animator?.play(id, opts);
  }

  /** Walk-cycle speed factor from the ground speed (see Animator.setWalkRate); remembered across body rebuilds. */
  setWalkRate(rate: number): void {
    this.walkRate = rate;
    this.animator?.setWalkRate(rate);
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.animator?.update(Math.min(dt, 0.1));
  }

  // ---- lifetime ----

  /** Frees the character's own materials, skeletons and mixer, gives its cache references back and leaves the scene. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardownAll();
    this.root.removeFromParent();
  }

  // ---- apply ----

  private async applyNow(raw: ModularLook, category: OutfitCategory): Promise<void> {
    const resolved = resolveLook(raw, this.manifest);
    const look = resolved.look;
    const outfit = outfitFor(look, category);
    this.applyIssues = resolved.issues;
    const bodyDef = findBody(this.manifest, look.bodyId);
    if (!bodyDef) { this.look = look; this.issues = [...resolved.issues, `No body '${look.bodyId}' in the manifest.`]; return; }
    const bodyChanged = !this.body || this.body.def.id !== bodyDef.id;

    // what has to be equipped that is not already: key -> definition
    const wanted = new Map<PartKey, PartDef>();
    const hairDef = look.hairId ? findHair(this.manifest, look.hairId) : undefined;
    if (hairDef) wanted.set('hair', hairDef);
    for (const [slot, id] of Object.entries(outfit) as Array<[ModularSlot, string]>) {
      const g = findGarment(this.manifest, id);
      if (g) wanted.set(slot, g);
    }
    for (const key of [...this.rejected.keys()]) if (bodyChanged || wanted.get(key)?.id !== this.rejected.get(key)) { this.rejected.delete(key); this.rigIssues.delete(key); }
    const current = (key: PartKey) => (key === 'hair' ? this.hair : this.garments.get(key));
    const toLoad = [...wanted].filter(([key, def]) => (bodyChanged || current(key)?.id !== def.id) && this.rejected.get(key) !== def.id);

    // load (one reference per file we may end up owning)
    const acquired: string[] = [];
    const loadIssues: string[] = [];
    const grab = async (url: string): Promise<GLTFLike | null> => {
      try { const g = await this.cache.acquire(url); acquired.push(url); return g; } catch (e) { loadIssues.push(`Could not load ${url}: ${e instanceof Error ? e.message : String(e)}`); return null; }
    };
    const bodyUrl = this.cache.urlFor(bodyDef.file);
    const acquiredMasks: string[] = [];
    const grabMask = async (def: PartDef): Promise<{ url: string; file: CoverMaskFile } | null> => {
      const path = (def as GarmentDef).covers?.[bodyDef.id];
      if (!path) return null;
      const url = this.cache.urlFor(path);
      try { const file = await this.cache.acquireMask(url); acquiredMasks.push(url); return { url, file }; } catch (e) { loadIssues.push(`cover-mask-load: could not load ${url}: ${e instanceof Error ? e.message : String(e)}`); return null; }
    };
    const [bodyGltf, ...loaded] = await Promise.all([
      bodyChanged ? grab(bodyUrl) : Promise.resolve(null),
      ...toLoad.map(([, def]) => grab(this.cache.urlFor(def.files[bodyDef.id]!))),
      ...toLoad.map(([, def]) => grabMask(def)),
    ]) as [GLTFLike | null, ...Array<GLTFLike | { url: string; file: CoverMaskFile } | null>];
    const partGltfs = loaded.slice(0, toLoad.length) as Array<GLTFLike | null>;
    const partMasks = loaded.slice(toLoad.length) as Array<{ url: string; file: CoverMaskFile } | null>;
    const releaseUnused = (keep: Set<string>, keepMasks: Set<string> = new Set()) => {
      for (const u of acquired) if (!keep.has(u)) this.cache.release(u);
      for (const u of acquiredMasks) if (!keepMasks.has(u)) this.cache.releaseMask(u);
    };
    if (this.disposed) { releaseUnused(new Set()); return; }
    if (bodyChanged && !bodyGltf) { releaseUnused(new Set()); this.issues = [...resolved.issues, ...loadIssues]; return; }

    const kept = new Set<string>();
    const keptMasks = new Set<string>();
    if (bodyChanged) {
      this.teardownAll();
      this.buildBody(bodyDef, bodyUrl, bodyGltf!);
      kept.add(bodyUrl);
    }
    const body = this.body!;
    // unequip what is gone or changed, then equip (the old part of a slot always leaves first)
    const wantedId = (key: PartKey) => wanted.get(key)?.id;
    if (this.hair && this.hair.id !== wantedId('hair')) this.unequip('hair');
    for (const slot of [...this.garments.keys()]) if (this.garments.get(slot)!.id !== wantedId(slot)) this.unequip(slot);
    toLoad.forEach(([key, def], i) => {
      const gltf = partGltfs[i];
      if (!gltf) return;
      const url = this.cache.urlFor(def.files[bodyDef.id]!);
      if (current(key)) this.unequip(key);
      const res = this.buildPart(key, def, url, gltf, body);
      if (typeof res === 'string') { this.rejected.set(key, def.id); this.rigIssues.set(key, res); return; }
      this.rigIssues.delete(key);
      const m = partMasks[i];
      if (m) {
        const bits = this.decodeMask(m.file, body);
        if (typeof bits === 'string') loadIssues.push(`cover-mask-mismatch: '${def.id}' ${bits}`);
        else { res.mask = bits; res.maskUrl = m.url; keptMasks.add(m.url); }
      }
      if (key === 'hair') this.hair = res; else this.garments.set(key, res);
      kept.add(url);
    });
    releaseUnused(kept, keptMasks);

    this.look = look;
    this.refreshAppearance();
    this.issues = [...this.applyIssues, ...this.rigIssues.values(), ...loadIssues];
  }

  /** Decodes a cover mask against this body's meshes; a string says why it does not fit (no hiding is applied then). */
  private decodeMask(file: CoverMaskFile, body: BodyInstance): Map<string, Uint8Array> | string {
    const out = new Map<string, Uint8Array>();
    for (const [key, b64] of Object.entries(file.meshes)) {
      const m = body.masked.find((x) => x.key === key);
      const count = m?.hidden.count ?? -1;
      if (!m || file.vertexCounts[key] !== count) return `has a cover mask that does not match body mesh '${key}'; hiding skipped`;
      out.set(key, decodeBitset(b64, count));
    }
    return out;
  }

  /** Region visibility, colors and morphs from the current look and equipped parts (cheap and idempotent). */
  private refreshAppearance(): void {
    const body = this.body;
    if (!body) return;
    const hidden = new Set<BodyRegion>();
    for (const p of this.garments.values()) for (const r of (p.def as GarmentDef).hides) hidden.add(r);
    for (const r of BODY_REGIONS) { const n = body.regions.get(r); if (n) n.visible = !hidden.has(r); }
    // per-vertex hiding: own copy per character, OR over the worn garments' masks (whole hidden regions count as all ones)
    for (const m of body.masked) {
      const arr = m.hidden.array as Float32Array;
      arr.fill(m.region && hidden.has(m.region) ? 1 : 0);
      for (const p of this.garments.values()) {
        const bits = p.mask?.get(m.key);
        if (bits && bits.length === arr.length) for (let i = 0; i < arr.length; i++) if (bits[i]) arr[i] = 1;
      }
      m.hidden.needsUpdate = true;
      m.mesh.visible = !arr.every((v) => v === 1);
    }

    const skin = hexColor(this.look.colors.skin);
    const gain = body.def.skinGain ?? 1;
    for (const s of body.skin) (s.mat as THREE.MeshStandardMaterial).color?.copy(skin).multiplyScalar(s.tone * gain);
    for (const e of body.eyes) hexColor(this.look.colors.eyes, e.uniform.value);
    const hairColor = hexColor(this.look.colors.hair);
    for (const m of body.brows) (m as THREE.MeshStandardMaterial).color?.copy(hairColor);

    for (const p of this.garments.values()) {
      const g = p.def as GarmentDef;
      this.colorPart(p, g.colorRegions, (r) => this.look.colors.garments[g.id]?.[r.id] ?? r.default);
    }
    if (this.hair) this.colorPart(this.hair, this.hair.def.colorRegions, (r, i) => (i === 0 ? this.look.colors.hair : r.default));

    applyMorphInfluences(body.meshes, body.def.morphs, this.look.morphs);
    for (const p of this.garments.values()) applyMorphInfluences(p.meshes, body.def.morphs, this.look.morphs, (p.def as GarmentDef).followsMorphs ?? []);
  }

  private colorPart(p: PartInstance, regions: ColorRegionDef[], pick: (r: ColorRegionDef, i: number) => Hex): void {
    if (regions.length === 0) {
      // no declared regions: the whole part takes the first color we are asked for (hair color for hair)
      const c = hexColor(this.look.colors.hair);
      if (p.key === 'hair') for (const m of p.materials) (m as THREE.MeshStandardMaterial).color?.copy(c);
      return;
    }
    regions.forEach((r, i) => {
      const c = hexColor(pick(r, i));
      for (const m of p.materials) if (r.materials.includes(m.name)) (m as THREE.MeshStandardMaterial).color?.copy(c);
    });
  }

  // ---- building ----

  private buildBody(def: BodyPresetDef, url: string, gltf: GLTFLike): void {
    const scene = SkeletonUtils.clone(gltf.scene);
    scene.name = 'modular-body';
    const bones = new Map<string, THREE.Bone>();
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
    });
    // clone materials once per source material (the body's meshes keep sharing them, other characters do not)
    const cloned = new Map<THREE.Material, THREE.Material>();
    const own = (m: THREE.Material) => { let c = cloned.get(m); if (!c) { c = m.clone(); cloned.set(m, c); } return c; };
    for (const m of meshes) m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
    // one skeleton for the whole body instead of one per mesh (SkeletonUtils.clone makes one each)
    const skeletons: THREE.Skeleton[] = [];
    for (const m of meshes) {
      const same = skeletons.find((s) => sameBind(s, m.skeleton));
      if (same) { if (same !== m.skeleton) { m.skeleton.dispose(); m.bind(same, m.bindMatrix); } } else skeletons.push(m.skeleton);
    }
    const inverses = new Map<string, THREE.Matrix4>();
    const ref = skeletons[0];
    if (ref) ref.bones.forEach((b, i) => inverses.set(b.name, ref.boneInverses[i]!.clone()));
    const regions = new Map<BodyRegion, THREE.Object3D>();
    for (const r of BODY_REGIONS) { const n = scene.getObjectByName(`Body_${r}`); if (n) regions.set(r, n); }
    const skin: BodyInstance['skin'] = [];
    def.skinMaterials.forEach((name, i) => { for (const c of cloned.values()) if (c.name === name) skin.push({ mat: c, tone: i === 0 ? 1 : SKIN_JOINT_TONE }); });
    for (const m of meshes) m.frustumCulled = false;
    const masked: MaskedMesh[] = meshes.map((mesh) => {
      // mask keys are '<Body_region>/<primitive index>': the primitive's position among its group's skinned children
      let n: THREE.Object3D | null = mesh;
      while (n && !n.name.startsWith('Body_')) n = n.parent;
      const group = n?.name ?? mesh.name;
      const prims = n && n !== mesh ? n.children.filter((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) : [mesh];
      const key = `${group}/${Math.max(0, prims.indexOf(mesh))}`;
      const { geometry, hidden } = ownGeometry(mesh.geometry);
      mesh.geometry = geometry;
      const region = (BODY_REGIONS as readonly string[]).includes(group.slice(5)) ? (group.slice(5) as BodyRegion) : null;
      return { mesh, key, region, geometry, hidden };
    });
    for (const s of skin) patchCoverDiscard(s.mat);
    const eyes: BodyInstance['eyes'] = [];
    if (def.iris) {
      for (const name of def.eyeMaterials ?? []) {
        for (const c of cloned.values()) {
          if (c.name !== name || !(c as THREE.MeshStandardMaterial).map) continue;
          const uniform = { value: new THREE.Color() };
          patchIris(c, def.iris, uniform);
          eyes.push({ mat: c, uniform });
        }
      }
    }
    const brows: THREE.Material[] = [];
    for (const name of def.browMaterials ?? []) for (const c of cloned.values()) if (c.name === name) brows.push(c);
    this.root.add(scene);
    scene.updateMatrixWorld(true);
    const head = bones.get('Head');
    const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : def.height - 0.2;
    this.body = {
      def, rig: this.manifest.rigs.find((r) => r.id === def.rig) as RigProfile, url, scene, bones, inverses, regions, meshes, skeletons,
      materials: [...cloned.values()], skin, eyes, brows, masked, crownAboveHead: Math.max(0.1, def.height - headY),
    };
    // clips authored for another hip height get their position tracks scaled for this body (shared between characters)
    const pelvis = bones.get('pelvis');
    const ratio = pelvis ? hipRatio(pelvis.position.length(), this.body.rig?.clipPelvisHeight) : 1;
    this.animator = new Animator(this.root, ratio === 1 ? this.clips : scaledClipsFor(this.clips, ratio));
    this.animator.setWalkRate(this.walkRate);
    this.animator.play(this.lastAnim.id, { ...this.lastAnim.opts, fade: 0 });
  }

  /** A part bound to this character's bones, or the reason it was rejected ('rig-mismatch: ...'). */
  private buildPart(key: PartKey, def: PartDef, url: string, gltf: GLTFLike, body: BodyInstance): PartInstance | string {
    const label = `'${def.id}'`;
    if (def.rig !== body.def.rig) return `rig-mismatch: ${label} is made for rig '${def.rig}', the body uses '${body.def.rig}'`;
    const rig = body.rig ?? FALLBACK_RIG;
    const container = new THREE.Group();
    container.name = `part:${def.id}`;
    const cast = body.meshes[0]?.castShadow ?? false;
    const materials: THREE.Material[] = [];
    const meshes: THREE.Mesh[] = [];
    const skeletons: THREE.Skeleton[] = [];
    const ownMat = (m: THREE.Material) => { const c = m.clone(); materials.push(c); return c; };
    const sources: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) sources.push(o as THREE.Mesh); });
    const fail = (why: string) => { for (const m of materials) m.dispose(); for (const s of skeletons) s.dispose(); return `rig-mismatch: ${label} ${why}`; };

    if ('attachment' in def && def.attachment === 'head-bone') {
      const head = body.bones.get('Head');
      if (!head) return fail('needs a Head joint');
      for (const src of sources) {
        const mesh = new THREE.Mesh(src.geometry, Array.isArray(src.material) ? src.material.map(ownMat) : ownMat(src.material));
        mesh.name = src.name; mesh.frustumCulled = false; mesh.castShadow = cast;
        copyMorphNames(src, mesh);
        container.add(mesh); meshes.push(mesh);
      }
      if (def.offset) { container.position.fromArray(def.offset.position); container.rotation.set(...def.offset.rotation); }
      head.add(container);
      return { key, maskUrl: null, mask: null, id: def.id, url, def, container, meshes, skeletons, materials };
    }

    const skinned = sources.filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh[];
    if (skinned.length === 0) return fail('has no skinned meshes');
    const bound = new Map<THREE.Skeleton, THREE.Skeleton>();
    for (const src of skinned) {
      let sk = bound.get(src.skeleton);
      if (!sk) {
        const bad = checkBindFit(src.skeleton, body.inverses, rig);
        if (bad) return fail(bad);
        const bones = src.skeleton.bones.map((b) => body.bones.get(b.name)!);
        sk = new THREE.Skeleton(bones, src.skeleton.boneInverses.map((m) => m.clone()));
        bound.set(src.skeleton, sk);
        skeletons.push(sk);
      }
      const mesh = new THREE.SkinnedMesh(src.geometry, Array.isArray(src.material) ? src.material.map(ownMat) : ownMat(src.material));
      mesh.name = src.name; mesh.frustumCulled = false; mesh.castShadow = cast;
      copyMorphNames(src, mesh);
      mesh.bind(sk, src.bindMatrix);
      container.add(mesh); meshes.push(mesh);
    }
    body.scene.add(container);
    return { key, maskUrl: null, mask: null, id: def.id, url, def, container, meshes, skeletons, materials };
  }

  private unequip(key: PartKey): void {
    const p = key === 'hair' ? this.hair : this.garments.get(key);
    if (!p) return;
    if (key === 'hair') this.hair = null; else this.garments.delete(key);
    this.freePart(p);
  }

  private freePart(p: PartInstance): void {
    p.container.removeFromParent();
    for (const m of p.materials) m.dispose();
    for (const s of p.skeletons) s.dispose();
    if (p.maskUrl) this.cache.releaseMask(p.maskUrl);
    this.cache.release(p.url);
  }

  private teardownAll(): void {
    this.animator?.dispose();
    this.animator = null;
    if (this.hair) this.freePart(this.hair);
    this.hair = null;
    for (const p of this.garments.values()) this.freePart(p);
    this.garments.clear();
    this.rejected.clear();
    this.rigIssues.clear();
    const b = this.body;
    if (b) {
      b.scene.removeFromParent();
      for (const m of b.materials) m.dispose();
      for (const s of b.skeletons) s.dispose();
      for (const m of b.masked) m.geometry.dispose();
      this.cache.release(b.url);
    }
    this.body = null;
  }
}

type GLTFLike = { scene: THREE.Object3D };

function sameBind(a: THREE.Skeleton, b: THREE.Skeleton): boolean {
  if (a === b) return true;
  if (a.bones.length !== b.bones.length) return false;
  for (let i = 0; i < a.bones.length; i++) {
    if (a.bones[i] !== b.bones[i] || !a.boneInverses[i]!.equals(b.boneInverses[i]!)) return false;
  }
  return true;
}
