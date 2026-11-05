// Milestone 12: swimming pools. Each pool is a basin (tiled inner walls and floor, a stone coping frame at ground
// level), a water surface with a cheap animated shader (two crossed sines for the swell and a caustic sparkle), and a
// steel ladder at each ladder tile. Everything is a handful of boxes and two planes with shared materials per pool
// style, so a phone GPU draws a whole pool in a few dozen triangles per box; the water shader is one pass with no
// texture fetches. The lot ground itself has a hole cut under every pool (render/environment.ts).
//
// Pure view: nothing here changes the state. The water animates from the frame clock (GameView -> ExteriorView.update).

import * as THREE from 'three';
import { exteriorOf } from '../content/exterior';
import type { ContentDB } from '../content/types';
import type { Lot, Pool } from '../core/types';
import { poolsOf } from '../world/pools';

/** Water surface height: a hair above the ground (floors sit at 0) so it never z-fights with the lawn. */
export const WATER_Y = 0.015;
const COPING_TOP = 0.055;
const BASIN_DEPTH = 0.8;
/** Width of the coping and of the water's inset from the pool edge. */
const INSET = 0.3;

interface PoolMaterials {
  tile: THREE.MeshStandardMaterial;
  coping: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** A box mesh scaled to a size and centred at (x, y, z). */
function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, name: string): THREE.Mesh {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.name = name;
  return m;
}

function plane(mat: THREE.Material, w: number, d: number, x: number, y: number, z: number, name: string): THREE.Mesh {
  const m = new THREE.Mesh(unitPlane, mat);
  m.scale.set(w, 1, d);
  m.position.set(x, y, z);
  m.name = name;
  return m;
}

export class PoolView {
  readonly group = new THREE.Group();
  private readonly built = new Map<string, THREE.Group>();
  private readonly mats = new Map<string, PoolMaterials>();
  /** Shared with every water material: seconds of scene time (the waves move with it). */
  private readonly clock = { value: 0 };

  constructor(private readonly content?: ContentDB) { this.group.name = 'pools'; }

  /** Rebuilds all pools of the lot. */
  build(lot: Lot): void {
    this.clearPools();
    for (const pool of poolsOf(lot)) this.buildPool(pool);
  }

  /** Advances the water animation (cheap: one uniform per water material). */
  update(dt: number): void { this.clock.value += dt; }

  /** Number of pools drawn (tests, stats). */
  poolCount(): number { return this.built.size; }

