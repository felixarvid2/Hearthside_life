// Task S: measure the screen rectangle of each furniture GLB.
// Reads public/assets/furniture/<asset>.glb directly (JSON + BIN chunks), walks the node
// hierarchy, and prints per-material primitive bounds in model space plus the vertices that
// form the front-most flat face. Also prints fitted (def local) coordinates using the same
// fit() maths as src/content/objects.ts.
//
// Usage: node dev/ds-tasks/m115/measure-screens.mjs [asset ...]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MANIFEST = JSON.parse(readFileSync(join(root, 'public/assets/manifest.json'), 'utf8'));

// Def-fitting parameters copied from src/content/objects.ts (fit(asset, footprint, scale, opts)).
const FITS = {
  tvFlat: { asset: 'televisionModern', scale: 1.4, yaw: 0, fp: { w: 1, d: 1 } },
  tvVintage: { asset: 'televisionVintage', scale: 2, yaw: 0, fp: { w: 1, d: 1 } },
  computer: { asset: 'computerScreen', scale: 2, yaw: 0, fp: { w: 1, d: 1 } },
  laptop: { asset: 'laptop', scale: 1.5, yaw: 0, fp: { w: 1, d: 1 } },
};

function readGlb(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}

const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessorData(json, bin, index) {
  const a = json.accessors[index];
  const bv = json.bufferViews[a.bufferView];
  const comps = COMP[a.type];
  // 5121 u8, 5123 u16, 5125 u32, 5126 f32
  const ctype = a.componentType ?? 5126;
  const csize = ctype === 5121 ? 1 : ctype === 5123 ? 2 : ctype === 5125 ? 4 : 4;
  const read = ctype === 5121 ? (o) => bin.readUInt8(o) : ctype === 5123 ? (o) => bin.readUInt16LE(o) : ctype === 5125 ? (o) => bin.readUInt32LE(o) : (o) => bin.readFloatLE(o);
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = bv.byteStride ?? comps * csize;
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const o = base + i * stride;
    const v = [];
    for (let c = 0; c < comps; c++) v.push(read(o + c * csize));
    out.push(v);
  }
  return out;
}

function mul(a, b) { // column-major 4x4
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qx * qw, wy = qy * qw, wz = qz * qw;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function collect(glb) {
  const { json, bin } = glb;
  const out = []; // { material, node, prim, points: [[x,y,z]...], tris, faces: [[a,b,c]...] }
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const walk = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const m = mul(parent, trs(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const matName = prim.material !== undefined ? json.materials[prim.material].name : '(none)';
        const pos = accessorData(json, bin, prim.attributes.POSITION).map((p) => apply(m, p));
        let faces;
        if (prim.indices !== undefined) {
          const idx = accessorData(json, bin, prim.indices).map((v) => v[0]);
          faces = [];
          for (let i = 0; i + 2 < idx.length; i += 3) faces.push([idx[i], idx[i + 1], idx[i + 2]]);
        } else {
          faces = [];
          for (let i = 0; i + 2 < pos.length; i += 3) faces.push([i, i + 1, i + 2]);
        }
        out.push({ material: matName, node: node.name ?? `#${nodeIndex}`, points: pos, tris: faces.length, faces });
      }
    }
    for (const c of node.children ?? []) walk(c, m);
  };
  for (const n of json.scenes[json.scene ?? 0].nodes ?? []) walk(n, ident);
  return out;
}

function triangleInfo(parts) {
  const out = [];
  for (const part of parts) {
    for (const [ia, ib, ic] of part.faces) {
      const a = part.points[ia], b = part.points[ib], c = part.points[ic];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(...n);
      if (len < 1e-12) continue;
      const area = len / 2;
      const nn = n.map((x) => x / len);
      out.push({ material: part.material, area, normal: nn, points: [a, b, c] });
    }
  }
  return out;
}

function bounds(points) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
  return { mn, mx };
}
const r4 = (v) => Math.round(v * 10000) / 10000;

function fit(asset, scale, yaw, fp) {
  const b = MANIFEST.furniture[asset];
  const mn = b.min, mx = b.max;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const x of [mn[0], mx[0]]) for (const z of [mn[2], mx[2]]) {
    const rx = (x * c + z * s) * scale, rz = (-x * s + z * c) * scale;
    x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz);
  }
  const ox = fp.w / 2 - (x0 + x1) / 2;
  const depth = z1 - z0;
  const oz = fp.d / 2 - (z0 + z1) / 2;
  const oy = 0 - mn[1] * scale;
  return { ox, oy, oz };
}

