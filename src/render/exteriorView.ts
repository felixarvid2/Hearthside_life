// The Milestone 9 exterior in one place for GameView: fences, roofs, terrain paint and garden crops. GameView owns one of these, adds
// its group to the scene and forwards the lot changes ('fences' | 'roofs' | 'terrain' | 'objects' | 'all') and the camera settings.

import * as THREE from 'three';
import type { ContentDB } from '../content/types';
import type { Lot } from '../core/types';
import type { GameEvent } from '../core/events';
import { FenceView } from './fenceView';
import { GardenView } from './gardenView';
import { RoofView } from './roofView';
import { TerrainView } from './terrainView';

type LotWhat = Extract<GameEvent, { type: 'lot.changed' }>['what'];
export type WallMode = 'up' | 'cutaway' | 'down';

export class ExteriorView {
  readonly group = new THREE.Group();
  readonly fences: FenceView;
  readonly roofs: RoofView;
  readonly terrain: TerrainView;
  readonly gardens: GardenView;
  private lot: Lot | null = null;
  private view = { enabled: true, walls: 'cutaway' as WallMode, level: 99, editing: false };

  constructor(content?: ContentDB) {
    this.group.name = 'exterior';
    this.fences = new FenceView(content);
    this.roofs = new RoofView(content);
    this.terrain = new TerrainView(content);
    this.gardens = new GardenView(content);
    this.group.add(this.terrain.group, this.fences.group, this.gardens.group, this.roofs.group);
  }

  /** Everything for a lot (or nothing). */
  setLot(lot: Lot | null): void {
    this.lot = lot;
    if (!lot) { this.clear(); return; }
    this.terrain.build(lot);
    this.fences.build(lot);
    this.roofs.build(lot);
    this.gardens.sync(lot, true);
    this.apply();
  }

  /** A construction or object change; `what` is the lot.changed kind. */
  lotChanged(what: LotWhat): void {
    const lot = this.lot;
    if (!lot) return;
    if (what === 'terrain' || what === 'all') this.terrain.build(lot);
    if (what === 'fences' || what === 'all') this.fences.build(lot);
    if (what === 'roofs' || what === 'all' || what === 'walls' || what === 'floors') this.roofs.build(lot);
    if (what === 'objects' || what === 'all' || what === 'floors') this.gardens.sync(lot, true);
    this.apply();
  }

  /** A crop bed changed (planted, watered, grown, harvested). */
  gardensChanged(): void { if (this.lot) this.gardens.sync(this.lot); }

  /** Camera settings: the wall mode, the roof toggle, the level in view and whether a roof tool is open. */
  setView(o: Partial<{ enabled: boolean; walls: WallMode; level: number; editing: boolean }>): void {
    this.view = { ...this.view, ...o };
    this.apply();
  }

  get roofsEnabled(): boolean { return this.view.enabled; }

  private apply(): void {
    this.roofs.setView(this.view);
    this.fences.setActiveLevel(this.view.level);
  }

  private clear(): void {
    this.terrain.build({ terrain: {} } as unknown as Lot);
    this.fences.build({ fences: {} } as unknown as Lot);
    this.roofs.build({ roofs: {}, walls: {} } as unknown as Lot);
    this.gardens.sync({ objects: {} } as unknown as Lot, true);
  }

  dispose(): void {
    this.terrain.dispose(); this.fences.dispose(); this.roofs.dispose(); this.gardens.dispose();
  }
}
