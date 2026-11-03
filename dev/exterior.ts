// Exterior contact sheets (developer tool for Milestone 9). Serve with `npx vite` and open /dev/exterior.html?set=roofs|finishes|fences|gates|garden|crops|stairs|terrain
// (optional w and h in pixels). Draws the real roof, fence, garden and terrain views (and the garden and staircase models) on a grid with a
// label for each design, so a screenshot is a contact sheet. window.__sheet.ready turns true when everything is drawn.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { content } from '../src/content/index';
import { EXTERIOR, FENCES, GATES, ROOF_FINISHES, ROOF_STYLES, TERRAIN_PAINTS } from '../src/content/exterior';
import { EXTERIOR_OBJECTS, GARDEN_OBJECTS, STAIR_OBJECTS } from '../src/content/exteriorObjects';
import type { Lot, PlacedObject } from '../src/core/types';
import { FenceView } from '../src/render/fenceView';
import { GardenView } from '../src/render/gardenView';
import { RoofView } from '../src/render/roofView';
import { TerrainView } from '../src/render/terrainView';

const params = new URLSearchParams(location.search);
const set = params.get('set') ?? 'roofs';
const W = Number(params.get('w') ?? 1200), H = Number(params.get('h') ?? 800);
const db = content();
const sheet = { ready: false, errors: [] as string[], count: 0 };
(window as unknown as { __sheet: typeof sheet }).__sheet = sheet;
window.addEventListener('error', (e) => sheet.errors.push(String(e.message)));

const canvas = document.getElementById('view') as HTMLCanvasElement;
canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ddd6c6');
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a8070, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(-6, 12, 5);
scene.add(sun);
const groundMat = new THREE.MeshStandardMaterial({ color: '#9bbf78', roughness: 1 });

interface Cell { x: number; z: number; label: string }
const cells: Cell[] = [];

/** Cells on a grid; returns the origin (min corner) of cell i. */
function grid(n: number, cols: number, cw: number, cd: number): Array<{ x: number; z: number }> {
  return Array.from({ length: n }, (_, i) => ({ x: (i % cols) * cw, z: Math.floor(i / cols) * cd }));
}

function ground(w: number, d: number): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 4, d + 4), groundMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(w / 2, -0.02, d / 2);
  scene.add(m);
}

function baseLot(): Lot {
  return { id: 'sheet', name: 'Sheet', address: '', kind: 'residential', width: 64, depth: 64, landValue: 0, ownerHouseholdId: null, entry: { x: 0, z: 0, level: 0 }, levels: 1, walls: {}, floors: {}, openings: {}, objects: {}, ground: 'grass' };
}

const loader = new GLTFLoader();
function placeModel(defId: string, x: number, z: number): Promise<void> {
  const def = db.objects[defId]!;
  return new Promise((resolve) => {
    loader.load(`/assets/furniture/${def.model.asset}.glb`, (gltf) => {
      const g = new THREE.Group();
      const m = gltf.scene;
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const lit = new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.9, metalness: 0 });
        if (mat.name === 'lamp') { lit.emissive = new THREE.Color(0xffd36a); lit.emissiveIntensity = 0.8; }
        if (mat.name === 'glass') { lit.transparent = true; lit.opacity = 0.7; }
        mesh.material = lit;
      });
      m.scale.setScalar(def.model.scale);
      m.rotation.y = def.model.yaw;
      m.position.set(...def.model.offset);
      g.add(m);
      g.position.set(x, 0, z);
      scene.add(g);
      resolve();
    }, undefined, (e) => { sheet.errors.push(`model ${defId}: ${String(e)}`); resolve(); });
  });
}

function houseBox(x: number, z: number, w: number, d: number, color = '#e9dfcb'): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  m.position.set(x + w / 2, 1.4, z + d / 2);
  scene.add(m);
}

