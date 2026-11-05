// Milestone 9: staircase models built at runtime (no GLB). The asset id of a stair ObjectDef starts with 'proc:'; ObjectAssets
// asks proceduralModel(asset) for the scene and then treats it like a loaded model: the materials are named after the object's
// finish regions ('wood' and 'rail' for the basic stair) and get recoloured by the chosen swatches. Rot-0 local space as for every
// object (core/geometry.ts): origin at the footprint's min corner, the foot of the stair on the front (+z) row, rising toward -z.
//
// Built-in ids: 'proc:stair-straight-WxD' (W 1-2 wide, D tiles deep) and 'proc:stair-spiral-L' (2 x 2, L = 3 or 4).
// M9-ext can add designs with registerProceduralModel(assetId, builder).

import * as THREE from 'three';
import { LEVEL_HEIGHT } from '../world/levels';
import { outdoorModel, outdoorThumb } from './outdoorModels';

export type ProceduralBuilder = () => THREE.Group;

const registry = new Map<string, ProceduralBuilder>();

/** Registers (or replaces) the builder of a 'proc:' asset id. */
export function registerProceduralModel(asset: string, builder: ProceduralBuilder): void { registry.set(asset, builder); }

export function isProceduralAsset(asset: string): boolean { return asset.startsWith('proc:'); }

/** Default base colours of the basic stair; the finish swatches replace them. */
const WOOD = 0xe59a64;
const RAIL = 0xf1ece3;

function mat(name: string, color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name, color, roughness: 0.8, metalness: 0 });
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** The scene of a procedural asset, or null when the id is unknown. */
export function proceduralModel(asset: string): THREE.Group | null {
  const custom = registry.get(asset);
  if (custom) return custom();
  const outdoor = outdoorModel(asset);
  if (outdoor) return outdoor;
  const straight = /^proc:stair-straight-(\d)x(\d)$/.exec(asset);
  if (straight) return straightStair(Number(straight[1]), Number(straight[2]));
  const spiral = /^proc:stair-spiral-(\d)$/.exec(asset);
  if (spiral) return spiralStair(Number(spiral[1]));
  return null;
}

/** Straight flight: solid steps, a stringer along each side and a handrail on both sides. */
function straightStair(w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('wood', WOOD), rail = mat('rail', RAIL);
  const H = LEVEL_HEIGHT;
  const n = Math.max(6, Math.round(d * 5));
  const run = d / n;
  for (let k = 0; k < n; k++) {
    const top = ((k + 1) * H) / n;
    const zFront = d - k * run;
    g.add(box(w - 0.12, top, run, w / 2, top / 2, zFront - run / 2, wood));
  }
  // stringers: solid side boards (the triangle under the flight) and a handrail on each side
  const slope = Math.atan2(H, d);
  const len = Math.hypot(d, H) - 0.12;
  const profile = new THREE.Shape();
  profile.moveTo(d, 0);
  profile.lineTo(0, 0);
  profile.lineTo(0, H);
  profile.closePath();
  for (const x of [0.03, w - 0.03]) {
    const board = new THREE.ExtrudeGeometry(profile, { depth: 0.06, bevelEnabled: false });
    board.rotateY(-Math.PI / 2); // the profile's x runs along z, the thickness along x
    board.translate(x + 0.03, 0, 0);
    g.add(new THREE.Mesh(board, wood));
    // handrail: posts at both ends and a bar parallel to the flight, 0.9 m above the treads
    const bar = box(0.05, 0.05, len, x, 0, 0, rail);
    bar.position.set(x, H / 2 + 0.9, d / 2);
    bar.rotation.x = slope;
    g.add(bar);
    for (const t of [0.04, 0.5, 0.96]) {
      const z = d - t * d, y = t * H;
      g.add(box(0.045, 0.9, 0.045, x, y + 0.45, z, rail));
    }
  }
  return g;
}

/** Spiral: wedge steps around a centre pole (2 x 2 tiles); L = 3 or 4 is how many tiles it walks. */
function spiralStair(length: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('wood', WOOD), rail = mat('rail', RAIL);
  const H = LEVEL_HEIGHT;
  const n = 12;
  const a0 = -Math.PI / 8, a1 = length === 4 ? (9 * Math.PI) / 8 : (7 * Math.PI) / 8;
  const step = (a1 - a0) / n;
  for (let k = 0; k < n; k++) {
    const top = ((k + 1) * H) / n;
    const geo = new THREE.CylinderGeometry(0.98, 0.98, top, 6, 1, false, a0 + k * step - 0.01, step + 0.02);
    const m = new THREE.Mesh(geo, wood);
    m.position.set(1, top / 2, 1);
    g.add(m);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, H + 0.9, 12), rail);
  pole.position.set(1, (H + 0.9) / 2, 1);
  g.add(pole);
  // a banister post every few steps along the outer edge
  for (let k = 0; k < n; k += 3) {
    const a = a0 + (k + 0.5) * step, y = ((k + 1) * H) / n;
    g.add(box(0.04, 0.9, 0.04, 1 + Math.sin(a) * 0.93, y + 0.45, 1 + Math.cos(a) * 0.93, rail));
  }
  return g;
}

/** Inline SVG picture of a stair for the catalog (there is no GLB thumbnail). */
export function proceduralThumb(asset: string): string {
  const outdoor = outdoorThumb(asset);
  if (outdoor) return outdoor;
  const spiral = asset.includes('spiral');
  const body = spiral
    ? '<circle cx="48" cy="52" r="26" fill="#d7b087"/><path d="M48 52 L48 26 A26 26 0 0 1 74 52Z" fill="#b98a5c"/><circle cx="48" cy="52" r="5" fill="#f1ece3"/>'
    : '<path d="M14 74 L14 62 L30 62 L30 50 L46 50 L46 38 L62 38 L62 26 L80 26 L80 74Z" fill="#d7b087"/><path d="M14 62 L30 62 M30 50 L46 50 M46 38 L62 38 M62 26 L80 26" stroke="#8a5a3c" stroke-width="3" fill="none"/><path d="M14 56 L80 20" stroke="#f1ece3" stroke-width="3"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="10" fill="#f4ede1"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
