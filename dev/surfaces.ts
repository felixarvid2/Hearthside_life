// Surface lab: previews every wall finish on a room-scale corner (two 4 m walls, 2.8 m high, with a
// door and a window cut into them) and every floor on a 4 x 4 m floor, at real scale, with palette and
// quality switches. Also shows the raw texture repeats tiled side by side (seam check), a catalog of
// every design x palette thumbnail, and a numeric seam report. Brief tool: "previewing wall patterns at
// actual room scale" and "checking palette contrast and texture continuity".
//
// The wall builder here follows the renderer UV contract from src/render/textures/surfaceTextures.ts:
// walls u = world coordinate along the wall / repeat, v = height / 2.8; floors uv = (x, z) / repeat.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FLOOR_DESIGNS, OPENINGS, WALL_DESIGNS, findPalette, paletteTone } from '../src/content/surfaces';
import type { OpeningDef, SurfaceDesign } from '../src/content/types';
import { formatMoney } from '../src/core/money';
import { WALL_THICKNESS, buildOpeningMesh, openingCutout, setDoorOpen } from '../src/render/openingMeshes';
import { painterFor, textureLayout } from '../src/render/textures/painters';
import {
  WALL_TEXTURE_HEIGHT, getSurfaceTexture, paintSurfaceCanvas, releaseSurfaceTexture, surfaceTextureStats,
  surfaceThumbnail, type TextureQuality,
} from '../src/render/textures/surfaceTextures';

const ROOM = 4;
const H = WALL_TEXTURE_HEIGHT;
const T = WALL_THICKNESS;
const DOOR_AT = 1.5; // door centred in tile x 1..2 of wall A
const WINDOW_AT = 2.5; // window centred in tile z 2..3 of wall B

type View = 'room' | 'sheet' | 'catalog';
type CameraPreset = 'iso' | 'wallA' | 'wallB' | 'floor' | 'corner';

const first = <T,>(list: readonly T[]): T => {
  const v = list[0];
  if (v === undefined) throw new Error('empty list');
  return v;
};

const state = {
  wall: first(WALL_DESIGNS),
  wallPal: first(first(WALL_DESIGNS).palettes).id,
  floor: first(FLOOR_DESIGNS),
  floorPal: first(first(FLOOR_DESIGNS).palettes).id,
  quality: 'high' as TextureQuality,
  view: 'room' as View,
  camera: 'iso' as CameraPreset,
  door: OPENINGS.find((o) => o.id === 'door-panel') ?? first(OPENINGS.filter((o) => o.kind === 'door')),
  window: OPENINGS.find((o) => o.id === 'window-sash') ?? first(OPENINGS.filter((o) => o.kind === 'window')),
  doorOpen: false,
  grid: false,
};

// ---------------------------------------------------------------------------------------------
// three.js scene
// ---------------------------------------------------------------------------------------------

const host = document.getElementById('view3d') as HTMLDivElement;
const info = document.getElementById('info') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e2d6');
// a light ground colour lifts vertical walls (they see half sky, half ground) without over-lighting floors
const hemi = new THREE.HemisphereLight('#fff8ee', '#e3d6c1', 1.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e2', 1.9);
sun.position.set(6, 9, 7);
sun.target.position.set(2, 0, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#d6cdbd', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.003;
ground.receiveShadow = true;
scene.add(ground);

const plainMat = new THREE.MeshStandardMaterial({ color: '#ece6dc', roughness: 0.95 });
const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.88 });
const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });

// a 1.75 m figure for human scale
const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.39, 6, 16), new THREE.MeshStandardMaterial({ color: '#8c7b6b', roughness: 0.8 }));
figure.position.set(2.7, 0.875, 2.6);
figure.castShadow = true;
scene.add(figure);

const grid = new THREE.GridHelper(ROOM, ROOM, '#3b3125', '#3b3125');
grid.position.set(ROOM / 2, 0.003, ROOM / 2);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
grid.visible = false;
scene.add(grid);

let camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener('change', () => requestRender());

// ---------------------------------------------------------------------------------------------
// Geometry helpers (world-space quads with explicit UVs)
// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];

class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];

  /** Quad a-b-c-d (in order around its edge), facing `n`; `uv` per corner. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: [[number, number], [number, number], [number, number], [number, number]]): void {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      (ab[1] ?? 0) * (ac[2] ?? 0) - (ab[2] ?? 0) * (ac[1] ?? 0),
      (ab[2] ?? 0) * (ac[0] ?? 0) - (ab[0] ?? 0) * (ac[2] ?? 0),
      (ab[0] ?? 0) * (ac[1] ?? 0) - (ab[1] ?? 0) * (ac[0] ?? 0),
    ];
    const flip = (cross[0] ?? 0) * n[0] + (cross[1] ?? 0) * n[1] + (cross[2] ?? 0) * n[2] < 0;
    const order = flip ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
    const pts = [a, b, c, d];
    for (const i of order) {
      const p = pts[i] as V3;
      const t = uv[i] as [number, number];
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uvs.push(t[0], t[1]);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    return g;
  }
}

interface Hole { a: number; b: number; bottom: number; top: number }
interface Rect { s0: number; s1: number; y0: number; y1: number }

/** Splits a wall face into rectangles around rectangular holes. */
function faceRects(s0: number, s1: number, holes: readonly Hole[]): Rect[] {
  const cuts = [s0, s1, ...holes.flatMap((h) => [h.a, h.b])].filter((v) => v >= s0 && v <= s1).sort((x, y) => x - y);
  const out: Rect[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i] as number, b = cuts[i + 1] as number;
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    const hole = holes.find((h) => mid > h.a && mid < h.b);
    if (!hole) out.push({ s0: a, s1: b, y0: 0, y1: H });
    else {
      if (hole.bottom > 0) out.push({ s0: a, s1: b, y0: 0, y1: hole.bottom });
      if (hole.top < H) out.push({ s0: a, s1: b, y0: hole.top, y1: H });
    }
  }
  return out;
}

/**
 * Adds one straight wall: `axis` = world axis it runs along, `plane` = its centre line coordinate on the
 * other axis. The face toward +other-axis gets the design (UVs per the renderer contract); everything
 * else goes to `plain`.
 */
function addWall(tex: GeoBuilder, plain: GeoBuilder, axis: 'x' | 'z', plane: number, s0: number, s1: number, holes: readonly Hole[], repeat: number): void {
  const P = (s: number, y: number, o: number): V3 => (axis === 'x' ? [s, y, o] : [o, y, s]);
  const N = (sign: number): V3 => (axis === 'x' ? [0, 0, sign] : [sign, 0, 0]);
  const S = (sign: number): V3 => (axis === 'x' ? [sign, 0, 0] : [0, 0, sign]);
  const inner = plane + T / 2, outer = plane - T / 2;
  for (const r of faceRects(s0, s1, holes)) {
    const uv = (s: number, y: number): [number, number] => [s / repeat, y / H];
    tex.quad(P(r.s0, r.y0, inner), P(r.s1, r.y0, inner), P(r.s1, r.y1, inner), P(r.s0, r.y1, inner), N(1),
      [uv(r.s0, r.y0), uv(r.s1, r.y0), uv(r.s1, r.y1), uv(r.s0, r.y1)]);
    const z: [number, number] = [0, 0];
    plain.quad(P(r.s0, r.y0, outer), P(r.s1, r.y0, outer), P(r.s1, r.y1, outer), P(r.s0, r.y1, outer), N(-1), [z, z, z, z]);
  }
  const z: [number, number] = [0, 0];
  // top and ends
  plain.quad(P(s0, H, outer), P(s1, H, outer), P(s1, H, inner), P(s0, H, inner), [0, 1, 0], [z, z, z, z]);
  plain.quad(P(s1, 0, outer), P(s1, 0, inner), P(s1, H, inner), P(s1, H, outer), S(1), [z, z, z, z]);
  plain.quad(P(s0, 0, outer), P(s0, 0, inner), P(s0, H, inner), P(s0, H, outer), S(-1), [z, z, z, z]);
  // hole reveals (mostly hidden by the frame lining)
  for (const h of holes) {
    plain.quad(P(h.a, h.bottom, outer), P(h.a, h.bottom, inner), P(h.a, h.top, inner), P(h.a, h.top, outer), S(1), [z, z, z, z]);
    plain.quad(P(h.b, h.bottom, outer), P(h.b, h.bottom, inner), P(h.b, h.top, inner), P(h.b, h.top, outer), S(-1), [z, z, z, z]);
    plain.quad(P(h.a, h.top, outer), P(h.b, h.top, outer), P(h.b, h.top, inner), P(h.a, h.top, inner), [0, -1, 0], [z, z, z, z]);
    if (h.bottom > 0) plain.quad(P(h.a, h.bottom, outer), P(h.b, h.bottom, outer), P(h.b, h.bottom, inner), P(h.a, h.bottom, inner), [0, 1, 0], [z, z, z, z]);
  }
}

