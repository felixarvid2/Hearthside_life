// Furniture and transient items of the active lot: one group per placed object (rot-0 local space placed with
// core/geometry rotationOriginShift + rotYaw, surface items at their support's surfaceHeight), served meals as
// small procedural plates, dirty dishes and floor messes, the buy-mode selection highlight, lamp glow at night and
// picking boxes. Object condition is drawn as cheap overlays sharing one geometry and few materials: a grime decal
// on dirty things (plus stink lines when filthy), a warning marker on broken ones with a spark flicker (electrics,
// appliances) or a puddle (plumbing).

import * as THREE from 'three';
import type { ContentDB, ObjectDef } from '../content/types';
import { rotateLocal, rotatedSize, rotationOriginShift, rotYaw } from '../core/geometry';
import { edgeKey } from '../core/ids';
import type { Id, Lot, PlacedObject, WorldState } from '../core/types';
import { levelY } from '../world/levels';
import { foodColor, mealDomeScale } from './handProps';
import { disposePlaceholder, placeholderModel, type ObjectAssets } from './objectAssets';
import { createObjectAnim, type ObjectAnim } from './objectAnim';
import { objectUses } from './objectUse';

interface ObjEntry {
  id: Id;
  /** Floor the object stands on (Milestone 9). */
  level: number;
  sig: string;
  group: THREE.Group;
  model: THREE.Object3D | null;
  placeholder: boolean;
  def: ObjectDef;
  box: THREE.Box3;
  /** Wall edge behind a wall-mounted object (hidden when that wall is lowered). */
  wallId: string | null;
  isLamp: boolean;
  /** Condition overlay: stage/broken signature, its group (child of `group`) and the parts that animate. */
  condSig: string;
  cond: THREE.Group | null;
  anim: Array<{ node: THREE.Object3D; kind: 'spark' | 'bob'; base: number; phase: number }>;
  /** Milestone 11.5: moving parts and running effects (door pivots, interiors, steam...). */
  objectAnim: ObjectAnim | null;
}

interface ItemEntry { id: Id; level: number; sig: string; group: THREE.Group; box: THREE.Box3 }

