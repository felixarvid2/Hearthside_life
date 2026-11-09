// The surface a rendered person offers to peopleView, the creator preview, portraits and hand props, plus the factory that
// picks the implementation: the modular (GLB-part) view for every life stage while the 'quaternius' style is active, CharacterView
// for the other styles.

import type * as THREE from 'three';
import type { AnimId } from '../core/anim';
import type { Appearance, LifeStage, Outfit, OutfitCategory, Posture } from '../core/types';
import type { ContentDB } from '../content/types';
import type { CharacterAssets } from './assets';
import { CharacterView } from './CharacterView';
import { ModularCharacterView } from './modular/ModularCharacterView';

export interface PersonView {
  /** Add this to the scene; position/rotate it to place the person (feet at origin, facing +z). */
  readonly root: THREE.Group;
  /** True for the modular (GLB-part) implementation. */
  readonly modular: boolean;
  readonly issues: readonly string[];
  /** True while a look is still loading (always false for CharacterView, which builds synchronously). */
  readonly busy: boolean;
  readonly lifeStage: LifeStage;
  readonly hasOwnBody: boolean;
  readonly carrying: boolean;
  readonly pelvisRatio: number;
  readonly stageHeight: number;
  readonly floorDrop: number;
  readonly posture: Posture;
  setAppearance(a: Appearance, lifeStage?: LifeStage): void;
  /** `category` is the outfit category being worn (used by the modular view, which keeps outfits per category). */
  setOutfit(o: Outfit, category?: OutfitCategory): void;
  play(anim: AnimId, opts?: { fade?: number; posture?: Posture }): void;
  setBabyUpright(on: boolean): void;
  setCarrying(on: boolean): void;
  /** Lean back in a seat (recliners); views that cannot pose the spine ignore it. */
  setRecline(on: boolean): void;
  /** Walk and jog cycle speed factor (actual ground speed over the clips' natural speed), so feet do not slide. */
  setWalkRate(rate: number): void;
  cradlePoint(target: THREE.Vector3): THREE.Vector3;
  bone(name: string): THREE.Bone | null;
  update(dtSeconds: number): void;
  headTop(target: THREE.Vector3): THREE.Vector3;
  setSelected(on: boolean): void;
  stats(): { triangles: number; drawCalls: number };
  refreshStyle(): void;
  dispose(): void;
}

/** Whether a person of this life stage is drawn by the modular view under the assets' current style. */
export function wantsModular(assets: CharacterAssets, lifeStage: LifeStage): boolean {
  void lifeStage;
  return !!assets.modular;
}

export function createPersonView(assets: CharacterAssets, content: ContentDB, appearance: Appearance, outfit: Outfit, lifeStage: LifeStage = 'adult', category: OutfitCategory = 'everyday'): PersonView {
  if (assets.modular && wantsModular(assets, lifeStage)) return new ModularCharacterView(assets.modular, assets.clips.values(), appearance, outfit, lifeStage, category);
  return new CharacterView(assets, content, appearance, outfit, lifeStage);
}
