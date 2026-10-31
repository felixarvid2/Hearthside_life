// Procedural door and window meshes, and the wall cut-out each opening needs.
//
// Local space of a built opening (place it with the renderer's wall transform):
//   origin = centre of the wall edge at floor level; +x runs along the wall (the tile spans x -0.5..0.5 for
//   a 1-tile opening), +y up, z across the wall thickness (wall faces at z = +-WALL_THICKNESS / 2).
//   Everything stays inside x -width/2..width/2, so neighbouring openings never overlap.
//
// Doors: the leaf is a child Group named OPENING_LEAF_NAME ('leaf') whose origin is the hinge axis (on the
// frame edge at -x, on the +z face of the closed leaf). Rotating it by a negative angle about y swings the
// door open toward +z; use setDoorOpen(). For a door that should open toward -z, or hinge on +x, pass
// { flip: true } (the whole opening is turned 180 degrees about y).
//
// Meshes are merged per material (frame, leaf, glass, hardware), so an opening costs 3-5 draw calls.
// Geometry and materials are shared between instances of the same definition: never dispose them on a
// single instance; call disposeOpeningMeshes() when tearing the renderer down.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OpeningDef } from '../content/types';

export const WALL_THICKNESS = 0.12;
export const OPENING_LEAF_NAME = 'leaf';

/** The rectangle to cut out of the wall, in the opening's local space (x centred on the tile). */
export interface OpeningCutout {
  bottom: number;
  top: number;
  halfWidth: number;
}

function sNum(def: OpeningDef, key: string, fallback: number): number {
  const v = def.style[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function sStr(def: OpeningDef, key: string, fallback: string): string {
  const v = def.style[key];
  return typeof v === 'string' ? v : fallback;
}
function sBool(def: OpeningDef, key: string): boolean {
  return def.style[key] === true;
}

/** Hole width in metres (style.holeWidth, kept 4 cm inside the tile span). */
function holeWidth(def: OpeningDef): number {
  const fallback = def.width * (def.kind === 'door' ? 0.86 : 0.8);
  return Math.min(sNum(def, 'holeWidth', fallback), def.width - 0.04);
}

/** Wall hole for an opening: from `bottom` to `top` metres above the floor, x in [-halfWidth, halfWidth]. */
export function openingCutout(def: OpeningDef): OpeningCutout {
  const bottom = def.kind === 'door' ? 0 : def.sill;
  return { bottom, top: bottom + def.height, halfWidth: holeWidth(def) / 2 };
}

// ---------------------------------------------------------------------------------------------
// Materials (shared)
// ---------------------------------------------------------------------------------------------

type MaterialKind = 'paint' | 'wood' | 'metal' | 'glass' | 'frosted';
const materials = new Map<string, THREE.Material>();

function material(kind: MaterialKind, color: string): THREE.Material {
  const key = `${kind}:${color}`;
  let m = materials.get(key);
  if (m) return m;
  switch (kind) {
    case 'paint': m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }); break;
    case 'wood': m = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0 }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.85 }); break;
    case 'glass':
      m = new THREE.MeshStandardMaterial({
        color: '#cfe4ec', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false,
        side: THREE.DoubleSide,
      });
      break;
    case 'frosted':
      m = new THREE.MeshStandardMaterial({
        color: '#eef3f3', roughness: 0.6, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false,
        side: THREE.DoubleSide,
      });
      break;
  }
  m.name = `opening-${key}`;
  materials.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Geometry collection
// ---------------------------------------------------------------------------------------------

/** Collects primitive geometries per bucket and merges each bucket into one mesh. */
class Parts {
  private buckets = new Map<string, THREE.BufferGeometry[]>();

  add(bucket: string, g: THREE.BufferGeometry): void {
    const list = this.buckets.get(bucket) ?? [];
    list.push(g); // all primitives are indexed, as mergeGeometries requires
    this.buckets.set(bucket, list);
  }

