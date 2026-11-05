// Milestone 10 furniture, group "seating-beds": export default { modelName: builderFn, ... }. See dev/ds-tasks/m10f/AUTHORING.md.
// Content for these models: src/content/objectsM10/seating-beds.ts
// Authored in real metres in footprint space (a 1 x 1 tile is 1 m), front +z, bottom on y = 0.

import { Model } from '../kit.mjs';

/** Box from ranges (x0, x1, y0, y1, z0, z1). */
const bx = (m, mat, x0, x1, y0, y1, z0, z1) => m.box(mat, [x0, y0, z0], [x1, y1, z1]);
/** Square post at (x, z) from y0 to y1. */
const post = (m, mat, x, z, y0, y1, t = 0.05) => bx(m, mat, x - t / 2, x + t / 2, y0, y1, z - t / 2, z + t / 2);
/** Four posts at the corners of the rectangle x0..x1 x z0..z1. */
const corners = (m, mat, x0, x1, z0, z1, y0, y1, t = 0.05) => {
  for (const x of [x0, x1]) for (const z of [z0, z1]) post(m, mat, x, z, y0, y1, t);
};
/** Rod helper with a point list [x, y, z]. */
const rd = (m, mat, a, b, w, t = w) => m.rod(mat, a, b, w, t);

/** Wall of n horizontal segments along a circle arc (angles in radians, 0 = +x, pi/2 = +z), thickness t, from y0 to y1. */
const wall = (m, mat, cx, cz, R, a0, a1, y0, y1, t, n = 8) => {
  for (let i = 0; i < n; i++) {
    const p = (k) => { const a = a0 + ((a1 - a0) * k) / n; return [cx + R * Math.cos(a), (y0 + y1) / 2, cz + R * Math.sin(a)]; };
    m.rod(mat, p(i), p(i + 1), t, y1 - y0);
  }
};
/**
 * Mattress, cover and pillows of a bed: x0..x1 across, z0 (head) .. z1 (foot), mattress top at `top`. The cover starts at
 * `coverFrom` (fraction of the length); the content file uses `top` as the sleep height.
 */
const bedding = (m, x0, x1, z0, z1, top, { sheet = 'carpetWhite', cover = 'carpet', pillows = 1, thick = 0.2, pillowMat = 'carpetWhite', coverFrom = 0.45 } = {}) => {
  bx(m, sheet, x0, x1, top - thick, top, z0, z1);
  bx(m, cover, x0 - 0.01, x1 + 0.01, top - 0.08, top + 0.05, z0 + (z1 - z0) * coverFrom, z1 + 0.01);
  const pw = (x1 - x0) / pillows;
  for (let i = 0; i < pillows; i++) bx(m, pillowMat, x0 + i * pw + 0.04, x0 + (i + 1) * pw - 0.04, top, top + 0.1, z0 + 0.06, z0 + 0.34);
};
// --- Dining chairs ---------------------------------------------------------------------------

function chairSpindle() {
  const m = new Model('chairSpindle');
  for (const s of [-1, 1]) {
    rd(m, 'wood', [0.5 + s * 0.23, 0, 0.75], [0.5 + s * 0.2, 0.44, 0.69], 0.045);
    rd(m, 'wood', [0.5 + s * 0.23, 0, 0.25], [0.5 + s * 0.2, 0.44, 0.31], 0.045);
    rd(m, 'wood', [0.5 + s * 0.215, 0.15, 0.72], [0.5 + s * 0.215, 0.15, 0.28], 0.03);
    rd(m, 'wood', [0.5 + s * 0.2, 0.46, 0.31], [0.5 + s * 0.2, 0.98, 0.26], 0.05, 0.04);
  }
  bx(m, 'woodDark', 0.27, 0.73, 0.44, 0.48, 0.27, 0.73);
  rd(m, 'wood', [0.31, 0.15, 0.5], [0.69, 0.15, 0.5], 0.03);
  for (let i = 0; i < 5; i++) { const x = 0.3 + i * 0.1; rd(m, 'wood', [x, 0.48, 0.3], [x, 0.9, 0.27], 0.025); }
  bx(m, 'wood', 0.27, 0.73, 0.9, 0.99, 0.245, 0.29);
  return m;
}

function chairBentwood() {
  const m = new Model('chairBentwood');
  m.cylY('wood', 0.5, 0.52, 0.43, 0.47, 0.22, 0.22, 10);
  for (const s of [-1, 1]) {
    rd(m, 'woodDark', [0.5 + s * 0.24, 0, 0.7], [0.5 + s * 0.17, 0.43, 0.62], 0.04);
    rd(m, 'woodDark', [0.5 + s * 0.24, 0, 0.32], [0.5 + s * 0.17, 0.43, 0.4], 0.04);
    rd(m, 'woodDark', [0.5 + s * 0.12, 0.47, 0.34], [0.5 + s * 0.2, 0.8, 0.3], 0.04);
    rd(m, 'woodDark', [0.5 + s * 0.2, 0.8, 0.3], [0.5 + s * 0.08, 0.97, 0.3], 0.04);
  }
  rd(m, 'woodDark', [0.42, 0.97, 0.3], [0.58, 0.97, 0.3], 0.04);
  for (const z of [0.4, 0.62]) rd(m, 'woodDark', [0.29, 0.2, z], [0.71, 0.2, z], 0.025);
  rd(m, 'woodDark', [0.5, 0.5, 0.31], [0.5, 0.92, 0.3], 0.03);
  return m;
}

function chairShell() {
  const m = new Model('chairShell');
  bx(m, 'carpetWhite', 0.25, 0.75, 0.44, 0.48, 0.28, 0.74);
  m.slab('carpetWhite', [0.25, 0.46, 0.29], [0.5, 0, 0], [0, 0.42, -0.1], [0, 0, 0.04]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rd(m, 'wood', [0.5 + sx * 0.2, 0.44, 0.51 + sz * 0.18], [0.5 + sx * 0.27, 0, 0.51 + sz * 0.26], 0.04);
  }
  for (const sx of [-1, 1]) bx(m, 'metal', 0.5 + sx * 0.2 - 0.01, 0.5 + sx * 0.2 + 0.01, 0.4, 0.44, 0.33, 0.69);
  rd(m, 'metal', [0.3, 0.4, 0.51], [0.7, 0.4, 0.51], 0.015);
  return m;
}

function chairTolix() {
  const m = new Model('chairTolix');
  bx(m, 'metal', 0.27, 0.73, 0.44, 0.47, 0.27, 0.73);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rd(m, 'metal', [0.5 + sx * 0.22, 0.44, 0.5 + sz * 0.21], [0.5 + sx * 0.27, 0, 0.5 + sz * 0.26], 0.035);
  bx(m, 'metal', 0.3, 0.7, 0.2, 0.225, 0.3, 0.7);
  for (const s of [-1, 1]) rd(m, 'metal', [0.5 + s * 0.22, 0.47, 0.3], [0.5 + s * 0.23, 0.86, 0.26], 0.035);
  bx(m, 'metal', 0.27, 0.73, 0.62, 0.84, 0.255, 0.28);
  bx(m, 'metal', 0.27, 0.73, 0.84, 0.86, 0.25, 0.3);
  return m;
}

function chairParsons() {
  const m = new Model('chairParsons');
  corners(m, 'wood', 0.29, 0.71, 0.3, 0.7, 0, 0.42, 0.05);
  bx(m, 'carpetBlue', 0.25, 0.75, 0.42, 0.52, 0.26, 0.74);
  bx(m, 'carpetBlue', 0.25, 0.75, 0.52, 1.0, 0.26, 0.36);
  bx(m, 'carpetDarker', 0.25, 0.75, 0.42, 0.44, 0.26, 0.74);
  return m;
}

function chairHighBack() {
  const m = new Model('chairHighBack');
  corners(m, 'woodDark', 0.27, 0.73, 0.28, 0.72, 0, 0.44, 0.06);
  bx(m, 'wood', 0.25, 0.75, 0.44, 0.5, 0.26, 0.74);
  bx(m, 'carpetBlue', 0.29, 0.71, 0.5, 0.56, 0.32, 0.7);
  for (const x of [0.27, 0.73]) { post(m, 'woodDark', x, 0.28, 0.5, 1.3, 0.06); bx(m, 'wood', x - 0.04, x + 0.04, 0.62, 0.66, 0.28, 0.7); post(m, 'woodDark', x, 0.66, 0.5, 0.64, 0.05); }
  bx(m, 'wood', 0.23, 0.77, 1.2, 1.32, 0.25, 0.31);
  bx(m, 'carpetBlue', 0.31, 0.69, 0.58, 1.18, 0.29, 0.34);
  bx(m, 'wood', 0.3, 0.7, 0.2, 0.24, 0.3, 0.7);
  return m;
}

function chairCrossBack() {
  const m = new Model('chairCrossBack');
  corners(m, 'woodDark', 0.28, 0.72, 0.28, 0.72, 0, 0.45, 0.05);
  bx(m, 'wood', 0.26, 0.74, 0.45, 0.5, 0.26, 0.74);
  for (const z of [0.4, 0.62]) bx(m, 'woodDark', 0.285, 0.715, 0.15, 0.18, z - 0.015, z + 0.015);
  for (const x of [0.28, 0.72]) post(m, 'woodDark', x, 0.28, 0.5, 1.0, 0.05);
  bx(m, 'woodDark', 0.26, 0.74, 0.92, 1.0, 0.26, 0.3);
  bx(m, 'woodDark', 0.26, 0.74, 0.55, 0.6, 0.27, 0.3);
  rd(m, 'wood', [0.3, 0.58, 0.28], [0.7, 0.93, 0.28], 0.045, 0.03);
  rd(m, 'wood', [0.7, 0.58, 0.28], [0.3, 0.93, 0.28], 0.045, 0.03);
  return m;
}

