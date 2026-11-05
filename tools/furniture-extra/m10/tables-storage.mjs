// Milestone 10 furniture, group "tables-storage": export default { modelName: builderFn, ... }.
// See dev/ds-tasks/m10f/AUTHORING.md. Content for these models: src/content/objectsM10/tables-storage.ts

import { Model } from '../kit.mjs';

/**
 * Four-drawer chest (exemplar: sliding parts). The two top drawers are the parts `anim:drawer1` and `anim:drawer2`: each is
 * a front, a handle and an open tray with folded clothes, so it can slide out to +z while the chest is used.
 */
function chestOfDrawers() {
  const m = new Model('chestOfDrawers');
  const W = 0.9, D = 0.48, H = 0.98, LEG = 0.08, ROW = 0.21, R0 = 0.11, SIDE = 0.03;
  m.box('woodDark', [0, 0, 0], [0.06, LEG, 0.06]); // legs
  m.box('woodDark', [W - 0.06, 0, 0], [W, LEG, 0.06]);
  m.box('woodDark', [0, 0, D - 0.06], [0.06, LEG, D]);
  m.box('woodDark', [W - 0.06, 0, D - 0.06], [W, LEG, D]);
  m.box('wood', [SIDE, LEG, 0.02], [W - SIDE, R0, D]); // base rail
  m.box('woodDark', [0, LEG, 0], [W, H - 0.03, 0.02]); // back
  m.box('wood', [0, LEG, 0.02], [SIDE, H - 0.03, D]); // sides
  m.box('wood', [W - SIDE, LEG, 0.02], [W, H - 0.03, D]);
  m.box('wood', [-0.012, H - 0.03, -0.01], [W + 0.012, H, D + 0.024]); // top, with a small overhang
  const handle = (part, ry) => {
    const y = ry + 0.105, z = D + 0.022;
    part.rod('metal', [W / 2 - 0.07, y, z + 0.022], [W / 2 + 0.07, y, z + 0.022], 0.018);
    for (const x of [W / 2 - 0.06, W / 2 + 0.06]) part.rod('metal', [x, y, z], [x, y, z + 0.022], 0.014);
  };
  for (let i = 0; i < 4; i++) {
    const ry = R0 + i * ROW;
    m.box('wood', [SIDE, ry + 0.2, 0.02], [W - SIDE, ry + 0.21, D]); // board above this row
    if (i < 2) { // the two lower drawers stay shut: a front panel only
      m.box('woodDark', [SIDE + 0.015, ry + 0.01, 0.02], [W - SIDE - 0.015, ry + 0.19, D]);
      m.box('wood', [SIDE + 0.015, ry + 0.01, D], [W - SIDE - 0.015, ry + 0.2, D + 0.022]);
      handle(m, ry);
    }
  }
  const clothes = [['carpetBlue', 0.1, 0.4, 0.06], ['carpetWhite', 0.5, 0.78, 0.05], ['carpet', 0.1, 0.34, 0.045], ['carpetDarker', 0.44, 0.78, 0.07]];
  [['anim:drawer1', 3], ['anim:drawer2', 2]].forEach(([name, i], k) => {
    const ry = R0 + i * ROW;
    const d = m.part(name, [W / 2, ry + 0.105, D + 0.011]);
    d.box('wood', [SIDE + 0.015, ry + 0.01, D], [W - SIDE - 0.015, ry + 0.2, D + 0.022]); // front
    handle(d, ry);
    d.box('woodDark', [0.05, ry + 0.015, 0.1], [W - 0.05, ry + 0.025, D]); // tray: floor, sides and back
    d.box('woodDark', [0.05, ry + 0.025, 0.1], [0.06, ry + 0.17, D]);
    d.box('woodDark', [W - 0.06, ry + 0.025, 0.1], [W - 0.05, ry + 0.17, D]);
    d.box('woodDark', [0.05, ry + 0.025, 0.1], [W - 0.05, ry + 0.17, 0.11]);
    for (const [mat, a, b, h] of clothes.slice(k * 2, k * 2 + 2)) d.box(mat, [a, ry + 0.025, 0.16], [b, ry + 0.025 + h, 0.38]); // folded clothes
  });
  return m;
}


// ---- small shared helpers for this group (plain functions, no kit changes) ----
/** Bar handle: a rod on two posts on a front face at z (outer face), centred on x, at height y. */
const barHandle = (t, mat, x, y, z, w = 0.14) => {
  t.rod(mat, [x - w / 2, y, z + 0.022], [x + w / 2, y, z + 0.022], 0.016);
  for (const s of [-1, 1]) t.rod(mat, [x + s * (w / 2 - 0.01), y, z], [x + s * (w / 2 - 0.01), y, z + 0.022], 0.012);
};
/** Round-ish knob: a small cube standing on a front face. */
const knob = (t, mat, x, y, z) => t.box(mat, [x - 0.017, y - 0.017, z], [x + 0.017, y + 0.017, z + 0.03]);
/** Four square legs under a rectangle (min/max corners in x, z), from y0 to y1. */
const legs4 = (m, mat, x0, z0, x1, z1, y1, t = 0.06, y0 = 0) => {
  for (const [x, z] of [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]]) m.box(mat, [x, y0, z], [x + t, y1, z + t]);
};
/** Four rails (an apron) just inside a rectangle between heights y0 and y1. */
const apron = (m, mat, x0, z0, x1, z1, y0, y1, t = 0.025) => {
  m.box(mat, [x0, y0, z0], [x1, y1, z0 + t]);
  m.box(mat, [x0, y0, z1 - t], [x1, y1, z1]);
  m.box(mat, [x0, y0, z0 + t], [x0 + t, y1, z1 - t]);
  m.box(mat, [x1 - t, y0, z0 + t], [x1, y1, z1 - t]);
};
/** Drawer that slides out: an overlay front with a bar handle plus an open tray behind it, as the named part. */
const drawerPart = (m, name, { x0, x1, y0, y1, zf, depth, mat = 'wood', trayMat = 'woodDark', hMat = 'metal', fill = null, knobs = false }) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const d = m.part(name, [cx, cy, zf + 0.011]);
  d.box(mat, [x0, y0, zf], [x1, y1, zf + 0.022]);
  if (knobs) { knob(d, hMat, x0 + (x1 - x0) * 0.3, cy, zf + 0.022); knob(d, hMat, x0 + (x1 - x0) * 0.7, cy, zf + 0.022); }
  else barHandle(d, hMat, cx, cy + (y1 - y0) * 0.18, zf + 0.0, Math.min(0.16, (x1 - x0) * 0.4));
  const t = 0.012, ty = y0 + 0.012;
  d.box(trayMat, [x0 + 0.02, ty, zf - depth], [x1 - 0.02, ty + t, zf]);
  d.box(trayMat, [x0 + 0.02, ty + t, zf - depth], [x0 + 0.02 + t, y1 - 0.03, zf]);
  d.box(trayMat, [x1 - 0.02 - t, ty + t, zf - depth], [x1 - 0.02, y1 - 0.03, zf]);
  d.box(trayMat, [x0 + 0.02 + t, ty + t, zf - depth], [x1 - 0.02 - t, y1 - 0.03, zf - depth + t]);
  if (fill) for (const [mat2, a, b, h] of fill) d.box(mat2, [x0 + a, ty + t, zf - depth + 0.04], [x0 + b, ty + t + h, zf - 0.05]);
  return d;
};
/** Closed drawer front fixed in the body. */
const drawerFront = (m, { x0, x1, y0, y1, zf, mat = 'wood', hMat = 'metal', knobs = false }) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  m.box(mat, [x0, y0, zf], [x1, y1, zf + 0.022]);
  if (knobs) { knob(m, hMat, x0 + (x1 - x0) * 0.3, cy, zf + 0.022); knob(m, hMat, x0 + (x1 - x0) * 0.7, cy, zf + 0.022); }
  else barHandle(m, hMat, cx, cy + (y1 - y0) * 0.18, zf, Math.min(0.16, (x1 - x0) * 0.4));
};
const CLOTHES = [['carpetBlue', 0.06, 0.2, 0.05], ['carpetWhite', 0.24, 0.4, 0.045], ['carpet', 0.06, 0.2, 0.04], ['carpetDarker', 0.24, 0.4, 0.06]];
/** A hinged door part: panel from x0..x1 (hinge on the left edge when left, else the right edge), with a handle on the free edge. */
const doorPart = (m, name, { x0, x1, y0, y1, zf, left, mat = 'wood', hMat = 'metal', glass = false, t = 0.025 }) => {
  const hx = left ? x0 : x1;
  const d = m.part(name, [hx, 0, zf + t / 2]);
  if (glass) { // frame with a glass pane
    const f = 0.045;
    d.box(mat, [x0, y0, zf], [x1, y0 + f, zf + t]); d.box(mat, [x0, y1 - f, zf], [x1, y1, zf + t]);
    d.box(mat, [x0, y0 + f, zf], [x0 + f, y1 - f, zf + t]); d.box(mat, [x1 - f, y0 + f, zf], [x1, y1 - f, zf + t]);
    d.box('glass', [x0 + f, y0 + f, zf + t / 2 - 0.003], [x1 - f, y1 - f, zf + t / 2 + 0.003]);
  } else d.box(mat, [x0, y0, zf], [x1, y1, zf + t]);
  const hxp = left ? x1 - 0.05 : x0 + 0.05, hy = (y0 + y1) / 2;
  d.rod(hMat, [hxp, hy - 0.08, zf + t + 0.02], [hxp, hy + 0.08, zf + t + 0.02], 0.016);
  for (const dy of [-0.06, 0.06]) d.rod(hMat, [hxp, hy + dy, zf + t], [hxp, hy + dy, zf + t + 0.02], 0.012);
  return d;
};

/** Round Oak Pedestal Table: a chunky column on a flared foot under a round top. */
function diningRoundPedestal() {
  const m = new Model('diningRoundPedestal');
  const c = 0.65;
  m.cylY('woodDark', c, c, 0, 0.1, 0.36, 0.26);
  m.cylY('woodDark', c, c, 0.1, 0.66, 0.1, 0.1);
  m.cylY('woodDark', c, c, 0.56, 0.68, 0.1, 0.22);
  m.cylY('woodDark', c, c, 0.68, 0.71, 0.6, 0.6);
  m.cylY('wood', c, c, 0.71, 0.75, 0.65, 0.65);
  return m;
}

/** Square Dining Table: a pale top in a dark border on four slim steel legs. */
function diningSquareModern() {
  const m = new Model('diningSquareModern');
  const S = 1.4;
  m.box('woodDark', [0, 0.71, 0], [S, 0.75, S]);
  m.box('wood', [0.05, 0.75, 0.05], [S - 0.05, 0.765, S - 0.05]);
  legs4(m, 'metal', 0.08, 0.08, S - 0.08, S - 0.08, 0.71, 0.05);
  apron(m, 'metal', 0.08, 0.08, S - 0.08, S - 0.08, 0.64, 0.71, 0.02);
  return m;
}

/** Plank Farm Table: three thick planks on stout turned-square legs and a low stretcher. */
function diningPlankFarm() {
  const m = new Model('diningPlankFarm');
  const W = 1.9, D = 0.9;
  m.box('woodDark', [0, 0.69, 0], [W, 0.72, D]);
  for (let i = 0; i < 3; i++) m.box('wood', [0, 0.72, i * 0.3 + 0.01], [W, 0.77, i * 0.3 + 0.29]);
  legs4(m, 'woodDark', 0.12, 0.1, W - 0.12, D - 0.1, 0.69, 0.1);
  m.box('woodDark', [0.12, 0.18, 0.4], [W - 0.12, 0.24, 0.5]);
  m.box('woodDark', [0.12, 0.6, 0.1], [W - 0.12, 0.69, 0.16]);
  m.box('woodDark', [0.12, 0.6, D - 0.16], [W - 0.12, 0.69, D - 0.1]);
  return m;
}

/** Extendable Dining Table: a three-metre top with two leaf seams on twin pedestals. */
function diningExtendable() {
  const m = new Model('diningExtendable');
  const W = 2.7, D = 0.95;
  m.box('wood', [0, 0.72, 0], [W, 0.77, D]);
  for (const x of [0.9, 1.8]) m.box('woodDark', [x - 0.005, 0.77, 0.02], [x + 0.005, 0.772, D - 0.02]);
  m.box('woodDark', [0.06, 0.68, 0.06], [W - 0.06, 0.72, D - 0.06]);
  for (const x of [0.5, 2.2]) {
    m.box('woodDark', [x - 0.09, 0.08, 0.3], [x + 0.09, 0.68, 0.65]);
    m.box('woodDark', [x - 0.07, 0, 0.1], [x + 0.07, 0.08, 0.85]);
    m.box('woodDark', [x - 0.13, 0.58, 0.28], [x + 0.13, 0.68, 0.67]);
  }
  return m;
}

/** Mid-Century Dining Table: a slim top with a chamfered edge band on splayed, tapered legs. */
function diningMidCentury() {
  const m = new Model('diningMidCentury');
  const W = 1.7, D = 0.9;
  m.box('wood', [0, 0.7, 0], [W, 0.75, D]);
  m.box('woodDark', [0.04, 0.67, 0.04], [W - 0.04, 0.7, D - 0.04]);
  for (const [x, z, sx, sz] of [[0.18, 0.14, -1, -1], [W - 0.18, 0.14, 1, -1], [0.18, D - 0.14, -1, 1], [W - 0.18, D - 0.14, 1, 1]]) {
    m.rod('woodDark', [x + sx * 0.09, 0.02, z + sz * 0.07], [x, 0.68, z], 0.045);
  }
  return m;
}

