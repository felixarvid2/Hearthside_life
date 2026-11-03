// Original staircase models (Milestone 9): eight straight and four spiral designs. Authored in metres inside the footprint,
// following src/world/levels.ts: a straight stair of width w and length L rises toward -z (the foot is the front row at +z, the head
// the back row), one tread per tile at the height of the walker (LEVEL_HEIGHT * (i + 1) / (L + 1) for tread i from the foot); a spiral
// fills a 2 x 2 footprint with one quarter per walked cell, two wedge steps each, around a central pole.

import { Model, rnd } from './kit.mjs';

export const LEVEL_HEIGHT = 3.0;

/** Tread top height of tread i (0 = foot) of a stair with n walked cells. */
export const treadTop = (i, n) => (LEVEL_HEIGHT * (i + 1)) / (n + 1);

/** A vertical board along the stair: front (zA) and back (zB) sections as [z, y0, y1], thickness th across x. */
function board(m, mat, x, a, b, th) {
  const h = th / 2;
  m.hexa(mat, [[x - h, a[1], a[0]], [x + h, a[1], a[0]], [x + h, b[1], b[0]], [x - h, b[1], b[0]],
    [x - h, a[2], a[0]], [x + h, a[2], a[0]], [x + h, b[2], b[0]], [x - h, b[2], b[0]]]);
}

/**
 * A straight stair.
 * opts: tread/riser/stringer/rail materials; risers 'open' | 'closed'; thick = tread thickness; rail 'spindle' | 'glass' | 'pipe' | 'rope' | 'wall' | 'none';
 * solid = steps are solid blocks down to the ground; floating = a single central stringer carries cantilevered treads.
 */
function straight(id, w, L, o) {
  const m = new Model(id);
  const s = LEVEL_HEIGHT / (L + 1); // rise per tile
  const inset = o.inset ?? 0.0;
  const x0 = inset, x1 = w - inset;
  for (let i = 0; i < L; i++) {
    const zf = L - i, zb = L - i - 1, top = treadTop(i, L);
    const thick = o.solid ? top : o.thick ?? 0.07;
    const xa = o.floating ? 0.1 : x0 + (o.stringer ? 0.07 : 0), xb = o.floating ? w - 0.1 : x1 - (o.stringer ? 0.07 : 0);
    m.box(o.tread, [xa, top - thick, zb + 0.02], [xb, top, zf + (o.nosing ?? 0.0)]);
    if (o.risers === 'closed' && !o.solid) m.box(o.riser ?? o.tread, [xa, top - s, zf - 0.02], [xb, top - 0.0, zf + 0.0]);
    if (o.solid) m.box(o.riser ?? o.tread, [xa, 0, zb + 0.02], [xb, top - 0.0, zf]);
  }
  // stringers: sloped boards along the outside (or the central steel spine for floating stairs)
  const zFront = L - 0.1, zBack = 0.1;
  const yAt = (z) => s * 0.5 + s * (L - z); // line through the tread-top centres extended to the edges
  if (o.floating) {
    const c = w / 2;
    board(m, o.stringer ?? 'metalDark', c, [L - 0.2, 0, yAt(L - 0.2) - 0.18], [0.2, yAt(0.2) - 0.42, yAt(0.2) - 0.18], 0.12);
    for (let i = 0; i < L; i++) m.box(o.stringer ?? 'metalDark', [c - 0.06, treadTop(i, L) - 0.3, L - i - 1 + 0.35], [c + 0.06, treadTop(i, L) - 0.07, L - i - 1 + 0.65]);
  } else if (o.stringer) {
    for (const x of [x0 + 0.045, x1 - 0.045]) {
      board(m, o.stringer, x, [zFront, 0, yAt(zFront) + 0.04], [zBack, yAt(zBack) - (o.stringerDepth ?? 0.26), yAt(zBack) + 0.04], 0.07);
    }
  }
  // rails
  const railH = o.railH ?? 0.9;
  const edge = o.rail === 'wall' ? 0.1 : 0.04;
  const sides = o.rail === 'none' ? [] : o.oneSide ? [x1 - edge] : [x0 + edge, x1 - edge];
  for (const x of sides) {
    const yTop = (z) => yAt(z) + railH;
    if (o.rail === 'spindle' || o.rail === 'pipe') {
      const mat = o.railMat ?? 'wood';
      const n = L * 3;
      for (let k = 0; k <= n; k++) {
        const z = zFront - ((zFront - zBack) * k) / n;
        if (k % 3 === 0 || o.rail === 'spindle') m.rod(o.balMat ?? mat, [x, yAt(z) - 0.02, z], [x, yTop(z), z], o.rail === 'pipe' ? 0.03 : 0.035);
      }
      m.rod(o.handMat ?? mat, [x, yTop(zFront), zFront], [x, yTop(zBack), zBack], 0.06, 0.05);
      if (o.rail === 'pipe') m.rod(mat, [x, yTop(zFront) - 0.3, zFront], [x, yTop(zBack) - 0.3, zBack], 0.03);
      m.rod(o.handMat ?? mat, [x, yAt(zFront) - 0.02, zFront - 0.04], [x, yTop(zFront) + 0.08, zFront - 0.04], 0.1); // newels
      m.rod(o.handMat ?? mat, [x, yAt(zBack) - 0.02, zBack + 0.04], [x, yTop(zBack) + 0.08, zBack + 0.04], 0.1);
    } else if (o.rail === 'glass') {
      board(m, 'glass', x, [zFront - 0.05, yAt(zFront - 0.05) + 0.05, yAt(zFront - 0.05) + railH - 0.05], [zBack + 0.05, yAt(zBack + 0.05) + 0.05, yAt(zBack + 0.05) + railH - 0.05], 0.025);
      m.rod(o.handMat ?? 'metal', [x, yTop(zFront), zFront], [x, yTop(zBack), zBack], 0.05, 0.04);
      for (const z of [zFront - 0.05, zBack + 0.05]) m.rod('metal', [x, yAt(z), z], [x, yTop(z), z], 0.05);
    } else if (o.rail === 'rope') {
      for (const z of [zFront - 0.08, (zFront + zBack) / 2, zBack + 0.08]) m.rod('woodDark', [x, yAt(z) - 0.02, z], [x, yTop(z) + 0.05, z], 0.1);
      const segs = 6;
      for (let k = 0; k < segs; k++) {
        const za = zFront - ((zFront - zBack) * k) / segs, zb2 = zFront - ((zFront - zBack) * (k + 1)) / segs;
        const sag = (zz) => 0.1 * Math.sin((Math.PI * (zFront - zz)) / (zFront - zBack) * 3);
        m.rod('straw', [x, yTop(za) - 0.12 - Math.abs(sag(za)), za], [x, yTop(zb2) - 0.12 - Math.abs(sag(zb2)), zb2], 0.03);
      }
    } else if (o.rail === 'wall') {
      for (let i = 0; i < L; i++) m.box(o.riser ?? o.tread, [x - 0.07, 0, L - i - 1], [x + 0.07, treadTop(i, L) + 0.55, L - i]);
      for (let i = 0; i < L; i++) m.box(o.cap ?? 'stoneDark', [x - 0.09, treadTop(i, L) + 0.55, L - i - 1], [x + 0.09, treadTop(i, L) + 0.6, L - i]);
    }
  }
  if (o.landingPost) for (const x of [x0 + 0.04, x1 - 0.04]) m.rod(o.landingPost, [x, 0, L - 0.05], [x, 1.0, L - 0.05], 0.1);
  return m;
}