function chairRattan() {
  const m = new Model('chairRattan');
  m.cylY('wood', 0.5, 0.52, 0.4, 0.44, 0.23, 0.23, 10);
  m.cylY('carpetWhite', 0.5, 0.52, 0.44, 0.49, 0.2, 0.2, 10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rd(m, 'woodDark', [0.5 + sx * 0.18, 0.4, 0.52 + sz * 0.18], [0.5 + sx * 0.23, 0, 0.52 + sz * 0.23], 0.04);
  // round back hoop, a half circle standing on the seat edge
  const c = [0.5, 0.62], R = 0.24, pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
  for (let i = 0; i < 8; i++) rd(m, 'wood', [pts[i][0], pts[i][1] + 0.36, 0.3], [pts[i + 1][0], pts[i + 1][1] + 0.36, 0.3], 0.045, 0.045);
  for (const x of [0.4, 0.5, 0.6]) rd(m, 'wood', [x, 0.46, 0.31], [x, 0.9, 0.3], 0.025, 0.03);
  rd(m, 'wood', [0.28, 0.46, 0.34], [0.26, 0.98, 0.3], 0.04);
  rd(m, 'wood', [0.72, 0.46, 0.34], [0.74, 0.98, 0.3], 0.04);
  return m;
}

function chairFolding() {
  const m = new Model('chairFolding');
  for (const s of [-1, 1]) {
    const x = 0.5 + s * 0.22;
    rd(m, 'metal', [x, 0.46, 0.7], [x, 0, 0.3], 0.03);
    rd(m, 'metal', [x, 0.46, 0.3], [x, 0, 0.7], 0.03);
    rd(m, 'metal', [x, 0.46, 0.3], [x, 0.9, 0.27], 0.03);
    bx(m, 'metal', x - 0.015, x + 0.015, 0.44, 0.47, 0.3, 0.7);
  }
  bx(m, 'woodDark', 0.26, 0.74, 0.46, 0.49, 0.28, 0.72);
  bx(m, 'woodDark', 0.26, 0.74, 0.62, 0.84, 0.255, 0.285);
  return m;
}

// --- Stools and bar stools -------------------------------------------------------------------

function stoolIndustrial() {
  const m = new Model('stoolIndustrial');
  m.cylY('wood', 0.5, 0.5, 0.72, 0.77, 0.19, 0.19, 10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rd(m, 'metalDark', [0.5 + sx * 0.14, 0.72, 0.5 + sz * 0.14], [0.5 + sx * 0.22, 0, 0.5 + sz * 0.22], 0.035);
  }
  for (const [a, b] of [[[0.35, 0.35], [0.65, 0.35]], [[0.65, 0.35], [0.65, 0.65]], [[0.65, 0.65], [0.35, 0.65]], [[0.35, 0.65], [0.35, 0.35]]]) rd(m, 'metalDark', [a[0], 0.26, a[1]], [b[0], 0.26, b[1]], 0.025);
  return m;
}

function stoolBackrest() {
  const m = new Model('stoolBackrest');
  bx(m, 'carpetBlue', 0.29, 0.71, 0.7, 0.78, 0.29, 0.71);
  bx(m, 'carpetBlue', 0.3, 0.7, 0.8, 1.05, 0.26, 0.32);
  for (const x of [0.33, 0.67]) { rd(m, 'metal', [x, 0.7, 0.34], [x, 0, 0.3], 0.035); rd(m, 'metal', [x, 0.7, 0.66], [x, 0, 0.7], 0.035); rd(m, 'metal', [x, 0.78, 0.3], [x, 1.04, 0.28], 0.03); }
  rd(m, 'metal', [0.33, 0.28, 0.5], [0.67, 0.28, 0.5], 0.03);
  rd(m, 'metal', [0.33, 0.28, 0.7], [0.67, 0.28, 0.7], 0.03);
  return m;
}

function stoolRustic() {
  const m = new Model('stoolRustic');
  m.cylY('woodDark', 0.5, 0.5, 0.66, 0.74, 0.2, 0.2, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    rd(m, 'wood', [0.5 + 0.1 * Math.cos(a), 0.66, 0.5 + 0.1 * Math.sin(a)], [0.5 + 0.24 * Math.cos(a), 0, 0.5 + 0.24 * Math.sin(a)], 0.055);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6, b = ((i + 1) / 3) * Math.PI * 2 + Math.PI / 6;
    rd(m, 'wood', [0.5 + 0.17 * Math.cos(a), 0.25, 0.5 + 0.17 * Math.sin(a)], [0.5 + 0.17 * Math.cos(b), 0.25, 0.5 + 0.17 * Math.sin(b)], 0.03);
  }
  return m;
}

function stoolLeather() {
  const m = new Model('stoolLeather');
  m.cylY('carpetDarker', 0.5, 0.5, 0.7, 0.78, 0.2, 0.2, 12);
  m.cylY('carpetDarker', 0.5, 0.5, 0.66, 0.7, 0.17, 0.2, 12);
  m.cylY('metal', 0.5, 0.5, 0.06, 0.66, 0.035, 0.035, 8);
  m.cylY('metal', 0.5, 0.5, 0, 0.06, 0.21, 0.21, 12);
  m.lathe('metal', 0.5, 0.5, [[0.17, 0.34], [0.17, 0.37]], 12, { caps: false });
  m.cylY('metal', 0.5, 0.5, 0.33, 0.37, 0.17, 0.17, 12);
  return m;
}

function stoolMilking() {
  const m = new Model('stoolMilking');
  m.cylY('wood', 0.5, 0.5, 0.26, 0.31, 0.19, 0.19, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    rd(m, 'woodDark', [0.5 + 0.1 * Math.cos(a), 0.26, 0.5 + 0.1 * Math.sin(a)], [0.5 + 0.2 * Math.cos(a), 0, 0.5 + 0.2 * Math.sin(a)], 0.05);
  }
  return m;
}

function stoolSwivel() {
  const m = new Model('stoolSwivel');
  m.cylY('carpet', 0.5, 0.55, 0.64, 0.74, 0.19, 0.19, 12);
  wall(m, 'carpet', 0.5, 0.55, 0.19, Math.PI * 1.1, Math.PI * 1.9, 0.74, 0.98, 0.07, 6);
  m.cylY('metalDark', 0.5, 0.55, 0.06, 0.64, 0.03, 0.03, 8);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; rd(m, 'metalDark', [0.5, 0.05, 0.55], [0.5 + 0.22 * Math.cos(a), 0.02, 0.55 + 0.22 * Math.sin(a)], 0.04, 0.035); }
  m.lathe('metal', 0.5, 0.55, [[0.15, 0.3], [0.15, 0.33]], 10, { caps: false });
  m.cylY('metal', 0.5, 0.55, 0.3, 0.33, 0.15, 0.15, 10);
  return m;
}

// --- Armchairs -------------------------------------------------------------------------------

function armchairWingback() {
  const m = new Model('armchairWingback');
  corners(m, 'woodDark', 0.14, 0.86, 0.2, 0.86, 0, 0.12, 0.07);
  bx(m, 'carpetBlue', 0.1, 0.9, 0.12, 0.3, 0.12, 0.88);
  bx(m, 'carpetBlue', 0.22, 0.78, 0.3, 0.45, 0.28, 0.86);
  bx(m, 'carpetBlue', 0.12, 0.88, 0.3, 1.12, 0.12, 0.3);
  for (const [a, b] of [[0.08, 0.22], [0.78, 0.92]]) { bx(m, 'carpetBlue', a, b, 0.3, 0.64, 0.12, 0.88); bx(m, 'carpetBlue', a, b, 0.64, 1.0, 0.12, 0.42); bx(m, 'carpetBlue', a - 0.01, b + 0.01, 0.64, 0.7, 0.4, 0.9); }
  bx(m, 'carpetBlue', 0.22, 0.78, 0.45, 0.85, 0.3, 0.4);
  bx(m, 'carpetDarker', 0.1, 0.9, 0.12, 0.15, 0.12, 0.88);
  return m;
}

function armchairClub() {
  const m = new Model('armchairClub');
  corners(m, 'woodDark', 0.14, 0.86, 0.2, 0.86, 0, 0.1, 0.07);
  bx(m, 'carpetDarker', 0.08, 0.92, 0.1, 0.4, 0.1, 0.9);
  bx(m, 'carpetDarker', 0.25, 0.75, 0.4, 0.5, 0.3, 0.88);
  bx(m, 'carpetDarker', 0.08, 0.92, 0.4, 0.92, 0.1, 0.34);
  for (const x of [0.08, 0.92]) { const s = x < 0.5 ? 1 : -1; bx(m, 'carpetDarker', Math.min(x, x + s * 0.17), Math.max(x, x + s * 0.17), 0.4, 0.66, 0.1, 0.9); m.cyl('carpetDarker', [x + s * 0.085, 0.68, 0.1], [x + s * 0.085, 0.68, 0.9], 0.1, 8); }
  m.cyl('carpetDarker', [0.08, 0.92, 0.22], [0.92, 0.92, 0.22], 0.08, 8);
  for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) bx(m, 'metal', x - 0.01, x + 0.01, 0.52, 0.55, 0.335, 0.345);
  bx(m, 'metal', 0.1, 0.9, 0.37, 0.39, 0.9, 0.91);
  return m;
}

function armchairMidcentury() {
  const m = new Model('armchairMidcentury');
  for (const sx of [-1, 1]) {
    const x = 0.5 + sx * 0.36;
    rd(m, 'wood', [x, 0.5, 0.2], [x + sx * 0.06, 0, 0.12], 0.05);
    rd(m, 'wood', [x, 0.5, 0.8], [x + sx * 0.06, 0, 0.88], 0.05);
    bx(m, 'wood', x - 0.03, x + 0.03, 0.5, 0.62, 0.18, 0.84);
    bx(m, 'wood', x - 0.045, x + 0.045, 0.6, 0.65, 0.18, 0.84);
    rd(m, 'wood', [x, 0.62, 0.2], [x, 1.0, 0.16], 0.05, 0.04);
  }
  bx(m, 'wood', 0.12, 0.88, 0.42, 0.47, 0.2, 0.82);
  bx(m, 'carpet', 0.16, 0.84, 0.47, 0.57, 0.28, 0.84);
  m.slab('carpet', [0.16, 0.57, 0.26], [0.68, 0, 0], [0, 0.4, -0.07], [0, 0, 0.12]);
  return m;
}

function armchairBarrel() {
  const m = new Model('armchairBarrel');
  m.cylY('carpetWhite', 0.5, 0.52, 0.08, 0.14, 0.43, 0.43, 12);
  corners(m, 'wood', 0.3, 0.7, 0.32, 0.72, 0, 0.08, 0.06);
  m.cylY('carpetWhite', 0.5, 0.52, 0.14, 0.4, 0.4, 0.4, 12);
  bx(m, 'carpetBlue', 0.16, 0.84, 0.4, 0.48, 0.42, 0.92);
  wall(m, 'carpetWhite', 0.5, 0.52, 0.38, Math.PI * 0.97, Math.PI * 2.03, 0.4, 0.9, 0.12, 9);
  wall(m, 'carpetBlue', 0.5, 0.52, 0.31, Math.PI * 1.0, Math.PI * 2.0, 0.48, 0.88, 0.04, 9);
  return m;
}

function armchairPapasan() {
  const m = new Model('armchairPapasan');
  m.cylY('woodDark', 0.5, 0.5, 0.18, 0.24, 0.3, 0.3, 10);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; rd(m, 'woodDark', [0.5 + 0.2 * Math.cos(a), 0.2, 0.5 + 0.2 * Math.sin(a)], [0.5 + 0.34 * Math.cos(a), 0, 0.5 + 0.34 * Math.sin(a)], 0.05); }
  wall(m, 'wood', 0.5, 0.5, 0.4, 0, Math.PI * 2, 0.24, 0.38, 0.06, 10);
  wall(m, 'wood', 0.5, 0.5, 0.45, 0, Math.PI * 2, 0.38, 0.5, 0.06, 10);
  wall(m, 'wood', 0.5, 0.5, 0.47, Math.PI * 1.0, Math.PI * 2.0, 0.5, 0.85, 0.06, 8);
  m.cylY('carpetWhite', 0.5, 0.52, 0.3, 0.46, 0.4, 0.4, 12);
  m.cylY('carpet', 0.5, 0.52, 0.46, 0.5, 0.36, 0.36, 12);
  wall(m, 'carpet', 0.5, 0.5, 0.4, Math.PI * 1.05, Math.PI * 1.95, 0.5, 0.82, 0.08, 7);
  return m;
}

function armchairSlipcover() {
  const m = new Model('armchairSlipcover');
  bx(m, 'carpetWhite', 0.1, 0.9, 0, 0.32, 0.12, 0.88);
  bx(m, 'carpetWhite', 0.1, 0.9, 0.32, 0.95, 0.12, 0.32);
  for (const [a, b] of [[0.1, 0.26], [0.74, 0.9]]) bx(m, 'carpetWhite', a, b, 0.32, 0.64, 0.12, 0.88);
  bx(m, 'carpetWhite', 0.26, 0.74, 0.32, 0.46, 0.3, 0.88);
  bx(m, 'carpetBlue', 0.3, 0.7, 0.48, 0.8, 0.3, 0.38);
  bx(m, 'carpetBlue', 0.1, 0.9, 0, 0.03, 0.12, 0.9);
  bx(m, 'carpetBlue', 0.26, 0.74, 0.44, 0.48, 0.3, 0.88);
  return m;
}

function armchairRocking() {
  const m = new Model('armchairRocking');
  for (const sx of [-1, 1]) {
    const x = 0.5 + sx * 0.3;
    const pts = []; for (let i = 0; i <= 8; i++) { const z = 0.08 + (i / 8) * 0.84; pts.push([x, 0.03 + 0.9 * (z - 0.5) * (z - 0.5) * 0.55 + 0.0, z]); }
    for (let i = 0; i < 8; i++) rd(m, 'wood', pts[i], pts[i + 1], 0.035, 0.05);
    post(m, 'wood', x, 0.25, 0.1, 0.5, 0.045); post(m, 'wood', x, 0.75, 0.08, 0.5, 0.045);
    rd(m, 'wood', [x, 0.5, 0.25], [x, 1.1, 0.2], 0.045);
    rd(m, 'wood', [x, 0.5, 0.76], [x, 0.66, 0.76], 0.04);
    bx(m, 'wood', x - 0.04, x + 0.04, 0.64, 0.68, 0.24, 0.8);
  }
  bx(m, 'woodDark', 0.22, 0.78, 0.46, 0.5, 0.24, 0.8);
  bx(m, 'carpet', 0.24, 0.76, 0.5, 0.56, 0.3, 0.78);
  for (const y of [0.6, 0.75, 0.9]) bx(m, 'woodDark', 0.24, 0.76, y, y + 0.08, 0.22, 0.26);
  bx(m, 'wood', 0.2, 0.8, 1.08, 1.14, 0.18, 0.24);
  return m;
}

