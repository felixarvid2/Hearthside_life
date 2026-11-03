// Buy-mode placement preview: the real model as a translucent ghost, footprint tiles tinted green (valid) or
// red with a hatched pattern (invalid, never colour alone), and dots on the approach tiles of the slots.

import * as THREE from 'three';
import type { ContentDB } from '../content/types';
import { footprintTiles, rotationOriginShift, rotYaw } from '../core/geometry';
import type { Lot, PlacedObject } from '../core/types';
import type { PlacementState } from '../game/api';
import { levelY } from '../world/levels';
import { resolveSlots } from '../world/slots';
import type { ObjectAssets } from './objectAssets';

function tileTexture(invalid: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = invalid ? 'rgba(214,72,60,0.55)' : 'rgba(77,170,105,0.5)';
  ctx.fillRect(0, 0, 64, 64);
  if (invalid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 6;
    for (let i = -64; i < 128; i += 16) { ctx.beginPath(); ctx.moveTo(i, 64); ctx.lineTo(i + 64, 0); ctx.stroke(); }
  }
  ctx.strokeStyle = invalid ? 'rgba(150,30,25,0.9)' : 'rgba(30,110,60,0.9)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 60, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PlacementPreview {
  readonly group = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private modelKey = '';
  private readonly okTex = tileTexture(false);
  private readonly badTex = tileTexture(true);
  private readonly okMat = new THREE.MeshBasicMaterial({ map: this.okTex, transparent: true, depthWrite: false, depthTest: false });
  private readonly badMat = new THREE.MeshBasicMaterial({ map: this.badTex, transparent: true, depthWrite: false, depthTest: false });
  private readonly tileGeo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
  private readonly dotGeo = new THREE.CircleGeometry(0.11, 18).rotateX(-Math.PI / 2);
  private readonly dotMat = new THREE.MeshBasicMaterial({ color: 0xfbf6ee, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
  private readonly tiles: THREE.Mesh[] = [];
  private readonly dots: THREE.Mesh[] = [];
  private readonly modelHolder = new THREE.Group();
  private pending = 0;

  constructor(private readonly content: ContentDB, private readonly assets: ObjectAssets) {
    this.group.name = 'placement-preview';
    this.group.visible = false;
    this.group.add(this.modelHolder);
  }

  /** Shows the preview for a placement (null hides it). `groundAt` gives the floor height of a tile. */
  set(p: PlacementState | null, lot: Lot | null, groundAt: (x: number, z: number) => number): void {
    if (!p || !lot) { this.group.visible = false; return; }
    const def = this.content.objects[p.defId];
    if (!def) { this.group.visible = false; return; }
    this.group.visible = true;
    // model
    const key = p.defId;
    if (key !== this.modelKey) {
      if (this.model) this.assets.release(this.model);
      this.model = null;
      this.modelKey = key;
      const make = () => {
        if (this.modelKey !== key) return;
        const m = this.assets.instance(def, {}, true);
        if (m) { this.model = m; this.modelHolder.add(m); }
      };
      if (this.assets.isLoaded(def.model.asset)) make();
      else { const token = ++this.pending; void this.assets.load(def.model.asset).then(() => { if (token === this.pending) make(); }); }
    }
    // support height for surface items
    let y = groundAt(p.x + 0.5, p.z + 0.5);
    if (def.layer === 'surface') {
      y = levelY(p.level);
      for (const o of Object.values(lot.objects)) {
        if (o.id === p.objectId || o.level !== p.level) continue;
        const sd = this.content.objects[o.defId];
        if (!sd?.surfaceHeight) continue;
        if (footprintTiles(o.x, o.z, sd.footprint, o.rot).some((t) => t.x === p.x && t.z === p.z)) { y = levelY(p.level) + sd.surfaceHeight; break; }
      }
    }
    const shift = rotationOriginShift(def.footprint, p.rot);
    this.modelHolder.position.set(p.x + shift.x, y + 0.002, p.z + shift.z);
    this.modelHolder.rotation.y = rotYaw(p.rot);
    // tiles
    const fp = footprintTiles(p.x, p.z, def.footprint, p.rot);
    while (this.tiles.length < fp.length) { const m = new THREE.Mesh(this.tileGeo, this.okMat); m.renderOrder = 4; this.tiles.push(m); this.group.add(m); }
    this.tiles.forEach((m, i) => {
      const t = fp[i];
      m.visible = !!t;
      if (!t) return;
      m.material = p.ok ? this.okMat : this.badMat;
      m.position.set(t.x + 0.5, (def.layer === 'surface' ? y : groundAt(t.x + 0.5, t.z + 0.5)) + 0.01, t.z + 0.5);
    });
    // approach dots
    const obj: PlacedObject = {
      id: '__preview', defId: p.defId, level: p.level, x: p.x, z: p.z, rot: p.rot, finishes: {}, purchasePrice: 0, boughtAt: 0,
      ownerHouseholdId: null, condition: { dirt: 0, broken: false },
    };
    const approach = new Map<string, { x: number; z: number }>();
    for (const s of resolveSlots(lot, obj, def)) approach.set(`${s.approach.x},${s.approach.z}`, s.approach);
    const list = [...approach.values()];
    while (this.dots.length < list.length) { const m = new THREE.Mesh(this.dotGeo, this.dotMat); m.renderOrder = 5; this.dots.push(m); this.group.add(m); }
    this.dots.forEach((m, i) => {
      const a = list[i];
      m.visible = !!a;
      if (a) m.position.set(a.x + 0.5, groundAt(a.x + 0.5, a.z + 0.5) + 0.014, a.z + 0.5);
    });
  }

  dispose(): void {
    if (this.model) this.assets.release(this.model);
    this.okTex.dispose(); this.badTex.dispose();
    this.okMat.dispose(); this.badMat.dispose();
    this.tileGeo.dispose(); this.dotGeo.dispose(); this.dotMat.dispose();
  }
}
