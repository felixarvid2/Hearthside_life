// Crops of the garden beds (PlacedObject.garden): one merged, vertex-coloured mesh of low-poly blobs (world/gardenLayout.ts) on top of
// the bed models, rebuilt when a bed changes. A seedling, a leafy plant, a plant heavy with fruit; a dry bed wilts.
// Pure view: nothing here changes the state.

import * as THREE from 'three';
import { rotateLocal } from '../core/geometry';
import type { ContentDB } from '../content/types';
import type { Lot } from '../core/types';
import { gardenBlobs } from '../world/gardenLayout';
import { isCropBed } from '../world/gardenGrowth';
import { LEVEL_HEIGHT } from '../world/levels';

const ico = new THREE.IcosahedronGeometry(1, 0);
const icoPos = ico.getAttribute('position') as THREE.BufferAttribute;

export class GardenView {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, name: 'crops' });
  private readonly colors = new Map<string, THREE.Color>();
  private key = '';
  private activeLevel = 99;
  /** Ground height under a point (set by GameView). */
  groundAt: (x: number, z: number) => number = () => 0;

  constructor(private readonly content?: ContentDB) { this.group.name = 'crops'; }

  private color(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) { c = new THREE.Color(hex); this.colors.set(hex, c); }
    return c;
  }

  /** Redraws the crops of the lot; does nothing when no bed changed since the last call. */
  sync(lot: Lot, force = false): void {
    const key = Object.values(lot.objects).filter((o) => o.garden && isCropBed(o.defId))
      .map((o) => `${o.id}:${o.x}:${o.z}:${o.rot}:${o.garden!.crop}:${o.garden!.growth.toFixed(2)}:${o.garden!.need}:${o.garden!.water > 0 ? 1 : 0}`).sort().join('|');
    if (!force && key === this.key) return;
    this.key = key;
    this.clear();
    const pos: number[] = [], nor: number[] = [], col: number[] = [];
    const idx = ico.getIndex();
    const n = idx ? idx.count : icoPos.count;
    for (const o of Object.values(lot.objects)) {
      if (!o.garden || !isCropBed(o.defId)) continue;
      const def = this.content?.objects[o.defId];
      if (!def) continue;
      const blobs = gardenBlobs(o.defId, o.id, o.garden);
      if (blobs.length === 0) continue;
      const y0 = o.level * LEVEL_HEIGHT + (o.level === 0 ? this.groundAt(o.x + 0.5, o.z + 0.5) : 0);
      for (const b of blobs) {
        const r = rotateLocal(b.x, b.z, def.footprint, o.rot);
        const cx = o.x + r.x, cz = o.z + r.z, cy = y0 + b.y;
        const color = this.color(b.color);
        for (let i = 0; i < n; i += 3) {
          const v = [0, 1, 2].map((k) => { const j = idx ? idx.getX(i + k) : i + k; return [cx + icoPos.getX(j) * b.rx, cy + icoPos.getY(j) * b.ry, cz + icoPos.getZ(j) * b.rz] as const; });
          const ux = v[1]![0] - v[0]![0], uy = v[1]![1] - v[0]![1], uz = v[1]![2] - v[0]![2];
          const wx = v[2]![0] - v[0]![0], wy = v[2]![1] - v[0]![1], wz = v[2]![2] - v[0]![2];
          let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          const shade = 0.85 + 0.2 * Math.max(0, ny);
          for (const p of v) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(color.r * shade, color.g * shade, color.b * shade); }
        }
      }
    }
    if (pos.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.ownGeometry = true;
    this.mesh.visible = this.activeLevel >= 0;
    this.group.add(this.mesh);
  }

  /** Blob count drawn (tests, stats). */
  blobCount(): number { return this.mesh ? this.mesh.geometry.getAttribute('position').count / 60 : 0; }

  private clear(): void {
    this.mesh?.geometry.dispose();
    for (const c of [...this.group.children]) c.removeFromParent();
    this.mesh = null;
  }

  dispose(): void { this.clear(); this.material.dispose(); }
}