function armchairBucket() {
  const m = new Model('armchairBucket');
  m.cylY('metalLight', 0.5, 0.5, 0, 0.04, 0.3, 0.3, 12);
  m.cylY('metalLight', 0.5, 0.5, 0.04, 0.34, 0.1, 0.05, 10);
  m.cylY('metalLight', 0.5, 0.5, 0.34, 0.4, 0.2, 0.28, 10);
  bx(m, 'carpet', 0.14, 0.86, 0.4, 0.48, 0.14, 0.86);
  wall(m, 'carpet', 0.5, 0.5, 0.36, Math.PI * 0.9, Math.PI * 2.1, 0.48, 0.86, 0.12, 12);
  bx(m, 'carpetWhite', 0.2, 0.8, 0.48, 0.56, 0.28, 0.84);
  return m;
}

// --- Recliners, sofas, sectionals, chaise ----------------------------------------------------

function reclinerClassic() {
  const m = new Model('reclinerClassic');
  corners(m, 'woodDark', 0.16, 0.84, 0.22, 0.78, 0, 0.1, 0.07);
  bx(m, 'carpetDarker', 0.1, 0.9, 0.1, 0.42, 0.1, 0.82);
  bx(m, 'carpetDarker', 0.24, 0.76, 0.42, 0.52, 0.26, 0.82);
  m.slab('carpetDarker', [0.1, 0.42, 0.28], [0.8, 0, 0], [0, 0.55, -0.16], [0, 0, 0.22]);
  for (const x of [0.1, 0.9]) { const s = x < 0.5 ? 1 : -1; bx(m, 'carpetDarker', Math.min(x, x + s * 0.16), Math.max(x, x + s * 0.16), 0.42, 0.68, 0.1, 0.82); bx(m, 'woodDark', Math.min(x, x + s * 0.17), Math.max(x, x + s * 0.17), 0.68, 0.72, 0.1, 0.82); }
  bx(m, 'carpetDarker', 0.26, 0.74, 0.1, 0.34, 0.82, 0.92); // folded footrest
  bx(m, 'carpetDarker', 0.26, 0.74, 0.34, 0.4, 0.82, 0.9);
  return m;
}

function reclinerLeather() {
  const m = new Model('reclinerLeather');
  bx(m, 'metalDark', 0.14, 0.86, 0.05, 0.12, 0.16, 0.86);
  for (const x of [0.2, 0.8]) bx(m, 'metalDark', x - 0.04, x + 0.04, 0, 0.06, 0.2, 0.3);
  bx(m, 'carpetDarker', 0.1, 0.9, 0.12, 0.4, 0.1, 0.72);
  bx(m, 'carpetDarker', 0.24, 0.76, 0.4, 0.5, 0.26, 0.74);
  m.slab('carpetDarker', [0.1, 0.4, 0.2], [0.8, 0, 0], [0, 0.62, -0.2], [0, 0, 0.26]); // reclined back
  bx(m, 'carpetDarker', 0.24, 0.76, 0.86, 0.98, 0.0, 0.1);
  for (const x of [0.1, 0.9]) { const s = x < 0.5 ? 1 : -1; bx(m, 'carpetDarker', Math.min(x, x + s * 0.17), Math.max(x, x + s * 0.17), 0.4, 0.66, 0.12, 0.74); m.cyl('carpetDarker', [x + s * 0.085, 0.68, 0.12], [x + s * 0.085, 0.68, 0.74], 0.09, 8); }
  // extended footrest, reaching to the front of the footprint
  m.slab('carpetDarker', [0.26, 0.38, 0.74], [0.48, 0, 0], [0, 0.07, 0.16], [0, 0.08, 0]);
  bx(m, 'carpetDarker', 0.26, 0.74, 0.4, 0.5, 0.74, 0.96);
  bx(m, 'metal', 0.28, 0.32, 0.26, 0.4, 0.8, 0.84);
  bx(m, 'metal', 0.68, 0.72, 0.26, 0.4, 0.8, 0.84);
  return m;
}

function sofaChesterfield() {
  const m = new Model('sofaChesterfield');
  corners(m, 'woodDark', 0.1, 1.9, 0.12, 0.88, 0, 0.1, 0.08);
  bx(m, 'carpetDarker', 0.06, 1.94, 0.1, 0.42, 0.08, 0.92);
  bx(m, 'carpetDarker', 0.3, 1.7, 0.42, 0.52, 0.3, 0.92);
  bx(m, 'carpetDarker', 0.06, 1.94, 0.42, 0.88, 0.08, 0.32);
  for (const x of [0.06, 1.94]) { const s = x < 1 ? 1 : -1; bx(m, 'carpetDarker', Math.min(x, x + s * 0.24), Math.max(x, x + s * 0.24), 0.42, 0.68, 0.08, 0.92); m.cyl('carpetDarker', [x + s * 0.12, 0.7, 0.1], [x + s * 0.12, 0.7, 0.9], 0.12, 8); }
  for (const x of [0.58, 1.0, 1.42]) bx(m, 'carpetDarker', x - 0.2, x + 0.2, 0.52, 0.56, 0.3, 0.9);
  for (let i = 0; i < 6; i++) bx(m, 'metal', 0.4 + i * 0.24 - 0.012, 0.4 + i * 0.24 + 0.012, 0.66, 0.69, 0.325, 0.335);
  m.cyl('carpetDarker', [0.3, 0.88, 0.2], [1.7, 0.88, 0.2], 0.1, 8);
  return m;
}

function sofaMidcentury() {
  const m = new Model('sofaMidcentury');
  for (const x of [0.15, 1.85]) { rd(m, 'wood', [x, 0.3, 0.2], [x + (x < 1 ? -0.04 : 0.04), 0, 0.14], 0.05); rd(m, 'wood', [x, 0.3, 0.8], [x + (x < 1 ? -0.04 : 0.04), 0, 0.86], 0.05); }
  bx(m, 'wood', 0.1, 1.9, 0.28, 0.36, 0.14, 0.86);
  for (const x of [0.12, 1.88]) { bx(m, 'wood', x - 0.03, x + 0.03, 0.36, 0.62, 0.14, 0.86); bx(m, 'wood', x - 0.06, x + 0.06, 0.6, 0.64, 0.14, 0.86); }
  for (let i = 0; i < 3; i++) { const x0 = 0.15 + i * 0.57; bx(m, 'carpetBlue', x0, x0 + 0.57, 0.36, 0.5, 0.26, 0.86); m.slab('carpetBlue', [x0, 0.5, 0.26], [0.57, 0, 0], [0, 0.34, -0.08], [0, 0, 0.14]); }
  return m;
}

function sofaRustic() {
  const m = new Model('sofaRustic');
  corners(m, 'woodDark', 0.1, 1.9, 0.12, 0.88, 0, 0.3, 0.12);
  bx(m, 'wood', 0.06, 1.94, 0.3, 0.38, 0.1, 0.9);
  for (const x of [0.06, 1.94]) { const s = x < 1 ? 1 : -1; bx(m, 'wood', Math.min(x, x + s * 0.14), Math.max(x, x + s * 0.14), 0.38, 0.68, 0.1, 0.9); }
  bx(m, 'wood', 0.06, 1.94, 0.38, 0.9, 0.1, 0.18);
  for (let i = 0; i < 4; i++) bx(m, 'wood', 0.2 + i * 0.4, 0.2 + i * 0.4 + 0.32, 0.4, 0.88, 0.1, 0.16);
  for (let i = 0; i < 2; i++) { const x0 = 0.2 + i * 0.8; bx(m, 'carpetBlue', x0, x0 + 0.8, 0.38, 0.5, 0.22, 0.88); m.slab('carpetBlue', [x0, 0.5, 0.22], [0.8, 0, 0], [0, 0.32, -0.06], [0, 0, 0.14]); }
  bx(m, 'woodDark', 0.06, 1.94, 0.3, 0.34, 0.1, 0.9);
  return m;
}

function sofaIndustrial() {
  const m = new Model('sofaIndustrial');
  for (const x of [0.09, 1.91]) for (const z of [0.15, 0.85]) post(m, 'metalDark', x, z, 0, 0.18, 0.06);
  bx(m, 'metalDark', 0.06, 1.94, 0.16, 0.2, 0.12, 0.88);
  bx(m, 'carpetDarker', 0.06, 1.94, 0.2, 0.42, 0.1, 0.9);
  for (let i = 0; i < 3; i++) { const x0 = 0.28 + i * 0.48; bx(m, 'carpetDarker', x0, x0 + 0.48, 0.42, 0.52, 0.3, 0.9); bx(m, 'carpetDarker', x0, x0 + 0.48, 0.52, 0.86, 0.12, 0.32); }
  for (const x of [0.06, 1.94]) { const s = x < 1 ? 1 : -1; bx(m, 'metalDark', Math.min(x, x + s * 0.22), Math.max(x, x + s * 0.22), 0.2, 0.66, 0.1, 0.9); bx(m, 'carpetDarker', Math.min(x, x + s * 0.22), Math.max(x, x + s * 0.22), 0.5, 0.6, 0.1, 0.9); }
  bx(m, 'metalDark', 0.28, 1.72, 0.3, 0.88, 0.1, 0.12);
  return m;
}

function loveseatCottage() {
  const m = new Model('loveseatCottage');
  corners(m, 'woodDark', 0.2, 1.8, 0.14, 0.86, 0, 0.1, 0.07);
  bx(m, 'carpetWhite', 0.14, 1.86, 0.1, 0.42, 0.1, 0.9);
  bx(m, 'carpetBlue', 0.3, 1.7, 0.42, 0.52, 0.3, 0.9);
  bx(m, 'carpetWhite', 0.14, 1.86, 0.42, 0.9, 0.1, 0.3);
  for (const x of [0.14, 1.86]) { const s = x < 1 ? 1 : -1; bx(m, 'carpetWhite', Math.min(x, x + s * 0.16), Math.max(x, x + s * 0.16), 0.42, 0.62, 0.1, 0.9); m.cyl('carpetWhite', [x + s * 0.08, 0.64, 0.1], [x + s * 0.08, 0.64, 0.9], 0.08, 8); }
  bx(m, 'carpetBlue', 0.4, 0.8, 0.52, 0.8, 0.3, 0.4);
  bx(m, 'carpetBlue', 1.2, 1.6, 0.52, 0.8, 0.3, 0.4);
  bx(m, 'carpetBlue', 0.14, 1.86, 0.1, 0.14, 0.1, 0.9);
  return m;
}

function sofaBedConvertible() {
  const m = new Model('sofaBedConvertible');
  for (const x of [0.12, 1.88]) for (const z of [0.16, 0.84]) post(m, 'metal', x, z, 0, 0.14, 0.05);
  bx(m, 'metal', 0.08, 1.92, 0.14, 0.2, 0.12, 0.88);
  bx(m, 'carpetBlue', 0.08, 1.92, 0.2, 0.44, 0.1, 0.9);
  bx(m, 'carpetBlue', 0.28, 1.72, 0.44, 0.52, 0.3, 0.9);
  m.slab('carpetBlue', [0.28, 0.52, 0.28], [1.44, 0, 0], [0, 0.4, -0.1], [0, 0, 0.14]);
  for (const x of [0.08, 1.92]) { const s = x < 1 ? 1 : -1; bx(m, 'carpetBlue', Math.min(x, x + s * 0.2), Math.max(x, x + s * 0.2), 0.44, 0.66, 0.1, 0.9); }
  bx(m, 'carpetWhite', 0.9, 1.1, 0.46, 0.5, 0.88, 0.94); // pull handle for the fold-out mattress
  bx(m, 'carpetWhite', 0.34, 0.74, 0.54, 0.84, 0.3, 0.4);
  return m;
}

/** L-shaped sectional: back row along z 0.1..0.5 across x, the right arm column x 1.5..1.95 down to z 1.9; open corner at the left front. */
function sectionalModular() {
  const m = new Model('sectionalModular');
  const L = 0.06, Rr = 1.94;
  for (const [x, z] of [[0.15, 0.2], [1.85, 0.2], [0.15, 0.8], [1.55, 1.82], [1.85, 1.82]]) post(m, 'metal', x, z, 0, 0.14, 0.05);
  bx(m, 'carpetBlue', L, Rr, 0.14, 0.4, 0.06, 0.94); // back row base
  bx(m, 'carpetBlue', 1.06, Rr, 0.14, 0.4, 0.94, 1.94); // east column base
  bx(m, 'carpetBlue', 0.18, 1.06, 0.4, 0.5, 0.3, 0.94); bx(m, 'carpetBlue', 1.06, 1.76, 0.4, 0.5, 0.3, 0.94);
  bx(m, 'carpetBlue', 1.06, 1.76, 0.4, 0.5, 0.94, 1.94);
  bx(m, 'carpetBlue', L, Rr, 0.4, 0.84, 0.06, 0.3); // back
  bx(m, 'carpetBlue', 1.76, Rr, 0.4, 0.84, 0.3, 1.94); // east back
  bx(m, 'carpetBlue', L, 0.18, 0.4, 0.62, 0.3, 0.94); // west arm
  bx(m, 'carpetBlue', 1.06, 1.76, 0.4, 0.62, 1.84, 1.94);
  bx(m, 'carpetWhite', 0.3, 0.7, 0.5, 0.78, 0.3, 0.4);
  return m;
}

