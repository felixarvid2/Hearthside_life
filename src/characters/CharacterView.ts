// One rendered person: skeleton clone + shared skin geometry (body and head) + hair + garments + accessories,
// per-character materials, morph influences and an Animator. Feet at the origin, facing +z.
// Geometry is shared through the asset cache (per frame and style); materials, the skeleton and the mixer
// belong to the view and are freed by dispose().

import * as THREE from 'three';
import type { AnimId } from '../core/anim';
import type { Appearance, GarmentLayer, Outfit, Posture } from '../core/types';
import type { ContentDB, GarmentDef } from '../content/types';
import type { CharacterAssets, FrameAssets } from './assets';
import { cachedGeometry, cloneSkeleton } from './assets';
import { Animator } from './animation';
import { BODY_PARAM_IDS } from './bodyShape';
import type { Coverage, CutParams } from './clothing';
import { buildGarment, mergeCoverage } from './clothing';
import { toGeometry, triangleCount } from './geometry';
import { HEAD_SCULPT_IDS } from './headShape';
import { STRAND_IDS, buildHair } from './hair';
import type { ClothUniforms, HairUniforms, SkinUniforms } from './materials';
import { FABRIC_IDS, FABRIC_ROUGHNESS, PATTERN_IDS, createClothMaterial, createHairMaterial, createSkinMaterial } from './materials';
import { resolveOutfit } from './outfits';
import { clamp } from './rig';

const BROW_INDEX: Record<string, number> = { natural: 0, straight: 1, 'soft-arch': 2, 'high-arch': 3, thick: 4, thin: 5, bushy: 6, angled: 7 };

interface GarmentSlot { mesh: THREE.SkinnedMesh; material: THREE.MeshStandardMaterial; uniforms: ClothUniforms; garmentId: string }