// ---------------------------------------------------------------------------------------------
// Room build
// ---------------------------------------------------------------------------------------------

const room = new THREE.Group();
scene.add(room);
let wallTex: THREE.Texture | null = null;
let floorTex: THREE.Texture | null = null;
let doorMesh: THREE.Group | null = null;

function holeFor(def: OpeningDef, at: number): Hole {
  const c = openingCutout(def);
  return { a: at - c.halfWidth, b: at + c.halfWidth, bottom: c.bottom, top: c.top };
}

function clearRoom(): void {
  for (const child of [...room.children]) {
    room.remove(child);
    if (child instanceof THREE.Mesh && child.userData.ownGeometry) child.geometry.dispose();
  }
}

function buildRoom(): void {
  clearRoom();
  const tex = new GeoBuilder();
  const plain = new GeoBuilder();
  addWall(tex, plain, 'x', 0, -T / 2, ROOM, [holeFor(state.door, DOOR_AT)], state.wall.repeat);
  addWall(tex, plain, 'z', 0, T / 2, ROOM, [holeFor(state.window, WINDOW_AT)], state.wall.repeat);
  const texMesh = new THREE.Mesh(tex.build(), wallMat);
  const plainMesh = new THREE.Mesh(plain.build(), plainMat);
  const fb = new GeoBuilder();
  const r = state.floor.repeat;
  fb.quad([0, 0, 0], [ROOM, 0, 0], [ROOM, 0, ROOM], [0, 0, ROOM], [0, 1, 0], [[0, 0], [ROOM / r, 0], [ROOM / r, ROOM / r], [0, ROOM / r]]);
  const floorMesh = new THREE.Mesh(fb.build(), floorMat);
  for (const m of [texMesh, plainMesh, floorMesh]) {
    m.userData.ownGeometry = true;
    m.castShadow = m !== floorMesh;
    m.receiveShadow = true;
    room.add(m);
  }
  doorMesh = buildOpeningMesh(state.door);
  doorMesh.position.set(DOOR_AT, 0, 0);
  setDoorOpen(doorMesh, state.doorOpen ? 0.7 : 0);
  const win = buildOpeningMesh(state.window);
  win.position.set(0, 0, WINDOW_AT);
  win.rotation.y = -Math.PI / 2; // local +x runs along world +z
  room.add(doorMesh, win);
  applyTextures();
}

