// Surroundings of the active lot: grass with subtle variation, the lot border, a sidewalk and street on the
// entry side, and a few procedural trees and hedges outside the lot (merged into one vertex-coloured mesh).

import * as THREE from 'three';
import type { Lot } from '../core/types';
import { GeoBuilder, hash01 } from './geo';

const GROUND_Y = -0.045;

function grassTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7fa860';
  ctx.fillRect(0, 0, size, size);
  // soft patches
  for (let i = 0; i < 40; i++) {
    const x = hash01(i * 7 + 1) * size, y = hash01(i * 13 + 5) * size, r = 18 + hash01(i * 3 + 9) * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = hash01(i * 11) > 0.5;
    g.addColorStop(0, light ? 'rgba(170,200,120,0.35)' : 'rgba(80,120,60,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
  }
  // blades
  for (let i = 0; i < 2600; i++) {
    const x = hash01(i * 17 + 3) * size, y = hash01(i * 29 + 7) * size;
    const v = hash01(i * 5 + 2);
    ctx.strokeStyle = v > 0.6 ? 'rgba(190,215,140,0.45)' : v > 0.3 ? 'rgba(95,135,70,0.45)' : 'rgba(70,105,55,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (v - 0.5) * 3, y - 3 - v * 3); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export class EnvironmentView {
  readonly group = new THREE.Group();
  private readonly grassTex = grassTexture();
  private readonly grass = new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1, color: 0xffffff });
  private readonly lotGrass = new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1, color: 0xf4ffe8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private readonly paving = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  private readonly foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private key = '';

  constructor() { this.group.name = 'environment'; }

  build(lot: Pick<Lot, 'width' | 'depth' | 'entry' | 'id'>): void {
    const key = `${lot.id}:${lot.width}:${lot.depth}:${lot.entry.x}:${lot.entry.z}`;
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const W = lot.width, D = lot.depth;
    const cx = W / 2, cz = D / 2;
    const EXT = 90;

    // ground
    const groundGeo = new THREE.PlaneGeometry(EXT * 2, EXT * 2);
    groundGeo.rotateX(-Math.PI / 2);
    const uv = groundGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * EXT * 2 / 3, uv.getY(i) * EXT * 2 / 3);
    const ground = new THREE.Mesh(groundGeo, this.grass);
    ground.position.set(cx, GROUND_Y - 0.004, cz);
    ground.receiveShadow = true;
    ground.userData.ownGeometry = true;
    this.group.add(ground);

    const lotGeo = new THREE.PlaneGeometry(W, D);
    lotGeo.rotateX(-Math.PI / 2);
    const luv = lotGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * W / 3 + 0.37, luv.getY(i) * D / 3 + 0.21);
    const lotMesh = new THREE.Mesh(lotGeo, this.lotGrass);
    lotMesh.position.set(cx, GROUND_Y, cz);
    lotMesh.receiveShadow = true;
    lotMesh.userData.ownGeometry = true;
    this.group.add(lotMesh);

    // entry side: south (+z) unless the entry tile is on another edge
    const e = lot.entry;
    const side = e.z >= D - 1 ? 0 : e.z <= 0 ? 2 : e.x >= W - 1 ? 1 : e.x <= 0 ? 3 : 0;
    const pave = new GeoBuilder();
    const curb = new THREE.Color('#d8d2c6'), walk = new THREE.Color('#cfc8bb'), road = new THREE.Color('#6d6a66'), line = new THREE.Color('#efe6c8'), edge = new THREE.Color('#bdb5a6');
    // built for the south side in lot-centred coordinates, then rotated
    const half = W / 2; // square lots in M1
    const y = GROUND_Y + 0.003;
    const strip = (z0: number, z1: number, c: THREE.Color, yy = y, x0 = -EXT, x1 = EXT) => pave.quad([x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1], [0, 1, 0], undefined, c);
    strip(half + 0.15, half + 2.1, walk);
    strip(half + 2.1, half + 2.35, curb, y + 0.04);
    pave.quad([-EXT, GROUND_Y - 0.004, half + 2.35], [EXT, GROUND_Y - 0.004, half + 2.35], [EXT, y + 0.04, half + 2.35], [-EXT, y + 0.04, half + 2.35], [0, 0, 1], undefined, edge);
    strip(half + 2.35, half + 9.0, road, y - 0.002);
    for (let x = -EXT; x < EXT; x += 3) strip(half + 5.6, half + 5.75, line, y, x, x + 1.6);
    strip(half + 9.0, half + 9.25, curb, y + 0.04);
    strip(half + 9.25, half + 11.2, walk);
    // lot border (thin light edging on the other three sides)
    const b = 0.08;
    strip(-half - b, -half, edge, y);
    pave.quad([-half - b, y, -half], [-half, y, -half], [-half, y, half], [-half - b, y, half], [0, 1, 0], undefined, edge);
    pave.quad([half, y, -half], [half + b, y, -half], [half + b, y, half], [half, y, half], [0, 1, 0], undefined, edge);
    const paveMesh = new THREE.Mesh(pave.build(), this.paving);
    paveMesh.receiveShadow = true;
    paveMesh.userData.ownGeometry = true;
    const holder = new THREE.Group();
    holder.position.set(cx, 0, cz);
    holder.rotation.y = side * Math.PI / 2;
    holder.add(paveMesh);

    // trees and hedges (lot-centred, south = street)
    const fol = new GeoBuilder();
    const seed = [...lot.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) | 0;
    const spots: Array<[number, number, number]> = [];
    for (let i = 0; spots.length < 22 && i < 400; i++) {
      const x = (hash01(seed + i * 3) * 2 - 1) * (half + 16);
      const z = (hash01(seed + i * 3 + 1) * 2 - 1) * (half + 16);
      const inLot = Math.abs(x) < half + 1.2 && Math.abs(z) < half + 1.2;
      const onStreet = z > half - 0.5 && z < half + 12;
      if (inLot || onStreet) continue;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 3.2)) continue;
      spots.push([x, z, 0.75 + hash01(seed + i * 5) * 0.6]);
    }
    // a pair of street trees in the verge beyond the far sidewalk
    for (const x of [-half + 3, half - 4]) spots.push([x, half + 13, 0.9]);
    spots.forEach(([x, z, s], i) => tree(fol, x, z, s, seed + i));
    // hedges along the side boundaries, leaving the street side open
    for (let zz = -half + 0.5; zz < half - 1; zz += 1.1) {
      shrub(fol, -half - 0.75, zz, 0.55 + hash01(seed + zz * 13) * 0.2, seed + Math.round(zz * 7));
      shrub(fol, half + 0.75, zz, 0.55 + hash01(seed + zz * 17) * 0.2, seed + Math.round(zz * 11));
    }
    for (let xx = -half + 0.5; xx < half; xx += 1.1) shrub(fol, xx, -half - 0.75, 0.5 + hash01(seed + xx * 19) * 0.2, seed + Math.round(xx * 5));
    const folMesh = new THREE.Mesh(fol.build(), this.foliage);
    folMesh.castShadow = true;
    folMesh.receiveShadow = true;
    folMesh.userData.ownGeometry = true;
    holder.add(folMesh);
    this.group.add(holder);
  }

  private clear(): void {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.ownGeometry) m.geometry.dispose(); });
    for (const c of [...this.group.children]) c.removeFromParent();
  }

  dispose(): void {
    this.clear();
    this.grassTex.dispose();
    for (const m of [this.grass, this.lotGrass, this.paving, this.foliage]) m.dispose();
  }
}

