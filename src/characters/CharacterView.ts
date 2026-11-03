// One rendered person: skeleton clone + shared skin geometry (body and head) + hair + garments + accessories,
// per-character materials, morph influences and an Animator. Feet at the origin, facing +z.
// Geometry is shared through the asset cache (per frame and style); materials, the skeleton and the mixer
// belong to the view and are freed by dispose().

import * as THREE from 'three';
import type { AnimId } from '../core/anim';
import type { Appearance, GarmentLayer, LifeStage, Outfit, Posture } from '../core/types';
import type { AccessoryDef, ContentDB, GarmentDef } from '../content/types';
import type { AiHairData } from './aiHair';
import { buildAiHair, isMeshHair, topOf } from './aiHair';
import type { AiHairAsset, CharacterAssets, FrameAssets } from './assets';
import { STAGE_HEIGHTS, cachedGeometry, cloneSkeleton, loadAiHair, requestStageBody, resolveBody, stageBodyOf } from './assets';
import { Animator } from './animation';
import { BODY_PARAM_IDS } from './bodyShape';
import type { Coverage, CutParams } from './clothing';
import { buildGarment, mergeCoverage } from './clothing';
import { toGeometry, triangleCount } from './geometry';
import { CROWN_Y, HEAD_OFFSET, HEAD_SCALE, HEAD_SCULPT_IDS } from './headShape';
import { PAINT_MORPH_IDS } from './meshyBody';
import { STRAND_IDS, buildHair } from './hair';
import { buildAccessory } from './accessories';
import { HAT_FIT, addHatFit } from './hatFit';
import type { ClothUniforms, HairUniforms, MeshySkinUniforms, MpfbEyeUniforms, MpfbSkinUniforms, MpfbUnderwearUniforms, SkinUniforms } from './materials';
import { FABRIC_FX, FABRIC_IDS, FABRIC_ROUGHNESS, PATTERN_IDS, createAiHairMaterial, createClothMaterial, createHairMaterial, createMeshySkinMaterial, createMpfbEyeMaterial, createMpfbHairlineMaterial, createMpfbIrisMaterial, createMpfbSkinMaterial, createMpfbUnderwearMaterial, createSkinMaterial, wrinkleMapForStage } from './materials';
import { mpfbFaceInfluences, mpfbInfluences } from './mpfbBody';
import type { BindBone } from './stagePose';
import { CRADLE, CRADLE_PAIRS, STOOP_BONES, applyCradle, applyStoop, bindBones, stageLook } from './stagePose';
import { resolveOutfit } from './outfits';
import { seatedPlacement } from './posture';
import { clamp } from './rig';

/**
 * The youngAdult is the adult body with a younger face: the face morphs added to the creator's sliders (rounder, softer, bigger eyes,
 * a shorter chin). Other stages have their own bodies, so their faces come from the body itself.
 */
const STAGE_FACE: Partial<Record<LifeStage, Record<string, number>>> = {
  youngAdult: { face_cheek_fullness: 0.3, face_eye_size: 0.22, face_length: -0.18, face_jaw_width: -0.12, face_chin_length: -0.18, face_nose_length: -0.1, face_lip_fullness: 0.1 },
};

const BROW_INDEX: Record<string, number> = { natural: 0, straight: 1, 'soft-arch': 2, 'high-arch': 3, thick: 4, thin: 5, bushy: 6, angled: 7 };

/** Surface of each accessory kind (rigid items; `double` for thin sheets such as brims and scarves). */
const ACCESSORY_LOOK: Partial<Record<AccessoryDef['kind'], { roughness: number; metalness: number; double: boolean }>> = {
  glasses: { roughness: 0.45, metalness: 0.1, double: false },
  earrings: { roughness: 0.3, metalness: 0.85, double: false },
  hat: { roughness: 0.92, metalness: 0, double: true },
  scarf: { roughness: 0.96, metalness: 0, double: true },
  necklace: { roughness: 0.3, metalness: 0.85, double: false },
  watch: { roughness: 0.4, metalness: 0.55, double: false },
  bracelet: { roughness: 0.35, metalness: 0.8, double: false },
};

/** Garment `build` keywords -> cloth shader codes (see ClothUniforms in materials.ts). */
const PLACKETS: Record<string, number> = { buttons: 1, zip: 2, short: 3, two: 4, double: 5 };
const POCKETS: Record<string, number> = { kangaroo: 1, chest: 2, denim: 3, cargo: 4, chino: 5, welt: 6 };
const DECORS: Record<string, number> = { cords: 1, quilt: 2, lapel: 3, wrap: 4, sash: 8 };

/** The primitives an MPFB body draws on top of its skin (per character: own materials, shared geometry). */
interface MpfbPartSlot { mesh: THREE.SkinnedMesh; material: THREE.MeshStandardMaterial }

interface GarmentSlot { mesh: THREE.SkinnedMesh; material: THREE.MeshStandardMaterial; uniforms: ClothUniforms; garmentId: string }

