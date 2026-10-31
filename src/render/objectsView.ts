// Furniture and transient items of the active lot: one group per placed object (rot-0 local space placed with
// core/geometry rotationOriginShift + rotYaw, surface items at their support's surfaceHeight), served meals as
// small procedural plates, the buy-mode selection highlight, lamp glow at night and picking boxes.

import * as THREE from 'three';
import type { ContentDB, ObjectDef } from '../content/types';
import { rotateLocal, rotatedSize, rotationOriginShift, rotYaw } from '../core/geometry';
import { edgeKey } from '../core/ids';
import type { Id, Lot, PlacedObject, WorldState } from '../core/types';
import { disposePlaceholder, placeholderModel, type ObjectAssets } from './objectAssets';

interface ObjEntry {
  id: Id;
  sig: string;
  group: THREE.Group;
  model: THREE.Object3D | null;
  placeholder: boolean;
  def: ObjectDef;
  box: THREE.Box3;
  /** Wall edge behind a wall-mounted object (hidden when that wall is lowered). */
  wallId: string | null;
  isLamp: boolean;
}

interface ItemEntry { id: Id; sig: string; group: THREE.Group; box: THREE.Box3 }

export class ObjectsView {
  readonly group = new THREE.Group();
  private readonly objects = new Map<Id, ObjEntry>();
  private readonly items = new Map<Id, ItemEntry>();
  private lot: Lot | null = null;
  private loadToken = 0;
  private hiddenId: Id | null = null;
  private readonly highlight: THREE.LineSegments;
  private readonly highlightFill: THREE.Mesh;
  private highlightId: Id | null = null;
  private readonly plateGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.025, 20);
  private readonly foodGeo = new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  private readonly plateMat = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.4 });
  private readonly foodMats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly lampLights: THREE.PointLight[] = [];
  private night = 0;
  onModelsLoaded: (() => void) | null = null;

  constructor(private readonly content: ContentDB, private readonly assets: ObjectAssets, maxLampLights: number) {
    this.group.name = 'objects';
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    edges.translate(0.5, 0.5, 0.5);
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffb347, depthTest: false, transparent: true, opacity: 0.95 }));
    this.highlight.renderOrder = 6;
    this.highlight.visible = false;
    const fillGeo = new THREE.PlaneGeometry(1, 1);
    fillGeo.rotateX(-Math.PI / 2);
    fillGeo.translate(0.5, 0, 0.5);
    this.highlightFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
    this.highlightFill.visible = false;
    this.highlightFill.renderOrder = 2;
    this.group.add(this.highlight, this.highlightFill);
    this.setLampLightCount(maxLampLights);
  }

  /** Fixed number of point lights (changing the count recompiles shaders, so it only changes with quality). */
  setLampLightCount(n: number): void {
    while (this.lampLights.length > n) this.lampLights.pop()!.removeFromParent();
    while (this.lampLights.length < n) {
      const l = new THREE.PointLight(0xffc77a, 0, 6.5, 1.6);
      l.castShadow = false;
      this.lampLights.push(l);
      this.group.add(l);
    }
  }

  get count(): number { return this.objects.size; }

  /** Syncs object groups with the lot (adds, removes, re-creates changed objects). */
  sync(lot: Lot): void {
    this.lot = lot;
    const want = Object.values(lot.objects).filter((o) => o.level === 0);
    const seen = new Set<Id>();
    const toLoad = new Set<string>();
    for (const o of want) {
      seen.add(o.id);
      const def = this.content.objects[o.defId];
      if (!def) continue;
      const sig = `${o.defId}|${o.x}|${o.z}|${o.rot}|${o.supportId ?? ''}|${JSON.stringify(o.finishes)}`;
      const cur = this.objects.get(o.id);
      if (cur && cur.sig === sig && !(cur.placeholder && this.assets.isLoaded(def.model.asset))) continue;
      if (cur) this.removeEntry(cur);
      this.addEntry(o, def, sig);
      if (!this.assets.isLoaded(def.model.asset) && !this.assets.hasFailed(def.model.asset)) toLoad.add(def.model.asset);
    }
    for (const e of [...this.objects.values()]) if (!seen.has(e.id)) this.removeEntry(e);
    if (toLoad.size) {
      const token = ++this.loadToken;
      void this.assets.preload(toLoad).then(() => {
        if (token !== this.loadToken || !this.lot) return;
        this.sync(this.lot);
        this.onModelsLoaded?.();
      });
    }
    this.refreshHighlight();
  }

  private addEntry(o: PlacedObject, def: ObjectDef, sig: string): void {
    const g = new THREE.Group();
    g.name = `obj:${o.id}`;
    const shift = rotationOriginShift(def.footprint, o.rot);
    const y = this.baseHeight(o);
    g.position.set(o.x + shift.x, y, o.z + shift.z);
    g.rotation.y = rotYaw(o.rot);
    let model = this.assets.instance(def, o.finishes);
    let placeholder = false;
    if (!model) {
      placeholder = true; // real model not loaded yet (re-created by sync once it is)
      if (this.assets.hasFailed(def.model.asset)) model = placeholderModel(def);
    }
    if (model) g.add(model);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const rs = rotatedSize(def.footprint, o.rot);
    if (model && !placeholder) box.setFromObject(model);
    if (box.isEmpty()) box.set(new THREE.Vector3(o.x, y, o.z), new THREE.Vector3(o.x + rs.w, y + Math.max(0.2, def.height), o.z + rs.d));
    let wallId: string | null = null;
    if (def.layer === 'wall' || def.needsWall) {
      const p = rotateLocal(def.footprint.w / 2, 0, def.footprint, o.rot);
      const wx = o.x + p.x, wz = o.z + p.z;
      if (Math.abs(wz - Math.round(wz)) < 1e-6) wallId = edgeKey(0, 'h', Math.floor(wx), Math.round(wz));
      else if (Math.abs(wx - Math.round(wx)) < 1e-6) wallId = edgeKey(0, 'v', Math.round(wx), Math.floor(wz));
    }
    const isLamp = def.subcategory?.includes('lamp') === true || def.tags.includes('lamp');
    const e: ObjEntry = { id: o.id, sig, group: g, model, placeholder, def, box, wallId, isLamp };
    g.visible = o.id !== this.hiddenId;
    this.objects.set(o.id, e);
    this.group.add(g);
  }

  private removeEntry(e: ObjEntry): void {
    if (e.model) {
      if (e.model.userData.placeholder) disposePlaceholder(e.model);
      else this.assets.release(e.model);
    }
    e.group.removeFromParent();
    this.objects.delete(e.id);
  }

  private baseHeight(o: PlacedObject): number {
    if (!o.supportId || !this.lot) return 0;
    const sup = this.lot.objects[o.supportId];
    const sdef = sup ? this.content.objects[sup.defId] : undefined;
    return sdef?.surfaceHeight ?? 0;
  }

  clear(): void {
    for (const e of [...this.objects.values()]) this.removeEntry(e);
    for (const it of [...this.items.values()]) this.removeItem(it);
    this.lot = null;
    this.highlightId = null;
    this.refreshHighlight();
  }

  /** Hides one object (the one being moved in Buy mode). */
  setHidden(id: Id | null): void {
    if (id === this.hiddenId) return;
    const prev = this.hiddenId ? this.objects.get(this.hiddenId) : null;
    if (prev) prev.group.visible = true;
    this.hiddenId = id;
    const cur = id ? this.objects.get(id) : null;
    if (cur) cur.group.visible = false;
    this.refreshHighlight();
  }

  /** Hides wall-mounted objects whose wall is drawn lowered. */
  applyWallVisibility(isLowered: (wallId: string) => boolean): void {
    for (const e of this.objects.values()) {
      if (!e.wallId) continue;
      e.group.visible = e.id !== this.hiddenId && !isLowered(e.wallId);
    }
  }

  // ---- selection highlight (buy mode) ----

  setHighlight(id: Id | null): void { this.highlightId = id; this.refreshHighlight(); }

  private refreshHighlight(): void {
    const e = this.highlightId ? this.objects.get(this.highlightId) : null;
    if (!e || !e.group.visible) { this.highlight.visible = false; this.highlightFill.visible = false; return; }
    const b = e.box;
    this.highlight.position.copy(b.min).addScalar(-0.03);
    this.highlight.scale.set(b.max.x - b.min.x + 0.06, b.max.y - b.min.y + 0.06, b.max.z - b.min.z + 0.06);
    this.highlight.visible = true;
    const o = this.lot?.objects[e.id];
    if (o) {
      const rs = rotatedSize(e.def.footprint, o.rot);
      this.highlightFill.position.set(o.x, this.baseHeight(o) + 0.006, o.z);
      this.highlightFill.scale.set(rs.w, 1, rs.d);
      this.highlightFill.visible = true;
    }
  }

  // ---- items (served meals) ----

  syncItems(state: WorldState, lotId: Id): void {
    const seen = new Set<Id>();
    for (const it of Object.values(state.items)) {
      if (it.lotId !== lotId || it.position.level !== 0) continue;
      seen.add(it.id);
      const sig = `${it.position.x}|${it.position.z}|${it.position.onObjectId ?? ''}|${it.recipeId}|${it.portions}`;
      const cur = this.items.get(it.id);
      if (cur && cur.sig === sig) continue;
      if (cur) this.removeItem(cur);
      const g = new THREE.Group();
      let y = 0;
      const sup = it.position.onObjectId ? state.lots[lotId]?.objects[it.position.onObjectId] : undefined;
      if (sup) y = this.content.objects[sup.defId]?.surfaceHeight ?? 0;
      g.position.set(it.position.x, y, it.position.z);
      const plate = new THREE.Mesh(this.plateGeo, this.plateMat);
      plate.position.y = 0.013;
      plate.castShadow = true;
      g.add(plate);
      const food = new THREE.Mesh(this.foodGeo, this.foodMaterial(it.recipeId));
      food.position.y = 0.025;
      food.scale.set(1, 0.55 + 0.1 * Math.min(4, it.portions), 1);
      g.add(food);
      if (it.portions > 1) {
        const extra = new THREE.Mesh(this.foodGeo, this.foodMaterial(it.recipeId));
        extra.position.set(0.06, 0.025, -0.04);
        extra.scale.setScalar(0.55);
        g.add(extra);
      }
      this.group.add(g);
      const box = new THREE.Box3(new THREE.Vector3(it.position.x - 0.2, y, it.position.z - 0.2), new THREE.Vector3(it.position.x + 0.2, y + 0.16, it.position.z + 0.2));
      this.items.set(it.id, { id: it.id, sig, group: g, box });
    }
    for (const it of [...this.items.values()]) if (!seen.has(it.id)) this.removeItem(it);
  }

  private removeItem(it: ItemEntry): void {
    it.group.removeFromParent();
    this.items.delete(it.id);
  }

  private foodMaterial(recipeId: string): THREE.MeshStandardMaterial {
    let m = this.foodMats.get(recipeId);
    if (m) return m;
    let h = 0;
    for (const ch of recipeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const palette = ['#d9a441', '#c8553d', '#8fae4a', '#e0c07a', '#b5653a', '#f0d9a0'];
    m = new THREE.MeshStandardMaterial({ color: palette[h % palette.length], roughness: 0.75 });
    this.foodMats.set(recipeId, m);
    return m;
  }

  // ---- lamps ----

  /** Night factor 0..1: lamp emissive glow and the nearest lamps get point lights. */
  setNight(night: number, focus: THREE.Vector3): void {
    this.night = night;
    for (const m of this.assets.lampMaterials) m.emissiveIntensity = 1.6 * night;
    if (this.lampLights.length === 0) return;
    const lamps = [...this.objects.values()].filter((e) => e.isLamp && e.group.visible);
    lamps.sort((a, b) => a.group.position.distanceToSquared(focus) - b.group.position.distanceToSquared(focus));
    this.lampLights.forEach((l, i) => {
      const e = lamps[i];
      if (!e || night <= 0.02) { l.intensity = 0; return; }
      l.position.set((e.box.min.x + e.box.max.x) / 2, Math.max(0.6, e.box.max.y - 0.2), (e.box.min.z + e.box.max.z) / 2);
      l.intensity = 4.2 * night;
    });
  }

  get nightFactor(): number { return this.night; }

  // ---- picking ----

  /** Nearest object or item along a ray. `rugs` includes rug-layer objects. */
  pick(ray: THREE.Ray, rugs: boolean, out: THREE.Vector3): { kind: 'object' | 'item'; id: Id; distance: number } | null {
    let best: { kind: 'object' | 'item'; id: Id; distance: number } | null = null;
    for (const it of this.items.values()) {
      const p = ray.intersectBox(it.box, out);
      if (!p) continue;
      const d = p.distanceTo(ray.origin);
      if (!best || d < best.distance) best = { kind: 'item', id: it.id, distance: d };
    }
    for (const e of this.objects.values()) {
      if (!e.group.visible) continue;
      if (e.def.layer === 'rug' && !rugs) continue;
      const p = ray.intersectBox(e.box, out);
      if (!p) continue;
      // surface items and items win ties against the furniture they sit on
      const d = p.distanceTo(ray.origin) - (e.def.layer === 'surface' ? 0.15 : 0) + (e.def.layer === 'rug' ? 0.2 : 0);
      if (!best || d < best.distance) best = { kind: 'object', id: e.id, distance: d };
    }
    return best;
  }

  boxOf(id: Id): THREE.Box3 | null { return this.objects.get(id)?.box ?? this.items.get(id)?.box ?? null; }

  dispose(): void {
    this.clear();
    this.plateGeo.dispose();
    this.foodGeo.dispose();
    this.plateMat.dispose();
    for (const m of this.foodMats.values()) m.dispose();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.highlightFill.geometry.dispose();
    (this.highlightFill.material as THREE.Material).dispose();
  }
}