export class ObjectsView {
  readonly group = new THREE.Group();
  private readonly objects = new Map<Id, ObjEntry>();
  private readonly items = new Map<Id, ItemEntry>();
  private lot: Lot | null = null;
  private loadToken = 0;
  private hiddenId: Id | null = null;
  /** Milestone 9: objects above this level are hidden; picking is limited to it. */
  private activeLevel = 0;
  private isLowered: (wallId: string) => boolean = () => false;
  private readonly highlight: THREE.LineSegments;
  private readonly highlightFill: THREE.Mesh;
  private highlightId: Id | null = null;
  private readonly plateGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.025, 20);
  private readonly foodGeo = new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  private readonly plateMat = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.4 });
  private readonly foodMats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly dirtyPlateMat = new THREE.MeshStandardMaterial({ color: 0xcfc9bb, roughness: 0.6 });
  private readonly grubMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
  private readonly messGeo = new THREE.CircleGeometry(0.3, 18).rotateX(-Math.PI / 2);
  private readonly crumbGeo = new THREE.BoxGeometry(0.035, 0.02, 0.035);
  private readonly messMats = {
    puddle: new THREE.MeshBasicMaterial({ color: 0x6fa8d8, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    spill: new THREE.MeshBasicMaterial({ color: 0xb5733a, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    crumbs: new THREE.MeshStandardMaterial({ color: 0xa98250, roughness: 0.95 }),
  };
  // condition overlays (textures are drawn on first use)
  private readonly flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private grimeMats: THREE.MeshBasicMaterial[] | null = null;
  private puddleMat: THREE.MeshBasicMaterial | null = null;
  private sprites: { stink: THREE.SpriteMaterial; broken: THREE.SpriteMaterial; spark: THREE.SpriteMaterial } | null = null;
  private readonly textures: THREE.Texture[] = [];
  private animT = 0;
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
    const want = Object.values(lot.objects);
    const seen = new Set<Id>();
    const toLoad = new Set<string>();
    for (const o of want) {
      seen.add(o.id);
      const def = this.content.objects[o.defId];
      if (!def) continue;
      const sig = `${o.defId}|${o.level}|${o.x}|${o.z}|${o.rot}|${o.supportId ?? ''}|${JSON.stringify(o.finishes)}`;
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
      if (Math.abs(wz - Math.round(wz)) < 1e-6) wallId = edgeKey(o.level, 'h', Math.floor(wx), Math.round(wz));
      else if (Math.abs(wx - Math.round(wx)) < 1e-6) wallId = edgeKey(o.level, 'v', Math.round(wx), Math.floor(wz));
    }
    const isLamp = def.subcategory?.includes('lamp') === true || def.tags.includes('lamp');
    // No parts/interiors over a loading or missing placeholder: sync rebuilds the entry with the real model.
    const objectAnim = model && !placeholder ? createObjectAnim(def, model, this.content) : null;
    if (objectAnim) g.add(objectAnim.root);
    const e: ObjEntry = { id: o.id, level: o.level, sig, group: g, model, placeholder, def, box, wallId, isLamp, condSig: '', cond: null, anim: [], objectAnim };
    g.visible = o.id !== this.hiddenId && o.level <= this.activeLevel && !(wallId && this.isLowered(wallId));
    this.objects.set(o.id, e);
    this.group.add(g);
    this.applyCondition(e, o);
  }

  // ---- condition overlays (dirt, broken) ----

  /** Re-draws the condition overlays of every object whose dirt stage or broken state changed. */
  syncCondition(lot: Lot): void {
    for (const e of this.objects.values()) {
      const o = lot.objects[e.id];
      if (o) this.applyCondition(e, o);
    }
  }

  private canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    if (!c) return null;
    draw(c, size);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(t);
    return t;
  }

  private grime(): THREE.MeshBasicMaterial[] {
    if (this.grimeMats) return this.grimeMats;
    const tex = this.canvasTexture(128, (c, n) => {
      let seed = 7;
      const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 16; i++) {
        const x = rnd() * n, y = rnd() * n, r = n * (0.1 + rnd() * 0.16);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(62,48,30,0.55)');
        g.addColorStop(1, 'rgba(62,48,30,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, n, n);
      }
    });
    const mk = (opacity: number) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.grimeMats = [mk(0.55), mk(0.95)];
    return this.grimeMats;
  }

  private spriteSet(): NonNullable<ObjectsView['sprites']> {
    if (this.sprites) return this.sprites;
    const mat = (tex: THREE.Texture | null) => new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const stink = this.canvasTexture(64, (c, n) => {
      c.strokeStyle = 'rgba(122,139,58,0.9)'; c.lineWidth = n * 0.07; c.lineCap = 'round';
      for (const x of [0.28, 0.5, 0.72]) {
        c.beginPath();
        for (let y = 0; y <= 1; y += 0.1) { const px = (x + Math.sin(y * 7 + x * 9) * 0.06) * n; if (y === 0) c.moveTo(px, n * 0.95); else c.lineTo(px, n * (0.95 - y * 0.85)); }
        c.stroke();
      }
    });
    const broken = this.canvasTexture(64, (c, n) => {
      c.fillStyle = '#e8643c'; c.strokeStyle = '#fff6e8'; c.lineWidth = n * 0.06;
      c.beginPath(); c.moveTo(n / 2, n * 0.08); c.lineTo(n * 0.94, n * 0.9); c.lineTo(n * 0.06, n * 0.9); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff6e8'; c.font = `bold ${n * 0.5}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', n / 2, n * 0.64);
    });
    const spark = this.canvasTexture(64, (c, n) => {
      c.strokeStyle = '#ffd54a'; c.lineWidth = n * 0.09; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(n * 0.55, n * 0.05); c.lineTo(n * 0.3, n * 0.5); c.lineTo(n * 0.55, n * 0.5); c.lineTo(n * 0.38, n * 0.95); c.stroke();
    });
    this.sprites = { stink: mat(stink), broken: mat(broken), spark: mat(spark) };
    return this.sprites;
  }

  /** Removes an object's overlay; the flickering sparks own their material copy. */
  private clearCondition(e: ObjEntry): void {
    for (const a of e.anim) if (a.kind === 'spark') (a.node as THREE.Sprite).material.dispose();
    e.cond?.removeFromParent();
    e.cond = null;
    e.anim = [];
  }

  private applyCondition(e: ObjEntry, o: PlacedObject): void {
    const dirt = o.condition?.dirt ?? 0;
    const broken = o.condition?.broken === true;
    const stage = dirt >= 0.6 ? 2 : dirt >= 0.35 ? 1 : 0;
    const sig = `${stage}|${broken}`;
    if (e.condSig === sig && (e.cond !== null || sig === '0|false')) return;
    e.condSig = sig;
    this.clearCondition(e);
    if (stage === 0 && !broken) return;
    const def = e.def, { w, d } = def.footprint;
    const g = new THREE.Group();
    g.name = 'condition';
    const flat = def.layer !== 'wall' && def.layer !== 'ceiling';
    if (stage > 0 && flat && typeof document !== 'undefined') {
      const grime = new THREE.Mesh(this.flatGeo, this.grime()[stage - 1]);
      grime.scale.set(w * 0.95, 1, d * 0.95);
      grime.position.set(w / 2, 0.012, d / 2);
      g.add(grime);
    }
    if (typeof document !== 'undefined') {
      const sp = this.spriteSet();
      let top = def.height + 0.3;
      if (stage === 2) {
        const s = new THREE.Sprite(sp.stink);
        s.scale.set(0.34, 0.34, 1);
        s.position.set(w / 2, top, d / 2);
        g.add(s);
        e.anim.push({ node: s, kind: 'bob', base: top, phase: (w * 3 + d) % 6 });
        top += 0.4;
      }
      if (broken) {
        const s = new THREE.Sprite(sp.broken);
        s.scale.set(0.4, 0.4, 1);
        s.position.set(w / 2, top, d / 2);
        g.add(s);
        e.anim.push({ node: s, kind: 'bob', base: top, phase: 1.3 });
        if (def.tags.includes('plumbing')) {
          const pm = (this.puddleMat ??= this.messMats.puddle.clone());
          const pud = new THREE.Mesh(this.messGeo, pm);
          pud.scale.set(1.1, 1, 0.8);
          pud.position.set(w / 2, 0.014, d + 0.2);
          g.add(pud);
        } else {
          const sparkle = new THREE.Sprite(sp.spark.clone());
          sparkle.scale.set(0.3, 0.3, 1);
          sparkle.position.set(w / 2 + 0.08, Math.max(0.3, def.height * 0.75), d / 2 + Math.min(0.3, d / 2));
          g.add(sparkle);
          e.anim.push({ node: sparkle, kind: 'spark', base: sparkle.position.y, phase: (w + d * 2) % 5 });
        }
      }
    }
    e.cond = g;
    e.group.add(g);
  }

  /**
   * Per-frame flicker/bob of condition overlays and (Milestone 11.5) moving parts driven by `objectUses`.
   * `frame` carries the simulation clock; openness is tweened in game minutes, effects in real seconds.
   */
  animate(dt: number, reducedMotion: boolean, frame?: { state: WorldState; now: number }): void {
    this.animT += dt;
    const t = this.animT;
    const uses = frame ? objectUses(frame.state) : null;
    for (const e of this.objects.values()) {
      if (!e.group.visible) continue;
      for (const a of e.anim) {
        if (a.kind === 'bob') a.node.position.y = reducedMotion ? a.base : a.base + 0.04 * Math.sin(t * 2 + a.phase);
        else {
          const sprite = a.node as THREE.Sprite;
          const f = reducedMotion ? 1 : Math.max(0, Math.sin(t * 11 + a.phase)) * Math.max(0, Math.sin(t * 3.1 + a.phase * 2)) ;
          sprite.material.opacity = 0.15 + 0.85 * Math.min(1, f * 1.6);
        }
      }
      if (frame && e.objectAnim) e.objectAnim.update(uses?.get(e.id) ?? [], frame.now, dt, reducedMotion);
    }
  }

  private removeEntry(e: ObjEntry): void {
    this.clearCondition(e);
    e.objectAnim?.dispose();
    if (e.model) {
      if (e.model.userData.placeholder) disposePlaceholder(e.model);
      else this.assets.release(e.model);
    }
    e.group.removeFromParent();
    this.objects.delete(e.id);
  }

  /** Ground height under a point of a level (grass sits slightly below floors; upper levels are at their floor height). */
  groundAt: (x: number, z: number, level?: number) => number = () => 0;

  private baseHeight(o: PlacedObject): number {
    if (!o.supportId || !this.lot) return this.groundAt(o.x + 0.5, o.z + 0.5, o.level);
    const sup = this.lot.objects[o.supportId];
    const sdef = sup ? this.content.objects[sup.defId] : undefined;
    return levelY(o.level) + (sdef?.surfaceHeight ?? 0);
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

  /** Hides wall-mounted objects whose wall is drawn lowered, and (Milestone 9) everything above the active level. */
  applyWallVisibility(isLowered: (wallId: string) => boolean): void {
    this.isLowered = isLowered;
    for (const e of this.objects.values()) {
      e.group.visible = e.id !== this.hiddenId && e.level <= this.activeLevel && !(e.wallId && isLowered(e.wallId));
    }
    for (const it of this.items.values()) it.group.visible = it.level <= this.activeLevel;
    this.refreshHighlight();
  }

  /** Milestone 9: shows the objects of levels 0..level and picks only on `level`. */
  setActiveLevel(level: number): void {
    if (level === this.activeLevel) return;
    this.activeLevel = level;
    this.applyWallVisibility(this.isLowered);
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
      if (it.lotId !== lotId) continue;
      seen.add(it.id);
      const sig = `${it.kind}|${it.position.level}|${it.position.x}|${it.position.z}|${it.position.onObjectId ?? ''}|${it.recipeId}|${it.portions}|${it.quality}`;
      const cur = this.items.get(it.id);
      if (cur && cur.sig === sig) continue;
      if (cur) this.removeItem(cur);
      const g = new THREE.Group();
      let y = levelY(it.position.level);
      const sup = it.position.onObjectId ? state.lots[lotId]?.objects[it.position.onObjectId] : undefined;
      if (sup) y += this.content.objects[sup.defId]?.surfaceHeight ?? 0;
      g.position.set(it.position.x, y, it.position.z);
      g.visible = it.position.level <= this.activeLevel;
      let top = 0.16;
      if (it.kind === 'mess') {
        this.buildMess(g, it);
        top = 0.06;
      } else if (it.kind === 'dishes') {
        // a leaning stack of dirty plates with a smear of leftovers on top
        const n = Math.min(4, Math.max(1, it.portions));
        for (let i = 0; i < n; i++) {
          const plate = new THREE.Mesh(this.plateGeo, this.dirtyPlateMat);
          plate.position.set(((i * 37) % 5 - 2) * 0.012, 0.013 + i * 0.024, ((i * 53) % 5 - 2) * 0.012);
          plate.castShadow = true;
          g.add(plate);
        }
        const grub = new THREE.Mesh(this.foodGeo, this.grubMat);
        grub.position.set(0.02, 0.013 + n * 0.024, 0);
        grub.scale.set(0.7, 0.25, 0.7);
        g.add(grub);
        top = 0.04 + n * 0.024;
      } else {
        const plate = new THREE.Mesh(this.plateGeo, this.plateMat);
        plate.position.y = 0.013;
        plate.castShadow = true;
        g.add(plate);
        const food = new THREE.Mesh(this.foodGeo, this.foodMaterial(it.recipeId));
        food.position.y = 0.025;
        food.scale.set(1, mealDomeScale(it.portions), 1);
        g.add(food);
        if (it.portions > 1) {
          const extra = new THREE.Mesh(this.foodGeo, this.foodMaterial(it.recipeId));
          extra.position.set(0.06, 0.025, -0.04);
          extra.scale.setScalar(0.55);
          g.add(extra);
        }
      }
      this.group.add(g);
      const box = new THREE.Box3(new THREE.Vector3(it.position.x - 0.2, y, it.position.z - 0.2), new THREE.Vector3(it.position.x + 0.2, y + top, it.position.z + 0.2));
      this.items.set(it.id, { id: it.id, level: it.position.level, sig, group: g, box });
    }
    for (const it of [...this.items.values()]) if (!seen.has(it.id)) this.removeItem(it);
  }

  /** A floor mess: a puddle or spill disc sized by severity, or a few scattered crumbs. */
  private buildMess(g: THREE.Group, it: { recipeId: string; quality: number }): void {
    if (it.recipeId === 'crumbs') {
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Mesh(this.crumbGeo, this.messMats.crumbs);
        c.position.set(((i * 41) % 7 - 3) * 0.06, 0.012, ((i * 29) % 7 - 3) * 0.06);
        c.rotation.y = i * 1.1;
        g.add(c);
      }
      return;
    }
    const disc = new THREE.Mesh(this.messGeo, it.recipeId === 'spill' ? this.messMats.spill : this.messMats.puddle);
    const r = 0.6 + 0.6 * Math.min(1, Math.max(0, it.quality));
    disc.scale.set(r, 1, r * 0.85);
    disc.position.y = 0.008;
    g.add(disc);
  }

  private removeItem(it: ItemEntry): void {
    it.group.removeFromParent();
    this.items.delete(it.id);
  }

  private foodMaterial(recipeId: string): THREE.MeshStandardMaterial {
    let m = this.foodMats.get(recipeId);
    if (m) return m;
    // the same recipe colour as the plate in hand (handProps.foodColor)
    m = new THREE.MeshStandardMaterial({ color: foodColor(recipeId), roughness: 0.75 });
    this.foodMats.set(recipeId, m);
    return m;
  }

  // ---- lamps ----

  /** Night factor 0..1: lamp emissive glow and the nearest lamps get point lights. */
  setNight(night: number, focus: THREE.Vector3): void {
    this.night = night;
    for (const m of this.assets.lampMaterials) m.emissiveIntensity = 1.6 * night;
    if (this.lampLights.length === 0) return;
    if (night <= 0.02) { for (const l of this.lampLights) l.intensity = 0; return; }
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
      if (it.level !== this.activeLevel) continue;
      const p = ray.intersectBox(it.box, out);
      if (!p) continue;
      const d = p.distanceTo(ray.origin);
      if (!best || d < best.distance) best = { kind: 'item', id: it.id, distance: d };
    }
    for (const e of this.objects.values()) {
      // a staircase can also be picked from the floor it arrives on
      if (!e.group.visible || (e.level !== this.activeLevel && !(e.def.stair && e.level + 1 === this.activeLevel))) continue;
      if (e.def.layer === 'rug' && !rugs) continue;
      const p = ray.intersectBox(e.box, out);
      if (!p) continue;
      // surface items and items win ties against the furniture they sit on
      const d = p.distanceTo(ray.origin) - (e.def.layer === 'surface' ? 0.15 : 0) + (e.def.layer === 'rug' ? 0.2 : 0);
      if (!best || d < best.distance) best = { kind: 'object', id: e.id, distance: d };
    }
    return best;
  }

  /** True when the object shows its real model (not still loading, not the missing-model placeholder). */
  hasModel(id: Id): boolean { const e = this.objects.get(id); return !!e && !e.placeholder; }

  boxOf(id: Id): THREE.Box3 | null { return this.objects.get(id)?.box ?? this.items.get(id)?.box ?? null; }

  /** The placed object's group (rot-0 local space; visibility already follows level, cutaway and hiding). */
  rootOf(id: Id): THREE.Object3D | null { return this.objects.get(id)?.group ?? null; }

  dispose(): void {
    this.clear();
    this.plateGeo.dispose();
    this.foodGeo.dispose();
    this.plateMat.dispose();
    this.dirtyPlateMat.dispose();
    this.grubMat.dispose();
    this.messGeo.dispose();
    this.crumbGeo.dispose();
    this.flatGeo.dispose();
    for (const m of Object.values(this.messMats)) m.dispose();
    for (const m of this.grimeMats ?? []) m.dispose();
    this.puddleMat?.dispose();
    if (this.sprites) { this.sprites.stink.dispose(); this.sprites.broken.dispose(); this.sprites.spark.dispose(); }
    for (const t of this.textures) t.dispose();
    for (const m of this.foodMats.values()) m.dispose();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.highlightFill.geometry.dispose();
    (this.highlightFill.material as THREE.Material).dispose();
  }
}