  /** Axis-aligned box from min corner to max corner. */
  box(bucket: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
    if (sx < 1e-5 || sy < 1e-5 || sz < 1e-5) return;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(bucket, g);
  }

  /** A box of length `len` centred at (cx, cy, cz), rotated by `angle` about z (for braces). */
  bar(bucket: string, cx: number, cy: number, cz: number, len: number, thick: number, depth: number, angle: number): void {
    const g = new THREE.BoxGeometry(len, thick, depth);
    g.rotateZ(angle);
    g.translate(cx, cy, cz);
    this.add(bucket, g);
  }

  mesh(bucket: string, mat: THREE.Material, name: string): THREE.Mesh | null {
    const list = this.buckets.get(bucket);
    if (!list || list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) throw new Error(`openingMeshes: could not merge '${bucket}'`);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    const glass = mat.transparent;
    mesh.castShadow = !glass;
    mesh.receiveShadow = !glass;
    if (glass) mesh.renderOrder = 1;
    return mesh;
  }
}

// ---------------------------------------------------------------------------------------------
// Shared frame: lining, stops, architraves
// ---------------------------------------------------------------------------------------------

interface FrameDims { hw: number; bottom: number; top: number; fw: number; cw: number; tileHalf: number }

function frameDims(def: OpeningDef): FrameDims {
  const cut = openingCutout(def);
  const tileHalf = def.width / 2;
  const fw = sNum(def, 'frame', 0.05);
  // architraves stay 5 mm inside the tile so neighbouring openings never collide
  const cw = Math.max(0.02, Math.min(sNum(def, 'casing', 0.06), tileHalf - cut.halfWidth - 0.005));
  return { hw: cut.halfWidth, bottom: cut.bottom, top: cut.top, fw, cw, tileHalf };
}

function addLiningAndCasing(p: Parts, d: FrameDims, withBottom: boolean): void {
  const T = WALL_THICKNESS;
  const lz = T / 2 + 0.004;
  // jamb lining (covers the wall reveal) and head
  p.box('frame', -d.hw, d.bottom, -lz, -d.hw + d.fw, d.top, lz);
  p.box('frame', d.hw - d.fw, d.bottom, -lz, d.hw, d.top, lz);
  p.box('frame', -d.hw, d.top - d.fw, -lz, d.hw, d.top, lz);
  if (withBottom) p.box('frame', -d.hw, d.bottom, -lz, d.hw, d.bottom + d.fw * 0.8, lz);
  // architraves on both faces: flat casing plus a raised back band on the outer edge
  for (const side of [-1, 1]) {
    const z0 = side * (T / 2), z1 = side * (T / 2 + 0.016), z2 = side * (T / 2 + 0.024);
    const casingBottom = withBottom ? d.bottom : 0;
    p.box('frame', -d.hw - d.cw, casingBottom, z0, -d.hw + 0.006, d.top + d.cw, z1);
    p.box('frame', d.hw - 0.006, casingBottom, z0, d.hw + d.cw, d.top + d.cw, z1);
    p.box('frame', -d.hw - d.cw, d.top - 0.006, z0, d.hw + d.cw, d.top + d.cw, z1);
    const bb = Math.min(0.016, d.cw * 0.35);
    p.box('frame', -d.hw - d.cw, casingBottom, z1, -d.hw - d.cw + bb, d.top + d.cw, z2);
    p.box('frame', d.hw + d.cw - bb, casingBottom, z1, d.hw + d.cw, d.top + d.cw, z2);
    p.box('frame', -d.hw - d.cw, d.top + d.cw - bb, z1, d.hw + d.cw, d.top + d.cw, z2);
  }
}

// ---------------------------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------------------------

const LEAF_T = 0.04;