/** Log stair: log treads laid across, notched posts and a rope rail. */
function cabinStair(id) {
  const m = new Model(id);
  const L = 3, s = LEVEL_HEIGHT / (L + 1);
  for (let i = 0; i < L; i++) {
    const top = treadTop(i, L), z = L - i - 0.5;
    m.cyl('wood', [0.04, top - 0.1, z], [0.96, top - 0.1, z], 0.1, 8);
    m.box('woodDark', [0.04, top - 0.2, z - 0.36], [0.96, top - 0.04, z + 0.36]);
    m.box('wood', [0.06, top - 0.05, z - 0.4], [0.94, top, z + 0.4]);
  }
  const yAt = (z) => s * 0.5 + s * (L - z);
  for (const x of [0.06, 0.94]) {
    board(m, 'woodDark', x, [L - 0.12, 0, yAt(L - 0.12) + 0.06], [0.12, yAt(0.12) - 0.18, yAt(0.12) + 0.06], 0.1);
    for (const z of [L - 0.2, L / 2, 0.2]) m.cyl('wood', [x, yAt(z) - 0.05, z], [x, yAt(z) + 1.0, z], 0.06, 8);
    const segs = 6;
    for (let k = 0; k < segs; k++) {
      const za = L - 0.2 - ((L - 0.4) * k) / segs, zb = L - 0.2 - ((L - 0.4) * (k + 1)) / segs;
      const d = (zz) => 0.07 * Math.sin((zz / L) * Math.PI * 4);
      m.rod('straw', [x, yAt(za) + 0.82 + d(za), za], [x, yAt(zb) + 0.82 + d(zb), zb], 0.035);
    }
  }
  return m;
}

