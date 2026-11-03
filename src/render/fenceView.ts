// Fences and gates (Lot.fences) as one vertex-coloured mesh per level (opaque parts) plus one translucent mesh for glass. Every edge
// is built from the rods of world/fencePieces.ts in the edge frame, moved onto its edge in world space: along +x for 'h' edges and
// along +z for 'v' edges, with the fence's own level at y = level * LEVEL_HEIGHT. Pure view: nothing here changes the state.

import * as THREE from 'three';
import { exteriorOf, fenceVariant } from '../content/exterior';
import type { ContentDB } from '../content/types';
import type { Fence, Lot } from '../core/types';
import { fenceContinues, fencesOnLevel } from '../world/fences';
import { fencePieces, rodColor, type Rod } from '../world/fencePieces';
import { LEVEL_HEIGHT } from '../world/levels';

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Accumulates square-section rods into positions, normals and colours. */
export class RodGeometry {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];

  rod(p0: V3, p1: V3, w: number, t: number, color: THREE.Color): void {
    const a = norm(sub(p1, p0));
    if (!Number.isFinite(a[0]) || Math.hypot(...sub(p1, p0)) < 1e-6) return;
    const ref: V3 = Math.abs(a[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(a, ref)), v = norm(cross(a, u));
    const corner = (p: V3, su: number, sv: number): V3 => [
      p[0] + u[0] * su * w / 2 + v[0] * sv * t / 2, p[1] + u[1] * su * w / 2 + v[1] * sv * t / 2, p[2] + u[2] * su * w / 2 + v[2] * sv * t / 2,
    ];
    const ring = (p: V3): V3[] => [corner(p, -1, -1), corner(p, 1, -1), corner(p, 1, 1), corner(p, -1, 1)];
    const A = ring(p0), B = ring(p1);
    // each face is wound so that its geometric normal points along the outward normal given for it
    const quad = (q0: V3, q1: V3, q2: V3, q3: V3, n: V3) => {
      const order = dot(cross(sub(q1, q0), sub(q2, q0)), n) >= 0 ? [q0, q1, q2, q0, q2, q3] : [q0, q2, q1, q0, q3, q2];
      for (const p of order) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(color.r, color.g, color.b); }
    };
    const neg = (n: V3): V3 => [-n[0], -n[1], -n[2]];
    const ns: V3[] = [neg(v), u, v, neg(u)];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(A[i]!, A[j]!, B[j]!, B[i]!, ns[i]!); }
    quad(A[0]!, A[1]!, A[2]!, A[3]!, neg(a));
    quad(B[0]!, B[1]!, B[2]!, B[3]!, a);
  }

  get empty(): boolean { return this.pos.length === 0; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Edge frame (x along the edge, z across) to world coordinates for a fence. */
export function toWorld(f: Pick<Fence, 'dir' | 'x' | 'z' | 'level'>, p: readonly [number, number, number]): V3 {
  const y = f.level * LEVEL_HEIGHT + p[1];
  return f.dir === 'h' ? [f.x + p[0], y, f.z + p[2]] : [f.x + p[2], y, f.z + p[0]];
}

export class FenceView {
  readonly group = new THREE.Group();
  private readonly solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05, name: 'fence' });
  private readonly glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false, name: 'fence-glass' });
  private readonly levelGroups = new Map<number, THREE.Group>();
  private activeLevel = 99;
  private readonly colors = new Map<string, THREE.Color>();

  constructor(private readonly content?: ContentDB) { this.group.name = 'fences'; }

  private color(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) { c = new THREE.Color(hex); this.colors.set(hex, c); }
    return c;
  }

  /** Rebuilds every fence of the lot. */
  build(lot: Lot): void {
    this.clear();
    const ex = exteriorOf(this.content);
    const byLevel = new Map<number, { solid: RodGeometry; glass: RodGeometry }>();
    for (const f of fencesOnLevel(lot)) {
      const def = ex.fences[f.defId];
      if (!def) continue;
      const variant = Math.max(0, def.variants.indexOf(fenceVariant(def, f.variant ?? 0)));
      const rods: Rod[] = fencePieces(def, { endPost: !fenceContinues(lot, f), variant });
      let e = byLevel.get(f.level);
      if (!e) { e = { solid: new RodGeometry(), glass: new RodGeometry() }; byLevel.set(f.level, e); }
      for (const r of rods) {
        const target = r.part === 'glass' ? e.glass : e.solid;
        target.rod(toWorld(f, r.a), toWorld(f, r.b), r.w, r.t, this.color(rodColor(def, variant, r.part)));
      }
    }
    for (const [level, e] of byLevel) {
      const g = new THREE.Group();
      g.name = `fences-${level}`;
      g.visible = level <= this.activeLevel;
      if (!e.solid.empty) { const m = new THREE.Mesh(e.solid.build(), this.solid); m.castShadow = true; m.receiveShadow = true; m.userData.ownGeometry = true; g.add(m); }
      if (!e.glass.empty) { const m = new THREE.Mesh(e.glass.build(), this.glass); m.renderOrder = 2; m.userData.ownGeometry = true; g.add(m); }
      this.levelGroups.set(level, g);
      this.group.add(g);
    }
  }

  /** Fences of levels above the active one are hidden. */
  setActiveLevel(level: number): void {
    this.activeLevel = level;
    for (const [l, g] of this.levelGroups) g.visible = l <= level;
  }

  /** Triangles in the scene (tests and the stats overlay). */
  triangleCount(): number {
    let n = 0;
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) n += m.geometry.getAttribute('position').count / 3; });
    return n;
  }

  private clear(): void {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.ownGeometry) m.geometry.dispose(); });
    for (const c of [...this.group.children]) c.removeFromParent();
    this.levelGroups.clear();
  }

  dispose(): void { this.clear(); this.solid.dispose(); this.glass.dispose(); }
}