async function build(): Promise<{ w: number; d: number; h?: number }> {
  let extent: { w: number; d: number; h?: number } = { w: 10, d: 10 };
  switch (set) {
    case 'roofs': {
      const pos = grid(ROOF_STYLES.length, 4, 9, 12);
      const lot = baseLot();
      const fin = EXTERIOR.roofFinishes['asphalt-shingle']!;
      ROOF_STYLES.forEach((s, i) => {
        const p = pos[i]!;
        const w = s.id === 'pyramid' ? 5 : 6, d = s.id === 'pyramid' ? 5 : 4;
        houseBox(p.x + 1.5, p.z + 1.5, w, d);
        lot.roofs ??= {};
        const pal = ['charcoal', 'brown', 'red', 'green', 'blue-grey'][i % 5]!;
        lot.roofs[`r${i}`] = { id: `r${i}`, level: 0, x0: p.x + 1.5, z0: p.z + 1.5, x1: p.x + 1.5 + w, z1: p.z + 1.5 + d, styleId: s.id, ridge: 'h', pitch: s.pitch, finish: { designId: fin.id, paletteId: pal } };
        cells.push({ x: p.x + 1.5 + w / 2, z: p.z + 1.5 + d + 0.9, label: s.name });
      });
      const rv = new RoofView(db);
      rv.build(lot);
      rv.setView({ enabled: true, walls: 'up', level: 9, editing: true });
      scene.add(rv.group);
      extent = { w: 36, d: 36, h: 7 };
      break;
    }
    case 'finishes': {
      const combos = ROOF_FINISHES.flatMap((f) => f.palettes.slice(0, 3).map((p) => ({ f, p })));
      const pos = grid(combos.length, 6, 6, 8.5);
      const lot = baseLot();
      combos.forEach(({ f, p }, i) => {
        const q = pos[i]!;
        houseBox(q.x + 0.6, q.z + 0.6, 4, 3);
        lot.roofs ??= {};
        lot.roofs[`r${i}`] = { id: `r${i}`, level: 0, x0: q.x + 0.6, z0: q.z + 0.6, x1: q.x + 4.6, z1: q.z + 3.6, styleId: f.id === 'membrane' ? 'flat' : 'gable', ridge: 'h', pitch: 32, finish: { designId: f.id, paletteId: p.id } };
        cells.push({ x: q.x + 2.6, z: q.z + 4.5, label: `${f.name}: ${p.name}` });
      });
      const rv = new RoofView(db);
      rv.build(lot);
      rv.setView({ enabled: true, walls: 'up', level: 9, editing: true });
      scene.add(rv.group);
      extent = { w: 36, d: 8.5 * Math.ceil(combos.length / 6), h: 6 };
      break;
    }
    case 'fences': {
      const pos = grid(FENCES.length, 4, 7, 4.2);
      const lot = baseLot();
      FENCES.forEach((f, i) => {
        const p = pos[i]!;
        for (let k = 0; k < 5; k++) lot.fences ??= {}, lot.fences[`0:h:${p.x + 1 + k}:${p.z + 1}`] = { id: `0:h:${p.x + 1 + k}:${p.z + 1}`, level: 0, dir: 'h', x: p.x + 1 + k, z: p.z + 1, defId: f.id, variant: i % 4 };
        cells.push({ x: p.x + 3.5, z: p.z + 2.0, label: f.name });
      });
      const fv = new FenceView(db);
      fv.build(lot);
      scene.add(fv.group);
      extent = { w: 28, d: 25 };
      break;
    }
    case 'gates': {
      const pos = grid(GATES.length, 4, 7, 4.4);
      const lot = baseLot();
      GATES.forEach((g, i) => {
        const p = pos[i]!;
        const fenceId = g.id === 'gate-picket' || g.id === 'gate-picket-arch' ? 'picket-white' : g.id === 'gate-ranch' ? 'ranch-board' : g.id === 'gate-privacy' ? 'privacy-board'
          : g.id.includes('wrought') ? 'wrought-spear' : g.id === 'gate-lattice' ? 'lattice-top' : g.id === 'gate-glass' ? 'glass-panel' : g.id === 'gate-slat' ? 'slat-screen'
            : g.id === 'gate-stone-arch' ? 'stone-dry' : g.id === 'gate-hedge-arch' ? 'hedge-tall' : 'bamboo';
        const set1 = (k: number, defId: string) => { lot.fences ??= {}; lot.fences[`0:h:${p.x + 1 + k}:${p.z + 1}`] = { id: `0:h:${p.x + 1 + k}:${p.z + 1}`, level: 0, dir: 'h', x: p.x + 1 + k, z: p.z + 1, defId, variant: i % 4 }; };
        set1(0, fenceId); set1(1, fenceId); set1(2, g.id); set1(3, fenceId); set1(4, fenceId);
        cells.push({ x: p.x + 3.5, z: p.z + 2.0, label: g.name });
      });
      const fv = new FenceView(db);
      fv.build(lot);
      scene.add(fv.group);
      extent = { w: 28, d: 14 };
      break;
    }
    case 'garden': {
      const defs = GARDEN_OBJECTS;
      const pos = grid(defs.length, 4, 5, 5.6);
      await Promise.all(defs.map((d, i) => placeModel(d.id, pos[i]!.x + 1, pos[i]!.z + 0.8)));
      defs.forEach((d, i) => cells.push({ x: pos[i]!.x + 1 + d.footprint.w / 2, z: pos[i]!.z + 0.8 + d.footprint.d + 0.2, label: d.name }));
      extent = { w: 20, d: 22 };
      break;
    }
    case 'crops': {
      // vegetable patches at the four growth stages (empty, seedling, growing, ripe) with the tomato, carrot, pumpkin and a dry wilted one; herbs and trees
      const lot = baseLot();
      const bedAt = (id: string, defId: string, x: number, z: number, g: PlacedObject['garden']): PlacedObject => {
        const o = { id, defId, level: 0, x, z, rot: 0, finishes: {}, purchasePrice: 0, boughtAt: 0, ownerHouseholdId: null, condition: { dirt: 0, broken: false }, ...(g ? { garden: g } : {}) } as PlacedObject;
        lot.objects[id] = o;
        return o;
      };
      const gs = (crop: string, growth: number, need: number, water = 1) => ({ crop, growth, need, water, weeds: 0, day: 1, harvests: 0 });
      const beds: Array<[string, string, number, number, PlacedObject['garden'], string]> = [
        ['b1', 'garden-vegpatch', 0, 0, undefined, 'Empty bed'],
        ['b2', 'garden-vegpatch', 3, 0, gs('tomato', 1, 5), 'Seedlings'],
        ['b3', 'garden-vegpatch', 6, 0, gs('carrot', 3, 5), 'Growing'],
        ['b4', 'garden-vegpatch', 9, 0, gs('tomato', 5, 5), 'Ripe tomatoes'],
        ['b5', 'garden-vegpatch', 0, 3.5, gs('pumpkin', 7, 7), 'Ripe pumpkins'],
        ['b6', 'garden-vegpatch', 3, 3.5, gs('lettuce', 2, 3, 0), 'Dry: wilting'],
        ['b7', 'garden-herb-planter', 6.3, 3.6, gs('basil', 3, 3), 'Herbs, ripe'],
        ['b8', 'garden-herb-planter', 7.8, 3.6, gs('mint', 1, 3), 'Herbs, young'],
        ['b9', 'garden-fruit-tree', 9, 3.5, gs('apple', 6, 6), 'Apples, ripe'],
        ['b10', 'garden-fruit-tree', 12, 3.5, gs('lemon', 1, 7), 'Tree in blossom'],
      ];
      for (const [id, defId, x, z, g, label] of beds) {
        const o = bedAt(id, defId, x, z, g);
        cells.push({ x: x + db.objects[defId]!.footprint.w / 2, z: z + db.objects[defId]!.footprint.d + 0.2, label });
        void o;
      }
      await Promise.all(beds.map(([, defId, x, z]) => placeModel(defId, x, z)));
      const gv = new GardenView(db);
      gv.sync(lot, true);
      scene.add(gv.group);
      extent = { w: 15, d: 8 };
      break;
    }
    case 'stairs': {
      const pos = grid(STAIR_OBJECTS.length, 4, 5.5, 9.5);
      await Promise.all(STAIR_OBJECTS.map((d, i) => placeModel(d.id, pos[i]!.x + 1, pos[i]!.z + 0.5)));
      STAIR_OBJECTS.forEach((d, i) => cells.push({ x: pos[i]!.x + 1 + d.footprint.w / 2, z: pos[i]!.z + 0.5 + d.footprint.d + 0.2, label: d.name }));
      extent = { w: 22, d: 29, h: 4 };
      break;
    }
    case 'terrain': {
      const pos = grid(TERRAIN_PAINTS.length, 4, 4, 4);
      const lot = baseLot();
      lot.terrain = {};
      TERRAIN_PAINTS.forEach((p, i) => {
        const q = pos[i]!;
        for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) lot.terrain![`0:${q.x + dx}:${q.z + dz}`] = p.id;
        cells.push({ x: q.x + 1.5, z: q.z + 3.2, label: p.name });
      });
      const tv = new TerrainView(db);
      tv.build(lot);
      scene.add(tv.group);
      extent = { w: 16, d: 12 };
      break;
    }
    default: throw new Error(`unknown set ${set}`);
  }
  void EXTERIOR_OBJECTS;
  return extent;
}

