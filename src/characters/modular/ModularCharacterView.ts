// Adapter that lets a ModularCharacter stand in for a CharacterView (the PersonView surface used by peopleView, the creator
// preview and portraits). Every life stage: the stage's proportions are put on the skeleton (stageProportions.ts), babies lie
// curled or are cradled, elders stoop (the pose effects live in ModularCharacter).

import * as THREE from 'three';
import type { AnimId } from '../../core/anim';
import type { Appearance, LifeStage, Outfit, OutfitCategory, Posture } from '../../core/types';
import { selectionRing } from '../CharacterView';
import { CRADLE } from '../stagePose';
import { seatedPlacement } from '../posture';
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
    const look = lookFor(this.appearance, this.runtime.manifest, undefined, this.stage);
    const key = `${this.category}|${this.stage}|${JSON.stringify(look)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.pendingApplies++;
    void this.character.apply(look, this.category, this.stage).finally(() => { this.pendingApplies--; });
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
  /** The figure is drawn at the stage's size by its own skeleton and root scale. */
  get hasOwnBody(): boolean { return true; }
  get stageHeight(): number { return STAGE_HEIGHTS[this.stage]; }
  /** Hip height of the stage's skeleton over the adult's. */
  get pelvisRatio(): number { return this.character.stageHipRatio; }
  /** How far the root must be lowered so a sitting baby's bottom rests on the floor (0 for everybody else). */
  get floorDrop(): number {
    if (this.stage !== 'baby' || !this.character.isBabyUpright) return 0;
    return -seatedPlacement({ x: 0, y: 0, z: 0 }, 0, this.appearance.frame, 'mpfb', { stage: 'baby', modular: true }).y;
  }
  /** A baby sits up instead of lying (previews and portraits). */
  setBabyUpright(on: boolean): void { this.character.setBabyUpright(on); }

  /** Cradle the arms for holding a baby. */
  setCarrying(on: boolean): void { this.character.setCarrying(on); }
  get carrying(): boolean { return this.character.carrying; }
  /** Lean back in a seat (recliners). */
  setRecline(on: boolean): void { this.character.setRecline(on); }
  setWalkRate(rate: number): void { this.character.setWalkRate(rate); }

  cradlePoint(target: THREE.Vector3): THREE.Vector3 {
    // the root scale already carries the stage's size
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
