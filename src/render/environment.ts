// Surroundings of the active lot: grass with subtle variation, the lot border, a sidewalk and street on the
// entry side, and a few procedural trees and hedges outside the lot (merged into one vertex-coloured mesh).

import * as THREE from 'three';
import type { Lot, Season } from '../core/types';
import { EXTERIOR } from '../content/exterior';
import { poolTiles, poolsOf } from '../world/pools';
import { groundTexture } from './exteriorTextures';
import { GeoBuilder, hash01 } from './geo';

/** Height of the grass (floors are at 0, so their slab edge shows a little). */
export const GROUND_Y = -0.03;

interface GrassPalette { base: string; light: string; dark: string; bladeA: string; bladeB: string; bladeC: string }

/** Seasonal grass colours (Milestone 12): fresh green, deep green, dry gold-green, pale winter grass or snow. */
const GRASS_PALETTES: Record<Season, GrassPalette> = {
  spring: { base: '#86b865', light: 'rgba(185,220,135,0.38)', dark: 'rgba(90,140,65,0.32)', bladeA: 'rgba(205,230,150,0.5)', bladeB: 'rgba(105,150,75,0.45)', bladeC: 'rgba(80,125,60,0.35)' },
  summer: { base: '#7fa860', light: 'rgba(170,200,120,0.35)', dark: 'rgba(80,120,60,0.30)', bladeA: 'rgba(190,215,140,0.45)', bladeB: 'rgba(95,135,70,0.45)', bladeC: 'rgba(70,105,55,0.35)' },
  autumn: { base: '#9c9c58', light: 'rgba(205,200,125,0.38)', dark: 'rgba(120,110,55,0.32)', bladeA: 'rgba(215,200,125,0.5)', bladeB: 'rgba(150,135,75,0.45)', bladeC: 'rgba(120,95,55,0.35)' },
  winter: { base: '#a8b3a0', light: 'rgba(220,228,215,0.4)', dark: 'rgba(120,132,118,0.3)', bladeA: 'rgba(225,232,220,0.5)', bladeB: 'rgba(150,160,145,0.45)', bladeC: 'rgba(120,130,115,0.35)' },
};
const SNOW_PALETTE: GrassPalette = {
  base: '#e7eef4', light: 'rgba(255,255,255,0.55)', dark: 'rgba(185,202,216,0.25)',
  bladeA: 'rgba(248,252,255,0.7)', bladeB: 'rgba(210,224,235,0.55)', bladeC: 'rgba(185,202,216,0.4)',
};

