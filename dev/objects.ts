// Furniture viewer (developer tool, brief section 24: "viewing a furniture model on a measured grid with
// interaction anchors"). Serve with `npx vite` and open /dev/objects.html.
//
// Every ready object from src/content/objects.ts is laid out on a 1 m grid with:
// - its footprint outline drawn in rot-0 local space (inside the rotated object group) and, independently, the
//   world tiles from core/geometry footprintTiles() - both must coincide at every rotation;
// - an arrow at the front edge (+z at rot 0);
// - slot markers: anchor sphere at the seat/mattress height, facing arrow, approach tile and a link line;
//   slot anchors are also recomputed in world space with rotateLocal/rotateFacing (small rings) as a check;
// - a red label when the scaled model leaves its footprint (layer 'surface' and 'wall' items included).
// URL parameters: rot=0..3, view=top|iso|iso2, labels=0|1, slots=0|1, swatch=N, only=id,id,...
// window.__viewer exposes load state and checks for automated screenshots.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { OBJECTS, fittedBounds } from '../src/content/objects';
import type { ObjectDef } from '../src/content/types';
import {
  facingDir, footprintTiles, rotateFacing, rotateLocal, rotatedSize, rotationOriginShift, rotYaw,
} from '../src/core/geometry';
import type { Rot } from '../src/core/types';

interface ManifestModel { file: string; min: number[]; max: number[]; materials: Array<{ name: string; color: number[] }> }
interface ViewerState {
  ready: boolean; total: number; loaded: number; errors: string[];
  /** Objects whose model leaves its footprint at the current rotation. */
  overflow: string[];
  /** Largest difference between three.js model bounds and fittedBounds() at rot 0 (metres). */
  mathDiff: number;
  /** Largest distance between slot anchors placed through the scene graph and through core/geometry. */
  slotDiff: number;
  rot: number;
}

const params = new URLSearchParams(location.search);
const state: ViewerState = { ready: false, total: 0, loaded: 0, errors: [], overflow: [], mathDiff: 0, slotDiff: 0, rot: 0 };
(window as unknown as { __viewer: ViewerState }).__viewer = state;
window.addEventListener('error', (e) => state.errors.push(String(e.message)));

const only = params.get('only')?.split(',').filter(Boolean) ?? null;
const defs = OBJECTS.filter((d) => d.status === 'ready' && (!only || only.includes(d.id)));
state.total = defs.length;

// ---------------------------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------------------------

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e4da');
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a8070, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 9);
scene.add(sun);
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);

// Layout: one square cell per object, big enough for any rotation plus a ring of approach tiles.
const COLS = only ? Math.max(1, Math.ceil(Math.sqrt(defs.length))) : 8;
interface Cell { def: ObjectDef; x: number; z: number; size: number }
const cells: Cell[] = [];
{
  let cx = 0, cz = 0, rowDepth = 0, col = 0;
  for (const def of defs) {
    const size = Math.max(def.footprint.w, def.footprint.d) + 2;
    if (col === COLS) { col = 0; cx = 0; cz += rowDepth + 1; rowDepth = 0; }
    cells.push({ def, x: cx + 1, z: cz + 1, size });
    cx += size + 1; rowDepth = Math.max(rowDepth, size); col++;
  }
}
const extentX = Math.max(...cells.map((c) => c.x + c.size)) + 1;
const extentZ = Math.max(...cells.map((c) => c.z + c.size)) + 1;

function gridLines(w: number, d: number): THREE.LineSegments {
  const pts: number[] = [];
  for (let x = 0; x <= w; x++) pts.push(x, 0, 0, x, 0, d);
  for (let z = 0; z <= d; z++) pts.push(0, 0, z, w, 0, z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbdb3a3 }));
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(extentX, extentZ), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(extentX / 2, -0.002, extentZ / 2);
scene.add(floor, gridLines(extentX, extentZ));

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function rectOutline(x0: number, z0: number, x1: number, z1: number, y: number, color: number, dashed = false): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, y, z1), new THREE.Vector3(x0, y, z0),
  ]);
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08 }) : new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(g, m);
  if (dashed) line.computeLineDistances();
  return line;
}

function tileFill(x: number, z: number, y: number, color: number, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x + 0.5, y, z + 0.5);
  return m;
}

