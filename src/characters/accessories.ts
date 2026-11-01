// Accessories. Head items (glasses, sunglasses, earrings, hats, headband) are skinned rigidly to the Head bone and moved
// by the face sculpt morphs that affect their anchors (nose bridge, face width, ear size). Neck and wrist items (scarf,
// necklaces, watch, bracelet) follow the torso or forearm: skinned from the nearest body bones and moved by the body
// morphs like clothing. Every vertex carries a grey `color` (frame, lens, ribbon...) that multiplies the item's colour.
// Hats are built around the parametric head and carried onto a Meshy head by the head map, like hair. Pure module.

import type { AccessoryDef } from '../content/types';
import { BODY_PARAM_IDS, bodyDeltas } from './bodyShape';
import { planeDir, profilePoint, sampleProfile, tubePoint } from './fit';
import { EAR, H_MAX, HEAD_SCALE, headBasePoint, headDeltas, headToBind } from './headShape';
import type { MeshData, SweepVertex } from './meshData';
import { addVertex, computeSmoothNormals, emptyMesh, stitchRings, sweep, v3 } from './meshData';
import type { Skin, Vec3 } from './rig';
import { boneIndex, clamp, lerp, rigidSkin, smoothstep } from './rig';
import { heightAtHalfWidth } from './clothing';
import type { BodyTemplate } from './template';

export const ACC_ATTRS = { aAcc: 1, color: 3 };
export const ACC_MORPHS: readonly string[] = ['noseBridge', 'faceWidth', 'earSize'];
/** Morph targets an accessory mesh may carry (head sculpt ones for head items, body ones for neck and wrist items). */
export const ACC_ALL_MORPHS: readonly string[] = [...ACC_MORPHS, ...BODY_PARAM_IDS];

type B = Record<string, number | string | boolean>;
const num = (b: B, k: string, d: number) => (typeof b[k] === 'number' ? (b[k] as number) : d);