/** Pipe-Frame Dining Table: reclaimed planks on a black pipe frame. */
function diningIndustrialPipe() {
  const m = new Model('diningIndustrialPipe');
  const W = 1.8, D = 0.85;
  for (let i = 0; i < 4; i++) m.box('wood', [0, 0.73, i * 0.2125 + 0.004], [W, 0.78, (i + 1) * 0.2125 - 0.004]);
  apron(m, 'metalDark', 0.05, 0.05, W - 0.05, D - 0.05, 0.69, 0.73, 0.04);
  for (const [x, z] of [[0.1, 0.1], [W - 0.1, 0.1], [0.1, D - 0.1], [W - 0.1, D - 0.1]]) m.cylY('metalDark', x, z, 0, 0.69, 0.03, 0.03, 8);
  for (const x of [0.1, W - 0.1]) m.rod('metalDark', [x, 0.16, 0.1], [x, 0.16, D - 0.1], 0.04);
  m.rod('metalDark', [0.1, 0.16, D / 2], [W - 0.1, 0.16, D / 2], 0.04);
  return m;
}

/** Bistro Table: a small round top on a slim column and a round iron foot. */
function diningBistro() {
  const m = new Model('diningBistro');
  const c = 0.375;
  m.cylY('metalDark', c, c, 0, 0.035, 0.24, 0.22);
  m.cylY('metalDark', c, c, 0.035, 0.68, 0.035, 0.035, 8);
  m.cylY('metalDark', c, c, 0.68, 0.72, 0.1, 0.18);
  m.cylY('metalDark', c, c, 0.72, 0.755, 0.385, 0.385);
  m.cylY('wood', c, c, 0.755, 0.77, 0.36, 0.36);
  return m;
}

/** Drop-Leaf Table: a narrow table with both leaves up, held by gate legs. */
function diningDropLeaf() {
  const m = new Model('diningDropLeaf');
  const W = 1.6, D = 0.8;
  m.box('wood', [0.35, 0.7, 0], [W - 0.35, 0.75, D]);
  for (const x of [0, W - 0.35]) m.box('wood', [x, 0.7, 0.02], [x + 0.35, 0.75, D - 0.02]);
  for (const x of [0.35, W - 0.35]) m.box('metal', [x - 0.01, 0.695, 0.1], [x + 0.01, 0.7, 0.2]);
  for (const x of [0.35, W - 0.35]) m.box('metal', [x - 0.01, 0.695, D - 0.2], [x + 0.01, 0.7, D - 0.1]);
  apron(m, 'woodDark', 0.42, 0.06, W - 0.42, D - 0.06, 0.62, 0.7, 0.03);
  for (const [x, z] of [[0.42, 0.06], [W - 0.42 - 0.07, 0.06], [0.42, D - 0.13], [W - 0.42 - 0.07, D - 0.13]]) {
    m.cylY('woodDark', x + 0.035, z + 0.035, 0, 0.7, 0.032, 0.04, 8);
  }
  for (const [x, dir] of [[0.37, -1], [W - 0.37, 1]]) { // gate legs holding the leaves
    m.rod('woodDark', [x, 0.05, D / 2], [x + dir * 0.02, 0.69, D / 2], 0.05);
  }
  return m;
}

/** Marble Dining Table: a thick white slab with a brass edge on two panel supports. */
function diningMarbleLuxury() {
  const m = new Model('diningMarbleLuxury');
  const W = 1.9, D = 0.95;
  m.box('metal', [-0.005, 0.7, -0.005], [W + 0.005, 0.73, D + 0.005]);
  m.box('carpetWhite', [0, 0.73, 0], [W, 0.78, D]);
  for (const x of [0.25, W - 0.25 - 0.1]) m.box('woodDark', [x, 0.04, 0.12], [x + 0.1, 0.7, D - 0.12]);
  for (const x of [0.2, W - 0.2 - 0.2]) m.box('metal', [x, 0, 0.1], [x + 0.2, 0.04, D - 0.1]);
  m.rod('metal', [0.3, 0.3, D / 2], [W - 0.3, 0.3, D / 2], 0.04);
  return m;
}

/** Picnic Table: a plank top and two attached benches on bolted end frames. */
function diningPicnic() {
  const m = new Model('diningPicnic');
  const W = 1.8, D = 1.5;
  for (let i = 0; i < 3; i++) m.box('wood', [0, 0.73, 0.4 + i * 0.234], [W, 0.77, 0.4 + (i + 1) * 0.234 - 0.01]);
  for (const z of [0.02, D - 0.3]) m.box('wood', [0, 0.43, z], [W, 0.47, z + 0.28]);
  for (const x of [0.25, W - 0.3]) {
    m.box('woodDark', [x, 0.4, 0.04], [x + 0.05, 0.43, D - 0.04]); // bench bearers
    m.rod('woodDark', [x + 0.025, 0.02, 0.1], [x + 0.025, 0.73, 0.55], 0.05, 0.05);
    m.rod('woodDark', [x + 0.025, 0.02, D - 0.1], [x + 0.025, 0.73, D - 0.55], 0.05, 0.05);
    m.box('woodDark', [x, 0.7, 0.4], [x + 0.05, 0.73, D - 0.4]);
  }
  return m;
}


/** Round Mid-Century Coffee Table: a wide round top on four splayed legs. */
function coffeeRoundMidCentury() {
  const m = new Model('coffeeRoundMidCentury');
  const c = 0.425;
  m.cylY('wood', c, c, 0.38, 0.42, 0.425, 0.425);
  m.cylY('woodDark', c, c, 0.35, 0.38, 0.36, 0.36);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    m.rod('woodDark', [c + sx * 0.25, 0.01, c + sz * 0.25], [c + sx * 0.17, 0.37, c + sz * 0.17], 0.04);
  }
  return m;
}

/** Trunk Coffee Table: an old strapped travelling trunk on small feet. */
function coffeeTrunk() {
  const m = new Model('coffeeTrunk');
  const W = 1.1, D = 0.6;
  m.box('wood', [0, 0.06, 0], [W, 0.38, D]);
  m.box('woodDark', [-0.01, 0.38, -0.01], [W + 0.01, 0.45, D + 0.01]);
  for (const x of [0.16, W - 0.24]) {
    m.box('metalDark', [x, 0.06, D], [x + 0.08, 0.45, D + 0.012]);
    m.box('metalDark', [x, 0.451, -0.01], [x + 0.08, 0.462, D + 0.012]);
    m.box('metalDark', [x, 0.06, -0.012], [x + 0.08, 0.45, 0]);
  }
  m.box('metal', [W / 2 - 0.04, 0.3, D], [W / 2 + 0.04, 0.42, D + 0.02]); // latch
  for (const [x, z] of [[0.03, 0.03], [W - 0.09, 0.03], [0.03, D - 0.09], [W - 0.09, D - 0.09]]) m.box('woodDark', [x, 0, z], [x + 0.06, 0.06, z + 0.06]);
  return m;
}

/** Nesting Coffee Tables: a larger table with a smaller one slid half underneath. */
function coffeeNesting() {
  const m = new Model('coffeeNesting');
  m.box('wood', [0.02, 0.43, 0.02], [0.8, 0.46, 0.5]);
  legs4(m, 'metal', 0.05, 0.05, 0.77, 0.47, 0.43, 0.03);
  m.box('carpetBlue', [0.14, 0.33, 0.3], [0.68, 0.36, 0.88]);
  legs4(m, 'metal', 0.17, 0.33, 0.65, 0.85, 0.33, 0.03);
  return m;
}

/** Cart Coffee Table: a steel cart on casters with a plank top and a low shelf. */
function coffeeCartIndustrial() {
  const m = new Model('coffeeCartIndustrial');
  const W = 1.1, D = 0.55;
  m.box('wood', [0, 0.4, 0], [W, 0.45, D]);
  m.box('wood', [0.04, 0.16, 0.04], [W - 0.04, 0.19, D - 0.04]);
  for (const [x, z] of [[0.03, 0.03], [W - 0.07, 0.03], [0.03, D - 0.07], [W - 0.07, D - 0.07]]) {
    m.box('metalDark', [x, 0.08, z], [x + 0.04, 0.4, z + 0.04]);
    m.cyl('metalDark', [x - 0.01, 0.04, z + 0.02], [x + 0.05, 0.04, z + 0.02], 0.04, 8);
  }
  apron(m, 'metalDark', 0.03, 0.03, W - 0.03, D - 0.03, 0.36, 0.4, 0.025);
  m.rod('metalDark', [W + 0.03, 0.4, 0.1], [W + 0.03, 0.62, 0.1], 0.025);
  m.rod('metalDark', [W + 0.03, 0.4, D - 0.1], [W + 0.03, 0.62, D - 0.1], 0.025);
  m.rod('metalDark', [W + 0.03, 0.62, 0.1], [W + 0.03, 0.62, D - 0.1], 0.025);
  m.rod('metalDark', [W - 0.04, 0.4, 0.1], [W + 0.03, 0.4, 0.1], 0.025);
  m.rod('metalDark', [W - 0.04, 0.4, D - 0.1], [W + 0.03, 0.4, D - 0.1], 0.025);
  return m;
}

/** Gilded Marble Drum Table: a white marble disc on a brass drum. */
function coffeeMarbleDrum() {
  const m = new Model('coffeeMarbleDrum');
  const c = 0.4;
  m.cylY('metal', c, c, 0, 0.03, 0.34, 0.34);
  m.cylY('metal', c, c, 0.03, 0.37, 0.26, 0.26);
  m.cylY('metal', c, c, 0.37, 0.4, 0.4, 0.4);
  m.cylY('carpetWhite', c, c, 0.4, 0.44, 0.4, 0.4);
  return m;
}

/** Barrel Side Table: a small wooden drum with two iron bands. */
function sideDrum() {
  const m = new Model('sideDrum');
  const c = 0.25;
  m.cylY('wood', c, c, 0, 0.5, 0.21, 0.23);
  for (const y of [0.08, 0.38]) m.cylY('metalDark', c, c, y, y + 0.04, 0.232, 0.232);
  m.cylY('woodDark', c, c, 0.5, 0.53, 0.25, 0.25);
  return m;
}

/** Two-Tier End Table: a square top over a shelf on four slim legs. */
function sideEndTwoTier() {
  const m = new Model('sideEndTwoTier');
  const S = 0.55;
  m.box('wood', [0, 0.56, 0], [S, 0.6, S]);
  m.box('wood', [0.03, 0.2, 0.03], [S - 0.03, 0.23, S - 0.03]);
  legs4(m, 'woodDark', 0.03, 0.03, S - 0.03, S - 0.03, 0.56, 0.05);
  m.box('carpetBlue', [0.12, 0.23, 0.15], [0.32, 0.27, 0.4]); // a magazine on the shelf
  return m;
}

/** Brass Console: a narrow top on slim brass legs with a glass shelf. */
function consoleBrass() {
  const m = new Model('consoleBrass');
  const W = 1.4, D = 0.35;
  m.box('wood', [0, 0.77, 0], [W, 0.8, D]);
  legs4(m, 'metal', 0.04, 0.03, W - 0.04, D - 0.03, 0.77, 0.03);
  apron(m, 'metal', 0.04, 0.03, W - 0.04, D - 0.03, 0.74, 0.77, 0.02);
  m.box('glass', [0.07, 0.22, 0.05], [W - 0.07, 0.226, D - 0.05]);
  for (const x of [0.04, W - 0.07]) m.box('metal', [x, 0.2, 0.03], [x + 0.03, 0.22, D - 0.03]);
  return m;
}

/** Pipe Console: two plank shelves in a black steel frame, made to stand behind a sofa. */
function consoleIndustrial() {
  const m = new Model('consoleIndustrial');
  const W = 1.5, D = 0.4;
  m.box('wood', [0, 0.82, 0], [W, 0.86, D]);
  m.box('wood', [0.04, 0.3, 0.03], [W - 0.04, 0.33, D - 0.03]);
  legs4(m, 'metalDark', 0.04, 0.04, W - 0.04, D - 0.04, 0.82, 0.04);
  for (const x of [0.04, W - 0.08]) m.box('metalDark', [x, 0.26, 0.04], [x + 0.04, 0.3, D - 0.04]);
  m.rod('metalDark', [0.06, 0.78, 0.06], [W - 0.06, 0.78, 0.06], 0.03);
  for (const x of [0.3, 0.75, 1.2]) m.box('carpetBlue', [x - 0.08, 0.33, 0.1], [x + 0.08, 0.5, 0.3]);
  return m;
}

/** C-Table: a flat steel base and a post that carries a top over the sofa arm. */
function sideCTable() {
  const m = new Model('sideCTable');
  m.box('metalDark', [0.04, 0, 0.04], [0.46, 0.03, 0.12]);
  m.box('metalDark', [0.04, 0, 0.12], [0.1, 0.03, 0.44]);
  m.box('metalDark', [0.4, 0, 0.12], [0.46, 0.03, 0.44]);
  m.box('metalDark', [0.2, 0.03, 0.05], [0.3, 0.57, 0.1]);
  m.box('wood', [0.02, 0.57, 0.02], [0.48, 0.6, 0.48]);
  return m;
}