/** Rectangular frame of members around an opening in leaf-local space (x0..x1, y0..y1). */
function addGlazing(p: Parts, bucket: string, glassBucket: string, x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, zc: number, barT: number): void {
  p.box(glassBucket, x0, y0, zc - 0.003, x1, y1, zc + 0.003);
  const bw = 0.018;
  for (let i = 1; i < nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    p.box(bucket, x - bw / 2, y0, zc - barT / 2, x + bw / 2, y1, zc + barT / 2);
  }
  for (let j = 1; j < ny; j++) {
    const y = y0 + ((y1 - y0) * j) / ny;
    p.box(bucket, x0, y - bw / 2, zc - barT / 2, x1, y + bw / 2, zc + barT / 2);
  }
}

/** Raised-and-fielded panel between frame members (leaf-local; leaf occupies z -LEAF_T..0). */
function addPanel(p: Parts, x0: number, y0: number, x1: number, y1: number): void {
  const zc = -LEAF_T / 2;
  p.box('leaf', x0, y0, zc - LEAF_T * 0.28, x1, y1, zc + LEAF_T * 0.28);
  const inset = Math.min(0.035, (x1 - x0) * 0.2, (y1 - y0) * 0.2);
  p.box('leaf', x0 + inset, y0 + inset, zc - LEAF_T * 0.4, x1 - inset, y1 - inset, zc + LEAF_T * 0.4);
}

function buildLeaf(def: OpeningDef, p: Parts, leafW: number, y0: number, y1: number): void {
  const kind = sStr(def, 'leaf', 'panel');
  const zc = -LEAF_T / 2;
  const full = (x0: number, ya: number, x1: number, yb: number) => p.box('leaf', x0, ya, -LEAF_T, x1, yb, 0);
  if (kind === 'plank') {
    const n = 5;
    const bw = leafW / n;
    p.box('leaf', 0.004, y0, zc - LEAF_T * 0.22, leafW - 0.004, y1, zc + LEAF_T * 0.22); // backing behind the grooves
    for (let i = 0; i < n; i++) full(i * bw + 0.002, y0, (i + 1) * bw - 0.002, y1);
    // ledges and braces on the -z face
    const ledgeYs = [y0 + 0.22, (y0 + y1) / 2, y1 - 0.22];
    const lx0 = 0.035, lx1 = leafW - 0.035, lh = 0.13, ld = 0.022;
    for (const ly of ledgeYs) p.box('leaf', lx0, ly - lh / 2, -LEAF_T - ld, lx1, ly + lh / 2, -LEAF_T);
    for (let k = 0; k < 2; k++) {
      const ya = (ledgeYs[k] ?? 0) + lh / 2, yb = (ledgeYs[k + 1] ?? 0) - lh / 2;
      const xa = lx0 + 0.04, xb = lx1 - 0.04;
      const len = Math.hypot(xb - xa, yb - ya);
      p.bar('leaf', (xa + xb) / 2, (ya + yb) / 2, -LEAF_T - ld / 2, len, 0.11, ld, Math.atan2(yb - ya, xb - xa));
    }
    return;
  }
  // stile-and-rail leaf
  const stile = Math.min(0.11, leafW * 0.15);
  const topRail = 0.11, bottomRail = 0.2, lockRail = 0.16;
  const lockY = Math.min(1.0, (y0 + y1) / 2);
  full(0, y0, stile, y1);
  full(leafW - stile, y0, leafW, y1);
  full(stile, y1 - topRail, leafW - stile, y1);
  full(stile, y0, leafW - stile, y0 + bottomRail);
  full(stile, lockY - lockRail / 2, leafW - stile, lockY + lockRail / 2);
  const muntin = 0.09;
  const cx = leafW / 2;
  const lowerTop = lockY - lockRail / 2, lowerBottom = y0 + bottomRail;
  const upperBottom = lockY + lockRail / 2, upperTop = y1 - topRail;
  const panelRows = Math.max(1, Math.round(sNum(def, 'panelRows', 2)));
  // panels in two columns: one row below the lock rail, panelRows - 1 rows above it (unless glazed)
  const addPanelGrid = (ya: number, yb: number, rows: number) => {
    full(cx - muntin / 2, ya, cx + muntin / 2, yb);
    const rh = (yb - ya - (rows - 1) * muntin) / rows;
    for (let r = 0; r < rows; r++) {
      const pa = ya + r * (rh + muntin), pb = pa + rh;
      if (r > 0) full(stile, pa - muntin, leafW - stile, pa);
      addPanel(p, stile, pa, cx - muntin / 2, pb);
      addPanel(p, cx + muntin / 2, pa, leafW - stile, pb);
    }
  };
  addPanelGrid(lowerBottom, lowerTop, 1);
  if (kind === 'glazed') {
    addGlazing(p, 'leaf', 'glass', stile, upperBottom, leafW - stile, upperTop,
      Math.max(1, Math.round(sNum(def, 'litesX', 2))), Math.max(1, Math.round(sNum(def, 'litesY', 3))), zc, LEAF_T * 0.6);
  } else {
    addPanelGrid(upperBottom, upperTop, Math.max(1, panelRows - 1));
  }
}