function sectionalCozy() {
  const m = new Model('sectionalCozy');
  for (const [x, z] of [[0.15, 0.2], [1.85, 0.2], [0.15, 0.8], [1.15, 1.85], [1.85, 1.85]]) post(m, 'woodDark', x, z, 0, 0.1, 0.07);
  bx(m, 'carpet', 0.06, 1.94, 0.1, 0.4, 0.06, 0.94);
  bx(m, 'carpet', 1.0, 1.94, 0.1, 0.4, 0.94, 1.94);
  for (const [x0, x1, z0, z1] of [[0.28, 1.0, 0.3, 0.94], [1.0, 1.7, 0.3, 0.94], [1.0, 1.7, 0.94, 1.9]]) bx(m, 'carpetDarker', x0, x1, 0.4, 0.5, z0, z1);
  bx(m, 'carpet', 0.06, 1.94, 0.4, 0.88, 0.06, 0.3);
  bx(m, 'carpet', 1.7, 1.94, 0.4, 0.88, 0.3, 1.94);
  bx(m, 'carpet', 0.06, 0.28, 0.4, 0.66, 0.3, 0.94);
  bx(m, 'carpet', 1.0, 1.7, 0.4, 0.62, 1.84, 1.94);
  bx(m, 'carpetWhite', 0.34, 0.76, 0.5, 0.82, 0.3, 0.4);
  bx(m, 'carpetWhite', 1.2, 1.6, 0.5, 0.78, 0.3, 0.4);
  return m;
}

function chaiseLongue() {
  const m = new Model('chaiseLongue');
  for (const x of [0.22, 0.78]) for (const z of [0.18, 0.55, 1.75]) rd(m, 'woodDark', [x, 0.2, z], [x + (x < 0.5 ? -0.03 : 0.03), 0, z], 0.06);
  bx(m, 'woodDark', 0.16, 0.84, 0.2, 0.26, 0.1, 1.9);
  bx(m, 'carpetBlue', 0.14, 0.86, 0.26, 0.42, 0.14, 1.9);
  bx(m, 'carpetDarker', 0.18, 0.82, 0.42, 0.48, 0.4, 1.86);
  m.slab('carpetBlue', [0.14, 0.42, 0.14], [0.72, 0, 0], [0, 0.55, 0.1], [0, 0, 0.12]);
  bx(m, 'carpetBlue', 0.14, 0.86, 0.42, 0.78, 0.14, 0.26);
  m.cyl('carpetBlue', [0.14, 0.62, 0.32], [0.14, 0.62, 1.2], 0.08, 8);
  m.cyl('carpetBlue', [0.86, 0.62, 0.32], [0.86, 0.62, 1.2], 0.08, 8);
  bx(m, 'carpetBlue', 0.14, 0.2, 0.42, 0.6, 0.14, 1.2);
  bx(m, 'carpetBlue', 0.8, 0.86, 0.42, 0.6, 0.14, 1.2);
  bx(m, 'carpetWhite', 0.3, 0.7, 0.5, 0.74, 0.28, 0.4);
  return m;
}

// --- Benches, ottomans, poufs and floor seating ----------------------------------------------

function benchEntryStorage() {
  const m = new Model('benchEntryStorage');
  for (const x of [0.12, 0.88]) bx(m, 'woodDark', x - 0.04, x + 0.04, 0, 0.44, 0.3, 0.7);
  bx(m, 'wood', 0.1, 0.9, 0.18, 0.22, 0.32, 0.68);
  bx(m, 'wood', 0.1, 0.9, 0.38, 0.44, 0.3, 0.7);
  bx(m, 'carpetBlue', 0.1, 0.9, 0.44, 0.52, 0.3, 0.7);
  for (const x of [0.28, 0.5, 0.72]) bx(m, 'woodDark', x - 0.07, x + 0.07, 0.04, 0.16, 0.36, 0.64); // baskets
  for (const x of [0.28, 0.5, 0.72]) bx(m, 'carpetWhite', x - 0.07, x + 0.07, 0.2, 0.36, 0.4, 0.6);
  return m;
}

function benchSlat() {
  const m = new Model('benchSlat');
  for (const x of [0.25, 1.75]) for (const z of [0.36, 0.64]) rd(m, 'wood', [x, 0.42, z], [x + (x < 1 ? -0.05 : 0.05), 0, z + (z < 0.5 ? -0.04 : 0.04)], 0.05);
  for (const x of [0.1, 1.9]) bx(m, 'woodDark', x - 0.03, x + 0.03, 0.4, 0.44, 0.28, 0.72);
  for (let i = 0; i < 5; i++) bx(m, 'wood', 0.1, 1.9, 0.42, 0.47, 0.28 + i * 0.09, 0.28 + i * 0.09 + 0.07);
  rd(m, 'woodDark', [0.25, 0.25, 0.5], [1.75, 0.25, 0.5], 0.04);
  return m;
}

function windowSeat() {
  const m = new Model('windowSeat');
  bx(m, 'wood', 0.04, 1.96, 0, 0.1, 0.06, 0.94);
  bx(m, 'wood', 0.04, 0.1, 0.1, 0.5, 0.06, 0.94);
  bx(m, 'wood', 1.9, 1.96, 0.1, 0.5, 0.06, 0.94);
  bx(m, 'wood', 0.04, 1.96, 0.1, 0.5, 0.06, 0.12);
  for (const x of [0.4, 1.0, 1.6]) { bx(m, 'woodDark', x - 0.24, x + 0.24, 0.14, 0.44, 0.9, 0.94); bx(m, 'wood', x - 0.2, x + 0.2, 0.18, 0.4, 0.935, 0.95); }
  bx(m, 'carpetBlue', 0.1, 1.9, 0.5, 0.62, 0.12, 0.94);
  bx(m, 'carpetWhite', 0.14, 0.54, 0.62, 0.9, 0.12, 0.32);
  bx(m, 'carpet', 1.46, 1.86, 0.62, 0.9, 0.14, 0.34);
  bx(m, 'woodDark', 0.04, 1.96, 0.5, 0.54, 0.06, 0.94);
  return m;
}

function ottomanStorage() {
  const m = new Model('ottomanStorage');
  corners(m, 'woodDark', 0.2, 0.8, 0.2, 0.8, 0, 0.1, 0.07);
  bx(m, 'carpetDarker', 0.15, 0.85, 0.1, 0.42, 0.15, 0.85);
  bx(m, 'carpetDarker', 0.13, 0.87, 0.42, 0.48, 0.13, 0.87);
  bx(m, 'carpetBlue', 0.17, 0.83, 0.48, 0.52, 0.17, 0.83);
  bx(m, 'metal', 0.46, 0.54, 0.3, 0.34, 0.85, 0.88);
  for (const x of [0.25, 0.75]) for (const z of [0.25, 0.75]) bx(m, 'metal', x - 0.015, x + 0.015, 0.52, 0.54, z - 0.015, z + 0.015);
  return m;
}

function poufKnit() {
  const m = new Model('poufKnit');
  m.lathe('carpetWhite', 0.5, 0.5, [[0.28, 0], [0.34, 0.1], [0.36, 0.22], [0.3, 0.36], [0.24, 0.4]], 10);
  m.cylY('carpetBlue', 0.5, 0.5, 0.4, 0.42, 0.2, 0.2, 10);
  m.cylY('carpetBlue', 0.5, 0.5, 0.1, 0.14, 0.37, 0.37, 10);
  return m;
}

function poufLeather() {
  const m = new Model('poufLeather');
  m.cylY('carpetDarker', 0.5, 0.5, 0, 0.36, 0.3, 0.3, 12);
  m.cylY('carpetDarker', 0.5, 0.5, 0.36, 0.42, 0.27, 0.22, 12);
  m.cylY('metal', 0.5, 0.5, 0.0, 0.03, 0.31, 0.31, 12);
  m.cylY('metal', 0.5, 0.5, 0.42, 0.44, 0.05, 0.05, 6);
  return m;
}

function floorCushions() {
  const m = new Model('floorCushions');
  bx(m, 'carpetBlue', 0.15, 0.85, 0, 0.12, 0.15, 0.85);
  bx(m, 'carpetBlue', 0.18, 0.82, 0.12, 0.16, 0.18, 0.82);
  bx(m, 'carpet', 0.2, 0.8, 0.16, 0.26, 0.2, 0.8);
  bx(m, 'carpetWhite', 0.23, 0.77, 0.26, 0.32, 0.23, 0.77);
  bx(m, 'carpetDarker', 0.46, 0.54, 0.32, 0.34, 0.46, 0.54);
  return m;
}

function beanBag() {
  const m = new Model('beanBag');
  m.lathe('carpet', 0.5, 0.5, [[0.3, 0], [0.4, 0.08], [0.42, 0.2], [0.36, 0.32], [0.25, 0.4], [0.2, 0.42]], 10);
  // slumped back lobe
  m.lathe('carpet', 0.5, 0.36, [[0.28, 0.12], [0.3, 0.3], [0.26, 0.55], [0.2, 0.68], [0.12, 0.72]], 10);
  m.lathe('carpetDarker', 0.5, 0.28, [[0.14, 0.7], [0.12, 0.74]], 8);
  return m;
}

// --- Office and gaming chairs ----------------------------------------------------------------

function officeMesh() {
  const m = new Model('officeMesh');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; rd(m, 'metalDark', [0.5, 0.1, 0.5], [0.5 + 0.28 * Math.cos(a), 0.08, 0.5 + 0.28 * Math.sin(a)], 0.05, 0.04); bx(m, 'metalDark', 0.5 + 0.28 * Math.cos(a) - 0.03, 0.5 + 0.28 * Math.cos(a) + 0.03, 0, 0.07, 0.5 + 0.28 * Math.sin(a) - 0.03, 0.5 + 0.28 * Math.sin(a) + 0.03); }
  m.cylY('metalMedium', 0.5, 0.5, 0.1, 0.4, 0.03, 0.03, 8);
  bx(m, 'metalMedium', 0.3, 0.7, 0.4, 0.44, 0.3, 0.7);
  bx(m, 'metalDark', 0.28, 0.72, 0.44, 0.52, 0.28, 0.72);
  bx(m, 'metalDark', 0.46, 0.54, 0.4, 0.5, 0.26, 0.32);
  bx(m, 'metalMedium', 0.3, 0.7, 0.52, 0.56, 0.3, 0.7);
  for (const s of [-1, 1]) { bx(m, 'metalMedium', 0.5 + s * 0.24 - 0.02, 0.5 + s * 0.24 + 0.02, 0.56, 0.76, 0.34, 0.38); bx(m, 'metalMedium', 0.5 + s * 0.24 - 0.04, 0.5 + s * 0.24 + 0.04, 0.74, 0.78, 0.3, 0.6); }
  bx(m, 'metalMedium', 0.28, 0.72, 0.56, 1.0, 0.24, 0.28);
  bx(m, 'metalMedium', 0.26, 0.74, 0.54, 1.02, 0.22, 0.24);
  bx(m, 'metalDark', 0.34, 0.66, 0.62, 0.94, 0.275, 0.3);
  return m;
}

function officeExecutive() {
  const m = new Model('officeExecutive');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; rd(m, 'metal', [0.5, 0.11, 0.5], [0.5 + 0.3 * Math.cos(a), 0.09, 0.5 + 0.3 * Math.sin(a)], 0.05, 0.04); bx(m, 'metalDark', 0.5 + 0.3 * Math.cos(a) - 0.03, 0.5 + 0.3 * Math.cos(a) + 0.03, 0, 0.08, 0.5 + 0.3 * Math.sin(a) - 0.03, 0.5 + 0.3 * Math.sin(a) + 0.03); }
  m.cylY('metal', 0.5, 0.5, 0.11, 0.4, 0.035, 0.035, 8);
  bx(m, 'carpetDarker', 0.24, 0.76, 0.4, 0.52, 0.24, 0.76);
  bx(m, 'carpetDarker', 0.46, 0.54, 0.4, 0.5, 0.2, 0.26);
  m.slab('carpetDarker', [0.26, 0.5, 0.22], [0.48, 0, 0], [0, 0.55, -0.06], [0, 0, 0.16]);
  bx(m, 'carpetDarker', 0.3, 0.7, 1.04, 1.2, 0.14, 0.26);
  for (const s of [-1, 1]) { const x = 0.5 + s * 0.28; bx(m, 'metal', x - 0.015, x + 0.015, 0.52, 0.66, 0.4, 0.44); bx(m, 'carpetDarker', x - 0.04, x + 0.04, 0.66, 0.72, 0.3, 0.66); }
  return m;
}