/** Telephone Table: a small cottage table with a drawer, a lower shelf and turned legs. */
function sideTelephone() {
  const m = new Model('sideTelephone');
  const W = 0.6, D = 0.35;
  m.box('wood', [0, 0.72, 0], [W, 0.75, D]);
  m.box('woodDark', [0.03, 0.62, 0.02], [W - 0.03, 0.72, D - 0.022]);
  drawerFront(m, { x0: 0.05, x1: W - 0.05, y0: 0.64, y1: 0.71, zf: D - 0.022, knobs: true });
  m.box('wood', [0.02, 0.16, 0.02], [W - 0.02, 0.19, D - 0.02]);
  for (const [x, z] of [[0.04, 0.04], [W - 0.04, 0.04], [0.04, D - 0.04], [W - 0.04, D - 0.04]]) m.cylY('woodDark', x, z, 0, 0.72, 0.022, 0.03, 8);
  m.box('carpetWhite', [0.12, 0.19, 0.08], [0.32, 0.215, 0.26]); // a pad of paper
  return m;
}


/** Secretary Desk: a small writing desk with a drawer and a hutch of pigeonholes. */
function deskSecretary() {
  const m = new Model('deskSecretary');
  const W = 0.9, D = 0.5;
  m.box('wood', [-0.01, 0.7, 0], [W + 0.01, 0.74, D + 0.01]);
  legs4(m, 'woodDark', 0.03, 0.03, W - 0.03, D - 0.03, 0.7, 0.05);
  m.box('woodDark', [0.06, 0.56, 0.02], [W - 0.06, 0.7, D - 0.022]);
  drawerFront(m, { x0: 0.08, x1: W - 0.08, y0: 0.58, y1: 0.69, zf: D - 0.022, knobs: true });
  m.box('woodDark', [0.05, 0.12, 0.04], [W - 0.05, 0.16, D - 0.04]);
  // hutch
  m.box('woodDark', [0.02, 0.74, 0.02], [W - 0.02, 1.2, 0.05]);
  for (const x of [0.02, W - 0.05]) m.box('wood', [x, 0.74, 0.02], [x + 0.03, 1.2, 0.28]);
  m.box('wood', [-0.005, 1.2, 0], [W + 0.005, 1.24, 0.31]);
  m.box('wood', [0.05, 0.96, 0.05], [W - 0.05, 0.98, 0.28]);
  for (const x of [0.3, 0.6]) m.box('wood', [x - 0.01, 0.74, 0.05], [x + 0.01, 1.2, 0.28]);
  m.box('carpetWhite', [0.1, 0.74, 0.1], [0.26, 0.86, 0.2]);
  m.box('carpetBlue', [0.35, 0.74, 0.1], [0.55, 0.9, 0.2]);
  m.box('carpet', [0.65, 0.98, 0.1], [0.8, 1.1, 0.2]);
  return m;
}

/** Standing Desk: a wide top on two columns and steel feet, with a small control box. */
function deskStanding() {
  const m = new Model('deskStanding');
  const W = 1.5, D = 0.7;
  m.box('wood', [0, 1.02, 0], [W, 1.06, D]);
  for (const x of [0.16, W - 0.16]) {
    m.box('metalDark', [x - 0.04, 0, 0.04], [x + 0.04, 0.05, D - 0.04]);
    m.box('metalDark', [x - 0.04, 0.05, D / 2 - 0.04], [x + 0.04, 1.0, D / 2 + 0.04]);
    m.box('metalDark', [x - 0.05, 1.0, 0.1], [x + 0.05, 1.02, D - 0.1]);
  }
  m.box('metalDark', [0.16, 0.8, D / 2 - 0.02], [W - 0.16, 0.86, D / 2 + 0.02]);
  m.box('metal', [W - 0.4, 1.0, D - 0.12], [W - 0.2, 1.02, D - 0.04]);
  m.box('carpet', [W - 0.36, 1.0, D - 0.04], [W - 0.32, 1.02, D - 0.036]);
  return m;
}

/** Executive Desk: a broad leather-inlaid top over two drawer pedestals and a front panel. */
function deskExecutive() {
  const m = new Model('deskExecutive');
  const W = 1.9, D = 0.9, PW = 0.5;
  m.box('woodDark', [0, 0.72, 0], [W, 0.77, D]);
  m.box('carpetDarker', [0.1, 0.77, 0.1], [W - 0.1, 0.772, D - 0.12]);
  for (const x0 of [0.08, W - 0.08 - PW]) {
    m.box('woodDark', [x0 - 0.02, 0, 0.04], [x0 + PW + 0.02, 0.07, D - 0.04]);
    m.box('wood', [x0, 0.07, 0.06], [x0 + PW, 0.72, D - 0.022]);
    for (let i = 0; i < 3; i++) drawerFront(m, { x0: x0 + 0.03, x1: x0 + PW - 0.03, y0: 0.1 + i * 0.2, y1: 0.1 + i * 0.2 + 0.18, zf: D - 0.022, knobs: true, hMat: 'metal' });
  }
  m.box('wood', [0.58, 0.15, 0.2], [W - 0.58, 0.7, 0.24]);
  m.box('woodDark', [0.58, 0.64, 0.1], [W - 0.58, 0.72, D - 0.05]);
  return m;
}

/** School Desk: a one-seat desk and chair joined by steel runners, with a book rack under the top. */
function deskSchool() {
  const m = new Model('deskSchool');
  m.box('wood', [0.02, 0.72, 0.02], [0.58, 0.75, 0.5]);
  m.box('woodDark', [0.02, 0.75, 0.02], [0.58, 0.78, 0.06]);
  m.box('woodDark', [0.06, 0.5, 0.06], [0.54, 0.53, 0.46]);
  for (const [x, z] of [[0.04, 0.04], [0.54, 0.04], [0.04, 0.44], [0.54, 0.44]]) m.box('metal', [x, 0, z], [x + 0.03, 0.72, z + 0.03]);
  for (const x of [0.04, 0.54]) m.rod('metal', [x + 0.015, 0.2, 0.46], [x + 0.015, 0.2, 0.56], 0.025); // runners to the chair
  m.box('wood', [0.08, 0.42, 0.56], [0.52, 0.45, 0.9]);
  m.box('wood', [0.08, 0.45, 0.88], [0.52, 0.72, 0.91]);
  for (const [x, z] of [[0.1, 0.58], [0.49, 0.58], [0.1, 0.86], [0.49, 0.86]]) m.box('metal', [x, 0, z], [x + 0.03, 0.42, z + 0.03]);
  return m;
}

/** Dressing Table: a vanity with a drawer pedestal on each side, a kneehole and a framed mirror. */
function deskVanity() {
  const m = new Model('deskVanity');
  const W = 0.9, D = 0.45;
  m.box('wood', [-0.01, 0.73, 0], [W + 0.01, 0.76, D]);
  for (const x0 of [0.02, W - 0.3]) {
    m.box('woodDark', [x0, 0, 0.03], [x0 + 0.28, 0.06, D - 0.03]);
    m.box('wood', [x0, 0.06, 0.03], [x0 + 0.28, 0.73, D - 0.022]);
    for (let i = 0; i < 3; i++) drawerFront(m, { x0: x0 + 0.02, x1: x0 + 0.26, y0: 0.09 + i * 0.2, y1: 0.09 + i * 0.2 + 0.18, zf: D - 0.022, knobs: true });
  }
  m.box('woodDark', [0.3, 0.63, 0.03], [W - 0.3, 0.73, D - 0.03]);
  m.box('woodDark', [0.3, 0.06, 0.03], [W - 0.3, 0.62, 0.06]);
  // mirror on the table, framed in wood
  m.box('glass', [0.17, 0.9, 0.045], [W - 0.17, 1.4, 0.052]);
  m.box('wood', [0.14, 0.86, 0.03], [W - 0.14, 0.9, 0.065]);
  m.box('wood', [0.14, 1.4, 0.03], [W - 0.14, 1.44, 0.065]);
  for (const x of [0.14, W - 0.17]) m.box('wood', [x, 0.9, 0.03], [x + 0.03, 1.4, 0.065]);
  for (const x of [0.12, W - 0.15]) m.box('woodDark', [x, 0.76, 0.03], [x + 0.03, 0.88, 0.06]);
  m.cylY('carpetBlue', 0.74, 0.28, 0.76, 0.84, 0.03, 0.025, 8); // a bottle
  m.box('carpetWhite', [0.14, 0.76, 0.2], [0.34, 0.8, 0.36]); // a jewellery tray
  return m;
}

/** Drafting Table: a flat work top on a steel frame with a tilted drawing board standing at the back. */
function deskDrafting() {
  const m = new Model('deskDrafting');
  const W = 1.3, D = 0.75;
  m.box('wood', [0, 0.88, 0], [W, 0.92, D]);
  legs4(m, 'metalMedium', 0.06, 0.06, W - 0.06, D - 0.06, 0.88, 0.05);
  apron(m, 'metalMedium', 0.06, 0.06, W - 0.06, D - 0.06, 0.8, 0.88, 0.025);
  m.box('metalMedium', [0.06, 0.2, 0.06], [W - 0.06, 0.23, 0.1]);
  m.box('woodDark', [W - 0.5, 0.7, 0.1], [W - 0.08, 0.88, D - 0.12]);
  drawerFront(m, { x0: W - 0.47, x1: W - 0.11, y0: 0.72, y1: 0.86, zf: D - 0.12, knobs: true, mat: 'wood' });
  // tilted board: rises towards the back on two small supports
  m.slab('carpetWhite', [0.1, 0.92, 0.5], [W - 0.2, 0, 0], [0, 0.24, -0.34], [0, 0.021, 0.015]);
  for (const x of [0.2, W - 0.24]) m.box('metalMedium', [x, 0.92, 0.1], [x + 0.04, 1.0, 0.15]);
  m.box('metal', [0.1, 0.93, 0.52], [W - 0.1, 0.945, 0.56]); // ledge for pencils
  m.rod('metalDark', [0.1, 0.93, 0.62], [W - 0.1, 0.93, 0.62], 0.02); // parallel rule
  return m;
}

/** Student Desk: a slim top between two board sides, with one drawer. */
function deskStudent() {
  const m = new Model('deskStudent');
  const W = 0.9, D = 0.5;
  m.box('wood', [-0.01, 0.72, 0], [W + 0.01, 0.75, D]);
  m.box('woodDark', [0.02, 0, 0.03], [0.06, 0.72, D - 0.03]);
  m.box('woodDark', [W - 0.06, 0, 0.03], [W - 0.02, 0.72, D - 0.03]);
  m.box('woodDark', [0.06, 0.2, 0.03], [W - 0.06, 0.7, 0.06]);
  m.box('wood', [0.06, 0.58, 0.03], [W - 0.06, 0.72, D - 0.022]);
  drawerFront(m, { x0: 0.08, x1: W - 0.08, y0: 0.6, y1: 0.7, zf: D - 0.022, knobs: true });
  m.box('woodDark', [0.06, 0.14, 0.03], [W - 0.06, 0.17, D - 0.05]);
  return m;
}

/** Workshop Desk: plank top, a steel drawer unit on the right and an open steel frame on the left. */
function deskIndustrial() {
  const m = new Model('deskIndustrial');
  const W = 1.5, D = 0.65;
  for (let i = 0; i < 3; i++) m.box('wood', [0, 0.72, i * 0.2167 + 0.003], [W, 0.77, (i + 1) * 0.2167 - 0.003]);
  m.box('metalDark', [W - 0.5, 0.08, 0.05], [W - 0.04, 0.72, D - 0.042]);
  m.box('metalDark', [W - 0.52, 0, 0.04], [W - 0.02, 0.08, D - 0.04]);
  for (let i = 0; i < 3; i++) drawerFront(m, { x0: W - 0.47, x1: W - 0.07, y0: 0.12 + i * 0.2, y1: 0.12 + i * 0.2 + 0.18, zf: D - 0.042, mat: 'metalMedium', hMat: 'metal' });
  for (const z of [0.06, D - 0.1]) m.box('metalDark', [0.04, 0, z], [0.08, 0.72, z + 0.04]);
  m.box('metalDark', [0.04, 0.2, 0.06], [0.08, 0.24, D - 0.06]);
  m.rod('metalDark', [0.06, 0.6, 0.08], [W - 0.5, 0.6, 0.08], 0.03);
  m.box('metalDark', [0.04, 0.68, 0.06], [W - 0.5, 0.72, D - 0.06]);
  return m;
}

/** Gaming Desk: a black top on A-frame legs with a glowing blue strip under the front edge. */
function deskGaming() {
  const m = new Model('deskGaming');
  const W = 1.6, D = 0.75;
  m.box('metalDark', [0, 0.72, 0], [W, 0.75, D]);
  m.box('carpetBlue', [0.04, 0.705, D - 0.03], [W - 0.04, 0.72, D - 0.005]);
  m.box('carpetDarker', [0.5, 0.75, 0.3], [1.1, 0.754, 0.7]); // mouse mat
  for (const x of [0.12, W - 0.12]) {
    m.box('metalDark', [x - 0.04, 0, 0.04], [x + 0.04, 0.04, D - 0.04]);
    m.rod('metalDark', [x, 0.04, 0.1], [x, 0.72, 0.3], 0.06, 0.05);
    m.rod('metalDark', [x, 0.04, D - 0.1], [x, 0.72, D - 0.3], 0.06, 0.05);
  }
  m.box('metalDark', [0.12, 0.62, 0.06], [W - 0.12, 0.7, 0.1]);
  m.box('metalMedium', [W - 0.28, 0.5, 0.06], [W - 0.14, 0.62, 0.12]); // cup holder clamp
  m.cylY('glass', W - 0.21, 0.09, 0.64, 0.8, 0.025, 0.025, 8);
  return m;
}