function localRect(points, fitInfo, scale) {
  // A screen rectangle is expected to be a thin, flat face. Group points by rounded depth
  // and print the front-most group's x/y extent.
  const groups = new Map();
  for (const p of points) {
    const k = Math.round(p[2] * 2000) / 2000;
    const g = groups.get(k) ?? [];
    g.push(p);
    groups.set(k, g);
  }
  const keys = [...groups.keys()].sort((a, b) => b - a);
  const front = keys[0];
  const pts = groups.get(front);
  const b = bounds(pts);
  const local = (p) => [r4(p[0] * scale + fitInfo.ox), r4(p[1] * scale + fitInfo.oy), r4(p[2] * scale + fitInfo.oz)];
  return { front, count: pts.length, model: b, localMin: local(b.mn), localMax: local(b.mx) };
}

const assets = process.argv.slice(2);
const wanted = assets.length ? assets : [...new Set(Object.values(FITS).map((f) => f.asset))];
const glbs = new Map();
for (const asset of wanted) {
  const entry = MANIFEST.furniture[asset];
  if (!entry) { console.log(`${asset}: not in manifest`); continue; }
  const glb = readGlb(join(root, 'public/assets', entry.file));
  glbs.set(asset, glb);
  const parts = collect(glb);
  console.log(`\n=== ${asset} (${entry.file}) ===`);
  console.log(`manifest min ${JSON.stringify(entry.min)} max ${JSON.stringify(entry.max)}`);
  for (const part of parts) {
    const b = bounds(part.points);
    console.log(`  mat ${part.material.padEnd(12)} node ${String(part.node).padEnd(16)} tris ${String(part.tris).padStart(4)}  min ${b.mn.map(r4).join(',')}  max ${b.mx.map(r4).join(',')}`);
  }
  // candidate screen: the front-most material with a wide, short extent that is thin in z
  const byMat = new Map();
  for (const p of parts) {
    const list = byMat.get(p.material) ?? [];
    list.push(...p.points);
    byMat.set(p.material, list);
  }
  for (const [mat, pts] of byMat) {
    const b = bounds(pts);
    const thin = b.mx[2] - b.mn[2] < 0.02;
    if (thin) console.log(`  flat material ${mat}: front z ${r4(b.mx[2])}, x ${r4(b.mn[0])}..${r4(b.mx[0])}, y ${r4(b.mn[1])}..${r4(b.mx[1])}`);
  }
  const tris = triangleInfo(parts).sort((a, b) => b.area - a.area);
  console.log('  largest front-facing triangles (nz > 0.5, or ny > 0.5 for tilted screens):');
  let shown = 0;
  for (const t of tris) {
    if (t.normal[2] < 0.5 && t.normal[1] < 0.5) continue;
    const b = bounds(t.points);
    console.log(`    mat ${t.material.padEnd(12)} area ${t.area.toFixed(5)} n ${t.normal.map((x) => x.toFixed(2)).join(',')}  x ${r4(b.mn[0])}..${r4(b.mx[0])} y ${r4(b.mn[1])}..${r4(b.mx[1])} z ${r4(b.mn[2])}..${r4(b.mx[2])}`);
    if (++shown >= 14) break;
  }
}

for (const [name, f] of Object.entries(FITS)) {
  if (!glbs.has(f.asset)) continue;
  const parts = collect(glbs.get(f.asset));
  const info = fit(f.asset, f.scale, f.yaw, f.fp);
  console.log(`\n--- def ${name} (${f.asset}, scale ${f.scale}, offset ${r4(info.ox)},${r4(info.oy)},${r4(info.oz)}) ---`);
  for (const part of parts) {
    for (const p of part.points) {
      // collect the front-most candidates: flat faces grouped by depth below
    }
    const b = bounds(part.points);
    console.log(`  mat ${part.material}: model min ${b.mn.map(r4)} max ${b.mx.map(r4)}; local min ${b.mn.map((v, i) => r4(v * f.scale + [info.ox, info.oy, info.oz][i]))} max ${b.mx.map((v, i) => r4(v * f.scale + [info.ox, info.oy, info.oz][i]))}`);
  }
  // print candidate front face groups across all points
  const all = parts.flatMap((p) => p.points);
  const rect = localRect(all, info, f.scale);
  console.log(`  front z slab ${rect.front}: ${rect.count} pts; model x ${r4(rect.model.mn[0])}..${r4(rect.model.mx[0])} y ${r4(rect.model.mn[1])}..${r4(rect.model.mx[1])} z ${r4(rect.model.mn[2])}..${r4(rect.model.mx[2])}`);
  console.log(`  local min ${JSON.stringify(rect.localMin)} max ${JSON.stringify(rect.localMax)}`);
}