function textSprite(lines: string[], color = '#2f2a26'): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = '600 28px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 16;
  c.width = w; c.height = lines.length * 34 + 10;
  ctx.font = font;
  ctx.fillStyle = 'rgba(251,246,238,0.92)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  lines.forEach((l, i) => ctx.fillText(l, 8, 32 + i * 34));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.renderOrder = 10;
  const scale = 0.009;
  s.scale.set(c.width * scale, c.height * scale, 1);
  return s;
}

const SLOT_COLORS: Record<string, number> = { sit: 0xc03ac0, sleep: 0x3a7bd5, use: 0xe0a800, stand: 0x555555 };

/** Replaces unlit Kenney materials with lit ones. Kenney colour factors are authored as sRGB. */
function litMaterials(root: THREE.Object3D): Map<string, THREE.MeshStandardMaterial[]> {
  const byName = new Map<string, THREE.MeshStandardMaterial[]>();
  const cache = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const convert = (m: THREE.Material): THREE.MeshStandardMaterial => {
      let out = cache.get(m);
      if (!out) {
        const src = m as THREE.MeshBasicMaterial;
        out = new THREE.MeshStandardMaterial({ name: m.name, roughness: 0.75, metalness: 0, transparent: m.transparent, opacity: m.opacity });
        out.color.setRGB(src.color.r, src.color.g, src.color.b, THREE.SRGBColorSpace);
        out.userData.base = out.color.clone();
        if (m.name === 'glass') { out.transparent = true; out.opacity = 0.55; }
        if (m.name === 'lamp') out.emissive = new THREE.Color(0x6b5d2a);
        cache.set(m, out);
        const list = byName.get(m.name) ?? [];
        list.push(out);
        byName.set(m.name, list);
      }
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  return byName;
}

/** Applies swatch `index` (mod count) of every finish region; secondary materials keep their relative shade. */
function applyFinishes(def: ObjectDef, mats: Map<string, THREE.MeshStandardMaterial[]>, index: number): void {
  for (const region of def.finishes) {
    const swatch = region.swatches[index % region.swatches.length];
    const first = mats.get(region.materials[0] ?? '')?.[0];
    if (!swatch || !first) continue;
    const target = new THREE.Color(swatch.color); // sRGB hex -> linear working colour
    const base0 = first.userData.base as THREE.Color;
    for (const name of region.materials) {
      for (const m of mats.get(name) ?? []) {
        const base = m.userData.base as THREE.Color;
        m.color.setRGB(
          Math.min(1, target.r * (base.r / Math.max(1e-4, base0.r))),
          Math.min(1, target.g * (base.g / Math.max(1e-4, base0.g))),
          Math.min(1, target.b * (base.b / Math.max(1e-4, base0.b))),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------------------------

interface Placed {
  cell: Cell;
  group: THREE.Group; // rot-0 local space of the object
  model: THREE.Object3D | null;
  mats: Map<string, THREE.MeshStandardMaterial[]>;
  label: THREE.Sprite;
  slotMarks: THREE.Object3D[];
  worldMarks: THREE.Group; // world-space checks (rebuilt per rotation)
}
const placed: Placed[] = [];

function buildLocal(def: ObjectDef, group: THREE.Group): THREE.Object3D[] {
  const { w, d } = def.footprint;
  const color = def.blocksMovement ? 0x2f6fd9 : 0x2fa36b;
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) group.add(rectOutline(i + 0.04, j + 0.04, i + 0.96, j + 0.96, 0.006, color, !def.blocksMovement));
  group.add(rectOutline(0, 0, w, d, 0.008, color));
  group.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(w / 2, 0.03, d - 0.15), 0.55, 0xd9774b, 0.18, 0.12));
  if (def.layer === 'wall' || def.needsWall) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8cfc2, transparent: true, opacity: 0.45 }));
    wall.position.set(w / 2, 1.4, 0);
    group.add(wall);
  }
  const marks: THREE.Object3D[] = [];
  for (const slot of def.slots) {
    const c = SLOT_COLORS[slot.kind] ?? 0x555555;
    const anchor = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false }));
    anchor.renderOrder = 5;
    anchor.position.set(slot.pos[0], slot.height, slot.pos[1]);
    const dir = facingDir(slot.facing);
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(dir.x, 0, dir.z), anchor.position.clone(), 0.38, c, 0.12, 0.08);
    const ap = tileFill(slot.approach[0], slot.approach[1], 0.01, 0x7a7a7a, 0.35);
    const link = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([anchor.position.clone(), new THREE.Vector3(slot.approach[0] + 0.5, 0.02, slot.approach[1] + 0.5)]),
      new THREE.LineBasicMaterial({ color: c }),
    );
    marks.push(anchor, arrow, ap, link);
  }
  for (const m of marks) group.add(m);
  return marks;
}