/** Roll-Top Desk: a classic bureau with the tambour rolled back over a nest of pigeonholes. */
function deskRolltop() {
  const m = new Model('deskRolltop');
  const W = 1.3, D = 0.7, PW = 0.3;
  m.box('wood', [-0.01, 0.72, 0.18], [W + 0.01, 0.76, D]);
  for (const x0 of [0.02, W - 0.02 - PW]) {
    m.box('woodDark', [x0, 0, 0.04], [x0 + PW, 0.06, D - 0.04]);
    m.box('wood', [x0, 0.06, 0.06], [x0 + PW, 0.72, D - 0.022]);
    for (let i = 0; i < 3; i++) drawerFront(m, { x0: x0 + 0.02, x1: x0 + PW - 0.02, y0: 0.09 + i * 0.2, y1: 0.09 + i * 0.2 + 0.18, zf: D - 0.022, knobs: true });
  }
  m.box('woodDark', [PW + 0.02, 0.62, 0.06], [W - PW - 0.02, 0.72, D - 0.04]);
  m.box('woodDark', [PW + 0.02, 0.06, 0.06], [W - PW - 0.02, 0.62, 0.1]);
  // hood: back wall, sides, a tambour block and pigeonholes
  m.box('woodDark', [0.02, 0.76, 0.02], [W - 0.02, 1.15, 0.06]);
  for (const x of [0.02, W - 0.06]) m.box('wood', [x, 0.76, 0.02], [x + 0.04, 1.15, 0.36]);
  m.box('wood', [0, 1.15, 0], [W, 1.19, 0.4]);
  m.box('woodDark', [0.06, 1.05, 0.06], [W - 0.06, 1.15, 0.38]);
  m.box('wood', [0.06, 0.92, 0.06], [W - 0.06, 0.94, 0.3]);
  for (const x of [0.4, 0.65, 0.9]) m.box('wood', [x - 0.01, 0.76, 0.06], [x + 0.01, 1.05, 0.3]);
  m.box('carpetWhite', [0.12, 0.76, 0.1], [0.34, 0.9, 0.2]);
  m.box('carpetBlue', [0.7, 0.76, 0.1], [0.88, 0.88, 0.2]);
  return m;
}


/** Mid-Century Bedside Table: two drawers in a small case on splayed legs. */
function bedsideMidCentury() {
  const m = new Model('bedsideMidCentury');
  const W = 0.5, D = 0.4;
  m.box('wood', [-0.01, 0.5, -0.005], [W + 0.01, 0.53, D + 0.005]);
  m.box('woodDark', [0.02, 0.22, 0.02], [W - 0.02, 0.5, D - 0.022]);
  for (let i = 0; i < 2; i++) drawerFront(m, { x0: 0.03, x1: W - 0.03, y0: 0.24 + i * 0.13, y1: 0.24 + i * 0.13 + 0.12, zf: D - 0.022, knobs: true });
  for (const [x, z, sx, sz] of [[0.07, 0.07, -1, -1], [W - 0.07, 0.07, 1, -1], [0.07, D - 0.07, -1, 1], [W - 0.07, D - 0.07, 1, 1]]) {
    m.rod('woodDark', [x + sx * 0.04, 0.01, z + sz * 0.03], [x, 0.23, z], 0.04);
  }
  return m;
}

/** Crate Bedside Table: two slatted fruit crates stacked, one turned a quarter. */
function bedsideCrate() {
  const m = new Model('bedsideCrate');
  const W = 0.45, D = 0.4;
  for (const [y0, flip] of [[0, false], [0.25, true]]) {
    for (const z of [0, D - 0.02]) for (let i = 0; i < 3; i++) m.box('wood', [0, y0 + 0.02 + i * 0.075, z], [W, y0 + 0.02 + i * 0.075 + 0.06, z + 0.02]);
    for (const x of [0, W - 0.02]) for (let i = 0; i < 3; i++) m.box('wood', [x, y0 + 0.02 + i * 0.075, 0.02], [x + 0.02, y0 + 0.02 + i * 0.075 + 0.06, D - 0.02]);
    for (const [x, z] of [[0, 0], [W - 0.04, 0], [0, D - 0.04], [W - 0.04, D - 0.04]]) m.box('woodDark', [x, y0, z], [x + 0.04, y0 + 0.25, z + 0.04]);
    m.box('woodDark', [0.02, y0 + 0.01, 0.02], [W - 0.02, y0 + 0.02, D - 0.02]);
    if (flip) m.box('carpetBlue', [0.1, y0 + 0.02, 0.1], [0.3, y0 + 0.1, 0.25]);
  }
  m.box('wood', [-0.01, 0.5, -0.01], [W + 0.01, 0.52, D + 0.01]);
  return m;
}

/** Bar Table: a tall round top on a slim column with a brass foot ring. */
function barTableHigh() {
  const m = new Model('barTableHigh');
  const c = 0.3;
  m.cylY('metalDark', c, c, 0, 0.03, 0.26, 0.24);
  m.cylY('metalDark', c, c, 0.03, 1.0, 0.04, 0.04, 8);
  m.cylY('metal', c, c, 0.22, 0.25, 0.2, 0.2);
  m.cylY('metalDark', c, c, 1.0, 1.02, 0.12, 0.2);
  m.cylY('wood', c, c, 1.02, 1.06, 0.3, 0.3);
  return m;
}

/** Card Table: a folding table with a green felt top, wooden rim and corner cup wells. */
function cardTable() {
  const m = new Model('cardTable');
  const S = 0.85;
  m.box('woodDark', [0, 0.7, 0], [S, 0.74, 0.05]); m.box('woodDark', [0, 0.7, S - 0.05], [S, 0.74, S]);
  m.box('woodDark', [0, 0.7, 0.05], [0.05, 0.74, S - 0.05]); m.box('woodDark', [S - 0.05, 0.7, 0.05], [S, 0.74, S - 0.05]);
  m.box('plant', [0.05, 0.7, 0.05], [S - 0.05, 0.735, S - 0.05]);
  for (const [x, z] of [[0.005, 0.005], [S - 0.085, 0.005], [0.005, S - 0.085], [S - 0.085, S - 0.085]]) m.box('wood', [x, 0.74, z], [x + 0.08, 0.755, z + 0.08]);
  legs4(m, 'wood', 0.04, 0.04, S - 0.04, S - 0.04, 0.7, 0.045);
  apron(m, 'wood', 0.04, 0.04, S - 0.04, S - 0.04, 0.6, 0.7, 0.02);
  return m;
}

/** Island Table: a butcher-block top on a three-door cabinet with a towel rail at one end. */
function islandTable() {
  const m = new Model('islandTable');
  const W = 1.6, D = 0.8;
  m.box('wood', [0, 0.86, 0], [W, 0.92, D]);
  m.box('woodDark', [0.06, 0, 0.06], [W - 0.06, 0.08, D - 0.06]);
  m.box('woodDark', [0.06, 0.08, 0.06], [W - 0.06, 0.86, D - 0.05]);
  for (let i = 0; i < 3; i++) {
    const x0 = 0.1 + i * 0.467;
    m.box('wood', [x0, 0.12, D - 0.05], [x0 + 0.447, 0.82, D - 0.03]);
    knob(m, 'metal', x0 + (i === 1 ? 0.07 : 0.37), 0.55, D - 0.03);
  }
  m.rod('metal', [W + 0.05, 0.62, 0.15], [W + 0.05, 0.62, D - 0.15], 0.025);
  for (const z of [0.15, D - 0.15]) m.rod('metal', [W - 0.02, 0.62, z], [W + 0.05, 0.62, z], 0.02);
  m.box('carpetWhite', [W + 0.035, 0.3, 0.3], [W + 0.06, 0.62, 0.5]); // a towel
  return m;
}

/** Workbench: a thick top with a vise, a lower shelf and a pegboard of tools behind. */
function workbench() {
  const m = new Model('workbench');
  const W = 1.6, D = 0.65;
  m.box('wood', [0, 0.84, 0.06], [W, 0.9, D]);
  legs4(m, 'woodDark', 0.06, 0.1, W - 0.06, D - 0.04, 0.84, 0.08);
  m.box('wood', [0.06, 0.2, 0.1], [W - 0.06, 0.24, D - 0.04]);
  m.box('woodDark', [0.06, 0.74, 0.1], [W - 0.06, 0.84, 0.14]);
  m.box('woodDark', [0.1, 0.9, 0], [W - 0.1, 1.5, 0.03]);
  m.box('metalDark', [0.1, 0.9, D - 0.14], [0.26, 1.0, D - 0.02]); // vise
  m.rod('metal', [0.04, 0.95, D - 0.08], [0.1, 0.95, D - 0.08], 0.025);
  m.box('metalDark', [0.26, 0.9, D - 0.1], [0.3, 0.97, D - 0.04]);
  for (const [x, y, w, h, mat] of [[0.3, 1.3, 0.04, 0.16, 'metal'], [0.5, 1.25, 0.04, 0.22, 'metalDark'], [0.75, 1.32, 0.12, 0.05, 'metal'], [1.0, 1.2, 0.04, 0.28, 'metal'], [1.25, 1.28, 0.1, 0.12, 'carpet']]) {
    m.box(mat, [x, y, 0.03], [x + w, y + h, 0.06]);
  }
  m.box('carpet', [0.9, 0.9, 0.2], [1.1, 0.96, 0.4]); // a toolbox
  return m;
}


/** Open wardrobe shell (back, sides, top, bottom) the doors close; the hanging rail and clothes are the static `anim:interior`. */
const wardrobeShell = (m, { W, D, H, plinth, body = 'wood', plinthMat = 'woodDark', top = 0.05 }) => {
  m.box(plinthMat, [0.02, 0, 0.02], [W - 0.02, plinth, D - 0.02]);
  m.box('woodDark', [0.02, plinth, 0], [W - 0.02, H - top, 0.03]);
  for (const x of [0, W - 0.04]) m.box(body, [x, plinth, 0.03], [x + 0.04, H - top, D]);
  m.box(body, [0, H - top, 0], [W, H, D]);
  m.box(body, [0.04, plinth, 0.03], [W - 0.04, plinth + 0.04, D]);
};
const wardrobeInterior = (m, { W, D, H, plinth, rail = H - 0.22, shelfY = null }) => {
  const i = m.part('anim:interior');
  i.rod('metal', [0.06, rail, D / 2], [W - 0.06, rail, D / 2], 0.03);
  const mats = ['carpetBlue', 'carpetWhite', 'carpet', 'carpetDarker', 'carpetBlue', 'carpetWhite'];
  const n = Math.floor((W - 0.2) / 0.1);
  for (let k = 0; k < n; k++) i.box(mats[k % mats.length], [0.1 + k * 0.1, rail - 0.62 - (k % 2) * 0.1, D / 2 - 0.12], [0.1 + k * 0.1 + 0.05, rail - 0.03, D / 2 + 0.12]);
  if (shelfY) i.box('woodDark', [0.04, shelfY, 0.03], [W - 0.04, shelfY + 0.025, D - 0.05]);
  return i;
};
/** Drawer carcass with a grid of drawers. rows count from the top. `animate` lists [row, col] that slide out (part `anim:drawerN`, in order). */
const dresserCore = (m, { W, D, H, LEG, cols, rows, mat = 'wood', frame = 'woodDark', legMat = 'woodDark', front = 'wood', hMat = 'metal', knobs = false, animate = [], taper = false, TOP = 0.04, frontMat = null }) => {
  const S = 0.03, zf = D - 0.022;
  const yb = LEG + 0.03, yt = H - TOP, rh = (yt - yb) / rows, cw = (W - 2 * S) / cols;
  m.box(frame, [0, LEG, 0], [W, yt, 0.02]);
  for (const x of [0, W - S]) m.box(mat, [x, LEG, 0.02], [x + S, yt, zf]);
  m.box(mat, [-0.012, yt, -0.01], [W + 0.012, H, D + 0.01]);
  m.box(mat, [S, LEG, 0.02], [W - S, yb, zf]);
  for (let r = 1; r < rows; r++) m.box(mat, [S, yb + (rows - r) * rh - 0.006, 0.02], [W - S, yb + (rows - r) * rh + 0.006, zf]);
  for (let c = 1; c < cols; c++) m.box(mat, [S + c * cw - 0.006, yb, 0.02], [S + c * cw + 0.006, yt, zf]);
  if (LEG > 0) {
    for (const [x, z, sx, sz] of [[0.05, 0.05, -1, -1], [W - 0.05, 0.05, 1, -1], [0.05, D - 0.05, -1, 1], [W - 0.05, D - 0.05, 1, 1]]) {
      if (taper) m.rod(legMat, [x + sx * 0.03, 0, z + sz * 0.025], [x, LEG + 0.01, z], 0.045);
      else m.box(legMat, [x - 0.03, 0, z - 0.03], [x + 0.03, LEG + 0.01, z + 0.03]);
    }
  }
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const spec = { x0: S + c * cw + 0.008, x1: S + (c + 1) * cw - 0.008, y0: yb + (rows - 1 - r) * rh + 0.008, y1: yb + (rows - r) * rh - 0.008, zf, mat: frontMat ? frontMat(r, c) : front, hMat, knobs };
    if (animate.some(([ar, ac]) => ar === r && ac === c)) {
      n++;
      drawerPart(m, `anim:drawer${n}`, { ...spec, depth: D * 0.72, mat: spec.mat, fill: CLOTHES.slice(((r + c) % 2) * 2, ((r + c) % 2) * 2 + 2).map(([a, b, c2, d]) => [a, Math.min(b, (spec.x1 - spec.x0) * 0.1), Math.min(c2, (spec.x1 - spec.x0) * 0.45), d]) });
    } else drawerFront(m, spec);
  }
};

