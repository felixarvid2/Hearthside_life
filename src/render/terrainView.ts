// Terrain paint (Lot.terrain) as one textured mesh of tile quads just above the lot ground, using a texture atlas of every paint
// (render/exteriorTextures.ts). Each tile picks a quarter turn from a hash of its position so a painted area does not repeat
// visibly. The base ground of the lot (Lot.ground) is drawn by EnvironmentView. Pure view: nothing here changes the state.

import * as THREE from 'three';
import { exteriorOf } from '../content/exterior';
import type { ContentDB } from '../content/types';
import { parseTileKey } from '../core/ids';
import type { Lot } from '../core/types';
import { GROUND_Y } from './environment';
import { ATLAS_COLS, terrainAtlas, type TerrainAtlas } from './exteriorTextures';
import { hash01 } from './geo';

export class TerrainView {
  readonly group = new THREE.Group();
  private atlas: TerrainAtlas | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private mesh: THREE.Mesh | null = null;

  constructor(private readonly content?: ContentDB) { this.group.name = 'terrain'; }

  private ensureMaterial(): THREE.MeshStandardMaterial | null {
    if (this.material) return this.material;
    const defs = Object.values(exteriorOf(this.content).terrain);
    this.atlas = terrainAtlas(defs);
    if (!this.atlas) return null;
    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas.texture, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'terrain',
    });
    return this.material;
  }

  /** Rebuilds the paint of the lot (nothing when the lot has none). */
  build(lot: Lot): void {
    this.clear();
    const keys = Object.keys(lot.terrain ?? {});
    if (keys.length === 0) return;
    const mat = this.ensureMaterial();
    const atlas = this.atlas;
    if (!mat || !atlas) return;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const rows = atlas.rows, inset = 0.5 / 96;
    for (const key of keys.sort()) {
      const { x, z } = parseTileKey(key);
      const idx = atlas.index[lot.terrain![key]!];
      if (idx === undefined) continue;
      const cx = idx % ATLAS_COLS, cy = Math.floor(idx / ATLAS_COLS);
      const u0 = cx / ATLAS_COLS + inset, u1 = (cx + 1) / ATLAS_COLS - inset;
      const v1 = 1 - cy / rows - inset / rows * 2, v0 = 1 - (cy + 1) / rows + inset / rows * 2;
      const rot = Math.floor(hash01(x * 73856093 ^ z * 19349663) * 4);
      const corners: Array<[number, number]> = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]; // (x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1)
      const c = [0, 1, 2, 3].map((i) => corners[(i + rot) % 4]!);
      const y = GROUND_Y + 0.006;
      const q = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]] as const;
      for (const i of [0, 3, 2, 0, 2, 1]) { pos.push(q[i]![0], y, q[i]![1]); nor.push(0, 1, 0); uv.push(c[i]![0], c[i]![1]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.userData.ownGeometry = true;
    this.mesh.name = 'terrain-paint';
    this.group.add(this.mesh);
  }

  /** Number of painted tiles drawn (tests, stats). */
  tileCount(): number { return this.mesh ? this.mesh.geometry.getAttribute('position').count / 6 : 0; }

  private clear(): void {
    this.mesh?.geometry.dispose();
    for (const c of [...this.group.children]) c.removeFromParent();
    this.mesh = null;
  }

  dispose(): void { this.clear(); this.atlas?.texture.dispose(); this.material?.dispose(); this.atlas = null; this.material = null; }
}