function applyTextures(): void {
  const nextWall = getSurfaceTexture(state.wall, state.wallPal, state.quality);
  const nextFloor = getSurfaceTexture(state.floor, state.floorPal, state.quality);
  if (wallTex) releaseSurfaceTexture(wallTex);
  if (floorTex) releaseSurfaceTexture(floorTex);
  wallTex = nextWall;
  floorTex = nextFloor;
  wallMat.map = wallTex;
  floorMat.map = floorTex;
  wallMat.needsUpdate = true;
  floorMat.needsUpdate = true;
  requestRender();
}

// ---------------------------------------------------------------------------------------------
// Camera presets and rendering
// ---------------------------------------------------------------------------------------------

function setCamera(preset: CameraPreset): void {
  state.camera = preset;
  const w = host.clientWidth || 800, h = host.clientHeight || 600;
  const aspect = w / h;
  const presets: Record<CameraPreset, { pos: V3; target: V3; size: number; up?: V3 }> = {
    iso: { pos: [11, 9, 11], target: [1.7, 1.0, 1.7], size: 5.2 },
    corner: { pos: [7, 3.2, 7], target: [0.9, 1.3, 0.9], size: 3.4 },
    wallA: { pos: [2, 1.4, 14], target: [2, 1.4, 0], size: 3.3 },
    wallB: { pos: [14, 1.4, 2], target: [0, 1.4, 2], size: 3.3 },
    floor: { pos: [2, 20, 2], target: [2, 0, 2], size: 4.4, up: [0, 0, -1] },
  };
  const p = presets[preset];
  const half = p.size / 2;
  camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 100);
  // fit the width too on portrait screens
  if (aspect < 1) { camera.left = -half; camera.right = half; camera.top = half / aspect; camera.bottom = -half / aspect; }
  camera.position.set(...p.pos);
  camera.up.set(...(p.up ?? [0, 1, 0]));
  camera.lookAt(...p.target);
  camera.updateProjectionMatrix();
  controls.object = camera;
  controls.target.set(...p.target);
  controls.update();
  requestRender();
}

let pending = false;
let frames = 0;
function requestRender(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    if (state.view !== 'room') return;
    renderer.render(scene, camera);
    frames++;
    updateInfo();
  });
}

function resize(): void {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  setCamera(state.camera);
}
window.addEventListener('resize', resize);

