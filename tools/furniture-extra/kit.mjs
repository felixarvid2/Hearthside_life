// Tiny low-poly modelling kit for the original furniture designs that the Kenney Furniture Kit does not have
// (dishwasher, easel, piano, treadmill, grill, ...). Boxes, rods, cylinders and lathe shapes are collected per named
// material and written as a GLB that follows the Kenney conventions the game relies on:
//   - material names are the kit's (wood, woodDark, metal, metalDark, metalLight, carpet, carpetWhite, carpetBlue, ...)
//     with the kit's colours, so finish regions recolour them exactly like the Kenney models;
//   - the model FRONT faces +z, y is up, the bottom rests on y = 0 (fit() in src/content/objects.ts does the rest);
//   - sizes are authored in real metres and written at half scale (Kenney units), so the usual fit scale is 2.
//   - Moving or switchable pieces are NAMED PARTS: `const door = m.part('anim:door', [hx, hy, hz])` returns a builder with the
//     same primitive API (box, rod, slab, lathe, cylY, cyl, poly, hexa); its geometry is written as a child node of that exact
//     name whose origin sits at the pivot (hinge point, or any point for a sliding drawer). Primitives are authored in the same
//     model coordinates as the body, so a closed part lies exactly where it would as part of the body. The game keeps every
//     node named `anim:*` as a separate pivot group (src/render/objectAssets.ts) and animates it from the design's `anim` field
//     (src/content/types.ts ObjectAnimSpec, src/render/objectAnim.ts). `anim:interior` (cavity shown while something is open)
//     and `anim:screen` (a thin box whose largest front face is the picture) are static parts. Models without parts export
//     exactly as before.
// Flat per-face normals on boxes and rods, smooth normals around lathe surfaces: the same faceted look as the kit.

import { Document, NodeIO } from '@gltf-transform/core';

/** Kenney Furniture Kit material colours (baseColorFactor numbers, which the game reads as sRGB). */
export const COLORS = {
  wood: [0.896, 0.602, 0.393], woodDark: [0.678, 0.456, 0.299],
  metal: [0.741, 0.823, 0.84], metalDark: [0.306, 0.388, 0.388], metalLight: [0.937, 0.98, 0.957], metalMedium: [0.369, 0.467, 0.467],
  carpet: [0.943, 0.367, 0.343], carpetDarker: [0.608, 0.298, 0.285], carpetWhite: [0.973, 1, 1], carpetBlue: [0.356, 0.517, 0.868],
  glass: [0.698, 0.827, 0.769], plant: [0.182, 0.821, 0.576], fur: [0.647, 0.459, 0.298],
};