/** Builds an accessory mesh (bind space) for a body frame. */
export function buildAccessory(t: BodyTemplate, def: AccessoryDef): MeshData {
  const m = emptyMesh(ACC_ATTRS, ACC_ALL_MORPHS);
  const skin = rigidSkin(boneIndex(t.raw, 'Head'));
  const O = t.headOrigin;
  const b = def.build;
  const put = (morph: Record<string, Vec3>, grey = 1) => (v: SweepVertex) => addVertex(m, headToBind(O, v.p), skin, { aAcc: [0], color: [grey, grey, grey] }, morph, v.n);
  if (def.kind === 'glasses') {
    const size = num(b, 'size', 1);
    const rim = num(b, 'rim', 0.0025);
    const square = b.lens === 'square';
    const z = 0.1055;
    const bridgeM: Record<string, Vec3> = { noseBridge: [0, 0, 0.005 * HEAD_SCALE] };
    for (const side of [1, -1]) {
      const cx = side * 0.0335, cy = 0.0985;
      const path: Vec3[] = [];
      const K = 28;
      for (let k = 0; k <= K; k++) {
        const a = (k / K) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const rx = (square ? 0.0185 : 0.0158) * size, ry = (square ? 0.0128 : 0.0152) * size;
        const e = square ? 0.35 : 1;
        const px = Math.sign(c) * Math.pow(Math.abs(c), e) * rx, py = Math.sign(s) * Math.pow(Math.abs(s), e) * ry;
        path.push([cx + px, cy + py, z - 0.004 * (px * side / rx) ** 2]);
      }
      sweep(m, { path, rx: path.map(() => rim), ry: path.map(() => rim * (square ? 1.3 : 1)), segments: 6, closeStart: false, closeEnd: false, up: [0, 0, 1] }, put(bridgeM));
      if (b.tint === true) {
        // dark lens filling the rim
        const rx = (square ? 0.0185 : 0.0158) * size, ry = (square ? 0.0128 : 0.0152) * size;
        sweep(m, { path: [[cx, cy, z - 0.0012], [cx, cy, z + 0.0004]], rx: [rx, rx], ry: [ry, ry], segments: 20, exponent: square ? 3.2 : 2, up: [0, 1, 0], capStart: 1, capEnd: 1 }, put(bridgeM, 0.07));
      }
      // temple arm back to the ear
      const outer: Vec3 = [side * (0.0335 + 0.018 * size), cy + 0.004, z - 0.006];
      const temple: Vec3[] = [outer, [side * 0.074, cy + 0.006, 0.075], [side * 0.083, cy + 0.003, 0.03], [side * 0.082, cy - 0.004, -0.002], [side * 0.078, cy - 0.018, -0.012]];
      sweep(m, { path: temple, rx: temple.map(() => rim * 0.9), ry: temple.map(() => rim * 1.4), segments: 5, up: [0, 1, 0] }, put({ faceWidth: [side * 0.004 * HEAD_SCALE, 0, 0], noseBridge: [0, 0, 0.002 * HEAD_SCALE] }));
    }
    const bridge: Vec3[] = [[0.017, 0.1, z], [0.008, 0.104, z + 0.002], [0, 0.105, z + 0.0025], [-0.008, 0.104, z + 0.002], [-0.017, 0.1, z]];
    sweep(m, { path: bridge, rx: bridge.map(() => rim), ry: bridge.map(() => rim), segments: 5, up: [0, 1, 0] }, put(bridgeM));
  } else if (def.kind === 'earrings') {
    const style = b.style === 'hoop' ? 'hoop' : 'stud';
    const size = num(b, 'size', 0.004);
    for (const side of [1, -1]) {
      const lobe: Vec3 = [side * (EAR.x + 0.006), EAR.y - EAR.ry * 0.86, EAR.z + 0.006];
      const grow: Vec3 = [side * 0.002 * HEAD_SCALE, -EAR.ry * 0.86 * 0.24 * HEAD_SCALE, 0];
      if (style === 'stud') {
        const path: Vec3[] = [[lobe[0] - side * 0.002, lobe[1], lobe[2]], [lobe[0] + side * 0.002, lobe[1], lobe[2]]];
        sweep(m, { path, rx: [size, size], segments: 8, up: [0, 1, 0], capStart: 2, capEnd: 2 }, put({ earSize: grow }));
      } else {
        const path: Vec3[] = [];
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          path.push([lobe[0], lobe[1] - size + Math.cos(a) * size, lobe[2] + Math.sin(a) * size]);
        }
        sweep(m, { path, rx: path.map(() => 0.0014), segments: 6, closeStart: false, closeEnd: false, up: [1, 0, 0] }, put({ earSize: grow }));
      }
    }
  } else if (def.kind === 'hat') {
    buildHat(m, t, def);
  } else if (def.kind === 'scarf') {
    buildScarf(m, t, def);
  } else if (def.kind === 'necklace') {
    buildNecklace(m, t, def);
  } else if (def.kind === 'watch' || def.kind === 'bracelet') {
    buildWristItem(m, t, def);
  }
  // head items are built on the parametric head and carried onto a Meshy head; body items are already in bind space
  if (def.kind === 'glasses' || def.kind === 'earrings' || def.kind === 'hat') t.headMap?.apply(m);
  computeSmoothNormals(m, 1e-7);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Skull point of the base head at (theta, h) pushed `off` outward from a centre inside the head (head-local metres). */
function skullPoint(theta: number, h: number, off: number): Vec3 {
  const p = headBasePoint(theta, h);
  const n = v3.norm([p[0], p[1] - 0.09, p[2]]);
  return [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off];
}

/** Face-width morph (head units) at a base skull point: hats widen with the face sculpt. */
function widthMorph(theta: number, h: number): Vec3 {
  const p = headBasePoint(theta, h);
  const d = headDeltas(p, theta).faceWidth;
  return [d[0] * HEAD_SCALE, d[1] * HEAD_SCALE, d[2] * HEAD_SCALE];
}