/** Shared garment geometry for a frame (built on first use). */
export function garmentGeometry(assets: CharacterAssets, frame: FrameAssets, def: GarmentDef): THREE.BufferGeometry {
  return cachedGeometry(assets, `garment:${frame.key}:${def.id}`, () => {
    const built = buildGarment(frame.template, def);
    const g = toGeometry(built.mesh, `garment-${frame.frame}-${def.id}`);
    g.userData.cuts = built.cuts;
    g.userData.coverage = built.coverage;
    return g;
  });
}

/** Shared hair (+ facial hair) geometry for a frame; null when there is nothing to draw. */
export function hairGeometry(assets: CharacterAssets, frame: FrameAssets, content: ContentDB, hairId: string | null, facialId: string | null): THREE.BufferGeometry | null {
  const hair = hairId ? content.hair[hairId] ?? null : null;
  const facialDef = facialId ? content.facialHair[facialId] ?? null : null;
  const facial = facialDef && facialDef.build.kind === 'shell' ? facialDef : null;
  if (!hair && !facial) return null;
  return cachedGeometry(assets, `hair:${frame.key}:${hair?.id ?? '-'}:${facial?.id ?? '-'}`, () => {
    const mesh = buildHair(frame.template, hair, facial);
    addHatFit(frame.template, mesh);
    const g = toGeometry(mesh, `hair-${hair?.id}-${facial?.id}`);
    let top = 0;
    for (let i = 1; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i] as number);
    g.userData.topY = top;
    return g;
  });
}

/** Shared geometry of an AI hairstyle for a frame (built on first use from the loaded GLB data). */
export function aiHairGeometry(assets: CharacterAssets, frame: FrameAssets, data: AiHairData): THREE.BufferGeometry {
  return cachedGeometry(assets, `aihair:${frame.key}:${data.id}`, () => {
    const mesh = buildAiHair(frame.template, data);
    addHatFit(frame.template, mesh);
    const g = toGeometry(mesh, `aihair-${frame.frame}-${data.id}`);
    g.userData.topY = topOf(mesh);
    return g;
  });
}

let ringShared: { geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial } | null = null;
/** Shared selection ring under the feet (one geometry and material for all characters). */
function selectionRing(): { geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial } {
  return (ringShared ??= {
    geometry: new THREE.RingGeometry(0.36, 0.44, 48),
    material: new THREE.MeshBasicMaterial({ color: '#ffcf6b', transparent: true, opacity: 0.85, depthWrite: false }),
  });
}

/** Shared accessory geometry for a frame. */
export function accessoryGeometry(assets: CharacterAssets, frame: FrameAssets, def: AccessoryDef): THREE.BufferGeometry {
  return cachedGeometry(assets, `acc:${frame.key}:${def.id}`, () => toGeometry(buildAccessory(frame.template, def), `acc-${def.id}`));
}

export class CharacterView {
  /** Add this to the scene; position/rotate it to place the person (feet at origin, facing +z). */
  readonly root = new THREE.Group();
  private frame!: FrameAssets;
  private skeleton!: THREE.Skeleton;
  private bones = new Map<string, THREE.Bone>();
  private skinMesh!: THREE.SkinnedMesh;
  private skinMat!: THREE.MeshStandardMaterial;
  private skinU!: SkinUniforms;
  /** MPFB bodies: eyes, brows, lashes and underwear next to the skin; `eyeU` and `underwearU` are their uniforms. */
  private mpfbParts: Partial<Record<'eyes' | 'iris' | 'brows' | 'lashes' | 'underwear', MpfbPartSlot>> = {};
  private eyeU: MpfbEyeUniforms | null = null;
  private underwearU: MpfbUnderwearUniforms | null = null;
  /** Influence of every morph target of the body, from the appearance's body sliders (applyAppearance). */
  private bodyInfluence: Record<string, number> = {};
  /** Face slider ids that the body's own face morphs cover (MPFB), so their displacement fields stay off. */
  private faceCovered: ReadonlySet<string> = new Set();
  private garments = new Map<GarmentLayer, GarmentSlot>();
  private accessories: Array<{ mesh: THREE.SkinnedMesh; material: THREE.MeshStandardMaterial }> = [];
  private hair: { mesh: THREE.SkinnedMesh; material: THREE.MeshStandardMaterial; uniforms: HairUniforms } | null = null;
  /** The generated hairstyle (aiHair.ts), when the chosen style is one and its GLB is loaded; facial hair stays in `hair`. */
  private aiHair: { mesh: THREE.SkinnedMesh; material: THREE.MeshStandardMaterial; uniforms: HairUniforms } | null = null;
  private animator!: Animator;
  /** Life stage: picks the body (a stage body when loaded, else the adult scaled to the stage's height), poses and face. */
  private stage: LifeStage;
  /** Uniform scale of the root that stands in for a stage body that is not loaded (1 for the adults and own bodies). */
  private bodyScale = 1;
  /** Whether the stage's own body is drawn (false: the adult rig scaled, or the adult stages). */
  private ownBody = false;
  /** Bind data of the arms for the cradle hold, and how far the hold is blended in (0..1, eased toward `cradleOn`). */
  private cradleBind: Map<string, BindBone> | null = null;
  /** What the clips wrote to the bones the pose effects turn (restored before the next sampling). */
  private fxSaved = new Map<THREE.Bone, THREE.Quaternion>();
  private babyUpright = false;
  private cradleOn = false;
  private cradleWeight = 0;
  /** How far the stoop is blended in (the posture decides the target). */
  private stoopWeight = 0;
  private appearance: Appearance;
  private outfit: Outfit;
  private selected = false;
  private hairClear = 0;
  /** 0..1: how far the hair is squeezed down onto the skull under a hat (the 'hatFit' morph). */
  private hatFit = 0;
  private disposed = false;
  private ring: THREE.Mesh | null = null;
  private lastAnim: { id: AnimId; posture?: Posture } = { id: 'idle' };
  /** Problems found while resolving the outfit (unknown ids etc.). */
  issues: string[] = [];

