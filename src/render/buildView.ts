// Build mode overlay drawn on top of the lot: the grid, the preview of the current construction tool
// (translucent ghost walls, red hatched demolition, blocked conflicts, tinted floor tiles, a ghost door or
// window in its wall) and the outline of a hovered or selected room. Pure view: the Game feeds it the
// highlight the build tools computed (BuildHighlight) and the room outlines; nothing here changes the state.
//
// Colour is never the only cue: invalid and removed things are hatched, valid ones are plain translucent.

import * as THREE from 'three';
import type { BuildHighlight } from '../building/buildPlans';
import type { ContentDB, OpeningDef } from '../content/types';
import { footprintTiles } from '../core/geometry';
import { parseEdgeKey } from '../core/ids';
import type { Lot, WorldState } from '../core/types';
import { openingEdgeKeys } from '../world/walls';
import { buildOpeningMesh, WALL_THICKNESS } from './openingMeshes';

const OK = 0x2f8f83;
const BAD = 0xd6483c;
const GONE = 0xe0782e;
const KEEP = 0xffffff;
const T = WALL_THICKNESS;

/** What the preview needs besides the highlight itself. */
export interface BuildViewExtras {
  /** Height of the walls that would be built (ghost walls). */
  wallHeight: number;
  /** Floor tiles are placed ('add') or erased ('remove'). */
  tileMode: 'add' | 'remove';
  /** Door/window definitions of the openings the highlight lists, in order (to draw them as ghosts). */
  openings: Array<{ def: OpeningDef; flip: boolean }>;
}

export interface RoomOutline {
  /** Closed vertex loops (outer boundary first). */
  outlines: ReadonlyArray<ReadonlyArray<{ x: number; z: number }>>;
  tiles: ReadonlyArray<{ x: number; z: number }>;
}

function hatchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 12;
  for (let i = -64; i < 128; i += 24) { ctx.beginPath(); ctx.moveTo(i, 64); ctx.lineTo(i + 64, 0); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BuildView {
  readonly group = new THREE.Group();
  private readonly gridGroup = new THREE.Group();
  private readonly previewGroup = new THREE.Group();
  private readonly roomGroup = new THREE.Group();
  private readonly hatch = hatchTexture();
  private readonly hatchWall: THREE.CanvasTexture;
  private readonly mats = new Map<string, THREE.MeshBasicMaterial>();
  private gridKey = '';

  constructor(private readonly content: ContentDB) {
    this.group.name = 'build-view';
    this.hatchWall = this.hatch.clone();
    this.hatchWall.repeat.set(3, 8);
    this.hatchWall.needsUpdate = true;
    this.group.add(this.gridGroup, this.previewGroup, this.roomGroup);
    this.group.visible = false;
  }

  private mat(color: number, opacity: number, hatched: 'none' | 'tile' | 'wall', depthTest = true): THREE.MeshBasicMaterial {
    const key = `${color}:${opacity}:${hatched}:${depthTest}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthWrite: false, depthTest, side: THREE.DoubleSide,
        ...(hatched === 'tile' ? { map: this.hatch } : hatched === 'wall' ? { map: this.hatchWall } : {}),
      });
      this.mats.set(key, m);
    }
    return m;
  }

  // ---------------------------------------------------------------------------------------------
  // Grid
  // ---------------------------------------------------------------------------------------------

  /** Shows the grid over the lot (null hides it and the preview). */
  setGrid(lot: Lot | null): void {
    this.group.visible = lot !== null;
    if (!lot) { this.clearGroup(this.gridGroup); this.gridKey = ''; this.clearPreview(); this.setRoom(null, 'hover'); return; }
    const key = `${lot.width}x${lot.depth}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    this.clearGroup(this.gridGroup);
    const minor: number[] = [];
    const major: number[] = [];
    const y = 0.018;
    for (let x = 0; x <= lot.width; x++) (x % 4 === 0 ? major : minor).push(x, y, 0, x, y, lot.depth);
    for (let z = 0; z <= lot.depth; z++) (z % 4 === 0 ? major : minor).push(0, y, z, lot.width, y, z);
    for (const [pts, opacity] of [[minor, 0.16], [major, 0.3]] as const) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.LineBasicMaterial({ color: 0x2f2a26, transparent: true, opacity, depthWrite: false });
      const l = new THREE.LineSegments(g, m);
      l.renderOrder = 3;
      this.gridGroup.add(l);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Tool preview
  // ---------------------------------------------------------------------------------------------

  /** Draws the highlight of the current preview (null clears it). */
  setHighlight(h: BuildHighlight | null, ok: boolean, extras: BuildViewExtras, lot: Lot | null, world: WorldState | null): void {
    this.clearPreview();
    if (!h || !lot) return;
    const add = (o: THREE.Object3D, order = 6) => { o.renderOrder = order; this.previewGroup.add(o); };
    const edgeBox = (key: string, height: number, pad: number, y0 = 0): THREE.Mesh => {
      const e = parseEdgeKey(key);
      const geo = e.dir === 'h' ? new THREE.BoxGeometry(1 + T, height, T + pad) : new THREE.BoxGeometry(T + pad, height, 1 + T);
      const m = new THREE.Mesh(geo);
      m.userData.own = true;
      m.position.set(e.dir === 'h' ? e.x + 0.5 : e.x, y0 + height / 2, e.dir === 'h' ? e.z : e.z + 0.5);
      return m;
    };
    const wallMat = ok ? this.mat(OK, 0.5, 'none') : this.mat(BAD, 0.6, 'wall');

    for (const k of h.newWalls) {
      const m = edgeBox(k, extras.wallHeight, 0.02);
      m.material = wallMat;
      add(m);
    }
    for (const k of h.existingWalls) {
      // kept as they are: a thin light line along the top so the player sees where the run goes
      const m = edgeBox(k, 0.05, 0.04, lot.walls[k]?.height ?? 2.8);
      m.material = this.mat(KEEP, 0.85, 'none');
      add(m);
    }
    for (const k of h.removedWalls) {
      const wall = lot.walls[k];
      const m = edgeBox(k, wall?.height ?? 2.8, 0.05);
      m.material = this.mat(GONE, 0.65, 'wall');
      add(m);
    }
    for (const k of h.removedOpeningEdges) {
      const m = edgeBox(k, 2.1, 0.07);
      m.material = this.mat(GONE, 0.7, 'wall', false);
      add(m, 8);
    }

    // doors and windows: a flat bar on the floor (always visible) and the ghost model in the wall
    const openingBar = ok ? this.mat(OK, 0.85, 'none', false) : this.mat(BAD, 0.9, 'tile', false);
    for (const k of h.openingEdges) {
      const m = edgeBox(k, 0.06, 0.1);
      m.material = openingBar;
      add(m, 8);
    }
    let at = 0;
    for (const o of extras.openings) {
      const span = Math.max(1, Math.round(o.def.width));
      const first = h.openingEdges[at];
      at += span;
      if (!first) break;
      const e = parseEdgeKey(first);
      const g = buildOpeningMesh(o.def, { flip: o.flip });
      const holder = new THREE.Group();
      holder.add(g);
      if (e.dir === 'h') holder.position.set(e.x + o.def.width / 2, 0, e.z);
      else { holder.position.set(e.x, 0, e.z + o.def.width / 2); holder.rotation.y = -Math.PI / 2; }
      const ghost = ok ? this.mat(OK, 0.55, 'none', false) : this.mat(BAD, 0.6, 'tile', false);
      holder.traverse((n) => { const mesh = n as THREE.Mesh; if (mesh.isMesh) { mesh.material = ghost; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 7; } });
      add(holder, 7);
    }

    // floor tiles
    if (h.tiles.length) {
      const remove = extras.tileMode === 'remove';
      const mat = !ok ? this.mat(BAD, 0.6, 'tile') : remove ? this.mat(GONE, 0.6, 'tile') : this.mat(OK, 0.42, 'none');
      this.tileMesh(h.tiles, mat, 0.026, add);
    }

    // what blocks it
    const badMat = this.mat(BAD, 0.7, 'tile', false);
    const badTiles: Array<{ x: number; z: number }> = [];
    for (const c of h.blocked) {
      switch (c.kind) {
        case 'edge': { const m = edgeBox(c.key, 0.9, 0.12); m.material = badMat; add(m, 9); break; }
        case 'tile': badTiles.push({ x: c.x, z: c.z }); break;
        case 'object': {
          const o = lot.objects[c.objectId];
          const def = o ? this.content.objects[o.defId] : undefined;
          if (o && def) badTiles.push(...footprintTiles(o.x, o.z, def.footprint, o.rot));
          break;
        }
        case 'opening': {
          const o = lot.openings[c.openingId];
          if (o) for (const k of openingEdgeKeys(o)) { const m = edgeBox(k, 2.1, 0.1); m.material = badMat; add(m, 9); }
          break;
        }
        case 'person': {
          const loc = world?.people[c.personId]?.location;
          if (loc && loc.kind === 'lot') {
            const geo = new THREE.RingGeometry(0.3, 0.42, 28).rotateX(-Math.PI / 2);
            const ring = new THREE.Mesh(geo, badMat);
            ring.userData.own = true;
            ring.position.set(loc.x, 0.04, loc.z);
            add(ring, 9);
          }
          break;
        }
      }
    }
    if (badTiles.length) this.tileMesh(badTiles, badMat, 0.03, add);
  }

  private tileMesh(tiles: ReadonlyArray<{ x: number; z: number }>, mat: THREE.Material, y: number, add: (o: THREE.Object3D, order?: number) => void): void {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const t of tiles) {
      const b = pos.length / 3;
      const i = 0.015;
      pos.push(t.x + i, y, t.z + i, t.x + 1 - i, y, t.z + i, t.x + 1 - i, y, t.z + 1 - i, t.x + i, y, t.z + 1 - i);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.own = true;
    add(mesh, 5);
  }

  private clearPreview(): void { this.clearGroup(this.previewGroup); }

  // ---------------------------------------------------------------------------------------------
  // Room outline
  // ---------------------------------------------------------------------------------------------

  /** Outlines and tints a room (hover is light, selected is stronger); null clears it. */
  setRoom(room: RoomOutline | null, style: 'hover' | 'selected'): void {
    this.clearGroup(this.roomGroup);
    if (!room) return;
    const fill = this.mat(OK, style === 'selected' ? 0.3 : 0.18, 'none');
    const line = this.mat(OK, 0.95, 'none');
    this.tileMesh(room.tiles, fill, 0.022, (o, order) => { o.renderOrder = order ?? 5; this.roomGroup.add(o); });
    const w = style === 'selected' ? 0.14 : 0.1;
    const y = 0.034;
    const pos: number[] = [];
    const idx: number[] = [];
    for (const loop of room.outlines) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]!, b = loop[(i + 1) % loop.length]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len;
        const nx = -uz * (w / 2), nz = ux * (w / 2);
        const ex = ux * (w / 2), ez = uz * (w / 2);
        const base = pos.length / 3;
        pos.push(a.x - ex + nx, y, a.z - ez + nz, b.x + ex + nx, y, b.z + ez + nz, b.x + ex - nx, y, b.z + ez - nz, a.x - ex - nx, y, a.z - ez - nz);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, line);
    m.userData.own = true;
    m.renderOrder = 6;
    this.roomGroup.add(m);
  }

  // ---------------------------------------------------------------------------------------------

  private clearGroup(g: THREE.Group): void {
    for (const c of [...g.children]) {
      c.removeFromParent();
      // ghost opening meshes share their prototypes' geometry: only dispose what this view made
      if (c.userData.own) (c as THREE.Mesh).geometry.dispose();
      if ((c as THREE.LineSegments).isLineSegments) { (c as THREE.LineSegments).geometry.dispose(); ((c as THREE.LineSegments).material as THREE.Material).dispose(); }
    }
  }

  dispose(): void {
    this.setGrid(null);
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    this.hatch.dispose();
    this.hatchWall.dispose();
  }
}