/** Pushes a sphere into the mesh (lat-long); `put` receives each vertex in the caller's space. */
function sphere(m: MeshData, c: Vec3, rx: number, ry: number, rz: number, emit: (p: Vec3, n: Vec3) => number, seg = 12): void {
  const rings: number[] = [];
  const rows = Math.max(4, Math.round(seg * 0.6));
  for (let i = 0; i <= rows; i++) {
    const v = (i / rows) * Math.PI;
    for (let k = 0; k < seg; k++) {
      const u = (k / seg) * Math.PI * 2;
      const n: Vec3 = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
      const id = emit([c[0] + n[0] * rx, c[1] + n[1] * ry, c[2] + n[2] * rz], n);
      if (k === 0) rings.push(id);
    }
  }
  stitchRings(m, rings, seg, true, true);
}

// ---------------------------------------------------------------------------------------------
// Hats: beanie, baseball cap, sun hat and a headband, built around the parametric head (head-local metres)
// ---------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;

function buildHat(m: MeshData, t: BodyTemplate, def: AccessoryDef): void {
  const b = def.build;
  const style = typeof b.style === 'string' ? b.style : 'beanie';
  const skin = rigidSkin(boneIndex(t.raw, 'Head'));
  const O = t.headOrigin;
  const COLS = 56;
  const thetas = Array.from({ length: COLS }, (_, i) => -Math.PI + (TAU * i) / COLS);
  /** Emits one ring of base-head points (theta -> [h, off, grey]) and returns its first vertex. */
  const ring = (f: (th: number) => [number, number, number]): number => {
    let first = -1;
    thetas.forEach((th) => {
      const [h, off, grey] = f(th);
      const id = addVertex(m, headToBind(O, skullPoint(th, h, off)), skin, { aAcc: [0], color: [grey, grey, grey] }, { faceWidth: widthMorph(th, h) });
      if (first < 0) first = id;
    });
    return first;
  };
  const frontness = (th: number) => Math.max(0, Math.cos(th));
  const crownFan = (starts: number[], flip: boolean) => {
    // close the top with a single vertex on the crown
    const topP = headToBind(O, skullPoint(0, H_MAX, num(b, 'topOff', 0.012)));
    const c = addVertex(m, topP, skin, { aAcc: [0], color: [1, 1, 1] }, {});
    const last = starts[starts.length - 1] as number;
    for (let k = 0; k < COLS; k++) {
      const x = last + k, y = last + ((k + 1) % COLS);
      if (flip) m.indices.push(c, y, x); else m.indices.push(c, x, y);
    }
    return topP;
  };

  if (style === 'beanie') {
    const hb = (th: number) => lerp(0.108, 0.124, smoothstep(-0.1, 0.9, Math.cos(th)));
    const rows: Array<(th: number) => [number, number, number]> = [];
    rows.push((th) => [hb(th) - 0.004, 0.0045, 0.8]);
    rows.push((th) => [hb(th), 0.0125, 0.9]);
    rows.push((th) => [hb(th) + 0.004, 0.0185, 0.9]);
    rows.push((th) => [hb(th) + 0.024, 0.0195, 0.88]);
    rows.push((th) => [hb(th) + 0.03, 0.0145, 1]);
    const N = 11;
    for (let k = 1; k <= N; k++) {
      const u = k / N;
      rows.push((th) => {
        const h0 = hb(th) + 0.03;
        const h = h0 + (H_MAX - h0) * u;
        return [h, 0.0125 + 0.0045 * Math.sin(Math.PI * Math.min(1, u * 1.25)) - 0.002 * u, 1];
      });
    }
    const starts = rows.map((f) => ring(f));
    stitchRings(m, starts, COLS, false, true);
    crownFan(starts, false);
    if (b.pom === true) sphere(m, headToBind(O, skullPoint(0, H_MAX, 0.03)), 0.017 * HEAD_SCALE, 0.017 * HEAD_SCALE, 0.017 * HEAD_SCALE, (p, n) => addVertex(m, p, skin, { aAcc: [0], color: [1, 1, 1] }, {}, n), 14);
  } else if (style === 'cap') {
    const hb = (th: number) => lerp(0.096, 0.128, smoothstep(-0.2, 0.9, Math.cos(th)));
    const rows: Array<(th: number) => [number, number, number]> = [];
    rows.push((th) => [hb(th) - 0.005, 0.005, 0.7]);
    rows.push((th) => [hb(th), 0.0125, 0.8]);
    rows.push((th) => [hb(th) + 0.006, 0.0135, 1]);
    const N = 10;
    for (let k = 1; k <= N; k++) {
      const u = k / N;
      rows.push((th) => {
        const h0 = hb(th) + 0.006;
        const h = h0 + (H_MAX - h0) * u;
        // the front panel stands up a little (structured crown)
        return [h, 0.0125 + 0.004 * Math.sin(Math.PI * Math.min(1, u * 1.3)) + 0.004 * frontness(th) * Math.sin(Math.PI * u), 1];
      });
    }
    const starts = rows.map((f) => ring(f));
    stitchRings(m, starts, COLS, false, true);
    const topP = crownFan(starts, false);
    sphere(m, [topP[0], topP[1] + 0.003, topP[2]], 0.006 * HEAD_SCALE, 0.005 * HEAD_SCALE, 0.006 * HEAD_SCALE, (p, n) => addVertex(m, p, skin, { aAcc: [0], color: [1, 1, 1] }, {}, n), 8);
    // visor: a curved sheet from the front of the band, drooping to the tip
    const L = num(b, 'brim', 0.085);
    const cols = 17, rowsN = 6;
    const vStarts: number[] = [];
    for (let r = 0; r <= rowsN; r++) {
      const d = (r / rowsN) * L;
      for (let c = 0; c < cols; c++) {
        const phi = lerp(-1.05, 1.05, c / (cols - 1));
        const base = skullPoint(phi, hb(phi) + 0.002, 0.0125);
        const dir: Vec3 = v3.norm([Math.sin(phi), 0, Math.cos(phi)]);
        const reach = d * (1 - 0.3 * (phi / 1.05) ** 2);
        const droop = 0.006 * (d / L) ** 1.6;
        const p: Vec3 = [base[0] + dir[0] * reach, base[1] - droop + 0.004 * Math.sin(Math.PI * d / L), base[2] + dir[2] * reach];
        const id = addVertex(m, headToBind(O, p), skin, { aAcc: [0], color: [r === rowsN ? 0.92 : 1, r === rowsN ? 0.92 : 1, r === rowsN ? 0.92 : 1] }, { faceWidth: widthMorph(phi, hb(phi)) });
        if (c === 0) vStarts.push(id);
      }
    }
    stitchRings(m, vStarts, cols, false, false);
  } else if (style === 'sunhat') {
    const hb = 0.118;
    const rows: Array<(th: number) => [number, number, number]> = [];
    rows.push(() => [hb - 0.006, 0.012, 0.6]);
    rows.push(() => [hb, 0.0165, 0.55]);
    rows.push(() => [hb + 0.026, 0.0185, 0.55]); // ribbon band
    rows.push(() => [hb + 0.03, 0.0205, 1]);
    const N = 9;
    for (let k = 1; k <= N; k++) {
      const u = k / N;
      rows.push(() => {
        const h0 = hb + 0.03;
        const h = h0 + (H_MAX - 0.012 - h0) * u;
        return [h, 0.0205 + 0.003 * Math.sin(Math.PI * Math.min(1, u * 1.1)), 1];
      });
    }
    const starts = rows.map((f) => ring(f));
    stitchRings(m, starts, COLS, false, true);
    crownFan(starts, false);
    // wide drooping brim with a wavy, slightly turned-up edge
    const L = num(b, 'brim', 0.115);
    const rowsN = 7;
    const bStarts: number[] = [];
    for (let r = 0; r <= rowsN; r++) {
      const d = (r / rowsN) * L;
      const f = d / L;
      let first = -1;
      thetas.forEach((th) => {
        const base = skullPoint(th, hb - 0.002, 0.0165);
        const dir: Vec3 = v3.norm([Math.sin(th), 0, Math.cos(th)]);
        const wave = 0.007 * Math.sin(th * 3 + 0.6) * f * f;
        const p: Vec3 = [base[0] + dir[0] * d, base[1] - 0.012 * f ** 1.5 + 0.007 * f ** 6 + wave, base[2] + dir[2] * d];
        const id = addVertex(m, headToBind(O, p), skin, { aAcc: [0], color: [r === rowsN ? 0.88 : 1, r === rowsN ? 0.88 : 1, r === rowsN ? 0.88 : 1] }, { faceWidth: widthMorph(th, hb) });
        if (first < 0) first = id;
      });
      bStarts.push(first);
    }
    stitchRings(m, bStarts, COLS, false, true);
  } else {
    // headband: a flat elastic band across the forehead and around the back of the head, over the hair
    const w = num(b, 'width', 0.012);
    const off = num(b, 'off', 0.019);
    const path: Vec3[] = [];
    const K = 48;
    for (let k = 0; k <= K; k++) {
      const th = -Math.PI + (TAU * k) / K;
      const h = lerp(0.1, 0.133, smoothstep(-0.3, 0.9, Math.cos(th)));
      path.push(skullPoint(th, h, off));
    }
    sweep(m, { path, rx: path.map(() => 0.0032), ry: path.map(() => w), segments: 8, exponent: 3, up: [0, 1, 0], closeStart: false, closeEnd: false }, (v) =>
      addVertex(m, headToBind(O, v.p), skin, { aAcc: [0], color: [1, 1, 1] }, { faceWidth: widthMorph(Math.atan2(v.p[0], v.p[2]), clamp(v.p[1], 0.06, 0.14)) }, v.n));
  }
}

