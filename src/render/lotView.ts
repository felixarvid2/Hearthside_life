// Construction rendering of the active lot: floors (merged per finish, world-aligned UVs, a thin slab),
// walls (merged per side finish, holes for openings, corner posts, top caps), door and window meshes, the
// walls up / cutaway / down modes and the in-world paint preview. Pure view: nothing here changes the state.
//
// UVs follow src/render/textures/surfaceTextures.ts: walls u = world coordinate along the wall / repeat,
// v = height / 2.8; floors uv = (x, z) / repeat.
//
// Wall geometry: a wall on an edge covers its edge minus half a thickness at both ends; a post (thickness x
// thickness) fills every grid vertex that has a wall, so runs, corners, T-junctions and free ends look solid
// without overlapping (z-fighting) faces. Exposed post faces take the finish of the wall side they continue.

import * as THREE from 'three';
import type { ContentDB, OpeningDef, SurfaceDesign } from '../content/types';
import { edgeKey, tileKey } from '../core/ids';
import type { CutawayMode } from '../game/api';
import type { PaintHighlight } from '../game/GameCore';
import type { FinishRef, Lot, Wall } from '../core/types';
import { computeRooms } from '../world/rooms';
import { tileOnSide } from '../world/walls';
import { buildOpeningMesh, openingCutout, setDoorOpen, WALL_THICKNESS } from './openingMeshes';
import { getSurfaceTexture, releaseSurfaceTexture, type TextureQuality } from './textures/surfaceTextures';
import { GeoBuilder, type V3 } from './geo';

export const STUB_HEIGHT = 0.3;
const T = WALL_THICKNESS;
const HT = T / 2;
const CAP_H = 0.035;
const CAP_OUT = 0.012;
const TEX_H = 2.8;
export const SLAB_DEPTH = 0.08;

interface Hole { a: number; b: number; bottom: number; top: number }

export interface DoorInfo { group: THREE.Group; x: number; z: number; open: number; target: number }

export interface WallHit { wallId: string; side: 'a' | 'b'; distance: number; point: THREE.Vector3 }

