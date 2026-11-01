// Small geometry builder for merged, non-indexed-free quads (positions, normals, uvs, optional colours).
// Quads are given as four corners in order around the face; the winding is fixed automatically so the front
// face points along the given normal.

import * as THREE from 'three';

export type V3 = readonly [number, number, number];
export type UV = readonly [number, number];

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] | null = null;
  private idx: number[] = [];

  get empty(): boolean { return this.idx.length === 0; }

  quad(p0: V3, p1: V3, p2: V3, p3: V3, n: V3, uvs: readonly [UV, UV, UV, UV] = [[0, 0], [1, 0], [1, 1], [0, 1]], color?: THREE.Color): void {
    // winding check: (p1 - p0) x (p2 - p0) should point along n
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const base = this.pos.length / 3;
    for (const [p, t] of [[p0, uvs[0]], [p1, uvs[1]], [p2, uvs[2]], [p3, uvs[3]]] as const) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(t[0], t[1]);
      if (color) { (this.col ??= []).push(color.r, color.g, color.b); }
    }
    if (flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box faces (skips the faces listed in `skip`: 'px','nx','py','ny','pz','nz'). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skip: ReadonlySet<string> = NONE, color?: THREE.Color): void {
    if (!skip.has('py')) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], undefined, color);
    if (!skip.has('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], undefined, color);
    if (!skip.has('px')) this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], undefined, color);
    if (!skip.has('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], undefined, color);
    if (!skip.has('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], undefined, color);
    if (!skip.has('nz')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], undefined, color);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const NONE: ReadonlySet<string> = new Set();

/** Disposes geometries (not materials) of a subtree. */
export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.ownGeometry) m.geometry.dispose(); });
}

/** Seeded hash -> [0, 1). */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