// ---------------------------------------------------------------------------------------------
// Neck: scarf and necklaces. Wrist: watch and bracelet.
// ---------------------------------------------------------------------------------------------

const NECK_BONES = /^(spine_0[1-3]|neck_01|clavicle_[lr])$/;

function bodyMorphs(t: BodyTemplate, p: Vec3, skin: Skin): Record<string, Vec3> {
  return bodyDeltas(t.ctx, p, skin) as unknown as Record<string, Vec3>;
}

/** Circle of the torso at height y offset outward by `off` (angle 0 = front, growing toward +x). */
function torsoRingPoint(t: BodyTemplate, y: number, a: number, off: number, cap = Infinity): Vec3 {
  const q = sampleProfile(t.profiles.torso, y, a);
  const [da, db] = planeDir('y', a);
  // the torso profile is broad where the shoulders slope into the neck: `cap` keeps a scarf or chain round, close to the neck
  const r = Math.min(q.r, cap);
  return [q.ca + (r + off) * da, y, q.cb + (r + off) * db];
}

function buildScarf(m: MeshData, t: BodyTemplate, def: AccessoryDef): void {
  const b = def.build;
  const filter = t.transfer.boneFilter((n) => NECK_BONES.test(n));
  // where the shoulder slope has narrowed to the neck (below the jaw at the front; the ring follows the scanned neck and trapezius)
  const yRing = heightAtHalfWidth(t, 0.105) - 0.012;
  const turns = num(b, 'turns', 2);
  const put = (grey: number) => (v: SweepVertex) => {
    const skin = t.transfer.skinAt(v.p, filter, 0.03);
    return addVertex(m, v.p, skin, { aAcc: [0], color: [grey, grey, grey] }, bodyMorphs(t, v.p, skin), v.n);
  };
  // loops around the neck: a fat tube, stacked slightly offset so it reads as wound cloth
  for (let k = 0; k < turns; k++) {
    const path: Vec3[] = [];
    const K = 40;
    const y0 = yRing + 0.006 - k * 0.03;
    for (let i = 0; i <= K; i++) {
      const a = (i / K) * TAU;
      // the knot sits in front: the loop bulges and dips there
      const knot = Math.exp(-((Math.atan2(Math.sin(a - 0.35), Math.cos(a - 0.35))) ** 2) / 0.25);
      path.push(torsoRingPoint(t, y0 - 0.006 * knot + 0.003 * Math.sin(a * 3 + k), a, 0.016 + 0.008 * knot - k * 0.002, 0.082));
    }
    sweep(m, { path, rx: path.map(() => 0.021), ry: path.map(() => 0.0155), segments: 10, up: [0, 1, 0], closeStart: false, closeEnd: false }, put(k === 0 ? 1 : 0.94));
  }
  // two tails hanging down the front from the knot (one longer), flat ribbons
  const tailLen = num(b, 'tail', 0.3);
  [[0.38, 1, 0], [0.18, 0.78, 1]].forEach(([a0, lenK, band]) => {
    const path: Vec3[] = [];
    const rx: number[] = [], ry: number[] = [];
    const K = 10;
    for (let i = 0; i <= K; i++) {
      const f = i / K;
      const y = yRing - 0.015 - f * tailLen * (lenK as number);
      const a = (a0 as number) + 0.06 * Math.sin(f * 2.4);
      path.push(torsoRingPoint(t, y, a, 0.048 + 0.006 * Math.sin(f * 3.1), 0.125));
      rx.push(0.0075 + 0.0 * f);
      ry.push(0.0265 - 0.003 * f);
    }
    sweep(m, { path, rx, ry, segments: 8, exponent: 3, up: [1, 0, 0], capStart: 1, capEnd: 1 }, put(band ? 0.9 : 0.97));
  });
}