function chairGaming() {
  const m = new Model('chairGaming');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; rd(m, 'metalDark', [0.5, 0.1, 0.5], [0.5 + 0.3 * Math.cos(a), 0.08, 0.5 + 0.3 * Math.sin(a)], 0.06, 0.045); bx(m, 'metalDark', 0.5 + 0.3 * Math.cos(a) - 0.035, 0.5 + 0.3 * Math.cos(a) + 0.035, 0, 0.07, 0.5 + 0.3 * Math.sin(a) - 0.035, 0.5 + 0.3 * Math.sin(a) + 0.035); }
  m.cylY('metalMedium', 0.5, 0.5, 0.1, 0.38, 0.04, 0.04, 8);
  bx(m, 'metalDark', 0.26, 0.74, 0.38, 0.44, 0.26, 0.74);
  bx(m, 'carpetDarker', 0.24, 0.76, 0.44, 0.52, 0.24, 0.76); // bolsters
  bx(m, 'carpet', 0.32, 0.68, 0.46, 0.54, 0.26, 0.74);
  m.slab('carpetDarker', [0.24, 0.5, 0.28], [0.52, 0, 0], [0, 0.55, -0.1], [0, 0, 0.12]);
  m.slab('carpet', [0.34, 0.52, 0.28], [0.32, 0, 0], [0, 0.5, -0.09], [0, 0, 0.13]);
  m.slab('carpetDarker', [0.28, 1.0, 0.16], [0.44, 0, 0], [0, 0.22, -0.02], [0, 0, 0.1]);
  m.slab('carpetDarker', [0.22, 0.52, 0.26], [0.1, 0, 0], [0, 0.36, -0.08], [0, 0, 0.14]);
  m.slab('carpetDarker', [0.68, 0.52, 0.26], [0.1, 0, 0], [0, 0.36, -0.08], [0, 0, 0.14]);
  for (const s of [-1, 1]) { const x = 0.5 + s * 0.3; bx(m, 'metalMedium', x - 0.015, x + 0.015, 0.52, 0.68, 0.4, 0.44); bx(m, 'metalDark', x - 0.045, x + 0.045, 0.68, 0.73, 0.32, 0.64); }
  bx(m, 'carpetWhite', 0.42, 0.58, 0.8, 0.9, 0.29, 0.34);
  return m;
}

// --- Single beds (1 x 2 tiles, headboard at the back) ----------------------------------------

function bedSinglePlatform() {
  const m = new Model('bedSinglePlatform');
  bx(m, 'wood', 0.05, 0.95, 0.06, 0.28, 0.02, 1.9);
  bx(m, 'woodDark', 0.07, 0.93, 0, 0.06, 0.1, 1.82);
  bx(m, 'woodDark', 0.05, 0.95, 0.28, 0.8, 0.02, 0.07);
  bedding(m, 0.08, 0.92, 0.07, 1.88, 0.5, { cover: 'carpetBlue', thick: 0.22 });
  return m;
}

function bedSingleIron() {
  const m = new Model('bedSingleIron');
  for (const z of [0.04, 1.88]) for (const x of [0.07, 0.93]) post(m, 'metalDark', x, z, 0, z < 1 ? 1.0 : 0.7, 0.05);
  for (const [z, h] of [[0.04, 1.0], [1.88, 0.7]]) {
    bx(m, 'metalDark', 0.05, 0.95, h - 0.05, h, z - 0.02, z + 0.02);
    bx(m, 'metalDark', 0.05, 0.95, 0.3, 0.34, z - 0.02, z + 0.02);
    for (let i = 1; i < 7; i++) bx(m, 'metalDark', 0.07 + i * 0.122 - 0.01, 0.07 + i * 0.122 + 0.01, 0.34, h - 0.05, z - 0.01, z + 0.01);
    m.cylY('metal', 0.07, z, h, h + 0.05, 0.035, 0.035, 6); m.cylY('metal', 0.93, z, h, h + 0.05, 0.035, 0.035, 6);
  }
  for (const x of [0.07, 0.93]) bx(m, 'metalDark', x - 0.015, x + 0.015, 0.26, 0.32, 0.04, 1.88);
  bx(m, 'metalMedium', 0.08, 0.92, 0.3, 0.34, 0.07, 1.86);
  bedding(m, 0.1, 0.9, 0.08, 1.85, 0.55, { cover: 'carpetBlue', sheet: 'carpetWhite', thick: 0.2 });
  return m;
}

function bedSingleRustic() {
  const m = new Model('bedSingleRustic');
  for (const x of [0.08, 0.92]) { bx(m, 'woodDark', x - 0.06, x + 0.06, 0, 0.95, 0.0, 0.12); bx(m, 'woodDark', x - 0.06, x + 0.06, 0, 0.5, 1.78, 1.9); }
  bx(m, 'wood', 0.1, 0.9, 0.55, 0.9, 0.02, 0.1);
  for (const y of [0.62, 0.74, 0.86]) bx(m, 'wood', 0.02, 0.98, y - 0.04, y + 0.04, 0.0, 0.12);
  bx(m, 'wood', 0.1, 0.9, 0.2, 0.46, 1.78, 1.9);
  for (const x of [0.08, 0.92]) bx(m, 'wood', x - 0.05, x + 0.05, 0.22, 0.34, 0.1, 1.8);
  bedding(m, 0.14, 0.86, 0.1, 1.78, 0.5, { cover: 'carpetDarker', thick: 0.22 });
  return m;
}

function bedSingleMidcentury() {
  const m = new Model('bedSingleMidcentury');
  for (const sx of [-1, 1]) for (const z of [0.15, 1.75]) rd(m, 'wood', [0.5 + sx * 0.36, 0.28, z], [0.5 + sx * 0.4, 0, z + (z < 1 ? -0.05 : 0.05)], 0.055);
  bx(m, 'woodDark', 0.08, 0.92, 0.26, 0.34, 0.08, 1.84);
  for (let i = 0; i < 5; i++) bx(m, 'wood', 0.1 + i * 0.164, 0.1 + i * 0.164 + 0.1, 0.34, 0.9, 0.0, 0.05);
  bx(m, 'wood', 0.06, 0.94, 0.78, 0.86, 0.0, 0.07);
  bedding(m, 0.1, 0.9, 0.08, 1.82, 0.5, { cover: 'carpet', thick: 0.16 });
  return m;
}

function bedSingleSleigh() {
  const m = new Model('bedSingleSleigh');
  for (const x of [0.1, 0.9]) { post(m, 'woodDark', x, 0.06, 0, 0.5, 0.08); post(m, 'woodDark', x, 1.84, 0, 0.4, 0.08); }
  bx(m, 'wood', 0.06, 0.94, 0.14, 0.2, 0.02, 1.9);
  bx(m, 'wood', 0.06, 0.94, 0.2, 0.9, 0.02, 0.1);
  m.cyl('woodDark', [0.06, 0.92, 0.04], [0.94, 0.92, 0.04], 0.07, 8);
  bx(m, 'wood', 0.06, 0.94, 0.2, 0.62, 1.8, 1.9);
  m.cyl('woodDark', [0.06, 0.64, 1.85], [0.94, 0.64, 1.85], 0.06, 8);
  for (const x of [0.06, 0.94]) bx(m, 'wood', x - 0.03, x + 0.03, 0.2, 0.34, 0.1, 1.8);
  bedding(m, 0.1, 0.9, 0.1, 1.8, 0.5, { cover: 'carpetBlue', thick: 0.22 });
  return m;
}

// --- Double beds (2 x 2 tiles) ---------------------------------------------------------------

function bedDoubleRustic() {
  const m = new Model('bedDoubleRustic');
  const x0 = 0.28, x1 = 1.72;
  for (const x of [x0, x1]) { bx(m, 'woodDark', x - 0.07, x + 0.07, 0, 1.05, 0.0, 0.14); bx(m, 'woodDark', x - 0.07, x + 0.07, 0, 0.55, 1.76, 1.9); }
  for (const y of [0.62, 0.76, 0.9]) bx(m, 'wood', x0 - 0.07, x1 + 0.07, y - 0.05, y + 0.05, 0.0, 0.14);
  bx(m, 'wood', x0, x1, 0.2, 0.5, 1.76, 1.9);
  for (const x of [x0, x1]) bx(m, 'wood', x - 0.05, x + 0.05, 0.22, 0.36, 0.14, 1.78);
  for (const x of [0.9, 1.1]) bx(m, 'woodDark', x - 0.05, x + 0.05, 0, 0.22, 0.0, 0.14);
  bedding(m, x0 + 0.06, x1 - 0.06, 0.14, 1.78, 0.52, { cover: 'carpetDarker', pillows: 2, thick: 0.24 });
  return m;
}

function bedDoubleIron() {
  const m = new Model('bedDoubleIron');
  const x0 = 0.3, x1 = 1.7;
  for (const [z, h] of [[0.04, 1.2], [1.88, 0.8]]) {
    for (const x of [x0, x1]) { post(m, 'metalDark', x, z, 0, h, 0.06); m.cylY('metal', x, z, h, h + 0.06, 0.04, 0.04, 6); }
    bx(m, 'metalDark', x0, x1, h - 0.06, h, z - 0.02, z + 0.02);
    bx(m, 'metalDark', x0, x1, 0.3, 0.34, z - 0.02, z + 0.02);
    for (let i = 1; i < 10; i++) bx(m, 'metalDark', x0 + i * 0.14 - 0.01, x0 + i * 0.14 + 0.01, 0.34, h - 0.06, z - 0.01, z + 0.01);
    if (z < 1) m.cyl('metal', [1.0, h - 0.02, z], [1.0, h + 0.1, z], 0.06, 8);
  }
  for (const x of [x0, x1]) bx(m, 'metalDark', x - 0.02, x + 0.02, 0.28, 0.34, 0.04, 1.88);
  bx(m, 'metalMedium', x0 + 0.02, x1 - 0.02, 0.3, 0.34, 0.06, 1.86);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.08, 1.84, 0.55, { cover: 'carpetBlue', pillows: 2 });
  return m;
}

function bedDoubleMidcentury() {
  const m = new Model('bedDoubleMidcentury');
  const x0 = 0.25, x1 = 1.75;
  for (const sx of [-1, 1]) for (const z of [0.15, 1.75]) rd(m, 'wood', [1 + sx * 0.62, 0.3, z], [1 + sx * 0.68, 0, z + (z < 1 ? -0.05 : 0.05)], 0.06);
  bx(m, 'woodDark', x0, x1, 0.28, 0.36, 0.08, 1.86);
  bx(m, 'wood', x0 - 0.02, x1 + 0.02, 0.36, 1.0, 0.0, 0.07);
  for (const x of [0.62, 1.0, 1.38]) bx(m, 'woodDark', x - 0.015, x + 0.015, 0.4, 0.96, 0.07, 0.09);
  for (const s of [-1, 1]) { bx(m, 'wood', 1 + s * 0.88 - 0.1, 1 + s * 0.88 + 0.1, 0.4, 0.44, 0.0, 0.3); post(m, 'wood', 1 + s * 0.88, 0.25, 0.0, 0.4, 0.04); }
  bedding(m, x0 + 0.04, x1 - 0.04, 0.09, 1.84, 0.52, { cover: 'carpetBlue', pillows: 2, thick: 0.16 });
  return m;
}

function bedDoubleBasic() {
  const m = new Model('bedDoubleBasic');
  const x0 = 0.3, x1 = 1.7;
  for (const x of [x0, x1]) for (const z of [0.1, 1.84]) post(m, 'metal', x, z, 0, 0.3, 0.05);
  bx(m, 'metal', x0 - 0.02, x1 + 0.02, 0.22, 0.3, 0.06, 1.88);
  bx(m, 'metalMedium', x0 + 0.03, x1 - 0.03, 0.3, 0.34, 0.08, 1.86);
  bx(m, 'wood', x0 - 0.02, x1 + 0.02, 0.3, 0.7, 0.02, 0.08);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.08, 1.86, 0.5, { cover: 'carpet', pillows: 2, thick: 0.16 });
  return m;
}

// --- Queen and king beds (2 x 2 tiles) -------------------------------------------------------