  constructor(private assets: CharacterAssets, private content: ContentDB, appearance: Appearance, outfit: Outfit, lifeStage: LifeStage = 'adult') {
    this.appearance = structuredClone(appearance);
    this.outfit = structuredClone(outfit);
    this.stage = lifeStage;
    this.root.name = 'character';
    this.buildRig();
    this.applyAppearance();
    this.applyOutfit();
    this.play('idle', { fade: 0 });
    this.loadStageBody();
  }

  // ---- public API ----

  /** `lifeStage` is the person's life stage (the stage body, poses and face follow it); omitted: unchanged. */
  setAppearance(a: Appearance, lifeStage: LifeStage = this.stage): void {
    const body = resolveBody(this.assets, a.frame, lifeStage);
    const frameChanged = a.frame !== this.appearance.frame || body.fa !== this.frame || body.scale !== this.bodyScale || lifeStage !== this.stage;
    this.appearance = structuredClone(a);
    this.stage = lifeStage;
    if (frameChanged) {
      this.teardownRig();
      this.buildRig();
      this.applyOutfit();
      this.play(this.lastAnim.id, { fade: 0, posture: this.lastAnim.posture });
    }
    this.applyAppearance();
    if (frameChanged) this.loadStageBody();
  }

  get lifeStage(): LifeStage { return this.stage; }

  /** Whether this person is drawn with the body of their life stage (false: the adult body, scaled to the stage's height for a child). */
  get hasOwnBody(): boolean { return this.ownBody || stageBodyOf(this.stage) === null; }

  /** Rebuilds the person on the assets' current character style (after setCharacterStyle) or with a stage body that has just loaded. */
  refreshStyle(): void {
    if (this.disposed) return;
    const body = resolveBody(this.assets, this.appearance.frame, this.stage);
    if (body.fa === this.frame && body.scale === this.bodyScale) return;
    this.setAppearance(this.appearance);
  }

  /** The first person of a life stage starts the download of its body; the view is rebuilt with it when it arrives. */
  private loadStageBody(): void {
    if (this.ownBody || stageBodyOf(this.stage) === null || this.assets.style !== 'mpfb') return;
    const stage = this.stage;
    void requestStageBody(this.assets, stage).then((set) => { if (set && !this.disposed && this.stage === stage) this.refreshStyle(); });
  }

  /** Cradle the arms for holding a baby (the carrier's side of a held baby; blended in and out). */
  setCarrying(on: boolean): void { this.cradleOn = on; }
  get carrying(): boolean { return this.cradleOn; }

  /** World position of the middle of a baby cradled in this person's arms (the baby's yaw is this root's yaw plus `CRADLE.yaw`). */
  cradlePoint(target: THREE.Vector3): THREE.Vector3 {
    const k = STAGE_HEIGHTS[this.stage] / 1.8;
    this.root.updateWorldMatrix(true, false);
    return target.set(CRADLE.x * k, CRADLE.y * k, CRADLE.z * k).applyMatrix4(this.root.matrixWorld);
  }

  /** How high the bind pelvis sits compared with the adult skeleton (0.918 m up the root): about 1 for adults, less for a stage body. */
  get pelvisRatio(): number { return (this.frame.rootBone.getObjectByName('pelvis')?.position.length() ?? 0.918) / 0.918; }

  /** Standing height of this person's life stage in metres (STAGE_HEIGHTS). */
  get stageHeight(): number { return STAGE_HEIGHTS[this.stage]; }

  setOutfit(o: Outfit): void {
    this.outfit = structuredClone(o);
    this.applyOutfit();
  }