function addDoorHardware(def: OpeningDef, p: Parts, leafW: number, y0: number, y1: number): void {
  const handle = sStr(def, 'handle', 'knob');
  const hx = leafW - 0.065, hy = 0.98;
  for (const side of [-1, 1]) {
    const face = side > 0 ? 0 : -LEAF_T;
    const out = (d: number) => face + side * d;
    const rose = new THREE.CylinderGeometry(0.028, 0.028, 0.008, 20);
    rose.rotateX(Math.PI / 2);
    rose.translate(hx, hy, out(0.004));
    p.add('metal', rose);
    const neck = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 12);
    neck.rotateX(Math.PI / 2);
    neck.translate(hx, hy, out(0.03));
    p.add('metal', neck);
    if (handle === 'lever') {
      p.box('metal', hx - 0.12, hy - 0.009, out(0.047) - 0.009, hx + 0.006, hy + 0.009, out(0.047) + 0.009);
    } else {
      const knob = new THREE.SphereGeometry(0.028, 16, 12);
      knob.translate(hx, hy, out(0.06));
      p.add('metal', knob);
    }
    // key escutcheon below the handle
    p.box('metal', hx - 0.009, hy - 0.1, out(0.002) - 0.002, hx + 0.009, hy - 0.06, out(0.002) + 0.002);
  }
  // hinges on the hinge edge
  for (const hy2 of [y0 + 0.22, (y0 + y1) / 2 + 0.25, y1 - 0.22]) p.box('metal', -0.006, hy2 - 0.05, -0.012, 0.004, hy2 + 0.05, 0.002);
}