function updateInfo(): void {
  const wp = findPalette(state.wall, state.wallPal);
  const fp = findPalette(state.floor, state.floorPal);
  const wl = textureLayout(state.wall, state.quality), fl = textureLayout(state.floor, state.quality);
  const st = surfaceTextureStats();
  info.textContent = [
    `wall  ${state.wall.id} / ${wp.id} (${paletteTone(wp)})  ${formatMoney(state.wall.price)}/side  repeat ${state.wall.repeat} m  ${wl.widthPx}x${wl.heightPx}px`,
    `floor ${state.floor.id} / ${fp.id} (${paletteTone(fp)})  ${formatMoney(state.floor.price)}/tile  repeat ${state.floor.repeat} m  ${fl.widthPx}x${fl.heightPx}px`,
    `textures live ${st.live} idle ${st.idle} refs ${st.refs} ~${(st.bytes / 1048576).toFixed(1)} MB  frames ${frames}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Sheet view (raw repeats tiled, for seam inspection)
// ---------------------------------------------------------------------------------------------

const sheetEl = document.getElementById('sheet') as HTMLDivElement;
const catalogEl = document.getElementById('catalog') as HTMLDivElement;

function tiledCanvas(src: HTMLCanvasElement, nx: number, ny: number, scale: number): HTMLCanvasElement {
  const pad = 10;
  const w = src.width * scale, h = src.height * scale;
  const c = document.createElement('canvas');
  c.width = Math.round(w * nx) + pad * 2;
  c.height = Math.round(h * ny) + pad * 2;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) ctx.drawImage(src, pad + i * w, pad + j * h, w, h);
  // repeat boundaries as ticks in the margin only (never over the seam itself)
  ctx.fillStyle = '#c0392b';
  for (let i = 0; i <= nx; i++) { ctx.fillRect(pad + i * w - 1, 0, 2, pad - 2); ctx.fillRect(pad + i * w - 1, c.height - pad + 2, 2, pad - 2); }
  for (let j = 0; j <= ny; j++) { ctx.fillRect(0, pad + j * h - 1, pad - 2, 2); ctx.fillRect(c.width - pad + 2, pad + j * h - 1, pad - 2, 2); }
  return c;
}

function renderSheet(): void {
  sheetEl.innerHTML = '';
  const add = (title: string, canvas: HTMLCanvasElement) => {
    const block = document.createElement('div');
    block.className = 'sheetBlock';
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = title;
    block.append(cap, canvas);
    sheetEl.append(block);
  };
  const w = paintSurfaceCanvas(state.wall, state.wallPal, state.quality);
  const nx = Math.max(3, Math.min(6, Math.ceil(900 / w.width)));
  add(`${state.wall.name} - ${nx} repeats of ${state.wall.repeat} m x ${H} m (${w.width}x${w.height}px, 1:1); red ticks mark repeat edges`, tiledCanvas(w, nx, 1, 1));
  const f = paintSurfaceCanvas(state.floor, state.floorPal, state.quality);
  const scale = f.width > 300 ? 0.75 : 1;
  add(`${state.floor.name} - 2 x 2 repeats of ${state.floor.repeat} m (${f.width}x${f.height}px, shown at ${scale}x)`, tiledCanvas(f, 2, 2, scale));
}

// ---------------------------------------------------------------------------------------------
// Catalog view (every design x palette)
// ---------------------------------------------------------------------------------------------

let catalogBuilt = false;
function renderCatalog(): void {
  if (catalogBuilt) return;
  catalogBuilt = true;
  const section = (title: string, designs: readonly SurfaceDesign[]) => {
    const h = document.createElement('h2');
    h.textContent = title;
    catalogEl.append(h);
    for (const d of designs) {
      const box = document.createElement('div');
      box.className = 'catDesign';
      const t = document.createElement('div');
      t.className = 'title';
      t.innerHTML = `${d.name} <span>${d.id} - ${d.family} - ${d.tier} ${formatMoney(d.price)} - painter ${d.painter} - ${d.palettes.length} palettes</span>`;
      const g = document.createElement('div');
      g.className = 'catGrid';
      for (const p of d.palettes) {
        const item = document.createElement('div');
        item.className = 'catItem';
        const img = document.createElement('img');
        img.src = surfaceThumbnail(d, p.id, 96);
        img.alt = `${d.name} ${p.name}`;
        item.append(img, `${p.name} (${paletteTone(p)})`);
        g.append(item);
      }
      box.append(t, g);
      catalogEl.append(box);
    }
  };
  section('Wall finishes', WALL_DESIGNS);
  section('Floors', FLOOR_DESIGNS);
}

// ---------------------------------------------------------------------------------------------
// Seam report
// ---------------------------------------------------------------------------------------------

interface SeamRow { id: string; palette: string; quality: TextureQuality; axis: 'x' | 'y'; edge: number; median: number; p99: number; max: number; ratio: number; seam: boolean }

/**
 * Compares the mean pixel step across the repeat edge (last column/row -> first) with the steps between
 * neighbouring columns/rows inside the texture. A discontinuity shows up as an edge step larger than any
 * interior step; `ratio` = edge / largest interior step.
 */
function seamReport(): SeamRow[] {
  const rows: SeamRow[] = [];
  for (const d of [...WALL_DESIGNS, ...FLOOR_DESIGNS]) {
    for (const p of d.palettes.slice(0, 2)) {
      for (const q of ['low', 'high'] as const) {
        const c = paintSurfaceCanvas(d, p.id, q);
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        const { data, width: W, height: Hh } = ctx.getImageData(0, 0, c.width, c.height);
        const px = (x: number, y: number) => (y * W + x) * 4;
        const diff = (a: number, b: number) =>
          (Math.abs((data[a] ?? 0) - (data[b] ?? 0)) + Math.abs((data[a + 1] ?? 0) - (data[b + 1] ?? 0)) + Math.abs((data[a + 2] ?? 0) - (data[b + 2] ?? 0))) / 3;
        const axes: Array<'x' | 'y'> = d.surface === 'floor' ? ['x', 'y'] : ['x'];
        for (const axis of axes) {
          const n = axis === 'x' ? W : Hh, m = axis === 'x' ? Hh : W;
          const at = (i: number, j: number) => (axis === 'x' ? px(i, j) : px(j, i));
          const inner: number[] = [];
          for (let i = 0; i < n - 1; i++) {
            let s = 0;
            for (let j = 0; j < m; j++) s += diff(at(i, j), at(i + 1, j));
            inner.push(s / m);
          }
          let e = 0;
          for (let j = 0; j < m; j++) e += diff(at(n - 1, j), at(0, j));
          e /= m;
          const sorted = [...inner].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
          const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
          const max = sorted[sorted.length - 1] ?? 0;
          const ratio = e / Math.max(0.5, max);
          rows.push({
            id: d.id, palette: p.id, quality: q, axis, edge: +e.toFixed(2), median: +median.toFixed(2), p99: +p99.toFixed(2),
            max: +max.toFixed(2), ratio: +ratio.toFixed(2), seam: e > max * 1.1 + 1,
          });
        }
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Side panel UI
// ---------------------------------------------------------------------------------------------

const side = document.getElementById('side') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function buttonRow<T extends string>(options: ReadonlyArray<[T, string]>, current: () => T, pick: (v: T) => void): HTMLDivElement {
  const row = el('div', { className: 'row' });
  for (const [value, label] of options) {
    const b = el('button', { textContent: label });
    b.dataset.value = value;
    b.classList.toggle('on', current() === value);
    b.onclick = () => { pick(value); renderSide(); };
    row.append(b);
  }
  return row;
}

function designList(designs: readonly SurfaceDesign[], current: SurfaceDesign, pick: (d: SurfaceDesign) => void): HTMLDivElement {
  const box = el('div', { className: 'designs' });
  for (const d of designs) {
    const b = el('button', { className: 'design' + (d === current ? ' on' : ''), title: d.description });
    b.dataset.design = d.id;
    b.append(
      el('img', { src: surfaceThumbnail(d, first(d.palettes).id, 88), alt: '' }),
      el('div', { className: 'meta' }, el('div', { className: 'name', textContent: d.name }),
        el('div', { className: 'sub', textContent: `${d.family} - ${formatMoney(d.price)}` })),
    );
    b.onclick = () => { pick(d); renderSide(); };
    box.append(b);
  }
  return box;
}

function paletteList(design: SurfaceDesign, current: string, pick: (id: string) => void): HTMLDivElement {
  const box = el('div', { className: 'palettes' });
  for (const p of design.palettes) {
    const b = el('button', { className: 'pal' + (p.id === current ? ' on' : ''), title: `${p.name} (${paletteTone(p)})` });
    b.dataset.palette = p.id;
    b.append(el('img', { src: surfaceThumbnail(design, p.id, 72), alt: '' }), p.name);
    b.onclick = () => { pick(p.id); renderSide(); };
    box.append(b);
  }
  return box;
}

function renderSide(): void {
  side.innerHTML = '';
  side.append(
    el('h1', { textContent: 'Surface lab' }),
    buttonRow<View>([['room', 'Room'], ['sheet', 'Repeats'], ['catalog', 'Catalog']], () => state.view, (v) => setView(v)),
    el('h2', { textContent: 'Camera' }),
    buttonRow<CameraPreset>([['iso', 'Iso'], ['corner', 'Corner'], ['wallA', 'Door wall'], ['wallB', 'Window wall'], ['floor', 'Floor']], () => state.camera, (v) => setCamera(v)),
    el('h2', { textContent: 'Options' }),
    buttonRow<TextureQuality>([['high', 'High quality'], ['low', 'Low quality']], () => state.quality, (q) => { state.quality = q; refresh(); }),
    buttonRow<'open' | 'closed'>([['closed', 'Door closed'], ['open', 'Door open']], () => (state.doorOpen ? 'open' : 'closed'), (v) => {
      state.doorOpen = v === 'open';
      if (doorMesh) setDoorOpen(doorMesh, state.doorOpen ? 0.7 : 0);
      requestRender();
    }),
    buttonRow<'grid' | 'nogrid'>([['nogrid', 'No grid'], ['grid', '1 m grid']], () => (state.grid ? 'grid' : 'nogrid'), (v) => {
      state.grid = v === 'grid';
      grid.visible = state.grid;
      requestRender();
    }),
    el('h2', { textContent: 'Door and window' }),
    buttonRow(OPENINGS.filter((o) => o.kind === 'door').map((o) => [o.id, o.name] as [string, string]), () => state.door.id, (id) => {
      state.door = OPENINGS.find((o) => o.id === id) ?? state.door;
      buildRoom();
    }),
    buttonRow(OPENINGS.filter((o) => o.kind === 'window').map((o) => [o.id, o.name] as [string, string]), () => state.window.id, (id) => {
      state.window = OPENINGS.find((o) => o.id === id) ?? state.window;
      buildRoom();
    }),
    el('h2', { textContent: `Wall palette - ${state.wall.name}` }),
    paletteList(state.wall, state.wallPal, (id) => { state.wallPal = id; refresh(); }),
    el('h2', { textContent: 'Wall finishes' }),
    designList(WALL_DESIGNS, state.wall, (d) => setWall(d.id, first(d.palettes).id)),
    el('h2', { textContent: `Floor palette - ${state.floor.name}` }),
    paletteList(state.floor, state.floorPal, (id) => { state.floorPal = id; refresh(); }),
    el('h2', { textContent: 'Floors' }),
    designList(FLOOR_DESIGNS, state.floor, (d) => setFloor(d.id, first(d.palettes).id)),
    el('p', { textContent: `Painter: ${painterFor(state.wall).description}` }),
  );
}

function setView(v: View): void {
  state.view = v;
  host.style.display = v === 'room' ? 'block' : 'none';
  sheetEl.style.display = v === 'sheet' ? 'block' : 'none';
  catalogEl.style.display = v === 'catalog' ? 'block' : 'none';
  info.style.display = v === 'room' ? 'block' : 'none';
  if (v === 'sheet') renderSheet();
  if (v === 'catalog') renderCatalog();
  if (v === 'room') requestRender();
}

function refresh(): void {
  buildRoom();
  if (state.view === 'sheet') renderSheet();
}

function setWall(id: string, paletteId?: string): void {
  const d = WALL_DESIGNS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown wall design ${id}`);
  state.wall = d;
  state.wallPal = findPalette(d, paletteId ?? '').id;
  refresh();
}