/** Panelled Oak Wardrobe: two tall panelled doors under a crown moulding. */
function wardrobeClassic() {
  const m = new Model('wardrobeClassic');
  const W = 0.95, D = 0.55, H = 1.9, P = 0.08;
  wardrobeShell(m, { W, D, H, plinth: P });
  m.box('woodDark', [-0.015, H - 0.05, -0.01], [W + 0.015, H - 0.02, D + 0.02]);
  m.box('wood', [-0.015, H, -0.01], [W + 0.015, H + 0.03, D + 0.02]);
  m.box('woodDark', [-0.01, P, D - 0.01], [W + 0.01, P + 0.03, D + 0.01]);
  wardrobeInterior(m, { W, D, H, plinth: P });
  for (const left of [true, false]) {
    const x0 = left ? 0.04 : W / 2 + 0.004, x1 = left ? W / 2 - 0.004 : W - 0.04;
    const d = doorPart(m, left ? 'anim:doorL' : 'anim:doorR', { x0, x1, y0: P + 0.04, y1: H - 0.07, zf: D, left });
    d.box('woodDark', [x0 + 0.06, P + 0.12, D + 0.025], [x1 - 0.06, H - 0.15, D + 0.033]);
    d.box('wood', [x0 + 0.1, P + 0.16, D + 0.033], [x1 - 0.1, H - 0.19, D + 0.04]);
  }
  return m;
}

/** Pine Wardrobe: a plain two-door cupboard with a drawer in the base and round knobs. */
function wardrobePine() {
  const m = new Model('wardrobePine');
  const W = 0.9, D = 0.5, H = 1.75, P = 0.04;
  wardrobeShell(m, { W, D, H, plinth: P, plinthMat: 'wood' });
  drawerFront(m, { x0: 0.05, x1: W - 0.05, y0: 0.07, y1: 0.27, zf: D - 0.022, knobs: true, hMat: 'woodDark' });
  m.box('wood', [0.04, 0.04, 0.03], [W - 0.04, 0.3, D - 0.022]);
  wardrobeInterior(m, { W, D, H, plinth: 0.3, rail: H - 0.2 });
  for (const left of [true, false]) {
    const x0 = left ? 0.04 : W / 2 + 0.004, x1 = left ? W / 2 - 0.004 : W - 0.04;
    const d = doorPart(m, left ? 'anim:doorL' : 'anim:doorR', { x0, x1, y0: 0.3, y1: H - 0.06, zf: D, left, mat: 'woodDark', hMat: 'wood' });
    d.box('wood', [x0 + 0.05, 0.4, D + 0.025], [x1 - 0.05, H - 0.16, D + 0.032]);
  }
  return m;
}

/** Triple Wardrobe: white lacquer, two hinged centre doors between fixed mirror panels. */
function wardrobeTriple() {
  const m = new Model('wardrobeTriple');
  const W = 1.9, D = 0.6, H = 2.0, P = 0.06;
  wardrobeShell(m, { W, D, H, plinth: P, body: 'metalLight', plinthMat: 'metalDark' });
  wardrobeInterior(m, { W, D, H, plinth: P, rail: H - 0.25, shelfY: H - 0.45 });
  for (const [x0, x1] of [[0.04, 0.5], [W - 0.5, W - 0.04]]) { // fixed mirror panels
    m.box('metalLight', [x0, P + 0.04, D - 0.04], [x1, H - 0.07, D]);
    m.box('glass', [x0 + 0.04, P + 0.1, D], [x1 - 0.04, H - 0.13, D + 0.008]);
  }
  for (const left of [true, false]) {
    const x0 = left ? 0.504 : W / 2 + 0.002, x1 = left ? W / 2 - 0.002 : W - 0.504;
    const d = doorPart(m, left ? 'anim:doorL' : 'anim:doorR', { x0, x1, y0: P + 0.04, y1: H - 0.07, zf: D, left, mat: 'metalLight', hMat: 'metalDark' });
    d.box('wood', [x0 + 0.04, P + 0.2, D + 0.025], [x1 - 0.04, P + 0.24, D + 0.031]);
    d.box('wood', [x0 + 0.04, H - 0.28, D + 0.025], [x1 - 0.04, H - 0.24, D + 0.031]);
  }
  return m;
}

/** Sliding-Door Wardrobe: four overlapping panels on two tracks (the doors do not swing). */
function wardrobeSliding() {
  const m = new Model('wardrobeSliding');
  const W = 1.9, D = 0.65, H = 2.1, P = 0.05;
  wardrobeShell(m, { W, D, H, plinth: P, body: 'wood' });
  m.box('metalDark', [0.04, P + 0.04, D - 0.1], [W - 0.04, P + 0.06, D - 0.02]);
  m.box('metalDark', [0.04, H - 0.11, D - 0.1], [W - 0.04, H - 0.09, D - 0.02]);
  const pw = (W - 0.08) / 4 + 0.03;
  for (let i = 0; i < 4; i++) {
    const x0 = 0.04 + i * ((W - 0.08 - pw) / 3), z0 = i % 2 === 0 ? D - 0.08 : D - 0.04;
    const mat = i % 2 === 0 ? 'wood' : 'woodDark';
    m.box(mat, [x0, P + 0.06, z0], [x0 + pw, H - 0.11, z0 + 0.035]);
    m.box('metalDark', [x0 + pw / 2 - 0.01, 0.9, z0 + 0.035], [x0 + pw / 2 + 0.01, 1.3, z0 + 0.05]);
  }
  return m;
}

/** Carved Armoire: ball feet, arched crown, carved door panels and brass pulls. */
function armoireCarved() {
  const m = new Model('armoireCarved');
  const W = 0.95, D = 0.55, H = 2.0, P = 0.12;
  for (const [x, z] of [[0.08, 0.08], [W - 0.08, 0.08], [0.08, D - 0.08], [W - 0.08, D - 0.08]]) m.cylY('woodDark', x, z, 0, P, 0.045, 0.06, 8);
  wardrobeShell(m, { W, D, H: 1.88, plinth: P, plinthMat: 'woodDark' });
  m.box('woodDark', [-0.02, 1.88, -0.015], [W + 0.02, 1.93, D + 0.025]);
  m.box('wood', [0.1, 1.93, 0.05], [W - 0.1, 1.98, D - 0.05]);
  m.box('wood', [0.28, 1.98, 0.1], [W - 0.28, 2.03, D - 0.1]);
  m.box('woodDark', [-0.01, P, D - 0.012], [W + 0.01, P + 0.04, D + 0.012]);
  wardrobeInterior(m, { W, D, H: 1.88, plinth: P, rail: 1.65 });
  for (const left of [true, false]) {
    const x0 = left ? 0.04 : W / 2 + 0.004, x1 = left ? W / 2 - 0.004 : W - 0.04;
    const d = doorPart(m, left ? 'anim:doorL' : 'anim:doorR', { x0, x1, y0: P + 0.06, y1: 1.84, zf: D, left, mat: 'wood', hMat: 'metal' });
    d.box('woodDark', [x0 + 0.05, P + 0.14, D + 0.025], [x1 - 0.05, 1.7, D + 0.035]);
    d.box('wood', [x0 + 0.1, P + 0.2, D + 0.035], [x1 - 0.1, 1.64, D + 0.043]);
    d.box('metal', [(x0 + x1) / 2 - 0.05, 0.95, D + 0.043], [(x0 + x1) / 2 + 0.05, 1.05, D + 0.05]);
  }
  return m;
}

/** Clothes Rail: an open steel rail on A-frame ends with a hanging row and a shoe shelf. */
function clothesRail() {
  const m = new Model('clothesRail');
  const W = 1.5, D = 0.5;
  for (const x of [0.05, W - 0.05]) {
    m.rod('metalDark', [x, 0, 0.04], [x, 1.7, D / 2], 0.04);
    m.rod('metalDark', [x, 0, D - 0.04], [x, 1.7, D / 2], 0.04);
    m.box('metalDark', [x - 0.02, 0, 0.03], [x + 0.02, 0.03, D - 0.03]);
  }
  m.rod('metal', [0.05, 1.65, D / 2], [W - 0.05, 1.65, D / 2], 0.035);
  m.box('wood', [0.08, 0.22, 0.08], [W - 0.08, 0.25, D - 0.08]);
  const mats = ['carpetBlue', 'carpetWhite', 'carpet', 'carpetDarker', 'carpetBlue', 'carpetWhite', 'carpet', 'carpetDarker', 'carpetBlue', 'carpetWhite'];
  for (let k = 0; k < 10; k++) m.box(mats[k], [0.14 + k * 0.125, 0.95 - (k % 3) * 0.08, D / 2 - 0.1], [0.14 + k * 0.125 + 0.05, 1.63, D / 2 + 0.1]);
  for (let k = 0; k < 4; k++) m.box('woodDark', [0.2 + k * 0.3, 0.25, 0.15], [0.2 + k * 0.3 + 0.22, 0.31, 0.38]); // shoes
  return m;
}

/** Six-Drawer Dresser: two columns of three drawers; the top two rows slide out. */
function dresserSixDrawer() {
  const m = new Model('dresserSixDrawer');
  dresserCore(m, { W: 1.5, D: 0.5, H: 0.85, LEG: 0.1, cols: 2, rows: 3, animate: [[0, 0], [0, 1], [1, 0], [1, 1]] });
  return m;
}

/** Tallboy: five narrow drawers in a tall case; the top three slide out. */
function dresserTallboy() {
  const m = new Model('dresserTallboy');
  dresserCore(m, { W: 0.8, D: 0.45, H: 1.3, LEG: 0.08, cols: 1, rows: 5, knobs: true, animate: [[0, 0], [1, 0], [2, 0]] });
  return m;
}

/** Mid-Century Sideboard Dresser: low and long on tapered legs, drawers either side of a panel. */
function dresserMidCentury() {
  const m = new Model('dresserMidCentury');
  dresserCore(m, { W: 1.5, D: 0.45, H: 0.75, LEG: 0.2, cols: 3, rows: 2, taper: true, TOP: 0.035, animate: [[0, 0], [1, 0], [0, 2], [1, 2]], frontMat: (r, c) => (c === 1 ? 'woodDark' : 'wood') });
  return m;
}

/** Candy-Coloured Kids' Dresser: three bright drawers with round knobs; the top two slide out. */
function dresserCandy() {
  const m = new Model('dresserCandy');
  dresserCore(m, { W: 0.85, D: 0.45, H: 0.95, LEG: 0.07, cols: 1, rows: 3, knobs: true, hMat: 'carpet', front: 'carpetBlue', animate: [[0, 0], [1, 0]] });
  return m;
}

/** Dresser with Mirror: four wide drawers (the top row slides out) under a framed mirror. */
function dresserMirror() {
  const m = new Model('dresserMirror');
  const W = 1.5, D = 0.5;
  dresserCore(m, { W, D, H: 0.85, LEG: 0.12, cols: 2, rows: 2, animate: [[0, 0], [0, 1]], TOP: 0.05 });
  m.box('glass', [0.25, 1.0, 0.07], [W - 0.25, 1.65, 0.078]);
  m.box('woodDark', [0.2, 0.95, 0.05], [W - 0.2, 1.0, 0.09]);
  m.box('woodDark', [0.2, 1.65, 0.05], [W - 0.2, 1.72, 0.09]);
  for (const x of [0.2, W - 0.25]) m.box('woodDark', [x, 1.0, 0.05], [x + 0.05, 1.65, 0.09]);
  for (const x of [0.12, W - 0.15]) m.box('woodDark', [x, 0.85, 0.05], [x + 0.03, 1.0, 0.09]);
  m.box('carpetWhite', [1.0, 0.85, 0.15], [1.3, 0.88, 0.32]);
  m.cylY('carpetBlue', 0.3, 0.2, 0.85, 0.95, 0.03, 0.025, 8);
  return m;
}


