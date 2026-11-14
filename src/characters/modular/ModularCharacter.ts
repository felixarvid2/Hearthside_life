// A modular (GLB-part) character: one body GLB cloned per character (own skeleton), garments and hair as skinned meshes
// that share the part's geometry and are bound to THIS character's bones, plus an Animator. Feet at the origin, facing +z
// (the UAL rig of the shared clips). No game or UI coupling: the adapter in ModularCharacterView.ts does that.
//
// Ownership: geometry and textures belong to the ModularAssetCache (reference counted); skeletons, materials and the
// mixer belong to the character and are freed by unequip / dispose().

import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimId } from '../../core/anim';
import type { Hex, LifeStage, OutfitCategory, Posture } from '../../core/types';
import { Animator } from '../animation';
import { CRADLE_PAIRS, CURL_BONES, RECLINE_LEAN, STANCE_BONES, STOOP_BONES, applyCradle, applyCurl, applyStance, applyStoop, bindBones, stageLook } from '../stagePose';
import type { BindBone } from '../stagePose';
import type { ModularAssetCache } from './cache';
import { outfitFor, resolveLook } from './look';
import { hipRatio, scaledClipsFor } from './retarget';
import { StageRig, proportionsFor } from './stageProportions';
import type { StageFit } from './stageProportions';
import { findBody, findFacialHair, findGarment, findHair } from './manifest';
import { BODY_REGIONS, MODULAR_LOOK_VERSION } from './types';
import type { BodyPresetDef, BodyRegion, ColorRegionDef, CoverMaskFile, FacialHairDef, GarmentDef, HairstyleDef, ModularLook, ModularManifest, ModularSlot, RigProfile } from './types';

type PartDef = GarmentDef | HairstyleDef | FacialHairDef;
type PartKey = ModularSlot | 'hair' | 'facialHair';

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
  /**
   * The skin materials' own maps and the loose skin textures (BodyPresetDef.youngSkin / .skin) by URL: an entry once a
   * reference is asked for, its texture once it has loaded (a copy with the own map's settings).
   */
  youngSkin: { adult: Map<THREE.Material, THREE.Texture | null>; maps: Map<string, THREE.Texture | null> };
  /** Cloned eye materials with their iris tint uniform (kept so recoloring after compile works). */
  eyes: Array<{ mat: THREE.Material; uniform: { value: THREE.Color } }>;
  /** Cloned eyebrow materials (colored like the hair). */
  brows: THREE.Material[];
  masked: MaskedMesh[];
  /** Height of the crown above the Head bone at rest (head scale included). */
  crownAboveHead: number;
  /** Life-stage proportions on this body's skeleton. */
  stageRig: StageRig;
  /** Bind pose of the cradle arms. */
  cradleBind: Map<string, BindBone>;
  /** Pelvis length of the body at bind, for the clips' own hip ratio. */
  pelvisLength: number;
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

/**
 * Skin material colour = skin colour x factor (the neutral texture's gain). A light skin times the gain can pass 1 in one
 * channel (red first), and the clipped channel turns the tone golden; scaling the whole colour back keeps its hue.
 */