export class LotView {
  readonly group = new THREE.Group();
  private floorGroup = new THREE.Group();
  private wallGroup = new THREE.Group();
  private openingGroup = new THREE.Group();
  private previewGroup = new THREE.Group();
  private lot: Lot | null = null;
  /** Wall ids currently drawn lowered. */
  private lowered = new Set<string>();
  private indoor: Uint8Array = new Uint8Array(0);
  private mode: CutawayMode = 'cutaway';
  private viewDir = new THREE.Vector3(1, 0, 1);
  private readonly materials = new Map<string, { mat: THREE.MeshStandardMaterial; tex: THREE.Texture | null }>();
  private readonly trim = new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.7, name: 'wall-trim' });
  private readonly cap = new THREE.MeshStandardMaterial({ color: 0xe9dcc6, roughness: 0.65, name: 'wall-cap' });
  private readonly slab = new THREE.MeshStandardMaterial({ color: 0xcdbfa9, roughness: 0.9, name: 'floor-slab' });
  private readonly openingsByWall = new Map<string, THREE.Group>();
  readonly doors: DoorInfo[] = [];
  private previewMats: Array<{ mat: THREE.MeshStandardMaterial; tex: THREE.Texture | null }> = [];
  private readonly boxes = new Map<string, THREE.Box3>();
  private readonly tmpV = new THREE.Vector3();

  constructor(private readonly content: ContentDB, private quality: TextureQuality) {
    this.group.name = 'lot';
    this.group.add(this.floorGroup, this.wallGroup, this.openingGroup, this.previewGroup);
  }

  setQuality(q: TextureQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    if (this.lot) { this.clearMaterials(); this.build(this.lot); }
  }

  // ---------------------------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------------------------

  private design(kind: 'wall' | 'floor', id: string): SurfaceDesign | undefined {
    return kind === 'wall' ? this.content.wallDesigns[id] : this.content.floorDesigns[id];
  }

  private material(kind: 'wall' | 'floor', f: FinishRef): THREE.MeshStandardMaterial {
    const key = `${kind}:${f.designId}:${f.paletteId}`;
    const hit = this.materials.get(key);
    if (hit) return hit.mat;
    const d = this.design(kind, f.designId);
    let tex: THREE.Texture | null = null;
    const mat = new THREE.MeshStandardMaterial({ roughness: kind === 'floor' ? 0.78 : 0.88, name: key });
    if (d) {
      try { tex = getSurfaceTexture(d, f.paletteId, this.quality); mat.map = tex; } catch (e) { console.warn('[render] texture failed', key, e); }
      if (kind === 'floor' && /tile|mosaic|checker|marble/.test(d.family + d.id)) mat.roughness = 0.45;
    } else mat.color.set(kind === 'wall' ? 0xe8dccb : 0xb89a74);
    this.materials.set(key, { mat, tex });
    return mat;
  }

  private repeatOf(kind: 'wall' | 'floor', f: FinishRef): number {
    const d = this.design(kind, f.designId);
    const tex = this.materials.get(`${kind}:${f.designId}:${f.paletteId}`)?.tex;
    const info = tex?.userData.surface as { repeat?: number } | undefined;
    return info?.repeat ?? d?.repeat ?? 1;
  }

  private clearMaterials(): void {
    for (const { mat, tex } of this.materials.values()) { if (tex) releaseSurfaceTexture(tex); mat.dispose(); }
    this.materials.clear();
  }

  // ---------------------------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------------------------

  /** Full rebuild for a lot (floors, walls, openings). */
  build(lot: Lot): void {
    this.lot = lot;
    this.computeIndoor();
    this.computeLowered();
    this.buildFloors();
    this.buildWalls();
    this.buildOpenings();
    this.pruneMaterials();
  }

  /** Rebuild after a construction change. */
  update(lot: Lot, what: 'walls' | 'floors' | 'objects' | 'openings' | 'all'): void {
    if (what === 'objects') return;
    this.lot = lot;
    if (what === 'floors') { this.buildFloors(); this.pruneMaterials(); return; }
    this.build(lot);
  }

  clear(): void {
    this.lot = null;
    for (const g of [this.floorGroup, this.wallGroup]) this.clearGroup(g);
    this.clearOpenings();
    this.setPaintPreview(null, null, true);
    this.clearMaterials();
  }

  private clearGroup(g: THREE.Group): void {
    for (const c of [...g.children]) { c.removeFromParent(); const m = c as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }
  }

  /** Drops materials no current mesh uses. */
  private pruneMaterials(): void {
    const used = new Set<THREE.Material>();
    for (const g of [this.floorGroup, this.wallGroup]) g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) used.add(m.material as THREE.Material); });
    for (const [key, e] of this.materials) {
      if (used.has(e.mat)) continue;
      if (e.tex) releaseSurfaceTexture(e.tex);
      e.mat.dispose();
      this.materials.delete(key);
    }
  }

  private computeIndoor(): void {
    const lot = this.lot!;
    this.indoor = new Uint8Array(lot.width * lot.depth);
    for (const r of computeRooms(lot, 0)) {
      if (r.outdoor) continue;
      for (const t of r.tiles) this.indoor[t.z * lot.width + t.x] = 1;
    }
  }

  isIndoor(x: number, z: number): boolean {
    const lot = this.lot;
    if (!lot || x < 0 || z < 0 || x >= lot.width || z >= lot.depth) return false;
    return this.indoor[z * lot.width + x] === 1;
  }

  private buildFloors(): void {
    const lot = this.lot!;
    this.clearGroup(this.floorGroup);
    const buckets = new Map<string, { f: FinishRef; b: GeoBuilder }>();
    const slab = new GeoBuilder();
    const floored = (x: number, z: number) => !!lot.floors[tileKey(0, x, z)];
    for (const [key, f] of Object.entries(lot.floors)) {
      const [lv, xs, zs] = key.split(':');
      if (Number(lv) !== 0) continue;
      const x = Number(xs), z = Number(zs);
      const k = `${f.designId}:${f.paletteId}`;
      let e = buckets.get(k);
      if (!e) { this.material('floor', f); e = { f, b: new GeoBuilder() }; buckets.set(k, e); }
      const r = this.repeatOf('floor', f);
      e.b.quad([x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1], [0, 1, 0],
        [[x / r, z / r], [(x + 1) / r, z / r], [(x + 1) / r, (z + 1) / r], [x / r, (z + 1) / r]]);
      const y0 = -SLAB_DEPTH;
      if (!floored(x, z - 1)) slab.quad([x, y0, z], [x + 1, y0, z], [x + 1, 0, z], [x, 0, z], [0, 0, -1]);
      if (!floored(x, z + 1)) slab.quad([x, y0, z + 1], [x + 1, y0, z + 1], [x + 1, 0, z + 1], [x, 0, z + 1], [0, 0, 1]);
      if (!floored(x - 1, z)) slab.quad([x, y0, z], [x, y0, z + 1], [x, 0, z + 1], [x, 0, z], [-1, 0, 0]);
      if (!floored(x + 1, z)) slab.quad([x + 1, y0, z], [x + 1, y0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], [1, 0, 0]);
    }
    for (const { f, b } of buckets.values()) {
      const m = new THREE.Mesh(b.build(), this.material('floor', f));
      m.receiveShadow = true;
      m.name = 'floor';
      this.floorGroup.add(m);
    }
    if (!slab.empty) {
      const m = new THREE.Mesh(slab.build(), this.slab);
      m.receiveShadow = true;
      this.floorGroup.add(m);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Cutaway
  // ---------------------------------------------------------------------------------------------

  /** Sets the wall mode and the horizontal direction toward the camera; rebuilds walls when needed. */
  setCutaway(mode: CutawayMode, viewDir: THREE.Vector3): void {
    const changed = mode !== this.mode || Math.sign(viewDir.x) !== Math.sign(this.viewDir.x) || Math.sign(viewDir.z) !== Math.sign(this.viewDir.z);
    this.mode = mode;
    this.viewDir.copy(viewDir);
    if (!changed || !this.lot) return;
    const before = [...this.lowered].sort().join(',');
    this.computeLowered();
    if ([...this.lowered].sort().join(',') !== before) { this.buildWalls(); this.buildOpenings(); this.pruneMaterials(); }
  }

  getCutaway(): CutawayMode { return this.mode; }

  private computeLowered(): void {
    const lot = this.lot!;
    this.lowered.clear();
    if (this.mode === 'up') return;
    for (const w of Object.values(lot.walls)) {
      if (w.level !== 0) continue;
      if (this.mode === 'down') { this.lowered.add(w.id); continue; }
      const camSide: 'a' | 'b' = w.dir === 'h' ? (this.viewDir.z > 0 ? 'b' : 'a') : (this.viewDir.x > 0 ? 'b' : 'a');
      const far = tileOnSide(w, camSide === 'a' ? 'b' : 'a');
      if (this.isIndoor(far.x, far.z)) this.lowered.add(w.id);
    }
  }

  isLowered(wallId: string): boolean { return this.lowered.has(wallId); }

  wallHeight(w: Wall): number { return this.lowered.has(w.id) ? Math.min(STUB_HEIGHT, w.height) : w.height; }

  // ---------------------------------------------------------------------------------------------
  // Walls
  // ---------------------------------------------------------------------------------------------

  private holesFor(w: Wall, H: number): Hole[] {
    const lot = this.lot!;
    const out: Hole[] = [];
    for (const o of Object.values(lot.openings)) {
      if (o.wallId !== w.id) continue;
      const def = this.content.openings[o.defId];
      if (!def) continue;
      const c = openingCutout(def);
      if (c.bottom >= H - 0.01) continue;
      const centre = (w.dir === 'h' ? w.x : w.z) + def.width / 2;
      out.push({ a: centre - c.halfWidth, b: centre + c.halfWidth, bottom: c.bottom, top: Math.min(c.top, H) });
    }
    return out;
  }

  private buildWalls(): void {
    const lot = this.lot!;
    this.clearGroup(this.wallGroup);
    this.boxes.clear();
    const tex = new Map<string, { f: FinishRef; b: GeoBuilder }>();
    const trim = new GeoBuilder();
    const caps = new GeoBuilder();
    const bucket = (f: FinishRef) => {
      const k = `${f.designId}:${f.paletteId}`;
      let e = tex.get(k);
      if (!e) { this.material('wall', f); e = { f, b: new GeoBuilder() }; tex.set(k, e); }
      return e.b;
    };
    const walls = Object.values(lot.walls).filter((w) => w.level === 0);
    const has = (dir: 'h' | 'v', x: number, z: number) => lot.walls[edgeKey(0, dir, x, z)];

    for (const w of walls) {
      const H = this.wallHeight(w);
      const along = w.dir === 'h' ? w.x : w.z;
      const plane = w.dir === 'h' ? w.z : w.x;
      const s0 = along + HT, s1 = along + 1 - HT;
      const P = (s: number, y: number, o: number): V3 => (w.dir === 'h' ? [s, y, o] : [o, y, s]);
      const N = (sign: number): V3 => (w.dir === 'h' ? [0, 0, sign] : [sign, 0, 0]);
      const S = (sign: number): V3 => (w.dir === 'h' ? [sign, 0, 0] : [0, 0, sign]);
      const holes = this.holesFor(w, H);
      const rects = faceRects(s0, s1, holes, H);
      for (const [side, sign] of [['b', 1], ['a', -1]] as const) {
        const f = side === 'a' ? w.sideA : w.sideB;
        const b = bucket(f);
        const r = this.repeatOf('wall', f);
        const o = plane + sign * HT;
        for (const q of rects) {
          b.quad(P(q.s0, q.y0, o), P(q.s1, q.y0, o), P(q.s1, q.y1, o), P(q.s0, q.y1, o), N(sign),
            [[q.s0 / r, q.y0 / TEX_H], [q.s1 / r, q.y0 / TEX_H], [q.s1 / r, q.y1 / TEX_H], [q.s0 / r, q.y1 / TEX_H]]);
        }
      }
      // hole reveals
      for (const h of holes) {
        const lo = plane - HT, hi = plane + HT;
        trim.quad(P(h.a, h.bottom, lo), P(h.a, h.bottom, hi), P(h.a, h.top, hi), P(h.a, h.top, lo), S(1));
        trim.quad(P(h.b, h.bottom, lo), P(h.b, h.bottom, hi), P(h.b, h.top, hi), P(h.b, h.top, lo), S(-1));
        if (h.top < H - 0.001) trim.quad(P(h.a, h.top, lo), P(h.b, h.top, lo), P(h.b, h.top, hi), P(h.a, h.top, hi), [0, -1, 0]);
        if (h.bottom > 0) trim.quad(P(h.a, h.bottom, lo), P(h.b, h.bottom, lo), P(h.b, h.bottom, hi), P(h.a, h.bottom, hi), [0, 1, 0]);
      }
      // cap (skip over a door hole that reaches the top of a stub)
      const capRanges = capSpans(s0 + CAP_OUT, s1 - CAP_OUT, holes.filter((h) => h.top >= H - 0.001));
      for (const [c0, c1] of capRanges) {
        const lo = plane - HT - CAP_OUT, hi = plane + HT + CAP_OUT;
        if (w.dir === 'h') caps.box(c0, H, lo, c1, H + CAP_H, hi, SKIP_BOTTOM);
        else caps.box(lo, H, c0, hi, H + CAP_H, c1, SKIP_BOTTOM);
      }
      // picking box: the drawn part only
      const box = new THREE.Box3();
      if (w.dir === 'h') box.set(this.tmpV.set(w.x, 0, w.z - HT), new THREE.Vector3(w.x + 1, H + CAP_H, w.z + HT));
      else box.set(this.tmpV.set(w.x - HT, 0, w.z), new THREE.Vector3(w.x + HT, H + CAP_H, w.z + 1));
      this.boxes.set(w.id, box);
    }

    // posts at grid vertices
    const verts = new Set<string>();
    for (const w of walls) {
      verts.add(`${w.x},${w.z}`);
      verts.add(w.dir === 'h' ? `${w.x + 1},${w.z}` : `${w.x},${w.z + 1}`);
    }
    for (const key of verts) {
      const [vx, vz] = key.split(',').map(Number) as [number, number];
      const px = has('h', vx, vz), nx = has('h', vx - 1, vz), pz = has('v', vx, vz), nz = has('v', vx, vz - 1);
      const attached = [px, nx, pz, nz].filter((w): w is Wall => !!w);
      const H = Math.max(...attached.map((w) => this.wallHeight(w)));
      const x0 = vx - HT, x1 = vx + HT, z0 = vz - HT, z1 = vz + HT;
      const vWalls = [pz, nz].filter((w): w is Wall => !!w).sort((a, b) => this.wallHeight(b) - this.wallHeight(a));
      const hWalls = [px, nx].filter((w): w is Wall => !!w).sort((a, b) => this.wallHeight(b) - this.wallHeight(a));
      const face = (dirKey: 'px' | 'nx' | 'pz' | 'nz', blocked: Wall | undefined) => {
        if (blocked) return;
        const sign = dirKey[0] === 'p' ? 1 : -1;
        const alongX = dirKey[1] === 'z'; // a +-z face runs along x
        const source = alongX ? hWalls[0] : vWalls[0];
        const f = source ? (sign > 0 ? source.sideB : source.sideA) : null;
        const b = f ? bucket(f) : trim;
        const r = f ? this.repeatOf('wall', f) : 1;
        if (alongX) {
          const z = sign > 0 ? z1 : z0;
          b.quad([x0, 0, z], [x1, 0, z], [x1, H, z], [x0, H, z], [0, 0, sign], [[x0 / r, 0], [x1 / r, 0], [x1 / r, H / TEX_H], [x0 / r, H / TEX_H]]);
        } else {
          const x = sign > 0 ? x1 : x0;
          b.quad([x, 0, z0], [x, 0, z1], [x, H, z1], [x, H, z0], [sign, 0, 0], [[z0 / r, 0], [z1 / r, 0], [z1 / r, H / TEX_H], [z0 / r, H / TEX_H]]);
        }
      };
      face('px', px); face('nx', nx); face('pz', pz); face('nz', nz);
      caps.box(x0 - CAP_OUT, H, z0 - CAP_OUT, x1 + CAP_OUT, H + CAP_H, z1 + CAP_OUT, SKIP_BOTTOM);
    }

    for (const { f, b } of tex.values()) {
      const m = new THREE.Mesh(b.build(), this.material('wall', f));
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'walls';
      this.wallGroup.add(m);
    }
    for (const [b, mat] of [[trim, this.trim], [caps, this.cap]] as const) {
      if (b.empty) continue;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.wallGroup.add(m);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Openings
  // ---------------------------------------------------------------------------------------------

  private clearOpenings(): void {
    for (const c of [...this.openingGroup.children]) c.removeFromParent();
    this.openingsByWall.clear();
    this.doors.length = 0;
  }

  private buildOpenings(): void {
    const lot = this.lot!;
    this.clearOpenings();
    for (const o of Object.values(lot.openings)) {
      const w = lot.walls[o.wallId];
      const def: OpeningDef | undefined = this.content.openings[o.defId];
      if (!w || !def || w.level !== 0) continue;
      if (this.lowered.has(w.id)) continue; // lowered walls show the hole only
      const g = buildOpeningMesh(def, { flip: o.flip });
      const holder = new THREE.Group();
      holder.add(g);
      if (w.dir === 'h') holder.position.set(w.x + def.width / 2, 0, w.z);
      else { holder.position.set(w.x, 0, w.z + def.width / 2); holder.rotation.y = -Math.PI / 2; }
      holder.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      this.openingGroup.add(holder);
      this.openingsByWall.set(w.id, holder);
      if (def.kind === 'door') this.doors.push({ group: g, x: holder.position.x, z: holder.position.z, open: 0, target: 0 });
    }
  }

  /** Eases door leaves toward their targets (set by the caller from nearby people). */
  animateDoors(dt: number, instant: boolean): void {
    for (const d of this.doors) {
      if (d.open === d.target) continue;
      const step = instant ? 1 : dt * 3;
      d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
      setDoorOpen(d.group, d.open);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------------------------------

  /** Nearest wall hit along a ray (drawn height only; lowered walls are stubs). */
  pickWall(ray: THREE.Ray, maxDistance = Infinity): WallHit | null {
    const lot = this.lot;
    if (!lot) return null;
    let best: WallHit | null = null;
    const p = this.tmpV;
    for (const [id, box] of this.boxes) {
      const hit = ray.intersectBox(box, p);
      if (!hit) continue;
      const d = hit.distanceTo(ray.origin);
      if (d >= maxDistance || (best && d >= best.distance)) continue;
      const w = lot.walls[id];
      if (!w) continue;
      const side: 'a' | 'b' = w.dir === 'h' ? (hit.z > w.z ? 'b' : hit.z < w.z ? 'a' : (ray.direction.z < 0 ? 'b' : 'a')) : (hit.x > w.x ? 'b' : hit.x < w.x ? 'a' : (ray.direction.x < 0 ? 'b' : 'a'));
      best = { wallId: id, side, distance: d, point: hit.clone() };
    }
    return best;
  }

  /** World box of a wall as drawn (null when unknown). */
  wallBox(wallId: string): THREE.Box3 | null { return this.boxes.get(wallId) ?? null; }

  // ---------------------------------------------------------------------------------------------
  // Paint preview
  // ---------------------------------------------------------------------------------------------

  /** Shows the finish the tool would apply on the highlighted wall sides or floor tiles (null clears). */
  setPaintPreview(h: PaintHighlight | null, finish: FinishRef | null, ok: boolean): void {
    for (const c of [...this.previewGroup.children]) { c.removeFromParent(); (c as THREE.Mesh).geometry?.dispose(); }
    for (const { mat, tex } of this.previewMats) { if (tex) releaseSurfaceTexture(tex); mat.dispose(); }
    this.previewMats = [];
    const lot = this.lot;
    if (!h || !lot) return;
    const kind: 'wall' | 'floor' = h.kind === 'wallSides' ? 'wall' : 'floor';
    const design = finish ? this.design(kind, finish.designId) : undefined;
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      emissive: new THREE.Color(ok ? 0x3a2c10 : 0x5a1010), emissiveIntensity: ok ? 0.35 : 0.6,
    });
    let tex: THREE.Texture | null = null;
    if (design && finish) {
      try { tex = getSurfaceTexture(design, finish.paletteId, this.quality); mat.map = tex; } catch { /* plain tint */ }
    } else mat.color.set(0xffe2a8);
    if (!ok) mat.color.set(0xffc0b0);
    this.previewMats.push({ mat, tex });
    const r = (tex?.userData.surface as { repeat?: number } | undefined)?.repeat ?? design?.repeat ?? 1;
    const b = new GeoBuilder();
    const E = 0.004;
    if (h.kind === 'wallSides') {
      for (const s of h.sides) {
        const w = lot.walls[s.wallId];
        if (!w) continue;
        const H = this.wallHeight(w);
        const along = w.dir === 'h' ? w.x : w.z;
        const plane = w.dir === 'h' ? w.z : w.x;
        const sign = s.side === 'b' ? 1 : -1;
        const o = plane + sign * (HT + E);
        const P = (sv: number, y: number): V3 => (w.dir === 'h' ? [sv, y, o] : [o, y, sv]);
        const n: V3 = w.dir === 'h' ? [0, 0, sign] : [sign, 0, 0];
        for (const q of faceRects(along - HT, along + 1 + HT, this.holesFor(w, H), H)) {
          b.quad(P(q.s0, q.y0), P(q.s1, q.y0), P(q.s1, q.y1), P(q.s0, q.y1), n,
            [[q.s0 / r, q.y0 / TEX_H], [q.s1 / r, q.y0 / TEX_H], [q.s1 / r, q.y1 / TEX_H], [q.s0 / r, q.y1 / TEX_H]]);
        }
      }
    } else {
      for (const t of h.tiles) {
        const x = t.x, z = t.z;
        b.quad([x, E, z], [x + 1, E, z], [x + 1, E, z + 1], [x, E, z + 1], [0, 1, 0],
          [[x / r, z / r], [(x + 1) / r, z / r], [(x + 1) / r, (z + 1) / r], [x / r, (z + 1) / r]]);
      }
    }
    if (b.empty) return;
    const m = new THREE.Mesh(b.build(), mat);
    m.renderOrder = 2;
    this.previewGroup.add(m);
  }

  dispose(): void {
    this.clear();
    this.trim.dispose();
    this.cap.dispose();
    this.slab.dispose();
  }
}

const SKIP_BOTTOM: ReadonlySet<string> = new Set(['ny']);

interface Rect { s0: number; s1: number; y0: number; y1: number }

/** Rectangles covering a wall face from s0 to s1 and 0 to H, minus the holes. */
export function faceRects(s0: number, s1: number, holes: readonly Hole[], H: number): Rect[] {
  const cuts = [s0, s1, ...holes.flatMap((h) => [h.a, h.b])].filter((v) => v >= s0 && v <= s1).sort((x, y) => x - y);
  const out: Rect[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]!, b = cuts[i + 1]!;
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    const hole = holes.find((h) => mid > h.a && mid < h.b);
    if (!hole) out.push({ s0: a, s1: b, y0: 0, y1: H });
    else {
      if (hole.bottom > 0) out.push({ s0: a, s1: b, y0: 0, y1: Math.min(hole.bottom, H) });
      if (hole.top < H) out.push({ s0: a, s1: b, y0: hole.top, y1: H });
    }
  }
  return out;
}

function capSpans(s0: number, s1: number, gaps: readonly Hole[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cur = s0;
  for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
    if (g.a > cur) out.push([cur, g.a]);
    cur = Math.max(cur, g.b);
  }
  if (cur < s1) out.push([cur, s1]);
  return out;
}