function setFloor(id: string, paletteId?: string): void {
  const d = FLOOR_DESIGNS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown floor design ${id}`);
  state.floor = d;
  state.floorPal = findPalette(d, paletteId ?? '').id;
  refresh();
}

// ---------------------------------------------------------------------------------------------
// Boot and test hooks
// ---------------------------------------------------------------------------------------------

const api = {
  walls: WALL_DESIGNS.map((d) => ({ id: d.id, palettes: d.palettes.map((p) => p.id) })),
  floors: FLOOR_DESIGNS.map((d) => ({ id: d.id, palettes: d.palettes.map((p) => p.id) })),
  setWall: (id: string, paletteId?: string) => { setWall(id, paletteId); renderSide(); },
  setFloor: (id: string, paletteId?: string) => { setFloor(id, paletteId); renderSide(); },
  setView: (v: View) => { setView(v); renderSide(); },
  setCamera: (p: CameraPreset) => { setCamera(p); renderSide(); },
  setQuality: (q: TextureQuality) => { state.quality = q; refresh(); renderSide(); },
  setDoorOpen: (open: boolean) => { state.doorOpen = open; if (doorMesh) setDoorOpen(doorMesh, open ? 0.7 : 0); requestRender(); },
  setOpenings: (doorId: string, windowId: string) => {
    state.door = OPENINGS.find((o) => o.id === doorId) ?? state.door;
    state.window = OPENINGS.find((o) => o.id === windowId) ?? state.window;
    buildRoom();
    renderSide();
  },
  setGrid: (on: boolean) => { state.grid = on; grid.visible = on; requestRender(); },
  /** PNG data URL: the texture tiled 2x, cropped around the repeat edge (x, or y for floors) and magnified. */
  seamCrop: (kind: 'wall' | 'floor', id: string, paletteId: string, quality: TextureQuality, axis: 'x' | 'y' = 'x', zoom = 4): string => {
    const d = (kind === 'wall' ? WALL_DESIGNS : FLOOR_DESIGNS).find((x) => x.id === id);
    if (!d) throw new Error(`unknown design ${id}`);
    const src = paintSurfaceCanvas(d, paletteId, quality);
    const half = 24;
    const out = document.createElement('canvas');
    const cw = axis === 'x' ? half * 2 : Math.min(src.width, 96);
    const ch = axis === 'x' ? Math.min(src.height, 96) : half * 2;
    out.width = cw * zoom;
    out.height = ch * zoom;
    const ctx = out.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    if (axis === 'x') {
      const y0 = Math.max(0, src.height - ch - 4);
      ctx.drawImage(src, src.width - half, y0, half, ch, 0, 0, half, ch);
      ctx.drawImage(src, 0, y0, half, ch, half, 0, half, ch);
    } else {
      ctx.drawImage(src, 0, src.height - half, cw, half, 0, 0, cw, half);
      ctx.drawImage(src, 0, 0, cw, half, 0, half, cw, half);
    }
    return out.toDataURL('image/png');
  },
  /** Sets several preview options in one call (scripts use this so a page reload cannot split a step). */
  apply: (o: { wall?: string; wallPal?: string; floor?: string; floorPal?: string; camera?: CameraPreset; view?: View; door?: string; window?: string; doorOpen?: boolean; quality?: TextureQuality }) => {
    if (o.wall) setWall(o.wall, o.wallPal);
    else if (o.wallPal) state.wallPal = findPalette(state.wall, o.wallPal).id;
    if (o.floor) setFloor(o.floor, o.floorPal);
    else if (o.floorPal) state.floorPal = findPalette(state.floor, o.floorPal).id;
    if (o.door) state.door = OPENINGS.find((x) => x.id === o.door) ?? state.door;
    if (o.window) state.window = OPENINGS.find((x) => x.id === o.window) ?? state.window;
    if (o.doorOpen !== undefined) state.doorOpen = o.doorOpen;
    if (o.quality) state.quality = o.quality;
    buildRoom();
    if (o.camera) setCamera(o.camera);
    if (o.view) setView(o.view);
    renderSide();
    requestRender();
  },
  current: () => ({
    wall: state.wall.id, wallPal: state.wallPal, floor: state.floor.id, floorPal: state.floorPal, camera: state.camera,
    view: state.view, door: state.door.id, window: state.window.id, doorOpen: state.doorOpen, quality: state.quality,
  }),
  frames: () => frames,
  stats: () => surfaceTextureStats(),
  seamReport,
};
(window as unknown as { surfacesDev: typeof api }).surfacesDev = api;

renderSide();
resize();
buildRoom();
setView('room');