export function skinMaterialColor(skin: THREE.Color, factor: number, out: THREE.Color): THREE.Color {
  out.copy(skin).multiplyScalar(factor);
  const m = Math.max(out.r, out.g, out.b);
  if (m > 1) out.multiplyScalar(1 / m);
  return out;
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

const emptyLook = (): ModularLook => ({ v: MODULAR_LOOK_VERSION, bodyId: '', hairId: null, facialHairId: null, outfits: {}, colors: { skin: '#d9a98a', eyes: '#5b4636', hair: '#3a2a20', garments: {} }, morphs: {} });

export class ModularCharacter {
  readonly root = new THREE.Group();
  /** Problems of the latest apply: unknown or unfitting things that were dropped, parts rejected by the rig check, failed loads. */
  issues: string[] = [];
  /** Resolves when the latest `apply` has finished (and nothing newer is waiting). */
  ready: Promise<void> = Promise.resolve();

  private readonly clips = new Map<string, THREE.AnimationClip>();
  private body: BodyInstance | null = null;
  private hair: PartInstance | null = null;
  private facialHair: PartInstance | null = null;
  private readonly garments = new Map<ModularSlot, PartInstance>();
  private look: ModularLook = emptyLook();
  private animator: Animator | null = null;
  private walkRate = 1;
  private stage: LifeStage = 'adult';
  private fit: StageFit | null = null;
  private babyUpright = false;
  private cradleOn = false;
  private cradleWeight = 0;
  private stoopWeight = 0;
  private stanceWeight = 0;
  private reclineOn = false;
  private reclineWeight = 0;
  private curlWeight = 0;
  private readonly fxSaved = new Map<THREE.Bone, THREE.Quaternion>();
  private lastAnim: { id: AnimId; opts: { fade?: number; posture?: Posture } } = { id: 'idle', opts: { fade: 0 } };
  private chain: Promise<void> = Promise.resolve();
  private target: { look: ModularLook; category: OutfitCategory; stage: LifeStage } | null = null;
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
  apply(look: ModularLook, category: OutfitCategory = 'everyday', stage: LifeStage = this.target?.stage ?? this.stage): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const target = { look: structuredClone(look), category, stage };
    this.target = target;
    const run = this.chain.then(async () => {
      const t = this.target;
      if (!t || t === this.done || this.disposed) return;
      this.done = t;
      await this.applyNow(t.look, t.category, t.stage);
    });
    this.chain = run.catch((e) => { console.warn('[modular] apply failed', e); });
    this.ready = this.chain;
    return this.chain;
  }

  // ---- queries ----

  /** The look as applied (sanitized against the manifest): a structured clone, safe to store. */
  serialize(): ModularLook { return structuredClone(this.look); }

  /** What is on the character right now. */
  equipped(): { bodyId: string | null; hairId: string | null; facialHairId: string | null; garments: Partial<Record<ModularSlot, string>> } {
    const garments: Partial<Record<ModularSlot, string>> = {};
    for (const [slot, p] of this.garments) garments[slot] = p.id;
    return { bodyId: this.body?.def.id ?? null, hairId: this.hair?.id ?? null, facialHairId: this.facialHair?.id ?? null, garments };
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
  get height(): number { return (this.body?.def.height ?? 1.8) * this.root.scale.y; }

  get lifeStage(): LifeStage { return this.stage; }

  /** Size of the head relative to the figure (1 for adults). */
  get headScale(): number { return this.fit?.headScale ?? 1; }

  /** Rest hip height over the body's bind hip height with the stage's legs (1 for adults). */
  get stageHipRatio(): number { return this.fit?.hipRatio ?? 1; }

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
    this.playNow();
  }

  /** A baby only lies (crib, mat, arms); in previews and portraits it sits up. Everybody else plays what was asked. */
  private playNow(): void {
    const { id, opts } = this.lastAnim;
    if (this.stage === 'baby') this.animator?.play(this.babyUpright ? 'sitIdle' : 'sleep', { ...opts, posture: this.babyUpright ? 'seated' : 'lying' });
    else this.animator?.play(id, opts);
  }

  setBabyUpright(on: boolean): void {
    if (on === this.babyUpright) return;
    this.babyUpright = on;
    this.lastAnim = { id: this.lastAnim.id, opts: { ...this.lastAnim.opts, fade: 0 } };
    this.playNow();
  }
  get isBabyUpright(): boolean { return this.babyUpright; }
  setCarrying(on: boolean): void { this.cradleOn = on; }
  get carrying(): boolean { return this.cradleOn; }
  setRecline(on: boolean): void { this.reclineOn = on; }

  /** Walk-cycle speed factor from the ground speed (see Animator.setWalkRate); remembered across body rebuilds. */
  setWalkRate(rate: number): void {
    this.walkRate = rate;
    this.animator?.setWalkRate(rate);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const d = Math.min(dt, 0.1);
    // give the bones back what the clips wrote last time: the mixer skips a track whose value did not change
    for (const [bone, q] of this.fxSaved) bone.quaternion.copy(q);
    this.animator?.update(d);
    this.applyPoseFx(d);
  }

  /** Stoop (elders), recline, a lying baby's curl and the carrier's cradle arms, put on the bones after the clips (as CharacterView does). */
  private applyPoseFx(dt: number): void {
    const body = this.body, animator = this.animator;
    this.fxSaved.clear();
    if (!body || !animator) return;
    const bones = body.bones;
    const look = stageLook(this.stage);
    const needStoop = look.stoop > 0 || this.reclineOn || this.reclineWeight > 0, needCradle = this.cradleOn || this.cradleWeight > 0;
    const babyLying = this.stage === 'baby' && !this.babyUpright && !this.cradleOn && animator.posture === 'lying';
    const needCurl = babyLying || this.curlWeight > 0;
    const save = (names: Iterable<string>) => { for (const n of names) { const b = bones.get(n); if (b) this.fxSaved.set(b, b.quaternion.clone()); } };
    if (needStoop) save(STOOP_BONES);
    if (needCurl) save(CURL_BONES.map(([n]) => n));
    if (needCradle) save(Object.keys(CRADLE_PAIRS));
    const stance = look.stance ?? 0;
    if (stance && !this.cradleOn) save(STANCE_BONES);
    const ease = (v: number, target: number, rate: number) => v + Math.sign(target - v) * Math.min(Math.abs(target - v), dt * rate);
    const posture = animator.posture;
    this.stoopWeight = ease(this.stoopWeight, posture === 'standing' ? 1 : posture === 'seated' ? 0.4 : 0, 2.5);
    this.reclineWeight = ease(this.reclineWeight, this.reclineOn && posture === 'seated' ? 1 : 0, 1.6);
    if (look.stoop && this.stoopWeight > 0) applyStoop(bones, look.stoop * this.stoopWeight);
    if (this.reclineWeight > 0) applyStoop(bones, -RECLINE_LEAN * this.reclineWeight);
    this.curlWeight = ease(this.curlWeight, babyLying ? 1 : 0, 2);
    if (this.curlWeight > 0) applyCurl(bones, this.curlWeight);
    // the narrow stance is for standing still; a walk already sets the feet under the hips, so it only gets a little
    const moving = /walk|jog|run/i.test(animator.playing ?? '');
    this.stanceWeight = ease(this.stanceWeight, stance && !this.cradleOn && posture === 'standing' ? (moving ? 0.35 : 1) : 0, 3);
    if (stance && !this.cradleOn && this.stanceWeight > 0) applyStance(bones, stance * this.stanceWeight);
    this.cradleWeight = ease(this.cradleWeight, this.cradleOn ? 1 : 0, 4);
    if (this.cradleWeight > 0) applyCradle(bones, body.cradleBind, this.cradleWeight);
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

  private async applyNow(raw: ModularLook, category: OutfitCategory, stage: LifeStage): Promise<void> {
    const stageChanged = stage !== this.stage;
    this.stage = stage;
    const resolved = resolveLook(raw, this.manifest, stage);
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
    const facialDef = look.facialHairId ? findFacialHair(this.manifest, look.facialHairId) : undefined;
    if (facialDef) wanted.set('facialHair', facialDef);
    for (const [slot, id] of Object.entries(outfit) as Array<[ModularSlot, string]>) {
      const g = findGarment(this.manifest, id);
      if (g) wanted.set(slot, g);
    }
    for (const key of [...this.rejected.keys()]) if (bodyChanged || wanted.get(key)?.id !== this.rejected.get(key)) { this.rejected.delete(key); this.rigIssues.delete(key); }
    const current = (key: PartKey) => (key === 'hair' ? this.hair : key === 'facialHair' ? this.facialHair : this.garments.get(key));
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
    if (stageChanged && !bodyChanged) this.applyStage(body);
    // (refreshAppearance below applies the stage's weight bias)
    // unequip what is gone or changed, then equip (the old part of a slot always leaves first)
    const wantedId = (key: PartKey) => wanted.get(key)?.id;
    if (this.hair && this.hair.id !== wantedId('hair')) this.unequip('hair');
    if (this.facialHair && this.facialHair.id !== wantedId('facialHair')) this.unequip('facialHair');
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
      if (key === 'hair') this.hair = res; else if (key === 'facialHair') this.facialHair = res; else this.garments.set(key, res);
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
    for (const s of body.skin) {
      const c = (s.mat as THREE.MeshStandardMaterial).color;
      if (c) skinMaterialColor(skin, s.tone * gain, c);
    }
    this.refreshSkinMap(body);
    for (const e of body.eyes) hexColor(this.look.colors.eyes, e.uniform.value);
    const hairColor = hexColor(this.look.colors.hair);
    for (const m of body.brows) (m as THREE.MeshStandardMaterial).color?.copy(hairColor);

    for (const p of this.garments.values()) {
      const g = p.def as GarmentDef;
      this.colorPart(p, g.colorRegions, (r) => this.look.colors.garments[g.id]?.[r.id] ?? r.default);
    }
    if (this.hair) this.colorPart(this.hair, this.hair.def.colorRegions, (r, i) => (i === 0 ? this.look.colors.hair : r.default));
    // facial hair takes the hair colour like the hairstyle does
    if (this.facialHair) this.colorPart(this.facialHair, this.facialHair.def.colorRegions, (r, i) => (i === 0 ? this.look.colors.hair : r.default));

    // the stage rounds or slims the body a little on top of the look's own weight (clamped to the morph's range)
    // and it is drawn young: the `young` morph is the stage's alone (a look never stores it)
    const prof = proportionsFor(this.stage);
    const morphs: Record<string, number> = { ...this.look.morphs, weight: (this.look.morphs.weight ?? 0) + prof.weight };
    // stage morphs are never a look's to set (an old or random look may still name them)
    for (const mo of body.def.morphs) if (mo.group === 'stage') delete morphs[mo.id];
    morphs.young = prof.young;
    // a second build is its base body with its own build and face on; a child's body is the young morph's alone
    const y = Math.min(1, Math.max(0, prof.young));
    for (const sh of body.def.shape ?? []) morphs[sh.morph] = sh.value * (1 - y + y * sh.young);
    applyMorphInfluences(body.meshes, body.def.morphs, morphs);
    for (const p of this.garments.values()) applyMorphInfluences(p.meshes, body.def.morphs, morphs, (p.def as GarmentDef).followsMorphs ?? []);
    if (this.facialHair) applyMorphInfluences(this.facialHair.meshes, body.def.morphs, morphs, (this.facialHair.def as FacialHairDef).followsMorphs ?? []);
    // hair only follows what it has keys for (the stage's `young` face: forehead, cheeks and jaw move under it)
    if (this.hair) applyMorphInfluences(this.hair.meshes, body.def.morphs, morphs, (this.hair.def as HairstyleDef).followsMorphs ?? []);
    // under a hat the hair lies down (its own `hat` key, not a body morph)
    if (this.hair) {
      const flat = [...this.garments.values()].some((p) => (p.def as GarmentDef).flattensHair) ? 1 : 0;
      for (const mesh of this.hair.meshes) {
        const i = mesh.morphTargetDictionary?.hat;
        if (i !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[i] = flat;
      }
    }
  }

  /**
   * The skin texture of the stage: the child's for young stages (BodyPresetDef.youngSkin), else the body's own override
   * (`skin`, a second build's), else the map the body file came with. A loose texture is fetched on first need (shared
   * through the cache) and put on when it arrives; until then, and when it cannot be loaded, the file's map stays.
   */
  private refreshSkinMap(body: BodyInstance): void {
    const ys = body.youngSkin;
    const def = body.def;
    const path = def.youngSkin && proportionsFor(this.stage).young >= 0.75 ? def.youngSkin : def.skin ?? null;
    const url = path ? this.cache.urlFor(path) : null;
    if (url && !ys.maps.has(url)) {
      ys.maps.set(url, null);
      this.cache.acquireTexture(url).then((tex) => {
        if (this.body !== body || this.disposed) { this.cache.releaseTexture(url); return; }
        const ref = [...ys.adult.values()].find((t) => t) ?? null;
        const map = tex.clone();
        if (ref) { map.flipY = ref.flipY; map.colorSpace = ref.colorSpace; map.wrapS = ref.wrapS; map.wrapT = ref.wrapT; map.channel = ref.channel; map.anisotropy = ref.anisotropy; }
        map.needsUpdate = true;
        ys.maps.set(url, map);
        this.refreshSkinMap(body);
      }, () => { /* no texture: the file's map stays */ });
    }
    const loose = url ? ys.maps.get(url) ?? null : null;
    for (const s of body.skin) {
      const mat = s.mat as THREE.MeshStandardMaterial;
      const next = loose ?? ys.adult.get(s.mat) ?? null;
      if (mat.map !== next) { mat.map = next; mat.needsUpdate = true; }
    }
  }

  private colorPart(p: PartInstance, regions: ColorRegionDef[], pick: (r: ColorRegionDef, i: number) => Hex): void {
    if (regions.length === 0) {
      // no declared regions: the whole part takes the first color we are asked for (hair color for hair)
      const c = hexColor(this.look.colors.hair);
      if (p.key === 'hair' || p.key === 'facialHair') for (const m of p.materials) (m as THREE.MeshStandardMaterial).color?.copy(c);
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
    // bind data first: the cradle arms are aimed from it, and the stage proportions change the bones afterwards
    const saved = { p: this.root.position.clone(), q: this.root.quaternion.clone(), s: this.root.scale.clone() };
    this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.root.scale.setScalar(1);
    const cradleBind = bindBones(scene, CRADLE_PAIRS);
    this.root.position.copy(saved.p); this.root.quaternion.copy(saved.q); this.root.scale.copy(saved.s);
    const pelvis = bones.get('pelvis');
    this.body = {
      def, rig: this.manifest.rigs.find((r) => r.id === def.rig) as RigProfile, url, scene, bones, inverses, regions, meshes, skeletons,
      materials: [...cloned.values()], skin, eyes, brows, masked,
      youngSkin: { adult: new Map(skin.map((x) => [x.mat, (x.mat as THREE.MeshStandardMaterial).map ?? null])), maps: new Map() }, crownAboveHead: Math.max(0.1, def.height - headY),
      stageRig: new StageRig(bones, def.height), cradleBind, pelvisLength: pelvis ? pelvis.position.length() : 0,
    };
    this.stoopWeight = this.stanceWeight = this.cradleWeight = this.reclineWeight = this.curlWeight = 0;
    this.fxSaved.clear();
    this.applyStage(this.body);
  }

  /** Puts the life stage's proportions on the body, scales the figure and starts an animator whose clips fit the new hip height. */
  private applyStage(body: BodyInstance): void {
    this.fit = body.stageRig.apply(this.stage, body.def.proportions);
    this.root.scale.setScalar(this.fit.rootScale);
    body.crownAboveHead = this.fit.crownAboveHead;
    // clips authored for another hip height get their position tracks scaled for this body and stage (cached per source clip and ratio)
    const ratio = (body.pelvisLength ? hipRatio(body.pelvisLength, body.rig?.clipPelvisHeight) : 1) * this.fit.hipRatio;
    const clips = Math.abs(ratio - 1) < 1e-3 ? this.clips : scaledClipsFor(this.clips, ratio);
    this.animator?.dispose();
    this.animator = new Animator(this.root, clips, stageLook(this.stage).cadence);
    this.animator.setWalkRate(this.walkRate);
    this.playNow();
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
    const p = key === 'hair' ? this.hair : key === 'facialHair' ? this.facialHair : this.garments.get(key);
    if (!p) return;
    if (key === 'hair') this.hair = null; else if (key === 'facialHair') this.facialHair = null; else this.garments.delete(key);
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
    if (this.facialHair) this.freePart(this.facialHair);
    this.facialHair = null;
    for (const p of this.garments.values()) this.freePart(p);
    this.garments.clear();
    this.rejected.clear();
    this.rigIssues.clear();
    const b = this.body;
    if (b) {
      b.scene.removeFromParent();
      for (const m of b.materials) m.dispose();
      for (const [u, t] of b.youngSkin.maps) if (t) { t.dispose(); this.cache.releaseTexture(u); }
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