function buildDoor(def: OpeningDef): THREE.Group {
  const d = frameDims(def);
  const p = new Parts();
  addLiningAndCasing(p, d, false);
  const T = WALL_THICKNESS;
  // threshold and door stops (stops sit on the -z side: the leaf closes against them and opens toward +z)
  p.box('frame', -d.hw, 0, -T / 2 - 0.004, d.hw, 0.012, T / 2 + 0.004);
  const stopZ0 = -LEAF_T / 2 - 0.016, stopZ1 = -LEAF_T / 2;
  p.box('frame', -d.hw + d.fw, 0.012, stopZ0, -d.hw + d.fw + 0.012, d.top - d.fw, stopZ1);
  p.box('frame', d.hw - d.fw - 0.012, 0.012, stopZ0, d.hw - d.fw, d.top - d.fw, stopZ1);
  p.box('frame', -d.hw + d.fw, d.top - d.fw - 0.012, stopZ0, d.hw - d.fw, d.top - d.fw, stopZ1);

  const frameColor = sStr(def, 'frameColor', '#f1ede4');
  const leafKind = sStr(def, 'leaf', 'panel');
  const group = new THREE.Group();
  const frameMesh = p.mesh('frame', material(leafKind === 'plank' ? 'wood' : 'paint', frameColor), 'frame');
  if (frameMesh) group.add(frameMesh);

  const gap = 0.003;
  const leafW = 2 * (d.hw - d.fw) - 2 * gap;
  const y0 = 0.014, y1 = d.top - d.fw - gap;
  const lp = new Parts();
  buildLeaf(def, lp, leafW, y0, y1);
  addDoorHardware(def, lp, leafW, y0, y1);
  const leaf = new THREE.Group();
  leaf.name = OPENING_LEAF_NAME;
  leaf.position.set(-d.hw + d.fw + gap, 0, LEAF_T / 2);
  leaf.userData = { hinge: 'minX', maxSwing: Math.PI / 2, width: leafW };
  const leafColor = sStr(def, 'leafColor', frameColor);
  const leafMesh = lp.mesh('leaf', material(leafKind === 'plank' ? 'wood' : 'paint', leafColor), 'leafBody');
  if (leafMesh) leaf.add(leafMesh);
  const glass = lp.mesh('glass', material(sStr(def, 'glass', 'clear') === 'frosted' ? 'frosted' : 'glass', '#ffffff'), 'glass');
  if (glass) leaf.add(glass);
  const metal = lp.mesh('metal', material('metal', sStr(def, 'hardware', '#b8955a')), 'hardware');
  if (metal) leaf.add(metal);
  group.add(leaf);
  return group;
}

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

const SASH_T = 0.036;

/** A sash: frame members around glass with optional glazing bars, centred on z = zc. */
function addSash(p: Parts, x0: number, y0: number, x1: number, y1: number, zc: number, member: number, nx: number, ny: number, bottomRail = member): void {
  const z0 = zc - SASH_T / 2, z1 = zc + SASH_T / 2;
  p.box('frame', x0, y0, z0, x0 + member, y1, z1);
  p.box('frame', x1 - member, y0, z0, x1, y1, z1);
  p.box('frame', x0 + member, y1 - member, z0, x1 - member, y1, z1);
  p.box('frame', x0 + member, y0, z0, x1 - member, y0 + bottomRail, z1);
  addGlazing(p, 'frame', 'glass', x0 + member, y0 + bottomRail, x1 - member, y1 - member, nx, ny, zc, SASH_T * 0.55);
}