function buildNecklace(m: MeshData, t: BodyTemplate, def: AccessoryDef): void {
  const b = def.build;
  const style = typeof b.style === 'string' ? b.style : 'pendant';
  const filter = t.transfer.boneFilter((n) => NECK_BONES.test(n));
  const put = (grey: number) => (v: SweepVertex) => {
    const skin = t.transfer.skinAt(v.p, filter, 0.03);
    return addVertex(m, v.p, skin, { aAcc: [0], color: [grey, grey, grey] }, bodyMorphs(t, v.p, skin), v.n);
  };
  const yTop = heightAtHalfWidth(t, 0.105) - 0.03;
  const drop = style === 'pearls' ? 0.05 : style === 'choker' ? 0.0 : 0.11;
  const loop: Vec3[] = [];
  const K = 44;
  for (let i = 0; i <= K; i++) {
    const a = (i / K) * TAU;
    const front = Math.max(0, Math.cos(a));
    const y = yTop - drop * Math.pow(front, 2.2);
    loop.push(torsoRingPoint(t, y, a, 0.03 + 0.016 * Math.pow(front, 2), 0.1));
  }
  if (style === 'pearls') {
    // a string of beads along the loop
    const r = num(b, 'bead', 0.0085);
    for (let i = 0; i < K; i++) {
      const c = loop[i] as Vec3;
      sphere(m, c, r, r, r, (p, n) => { const skin = t.transfer.skinAt(p, filter, 0.03); return addVertex(m, p, skin, { aAcc: [0], color: [1, 1, 1] }, bodyMorphs(t, p, skin), n); }, 8);
    }
  } else {
    const rr = style === 'choker' ? 0.0042 : 0.0024;
    sweep(m, { path: loop, rx: loop.map(() => rr), ry: loop.map(() => style === 'choker' ? 0.0075 : rr), segments: 6, up: [0, 1, 0], closeStart: false, closeEnd: false }, put(1));
  }
  if (style === 'pendant') {
    // a teardrop pendant at the lowest point
    const c = loop[0] as Vec3;
    const n = v3.norm([0, 0, 1]);
    const path: Vec3[] = [[c[0], c[1] - 0.004, c[2] + 0.003], [c[0], c[1] - 0.034, c[2] + 0.005]];
    sweep(m, { path, rx: [0.0095, 0.0016], ry: [0.0038, 0.0014], segments: 10, up: [0, 0, 1], capStart: 2, capEnd: 2, exponent: 2 }, put(1));
    void n;
  }
}