function grassTexture(season: Season = 'summer', snowy = false): THREE.CanvasTexture {
  const pal = snowy ? SNOW_PALETTE : GRASS_PALETTES[season];
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, size, size);
  // soft patches
  for (let i = 0; i < 40; i++) {
    const x = hash01(i * 7 + 1) * size, y = hash01(i * 13 + 5) * size, r = 18 + hash01(i * 3 + 9) * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = hash01(i * 11) > 0.5;
    g.addColorStop(0, light ? pal.light : pal.dark);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
  }
  // blades (snow: soft drifts and a few pale stems)
  for (let i = 0; i < 2600; i++) {
    const x = hash01(i * 17 + 3) * size, y = hash01(i * 29 + 7) * size;
    const v = hash01(i * 5 + 2);
    ctx.strokeStyle = v > 0.6 ? pal.bladeA : v > 0.3 ? pal.bladeB : pal.bladeC;
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
  private grassTex = grassTexture();
  private readonly grass = new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1, color: 0xffffff });
  private readonly lotGrass = new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1, color: 0xf4ffe8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private readonly paving = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  private readonly foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private key = '';
  private seasonKey = '';
  /** Base ground of the lot when it is not grass (Lot.ground, Milestone 9): its own tiled texture. */
  private groundMat: { key: string; mat: THREE.MeshStandardMaterial; tex: THREE.Texture | null } | null = null;

  constructor() { this.group.name = 'environment'; }

  build(lot: Pick<Lot, 'width' | 'depth' | 'entry' | 'id'> & { ground?: Lot['ground']; pools?: Lot['pools'] }, season: Season = 'summer', snowy = false): void {
    const sk = `${season}:${snowy}`;
    if (sk !== this.seasonKey) {
      this.seasonKey = sk;
      const old = this.grassTex;
      this.grassTex = grassTexture(season, snowy);
      this.grass.map = this.grassTex;
      this.lotGrass.map = this.grassTex;
      this.grass.needsUpdate = true;
      this.lotGrass.needsUpdate = true;
      old.dispose();
      // Snow on a grass lot reads cool white; winter grass is a little paler than summer.
      this.lotGrass.color.set(snowy ? 0xffffff : season === 'winter' ? 0xe2e8dd : season === 'autumn' ? 0xf6ecd4 : season === 'spring' ? 0xf7ffe9 : 0xf4ffe8);
    }
    // Milestone 12: the lot ground has a hole under every pool (the basin and water are drawn by render/poolView.ts).
    const poolKey = poolsOf(lot as Lot).map((p) => `${p.id}:${p.x0},${p.z0},${p.x1},${p.z1}`).join(';');
    const key = `${lot.id}:${lot.width}:${lot.depth}:${lot.entry.x}:${lot.entry.z}:${lot.ground ?? 'grass'}:${sk}:${poolKey}`;
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

    const groundMat = this.lotMaterial(lot.ground ?? 'grass');
    const holes = new Set(poolsOf(lot as Lot).flatMap((p) => poolTiles(p).map((t) => `${t.x},${t.z}`)));
    if (holes.size === 0) {
      const lotGeo = new THREE.PlaneGeometry(W, D);
      lotGeo.rotateX(-Math.PI / 2);
      const luv = lotGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * W / 3 + 0.37, luv.getY(i) * D / 3 + 0.21);
      const lotMesh = new THREE.Mesh(lotGeo, groundMat);
      lotMesh.position.set(cx, GROUND_Y, cz);
      lotMesh.receiveShadow = true;
      lotMesh.userData.ownGeometry = true;
      this.group.add(lotMesh);
    } else {
      // tiles around the pools, the same world-aligned uv as the plane (so the grass pattern is unchanged)
      const b = new GeoBuilder();
      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          if (holes.has(`${x},${z}`)) continue;
          b.quad([x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1], [0, 1, 0],
            [[x / 3 + 0.37, z / 3 + 0.21], [(x + 1) / 3 + 0.37, z / 3 + 0.21], [(x + 1) / 3 + 0.37, (z + 1) / 3 + 0.21], [x / 3 + 0.37, (z + 1) / 3 + 0.21]]);
        }
      }
      const lotMesh = new THREE.Mesh(b.build(), groundMat);
      lotMesh.position.set(0, GROUND_Y, 0);
      lotMesh.receiveShadow = true;
      lotMesh.userData.ownGeometry = true;
      this.group.add(lotMesh);
    }

    // entry side: south (+z) unless the entry tile is on another edge
    const e = lot.entry;
    const side = e.z >= D - 1 ? 0 : e.z <= 0 ? 2 : e.x >= W - 1 ? 1 : e.x <= 0 ? 3 : 0;
    const pave = new GeoBuilder();
    const curb = new THREE.Color('#d8d2c6'), walk = new THREE.Color('#cfc8bb'), road = new THREE.Color('#5e6164'), line = new THREE.Color('#efe6c8'), edge = new THREE.Color('#bdb5a6');
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
    spots.forEach(([x, z, s], i) => tree(fol, x, z, s, seed + i, season, snowy));
    // hedges along the side boundaries, leaving the street side open
    for (let zz = -half + 0.5; zz < half - 1; zz += 1.1) {
      shrub(fol, -half - 0.75, zz, 0.55 + hash01(seed + zz * 13) * 0.2, seed + Math.round(zz * 7), season, snowy);
      shrub(fol, half + 0.75, zz, 0.55 + hash01(seed + zz * 17) * 0.2, seed + Math.round(zz * 11), season, snowy);
    }
    for (let xx = -half + 0.5; xx < half; xx += 1.1) shrub(fol, xx, -half - 0.75, 0.5 + hash01(seed + xx * 19) * 0.2, seed + Math.round(xx * 5), season, snowy);
    const folMesh = new THREE.Mesh(fol.build(), this.foliage);
    folMesh.castShadow = true;
    folMesh.receiveShadow = true;
    folMesh.userData.ownGeometry = true;
    holder.add(folMesh);
    this.group.add(holder);
  }

  /** The lot's ground material: the shared grass, or a tiled texture of its dirt or paving paint (world/terrain.ts uses the same ids). */
  private lotMaterial(ground: Lot['ground']): THREE.MeshStandardMaterial {
    const def = EXTERIOR.terrain[ground];
    if (ground === 'grass' || !def) return this.lotGrass;
    if (this.groundMat?.key === ground) return this.groundMat.mat;
    this.groundMat?.tex?.dispose();
    this.groundMat?.mat.dispose();
    const tex = groundTexture(def, 128);
    if (tex) tex.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...(tex ? { map: tex } : { color: def.color }),
    });
    this.groundMat = { key: ground, mat, tex };
    return mat;
  }

  private clear(): void {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.ownGeometry) m.geometry.dispose(); });
    for (const c of [...this.group.children]) c.removeFromParent();
  }

  dispose(): void {
    this.clear();
    this.grassTex.dispose();
    for (const m of [this.grass, this.lotGrass, this.paving, this.foliage]) m.dispose();
    this.groundMat?.tex?.dispose();
    this.groundMat?.mat.dispose();
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

/** Foliage colour by season (fresh green, deep green, orange/brown, pale bare winter branches). */
function leafColour(season: Season, hue: number, lightness: number): THREE.Color {
  switch (season) {
    case 'spring': return new THREE.Color().setHSL(0.25 + hue * 0.05, 0.55, 0.38 + lightness * 0.5);
    case 'summer': return new THREE.Color().setHSL(0.28 + hue * 0.04, 0.48, 0.30 + lightness * 0.5);
    case 'autumn': return new THREE.Color().setHSL(0.07 + hue * 0.06, 0.62, 0.33 + lightness * 0.5);
    case 'winter': return new THREE.Color().setHSL(0.28 + hue * 0.03, 0.12, 0.4 + lightness * 0.5);
  }
}

const SNOW_WHITE = '#eef5fa';

function tree(b: GeoBuilder, x: number, z: number, s: number, seed: number, season: Season, snowy: boolean): void {
  const trunk = new THREE.Color(season === 'winter' ? '#7c6a58' : '#8a6448');
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
  const leaf = leafColour(season, hue, hash01(seed) * 0.16);
  const conifer = hash01(seed * 3) > 0.7;
  const snow = new THREE.Color(SNOW_WHITE);
  if (conifer) {
    for (let i = 0; i < 3; i++) {
      const tierY = y0 + h + 0.3 + i * 0.75 * s;
      const tierS = (1.0 - i * 0.28) * s;
      const green = season === 'winter' ? leaf.clone().offsetHSL(0, 0.06, -0.02) : new THREE.Color().setHSL(0.3, 0.34, 0.28 + hash01(seed) * 0.05);
      blob(b, x, tierY, z, tierS, 0.7 * s, tierS, green, seed + i);
      if (snowy) blob(b, x, tierY + 0.32 * s, z, tierS * 0.9, 0.22 * s, tierS * 0.9, snow, seed + 20 + i);
    }
  } else {
    blob(b, x, y0 + h + 0.9 * s, z, 1.25 * s, 1.0 * s, 1.2 * s, leaf, seed);
    blob(b, x + 0.55 * s, y0 + h + 0.55 * s, z + 0.3 * s, 0.8 * s, 0.7 * s, 0.8 * s, leaf.clone().offsetHSL(0, 0, 0.05), seed + 1);
    blob(b, x - 0.5 * s, y0 + h + 0.6 * s, z - 0.35 * s, 0.75 * s, 0.65 * s, 0.75 * s, leaf.clone().offsetHSL(0.01, 0, -0.03), seed + 2);
    if (snowy) {
      // settled snow on the top of the crown
      blob(b, x, y0 + h + 1.45 * s, z, 0.95 * s, 0.28 * s, 0.9 * s, snow, seed + 30);
      blob(b, x + 0.5 * s, y0 + h + 1.0 * s, z + 0.28 * s, 0.55 * s, 0.2 * s, 0.55 * s, snow, seed + 31);
    }
  }
}

function shrub(b: GeoBuilder, x: number, z: number, s: number, seed: number, season: Season, snowy: boolean): void {
  const c = leafColour(season, hash01(seed) * 0.5, hash01(seed * 5) * 0.12);
  blob(b, x, GROUND_Y + 0.35 * s, z, 0.62 * s, 0.5 * s, 0.6 * s, c, seed);
  if (snowy) blob(b, x, GROUND_Y + 0.66 * s, z, 0.5 * s, 0.16 * s, 0.48 * s, new THREE.Color(SNOW_WHITE), seed + 40);
}