  /** Plays a game animation. `posture` selects seated/lying variants (inferred from the last animation otherwise). */
  play(anim: AnimId, opts: { fade?: number; posture?: Posture } = {}): void {
    if (this.disposed) return;
    this.lastAnim = { id: anim, posture: opts.posture };
    // a baby only lies (in a crib, on a mat, in somebody's arms); in the creator and portraits it sits up
    if (this.stage === 'baby') this.animator.play(this.babyUpright ? 'sitIdle' : 'sleep', { ...opts, posture: this.babyUpright ? 'seated' : 'lying' });
    else this.animator.play(anim, opts);
  }

  /** A baby sits up instead of lying (previews and portraits). The caller lowers the root by `floorDrop`. */
  setBabyUpright(on: boolean): void {
    if (on === this.babyUpright) return;
    this.babyUpright = on;
    this.play(this.lastAnim.id, { fade: 0, posture: this.lastAnim.posture });
  }

  /** How far the root must be lowered so the sitting baby's bottom rests on the floor (0 for everybody else). */
  get floorDrop(): number {
    if (this.stage !== 'baby' || !this.babyUpright) return 0;
    return -seatedPlacement({ x: 0, y: 0, z: 0 }, 0, this.appearance.frame, this.assets.style, { stage: 'baby', own: this.ownBody }).y;
  }

  update(dtSeconds: number): void {
    if (this.disposed) return;
    const dt = Math.min(dtSeconds, 0.1);
    // give the bones back what the clips wrote last time: the mixer skips a track whose value did not change, so a bone that was
    // turned for the stoop or the cradle would otherwise be turned again every frame
    for (const [bone, q] of this.fxSaved) bone.quaternion.copy(q);
    this.animator.update(dt);
    this.applyPoseFx(dt);
  }

  /** The stage's stoop (upright only) and the cradle hold, put on the skeleton after the clips were sampled. */
  private applyPoseFx(dt: number): void {
    const look = stageLook(this.stage);
    this.fxSaved.clear();
    const needStoop = look.stoop > 0, needCradle = this.cradleOn || this.cradleWeight > 0;
    if (needStoop) for (const n of STOOP_BONES) { const b = this.bones.get(n); if (b) this.fxSaved.set(b, b.quaternion.clone()); }
    if (needCradle) for (const n of Object.keys(CRADLE_PAIRS)) { const b = this.bones.get(n); if (b) this.fxSaved.set(b, b.quaternion.clone()); }
    const ease = (v: number, target: number, rate: number) => v + Math.sign(target - v) * Math.min(Math.abs(target - v), dt * rate);
    const posture = this.animator.posture;
    this.stoopWeight = ease(this.stoopWeight, posture === 'standing' ? 1 : posture === 'seated' ? 0.4 : 0, 2.5);
    if (look.stoop && this.stoopWeight > 0) applyStoop(this.bones, look.stoop * this.stoopWeight);
    this.cradleWeight = ease(this.cradleWeight, this.cradleOn ? 1 : 0, 4);
    if (this.cradleWeight > 0) {
      this.cradleBind ??= bindBones(this.frame.rootBone, CRADLE_PAIRS);
      applyCradle(this.bones, this.cradleBind, this.cradleWeight);
    }
  }

  /** World position of the top of the head (hair included), following the animated Head bone. */
  headTop(target: THREE.Vector3): THREE.Vector3 {
    const head = this.bones.get('Head');
    const hi = this.frame.boneNames.indexOf('Head');
    if (!head || hi < 0) return target.copy(this.root.position).setY(this.root.position.y + STAGE_HEIGHTS[this.stage] + 0.1);
    head.updateWorldMatrix(true, false);
    const O = this.frame.template.headOrigin;
    const hairTop = Math.max((this.hair?.mesh.geometry.userData.topY as number | undefined) ?? 0, (this.aiHair?.mesh.geometry.userData.topY as number | undefined) ?? 0);
    const crownY = Math.max((this.frame.meshy ?? this.frame.mpfb)?.extras.head.crownY ?? O[1] + HEAD_OFFSET[1] + CROWN_Y * HEAD_SCALE, hairTop);
    return target.set(O[0], crownY, O[2]).applyMatrix4(this.frame.boneInverses[hi]!).applyMatrix4(head.matrixWorld);
  }

  setSelected(on: boolean): void {
    this.selected = on;
    if (on && !this.ring) {
      this.ring = new THREE.Mesh(selectionRing().geometry, selectionRing().material);
      this.ring.name = 'selection';
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.012;
      this.ring.renderOrder = 1;
    }
    if (this.ring) { if (on) this.root.add(this.ring); else this.ring.removeFromParent(); }
    this.skinU.uSelect.value = on ? 1 : 0;
    for (const s of this.garments.values()) s.uniforms.uSelect.value = on ? 1 : 0;
    if (this.hair) this.hair.uniforms.uSelect.value = on ? 1 : 0;
    if (this.aiHair) this.aiHair.uniforms.uSelect.value = on ? 1 : 0;
  }

  /** Frees per-character resources (materials, mixer); shared geometry stays in the assets cache. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardownRig();
    this.root.removeFromParent();
  }

  /** Current posture as tracked by the animator. */
  get posture(): Posture { return this.animator.posture; }