/** Watch (left wrist) or bracelet (right wrist): a band around the forearm just above the hand. */
function buildWristItem(m: MeshData, t: BodyTemplate, def: AccessoryDef): void {
  const b = def.build;
  const left = def.kind === 'watch';
  const side = left ? 1 : -1;
  const filter = t.transfer.boneFilter((n) => (left ? /^(lowerarm_l|hand_l)$/ : /^(lowerarm_r|hand_r)$/).test(n));
  const x0 = t.lm.wristX - num(b, 'back', 0.055);
  const width = num(b, 'width', left ? 0.0115 : 0.007);
  const thick = num(b, 'thick', left ? 0.0028 : 0.0025);
  const put = (grey: number) => (v: SweepVertex) => {
    const skin = t.transfer.skinAt(v.p, filter, 0.02);
    return addVertex(m, v.p, skin, { aAcc: [0], color: [grey, grey, grey] }, bodyMorphs(t, v.p, skin), v.n);
  };
  const count = Math.max(1, Math.round(num(b, 'count', 1)));
  /** Closed loop around the forearm at |x| = xs, `off` outside the skin surface. */
  const ringAt = (xs: number, off: number): Vec3[] => {
    const path: Vec3[] = [];
    const K = 26;
    for (let i = 0; i <= K; i++) {
      const a = (i / K) * TAU;
      const q = sampleProfile(t.profiles.arm, xs, a);
      path.push(tubePoint('x', xs, q.ca, q.cb, a, q.r + off, side));
    }
    return path;
  };
  for (let k = 0; k < count; k++) {
    const xs = x0 - k * (width * 2.4 + 0.002);
    const path = ringAt(xs, thick + 0.002);
    sweep(m, { path, rx: path.map(() => thick), ry: path.map(() => width), segments: 6, exponent: 3, up: [side, 0, 0], closeStart: false, closeEnd: false }, put(0.95));
  }
  if (left) {
    // watch case on the back of the wrist (the arm profile angle 0 faces up in the bind pose) with a dial
    const c = profilePoint(t.profiles.arm, x0, 0, side, 1);
    const R = num(b, 'face', 0.0165);
    const lift = thick + 0.0045;
    sweep(m, { path: [[c[0], c[1] + lift - 0.003, c[2]], [c[0], c[1] + lift + 0.003, c[2]]], rx: [R, R], ry: [R * 0.92, R * 0.92], segments: 20, up: [0, 0, 1], capStart: 1, capEnd: 1, exponent: 2.6 }, put(1));
    sweep(m, { path: [[c[0], c[1] + lift + 0.0028, c[2]], [c[0], c[1] + lift + 0.0036, c[2]]], rx: [R * 0.8, R * 0.8], ry: [R * 0.75, R * 0.75], segments: 20, up: [0, 0, 1], capStart: 0, capEnd: 0 }, put(0.2));
  } else if (b.charm === true) {
    const c = profilePoint(t.profiles.arm, x0, Math.PI * 0.5, side, 1);
    sphere(m, [c[0], c[1], c[2] + thick + 0.004], 0.0042, 0.0042, 0.0042, (p, n) => { const skin = t.transfer.skinAt(p, filter, 0.02); return addVertex(m, p, skin, { aAcc: [0], color: [1, 1, 1] }, bodyMorphs(t, p, skin), n); }, 8);
  }
}