const BOOK_MATS = ['carpet', 'carpetBlue', 'carpetWhite', 'carpetDarker', 'carpetBlue', 'carpet'];
/** A row of upright books on a shelf at height y, between x0 and x1 and depth z0..z1. */
const bookRow = (m, x0, x1, y, z0, z1, n = 6, tall = 0.24, shift = 0) => {
  const w = (x1 - x0) / n;
  for (let k = 0; k < n; k++) m.box(BOOK_MATS[(k + shift) % BOOK_MATS.length], [x0 + k * w + 0.004, y, z0], [x0 + (k + 1) * w - 0.004, y + tall - ((k + shift) % 3) * 0.04, z1]);
};
/** Open-fronted carcass (back, sides, top, bottom, shelves). shelves: heights of the loose shelves. */
const bookcaseShell = (m, { W, D, H, T = 0.03, shelves = [], mat = 'wood', back = 'woodDark', base = 0 }) => {
  m.box(back, [0, base, 0], [W, H, 0.02]);
  for (const x of [0, W - T]) m.box(mat, [x, base, 0.02], [x + T, H, D]);
  m.box(mat, [T, H - T, 0.02], [W - T, H, D]);
  m.box(mat, [T, base, 0.02], [W - T, base + T, D]);
  for (const y of shelves) m.box(mat, [T, y, 0.02], [W - T, y + T, D - 0.01]);
};

/** Blanket chest: the lid (part `anim:lid`) hinges at the back and lifts to show folded blankets (`anim:interior`). */
function chestBlanket() {
  const m = new Model('chestBlanket');
  const W = 0.95, D = 0.5;
  for (const [x, z] of [[0.03, 0.03], [W - 0.09, 0.03], [0.03, D - 0.09], [W - 0.09, D - 0.09]]) m.box('woodDark', [x, 0, z], [x + 0.06, 0.07, z + 0.06]);
  m.box('wood', [0, 0.07, 0], [W, 0.1, D]);
  m.box('wood', [0, 0.07, 0], [W, 0.4, 0.03]); m.box('wood', [0, 0.07, D - 0.03], [W, 0.4, D]);
  for (const x of [0, W - 0.03]) m.box('wood', [x, 0.07, 0.03], [x + 0.03, 0.4, D - 0.03]);
  for (const x of [0.12, W - 0.2]) m.box('metalDark', [x, 0.07, D], [x + 0.08, 0.4, D + 0.012]);
  const i = m.part('anim:interior');
  i.box('carpetBlue', [0.05, 0.1, 0.05], [W - 0.05, 0.22, D - 0.05]);
  i.box('carpetWhite', [0.05, 0.22, 0.05], [0.5, 0.3, D - 0.05]);
  i.box('carpet', [0.5, 0.22, 0.05], [W - 0.05, 0.32, D - 0.05]);
  const lid = m.part('anim:lid', [W / 2, 0.4, 0.02]);
  lid.box('woodDark', [-0.012, 0.4, -0.005], [W + 0.012, 0.46, D + 0.012]);
  for (const x of [0.12, W - 0.2]) lid.box('metalDark', [x, 0.46, -0.005], [x + 0.08, 0.472, D + 0.012]);
  lid.box('metal', [W / 2 - 0.04, 0.34, D + 0.012], [W / 2 + 0.04, 0.44, D + 0.03]);
  return m;
}

/** Steamer trunk: a ribbed travelling trunk with a stepped lid, brass corners and carry handles. */
function trunkSteamer() {
  const m = new Model('trunkSteamer');
  const W = 0.9, D = 0.5;
  for (const [x, z] of [[0.02, 0.02], [W - 0.08, 0.02], [0.02, D - 0.08], [W - 0.08, D - 0.08]]) m.box('metalDark', [x, 0, z], [x + 0.06, 0.07, z + 0.06]);
  m.box('woodDark', [0, 0.07, 0], [W, 0.1, D]);
  m.box('woodDark', [0, 0.07, 0], [W, 0.38, 0.03]); m.box('woodDark', [0, 0.07, D - 0.03], [W, 0.38, D]);
  for (const x of [0, W - 0.03]) m.box('woodDark', [x, 0.07, 0.03], [x + 0.03, 0.38, D - 0.03]);
  for (let k = 0; k < 6; k++) m.box('wood', [0.08 + k * 0.14, 0.07, D], [0.12 + k * 0.14, 0.38, D + 0.012]);
  for (const x of [0, W - 0.05]) { m.box('metal', [x, 0.07, D - 0.01], [x + 0.05, 0.12, D + 0.02]); m.box('metal', [x, 0.33, D - 0.01], [x + 0.05, 0.38, D + 0.02]); }
  for (const x of [-0.03, W]) m.box('metalDark', [x, 0.24, 0.15], [x + 0.03, 0.28, D - 0.15]);
  const i = m.part('anim:interior');
  i.box('carpetWhite', [0.05, 0.1, 0.05], [W - 0.05, 0.28, D - 0.05]);
  i.box('carpetBlue', [0.05, 0.28, 0.05], [0.4, 0.34, D - 0.05]);
  const lid = m.part('anim:lid', [W / 2, 0.38, 0.02]);
  lid.box('wood', [-0.01, 0.38, -0.005], [W + 0.01, 0.46, D + 0.01]);
  lid.box('wood', [0.06, 0.46, 0.04], [W - 0.06, 0.52, D - 0.04]);
  for (const x of [0.12, W - 0.2]) { lid.box('metal', [x, 0.46, -0.005], [x + 0.08, 0.465, D + 0.01]); }
  lid.box('metal', [W / 2 - 0.05, 0.3, D + 0.01], [W / 2 + 0.05, 0.42, D + 0.03]);
  return m;
}

/** Cedar hope chest: a low chest with a carved front panel, bun feet and a flat lid. */
function chestCedar() {
  const m = new Model('chestCedar');
  const W = 0.95, D = 0.45;
  for (const [x, z] of [[0.06, 0.06], [W - 0.06, 0.06], [0.06, D - 0.06], [W - 0.06, D - 0.06]]) m.cylY('woodDark', x, z, 0, 0.08, 0.04, 0.05, 8);
  m.box('wood', [0, 0.08, 0], [W, 0.1, D]);
  m.box('wood', [0, 0.08, 0], [W, 0.38, 0.03]); m.box('wood', [0, 0.08, D - 0.03], [W, 0.38, D]);
  for (const x of [0, W - 0.03]) m.box('wood', [x, 0.08, 0.03], [x + 0.03, 0.38, D - 0.03]);
  m.box('woodDark', [0.08, 0.14, D], [W - 0.08, 0.34, D + 0.012]);
  m.box('wood', [0.14, 0.18, D + 0.012], [W - 0.14, 0.3, D + 0.02]);
  const i = m.part('anim:interior');
  i.box('carpetWhite', [0.05, 0.1, 0.05], [W - 0.05, 0.24, D - 0.05]);
  i.box('carpet', [0.05, 0.24, 0.05], [0.45, 0.3, D - 0.05]);
  const lid = m.part('anim:lid', [W / 2, 0.38, 0.015]);
  lid.box('woodDark', [-0.012, 0.38, -0.005], [W + 0.012, 0.44, D + 0.012]);
  lid.box('wood', [0.04, 0.44, 0.04], [W - 0.04, 0.46, D - 0.04]);
  lid.box('metal', [W / 2 - 0.035, 0.32, D + 0.012], [W / 2 + 0.035, 0.42, D + 0.028]);
  return m;
}

/** Cube Shelves: a three by three grid of open cubes with a few baskets and books. */
function bookcaseCube() {
  const m = new Model('bookcaseCube');
  const W = 0.95, D = 0.38, H = 1.05, T = 0.03;
  bookcaseShell(m, { W, D, H, T, base: 0.04, shelves: [0.04 + (H - 0.04) / 3, 0.04 + 2 * (H - 0.04) / 3] });
  m.box('woodDark', [0.02, 0, 0.02], [W - 0.02, 0.04, D - 0.02]);
  const cw = (W - 2 * T) / 3;
  for (const x of [T + cw, T + 2 * cw]) m.box('wood', [x - T / 2, 0.04, 0.02], [x + T / 2, H, D - 0.01]);
  const rows = [0.04 + T, 0.04 + (H - 0.04) / 3 + T, 0.04 + 2 * (H - 0.04) / 3 + T];
  m.box('carpetBlue', [T + 0.03, rows[0], 0.08], [T + cw - 0.03, rows[0] + 0.24, D - 0.04]);
  m.box('carpet', [T + 2 * cw + 0.03, rows[1], 0.08], [T + 3 * cw - 0.03, rows[1] + 0.22, D - 0.04]);
  bookRow(m, T + cw + 0.02, T + 2 * cw - 0.02, rows[2], 0.06, D - 0.06, 5, 0.26);
  bookRow(m, T + 0.02, T + cw - 0.02, rows[1], 0.06, D - 0.06, 4, 0.24, 2);
  m.box('carpetWhite', [T + 2 * cw + 0.04, rows[2], 0.1], [T + 3 * cw - 0.04, rows[2] + 0.12, D - 0.08]);
  return m;
}

/** Ladder Shelf: a leaning ladder frame with five shelves that get shallower towards the top. */
function bookcaseLadder() {
  const m = new Model('bookcaseLadder');
  const W = 0.8, D = 0.5, H = 1.8;
  for (const x of [0.02, W - 0.06]) {
    m.rod('wood', [x + 0.02, 0, D - 0.03], [x + 0.02, H, 0.1], 0.04, 0.045);
    m.box('woodDark', [x, 0, 0.02], [x + 0.04, H, 0.05]); // upright against the wall
  }
  for (let i = 0; i < 5; i++) {
    const y = 0.28 + i * 0.35, zf = D - 0.03 - (D - 0.13) * (y / H);
    m.box('wood', [0.02, y, 0.02], [W - 0.02, y + 0.03, zf + 0.03]);
    if (i < 4) bookRow(m, 0.12 + (i % 2) * 0.1, 0.48 + (i % 2) * 0.2, y + 0.03, 0.06, Math.max(0.12, zf - 0.04), 4, 0.22, i);
  }
  return m;
}

/** Glazed Library Bookcase: tall, with two glass-fronted doors that swing open (hinges on the outer edges). */
function bookcaseGlass() {
  const m = new Model('bookcaseGlass');
  const W = 0.95, D = 0.38, H = 1.9, P = 0.08;
  m.box('woodDark', [0.02, 0, 0.02], [W - 0.02, P, D - 0.02]);
  bookcaseShell(m, { W, D, H, base: P, shelves: [0.5, 0.88, 1.26, 1.62] });
  m.box('woodDark', [-0.015, H, -0.01], [W + 0.015, H + 0.04, D + 0.02]);
  for (const [i, y] of [P + 0.03, 0.53, 0.91, 1.29].entries()) bookRow(m, 0.06, W - 0.06, y, 0.06, D - 0.08, 7 - (i % 2), 0.26 - (i % 2) * 0.04, i * 2);
  bookRow(m, 0.06, 0.5, 1.65, 0.06, D - 0.08, 4, 0.2, 1);
  for (const left of [true, false]) {
    const x0 = left ? 0.03 : W / 2 + 0.003, x1 = left ? W / 2 - 0.003 : W - 0.03;
    doorPart(m, left ? 'anim:doorL' : 'anim:doorR', { x0, x1, y0: P + 0.02, y1: H - 0.03, zf: D, left, mat: 'woodDark', hMat: 'metal', glass: true });
  }
  return m;
}

/** Low Wide Bookcase: a waist-high unit with three cubbies along its length. */
function bookcaseLowWide() {
  const m = new Model('bookcaseLowWide');
  const W = 1.9, D = 0.35, H = 0.8, T = 0.03;
  bookcaseShell(m, { W, D, H, T, base: 0.06, shelves: [0.43] });
  m.box('woodDark', [0.04, 0, 0.04], [W - 0.04, 0.06, D - 0.04]);
  for (const x of [W / 3, 2 * W / 3]) m.box('wood', [x - T / 2, 0.06, 0.02], [x + T / 2, H, D - 0.01]);
  bookRow(m, 0.05, W / 3 - 0.04, 0.09, 0.06, D - 0.06, 6, 0.28);
  bookRow(m, 0.05, W / 3 - 0.04, 0.46, 0.06, D - 0.06, 5, 0.26, 1);
  bookRow(m, W / 3 + 0.04, 2 * W / 3 - 0.04, 0.46, 0.06, D - 0.06, 6, 0.28, 2);
  m.box('carpetBlue', [2 * W / 3 + 0.06, 0.09, 0.08], [W - 0.08, 0.3, D - 0.05]);
  m.box('carpet', [W / 3 + 0.06, 0.09, 0.08], [2 * W / 3 - 0.08, 0.28, D - 0.05]);
  return m;
}

/** Pipe Bookcase: five plank shelves between black steel posts. */
function bookcaseIndustrial() {
  const m = new Model('bookcaseIndustrial');
  const W = 1.5, D = 0.35, H = 1.9;
  for (const x of [0.02, W / 2 - 0.02, W - 0.06]) for (const z of [0.03, D - 0.07]) m.box('metalDark', [x, 0, z], [x + 0.04, H, z + 0.04]);
  for (let i = 0; i < 5; i++) {
    const y = 0.14 + i * 0.4;
    m.box('wood', [0, y, 0], [W, y + 0.04, D]);
    m.rod('metalDark', [0.04, y - 0.02, 0.05], [W - 0.04, y - 0.02, 0.05], 0.02);
    if (i < 4) { bookRow(m, 0.08 + (i % 2) * 0.3, 0.62 + (i % 2) * 0.3, y + 0.04, 0.06, D - 0.06, 6, 0.28, i); if (i % 2) m.box('carpetBlue', [0.9, y + 0.04, 0.08], [1.4, y + 0.3, D - 0.06]); }
  }
  m.box('wood', [0, 1.74, 0], [W, 1.78, D]);
  return m;
}