function bedQueenUpholstered() {
  const m = new Model('bedQueenUpholstered');
  const x0 = 0.2, x1 = 1.8;
  for (const x of [x0 + 0.06, x1 - 0.06]) for (const z of [0.12, 1.82]) post(m, 'woodDark', x, z, 0, 0.1, 0.07);
  bx(m, 'carpetBlue', x0, x1, 0.1, 0.36, 0.1, 1.9);
  bx(m, 'carpetBlue', x0 - 0.02, x1 + 0.02, 0.1, 1.15, 0.02, 0.14);
  for (const y of [0.7, 0.9]) for (const x of [0.5, 0.75, 1.0, 1.25, 1.5]) bx(m, 'carpetDarker', x - 0.025, x + 0.025, y - 0.025, y + 0.025, 0.14, 0.17);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.16, 1.88, 0.56, { cover: 'carpetWhite', sheet: 'carpetWhite', pillowMat: 'carpetDarker', pillows: 2, thick: 0.2, coverFrom: 0.5 });
  return m;
}

function bedQueenIndustrial() {
  const m = new Model('bedQueenIndustrial');
  const x0 = 0.2, x1 = 1.8;
  for (const x of [x0, x1]) { rd(m, 'metalDark', [x, 0, 0.04], [x, 1.1, 0.04], 0.06); rd(m, 'metalDark', [x, 0, 1.9], [x, 0.5, 1.9], 0.06); }
  bx(m, 'metalDark', x0 - 0.03, x1 + 0.03, 0.9, 0.96, 0.01, 0.07);
  bx(m, 'metalDark', x0 - 0.03, x1 + 0.03, 1.08, 1.14, 0.01, 0.07);
  for (let i = 0; i < 4; i++) bx(m, 'wood', x0, x1, 0.4 + i * 0.12, 0.4 + i * 0.12 + 0.1, 0.02, 0.06);
  for (const x of [x0, x1]) bx(m, 'metalDark', x - 0.03, x + 0.03, 0.24, 0.34, 0.04, 1.9);
  bx(m, 'metalMedium', x0, x1, 0.24, 0.3, 0.04, 1.9);
  bx(m, 'wood', x0 - 0.03, x1 + 0.03, 0.34, 0.46, 1.84, 1.9);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.08, 1.84, 0.54, { cover: 'carpetDarker', pillows: 2, thick: 0.2 });
  return m;
}

function bedQueenLuxury() {
  const m = new Model('bedQueenLuxury');
  const x0 = 0.2, x1 = 1.8;
  for (const x of [x0 + 0.08, x1 - 0.08]) for (const z of [0.14, 1.8]) bx(m, 'metal', x - 0.04, x + 0.04, 0, 0.1, z - 0.04, z + 0.04);
  bx(m, 'carpetDarker', x0, x1, 0.1, 0.4, 0.1, 1.92);
  bx(m, 'carpetBlue', x0 - 0.04, x1 + 0.04, 0.1, 1.4, 0.02, 0.15);
  bx(m, 'carpetBlue', x0 + 0.12, x1 - 0.12, 1.4, 1.5, 0.02, 0.15);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) bx(m, 'metal', x0 + 0.2 + c * 0.24 - 0.02, x0 + 0.2 + c * 0.24 + 0.02, 0.62 + r * 0.2 - 0.02, 0.62 + r * 0.2 + 0.02, 0.15, 0.17);
  bx(m, 'metal', x0 - 0.05, x1 + 0.05, 0.36, 0.42, 0.02, 0.06);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.16, 1.9, 0.6, { cover: 'carpetWhite', pillowMat: 'carpetBlue', pillows: 3, thick: 0.2, coverFrom: 0.42 });
  bx(m, 'carpetBlue', x0 + 0.03, x1 - 0.03, 0.55, 0.66, 1.2, 1.5);
  bx(m, 'carpetBlue', x0 + 0.04, x1 - 0.04, 0.6, 0.68, 1.5, 1.6);
  return m;
}

function bedQueenSleigh() {
  const m = new Model('bedQueenSleigh');
  const x0 = 0.2, x1 = 1.8;
  for (const x of [x0 + 0.03, x1 - 0.03]) { post(m, 'woodDark', x, 0.07, 0, 0.7, 0.1); post(m, 'woodDark', x, 1.86, 0, 0.5, 0.1); m.cylY('metal', x, 0.07, 1.1, 1.18, 0.045, 0.02, 8); }
  bx(m, 'wood', x0 - 0.02, x1 + 0.02, 0.16, 0.24, 0.02, 1.92);
  bx(m, 'wood', x0 - 0.02, x1 + 0.02, 0.24, 1.0, 0.02, 0.12);
  m.cyl('woodDark', [x0 - 0.02, 1.0, 0.09], [x1 + 0.02, 1.0, 0.09], 0.07, 8);
  bx(m, 'wood', x0 - 0.02, x1 + 0.02, 0.24, 0.6, 1.8, 1.92);
  m.cyl('woodDark', [x0 - 0.02, 0.64, 1.86], [x1 + 0.02, 0.64, 1.86], 0.07, 8);
  bx(m, 'woodDark', x0 - 0.02, x1 + 0.02, 0.5, 0.58, 0.04, 0.12);
  for (const x of [x0 - 0.02, x1 - 0.02]) bx(m, 'wood', x, x + 0.04, 0.24, 0.4, 0.12, 1.8);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.12, 1.8, 0.56, { cover: 'carpetDarker', pillows: 2, thick: 0.2 });
  return m;
}

function bedKingModern() {
  const m = new Model('bedKingModern');
  const x0 = 0.05, x1 = 1.95;
  bx(m, 'woodDark', x0 + 0.05, x1 - 0.05, 0, 0.1, 0.14, 1.84);
  bx(m, 'wood', x0, x1, 0.1, 0.34, 0.1, 1.9);
  for (let i = 0; i < 9; i++) bx(m, 'woodDark', x0 + 0.04 + i * 0.2, x0 + 0.04 + i * 0.2 + 0.16, 0.34, 1.0, 0.0, 0.1);
  bx(m, 'wood', x0, x1, 0.94, 1.02, 0.0, 0.14);
  for (const x of [x0 - 0.0, x1 - 0.0]) bx(m, 'wood', x - (x < 1 ? 0 : 0.05), x + (x < 1 ? 0.05 : 0), 0.34, 0.5, 0.1, 0.3);
  bedding(m, x0 + 0.06, x1 - 0.06, 0.14, 1.88, 0.55, { cover: 'carpetBlue', pillowMat: 'carpetWhite', pillows: 2, thick: 0.21 });
  return m;
}

function bedKingLuxury() {
  const m = new Model('bedKingLuxury');
  const x0 = 0.05, x1 = 1.95;
  for (const x of [x0 + 0.08, x1 - 0.08]) { post(m, 'woodDark', x, 0.1, 0, 1.55, 0.14); m.cylY('metal', x, 0.1, 1.55, 1.64, 0.06, 0.03, 8); post(m, 'woodDark', x, 1.86, 0, 0.55, 0.12); m.cylY('metal', x, 1.86, 0.55, 0.62, 0.05, 0.03, 8); }
  bx(m, 'woodDark', x0, x1, 0.1, 0.4, 0.04, 1.94);
  bx(m, 'carpetDarker', x0 + 0.02, x1 - 0.02, 0.06, 0.34, 0.1, 1.92);
  bx(m, 'woodDark', x0 + 0.08, x1 - 0.08, 0.34, 1.05, 0.04, 0.12);
  bx(m, 'carpetBlue', x0 + 0.22, x1 - 0.22, 0.46, 1.4, 0.12, 0.2);
  bx(m, 'woodDark', x0 + 0.08, x1 - 0.08, 1.4, 1.5, 0.04, 0.14);
  bx(m, 'woodDark', x0 + 0.08, x1 - 0.08, 0.44, 0.52, 1.84, 1.94);
  bedding(m, x0 + 0.1, x1 - 0.1, 0.2, 1.84, 0.62, { cover: 'carpetWhite', pillowMat: 'carpetBlue', pillows: 3, thick: 0.22, coverFrom: 0.4 });
  bx(m, 'carpetBlue', x0 + 0.1, x1 - 0.1, 0.6, 0.68, 1.4, 1.6);
  return m;
}

function bedKingRustic() {
  const m = new Model('bedKingRustic');
  const x0 = 0.1, x1 = 1.9;
  for (const x of [x0, x1]) { bx(m, 'woodDark', x - 0.08, x + 0.08, 0, 1.2, 0.0, 0.16); bx(m, 'woodDark', x - 0.08, x + 0.08, 0, 0.6, 1.76, 1.92); }
  for (const y of [0.55, 0.7, 0.85, 1.0, 1.12]) bx(m, 'wood', x0 - 0.06, x1 + 0.06, y - 0.05, y + 0.05, 0.02, 0.14);
  bx(m, 'wood', x0, x1, 0.22, 0.56, 1.76, 1.92);
  for (const x of [x0, x1]) bx(m, 'wood', x - 0.06, x + 0.06, 0.24, 0.4, 0.16, 1.78);
  for (const x of [x0 + 0.5, x1 - 0.5]) bx(m, 'woodDark', x - 0.07, x + 0.07, 0, 0.24, 0.0, 0.16);
  bx(m, 'woodDark', x0 + 0.04, x1 - 0.04, 0.2, 0.28, 0.16, 1.76);
  bedding(m, x0 + 0.1, x1 - 0.1, 0.16, 1.78, 0.54, { cover: 'carpetDarker', pillows: 3, thick: 0.26 });
  return m;
}

// --- Bunk and loft beds (1 x 2 tiles) --------------------------------------------------------

function bedBunkIndustrial() {
  const m = new Model('bedBunkIndustrial');
  for (const x of [0.07, 0.93]) for (const z of [0.05, 1.7]) post(m, 'metalDark', x, z, 0, 1.6, 0.05);
  for (const y of [0.25, 0.9]) { bx(m, 'metalDark', 0.05, 0.95, y - 0.02, y + 0.02, 0.03, 1.72); for (const x of [0.07, 0.93]) bx(m, 'metalDark', x - 0.02, x + 0.02, y, y + 0.06, 0.03, 1.72); }
  bedding(m, 0.1, 0.9, 0.06, 1.68, 0.38, { cover: 'carpetBlue', thick: 0.14, pillows: 1 });
  bedding(m, 0.1, 0.9, 0.06, 1.68, 1.03, { cover: 'carpetDarker', thick: 0.14, pillows: 1 });
  for (const x of [0.07, 0.93]) { rd(m, 'metalDark', [x, 1.05, 0.05], [x, 1.35, 0.05], 0.03); rd(m, 'metalDark', [x, 1.35, 0.05], [x, 1.35, 1.7], 0.03); }
  for (const x of [0.12, 0.88]) rd(m, 'metalDark', [x, 0.95, 1.78], [x, 1.55, 1.78], 0.035);
  for (let i = 0; i < 6; i++) bx(m, 'metal', 0.12, 0.88, 0.2 + i * 0.22 - 0.015, 0.2 + i * 0.22 + 0.015, 1.76, 1.8);
  rd(m, 'metalDark', [0.12, 0.4, 1.75], [0.12, 0.95, 1.75], 0.035);
  rd(m, 'metalDark', [0.88, 0.4, 1.75], [0.88, 0.95, 1.75], 0.035);
  return m;
}

function bedBunkModern() {
  const m = new Model('bedBunkModern');
  for (const x of [0.09, 0.91]) for (const z of [0.07, 1.6]) post(m, 'wood', x, z, 0, 1.55, 0.09);
  for (const y of [0.22, 0.85]) bx(m, 'woodDark', 0.04, 0.96, y - 0.04, y + 0.04, 0.02, 1.66);
  for (const y of [0.3, 0.92]) for (const x of [0.06, 0.94]) bx(m, 'wood', x - 0.02, x + 0.02, y + 0.04, y + 0.2, 0.02, 1.66);
  bedding(m, 0.1, 0.9, 0.06, 1.64, 0.36, { cover: 'carpetBlue', thick: 0.14 });
  bedding(m, 0.1, 0.9, 0.06, 1.64, 0.99, { cover: 'carpet', thick: 0.14 });
  bx(m, 'wood', 0.04, 0.96, 1.12, 1.55, 0.0, 0.04);
  // steps up at the foot: tilted ladder with flat treads
  for (let i = 0; i < 5; i++) { const y = 0.17 + i * 0.17; bx(m, 'woodDark', 0.2, 0.8, y, y + 0.04, 1.82 - i * 0.04, 1.92 - i * 0.04); }
  for (const x of [0.2, 0.8]) rd(m, 'wood', [x, 0.0, 1.92], [x, 0.9, 1.7], 0.04);
  return m;
}