function buildWindow(def: OpeningDef): THREE.Group {
  const d = frameDims(def);
  const p = new Parts();
  addLiningAndCasing(p, d, true);
  const T = WALL_THICKNESS;
  // sill through the wall, protruding on both faces, with an apron under it on each face
  const sx = Math.min(d.hw + d.cw + 0.012, d.tileHalf - 0.004);
  p.box('frame', -sx, d.bottom - 0.032, -T / 2 - 0.035, sx, d.bottom + 0.004, T / 2 + 0.035);
  for (const side of [-1, 1]) {
    p.box('frame', -d.hw - d.cw * 0.6, d.bottom - 0.032 - 0.06, side * (T / 2), d.hw + d.cw * 0.6, d.bottom - 0.032, side * (T / 2 + 0.014));
  }
  const kind = sStr(def, 'window', 'sash');
  const nx = Math.max(1, Math.round(sNum(def, 'litesX', 1)));
  const ny = Math.max(1, Math.round(sNum(def, 'litesY', 1)));
  const ix0 = -d.hw + d.fw, ix1 = d.hw - d.fw;
  const iy0 = d.bottom + d.fw * 0.8, iy1 = d.top - d.fw;
  const member = 0.04;
  if (kind === 'sash') {
    const mid = (iy0 + iy1) / 2;
    const meet = 0.016;
    addSash(p, ix0, iy0, ix1, mid + meet, 0.014, member, nx, ny, member * 1.4);
    addSash(p, ix0, mid - meet, ix1, iy1, -0.014, member, nx, ny);
    // sash lifts on the lower rail
    for (const fx of [-0.25, 0.25]) {
      const hx = (ix0 + ix1) / 2 + fx * (ix1 - ix0);
      p.box('metal', hx - 0.02, iy0 + member * 0.3, 0.014 + SASH_T / 2, hx + 0.02, iy0 + member * 0.9, 0.014 + SASH_T / 2 + 0.012);
    }
  } else if (kind === 'casement') {
    let top = iy1;
    if (sBool(def, 'transom')) {
      const tH = Math.min(0.32, (iy1 - iy0) * 0.3);
      const barY = iy1 - tH;
      p.box('frame', ix0, barY - 0.022, -SASH_T / 2, ix1, barY + 0.022, SASH_T / 2);
      p.box('glass', ix0, barY + 0.022, -0.003, ix1, iy1, 0.003);
      top = barY - 0.022;
    }
    const mx = (ix0 + ix1) / 2;
    p.box('frame', mx - 0.02, iy0, -SASH_T / 2, mx + 0.02, top, SASH_T / 2);
    addSash(p, ix0, iy0, mx - 0.02, top, 0.004, member, nx, ny);
    addSash(p, mx + 0.02, iy0, ix1, top, 0.004, member, nx, ny);
    const hy = (iy0 + top) / 2;
    for (const hx of [mx - 0.02 - member / 2, mx + 0.02 + member / 2]) {
      p.box('metal', hx - 0.006, hy - 0.05, 0.004 + SASH_T / 2, hx + 0.006, hy + 0.05, 0.004 + SASH_T / 2 + 0.014);
    }
  } else {
    addSash(p, ix0, iy0, ix1, iy1, 0, member * 0.75, nx, ny);
  }
  const group = new THREE.Group();
  const frame = p.mesh('frame', material('paint', sStr(def, 'frameColor', '#f3f0e8')), 'frame');
  if (frame) group.add(frame);
  const glass = p.mesh('glass', material(sStr(def, 'glass', 'clear') === 'frosted' ? 'frosted' : 'glass', '#ffffff'), 'glass');
  if (glass) group.add(glass);
  const metal = p.mesh('metal', material('metal', sStr(def, 'hardware', '#9a9ea3')), 'hardware');
  if (metal) group.add(metal);
  return group;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

const prototypes = new Map<string, THREE.Group>();

function protoKey(def: OpeningDef): string {
  return JSON.stringify([def.id, def.kind, def.width, def.height, def.sill, def.style]);
}

/**
 * Builds the mesh for an opening definition (see the header for local space). Instances share geometry
 * and materials with a cached prototype; each call returns an independent Group (its own leaf pivot).
 */
export function buildOpeningMesh(def: OpeningDef, opts: { flip?: boolean } = {}): THREE.Group {
  const key = protoKey(def);
  let proto = prototypes.get(key);
  if (!proto) {
    proto = def.kind === 'door' ? buildDoor(def) : buildWindow(def);
    proto.name = `opening:${def.id}`;
    proto.userData = { openingId: def.id, kind: def.kind, cutout: openingCutout(def) };
    prototypes.set(key, proto);
  }
  const g = proto.clone(true);
  g.userData = { ...proto.userData };
  if (opts.flip) g.rotation.y = Math.PI;
  return g;
}

/** Swings a door built by buildOpeningMesh: 0 = closed, 1 = fully open (toward local +z). */
export function setDoorOpen(group: THREE.Object3D, amount: number): void {
  const leaf = group.getObjectByName(OPENING_LEAF_NAME);
  if (!leaf) return;
  const max = typeof leaf.userData.maxSwing === 'number' ? leaf.userData.maxSwing : Math.PI / 2;
  leaf.rotation.y = -Math.max(0, Math.min(1, amount)) * max;
}

/** Frees all cached opening geometry and materials (renderer teardown). */
export function disposeOpeningMeshes(): void {
  for (const proto of prototypes.values()) {
    proto.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  prototypes.clear();
  for (const m of materials.values()) m.dispose();
  materials.clear();
}