/** Mid-Century Bookcase: staggered open shelves in teak on four tapered legs. */
function bookcaseMidCentury() {
  const m = new Model('bookcaseMidCentury');
  const W = 0.9, D = 0.35, H = 1.4, L = 0.28;
  for (const [x, z, sx, sz] of [[0.08, 0.06, -1, -1], [W - 0.08, 0.06, 1, -1], [0.08, D - 0.06, -1, 1], [W - 0.08, D - 0.06, 1, 1]]) m.rod('woodDark', [x + sx * 0.04, 0, z + sz * 0.03], [x, L + 0.01, z], 0.045);
  bookcaseShell(m, { W, D, H, base: L, shelves: [0.55, 0.85, 1.13], mat: 'wood' });
  m.box('woodDark', [W / 2 - 0.01, L, 0.02], [W / 2 + 0.01, 0.55, D - 0.01]);
  bookRow(m, 0.05, W / 2 - 0.03, L + 0.03, 0.06, D - 0.06, 4, 0.22);
  m.box('carpetBlue', [W / 2 + 0.04, L + 0.03, 0.08], [W - 0.05, L + 0.23, D - 0.05]);
  bookRow(m, 0.05, W - 0.05, 0.58, 0.06, D - 0.06, 7, 0.24, 2);
  m.box('carpetWhite', [0.12, 0.88, 0.1], [0.4, 1.0, D - 0.08]);
  bookRow(m, 0.5, W - 0.06, 0.88, 0.06, D - 0.06, 4, 0.22, 1);
  return m;
}

/** Display cabinet: a glass vitrine on a plinth with three glass shelves of porcelain. */
function displayCabinet() {
  const m = new Model('displayCabinet');
  const W = 0.85, D = 0.4, H = 1.7, P = 0.08;
  m.box('woodDark', [0.02, 0, 0.02], [W - 0.02, P, D - 0.02]);
  for (const [x, z] of [[0, 0], [W - 0.05, 0], [0, D - 0.05], [W - 0.05, D - 0.05]]) m.box('wood', [x, P, z], [x + 0.05, H, z + 0.05]);
  m.box('wood', [0, H, 0], [W, H + 0.04, D]);
  m.box('wood', [0.02, P, 0.02], [W - 0.02, P + 0.04, D - 0.02]);
  m.box('glass', [0.05, P + 0.04, 0.03], [W - 0.05, H, 0.035]);
  for (const x of [0.012, W - 0.038]) m.box('glass', [x, P + 0.04, 0.05], [x + 0.026, H, D - 0.05]);
  m.box('glass', [0.05, P + 0.04, D - 0.03], [W - 0.05, H, D - 0.024]);
  for (const y of [0.55, 0.95, 1.35]) m.box('glass', [0.05, y, 0.05], [W - 0.05, y + 0.012, D - 0.05]);
  m.cylY('carpetWhite', 0.25, 0.2, P + 0.04, 0.38, 0.05, 0.08, 8);
  m.cylY('carpetBlue', 0.58, 0.2, P + 0.04, 0.3, 0.07, 0.05, 8);
  m.cylY('carpet', 0.3, 0.2, 0.562, 0.75, 0.06, 0.04, 8);
  m.box('carpetWhite', [0.5, 0.562, 0.1], [0.72, 0.64, 0.3]);
  m.cylY('carpetBlue', 0.26, 0.2, 0.962, 1.2, 0.04, 0.07, 8);
  m.cylY('carpetWhite', 0.6, 0.2, 0.962, 1.1, 0.06, 0.06, 8);
  m.cylY('carpetDarker', 0.4, 0.2, 1.362, 1.55, 0.05, 0.08, 8);
  return m;
}

/** China hutch: a cabinet with two doors below, a glass-front dresser above and a shelf of plates. */
function chinaHutch() {
  const m = new Model('chinaHutch');
  const W = 1.5, D = 0.5, H = 1.95, P = 0.06;
  m.box('woodDark', [0.02, 0, 0.02], [W - 0.02, P, D - 0.02]);
  m.box('wood', [0, P, 0], [W, 0.85, D - 0.022]);
  for (const left of [true, false]) {
    const x0 = left ? 0.04 : W / 2 + 0.01, x1 = left ? W / 2 - 0.01 : W - 0.04;
    m.box('woodDark', [x0, P + 0.03, D - 0.022], [x1, 0.82, D]);
    m.box('wood', [x0 + 0.05, P + 0.08, D], [x1 - 0.05, 0.77, D + 0.01]);
    knob(m, 'metal', left ? x1 - 0.06 : x0 + 0.06, 0.5, D + 0.01);
  }
  m.box('wood', [-0.015, 0.85, -0.01], [W + 0.015, 0.89, D + 0.02]);
  const UD = 0.35;
  m.box('woodDark', [0.04, 0.89, 0], [W - 0.04, H, 0.03]);
  for (const x of [0.04, W - 0.08]) m.box('wood', [x, 0.89, 0.03], [x + 0.04, H, UD]);
  m.box('wood', [0.02, H, 0], [W - 0.02, H + 0.05, UD + 0.03]);
  m.box('wood', [0.08, 1.35, 0.03], [W - 0.08, 1.38, UD]);
  for (const x of [0.08, W - 0.12]) m.box('wood', [x - 0.0, 0.89, UD - 0.04], [x + 0.04, H, UD]);
  m.box('glass', [0.12, 0.92, UD - 0.01], [W - 0.12, H - 0.04, UD - 0.004]);
  m.box('wood', [W / 2 - 0.02, 0.89, UD - 0.04], [W / 2 + 0.02, H, UD]);
  for (const [x, y] of [[0.3, 1.38], [0.65, 1.38], [1.0, 1.38], [1.3, 1.38], [0.3, 0.92], [0.8, 0.92]]) m.box('carpetWhite', [x - 0.06, y, 0.1], [x + 0.06, y + 0.2, 0.13]);
  for (const x of [0.4, 1.1]) m.cylY('carpetBlue', x, 0.2, 1.38, 1.58, 0.05, 0.07, 8);
  return m;
}

/** Mid-Century Sideboard: a long teak cabinet on tapered legs, a drawer bank in the middle. */
function sideboardMidCentury() {
  const m = new Model('sideboardMidCentury');
  const W = 1.6, D = 0.45, H = 0.78, L = 0.18;
  m.box('wood', [-0.01, H - 0.035, -0.01], [W + 0.01, H, D + 0.01]);
  m.box('wood', [0, L, 0], [W, H - 0.035, D - 0.022]);
  for (const [x, z, sx, sz] of [[0.1, 0.06, -1, -1], [W - 0.1, 0.06, 1, -1], [0.1, D - 0.06, -1, 1], [W - 0.1, D - 0.06, 1, 1]]) m.rod('woodDark', [x + sx * 0.04, 0, z + sz * 0.03], [x, L + 0.01, z], 0.045);
  const cw = (W - 0.08) / 3;
  for (let c = 0; c < 3; c++) {
    const x0 = 0.04 + c * cw + 0.006, x1 = 0.04 + (c + 1) * cw - 0.006;
    if (c === 1) for (let r = 0; r < 3; r++) drawerFront(m, { x0, x1, y0: L + 0.03 + r * 0.14, y1: L + 0.03 + r * 0.14 + 0.125, zf: D - 0.022, mat: 'woodDark', hMat: 'metal' });
    else { m.box('woodDark', [x0, L + 0.03, D - 0.022], [x1, H - 0.06, D]); m.box('wood', [(x0 + x1) / 2 - 0.004, L + 0.03, D], [(x0 + x1) / 2 + 0.004, H - 0.06, D + 0.006]); knob(m, 'metal', c === 0 ? x1 - 0.05 : x0 + 0.05, H / 2 + 0.05, D); }
  }
  return m;
}

/** Rustic Sideboard: plank doors with X-bracing and iron pulls on a plain plinth. */
function sideboardRustic() {
  const m = new Model('sideboardRustic');
  const W = 1.6, D = 0.45, H = 0.95;
  m.box('woodDark', [0.03, 0, 0.03], [W - 0.03, 0.08, D - 0.03]);
  m.box('wood', [0, 0.08, 0], [W, H - 0.05, D - 0.03]);
  m.box('wood', [-0.015, H - 0.05, -0.01], [W + 0.015, H, D + 0.015]);
  for (let c = 0; c < 2; c++) {
    const x0 = 0.04 + c * (W - 0.08) / 2 + 0.005, x1 = 0.04 + (c + 1) * (W - 0.08) / 2 - 0.005;
    m.box('woodDark', [x0, 0.11, D - 0.03], [x1, H - 0.08, D]);
    m.rod('wood', [x0 + 0.04, 0.16, D + 0.004], [x1 - 0.04, H - 0.14, D + 0.004], 0.05, 0.016);
    m.rod('wood', [x0 + 0.04, H - 0.14, D + 0.004], [x1 - 0.04, 0.16, D + 0.004], 0.05, 0.016);
    m.rod('metalDark', [c ? x0 + 0.06 : x1 - 0.06, 0.5, D + 0.01], [c ? x0 + 0.06 : x1 - 0.06, 0.64, D + 0.01], 0.025);
  }
  return m;
}

/** Modern Credenza: a low white-lacquer unit with four flat doors on a recessed base and a wooden top. */
function credenzaModern() {
  const m = new Model('credenzaModern');
  const W = 1.8, D = 0.42, H = 0.7, B = 0.1;
  m.box('metalDark', [0.06, 0, 0.04], [W - 0.06, B, D - 0.06]);
  m.box('metalLight', [0, B, 0], [W, H - 0.03, D - 0.02]);
  m.box('wood', [-0.01, H - 0.03, -0.01], [W + 0.01, H, D + 0.01]);
  const cw = (W - 0.04) / 4;
  for (let c = 0; c < 4; c++) {
    const x0 = 0.02 + c * cw + 0.004, x1 = 0.02 + (c + 1) * cw - 0.004;
    m.box('metalLight', [x0, B + 0.02, D - 0.02], [x1, H - 0.05, D]);
    m.box('wood', [(c % 2 ? x0 : x1 - 0.012), B + 0.1, D], [(c % 2 ? x0 + 0.012 : x1), H - 0.15, D + 0.006]);
  }
  return m;
}

/** Media cabinet: a low unit with two open cubbies and two closed doors; the TV stands on top. */
function mediaCabinetModern() {
  const m = new Model('mediaCabinetModern');
  const W = 1.8, D = 0.45, H = 0.52, L = 0.08;
  for (const x of [0.06, W - 0.1]) m.box('woodDark', [x, 0, 0.05], [x + 0.04, L, D - 0.05]);
  m.box('wood', [-0.01, H - 0.035, -0.005], [W + 0.01, H, D + 0.005]);
  bookcaseShell(m, { W, D, H: H - 0.035, base: L, T: 0.03 });
  m.box('wood', [0, L, 0.02], [W, L + 0.03, D]);
  for (const x of [W / 4, W / 2, 3 * W / 4]) m.box('wood', [x - 0.015, L, 0.02], [x + 0.015, H - 0.035, D]);
  for (const c of [2, 3]) { // closed doors on the right half
    const x0 = c * W / 4 + 0.02, x1 = (c + 1) * W / 4 - 0.02;
    m.box('woodDark', [x0, L + 0.04, D - 0.02], [x1, H - 0.05, D]);
    knob(m, 'metal', c === 2 ? x1 - 0.05 : x0 + 0.05, 0.3, D);
  }
  m.box('carpetBlue', [0.1, L + 0.03, 0.1], [0.4, L + 0.1, D - 0.1]); // a console and a box on the open shelves
  m.box('metalDark', [W / 4 + 0.08, L + 0.03, 0.1], [W / 2 - 0.08, L + 0.11, D - 0.08]);
  return m;
}

/** Steel media console: wood top on a steel frame with glass doors and two shelves. */
function mediaConsoleIndustrial() {
  const m = new Model('mediaConsoleIndustrial');
  const W = 1.7, D = 0.45, H = 0.6;
  m.box('wood', [0, H - 0.04, 0], [W, H, D]);
  legs4(m, 'metalDark', 0.03, 0.03, W - 0.03, D - 0.03, H - 0.04, 0.04);
  for (const y of [0.04, 0.3]) m.box('wood', [0.04, y, 0.04], [W - 0.04, y + 0.03, D - 0.04]);
  apron(m, 'metalDark', 0.03, 0.03, W - 0.03, D - 0.03, 0.02, 0.06, 0.03);
  for (const x of [W / 3, 2 * W / 3]) { m.box('metalDark', [x - 0.015, 0.07, D - 0.07], [x + 0.015, H - 0.04, D - 0.04]); }
  for (const c of [0, 1, 2]) m.box('glass', [0.06 + c * (W - 0.12) / 3 + 0.02, 0.1, D - 0.055], [0.06 + (c + 1) * (W - 0.12) / 3 - 0.02, H - 0.08, D - 0.05]);
  m.box('carpetBlue', [0.2, 0.33, 0.1], [0.5, 0.42, D - 0.1]);
  m.box('carpet', [1.1, 0.07, 0.1], [1.4, 0.2, D - 0.1]);
  return m;
}