function bedLoftKids() {
  const m = new Model('bedLoftKids');
  for (const x of [0.08, 0.92]) for (const z of [0.07, 1.65]) post(m, 'wood', x, z, 0, 1.75, 0.09);
  bx(m, 'woodDark', 0.04, 0.96, 1.04, 1.12, 0.02, 1.7);
  bedding(m, 0.1, 0.9, 0.06, 1.66, 1.2, { cover: 'carpet', thick: 0.14 });
  for (const x of [0.06, 0.94]) bx(m, 'wood', x - 0.02, x + 0.02, 1.2, 1.5, 0.02, 1.7);
  bx(m, 'wood', 0.04, 0.96, 1.4, 1.5, 0.02, 0.06);
  for (let i = 0; i < 6; i++) bx(m, 'woodDark', 0.15, 0.85, 0.15 + i * 0.17, 0.19 + i * 0.17, 1.76, 1.82);
  for (const x of [0.15, 0.85]) post(m, 'wood', x, 1.79, 0.0, 1.2, 0.04);
  // desk and drawer underneath
  bx(m, 'wood', 0.1, 0.9, 0.7, 0.75, 0.15, 0.7);
  bx(m, 'woodDark', 0.1, 0.9, 0.0, 0.7, 0.12, 0.16);
  bx(m, 'wood', 0.12, 0.88, 0.0, 0.35, 0.16, 0.7);
  bx(m, 'woodDark', 0.4, 0.6, 0.22, 0.26, 0.7, 0.72);
  return m;
}

function bedLoftMetal() {
  const m = new Model('bedLoftMetal');
  for (const x of [0.07, 0.93]) for (const z of [0.05, 1.7]) post(m, 'metalDark', x, z, 0, 1.7, 0.05);
  bx(m, 'metalDark', 0.05, 0.95, 1.0, 1.04, 0.03, 1.72);
  bedding(m, 0.1, 0.9, 0.06, 1.68, 1.14, { cover: 'carpetBlue', thick: 0.14 });
  for (const x of [0.07, 0.93]) { rd(m, 'metalDark', [x, 1.16, 0.05], [x, 1.55, 0.05], 0.03); rd(m, 'metalDark', [x, 1.55, 0.05], [x, 1.55, 1.7], 0.03); rd(m, 'metalDark', [x, 1.16, 1.7], [x, 1.55, 1.7], 0.03); for (const z of [0.5, 0.9, 1.3]) rd(m, 'metalDark', [x, 1.04, z], [x, 1.55, z], 0.02); }
  for (const x of [0.12, 0.88]) rd(m, 'metalDark', [x, 0.0, 1.82], [x, 1.5, 1.78], 0.035);
  for (let i = 0; i < 6; i++) bx(m, 'metal', 0.12, 0.88, 0.2 + i * 0.2 - 0.015, 0.2 + i * 0.2 + 0.015, 1.78, 1.82);
  // desk shelf underneath
  bx(m, 'wood', 0.1, 0.9, 0.7, 0.75, 0.12, 0.62);
  bx(m, 'metalDark', 0.1, 0.9, 0.0, 0.7, 0.1, 0.12);
  bx(m, 'wood', 0.12, 0.88, 0.3, 0.34, 0.14, 0.62);
  bx(m, 'wood', 0.12, 0.88, 0.0, 0.04, 0.14, 0.62);
  return m;
}

// --- Daybeds and futon -----------------------------------------------------------------------

function daybedIron() {
  const m = new Model('daybedIron');
  for (const z of [0.05, 1.85]) for (const x of [0.07, 0.93]) post(m, 'metalDark', x, z, 0, 0.85, 0.05);
  for (const z of [0.05, 1.85]) { bx(m, 'metalDark', 0.05, 0.95, 0.8, 0.84, z - 0.02, z + 0.02); for (let i = 1; i < 6; i++) bx(m, 'metalDark', 0.07 + i * 0.14 - 0.01, 0.07 + i * 0.14 + 0.01, 0.3, 0.8, z - 0.01, z + 0.01); }
  bx(m, 'metalDark', 0.05, 0.095, 0.3, 0.84, 0.05, 1.85);
  for (let i = 1; i < 8; i++) bx(m, 'metalDark', 0.065, 0.075, 0.34, 0.8, 0.05 + i * 0.225 - 0.01, 0.05 + i * 0.225 + 0.01);
  bx(m, 'metalDark', 0.05, 0.095, 0.8, 0.86, 0.03, 1.87);
  bx(m, 'metalDark', 0.07, 0.93, 0.28, 0.33, 0.06, 1.84);
  bedding(m, 0.1, 0.93, 0.08, 1.82, 0.5, { cover: 'carpetBlue', pillows: 1, thick: 0.17, coverFrom: 0.1 });
  m.cyl('carpetDarker', [0.2, 0.6, 0.12], [0.88, 0.6, 0.12], 0.08, 8);
  return m;
}

function daybedCottage() {
  const m = new Model('daybedCottage');
  for (const z of [0.06, 1.84]) for (const x of [0.07, 0.93]) post(m, 'woodDark', x, z, 0, 0.9, 0.07);
  for (const z of [0.06, 1.84]) { bx(m, 'wood', 0.04, 0.96, 0.82, 0.9, z - 0.025, z + 0.025); for (let i = 1; i < 6; i++) rd(m, 'wood', [0.07 + i * 0.14, 0.3, z], [0.07 + i * 0.14, 0.82, z], 0.025); }
  bx(m, 'wood', 0.04, 0.1, 0.78, 0.84, 0.04, 1.86);
  for (let i = 1; i < 9; i++) rd(m, 'wood', [0.07, 0.3, 0.06 + i * 0.2], [0.07, 0.78, 0.06 + i * 0.2], 0.025);
  bx(m, 'wood', 0.04, 0.96, 0.24, 0.32, 0.04, 1.86);
  bedding(m, 0.12, 0.92, 0.1, 1.8, 0.5, { cover: 'carpet', pillowMat: 'carpetBlue', pillows: 1, thick: 0.18, coverFrom: 0.2 });
  m.cyl('carpetBlue', [0.2, 0.62, 0.14], [0.88, 0.62, 0.14], 0.07, 8);
  m.cyl('carpetBlue', [0.2, 0.62, 1.8], [0.88, 0.62, 1.8], 0.07, 8);
  return m;
}

function bedFuton() {
  const m = new Model('bedFuton');
  const x0 = 0.3, x1 = 1.7;
  for (const x of [x0 + 0.04, x1 - 0.04]) for (const z of [0.1, 1.82]) post(m, 'wood', x, z, 0, 0.2, 0.07);
  bx(m, 'wood', x0, x1, 0.12, 0.2, 0.04, 1.88);
  for (const x of [x0, x1]) { bx(m, 'wood', x - 0.04, x + 0.04, 0.2, 0.55, 0.04, 1.88); bx(m, 'woodDark', x - 0.06, x + 0.06, 0.5, 0.56, 0.04, 1.88); for (let i = 0; i < 7; i++) bx(m, 'woodDark', x - 0.015, x + 0.015, 0.2, 0.5, 0.08 + i * 0.27, 0.12 + i * 0.27); }
  bx(m, 'carpetBlue', x0 + 0.04, x1 - 0.04, 0.2, 0.4, 0.06, 1.86);
  bx(m, 'carpetWhite', x0 + 0.04, x1 - 0.04, 0.4, 0.44, 0.06, 1.86);
  bx(m, 'carpetBlue', x0 + 0.08, x1 - 0.08, 0.4, 0.46, 0.06, 1.86);
  bx(m, 'carpetDarker', x0 + 0.1, x0 + 0.58, 0.46, 0.56, 0.1, 0.4);
  bx(m, 'woodDark', x0 + 0.04, x1 - 0.04, 0.2, 0.4, 0.02, 0.06);
  return m;
}

// --- Canopy, four-poster, platform and storage beds ------------------------------------------

function bedCanopy() {
  const m = new Model('bedCanopy');
  const x0 = 0.2, x1 = 1.8;
  for (const x of [x0, x1]) for (const z of [0.06, 1.88]) post(m, 'wood', x, z, 0, 2.0, 0.07);
  bx(m, 'wood', x0 - 0.04, x1 + 0.04, 0.2, 0.28, 0.0, 1.94);
  bx(m, 'wood', x0 - 0.03, x1 + 0.03, 0.28, 0.9, 0.02, 0.1);
  for (const z of [0.06, 1.88]) bx(m, 'wood', x0 - 0.04, x1 + 0.04, 1.96, 2.02, z - 0.03, z + 0.03);
  for (const x of [x0, x1]) bx(m, 'wood', x - 0.03, x + 0.03, 1.96, 2.02, 0.06, 1.88);
  bx(m, 'carpetWhite', x0, x1, 2.02, 2.05, 0.06, 1.88); // canopy
  for (const x of [x0 - 0.03, x1 + 0.03]) for (const [z0, z1] of [[0.02, 0.5], [1.44, 1.92]]) bx(m, 'carpetWhite', x - 0.01, x + 0.01, 0.9, 2.0, z0, z1);
  bx(m, 'carpetWhite', x0 - 0.04, x1 + 0.04, 1.4, 2.0, 0.0, 0.03);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.1, 1.88, 0.58, { cover: 'carpetBlue', pillows: 2, thick: 0.28 });
  return m;
}

function bedFourPoster() {
  const m = new Model('bedFourPoster');
  const x0 = 0.2, x1 = 1.8;
  for (const x of [x0, x1]) for (const z of [0.08, 1.86]) { m.cylY('woodDark', x, z, 0, 1.9, 0.045, 0.045, 8); m.cylY('woodDark', x, z, 0.3, 0.42, 0.07, 0.07, 8); m.cylY('woodDark', x, z, 1.9, 1.98, 0.06, 0.02, 8); }
  bx(m, 'woodDark', x0 - 0.04, x1 + 0.04, 0.2, 0.34, 0.02, 1.92);
  bx(m, 'wood', x0, x1, 0.34, 1.1, 0.06, 0.12);
  bx(m, 'woodDark', x0, x1, 0.34, 0.5, 1.8, 1.9);
  for (const z of [0.08, 1.86]) bx(m, 'woodDark', x0 - 0.03, x1 + 0.03, 1.84, 1.9, z - 0.03, z + 0.03);
  for (const x of [x0, x1]) bx(m, 'woodDark', x - 0.03, x + 0.03, 1.84, 1.9, 0.08, 1.86);
  for (const x of [x0 - 0.01, x1 + 0.01]) bx(m, 'carpetBlue', x - 0.015, x + 0.015, 1.64, 1.84, 0.08, 1.86);
  bx(m, 'carpetBlue', x0, x1, 1.64, 1.84, 0.065, 0.09);
  bx(m, 'carpetBlue', x0, x1, 1.64, 1.84, 1.85, 1.875);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.12, 1.8, 0.62, { cover: 'carpetDarker', pillows: 2, thick: 0.28 });
  return m;
}

function bedPlatformLow() {
  const m = new Model('bedPlatformLow');
  const x0 = 0.1, x1 = 1.9;
  bx(m, 'woodDark', x0 + 0.08, x1 - 0.08, 0, 0.06, 0.14, 1.84);
  bx(m, 'wood', x0, x1, 0.06, 0.26, 0.06, 1.9);
  bx(m, 'woodDark', x0 + 0.46, x1 - 0.46, 0.26, 0.3, 0.06, 1.9);
  bx(m, 'wood', x0, x1, 0.26, 0.72, 0.0, 0.1); // low slatted headboard / shelf
  for (let i = 0; i < 6; i++) bx(m, 'woodDark', x0 + 0.08 + i * 0.29, x0 + 0.08 + i * 0.29 + 0.03, 0.3, 0.7, 0.1, 0.12);
  bx(m, 'wood', x0, x0 + 0.42, 0.26, 0.34, 0.1, 0.5);
  bx(m, 'wood', x1 - 0.42, x1, 0.26, 0.34, 0.1, 0.5);
  bx(m, 'woodDark', x0 + 0.02, x0 + 0.4, 0.34, 0.37, 0.12, 0.48);
  bx(m, 'woodDark', x1 - 0.4, x1 - 0.02, 0.34, 0.37, 0.12, 0.48);
  bedding(m, x0 + 0.46, x1 - 0.46, 0.1, 1.88, 0.44, { cover: 'carpetBlue', pillows: 2, thick: 0.14, coverFrom: 0.5 });
  return m;
}