function layout(rot: Rot): void {
  state.rot = rot;
  state.overflow = [];
  state.slotDiff = 0;
  for (const p of placed) {
    const { def, x, z, size } = p.cell;
    const fp = def.footprint;
    const rs = rotatedSize(fp, rot);
    // centre the rotated footprint in its cell on whole tiles
    const ox = x + Math.floor((size - rs.w) / 2), oz = z + Math.floor((size - rs.d) / 2);
    const shift = rotationOriginShift(fp, rot);
    p.group.position.set(ox + shift.x, 0, oz + shift.z);
    p.group.rotation.y = rotYaw(rot);
    p.group.updateMatrixWorld(true);

    // independent world-space checks from core/geometry
    p.worldMarks.clear();
    for (const t of footprintTiles(ox, oz, fp, rot)) p.worldMarks.add(rectOutline(t.x + 0.1, t.z + 0.1, t.x + 0.9, t.z + 0.9, 0.012, 0x9a3dd9, true));
    for (const slot of def.slots) {
      const wp = rotateLocal(slot.pos[0], slot.pos[1], fp, rot);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 20), new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, depthTest: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(ox + wp.x, slot.height + 0.002, oz + wp.z);
      ring.renderOrder = 6;
      p.worldMarks.add(ring);
      const viaGraph = new THREE.Vector3(slot.pos[0], slot.height, slot.pos[1]).applyMatrix4(p.group.matrixWorld);
      state.slotDiff = Math.max(state.slotDiff, viaGraph.distanceTo(ring.position.clone().setY(slot.height)));
      const wf = facingDir(rotateFacing(slot.facing, rot));
      const lf = facingDir(slot.facing);
      const viaGraphDir = new THREE.Vector3(lf.x, 0, lf.z).transformDirection(p.group.matrixWorld);
      state.slotDiff = Math.max(state.slotDiff, Math.hypot(viaGraphDir.x - wf.x, viaGraphDir.z - wf.z));
    }

    // fit check: model bounds must stay inside the rotated footprint
    let out = false;
    if (p.model) {
      const box = new THREE.Box3().setFromObject(p.model);
      const tol = 0.02;
      out = box.min.x < ox - tol || box.max.x > ox + rs.w + tol || box.min.z < oz - tol || box.max.z > oz + rs.d + tol || box.min.y < -tol;
      if (out) state.overflow.push(`${def.id} rot${rot}: x ${box.min.x - ox}..${box.max.x - ox} z ${box.min.z - oz}..${box.max.z - oz} y ${box.min.y}`);
      if (rot === 0) {
        const fb = fittedBounds(def.model);
        if (fb) {
          state.mathDiff = Math.max(state.mathDiff, Math.abs(box.min.x - ox - fb.x0), Math.abs(box.max.x - ox - fb.x1),
            Math.abs(box.min.z - oz - fb.z0), Math.abs(box.max.z - oz - fb.z1), Math.abs(box.min.y - fb.y0), Math.abs(box.max.y - fb.y1));
        }
      }
    }
    p.label.position.set(ox + rs.w / 2, Math.max(def.height, 0.3) + 0.55, oz + rs.d / 2);
    const mat = p.label.material;
    if (out && !p.label.userData.red) {
      mat.map = textSprite([def.id, 'OUTSIDE FOOTPRINT'], '#c01818').material.map;
      p.label.userData.red = true;
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-rot]').forEach((b) => b.classList.toggle('on', Number(b.dataset.rot) === rot));
  updateStatus();
}