/** Filing Cabinet: four steel drawers with label holders and recessed pulls. */
function filingCabinet() {
  const m = new Model('filingCabinet');
  const W = 0.47, D = 0.62, H = 1.3;
  m.box('metalDark', [0.02, 0, 0.02], [W - 0.02, 0.05, D - 0.02]);
  m.box('metalMedium', [0, 0.05, 0], [W, H, D - 0.02]);
  m.box('metalMedium', [-0.005, H, -0.005], [W + 0.005, H + 0.02, D]);
  for (let i = 0; i < 4; i++) {
    const y0 = 0.07 + i * 0.3, y1 = y0 + 0.28;
    m.box('metalLight', [0.02, y0, D - 0.02], [W - 0.02, y1, D + 0.006]);
    m.box('metalDark', [0.12, y1 - 0.1, D + 0.006], [W - 0.12, y1 - 0.06, D + 0.02]);
    m.box('carpetWhite', [0.14, y0 + 0.14, D + 0.006], [W - 0.14, y0 + 0.2, D + 0.012]);
  }
  return m;
}

/** Lateral Filing Cabinet: a wide, low two-drawer steel unit whose top works as a shelf. */
function filingLateral() {
  const m = new Model('filingLateral');
  const W = 1.2, D = 0.45, H = 0.75;
  m.box('metalDark', [0.02, 0, 0.02], [W - 0.02, 0.05, D - 0.02]);
  m.box('metalMedium', [0, 0.05, 0], [W, H - 0.025, D - 0.02]);
  m.box('wood', [-0.01, H - 0.025, -0.01], [W + 0.01, H, D + 0.01]);
  for (let i = 0; i < 2; i++) {
    const y0 = 0.07 + i * 0.33, y1 = y0 + 0.31;
    m.box('metalLight', [0.02, y0, D - 0.02], [W - 0.02, y1, D + 0.006]);
    m.box('metalDark', [W / 2 - 0.2, y1 - 0.09, D + 0.006], [W / 2 + 0.2, y1 - 0.05, D + 0.02]);
    m.box('carpetWhite', [W / 2 - 0.08, y0 + 0.06, D + 0.006], [W / 2 + 0.08, y0 + 0.12, D + 0.012]);
  }
  return m;
}

/** Shoe Rack: three slatted tiers on two side frames, with pairs of shoes. */
function shoeRack() {
  const m = new Model('shoeRack');
  const W = 0.8, D = 0.3, H = 0.6;
  for (const x of [0, W - 0.04]) m.box('woodDark', [x, 0, 0], [x + 0.04, H, D]);
  for (let t = 0; t < 3; t++) {
    const y = 0.08 + t * 0.2;
    for (let s = 0; s < 4; s++) m.box('wood', [0.04, y, 0.01 + s * 0.072], [W - 0.04, y + 0.02, 0.06 + s * 0.072]);
    for (let p = 0; p < 3; p++) m.box(['carpetBlue', 'carpetDarker', 'carpet'][(p + t) % 3], [0.08 + p * 0.23, y + 0.02, 0.05], [0.24 + p * 0.23, y + 0.1, 0.24]);
  }
  m.box('woodDark', [0.04, 0.55, 0], [W - 0.04, H, 0.04]);
  return m;
}

/** Shoe Cabinet: a slim tall cabinet with three tip-out drawers. */
function shoeCabinet() {
  const m = new Model('shoeCabinet');
  const W = 0.8, D = 0.24, H = 1.2, L = 0.07;
  m.box('woodDark', [0.02, 0, 0.02], [W - 0.02, L, D - 0.02]);
  m.box('metalLight', [0, L, 0], [W, H, D - 0.02]);
  m.box('wood', [-0.01, H, -0.005], [W + 0.01, H + 0.03, D + 0.01]);
  for (let i = 0; i < 3; i++) {
    const y0 = L + 0.03 + i * 0.355, y1 = y0 + 0.335;
    m.slab('metalLight', [0.03, y0, D - 0.02], [W - 0.06, 0, 0], [0, y1 - y0, 0], [0, 0.03, 0.03]);
    m.box('wood', [0.2, y1 - 0.06, D + 0.012], [W - 0.2, y1 - 0.045, D + 0.03]);
  }
  return m;
}

/** Hall Tree: a storage bench with a panelled back, a mirror and a row of coat hooks. */
function hallTree() {
  const m = new Model('hallTree');
  const W = 0.9, D = 0.4, H = 1.9;
  m.box('woodDark', [0, 0, 0], [W, 0.07, D]);
  m.box('wood', [0, 0.07, 0], [W, 0.42, D]);
  m.box('woodDark', [0.04, 0.12, D - 0.01], [W / 2 - 0.02, 0.32, D + 0.005]);
  m.box('woodDark', [W / 2 + 0.02, 0.12, D - 0.01], [W - 0.04, 0.32, D + 0.005]);
  m.box('carpetBlue', [-0.01, 0.42, -0.01], [W + 0.01, 0.47, D + 0.015]); // seat pad
  m.box('woodDark', [0, 0.47, 0], [W, H, 0.05]);
  for (const x of [0, W - 0.06]) m.box('wood', [x, 0.47, 0], [x + 0.06, H, 0.12]);
  m.box('wood', [0, H - 0.04, 0], [W, H, 0.14]);
  m.box('glass', [0.1, 1.2, 0.05], [W - 0.1, 1.75, 0.056]);
  m.box('wood', [0.08, 1.15, 0.05], [W - 0.08, 1.2, 0.07]);
  for (let k = 0; k < 4; k++) m.rod('metal', [0.15 + k * 0.2, 1.0, 0.05], [0.15 + k * 0.2, 1.0, 0.16], 0.028);
  m.box('wood', [0.06, 0.95, 0.05], [W - 0.06, 1.0, 0.12]);
  for (const [x, mat] of [[0.2, 'carpet'], [0.6, 'carpetBlue']]) m.box(mat, [x, 0.5, 0.1], [x + 0.05, 0.9, 0.3]); // coats
  return m;
}

/** Hat Stand: a turned brass pole with a ring of hooks and an umbrella tray. */
function hatStand() {
  const m = new Model('hatStand');
  const c = 0.3;
  m.cylY('metalDark', c, c, 0, 0.04, 0.26, 0.24);
  m.cylY('metal', c, c, 0.04, 1.75, 0.025, 0.025, 8);
  m.cylY('metal', c, c, 0.5, 0.52, 0.2, 0.2);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, dx = Math.cos(a), dz = Math.sin(a);
    m.rod('metal', [c + dx * 0.02, 1.62, c + dz * 0.02], [c + dx * 0.16, 1.68, c + dz * 0.16], 0.025);
    m.rod('metal', [c + dx * 0.16, 1.68, c + dz * 0.16], [c + dx * 0.16, 1.76, c + dz * 0.16], 0.025);
  }
  m.cylY('metal', c, c, 1.75, 1.8, 0.04, 0.02, 8);
  m.cylY('carpetDarker', c + 0.12, c + 0.1, 1.42, 1.62, 0.08, 0.1, 8); // a hat on a hook
  return m;
}

/** Floating Shelves: two plank shelves hung one above the other on a single backing rail. */
function wallShelfFloating() {
  const m = new Model('wallShelfFloating');
  const W = 0.9, D = 0.22;
  m.box('woodDark', [0.05, 0, 0], [W - 0.05, 0.6, 0.02]);
  for (const y of [0.04, 0.34]) m.box('wood', [0, y, 0], [W, y + 0.04, D]);
  bookRow(m, 0.08, 0.4, 0.08, 0.04, D - 0.04, 4, 0.2);
  m.cylY('carpetWhite', 0.66, 0.11, 0.38, 0.5, 0.05, 0.06, 8);
  m.box('plant', [0.62, 0.5, 0.07], [0.7, 0.58, 0.15]);
  return m;
}

/** Bracket Shelf: one thick plank on two steel angle brackets, with a pot and a couple of books. */
function wallShelfBracket() {
  const m = new Model('wallShelfBracket');
  const W = 0.9, D = 0.24;
  m.box('wood', [0, 0.12, 0], [W, 0.17, D]);
  for (const x of [0.1, W - 0.12]) {
    m.box('metalDark', [x, 0, 0], [x + 0.025, 0.2, 0.02]);
    m.box('metalDark', [x, 0.12, 0], [x + 0.025, 0.14, D - 0.02]);
    m.rod('metalDark', [x + 0.0125, 0.02, 0.02], [x + 0.0125, 0.12, D - 0.04], 0.02, 0.025);
  }
  bookRow(m, 0.12, 0.38, 0.17, 0.04, D - 0.04, 4, 0.2, 1);
  m.cylY('wood', 0.65, 0.12, 0.17, 0.27, 0.06, 0.05, 8);
  m.cylY('plant', 0.65, 0.12, 0.27, 0.4, 0.05, 0.02, 8);
  return m;
}

/** Linen Cupboard: tall, with an open shelf of folded towels above two shut doors. */
function linenCupboard() {
  const m = new Model('linenCupboard');
  const W = 0.8, D = 0.4, H = 1.8, P = 0.06;
  m.box('woodDark', [0.02, 0, 0.02], [W - 0.02, P, D - 0.02]);
  bookcaseShell(m, { W, D, H, base: P, shelves: [1.3, 1.52], mat: 'wood' });
  m.box('woodDark', [-0.012, H, -0.01], [W + 0.012, H + 0.03, D + 0.012]);
  for (const [y, mats] of [[1.33, ['carpetWhite', 'carpetBlue']], [1.55, ['carpetBlue', 'carpetWhite']]]) {
    m.box(mats[0], [0.05, y, 0.06], [W / 2 - 0.02, y + 0.12, D - 0.08]);
    m.box(mats[1], [W / 2 + 0.02, y, 0.06], [W - 0.05, y + 0.1, D - 0.08]);
  }
  for (const x0 of [0.03, W / 2 + 0.004]) {
    const x1 = x0 === 0.03 ? W / 2 - 0.004 : W - 0.03;
    m.box('woodDark', [x0, P + 0.03, D - 0.02], [x1, 1.28, D]); // doors, closed for good
    m.box('wood', [x0 + 0.05, P + 0.1, D], [x1 - 0.05, 1.2, D + 0.01]);
    knob(m, 'metal', x0 === 0.03 ? x1 - 0.05 : x0 + 0.05, 0.75, D + 0.01);
  }
  return m;
}

/** Larder Cupboard: a tall kitchen cabinet with glazed top doors, a pull-out drawer and plank doors below. */
function larderCupboard() {
  const m = new Model('larderCupboard');
  const W = 0.8, D = 0.45, H = 1.9, P = 0.08;
  m.box('woodDark', [0.02, 0, 0.02], [W - 0.02, P, D - 0.02]);
  m.box('wood', [0, P, 0], [W, H - 0.04, D - 0.022]);
  m.box('woodDark', [-0.012, H - 0.04, -0.01], [W + 0.012, H, D + 0.012]);
  for (const x0 of [0.03, W / 2 + 0.004]) {
    const x1 = x0 === 0.03 ? W / 2 - 0.004 : W - 0.03;
    m.box('woodDark', [x0, 1.2, D - 0.022], [x1, H - 0.08, D]);
    m.box('glass', [x0 + 0.05, 1.27, D], [x1 - 0.05, H - 0.15, D + 0.006]);
    knob(m, 'metal', x0 === 0.03 ? x1 - 0.05 : x0 + 0.05, 1.45, D);
    m.box('woodDark', [x0, P + 0.03, D - 0.022], [x1, 0.62, D]);
    m.box('wood', [x0 + 0.05, P + 0.08, D], [x1 - 0.05, 0.57, D + 0.008]);
    knob(m, 'metal', x0 === 0.03 ? x1 - 0.05 : x0 + 0.05, 0.4, D + 0.008);
  }
  drawerFront(m, { x0: 0.03, x1: W - 0.03, y0: 0.7, y1: 1.12, zf: D - 0.022, knobs: true, mat: 'woodDark' });
  return m;
}

export default { chestOfDrawers, diningRoundPedestal, diningSquareModern, diningPlankFarm, diningExtendable, diningMidCentury, diningIndustrialPipe, diningBistro, diningDropLeaf, diningMarbleLuxury, diningPicnic, coffeeRoundMidCentury, coffeeTrunk, coffeeNesting, coffeeCartIndustrial, coffeeMarbleDrum, sideDrum, sideEndTwoTier, consoleBrass, consoleIndustrial, sideCTable, sideTelephone, deskSecretary, deskStanding, deskExecutive, deskSchool, deskVanity, deskDrafting, deskStudent, deskIndustrial, deskGaming, deskRolltop, bedsideMidCentury, bedsideCrate, barTableHigh, cardTable, islandTable, workbench, wardrobeClassic, wardrobePine, wardrobeTriple, wardrobeSliding, armoireCarved, clothesRail, dresserSixDrawer, dresserTallboy, dresserMidCentury, dresserCandy, dresserMirror, chestBlanket, trunkSteamer, chestCedar, bookcaseCube, bookcaseLadder, bookcaseGlass, bookcaseLowWide, bookcaseIndustrial, bookcaseMidCentury, displayCabinet, chinaHutch, sideboardMidCentury, sideboardRustic, credenzaModern, mediaCabinetModern, mediaConsoleIndustrial, filingCabinet, filingLateral, shoeRack, shoeCabinet, hallTree, hatStand, wallShelfFloating, wallShelfBracket, linenCupboard, larderCupboard };