  private materials(styleId: string): PoolMaterials {
    const hit = this.mats.get(styleId);
    if (hit) return hit;
    const style = exteriorOf(this.content).poolStyles[styleId] ?? Object.values(exteriorOf(this.content).poolStyles)[0]!;
    const water = new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.water), roughness: 0.14, metalness: 0.0, transparent: true, opacity: 0.8,
      depthWrite: false, name: `pool-water-${style.id}`,
    });
    // Subtle moving swell plus a caustic-like sparkle, patched into the standard shader so lighting, fog and tone
    // mapping still apply. No texture fetches; two sines and two powers per pixel.
    water.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.clock;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPoolPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPoolPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPoolPos;\nuniform float uTime;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float swell = sin(vPoolPos.x * 2.6 + uTime * 0.7) * sin(vPoolPos.z * 3.1 - uTime * 0.9);
          float caustic = pow(max(0.0, sin(vPoolPos.x * 4.5 + uTime * 0.55) * sin(vPoolPos.z * 5.3 - uTime * 0.62)), 4.0);
          float sparkle = pow(max(0.0, swell), 8.0);
          gl_FragColor.rgb += vec3(0.05, 0.09, 0.10) * (0.5 + 0.5 * swell) + vec3(0.16, 0.18, 0.16) * caustic + vec3(0.22) * sparkle;
          gl_FragColor.a = clamp(gl_FragColor.a + caustic * 0.12 + sparkle * 0.1, 0.0, 0.95);`);
    };
    water.customProgramCacheKey = () => 'pool-water';
    const made: PoolMaterials = {
      tile: new THREE.MeshStandardMaterial({ color: new THREE.Color(style.tile), roughness: 0.42, metalness: 0.0, name: `pool-tile-${style.id}` }),
      coping: new THREE.MeshStandardMaterial({ color: new THREE.Color(style.coping), roughness: 0.9, name: `pool-coping-${style.id}` }),
      water,
      metal: new THREE.MeshStandardMaterial({ color: 0xd9dee2, roughness: 0.32, metalness: 0.55, name: 'pool-ladder' }),
    };
    this.mats.set(styleId, made);
    return made;
  }

  private buildPool(pool: Pool): void {
    const mat = this.materials(pool.styleId);
    const x0 = pool.x0, z0 = pool.z0, x1 = pool.x1 + 1, z1 = pool.z1 + 1;
    const w = x1 - x0, d = z1 - z0;
    const g = new THREE.Group();
    g.name = `pool-${pool.id}`;
    g.userData.poolId = pool.id;

    // basin: tiled walls and floor under the water
    const iw = Math.max(0.1, w - INSET * 2), id = Math.max(0.1, d - INSET * 2);
    const wy = -BASIN_DEPTH + 0.02;
    const floor = plane(mat.tile, iw + 0.12, id + 0.12, x0 + w / 2, wy, z0 + d / 2, 'pool-basin-floor');
    floor.receiveShadow = true;
    g.add(floor);
    const wallH = BASIN_DEPTH + WATER_Y;
    const wallY = wy + wallH / 2;
    g.add(box(mat.tile, iw, wallH, 0.12, x0 + w / 2, wallY, z0 + INSET, 'pool-wall-n'));
    g.add(box(mat.tile, iw, wallH, 0.12, x0 + w / 2, wallY, z1 - INSET, 'pool-wall-s'));
    g.add(box(mat.tile, 0.12, wallH, id, x0 + INSET, wallY, z0 + d / 2, 'pool-wall-w'));
    g.add(box(mat.tile, 0.12, wallH, id, x1 - INSET, wallY, z0 + d / 2, 'pool-wall-e'));

    // coping frame at ground level
    const cw = 0.04;
    const cy = COPING_TOP - cw / 2;
    g.add(box(mat.coping, w, cw, INSET, x0 + w / 2, cy, z0 + INSET / 2, 'pool-coping-n'));
    g.add(box(mat.coping, w, cw, INSET, x0 + w / 2, cy, z1 - INSET / 2, 'pool-coping-s'));
    g.add(box(mat.coping, INSET, cw, d - INSET * 2, x0 + INSET / 2, cy, z0 + d / 2, 'pool-coping-w'));
    g.add(box(mat.coping, INSET, cw, d - INSET * 2, x1 - INSET / 2, cy, z0 + d / 2, 'pool-coping-e'));

    // water surface
    const water = plane(mat.water, iw, id, x0 + w / 2, WATER_Y, z0 + d / 2, 'pool-water');
    water.renderOrder = 2;
    g.add(water);

    for (const l of pool.ladders) g.add(this.ladder(mat, l.x, l.z, l.side));
    this.group.add(g);
    this.built.set(pool.id, g);
  }

  /** Steel ladder at an edge tile: two rails over the coping and three rungs, on the deck side of the water. */
  private ladder(mat: PoolMaterials, tileX: number, tileZ: number, side: 'n' | 's' | 'e' | 'w'): THREE.Group {
    const g = new THREE.Group();
    g.name = 'pool-ladder';
    const railH = 1.5, railY = WATER_Y + 0.38;
    for (const dx of [-0.22, 0.22]) g.add(box(mat.metal, 0.06, railH, 0.06, dx, railY, 0.12, 'pool-ladder-rail'));
    for (const y of [railY - 0.75, railY - 0.45, railY - 0.15, railY + 0.15]) {
      g.add(box(mat.metal, 0.5, 0.05, 0.05, 0, y, 0.12, 'pool-ladder-rung'));
    }
    // the ladder stands on the pool edge of its side; local +z points into the water
    const angle = side === 'n' ? 0 : side === 's' ? Math.PI : side === 'w' ? Math.PI / 2 : -Math.PI / 2;
    const px = side === 'w' ? tileX : side === 'e' ? tileX + 1 : tileX + 0.5;
    const pz = side === 'n' ? tileZ : side === 's' ? tileZ + 1 : tileZ + 0.5;
    g.position.set(px, 0, pz);
    g.rotation.y = angle;
    return g;
  }

  private clearPools(): void {
    for (const g of this.built.values()) g.removeFromParent();
    this.built.clear();
    for (const c of [...this.group.children]) c.removeFromParent();
  }

  dispose(): void {
    this.clearPools();
    for (const m of this.mats.values()) { m.tile.dispose(); m.coping.dispose(); m.water.dispose(); m.metal.dispose(); }
    this.mats.clear();
  }
}