function bedStorageDrawers() {
  const m = new Model('bedStorageDrawers');
  const x0 = 0.2, x1 = 1.8;
  bx(m, 'woodDark', x0, x1, 0, 0.06, 0.1, 1.84);
  bx(m, 'wood', x0, x1, 0.06, 0.4, 0.1, 1.84);
  bx(m, 'wood', x0 - 0.02, x1 + 0.02, 0.06, 1.0, 0.02, 0.12);
  bx(m, 'woodDark', x0 - 0.02, x1 + 0.02, 0.96, 1.04, 0.0, 0.14);
  for (const [a, b] of [[x0 + 0.04, 1.0 - 0.02], [1.0 + 0.02, x1 - 0.04]]) for (const [y0, y1] of [[0.1, 0.22], [0.24, 0.36]]) {
    bx(m, 'woodDark', a, b, y0, y1, 1.84, 1.88);
    bx(m, 'metal', (a + b) / 2 - 0.05, (a + b) / 2 + 0.05, (y0 + y1) / 2 - 0.015, (y0 + y1) / 2 + 0.015, 1.88, 1.91);
  }
  bedding(m, x0 + 0.04, x1 - 0.04, 0.12, 1.84, 0.58, { cover: 'carpetBlue', pillows: 2, thick: 0.18 });
  return m;
}

function bedStorageLift() {
  const m = new Model('bedStorageLift');
  const x0 = 0.2, x1 = 1.8;
  for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [0.14, 1.84]) post(m, 'metal', x, z, 0, 0.08, 0.05);
  bx(m, 'carpetDarker', x0, x1, 0.08, 0.46, 0.1, 1.9);
  bx(m, 'carpetDarker', x0 - 0.02, x1 + 0.02, 0.08, 1.2, 0.02, 0.14);
  for (const x of [0.5, 1.0, 1.5]) bx(m, 'carpetBlue', x - 0.18, x + 0.18, 0.45, 1.1, 0.14, 0.17);
  bx(m, 'metal', x0 - 0.01, x1 + 0.01, 0.43, 0.47, 0.1, 1.91); // lid seam
  for (const x of [x0 - 0.0, x1 + 0.0]) rd(m, 'metalMedium', [x, 0.16, 1.7], [x, 0.4, 1.4], 0.025);
  bedding(m, x0 + 0.04, x1 - 0.04, 0.17, 1.88, 0.64, { cover: 'carpetWhite', pillowMat: 'carpetBlue', pillows: 2, thick: 0.18 });
  return m;
}

function bedCaptain() {
  const m = new Model('bedCaptain');
  bx(m, 'woodDark', 0.04, 0.96, 0, 0.06, 0.1, 1.84);
  bx(m, 'wood', 0.04, 0.96, 0.06, 0.46, 0.06, 1.84);
  bx(m, 'wood', 0.04, 0.96, 0.46, 1.0, 0.0, 0.1);
  for (let i = 0; i < 3; i++) { bx(m, 'woodDark', 0.1 + i * 0.27, 0.1 + i * 0.27 + 0.24, 0.5, 0.95, 0.1, 0.16); } // cubby shelves in the headboard
  for (const y of [0.1, 0.22, 0.34]) { bx(m, 'woodDark', 0.08, 0.92, y, y + 0.1, 1.84, 1.88); bx(m, 'metal', 0.44, 0.56, y + 0.04, y + 0.06, 1.88, 1.91); }
  for (const x of [0.04, 0.96]) bx(m, 'woodDark', x - 0.02, x + 0.02, 0.46, 0.56, 0.1, 1.84);
  bedding(m, 0.08, 0.92, 0.16, 1.84, 0.62, { cover: 'carpetBlue', thick: 0.16 });
  return m;
}

function bedTrundle() {
  const m = new Model('bedTrundle');
  for (const x of [0.08, 0.92]) for (const z of [0.06, 1.46]) post(m, 'wood', x, z, 0, 0.78, 0.07);
  bx(m, 'wood', 0.04, 0.96, 0.3, 0.42, 0.02, 1.5);
  bx(m, 'woodDark', 0.04, 0.96, 0.42, 0.9, 0.0, 0.07);
  bx(m, 'woodDark', 0.04, 0.96, 0.42, 0.62, 1.46, 1.52);
  for (const x of [0.04, 0.96]) bx(m, 'wood', x - 0.02, x + 0.02, 0.42, 0.52, 0.07, 1.46);
  bedding(m, 0.1, 0.9, 0.07, 1.46, 0.58, { cover: 'carpetBlue', thick: 0.16 });
  // the trundle, pulled halfway out at the foot
  bx(m, 'woodDark', 0.1, 0.9, 0.08, 0.22, 0.58, 1.92);
  bx(m, 'carpetWhite', 0.12, 0.88, 0.22, 0.3, 0.6, 1.9);
  bx(m, 'carpet', 0.12, 0.88, 0.22, 0.34, 1.1, 1.9);
  for (const x of [0.16, 0.84]) for (const z of [0.66, 1.84]) bx(m, 'metalDark', x - 0.03, x + 0.03, 0, 0.08, z - 0.03, z + 0.03);
  return m;
}

function bedCot() {
  const m = new Model('bedCot');
  for (const z of [0.2, 1.7]) for (const s of [-1, 1]) { rd(m, 'metal', [0.5 + s * 0.32, 0.4, z], [0.5 - s * 0.32, 0, z], 0.035); rd(m, 'metal', [0.5 - s * 0.32, 0.4, z], [0.5 + s * 0.32, 0, z], 0.035); }
  for (const x of [0.18, 0.82]) rd(m, 'metal', [x, 0.4, 0.15], [x, 0.4, 1.75], 0.04);
  bx(m, 'carpetBlue', 0.18, 0.82, 0.36, 0.4, 0.1, 1.8);
  bx(m, 'carpetDarker', 0.18, 0.82, 0.4, 0.46, 0.1, 0.5);
  bx(m, 'carpetWhite', 0.22, 0.78, 0.4, 0.44, 0.12, 0.6);
  bx(m, 'carpetDarker', 0.2, 0.8, 0.4, 0.5, 0.6, 1.7);
  for (const z of [0.15, 1.75]) bx(m, 'metal', 0.16, 0.84, 0.36, 0.4, z - 0.02, z + 0.02);
  return m;
}

function bedWaterbed() {
  const m = new Model('bedWaterbed');
  const x0 = 0.2, x1 = 1.8;
  bx(m, 'woodDark', x0 - 0.04, x1 + 0.04, 0, 0.3, 0.06, 1.92);
  bx(m, 'wood', x0 - 0.04, x1 + 0.04, 0.3, 0.38, 0.06, 1.92);
  bx(m, 'carpetBlue', x0 + 0.04, x1 - 0.04, 0.38, 0.62, 0.14, 1.84); // water mattress
  bx(m, 'carpetBlue', x0 + 0.0, x1 - 0.0, 0.46, 0.54, 0.12, 1.86);
  bx(m, 'carpetDarker', x0 + 0.06, x1 - 0.06, 0.62, 0.65, 0.6, 1.8);
  bx(m, 'wood', x0 - 0.06, x1 + 0.06, 0.38, 1.3, 0.0, 0.1);
  bx(m, 'glass', x0 + 0.1, x1 - 0.1, 0.52, 1.2, 0.1, 0.12); // mirrored headboard panel
  bx(m, 'woodDark', x0 - 0.06, x1 + 0.06, 1.24, 1.32, 0.0, 0.12);
  bx(m, 'carpetWhite', x0 + 0.2, 0.9, 0.62, 0.72, 0.16, 0.44); bx(m, 'carpetWhite', 1.1, x1 - 0.2, 0.62, 0.72, 0.16, 0.44);
  return m;
}

function bedHammock() {
  const m = new Model('bedHammock');
  for (const z of [0.12, 1.78]) for (const s of [-1, 1]) rd(m, 'wood', [0.5 + s * 0.4, 0, z + (z < 1 ? 0.0 : 0.0)], [0.5, 1.4, z], 0.07);
  for (const z of [0.12, 1.78]) { bx(m, 'woodDark', 0.1, 0.9, 0, 0.04, z - 0.04, z + 0.04); m.cylY('woodDark', 0.5, z, 1.38, 1.46, 0.04, 0.04, 6); }
  bx(m, 'woodDark', 0.47, 0.53, 0.08, 0.12, 0.12, 1.78);
  // the sling: segments dipping towards the middle
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0.5, 1.3 - 0.8 * Math.sin(t * Math.PI), 0.12 + t * 1.66]); }
  for (let i = 0; i < 8; i++) { rd(m, 'carpetWhite', pts[i], pts[i + 1], 0.62, 0.05); rd(m, 'carpet', [0.5 - 0.31, pts[i][1], pts[i][2]], [0.5 - 0.31, pts[i + 1][1], pts[i + 1][2]], 0.02, 0.06); rd(m, 'carpet', [0.5 + 0.31, pts[i][1], pts[i][2]], [0.5 + 0.31, pts[i + 1][1], pts[i + 1][2]], 0.02, 0.06); }
  bx(m, 'carpetBlue', 0.3, 0.7, 0.58, 0.68, 0.5, 0.9);
  return m;
}

function bedRaceCar() {
  const m = new Model('bedRaceCar');
  bx(m, 'carpet', 0.08, 0.92, 0.16, 0.44, 0.06, 1.9); // body
  bx(m, 'carpet', 0.1, 0.9, 0.44, 0.58, 0.06, 0.4); // tail
  bx(m, 'carpetDarker', 0.1, 0.9, 0.52, 0.66, 0.0, 0.1); // spoiler
  for (const x of [0.18, 0.82]) bx(m, 'metalDark', x - 0.03, x + 0.03, 0.44, 0.58, 0.04, 0.12);
  bx(m, 'carpetWhite', 0.08, 0.92, 0.44, 0.54, 1.6, 1.9); // bonnet
  bx(m, 'carpetWhite', 0.4, 0.6, 0.44, 0.5, 0.0, 1.9);
  bx(m, 'glass', 0.12, 0.88, 0.5, 0.82, 1.4, 1.46); // windscreen
  bx(m, 'carpetDarker', 0.1, 0.9, 0.5, 0.84, 1.46, 1.5);
  for (const x of [0.1, 0.9]) bx(m, 'carpetDarker', x - 0.02, x + 0.02, 0.5, 0.84, 1.42, 1.5);
  bedding(m, 0.14, 0.86, 0.38, 1.38, 0.5, { cover: 'carpetBlue', pillows: 1, thick: 0.1, coverFrom: 0.4 });
  for (const x of [0.04, 0.96]) for (const z of [0.36, 1.58]) m.cyl('metalDark', [x - 0.04, 0.17, z], [x + 0.04, 0.17, z], 0.17, 10);
  for (const x of [0.05, 0.95]) for (const z of [0.36, 1.58]) m.cyl('metal', [x - 0.05, 0.17, z], [x + 0.05, 0.17, z], 0.07, 8);
  for (const x of [0.28, 0.72]) bx(m, 'glass', x - 0.07, x + 0.07, 0.3, 0.38, 1.9, 1.93);
  return m;
}


export default { chairSpindle, chairBentwood, chairShell, chairTolix, chairParsons, chairHighBack, chairCrossBack, chairRattan, chairFolding, stoolIndustrial, stoolBackrest, stoolRustic, stoolLeather, stoolMilking, stoolSwivel, armchairWingback, armchairClub, armchairMidcentury, armchairBarrel, armchairPapasan, armchairSlipcover, armchairRocking, armchairBucket, reclinerClassic, reclinerLeather, sofaChesterfield, sofaMidcentury, sofaRustic, sofaIndustrial, loveseatCottage, sofaBedConvertible, sectionalModular, sectionalCozy, chaiseLongue, benchEntryStorage, benchSlat, windowSeat, ottomanStorage, poufKnit, poufLeather, floorCushions, beanBag, officeMesh, officeExecutive, chairGaming, bedSinglePlatform, bedSingleIron, bedSingleRustic, bedSingleMidcentury, bedSingleSleigh, bedDoubleRustic, bedDoubleIron, bedDoubleMidcentury, bedDoubleBasic, bedQueenUpholstered, bedQueenIndustrial, bedQueenLuxury, bedQueenSleigh, bedKingModern, bedKingLuxury, bedKingRustic, bedBunkIndustrial, bedBunkModern, bedLoftKids, bedLoftMetal, daybedIron, daybedCottage, bedFuton, bedCanopy, bedFourPoster, bedPlatformLow, bedStorageDrawers, bedStorageLift, bedCaptain, bedTrundle, bedCot, bedWaterbed, bedHammock, bedRaceCar };
