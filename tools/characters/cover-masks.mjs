// Cover masks: which body vertices a garment covers, measured at the bind pose.
//
//   node tools/characters/cover-masks.mjs <body.glb> <garment.glb> <out.cover.json> [--dist 0.06] [--body id] [--garment id]
//
// A body vertex is covered when a ray from it along its normal hits a garment triangle within `dist` metres.
// The output is a CoverMaskFile (src/characters/modular/types.ts): per Body_<region> mesh a base64 bitset over the
// mesh's vertices in GLB order. Both GLBs come from the same armature at its rest pose (prepare_body.py /
// build_garment.py), so their vertex positions share one space. The runtime hides only triangles whose three
// vertices are covered, so a garment that ends mid-region (a T-shirt hem) never leaves a hole.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const [bodyPath, garmentPath, outPath] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const dist = Number(opt('dist', '0.06'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function worldPositions(prim, node) {
  const pos = prim.getAttribute('POSITION');
  const nrm = prim.getAttribute('NORMAL');
  const m = node.getWorldMatrix();
  const n = pos.getCount();
  const P = new Float64Array(n * 3), N = new Float64Array(n * 3);
  const v = [0, 0, 0], w = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    pos.getElement(i, v);
    P[i * 3] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
    P[i * 3 + 1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
    P[i * 3 + 2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
    if (nrm) {
      nrm.getElement(i, w);
      const x = m[0] * w[0] + m[4] * w[1] + m[8] * w[2], y = m[1] * w[0] + m[5] * w[1] + m[9] * w[2], z = m[2] * w[0] + m[6] * w[1] + m[10] * w[2];
      const l = Math.hypot(x, y, z) || 1;
      N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
    }
  }
  return { P, N, n };
}

const garmentDoc = await io.read(garmentPath);
const tris = [];
for (const node of garmentDoc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    const { P } = worldPositions(prim, node);
    const idx = prim.getIndices().getArray();
    for (let i = 0; i < idx.length; i += 3) tris.push([idx[i], idx[i + 1], idx[i + 2]].map((k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]));
  }
}
// Uniform grid over the garment triangles (cell = dist), so each ray tests only nearby triangles.
const cell = Math.max(dist, 0.02);
const grid = new Map();
const key = (x, y, z) => `${x},${y},${z}`;
tris.forEach((t, ti) => {
  const lo = [0, 1, 2].map((k) => Math.floor(Math.min(t[0][k], t[1][k], t[2][k]) / cell));
  const hi = [0, 1, 2].map((k) => Math.floor(Math.max(t[0][k], t[1][k], t[2][k]) / cell));
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    const k = key(x, y, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(ti);
  }
});
function rayHits(o, d) {
  const seen = new Set();
  const steps = Math.ceil(dist / (cell * 0.5)) + 1;
  for (let s = 0; s <= steps; s++) {
    const p = [o[0] + d[0] * dist * s / steps, o[1] + d[1] * dist * s / steps, o[2] + d[2] * dist * s / steps];
    const c = p.map((v) => Math.floor(v / cell));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const ti of grid.get(key(c[0] + dx, c[1] + dy, c[2] + dz)) ?? []) {
        if (seen.has(ti)) continue; seen.add(ti);
        const t = rayTri(o, d, tris[ti]);
        if (t !== null && t >= 0 && t <= dist) return true;
      }
    }
  }
  return false;
}
function rayTri(o, d, [a, b, c]) { // Möller–Trumbore, double-sided
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) return null;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) return null;
  return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
}

const bodyDoc = await io.read(bodyPath);
const out = { v: 1, body: opt('body', path.basename(bodyPath, '.glb')), garment: opt('garment', path.basename(garmentPath, '.glb')), coverDist: dist, meshes: {}, vertexCounts: {} };
const summary = {};
for (const node of bodyDoc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh || !node.getName().startsWith('Body_')) continue;
  // One key per primitive, `<mesh name>/<primitive index>`: prepare_body.py writes one primitive per material, and
  // three's GLTFLoader turns each primitive into its own SkinnedMesh (children of a Group, in primitive order).
  mesh.listPrimitives().forEach((prim, pi) => {
    const { P, N, n } = worldPositions(prim, node);
    const bits = [];
    for (let i = 0; i < n; i++) {
      const o = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], d = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
      bits.push(rayHits([o[0] + d[0] * 0.001, o[1] + d[1] * 0.001, o[2] + d[2] * 0.001], d) ? 1 : 0);
    }
    const k = `${node.getName()}/${pi}`;
    const covered = bits.reduce((s, b) => s + b, 0);
    out.vertexCounts[k] = n;
    summary[k] = `${covered}/${n}`;
    if (!covered) return;
    const bytes = new Uint8Array(Math.ceil(n / 8));
    bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7); });
    out.meshes[k] = Buffer.from(bytes).toString('base64');
  });
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out) + '\n');
console.log(JSON.stringify({ out: outPath, triangles: tris.length, covered: summary }));