  /** Rendered triangles and draw calls of this character (one pass, no shadows). */
  stats(): { triangles: number; drawCalls: number } {
    let triangles = 0, drawCalls = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible) { triangles += triangleCount(m.geometry); drawCalls++; }
    });
    return { triangles, drawCalls };
  }

  // ---- internals ----

  private buildRig(): void {
    const body = resolveBody(this.assets, this.appearance.frame, this.stage);
    this.frame = body.fa;
    this.bodyScale = body.scale;
    this.ownBody = body.own;
    this.root.scale.setScalar(body.scale);
    this.stoopWeight = 0;
    this.cradleWeight = 0;
    this.cradleBind = null;
    this.fxSaved.clear();
    const { root, skeleton, byName } = cloneSkeleton(this.frame);
    this.skeleton = skeleton;
    this.bones = byName;
    this.root.add(root);
    const meshy = this.frame.meshy;
    const mpfb = this.frame.mpfb;
    const { material, uniforms } = mpfb
      ? createMpfbSkinMaterial(wrinkleMapForStage(this.stage, this.frame.skinGeometry))
      : meshy ? createMeshySkinMaterial() : createSkinMaterial();
    if (mpfb) {
      const mu = uniforms as MpfbSkinUniforms;
      mu.uAlbedo.value = mpfb.skinMap;
      mu.uSkinMean.value.fromArray(mpfb.extras.skinMean);
    } else if (meshy) {
      const mu = uniforms as MeshySkinUniforms;
      mu.uAlbedo.value = meshy.albedo;
      mu.uMask.value = meshy.mask;
      mu.uSkinMean.value.fromArray(meshy.extras.skinMean);
      mu.uClothLum.value.fromArray(meshy.extras.clothLum);
      mu.uSplitY.value = meshy.extras.splitY;
    }
    this.skinMat = material;
    this.skinU = uniforms;
    this.skinMesh = this.skinned(this.frame.skinGeometry, material, 'skin');
    if (mpfb) this.buildMpfbParts(mpfb);
    this.animator = new Animator(this.root, body.clips, stageLook(this.stage).cadence);
    this.skinU.uSelect.value = this.selected ? 1 : 0;
  }

  /** Eyes, brows, lashes and underwear of an MPFB body: shared geometry, own materials, the skeleton of this person. */
  private buildMpfbParts(mpfb: NonNullable<FrameAssets['mpfb']>): void {
    const add = (kind: keyof typeof this.mpfbParts, material: THREE.MeshStandardMaterial) => {
      const geometry = mpfb.parts[kind];
      if (!geometry) { material.dispose(); return; }
      const mesh = this.skinned(geometry, material, kind);
      mesh.castShadow = kind === 'underwear';
      this.mpfbParts[kind] = { mesh, material };
    };
    const underwear = createMpfbUnderwearMaterial(mpfb.underwear);
    this.underwearU = underwear.uniforms;
    add('underwear', underwear.material);
    if (mpfb.maps.eyes) {
      // files with an iris primitive: plain sclera here and the eye colour on the iris; older ones paint the iris into the eye texture
      if (mpfb.parts.iris) add('eyes', new THREE.MeshStandardMaterial({ map: mpfb.maps.eyes, roughness: 0.15, metalness: 0 }));
      else {
        const eyes = createMpfbEyeMaterial(mpfb.maps.eyes);
        this.eyeU = eyes.uniforms;
        add('eyes', eyes.material);
      }
    }
    if (mpfb.maps.iris) add('iris', createMpfbIrisMaterial(mpfb.maps.iris));
    if (mpfb.maps.brows) add('brows', createMpfbHairlineMaterial(mpfb.maps.brows));
    if (mpfb.maps.lashes) add('lashes', createMpfbHairlineMaterial(mpfb.maps.lashes));
    for (const slot of Object.values(this.mpfbParts)) slot.mesh.renderOrder = slot.material.transparent ? 2 : 0;
  }

  private teardownRig(): void {
    this.animator?.dispose();
    for (const p of Object.values(this.mpfbParts)) p.material.dispose();
    this.mpfbParts = {};
    this.eyeU = null;
    this.underwearU = null;
    for (const s of this.garments.values()) s.material.dispose();
    this.garments.clear();
    this.hair?.material.dispose();
    this.hair = null;
    this.aiHair?.material.dispose();
    this.aiHair = null;
    for (const a of this.accessories) a.material.dispose();
    this.accessories = [];
    for (const child of [...this.root.children]) if (child !== this.ring) child.removeFromParent();
    this.skinMat?.dispose();
  }

  private skinned(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.SkinnedMesh {
    const m = new THREE.SkinnedMesh(geometry, material);
    m.name = name;
    m.bind(this.skeleton, new THREE.Matrix4());
    m.boundingSphere = geometry.boundingSphere!.clone();
    m.castShadow = true;
    m.receiveShadow = false;
    this.root.add(m);
    return m;
  }

  private applyMorphs(mesh: THREE.Mesh): void {
    const dict = mesh.morphTargetDictionary;
    const infl = mesh.morphTargetInfluences;
    if (!dict || !infl) return;
    const face = this.appearance.face.params;
    for (const [id, v] of Object.entries(this.bodyInfluence)) { const i = dict[id]; if (i !== undefined) infl[i] = v; }
    // face sliders the MPFB body has its own morph for (this.bodyInfluence holds it) leave the displacement field off
    for (const id of HEAD_SCULPT_IDS) { const i = dict[id]; if (i !== undefined) infl[i] = this.faceCovered.has(id) ? 0 : clamp(face[id] ?? 0, -1, 1); }
    for (const id of PAINT_MORPH_IDS) { const i = dict[id]; if (i !== undefined) infl[i] = this.faceCovered.has(id) ? 0 : clamp(face[id] ?? 0, -1, 1); }
    const hc = dict.hairClear;
    if (hc !== undefined) infl[hc] = this.hairClear;
    const hf = dict[HAT_FIT];
    if (hf !== undefined) infl[hf] = this.hatFit;
  }

  private applyAppearance(): void {
    const a = this.appearance;
    this.skinMat.color.set(a.skin);
    const u = this.skinU;
    const fp = a.face.params;
    const p = (k: string) => clamp(fp[k] ?? 0, -1, 1);
    u.uEyeColor.value.set(a.face.eyeColor);
    u.uBrowColor.value.set(a.face.browColor);
    u.uLipColor.value.set(a.face.lipColor);
    u.uHairColor.value.set(a.hair.color);
    u.uEye.value.set(p('eyeSize'), p('eyeSpacing'), p('eyeTilt'), p('eyeHeight'));
    u.uBrow.value.set(p('browHeight'), p('browTilt'), BROW_INDEX[a.face.browStyle] ?? 0, 0);
    u.uMouth.value.set(p('mouthWidth'), p('lipFullness'), clamp(a.face.lipTint, 0, 1), 0);
    const stubble = a.hair.facialHairId === 'stubble' ? 1 : a.hair.facialHairId ? 0.5 : 0;
    u.uSkinFx.value.set(clamp(a.face.freckles, 0, 1), clamp(a.face.blush, 0, 1), stubble, 0);
    const mpfb = this.frame.mpfb;
    if (mpfb) {
      const names = new Set(mpfb.morphNames);
      const face = mpfbFaceInfluences(a.face.params, (n) => names.has(n));
      const influences = { ...face.influences };
      for (const [morph, v] of Object.entries(STAGE_FACE[this.stage] ?? {})) if (names.has(morph)) influences[morph] = clamp((influences[morph] ?? 0) + v, -1, 1);
      this.bodyInfluence = { ...mpfbInfluences(a.body, mpfb.sex, (n) => names.has(n)), ...influences };
      this.faceCovered = face.covered;
      if (this.eyeU) this.eyeU.uEyeColor.value.set(a.face.eyeColor);
      this.mpfbParts.iris?.material.color.set(a.face.eyeColor);
      const brows = this.mpfbParts.brows?.material, lashes = this.mpfbParts.lashes?.material;
      brows?.color.set(a.face.browColor);
      lashes?.color.set(a.face.browColor).multiplyScalar(0.55);
    } else {
      this.bodyInfluence = {};
      this.faceCovered = new Set();
      for (const id of BODY_PARAM_IDS) this.bodyInfluence[id] = clamp(a.body[id] ?? 0, -1, 1);
    }
    this.applyMorphs(this.skinMesh);
    for (const p of Object.values(this.mpfbParts)) this.applyMorphs(p.mesh);
    for (const s of this.garments.values()) this.applyMorphs(s.mesh);
    for (const acc of this.accessories) this.applyMorphs(acc.mesh);
    this.applyHair();
  }

  private applyHair(): void {
    const a = this.appearance;
    const def = this.content.hair[a.hair.styleId];
    // a generated hairstyle draws its own mesh once its GLB is loaded; until then (or when it cannot load) the procedural
    // parameters in its `build` stand in
    let ai: AiHairAsset | undefined;
    if (def && isMeshHair(def)) {
      ai = this.assets.aiHair?.get(def.id);
      if (!ai) {
        const id = def.id;
        void loadAiHair(this.assets, id, def.build.asset as string).then((r) => { if (r && !this.disposed && this.appearance.hair.styleId === id) this.applyHair(); });
      }
    }
    this.applyProceduralHair(ai ? null : a.hair.styleId);
    this.applyGeneratedHair(ai ?? null);
  }

  private applyGeneratedHair(asset: AiHairAsset | null): void {
    if (!asset) {
      if (this.aiHair) { this.aiHair.mesh.removeFromParent(); this.aiHair.material.dispose(); this.aiHair = null; }
      return;
    }
    const a = this.appearance;
    const geometry = aiHairGeometry(this.assets, this.frame, asset.data);
    if (!this.aiHair) {
      const { material, uniforms } = createAiHairMaterial(asset.map);
      this.aiHair = { mesh: this.skinned(geometry, material, 'hair-mesh'), material, uniforms };
    } else {
      if (this.aiHair.mesh.geometry !== geometry) { this.aiHair.mesh.geometry = geometry; this.aiHair.mesh.updateMorphTargets(); }
      this.aiHair.material.map = asset.map;
    }
    this.aiHair.material.color.set(a.hair.color);
    const hl = a.hair.highlight;
    if (hl) { const c = new THREE.Color(hl); this.aiHair.uniforms.uHighlight.value.set(c.r, c.g, c.b, 1); }
    else this.aiHair.uniforms.uHighlight.value.set(0, 0, 0, 0);
    this.aiHair.uniforms.uSelect.value = this.selected ? 1 : 0;
    this.applyMorphs(this.aiHair.mesh);
  }

  /** The procedural hair mesh: a procedural style (with facial hair) or only the facial hair when `styleId` is null. */
  private applyProceduralHair(styleId: string | null): void {
    const a = this.appearance;
    const geometry = hairGeometry(this.assets, this.frame, this.content, styleId, a.hair.facialHairId);
    if (!geometry) {
      if (this.hair) { this.hair.mesh.removeFromParent(); this.hair.material.dispose(); this.hair = null; }
      return;
    }
    if (!this.hair) {
      const { material, uniforms } = createHairMaterial();
      this.hair = { mesh: this.skinned(geometry, material, 'hair'), material, uniforms };
    } else if (this.hair.mesh.geometry !== geometry) {
      this.hair.mesh.geometry = geometry;
      this.hair.mesh.updateMorphTargets();
    }
    const def = styleId ? this.content.hair[styleId] : undefined;
    const strand = typeof def?.build.strand === 'string' ? def.build.strand : 'straight';
    this.hair.material.color.set(a.hair.color);
    this.hair.uniforms.uStrand.value = STRAND_IDS[strand] ?? 0;
    const hl = a.hair.highlight;
    if (hl) { const c = new THREE.Color(hl); this.hair.uniforms.uHighlight.value.set(c.r, c.g, c.b, 1); }
    else this.hair.uniforms.uHighlight.value.set(0, 0, 0, 0);
    this.hair.uniforms.uSelect.value = this.selected ? 1 : 0;
    this.applyMorphs(this.hair.mesh);
  }

  private applyOutfit(): void {
    const resolved = resolveOutfit(this.outfit, this.content);
    this.issues = resolved.issues;
    const used = new Set<GarmentLayer>();
    const coverage: Coverage[] = [];
    const lm = this.frame.template.lm;
    for (const { layer, choice, def } of resolved.layers) {
      used.add(layer);
      const geometry = garmentGeometry(this.assets, this.frame, def);
      let slot = this.garments.get(layer);
      if (!slot) {
        const { material, uniforms } = createClothMaterial();
        slot = { mesh: this.skinned(geometry, material, `garment-${layer}`), material, uniforms, garmentId: def.id };
        this.garments.set(layer, slot);
      } else if (slot.mesh.geometry !== geometry) {
        slot.mesh.geometry = geometry;
        slot.mesh.updateMorphTargets();
      }
      slot.garmentId = def.id;
      coverage.push(geometry.userData.coverage as Coverage);
      const b = def.build;
      const u = slot.uniforms;
      const fabric = typeof b.fabric === 'string' ? b.fabric : 'cotton';
      // outer layers win depth ties with the layers below them
      const order = layer === 'outer' ? 3 : layer === 'top' || layer === 'full' ? 2 : layer === 'bottom' ? 1 : 0;
      slot.material.polygonOffset = order > 0;
      slot.material.polygonOffsetFactor = -order;
      slot.material.polygonOffsetUnits = -2 * order;
      slot.material.color.set(choice.color);
      slot.material.roughness = FABRIC_ROUGHNESS[fabric] ?? 0.88;
      u.uPatColor.value.set(choice.patternColor);
      u.uAltColor.value.set(typeof b.soleColor === 'string' ? b.soleColor : typeof b.shirtColor === 'string' ? b.shirtColor : '#ffffff');
      u.uPattern.value = PATTERN_IDS[choice.pattern] ?? 0;
      u.uFabric.value = FABRIC_IDS[fabric] ?? 0;
      const fx = FABRIC_FX[fabric] ?? FABRIC_FX.cotton!;
      u.uFx.value.set(fx.bump, fx.fold, fx.sheen, fx.fuzz);
      const style = typeof b.style === 'string' ? b.style : '';
      const details = def.layer === 'shoes' && style === 'runner' ? 6 : def.layer === 'shoes' && style === 'pump' ? 7 : def.layer === 'shoes' && style === 'flat' ? 8
        : b.details === 'jeans' ? 1 : b.details === 'crease' ? 2 : b.details === 'jacket' ? 9 : b.sideStripe ? 3 : b.laces || b.toeCap ? 4 : b.strap === true ? 5 : 0;
      const placket = PLACKETS[b.placket as string] ?? 0;
      u.uFlags.value.set(details, placket, b.rib ? 1 : 0, b.piping ? 1 : 0);
      u.uFlags2.value.set(b.hemBand ? 1 : 0, b.belt ? 1 : 0, b.cuff ? 1 : 0, b.waistBand ? 1 : 0);
      u.uFlags3.value.set(POCKETS[b.pocket as string] ?? 0, DECORS[b.decor as string] ?? 0, typeof b.neckBand === 'number' ? b.neckBand : 0, b.tie ? 1 : 0);
      const cuts = geometry.userData.cuts as CutParams;
      u.uCutNeck.value.fromArray(cuts.neck);
      u.uCutArm.value.fromArray(cuts.arm);
      u.uCutMisc.value.fromArray(cuts.misc);
      u.uHem.value.fromArray(cuts.hem);
      u.uInner.value.fromArray(cuts.inner);
      u.uBody.value.set(lm.crotchY, lm.chestY, lm.neckBaseY, lm.footX);
      u.uSelect.value = this.selected ? 1 : 0;
      this.applyMorphs(slot.mesh);
    }
    for (const [layer, slot] of [...this.garments]) {
      if (used.has(layer)) continue;
      slot.mesh.removeFromParent();
      slot.material.dispose();
      this.garments.delete(layer);
    }
    // accessories (head-attached)
    for (const a of this.accessories) { a.mesh.removeFromParent(); a.material.dispose(); }
    this.accessories = [];
    let fit = 0;
    for (const { def, color } of resolved.accessories) {
      const look = ACCESSORY_LOOK[def.kind];
      if (!look) { this.issues.push(`${def.name} is not drawn yet.`); continue; }
      const pearls = def.build.style === 'pearls';
      const material = new THREE.MeshStandardMaterial({
        color, roughness: pearls ? 0.25 : look.roughness, metalness: pearls ? 0.1 : look.metalness, vertexColors: true, side: look.double ? THREE.DoubleSide : THREE.FrontSide,
      });
      const mesh = this.skinned(accessoryGeometry(this.assets, this.frame, def), material, `acc-${def.id}`);
      mesh.castShadow = false;
      this.accessories.push({ mesh, material });
      if (def.kind === 'hat') fit = Math.max(fit, typeof def.build.fit === 'number' ? def.build.fit : 1);
    }
    this.hatFit = fit;
    for (const a of this.accessories) this.applyMorphs(a.mesh);
    // bulky upper layers push long hair away from the back (hair 'hairClear' morph)
    let clear = 0;
    for (const { layer, def } of resolved.layers) {
      const th = typeof def.build.thickness === 'number' ? def.build.thickness : layer === 'outer' ? 0.019 : 0.011;
      if (layer === 'outer' || layer === 'top' || layer === 'full') clear = Math.max(clear, clamp((th - 0.008) / 0.012, 0, 1) + (layer === 'outer' ? 0.25 : 0));
    }
    this.hairClear = clamp(clear, 0, 1);
    if (this.hair) this.applyMorphs(this.hair.mesh);
    if (this.aiHair) this.applyMorphs(this.aiHair.mesh);
    const cov = mergeCoverage(coverage);
    const t = cov.torso;
    this.skinU.uCoverTorso.value.set(t?.yMin ?? 0, t?.yMaxBack ?? 0, t?.yMaxFront ?? 0, t ? 1 : 0);
    this.skinU.uCoverLimbs.value.set(cov.armMaxX, cov.legMinY, cov.footMaxY, 0.03);
    // Meshy bodies: the baked tank top / shorts read as underwear unless a garment of that half is worn
    const base = (this.skinU as Partial<MeshySkinUniforms>).uBase;
    if (base) {
      const worn = (layers: GarmentLayer[]) => (resolved.layers.some((l) => layers.includes(l.layer)) ? 1 : 0);
      // a bare male torso reads as skin; the female frame keeps the baked top as a minimal top
      const topWorn = this.appearance.frame === 'a' ? 1 : worn(['top', 'outer', 'full']);
      base.value.set(topWorn, worn(['bottom', 'full']), lm.crotchY + 0.12);
    }
    // MPFB bodies: the underwear is hidden under a garment of its half (the bra under a top, the panties and shorts under a bottom)
    if (this.underwearU) {
      const worn = (layers: GarmentLayer[]) => (resolved.layers.some((l) => layers.includes(l.layer)) ? 1 : 0);
      const bottom = worn(['bottom', 'full']);
      // the male underwear is one piece of trunks (its top edge can sit above the split): it follows the bottom garment alone
      this.underwearU.uBase.value.set(this.frame.mpfb?.sex === 'm' ? bottom : worn(['top', 'outer', 'full']), bottom, lm.waistY);
    }
  }
}