function updateStatus(): void {
  const el = document.getElementById('status')!;
  el.textContent = `${state.loaded}/${state.total} models, rot ${state.rot}, overflow ${state.overflow.length}, ` +
    `fit math diff ${state.mathDiff.toFixed(3)} m, slot diff ${state.slotDiff.toFixed(3)} m${state.errors.length ? `, ${state.errors.length} errors` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// Camera views and controls
// ---------------------------------------------------------------------------------------------

let view = params.get('view') ?? 'iso';
function frame(): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const cx = extentX / 2, cz = extentZ / 2;
  const dirs: Record<string, THREE.Vector3> = {
    top: new THREE.Vector3(0, 1, 0.0001), iso: new THREE.Vector3(1, 1.15, 1), iso2: new THREE.Vector3(-1, 1.15, 1),
  };
  const dir = (dirs[view] ?? dirs.iso!).clone().normalize();
  camera.position.set(cx + dir.x * 120, dir.y * 120, cz + dir.z * 120);
  camera.up.set(0, 1, 0);
  if (view === 'top') camera.up.set(0, 0, -1);
  camera.lookAt(cx, 0, cz);
  camera.updateMatrixWorld();
  // fit the layout corners into the view
  const corners = [[0, 0], [extentX, 0], [0, extentZ], [extentX, extentZ]].flatMap(([x, z]) => [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2, z)]);
  const inv = camera.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) { const p = c.applyMatrix4(inv); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pad = 1.06, top = 60 / h; // leave room for the toolbar
  let halfW = ((maxX - minX) / 2) * pad, halfH = ((maxY - minY) / 2) * pad * (1 + top);
  if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2 + halfH * top * 0.5;
  camera.left = midX - halfW; camera.right = midX + halfW; camera.top = midY + halfH; camera.bottom = midY - halfH;
  camera.updateProjectionMatrix();
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
}

let showLabels = params.get('labels') !== '0';
let showSlots = params.get('slots') !== '0';
let swatchIndex = Number(params.get('swatch') ?? 0) || 0;
function applyToggles(): void {
  for (const p of placed) {
    p.label.visible = showLabels;
    for (const m of p.slotMarks) m.visible = showSlots;
    p.worldMarks.visible = showSlots;
    applyFinishes(p.cell.def, p.mats, swatchIndex);
  }
  document.getElementById('labels')!.classList.toggle('on', showLabels);
  document.getElementById('slots')!.classList.toggle('on', showSlots);
  document.getElementById('swatch')!.textContent = String(swatchIndex);
}

document.querySelectorAll<HTMLButtonElement>('[data-rot]').forEach((b) => b.addEventListener('click', () => { layout(Number(b.dataset.rot) as Rot); }));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view ?? 'iso'; frame(); }));
document.getElementById('labels')!.addEventListener('click', () => { showLabels = !showLabels; applyToggles(); });
document.getElementById('slots')!.addEventListener('click', () => { showSlots = !showSlots; applyToggles(); });
document.getElementById('swatchPrev')!.addEventListener('click', () => { swatchIndex = Math.max(0, swatchIndex - 1); applyToggles(); });
document.getElementById('swatchNext')!.addEventListener('click', () => { swatchIndex++; applyToggles(); });
window.addEventListener('resize', frame);

// ---------------------------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const base = new URL('/assets/', location.href).href;
  const manifest = (await (await fetch(base + 'manifest.json')).json()) as { furniture: Record<string, ManifestModel> };
  const loader = new GLTFLoader();
  const gltfCache = new Map<string, Promise<GLTF>>();
  for (const cell of cells) {
    const group = new THREE.Group();
    const worldMarks = new THREE.Group();
    const label = textSprite([cell.def.id, `${cell.def.footprint.w}x${cell.def.footprint.d} ${cell.def.layer} $${cell.def.price / 100}`]);
    scene.add(group, worldMarks, label);
    const p: Placed = { cell, group, model: null, mats: new Map(), label, slotMarks: buildLocal(cell.def, group), worldMarks };
    placed.push(p);
  }
  const rot = (Number(params.get('rot') ?? 0) % 4) as Rot;
  frame();
  layout(rot);
  await Promise.all(placed.map(async (p) => {
    const def = p.cell.def;
    const entry = manifest.furniture[def.model.asset];
    if (!entry) { state.errors.push(`${def.id}: model ${def.model.asset} missing from manifest`); return; }
    let pending = gltfCache.get(entry.file);
    if (!pending) { pending = loader.loadAsync(base + entry.file); gltfCache.set(entry.file, pending); }
    try {
      const gltf = await pending;
      const root = new THREE.Group();
      const inner = gltf.scene.clone(true);
      root.add(inner);
      p.mats = litMaterials(inner);
      // def.model transform inside rot-0 local space: T * R * S
      root.scale.setScalar(def.model.scale);
      root.rotation.y = def.model.yaw;
      root.position.set(def.model.offset[0], def.model.offset[1], def.model.offset[2]);
      p.group.add(root);
      p.model = root;
    } catch (e) {
      state.errors.push(`${def.id}: ${String(e)}`);
    }
    state.loaded++;
    updateStatus();
  }));
  layout(rot);
  applyToggles();
  state.ready = true;
  updateStatus();
}

function loop(): void {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
main().catch((e) => state.errors.push(String(e)));
loop();