/** Shared garment geometry for a frame (built on first use). */
export function garmentGeometry(assets: CharacterAssets, frame: FrameAssets, def: GarmentDef): THREE.BufferGeometry {
  return cachedGeometry(assets, `garment:${frame.frame}:${def.id}`, () => {
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
  return cachedGeometry(assets, `hair:${frame.frame}:${hair?.id ?? '-'}:${facial?.id ?? '-'}`, () => toGeometry(buildHair(frame.template, hair, facial), `hair-${hair?.id}-${facial?.id}`));
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
  private garments = new Map<GarmentLayer, GarmentSlot>();
  private hair: { mesh: THREE.SkinnedMesh; material: THREE.MeshStandardMaterial; uniforms: HairUniforms } | null = null;
  private animator!: Animator;
  private appearance: Appearance;
  private outfit: Outfit;
  private selected = false;
  private hairClear = 0;
  private lastAnim: { id: AnimId; posture?: Posture } = { id: 'idle' };
  /** Problems found while resolving the outfit (unknown ids etc.). */
  issues: string[] = [];

  constructor(private assets: CharacterAssets, private content: ContentDB, appearance: Appearance, outfit: Outfit) {
    this.appearance = structuredClone(appearance);
    this.outfit = structuredClone(outfit);
    this.root.name = 'character';
    this.buildRig();
    this.applyAppearance();
    this.applyOutfit();
    this.play('idle', { fade: 0 });
  }

  // ---- public API ----

  setAppearance(a: Appearance): void {
    const frameChanged = a.frame !== this.appearance.frame;
    this.appearance = structuredClone(a);
    if (frameChanged) {
      this.teardownRig();
      this.buildRig();
      this.applyOutfit();
      this.play(this.lastAnim.id, { fade: 0, posture: this.lastAnim.posture });
    }
    this.applyAppearance();
  }

  setOutfit(o: Outfit): void {
    this.outfit = structuredClone(o);
    this.applyOutfit();
  }

  /** Plays a game animation. `posture` selects seated/lying variants (inferred from the last animation otherwise). */
  play(anim: AnimId, opts: { fade?: number; posture?: Posture } = {}): void {
    this.lastAnim = { id: anim, posture: opts.posture };
    this.animator.play(anim, opts);
  }

  update(dtSeconds: number): void {
    this.animator.update(Math.min(dtSeconds, 0.1));
  }

  /** World position of the top of the head (hair included). */
  headTop(target: THREE.Vector3): THREE.Vector3 {
    const head = this.bones.get('Head');
    if (!head) return target.copy(this.root.position).setY(this.root.position.y + 1.9);
    head.updateWorldMatrix(true, false);
    return target.set(0, 0.27, 0).applyMatrix4(head.matrixWorld);
  }

  setSelected(on: boolean): void {
    this.selected = on;
    this.skinU.uSelect.value = on ? 1 : 0;
    for (const s of this.garments.values()) s.uniforms.uSelect.value = on ? 1 : 0;
    if (this.hair) this.hair.uniforms.uSelect.value = on ? 1 : 0;
  }

  /** Frees per-character resources (materials, mixer); shared geometry stays in the assets cache. */
  dispose(): void {
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
    this.frame = this.assets.frames[this.appearance.frame];
    const { root, skeleton, byName } = cloneSkeleton(this.frame);
    this.skeleton = skeleton;
    this.bones = byName;
    this.root.add(root);
    const { material, uniforms } = createSkinMaterial();
    this.skinMat = material;
    this.skinU = uniforms;
    this.skinMesh = this.skinned(this.frame.skinGeometry, material, 'skin');
    this.animator = new Animator(this.root, this.assets.clips);
    this.skinU.uSelect.value = this.selected ? 1 : 0;
  }

  private teardownRig(): void {
    this.animator?.dispose();
    for (const s of this.garments.values()) s.material.dispose();
    this.garments.clear();
    this.hair?.material.dispose();
    this.hair = null;
    for (const child of [...this.root.children]) child.removeFromParent();
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
    const body = this.appearance.body;
    const face = this.appearance.face.params;
    for (const id of BODY_PARAM_IDS) { const i = dict[id]; if (i !== undefined) infl[i] = clamp(body[id] ?? 0, -1, 1); }
    for (const id of HEAD_SCULPT_IDS) { const i = dict[id]; if (i !== undefined) infl[i] = clamp(face[id] ?? 0, -1, 1); }
    const hc = dict.hairClear;
    if (hc !== undefined) infl[hc] = this.hairClear;
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
    this.applyMorphs(this.skinMesh);
    for (const s of this.garments.values()) this.applyMorphs(s.mesh);
    this.applyHair();
  }

  private applyHair(): void {
    const a = this.appearance;
    const geometry = hairGeometry(this.assets, this.frame, this.content, a.hair.styleId, a.hair.facialHairId);
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
    const def = this.content.hair[a.hair.styleId];
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
      const details = b.details === 'jeans' ? 1 : b.details === 'crease' ? 2 : b.sideStripe ? 3 : b.laces || b.toeCap ? 4 : b.strap === true ? 5 : 0;
      const placket = b.placket === 'buttons' ? 1 : b.placket === 'zip' ? 2 : b.placket === 'short' ? 3 : 0;
      u.uFlags.value.set(details, placket, b.rib ? 1 : 0, b.piping ? 1 : 0);
      u.uFlags2.value.set(b.hemBand ? 1 : 0, b.belt ? 1 : 0, b.cuff ? 1 : 0, b.waistBand ? 1 : 0);
      const cuts = geometry.userData.cuts as CutParams;
      u.uCutNeck.value.fromArray(cuts.neck);
      u.uCutArm.value.fromArray(cuts.arm);
      u.uCutMisc.value.fromArray(cuts.misc);
      u.uHem.value.fromArray(cuts.hem);
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
    // bulky upper layers push long hair away from the back (hair 'hairClear' morph)
    let clear = 0;
    for (const { layer, def } of resolved.layers) {
      const th = typeof def.build.thickness === 'number' ? def.build.thickness : layer === 'outer' ? 0.019 : 0.011;
      if (layer === 'outer' || layer === 'top' || layer === 'full') clear = Math.max(clear, clamp((th - 0.008) / 0.012, 0, 1) + (layer === 'outer' ? 0.25 : 0));
    }
    this.hairClear = clamp(clear, 0, 1);
    if (this.hair) this.applyMorphs(this.hair.mesh);
    const cov = mergeCoverage(coverage);
    const t = cov.torso;
    this.skinU.uCoverTorso.value.set(t?.yMin ?? 0, t?.yMaxBack ?? 0, t?.yMaxFront ?? 0, t ? 1 : 0);
    this.skinU.uCoverLimbs.value.set(cov.armMaxX, cov.legMinY, cov.footMaxY, 0.03);
  }
}
