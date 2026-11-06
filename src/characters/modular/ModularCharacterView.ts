// Adapter that lets a ModularCharacter stand in for a CharacterView (the PersonView surface used by peopleView, the creator
// preview and portraits). Stage A: adults only (the factory in ../personView.ts decides); concepts that do not exist for the
// stand-in bodies yet are harmless no-ops and say so below.

import * as THREE from 'three';
import type { AnimId } from '../../core/anim';
import type { Appearance, LifeStage, Outfit, OutfitCategory, Posture } from '../../core/types';
import { selectionRing } from '../CharacterView';
import { CRADLE } from '../stagePose';
import { STAGE_HEIGHTS } from '../stages';
import { ModularCharacter } from './ModularCharacter';
import { lookFor } from './look';
import type { ModularRuntime } from './runtime';

export class ModularCharacterView {
  readonly modular = true;
  readonly character: ModularCharacter;
  private stage: LifeStage;
  private appearance: Appearance;
  private category: OutfitCategory;
  private selected = false;
  private ring: THREE.Mesh | null = null;
  private cradleOn = false;
  private pendingApplies = 0;
  private lastKey = '';
  private disposed = false;

  constructor(private readonly runtime: ModularRuntime, clips: Iterable<THREE.AnimationClip>, appearance: Appearance, _outfit: Outfit, lifeStage: LifeStage = 'adult', category: OutfitCategory = 'everyday') {
    this.appearance = structuredClone(appearance);
    this.stage = lifeStage;
    this.category = category;
    this.character = new ModularCharacter(runtime.cache, runtime.manifest, [...clips]);
    this.apply();
    this.character.play('idle', { fade: 0 });
  }

  get root(): THREE.Group { return this.character.root; }
  get issues(): string[] { return this.character.issues; }
  /** True while a look is still being loaded and applied (portraits wait for it). */
  get busy(): boolean { return this.pendingApplies > 0; }

  private apply(): void {
    const look = lookFor(this.appearance, this.runtime.manifest);
    const key = `${this.category}|${JSON.stringify(look)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.pendingApplies++;
    void this.character.apply(look, this.category).finally(() => { this.pendingApplies--; });
  }

  // ---- PersonView surface ----

  setAppearance(a: Appearance, lifeStage: LifeStage = this.stage): void {
    if (this.disposed) return;
    this.appearance = structuredClone(a);
    this.stage = lifeStage;
    this.apply();
  }

  /** The outfit is chosen by category (the stand-in catalog is not tied to the classic Outfit's layers); `category` defaults to the last one. */
  setOutfit(_o: Outfit, category: OutfitCategory = this.category): void {
    if (this.disposed) return;
    this.category = category;
    this.apply();
  }

  get lifeStage(): LifeStage { return this.stage; }
  /** The modular bodies are adult bodies, drawn at their own size. */
  get hasOwnBody(): boolean { return true; }
  get stageHeight(): number { return STAGE_HEIGHTS[this.stage]; }
  /** The mannequins' pelvis sits where the adult rig's does. */
  get pelvisRatio(): number { return 1; }
  /** Babies are not modular yet: nothing to lower. */
  get floorDrop(): number { return 0; }
  /** No-op: babies are not modular yet. */
  setBabyUpright(_on: boolean): void { /* adults only */ }

  /** Remembered for `carrying` only: there is no cradle pose for the stand-in bodies yet. */
  setCarrying(on: boolean): void { this.cradleOn = on; }
  get carrying(): boolean { return this.cradleOn; }

  cradlePoint(target: THREE.Vector3): THREE.Vector3 {
    this.root.updateWorldMatrix(true, false);
    return target.set(CRADLE.x, CRADLE.y, CRADLE.z).applyMatrix4(this.root.matrixWorld);
  }

  bone(name: string): THREE.Bone | null { return this.character.bone(name); }
  play(anim: AnimId, opts: { fade?: number; posture?: Posture } = {}): void { this.character.play(anim, opts); }
  update(dt: number): void { this.character.update(dt); }
  get posture(): Posture { return this.character.posture; }
  headTop(target: THREE.Vector3): THREE.Vector3 { return this.character.headTop(target); }
  stats(): { triangles: number; drawCalls: number } { const s = this.character.stats(); return { triangles: s.triangles, drawCalls: s.drawCalls }; }

  /** The owners rebuild the view when the style changes; here it only re-derives the look. */
  refreshStyle(): void { if (!this.disposed) { this.lastKey = ''; this.apply(); } }

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
  }

  get isSelected(): boolean { return this.selected; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ring?.removeFromParent();
    this.character.dispose();
  }
}