/** A spiral stair around a central pole. n = walked cells (3 or 4); materials by name. */
function spiral(id, n, o) {
  const m = new Model(id);
  const c = 1, R = o.radius ?? 0.97, r0 = 0.11, rise = LEVEL_HEIGHT / (n + 1);
  const quads = [Math.PI, Math.PI / 2, 0, -Math.PI / 2]; // start angle of the front-left, front-right, back-right and back-left quarters
  m.cylY(o.pole, c, c, 0, LEVEL_HEIGHT + (o.poleExtra ?? 0.5), r0, r0 * 0.9, 10);
  m.cylY(o.base ?? o.pole, c, c, 0, 0.05, 0.3, 0.3, 12);
  const pts = [];
  for (let q = 0; q < n; q++) {
    const H = treadTop(q, n);
    for (let j = 0; j < 2; j++) {
      const a0 = quads[q] - (j * Math.PI) / 4, a1 = quads[q] - ((j + 1) * Math.PI) / 4;
      const top = H + (j === 0 ? -rise / 4 : rise / 4), th = o.thick ?? 0.07;
      const P = (a, r, y) => [c + Math.cos(a) * r, y, c + Math.sin(a) * r];
      const ring = (y) => [P(a0, r0 - 0.02, y), P(a0, R, y), P(a1, R, y), P(a1, r0 - 0.02, y)];
      m.hexa(o.tread, [...ring(top - th), ...ring(top)]);
      if (o.riserCap) m.hexa(o.riserCap, [...ring(top - th - 0.05).map((p) => [p[0], p[1], p[2]]), ...ring(top - th)]);
      const mid = (a0 + a1) / 2;
      pts.push({ a: mid, top, outer: P(a0, R - 0.04, top) });
      if (j === 1 && q === n - 1) pts.push({ a: a1, top, outer: P(a1, R - 0.04, top) });
    }
  }
  if (o.rail !== 'none') {
    const rh = o.railH ?? 0.88;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k].outer;
      m.rod(o.railMat ?? o.pole, [p[0], pts[k].top - 0.02, p[2]], [p[0], pts[k].top + rh, p[2]], 0.035);
      if (k < pts.length - 1) {
        const q = pts[k + 1].outer;
        m.rod(o.handMat ?? o.railMat ?? o.pole, [p[0], pts[k].top + rh, p[2]], [q[0], pts[k + 1].top + rh, q[2]], 0.055, 0.045);
        if (o.glassRail) { const mid = 0.1 + (rh - 0.15) / 2; m.rod('glass', [p[0], pts[k].top + mid, p[2]], [q[0], pts[k + 1].top + mid, q[2]], 0.02, rh - 0.15); }
        else m.rod(o.railMat ?? o.pole, [p[0], pts[k].top + rh * 0.45, p[2]], [q[0], pts[k + 1].top + rh * 0.45, q[2]], 0.02);
      }
    }
  }
  return m;
}

export const STAIR_MODELS = {
  stairOakOpen: () => straight('stairOakOpen', 1, 3, { tread: 'wood', thick: 0.06, risers: 'open', stringer: 'woodDark', rail: 'spindle', railMat: 'woodDark', balMat: 'wood', handMat: 'woodDark', landingPost: 'woodDark' }),
  stairOakClosed: () => straight('stairOakClosed', 1, 4, { tread: 'wood', riser: 'carpetWhite', risers: 'closed', stringer: 'carpetWhite', stringerDepth: 0.3, rail: 'spindle', railMat: 'carpetWhite', balMat: 'carpetWhite', handMat: 'wood' }),
  stairWhitePainted: () => straight('stairWhitePainted', 1, 3, { tread: 'carpetWhite', riser: 'carpetWhite', risers: 'closed', stringer: 'carpetWhite', rail: 'pipe', railMat: 'metal', handMat: 'wood', oneSide: true }),
  stairFloating: () => straight('stairFloating', 1, 4, { tread: 'wood', thick: 0.1, floating: true, stringer: 'metalDark', rail: 'glass', handMat: 'metal', oneSide: true, nosing: 0.0 }),
  stairIndustrial: () => straight('stairIndustrial', 1, 3, { tread: 'metalDark', thick: 0.05, risers: 'open', stringer: 'metal', stringerDepth: 0.32, rail: 'pipe', railMat: 'metal', handMat: 'metal' }),
  stairStone: () => straight('stairStone', 1, 3, { tread: 'stone', riser: 'stone', solid: true, rail: 'wall', cap: 'stoneDark' }),
  stairGrand: () => straight('stairGrand', 2, 4, { tread: 'wood', riser: 'woodDark', risers: 'closed', stringer: 'woodDark', stringerDepth: 0.32, rail: 'spindle', railMat: 'woodDark', balMat: 'wood', handMat: 'woodDark', landingPost: 'woodDark' }),
  stairCabin: () => cabinStair('stairCabin'),
  stairSpiralIron: () => spiral('stairSpiralIron', 3, { tread: 'metalDark', pole: 'metalDark', railMat: 'metalDark', handMat: 'wood', thick: 0.05 }),
  stairSpiralWood: () => spiral('stairSpiralWood', 4, { tread: 'wood', pole: 'woodDark', railMat: 'woodDark', handMat: 'wood', thick: 0.08 }),
  stairSpiralGlass: () => spiral('stairSpiralGlass', 4, { tread: 'wood', pole: 'metal', railMat: 'metal', handMat: 'metal', glassRail: true, thick: 0.06 }),
  stairSpiralStone: () => spiral('stairSpiralStone', 3, { tread: 'stone', pole: 'stoneDark', railMat: 'metalDark', handMat: 'wood', thick: 0.12, base: 'stone' }),
};
void rnd;