function frame(extent: { w: number; d: number; h?: number }): void {
  ground(extent.w, extent.d);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const centre = new THREE.Vector3(extent.w / 2, 1.2, extent.d / 2);
  camera.position.copy(centre).add(new THREE.Vector3(0.32, 0.8, 1).normalize().multiplyScalar(120)); // from the front: rows of the grid run left to right
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  // fit: project the extent's corners and scale the frustum
  const corners = [[0, 0, 0], [extent.w, 0, 0], [0, 0, extent.d], [extent.w, 0, extent.d], [0, extent.h ?? 3.5, 0], [extent.w, extent.h ?? 3.5, 0], [0, extent.h ?? 3.5, extent.d], [extent.w, extent.h ?? 3.5, extent.d]]
    .map((c) => new THREE.Vector3(...(c as [number, number, number])).applyMatrix4(camera.matrixWorldInverse));
  const x0 = Math.min(...corners.map((c) => c.x)), x1 = Math.max(...corners.map((c) => c.x));
  const y0 = Math.min(...corners.map((c) => c.y)), y1 = Math.max(...corners.map((c) => c.y));
  const aspect = W / H;
  let hw = (x1 - x0) / 2 + 0.6, hh = (y1 - y0) / 2 + 0.8;
  if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  camera.left = cx - hw; camera.right = cx + hw; camera.top = cy + hh; camera.bottom = cy - hh;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const labels = document.getElementById('labels')!;
  for (const c of cells) {
    const v = new THREE.Vector3(c.x, 0, c.z).project(camera);
    const el = document.createElement('div');
    el.className = 'lb';
    el.textContent = c.label;
    el.style.left = `${((v.x + 1) / 2) * W}px`;
    el.style.top = `${((1 - v.y) / 2) * H}px`;
    labels.appendChild(el);
  }
  sheet.count = cells.length;
}

try {
  const extent = await build();
  frame(extent);
  sheet.ready = true;
} catch (e) {
  sheet.errors.push(String(e instanceof Error ? e.stack : e));
  sheet.ready = true;
}