/** Written at half scale: Kenney models are about half the size of a real object. */
export const EXPORT_SCALE = 0.5;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class Model {
  constructor(id) {
    this.id = id;
    /** material name -> flat triangle list: { p: [[x,y,z]*3], n: [[x,y,z]*3] } */
    this.tris = new Map();
    /** part name ('anim:door') -> Part, in creation order. */
    this.parts = new Map();
  }

  /**
   * A named sub-part (see the header). `pivot` is the node origin in model coordinates (real metres); asking for the same
   * name again returns the same builder (and the pivot must match).
   */
  part(name, pivot = [0, 0, 0]) {
    if (typeof name !== 'string' || !/^anim:[A-Za-z0-9_-]+$/.test(name)) throw new Error(`${this.id}: part name must look like 'anim:door', got ${JSON.stringify(name)}`);
    if (!Array.isArray(pivot) || pivot.length !== 3 || !pivot.every(Number.isFinite)) throw new Error(`${this.id}: part ${name} needs a [x, y, z] pivot`);
    const have = this.parts.get(name);
    if (have) {
      if (have.pivot.some((v, i) => Math.abs(v - pivot[i]) > 1e-9)) throw new Error(`${this.id}: part ${name} was already created with another pivot`);
      return have;
    }
    const made = new Part(this.id, name, pivot);
    this.parts.set(name, made);
    return made;
  }

  addTri(mat, p0, p1, p2, n0, n1, n2) {
    if (!COLORS[mat]) throw new Error(`${this.id}: unknown material ${mat}`);
    const list = this.tris.get(mat) ?? [];
    const fn = norm(cross(sub(p1, p0), sub(p2, p0)));
    if (!Number.isFinite(fn[0]) || len(cross(sub(p1, p0), sub(p2, p0))) < 1e-12) return; // degenerate
    // Orient by the supplied (smooth) normals when given, else keep the winding.
    let a = [p0, p1, p2], n = [n0, n1, n2];
    if (n0 && dot(fn, add(add(n0, n1), n2)) < 0) { a = [p0, p2, p1]; n = [n0, n2, n1]; }
    list.push({ p: a, n: n[0] ? n : [fn, fn, fn] });
    this.tris.set(mat, list);
  }

  /** Convex planar polygon with a known outward normal (fan triangulation, wound counter-clockwise seen from outside). */
  poly(mat, pts, outward) {
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[0], p1 = pts[i], p2 = pts[i + 1];
      const fn = cross(sub(p1, p0), sub(p2, p0));
      if (dot(fn, outward) >= 0) this.addTri(mat, p0, p1, p2);
      else this.addTri(mat, p0, p2, p1);
    }
  }

  /** Convex hexahedron from 8 corners ordered like a box: bottom z0 (0..3), top z1 (4..7). */
  hexa(mat, c) {
    const centre = mul(c.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / 8);
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
    for (const f of faces) {
      const pts = f.map((i) => c[i]);
      const fc = mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 0.25);
      this.poly(mat, pts, sub(fc, centre));
    }
  }

  /** Axis-aligned box from min and max corners. */
  box(mat, [x0, y0, z0], [x1, y1, z1]) {
    this.hexa(mat, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  }

  /** Square-section rod between two points (w wide, t thick across the second axis). */
  rod(mat, p0, p1, w, t = w) {
    const a = norm(sub(p1, p0));
    const ref = Math.abs(a[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(a, ref)), v = norm(cross(a, u));
    const corner = (p, su, sv) => add(add(p, mul(u, su * w / 2)), mul(v, sv * t / 2));
    const ring = (p) => [corner(p, -1, -1), corner(p, 1, -1), corner(p, 1, 1), corner(p, -1, 1)];
    this.hexa(mat, [...ring(p0), ...ring(p1)]);
  }

  /** Oriented slab: origin corner o spanned by edge vectors u, v, w (parallelepiped). */
  slab(mat, o, u, v, w) {
    const p = (a, b, c) => add(add(add(o, mul(u, a)), mul(v, b)), mul(w, c));
    this.hexa(mat, [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0), p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)]);
  }

  /**
   * Surface of revolution around the vertical axis through (cx, cz). profile: [[radius, y], ...] from bottom to top.
   * mats: one material name or several used alternately per segment (a striped awning). Ends with radius > 0 are capped.
   */
  lathe(mat, cx, cz, profile, seg = 12, { caps = true, phase = 0 } = {}) {
    const mats = Array.isArray(mat) ? mat : [mat];
    const at = (r, y, k) => [cx + r * Math.cos((k / seg) * Math.PI * 2 + phase), y, cz + r * Math.sin((k / seg) * Math.PI * 2 + phase)];
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      // outward normal of this ring segment (slope-aware), swept around
      const dr = r1 - r0, dy = y1 - y0;
      const nrm = (k) => { const c = Math.cos((k / seg) * Math.PI * 2 + phase), s = Math.sin((k / seg) * Math.PI * 2 + phase); const l = Math.hypot(dr, dy) || 1; return [dy / l * c, -dr / l, dy / l * s]; };
      for (let k = 0; k < seg; k++) {
        const m = mats[k % mats.length];
        const a = at(r0, y0, k), b = at(r0, y0, k + 1), c = at(r1, y1, k + 1), d = at(r1, y1, k);
        const na = nrm(k), nb = nrm(k + 1);
        this.addTri(m, a, b, c, na, nb, nb);
        this.addTri(m, a, c, d, na, nb, na);
      }
    }
    if (caps) {
      const first = profile[0], last = profile[profile.length - 1];
      for (const [pt, up] of [[first, false], [last, true]]) {
        if (pt[0] < 1e-6) continue;
        const centre = [cx, pt[1], cz];
        for (let k = 0; k < seg; k++) {
          const m = mats[k % mats.length];
          this.poly(m, [centre, at(pt[0], pt[1], k), at(pt[0], pt[1], k + 1)], [0, up ? 1 : -1, 0]);
        }
      }
    }
  }

  /** Straight cylinder (or cone frustum) around the vertical axis. */
  cylY(mat, cx, cz, y0, y1, r0, r1 = r0, seg = 12) {
    this.lathe(mat, cx, cz, [[r0, y0], [r1, y1]], seg);
  }

  /** Cylinder along an arbitrary axis from p0 to p1 (wheels, bars, plates). */
  cyl(mat, p0, p1, r, seg = 12) {
    const a = norm(sub(p1, p0));
    const ref = Math.abs(a[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(a, ref)), v = norm(cross(a, u));
    const ring = (p, k) => { const t = (k / seg) * Math.PI * 2; return add(p, add(mul(u, r * Math.cos(t)), mul(v, r * Math.sin(t)))); };
    const rn = (k) => { const t = (k / seg) * Math.PI * 2; return add(mul(u, Math.cos(t)), mul(v, Math.sin(t))); };
    for (let k = 0; k < seg; k++) {
      const a0 = ring(p0, k), b0 = ring(p0, k + 1), a1 = ring(p1, k), b1 = ring(p1, k + 1);
      this.addTri(mat, a0, b0, b1, rn(k), rn(k + 1), rn(k + 1));
      this.addTri(mat, a0, b1, a1, rn(k), rn(k + 1), rn(k));
      this.poly(mat, [p0, a0, b0], mul(a, -1));
      this.poly(mat, [p1, a1, b1], a);
    }
  }

  /** Triangles of the body and of every part. */
  triangleCount() {
    let n = 0;
    for (const l of this.tris.values()) n += l.length;
    for (const p of this.parts.values()) n += p.triangleCount();
    return n;
  }

  /** All triangles with material names (for the thumbnail renderer), in export scale; parts at their closed position. */
  scaledTriangles() {
    const out = [];
    for (const [mat, list] of this.tris) for (const t of list) out.push({ mat, p: t.p.map((p) => mul(p, EXPORT_SCALE)), n: t.n });
    for (const p of this.parts.values()) out.push(...p.scaledTriangles());
    return out;
  }

  /** Names of the named parts, in creation order (the manifest lists them as `animNodes`). */
  partNames() { return [...this.parts.keys()]; }

  /**
   * The picture rectangle of the `anim:screen` part in export scale (what the GLB and the manifest use): the largest face
   * that points to the front, as { centre, normal, width, height } (width along the horizontal, height along the tilt). Null
   * without that part.
   */
  screenQuad() {
    const part = this.parts.get('anim:screen');
    if (!part) return null;
    const tris = part.scaledTriangles();
    if (!tris.length) throw new Error(`${this.id}: anim:screen has no geometry`);
    const groups = new Map();
    for (const t of tris) {
      const n = t.n[0];
      const a = len(cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))) / 2;
      const key = n.map((v) => Math.round(v * 100)).join(',');
      const g = groups.get(key) ?? { n, area: 0, pts: [] };
      g.area += a;
      g.pts.push(...t.p);
      groups.set(key, g);
    }
    // largest face; the back face of a thin slab has the same area, so prefer the one that looks to +z (and up)
    const bias = norm([0, 0.2, 1]);
    const all = [...groups.values()];
    const maxArea = Math.max(...all.map((g) => g.area));
    const first = all.filter((g) => g.area > maxArea * (1 - 1e-6)).sort((a, b) => dot(b.n, bias) - dot(a.n, bias))[0];
    const n = norm(first.n);
    const u = Math.abs(n[1]) > 0.95 ? [1, 0, 0] : norm(cross([0, 1, 0], n));
    const v = cross(n, u);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, nd = 0;
    for (const p of first.pts) { u0 = Math.min(u0, dot(p, u)); u1 = Math.max(u1, dot(p, u)); v0 = Math.min(v0, dot(p, v)); v1 = Math.max(v1, dot(p, v)); nd += dot(p, n); }
    nd /= first.pts.length;
    const c = add(add(mul(u, (u0 + u1) / 2), mul(v, (v0 + v1) / 2)), mul(n, nd));
    const r = (a) => a.map((x) => +x.toFixed(4));
    return { centre: r(c), normal: r(n), width: +(u1 - u0).toFixed(4), height: +(v1 - v0).toFixed(4) };
  }

  /** Writes the model as a GLB (one mesh, one primitive per material; each named part is a child node with its own mesh). */
  toGlb(io = new NodeIO()) {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene(this.id);
    const materials = new Map();
    const meshOf = (name, tris, pivot) => {
      const mesh = doc.createMesh(name);
      for (const [mat, list] of tris) {
        const pos = new Float32Array(list.length * 9), nor = new Float32Array(list.length * 9);
        list.forEach((t, i) => {
          for (let k = 0; k < 3; k++) {
            pos.set(mul(sub(t.p[k], pivot), EXPORT_SCALE), i * 9 + k * 3);
            nor.set(t.n[k], i * 9 + k * 3);
          }
        });
        const idx = new Uint32Array(list.length * 3).map((_, i) => i);
        let material = materials.get(mat);
        if (!material) {
          material = doc.createMaterial(mat).setBaseColorFactor([...COLORS[mat], 1]).setMetallicFactor(0).setRoughnessFactor(1);
          materials.set(mat, material);
        }
        const prim = doc.createPrimitive().setMaterial(material)
          .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
          .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buffer))
          .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
        mesh.addPrimitive(prim);
      }
      return mesh;
    };
    const node = doc.createNode(this.id);
    if (this.tris.size || !this.parts.size) node.setMesh(meshOf(this.id, this.tris, [0, 0, 0]));
    scene.addChild(node);
    for (const [name, part] of this.parts) {
      if (!part.tris.size) throw new Error(`${this.id}: part ${name} has no geometry`);
      const child = doc.createNode(name).setTranslation(mul(part.pivot, EXPORT_SCALE)).setMesh(meshOf(name, part.tris, part.pivot));
      node.addChild(child);
    }
    return io.writeBinary(doc);
  }
}

/** A named sub-part of a Model: the same primitive API, geometry in model coordinates, written relative to `pivot`. */
export class Part extends Model {
  constructor(modelId, name, pivot) {
    super(`${modelId}/${name}`);
    this.name = name;
    this.pivot = pivot;
  }

  part() { throw new Error(`${this.id}: parts do not nest; create every part from the model`); }
}