const ico = new THREE.IcosahedronGeometry(1, 1);
const icoPos = ico.getAttribute('position') as THREE.BufferAttribute;

/** Adds a scaled, jittered icosahedron blob (flat faces) with a colour. */
function blob(b: GeoBuilder, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: THREE.Color, seed: number): void {
  const idx = ico.getIndex();
  const n = idx ? idx.count : icoPos.count;
  const v = (i: number): [number, number, number] => {
    const j = idx ? idx.getX(i) : i;
    const x = icoPos.getX(j), y = icoPos.getY(j), z = icoPos.getZ(j);
    const k = 1 + (hash01(seed * 131 + Math.round((x * 7 + y * 13 + z * 17) * 100)) - 0.5) * 0.18;
    return [cx + x * sx * k, cy + y * sy * k, cz + z * sz * k];
  };
  for (let i = 0; i < n; i += 3) {
    const a = v(i), c1 = v(i + 1), c2 = v(i + 2);
    const ux = c1[0] - a[0], uy = c1[1] - a[1], uz = c1[2] - a[2];
    const wx = c2[0] - a[0], wy = c2[1] - a[1], wz = c2[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const shade = color.clone().multiplyScalar(0.85 + 0.25 * Math.max(0, ny));
    // degenerate quad (triangle) through the builder
    b.quad(a, c1, c2, c2, [nx, ny, nz], undefined, shade);
  }
}

function tree(b: GeoBuilder, x: number, z: number, s: number, seed: number): void {
  const trunk = new THREE.Color('#8a6448');
  const h = 1.3 * s;
  const r = 0.11 * s;
  const y0 = GROUND_Y;
  // square trunk
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const px = x + nx * r, pz = z + nz * r;
    const tx = nz, tz = -nx;
    b.quad([px - tx * r, y0, pz - tz * r], [px + tx * r, y0, pz + tz * r], [px + tx * r, y0 + h, pz + tz * r], [px - tx * r, y0 + h, pz - tz * r], [nx, 0, nz], undefined, trunk);
  }
  const hue = hash01(seed * 7);
  const leaf = new THREE.Color().setHSL(0.24 + hue * 0.08, 0.42, 0.33 + hash01(seed) * 0.08);
  const conifer = hash01(seed * 3) > 0.7;
  if (conifer) {
    for (let i = 0; i < 3; i++) blob(b, x, y0 + h + 0.3 + i * 0.75 * s, z, (1.0 - i * 0.28) * s, 0.7 * s, (1.0 - i * 0.28) * s, leaf.clone().offsetHSL(0.02, 0, -0.05), seed + i);
  } else {
    blob(b, x, y0 + h + 0.9 * s, z, 1.25 * s, 1.0 * s, 1.2 * s, leaf, seed);
    blob(b, x + 0.55 * s, y0 + h + 0.55 * s, z + 0.3 * s, 0.8 * s, 0.7 * s, 0.8 * s, leaf.clone().offsetHSL(0, 0, 0.05), seed + 1);
    blob(b, x - 0.5 * s, y0 + h + 0.6 * s, z - 0.35 * s, 0.75 * s, 0.65 * s, 0.75 * s, leaf.clone().offsetHSL(0.01, 0, -0.03), seed + 2);
  }
}

function shrub(b: GeoBuilder, x: number, z: number, s: number, seed: number): void {
  const c = new THREE.Color().setHSL(0.27 + hash01(seed) * 0.05, 0.4, 0.3 + hash01(seed * 5) * 0.06);
  blob(b, x, GROUND_Y + 0.35 * s, z, 0.62 * s, 0.5 * s, 0.6 * s, c, seed);
}
