// Roofs (Lot.roofs): one group per roof with up to four meshes (slope in the finish material, gable ends in the colour of the wall
// below, trim in a darker tone of the finish, glass for a clerestory band), built from world/roofs.ts buildRoofMesh and placed at
// the roof's rectangle on top of its level's walls. Finish textures are procedural (exteriorTextures.ts), shared per finish and
// palette. A roof shows only when roofs are on, the walls are up (or a roof tool is open) and the active level is at or above the
// roof's level. Pure view: nothing here changes the state.

import * as THREE from 'three';
import { exteriorOf } from '../content/exterior';
import type { ContentDB } from '../content/types';
import type { Lot, Roof } from '../core/types';
import { buildRoofMesh, roofBaseHeight, type RoofMeshPart, type RoofPartKind } from '../world/roofs';
import { roofTexture } from './exteriorTextures';

const GABLE_DEFAULT = '#e9dfcb';

function geometryOf(part: RoofMeshPart): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(part.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(part.uv, 2));
  g.computeBoundingSphere();
  return g;
}

export class RoofView {
  readonly group = new THREE.Group();
  private readonly materials = new Map<string, { mat: THREE.MeshStandardMaterial; tex: THREE.Texture | null }>();
  private readonly extras = new Map<string, THREE.MeshStandardMaterial>();
  private roofs = new Map<string, { roof: Roof; group: THREE.Group }>();
  private activeLevel = 99;
  private enabled = true;
  /** True while a roof tool is open: roofs show even with the walls cut away. */
  private editing = false;
  private walls: 'up' | 'cutaway' | 'down' = 'cutaway';

  constructor(private readonly content?: ContentDB) { this.group.name = 'roofs'; }

  private finishMaterial(roof: Roof): THREE.MeshStandardMaterial {
    const key = `${roof.finish.designId}:${roof.finish.paletteId}`;
    const hit = this.materials.get(key);
    if (hit) return hit.mat;
    const ex = exteriorOf(this.content);
    const fin = ex.roofFinishes[roof.finish.designId];
    const pal = fin?.palettes.find((p) => p.id === roof.finish.paletteId) ?? fin?.palettes[0];
    const mat = new THREE.MeshStandardMaterial({ roughness: fin?.texture === 'seam' || fin?.texture === 'copper' ? 0.45 : 0.88, metalness: fin?.texture === 'seam' || fin?.texture === 'copper' ? 0.25 : 0, side: THREE.DoubleSide, name: `roof:${key}` });
    let tex: THREE.Texture | null = null;
    if (fin && pal) {
      tex = roofTexture(fin.texture, pal);
      if (tex) mat.map = tex; else mat.color.set(pal.colors[0]);
    } else mat.color.set('#6c6258');
    this.materials.set(key, { mat, tex });
    return mat;
  }

  private extra(kind: RoofPartKind, roof: Roof, lot: Lot): THREE.MeshStandardMaterial {
    const ex = exteriorOf(this.content);
    const pal = ex.roofFinishes[roof.finish.designId]?.palettes.find((p) => p.id === roof.finish.paletteId);
    const gable = this.gableColor(lot, roof);
    const key = kind === 'trim' ? `trim:${pal?.colors[1] ?? ''}` : kind === 'gable' ? `gable:${gable}` : 'glass';
    let m = this.extras.get(key);
    if (!m) {
      m = kind === 'glass'
        ? new THREE.MeshStandardMaterial({ color: '#bcd9df', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: kind === 'trim' ? (pal?.colors[1] ?? '#4a4d52') : gable, roughness: 0.85, side: THREE.DoubleSide });
      this.extras.set(key, m);
    }
    return m;
  }

  /** The colour of the wall under the roof's gable ends (the first wall on its outline), else plaster. */
  private gableColor(lot: Lot, roof: Roof): string {
    for (const w of Object.values(lot.walls)) {
      if (w.level !== roof.level) continue;
      const onOutline = w.dir === 'h'
        ? w.x >= roof.x0 && w.x < roof.x1 && (w.z === roof.z0 || w.z === roof.z1)
        : w.z >= roof.z0 && w.z < roof.z1 && (w.x === roof.x0 || w.x === roof.x1);
      if (!onOutline) continue;
      const d = this.content?.wallDesigns[w.sideA.designId];
      const pal = d?.palettes.find((p) => p.id === w.sideA.paletteId) ?? d?.palettes[0];
      if (pal?.colors[0]) return pal.colors[0];
    }
    return GABLE_DEFAULT;
  }

  /** Rebuilds every roof of the lot. */
  build(lot: Lot): void {
    this.clear();
    for (const roof of Object.values(lot.roofs ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const w = roof.x1 - roof.x0, d = roof.z1 - roof.z0;
      let mesh;
      try { mesh = buildRoofMesh(roof.styleId, w, d, roof.ridge, roof.pitch); } catch { continue; }
      const g = new THREE.Group();
      g.name = `roof-${roof.id}`;
      g.position.set(roof.x0, roofBaseHeight(lot, roof.level, roof), roof.z0);
      for (const kind of ['slope', 'gable', 'trim', 'glass'] as const) {
        const part = mesh.parts[kind];
        if (part.pos.length === 0) continue;
        const m = new THREE.Mesh(geometryOf(part), kind === 'slope' ? this.finishMaterial(roof) : this.extra(kind, roof, lot));
        m.castShadow = kind !== 'glass';
        m.receiveShadow = true;
        m.userData.ownGeometry = true;
        m.userData.roofId = roof.id;
        if (kind === 'glass') m.renderOrder = 2;
        g.add(m);
      }
      this.roofs.set(roof.id, { roof, group: g });
      this.group.add(g);
    }
    this.applyVisibility();
  }

  /** What shows a roof: the roof toggle, the wall mode of the camera, and the level being looked at. */
  setView(o: { enabled: boolean; walls: 'up' | 'cutaway' | 'down'; level: number; editing: boolean }): void {
    this.enabled = o.enabled; this.walls = o.walls; this.activeLevel = o.level; this.editing = o.editing;
    this.applyVisibility();
  }

  /** Whether a roof of this level is drawn with the current view settings. */
  visibleFor(level: number): boolean {
    if (!this.enabled && !this.editing) return false;
    if (level > this.activeLevel) return false;
    return this.editing || this.walls === 'up';
  }

  private applyVisibility(): void {
    for (const { roof, group } of this.roofs.values()) group.visible = this.visibleFor(roof.level);
    this.group.visible = true;
  }

  /** Ids of the roofs currently drawn (tests). */
  visibleRoofs(): string[] { return [...this.roofs.values()].filter((r) => r.group.visible).map((r) => r.roof.id); }

  /** Roof meshes for picking (the roof tool's erase tap). */
  pickables(): THREE.Object3D[] { return [...this.roofs.values()].filter((r) => r.group.visible).map((r) => r.group); }

  private clear(): void {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.ownGeometry) m.geometry.dispose(); });
    for (const c of [...this.group.children]) c.removeFromParent();
    this.roofs.clear();
  }

  dispose(): void {
    this.clear();
    for (const { mat, tex } of this.materials.values()) { tex?.dispose(); mat.dispose(); }
    for (const m of this.extras.values()) m.dispose();
    this.materials.clear();
    this.extras.clear();
  }
}
