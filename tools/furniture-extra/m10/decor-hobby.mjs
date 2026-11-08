// Milestone 10 furniture, group "decor-hobby": export default { modelName: builderFn, ... }. See dev/ds-tasks/m10f/AUTHORING.md.
// Content for these models: src/content/objectsM10/decor-hobby.ts
// Authored in real metres; a 1 x 1 tile footprint is 1 m, fit scale is 2.

import { Model } from '../kit.mjs';

const TAU = Math.PI * 2;
/** Box from min and max corners with plain numbers. */
const bx = (m, mat, x0, y0, z0, x1, y1, z1) => m.box(mat, [x0, y0, z0], [x1, y1, z1]);
/** Regular polygon (or ellipse) outline as [x, z] points. */
const ngon = (cx, cz, rx, rz, n, rot = 0) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(rot + (i / n) * TAU), cz + rz * Math.sin(rot + (i / n) * TAU)]);
/** Extruded convex polygon (points [x, z]); the bottom is skipped unless asked for. */
function prism(m, mat, pts, y0, y1, bottom = false) {
  const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  m.poly(mat, pts.map(([x, z]) => [x, y1, z]), [0, 1, 0]);
  if (bottom) m.poly(mat, pts.map(([x, z]) => [x, y0, z]), [0, -1, 0]);
  pts.forEach(([x, z], i) => {
    const [x2, z2] = pts[(i + 1) % pts.length];
    m.poly(mat, [[x, y0, z], [x2, y0, z2], [x2, y1, z2], [x, y1, z]], [(x + x2) / 2 - c[0], 0, (z + z2) / 2 - c[1]]);
  });
}
/** A leaf or frond: flat rod from a base point, at a compass angle `a`, rising by `rise` (radians). */
function leaf(m, base, a, rise, len, w, t = 0.025, mat = 'plant') {
  const [x, y, z] = base;
  m.rod(mat, base, [x + Math.cos(a) * len * Math.cos(rise), y + Math.sin(rise) * len, z + Math.sin(a) * len * Math.cos(rise)], w, t);
}
/** Flowerpot: a lathe cup plus a soil disc. */
function pot(m, mat, cx, cz, y0, h, r0, r1, soil = true) {
  m.lathe(mat, cx, cz, [[r0, y0], [r1, y0 + h]], 10);
  m.cylY(mat, cx, cz, y0 + h, y0 + h + 0.012, r1 + 0.012, r1 + 0.012, 10);
  if (soil) m.cylY('woodDark', cx, cz, y0 + h - 0.03, y0 + h + 0.02, r1 - 0.015, r1 - 0.015, 10);
}

/** Sphere as a lathe (Kenney-style faceted ball). */
function sphere(m, mat, cx, cy, cz, R, seg = 10, steps = 6) {
  const prof = [];
  for (let i = 0; i <= steps; i++) { const t = -Math.PI / 2 + (Math.PI * i) / steps; prof.push([Math.max(0, R * Math.cos(t)), cy + R * Math.sin(t)]); }
  m.lathe(mat, cx, cz, prof, seg);
}
/** Box turned about the vertical axis. */
function rotBox(m, mat, cx, cz, w, d, y0, y1, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c]);
  m.hexa(mat, [...pts.map(([x, z]) => [x, y0, z]), ...pts.map(([x, z]) => [x, y1, z])]);
}
/** Vertical panel from (x0, z0) to (x1, z1) of thickness t (folding screens). */
function panel(m, mat, [x0, z0], [x1, z1], y0, y1, t) {
  const l = Math.hypot(x1 - x0, z1 - z0), nx = (-(z1 - z0) / l) * (t / 2), nz = ((x1 - x0) / l) * (t / 2);
  const ring = (y) => [[x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz], [x1 - nx, y, z1 - nz], [x0 - nx, y, z0 - nz]];
  m.hexa(mat, [...ring(y0), ...ring(y1)]);
}
/** Picture frame: four bars around the opening (x0..x1, y0..y1) on the plane z, `depth` deep, bars `bar` wide. */
function frameRect(m, mat, x0, y0, x1, y1, z, depth, bar) {
  bx(m, mat, x0, y0, z, x1, y0 + bar, z + depth);
  bx(m, mat, x0, y1 - bar, z, x1, y1, z + depth);
  bx(m, mat, x0, y0 + bar, z, x0 + bar, y1 - bar, z + depth);
  bx(m, mat, x1 - bar, y0 + bar, z, x1, y1 - bar, z + depth);
}

// ---------------------------------------------------------------------------------------------
// Rugs (1 m = 1 tile; thin stacked layers, top at about 1.5 cm)
// ---------------------------------------------------------------------------------------------

/** Runner (3 x 1): dark border, two cream stripes and fringe at both ends. */
function rugRunner() {
  const m = new Model('rugRunner');
  bx(m, 'carpetDarker', 0.1, 0, 0.1, 2.9, 0.012, 0.9);
  bx(m, 'carpet', 0.16, 0.012, 0.16, 2.84, 0.018, 0.84);
  for (const z of [0.25, 0.75]) bx(m, 'carpetWhite', 0.16, 0.018, z - 0.025, 2.84, 0.022, z + 0.025);
  for (let i = 0; i < 6; i++) bx(m, 'carpetDarker', 0.3 + i * 0.44, 0.018, 0.36, 0.5 + i * 0.44, 0.024, 0.64); // repeated blocks
  for (const x of [0.04, 2.9]) for (let k = 0; k < 7; k++) bx(m, 'carpetWhite', x, 0, 0.14 + k * 0.1, x + 0.06, 0.008, 0.2 + k * 0.1);
  return m;
}
/** Braided oval (3 x 2): concentric rings of braid. */
function rugBraidedOval() {
  const m = new Model('rugBraidedOval');
  [['carpetDarker', 1.42, 0.92, 0.012], ['carpetWhite', 1.3, 0.8, 0.016], ['carpet', 1.18, 0.68, 0.02], ['carpetWhite', 0.96, 0.48, 0.024], ['carpetDarker', 0.84, 0.36, 0.028], ['carpet', 0.6, 0.14, 0.032]]
    .forEach(([mat, rx, rz, h]) => prism(m, mat, ngon(1.5, 1, rx, rz, 20), 0, h));
  return m;
}
/** Hexagon geometric rug (2 x 2). */
function rugHexGeo() {
  const m = new Model('rugHexGeo');
  [['carpetDarker', 0.95, 0.012], ['carpet', 0.82, 0.016], ['carpetWhite', 0.62, 0.02], ['carpetDarker', 0.5, 0.024], ['carpetWhite', 0.26, 0.028]]
    .forEach(([mat, r, h]) => prism(m, mat, ngon(1, 1, r, r, 6, Math.PI / 6), 0, h));
  return m;
}
/** Persian rug (3 x 2): border, field, nested diamond medallion. */
function rugPersian() {
  const m = new Model('rugPersian');
  bx(m, 'carpetDarker', 0.1, 0, 0.08, 2.9, 0.012, 1.92);
  bx(m, 'carpetWhite', 0.18, 0.012, 0.16, 2.82, 0.016, 1.84);
  bx(m, 'carpet', 0.24, 0.016, 0.22, 2.76, 0.02, 1.78);
  const dia = (cx, cz, rx, rz) => [[cx - rx, cz], [cx, cz - rz], [cx + rx, cz], [cx, cz + rz]];
  prism(m, 'carpetDarker', dia(1.5, 1, 0.95, 0.68), 0, 0.026);
  prism(m, 'carpetWhite', dia(1.5, 1, 0.7, 0.5), 0, 0.03);
  prism(m, 'carpetBlue', dia(1.5, 1, 0.4, 0.28), 0, 0.034);
  for (const [x, z] of [[0.55, 0.5], [2.45, 0.5], [0.55, 1.5], [2.45, 1.5]]) prism(m, 'carpetDarker', dia(x, z, 0.2, 0.15), 0, 0.026);
  for (const x of [0.04, 2.9]) for (let k = 0; k < 9; k++) bx(m, 'carpetWhite', x, 0, 0.14 + k * 0.19, x + 0.06, 0.008, 0.22 + k * 0.19);
  return m;
}
/** Shag rug (2 x 2): thick cream pile with a coloured centre disc. */
function rugShag() {
  const m = new Model('rugShag');
  bx(m, 'carpetWhite', 0.1, 0, 0.1, 1.9, 0.045, 1.9);
  bx(m, 'carpetWhite', 0.14, 0.045, 0.14, 1.86, 0.06, 1.86);
  m.cylY('carpet', 1, 1, 0.06, 0.07, 0.5, 0.5, 14);
  m.cylY('carpetWhite', 1, 1, 0.07, 0.075, 0.28, 0.28, 12);
  return m;
}
/** Striped kilim (3 x 2). */
function rugKilim() {
  const m = new Model('rugKilim');
  bx(m, 'carpetDarker', 0.1, 0, 0.1, 2.9, 0.012, 1.9);
  const mats = ['carpet', 'carpetWhite', 'carpetBlue', 'carpetWhite', 'carpet', 'carpetDarker', 'carpet', 'carpetWhite', 'carpetBlue'];
  mats.forEach((mat, i) => { bx(m, mat, 0.2 + i * 0.29, 0.012, 0.2, 0.2 + (i + 1) * 0.29 - 0.03, 0.018, 1.8); });
  for (let i = 0; i < 4; i++) bx(m, 'carpetDarker', 0.2, 0.018, 0.5 + i * 0.35, 2.8, 0.022, 0.56 + i * 0.35);
  for (const x of [0.04, 2.9]) for (let k = 0; k < 8; k++) bx(m, 'carpetWhite', x, 0, 0.14 + k * 0.23, x + 0.06, 0.008, 0.22 + k * 0.23);
  return m;
}
/** Cowhide rug (2 x 2): an irregular hide with dark patches. */
function rugCowhide() {
  const m = new Model('rugCowhide');
  const hide = [[0.55, 0.12], [1.05, 0.2], [1.45, 0.1], [1.75, 0.45], [1.7, 0.85], [1.88, 1.3], [1.6, 1.75], [1.15, 1.9], [0.7, 1.82], [0.3, 1.5], [0.15, 1.05], [0.3, 0.5]];
  prism(m, 'carpetWhite', hide, 0, 0.014);
  prism(m, 'fur', [[0.55, 0.45], [0.95, 0.4], [1.0, 0.8], [0.7, 0.95], [0.45, 0.8]], 0, 0.018);
  prism(m, 'fur', [[1.2, 1.05], [1.55, 0.95], [1.65, 1.4], [1.3, 1.6], [1.1, 1.35]], 0, 0.018);
  prism(m, 'fur', [[0.45, 1.25], [0.75, 1.2], [0.8, 1.55], [0.5, 1.62]], 0, 0.018);
  return m;
}
/** Checker rug (2 x 2): a 6 x 6 chequer. */
function rugChecker() {
  const m = new Model('rugChecker');
  bx(m, 'carpetDarker', 0.1, 0, 0.1, 1.9, 0.012, 1.9);
  const s = 1.56 / 6;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    bx(m, (i + j) % 2 ? 'carpetWhite' : 'carpet', 0.22 + i * s, 0.012, 0.22 + j * s, 0.22 + (i + 1) * s, 0.018, 0.22 + (j + 1) * s);
  }
  return m;
}
/** Sunburst rug (2 x 2): a round rug with rays. */
function rugSunburst() {
  const m = new Model('rugSunburst');
  m.cylY('carpetDarker', 1, 1, 0, 0.012, 0.95, 0.95, 16);
  m.cylY('carpetWhite', 1, 1, 0.012, 0.016, 0.84, 0.84, 16);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    m.rod(i % 2 ? 'carpet' : 'carpetBlue', [1 + Math.cos(a) * 0.18, 0.02, 1 + Math.sin(a) * 0.18], [1 + Math.cos(a) * 0.76, 0.02, 1 + Math.sin(a) * 0.76], 0.12, 0.008);
  }
  m.cylY('carpetDarker', 1, 1, 0.016, 0.03, 0.2, 0.2, 12);
  m.cylY('carpet', 1, 1, 0.03, 0.034, 0.12, 0.12, 10);
  return m;
}
/** Coir doormat (1 x 1) with a border and a welcome bar. */
function rugDoormatCoir() {
  const m = new Model('rugDoormatCoir');
  bx(m, 'woodDark', 0.1, 0, 0.2, 0.9, 0.025, 0.8);
  bx(m, 'wood', 0.14, 0.025, 0.24, 0.86, 0.03, 0.76);
  bx(m, 'woodDark', 0.22, 0.03, 0.36, 0.78, 0.036, 0.46);
  bx(m, 'woodDark', 0.22, 0.03, 0.54, 0.78, 0.036, 0.64);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Plants (leaves are the fixed 'plant' green; the pot is `wood`)
// ---------------------------------------------------------------------------------------------

/** Fiddle-leaf fig (1 x 1, 1.45 m): slim trunk and big paddle leaves. */
function plantFiddleFig() {
  const m = new Model('plantFiddleFig');
  pot(m, 'wood', 0.5, 0.5, 0, 0.3, 0.17, 0.22);
  m.rod('woodDark', [0.5, 0.3, 0.5], [0.5, 1.2, 0.5], 0.045);
  for (let i = 0; i < 10; i++) {
    const y = 0.62 + i * 0.07, a = i * 2.4;
    m.rod('woodDark', [0.5, y, 0.5], [0.5 + Math.cos(a) * 0.07, y + 0.04, 0.5 + Math.sin(a) * 0.07], 0.02);
    leaf(m, [0.5 + Math.cos(a) * 0.07, y + 0.04, 0.5 + Math.sin(a) * 0.07], a, 0.5 - i * 0.03, 0.3, 0.17, 0.02);
  }
  m.box('plant', [0.43, 1.18, 0.43], [0.57, 1.3, 0.57]);
  return m;
}
/** Monstera (1 x 1, 1.1 m): heart-shaped leaves on long stems. */
function plantMonstera() {
  const m = new Model('plantMonstera');
  pot(m, 'wood', 0.5, 0.5, 0, 0.32, 0.2, 0.26);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3, r = 0.1 + (i % 3) * 0.05, h = 0.55 + (i % 4) * 0.12;
    const top = [0.5 + Math.cos(a) * r, h, 0.5 + Math.sin(a) * r];
    m.rod('plant', [0.5, 0.32, 0.5], top, 0.025);
    leaf(m, top, a, -0.15, 0.24, 0.3, 0.02);
    leaf(m, top, a + 0.5, -0.1, 0.2, 0.13, 0.015);
    leaf(m, top, a - 0.5, -0.1, 0.2, 0.13, 0.015);
  }
  return m;
}
/** Areca palm (1 x 1, 1.5 m): arching fronds. */
function plantPalmAreca() {
  const m = new Model('plantPalmAreca');
  pot(m, 'wood', 0.5, 0.5, 0, 0.34, 0.2, 0.25);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, tilt = 0.9 - (i % 3) * 0.15, h = 0.34 + 0.55 + (i % 3) * 0.2;
    const mid = [0.5 + Math.cos(a) * 0.11, h, 0.5 + Math.sin(a) * 0.11];
    m.rod('plant', [0.5 + Math.cos(a) * 0.03, 0.34, 0.5 + Math.sin(a) * 0.03], mid, 0.03);
    leaf(m, mid, a, tilt - 0.7, 0.3, 0.07, 0.02);
  }
  return m;
}
/** Bonsai on a tray (1 x 1 surface item, 0.45 m). */
function plantBonsai() {
  const m = new Model('plantBonsai');
  bx(m, 'woodDark', 0.22, 0, 0.26, 0.78, 0.03, 0.74);
  bx(m, 'wood', 0.3, 0.03, 0.32, 0.7, 0.13, 0.68);
  bx(m, 'woodDark', 0.33, 0.12, 0.35, 0.67, 0.14, 0.65);
  m.rod('woodDark', [0.48, 0.13, 0.5], [0.44, 0.27, 0.5], 0.05);
  m.rod('woodDark', [0.44, 0.27, 0.5], [0.52, 0.37, 0.5], 0.04);
  m.rod('woodDark', [0.46, 0.22, 0.5], [0.3, 0.3, 0.52], 0.03);
  for (const [x, y, z, w, h] of [[0.28, 0.3, 0.52, 0.16, 0.05], [0.5, 0.4, 0.5, 0.22, 0.07], [0.62, 0.3, 0.46, 0.14, 0.05]]) {
    bx(m, 'plant', x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2);
    bx(m, 'plant', x - w / 3, y + h, z - w / 3, x + w / 3, y + h * 1.8, z + w / 3);
  }
  return m;
}
/** Tall columnar cactus (1 x 1, 1.3 m). */
function plantCactusTall() {
  const m = new Model('plantCactusTall');
  pot(m, 'wood', 0.5, 0.5, 0, 0.3, 0.17, 0.22);
  m.cylY('plant', 0.5, 0.5, 0.3, 1.25, 0.12, 0.11, 8);
  m.cylY('plant', 0.5, 0.5, 1.25, 1.3, 0.1, 0.06, 8);
  for (const [dx, y, up] of [[-1, 0.62, 0.35], [1, 0.8, 0.28]]) {
    m.rod('plant', [0.5, y, 0.5], [0.5 + dx * 0.19, y, 0.5], 0.09);
    m.cylY('plant', 0.5 + dx * 0.19, 0.5, y - 0.045, y + up, 0.045, 0.04, 8);
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; m.box('metalLight', [0.5 + Math.cos(a) * 0.115 - 0.004, 0.5 + (i % 4) * 0.22, 0.5 + Math.sin(a) * 0.115 - 0.004], [0.5 + Math.cos(a) * 0.115 + 0.004, 0.52 + (i % 4) * 0.22, 0.5 + Math.sin(a) * 0.115 + 0.004]); }
  return m;
}
/** Three small cacti in a wooden tray (1 x 1 surface item). */
function plantCactusTrio() {
  const m = new Model('plantCactusTrio');
  bx(m, 'wood', 0.12, 0, 0.3, 0.88, 0.05, 0.7);
  bx(m, 'woodDark', 0.15, 0.04, 0.33, 0.85, 0.06, 0.67);
  [[0.28, 0.5, 0.2, 0.085], [0.52, 0.5, 0.14, 0.07], [0.74, 0.5, 0.1, 0.06]].forEach(([x, z, h, r], i) => {
    m.cylY('wood', x, z, 0.06, 0.12, r + 0.02, r + 0.03, 8);
    if (i === 0) m.cylY('plant', x, z, 0.12, 0.12 + h + 0.1, r, r * 0.9, 8);
    if (i === 1) m.lathe('plant', x, z, [[r * 0.6, 0.12], [r * 1.4, 0.12 + h * 0.5], [r * 0.9, 0.12 + h]], 8);
    if (i === 2) { bx(m, 'plant', x - 0.05, 0.12, z - 0.012, x + 0.05, 0.12 + h, z + 0.012); bx(m, 'plant', x - 0.012, 0.12, z - 0.05, x + 0.012, 0.12 + h * 0.85, z + 0.05); }
  });
  return m;
}
/** Fern on a wooden tripod stand (1 x 1, 1.1 m). */
function plantFernStand() {
  const m = new Model('plantFernStand');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    m.rod('wood', [0.5 + Math.cos(a) * 0.32, 0, 0.5 + Math.sin(a) * 0.32], [0.5 + Math.cos(a) * 0.1, 0.68, 0.5 + Math.sin(a) * 0.1], 0.045);
  }
  m.cylY('woodDark', 0.5, 0.5, 0.66, 0.7, 0.2, 0.2, 10);
  pot(m, 'wood', 0.5, 0.5, 0.7, 0.2, 0.14, 0.19);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + (i % 2) * 0.2, rise = 1.1 - (i % 3) * 0.3;
    leaf(m, [0.5, 0.92, 0.5], a, rise, 0.38 + (i % 3) * 0.04, 0.08, 0.02);
    leaf(m, [0.5 + Math.cos(a) * 0.2, 0.92 + Math.sin(rise) * 0.2, 0.5 + Math.sin(a) * 0.2], a, rise - 0.9, 0.2, 0.07, 0.015);
  }
  return m;
}
/** Succulents in a long wooden tray (1 x 1 surface item). */
function plantSucculentTray() {
  const m = new Model('plantSucculentTray');
  bx(m, 'wood', 0.1, 0, 0.3, 0.9, 0.07, 0.7);
  bx(m, 'woodDark', 0.13, 0.05, 0.33, 0.87, 0.075, 0.67);
  [[0.25, 0.43, 0.1], [0.5, 0.57, 0.12], [0.73, 0.44, 0.09], [0.4, 0.4, 0.07], [0.7, 0.6, 0.07]].forEach(([x, z, r]) => {
    m.cylY('plant', x, z, 0.075, 0.075 + r * 0.9, r * 0.5, r, 6);
    m.cylY('plant', x, z, 0.075 + r * 0.9, 0.075 + r * 1.2, r * 0.75, r * 0.35, 6);
  });
  return m;
}
/** Orchid in a small pot (1 x 1 surface item, 0.55 m). */
function plantOrchid() {
  const m = new Model('plantOrchid');
  pot(m, 'wood', 0.5, 0.5, 0, 0.14, 0.08, 0.11);
  for (const a of [0.4, 2.2, 4]) leaf(m, [0.5, 0.14, 0.5], a, 0.5, 0.2, 0.07, 0.015);
  m.rod('plant', [0.5, 0.14, 0.5], [0.52, 0.48, 0.5], 0.012);
  m.rod('plant', [0.52, 0.48, 0.5], [0.6, 0.55, 0.5], 0.012);
  for (const [x, y] of [[0.5, 0.3], [0.53, 0.38], [0.57, 0.47], [0.61, 0.54]]) {
    bx(m, 'carpetWhite', x - 0.04, y, 0.46, x + 0.04, y + 0.05, 0.54);
    bx(m, 'carpet', x - 0.012, y + 0.012, 0.52, x + 0.012, y + 0.036, 0.57);
  }
  return m;
}
/** Potted olive tree (1 x 1, 1.7 m) in a square planter. */
function plantOliveTree() {
  const m = new Model('plantOliveTree');
  bx(m, 'wood', 0.2, 0, 0.2, 0.8, 0.34, 0.8);
  bx(m, 'woodDark', 0.24, 0.3, 0.24, 0.76, 0.36, 0.76);
  bx(m, 'wood', 0.17, 0.34, 0.17, 0.83, 0.38, 0.83);
  m.rod('woodDark', [0.45, 0.36, 0.5], [0.47, 0.95, 0.5], 0.06);
  m.rod('woodDark', [0.56, 0.36, 0.5], [0.52, 1.0, 0.5], 0.05);
  m.rod('woodDark', [0.47, 0.8, 0.5], [0.3, 1.2, 0.5], 0.03);
  m.rod('woodDark', [0.52, 0.9, 0.5], [0.68, 1.3, 0.5], 0.03);
  m.rod('woodDark', [0.5, 1.0, 0.5], [0.5, 1.45, 0.5], 0.03);
  for (const [x, y, z, w] of [[0.3, 1.2, 0.5, 0.3], [0.68, 1.3, 0.5, 0.32], [0.5, 1.5, 0.5, 0.34], [0.46, 1.05, 0.58, 0.26], [0.6, 1.08, 0.42, 0.24]]) {
    bx(m, 'plant', x - w / 2, y - 0.1, z - w / 2, x + w / 2, y + 0.1, z + w / 2);
    bx(m, 'plant', x - w / 3, y + 0.1, z - w / 3, x + w / 3, y + 0.18, z + w / 3);
  }
  return m;
}
/** Glass terrarium (1 x 1 surface item, 0.45 m). */
function terrarium() {
  const m = new Model('terrarium');
  bx(m, 'metalDark', 0.2, 0, 0.25, 0.8, 0.03, 0.75);
  bx(m, 'woodDark', 0.22, 0.03, 0.27, 0.78, 0.09, 0.73);
  const g = 'glass';
  bx(m, g, 0.2, 0.03, 0.248, 0.8, 0.4, 0.25);
  bx(m, g, 0.198, 0.03, 0.25, 0.2, 0.4, 0.75);
  bx(m, g, 0.8, 0.03, 0.25, 0.802, 0.4, 0.75);
  for (const [x, z] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) bx(m, 'metalDark', x - 0.015, 0.03, z - 0.015, x + 0.015, 0.4, z + 0.015);
  for (const [a, b, c, d] of [[0.2, 0.25, 0.8, 0.28], [0.2, 0.72, 0.8, 0.75], [0.2, 0.28, 0.23, 0.72], [0.77, 0.28, 0.8, 0.72]]) bx(m, 'metalDark', a, 0.4, b, c, 0.43, d); // open rim
  bx(m, 'metalMedium', 0.3, 0.09, 0.36, 0.42, 0.17, 0.5);
  m.cylY('plant', 0.6, 0.45, 0.09, 0.22, 0.04, 0.09, 6);
  m.cylY('plant', 0.5, 0.62, 0.09, 0.16, 0.04, 0.07, 6);
  for (const a of [0.3, 1.8, 3.4, 5]) leaf(m, [0.38, 0.17, 0.6], a, 0.9, 0.12, 0.05, 0.015);
  bx(m, 'carpetWhite', 0.68, 0.09, 0.62, 0.72, 0.13, 0.66);
  return m;
}
/** Wooden crate with three herb pots (1 x 1 surface item). */
function plantHerbBox() {
  const m = new Model('plantHerbBox');
  bx(m, 'wood', 0.14, 0, 0.3, 0.86, 0.02, 0.7);
  for (const z of [0.3, 0.68]) bx(m, 'wood', 0.14, 0.02, z, 0.86, 0.14, z + 0.02);
  for (const x of [0.14, 0.84]) bx(m, 'wood', x, 0.02, 0.3, x + 0.02, 0.14, 0.7);
  [0.3, 0.5, 0.7].forEach((x, i) => {
    pot(m, 'metalDark', x, 0.5, 0.02, 0.13, 0.055, 0.075);
    for (let k = 0; k < 6; k++) leaf(m, [x, 0.17, 0.5], (k / 6) * TAU + i, 0.7 + (i % 2) * 0.3, 0.1 + i * 0.015, 0.045, 0.012);
    if (i === 1) bx(m, 'plant', x - 0.04, 0.17, 0.46, x + 0.04, 0.28, 0.54);
  });
  return m;
}

// ---------------------------------------------------------------------------------------------
// Decor: vases, sculpture, clocks, mirrors, pictures, globes
// ---------------------------------------------------------------------------------------------

/** Tall floor vase (1 x 1, 1 m) with dried branches. */
function vaseFloorTall() {
  const m = new Model('vaseFloorTall');
  m.lathe('carpetWhite', 0.5, 0.5, [[0.1, 0], [0.19, 0.12], [0.22, 0.4], [0.17, 0.66], [0.09, 0.8], [0.1, 0.9], [0.15, 0.96]], 10);
  m.cylY('carpetBlue', 0.5, 0.5, 0.3, 0.4, 0.224, 0.222, 10);
  m.cylY('carpetBlue', 0.5, 0.5, 0.94, 0.97, 0.153, 0.153, 10);
  for (const [dx, tx, ty] of [[-0.02, -0.18, 1.45], [0.02, 0.02, 1.6], [0.03, 0.2, 1.4]]) {
    m.rod('woodDark', [0.5 + dx, 0.9, 0.5], [0.5 + tx, ty, 0.5], 0.02);
    m.rod('woodDark', [0.5 + tx * 0.5, 1.2, 0.5], [0.5 + tx * 1.4, 1.34, 0.5], 0.014);
  }
  return m;
}
/** Round table vase (surface, 0.32 m). */
function vaseRound() {
  const m = new Model('vaseRound');
  m.cylY('carpetWhite', 0.5, 0.5, 0, 0.03, 0.09, 0.09, 10);
  m.lathe('carpetBlue', 0.5, 0.5, [[0.08, 0.03], [0.17, 0.12], [0.18, 0.2], [0.1, 0.28], [0.07, 0.3], [0.1, 0.33]], 10);
  m.cylY('carpetWhite', 0.5, 0.5, 0.14, 0.17, 0.181, 0.181, 10);
  return m;
}
/** Glass-look vase with a bouquet (surface, 0.55 m). */
function vaseFlowers() {
  const m = new Model('vaseFlowers');
  m.lathe('carpetWhite', 0.5, 0.5, [[0.07, 0], [0.12, 0.08], [0.1, 0.2], [0.07, 0.26], [0.1, 0.3]], 8);
  [[-0.04, 0.4, 'carpet'], [0.05, 0.46, 'carpetBlue'], [0.0, 0.52, 'carpetWhite'], [-0.09, 0.34, 'carpetBlue'], [0.1, 0.36, 'carpet']].forEach(([dx, y, mat]) => {
    m.rod('plant', [0.5, 0.25, 0.5], [0.5 + dx * 1.2, y, 0.5], 0.015);
    bx(m, mat, 0.5 + dx * 1.2 - 0.045, y, 0.455, 0.5 + dx * 1.2 + 0.045, y + 0.045, 0.545);
    bx(m, 'wood', 0.5 + dx * 1.2 - 0.015, y + 0.045, 0.485, 0.5 + dx * 1.2 + 0.015, y + 0.06, 0.515);
  });
  for (const a of [0.5, 2.1, 3.6, 5.1]) leaf(m, [0.5, 0.27, 0.5], a, 0.7, 0.16, 0.06, 0.012);
  return m;
}
/** Abstract steel sculpture on a white plinth (1 x 1, 1.35 m). */
function sculptureAbstract() {
  const m = new Model('sculptureAbstract');
  bx(m, 'carpetWhite', 0.3, 0, 0.3, 0.7, 0.8, 0.7);
  bx(m, 'metalMedium', 0.28, 0.8, 0.28, 0.72, 0.84, 0.72);
  const pts = [[0.4, 0.84, 0.5], [0.58, 1.0, 0.5], [0.42, 1.14, 0.5], [0.6, 1.28, 0.5], [0.5, 1.35, 0.5]];
  for (let i = 0; i < pts.length - 1; i++) m.rod('metal', pts[i], pts[i + 1], 0.06, 0.06);
  m.rod('metal', [0.58, 1.0, 0.5], [0.72, 1.12, 0.5], 0.05);
  m.rod('metal', [0.42, 1.14, 0.5], [0.3, 1.24, 0.5], 0.05);
  m.cylY('metal', 0.72, 0.5, 1.12, 1.17, 0.07, 0.07, 8);
  return m;
}
/** Marble bust on a dark column (1 x 1, 1.5 m). */
function sculptureBust() {
  const m = new Model('sculptureBust');
  bx(m, 'woodDark', 0.3, 0, 0.3, 0.7, 0.06, 0.7);
  bx(m, 'wood', 0.35, 0.06, 0.35, 0.65, 0.9, 0.65);
  bx(m, 'woodDark', 0.31, 0.9, 0.31, 0.69, 0.96, 0.69);
  bx(m, 'carpetWhite', 0.34, 0.96, 0.4, 0.66, 1.08, 0.6); // base of the bust
  bx(m, 'carpetWhite', 0.3, 1.08, 0.38, 0.7, 1.2, 0.62); // shoulders
  m.cylY('carpetWhite', 0.5, 0.5, 1.2, 1.28, 0.06, 0.06, 8); // neck
  m.lathe('carpetWhite', 0.5, 0.5, [[0.05, 1.28], [0.1, 1.33], [0.11, 1.4], [0.09, 1.47], [0.04, 1.5]], 8); // head
  bx(m, 'carpetWhite', 0.48, 1.34, 0.6, 0.52, 1.4, 0.65); // nose
  return m;
}
/** Grandfather clock (1 x 1, 2.05 m). */
function clockGrandfather() {
  const m = new Model('clockGrandfather');
  bx(m, 'woodDark', 0.18, 0, 0.06, 0.82, 0.18, 0.48);
  bx(m, 'wood', 0.2, 0.18, 0.08, 0.8, 0.22, 0.46);
  bx(m, 'wood', 0.25, 0.22, 0.1, 0.75, 1.4, 0.44);
  bx(m, 'woodDark', 0.3, 0.46, 0.44, 0.7, 1.3, 0.455); // case door
  bx(m, 'glass', 0.34, 0.5, 0.455, 0.66, 1.26, 0.462);
  m.rod('metal', [0.5, 0.52, 0.4], [0.5, 1.2, 0.4], 0.015, 0.01); // pendulum rod
  m.cyl('metal', [0.5, 0.62, 0.4], [0.5, 0.62, 0.412], 0.07, 10);
  bx(m, 'woodDark', 0.22, 1.4, 0.08, 0.78, 1.46, 0.46);
  bx(m, 'wood', 0.23, 1.46, 0.09, 0.77, 1.95, 0.45); // hood
  m.cyl('carpetWhite', [0.5, 1.7, 0.45], [0.5, 1.7, 0.465], 0.19, 12); // dial
  m.cyl('metalDark', [0.5, 1.7, 0.465], [0.5, 1.7, 0.47], 0.2, 12);
  for (const [dx, dy] of [[0, 0.14], [0, -0.14], [0.14, 0], [-0.14, 0]]) bx(m, 'metalDark', 0.5 + dx - 0.012, 1.7 + dy - 0.012, 0.465, 0.5 + dx + 0.012, 1.7 + dy + 0.012, 0.475);
  m.rod('metalDark', [0.5, 1.7, 0.475], [0.5, 1.84, 0.475], 0.02, 0.008);
  m.rod('metalDark', [0.5, 1.7, 0.48], [0.58, 1.66, 0.48], 0.016, 0.008);
  bx(m, 'woodDark', 0.2, 1.95, 0.06, 0.8, 2.01, 0.48);
  m.box('woodDark', [0.45, 2.01, 0.2], [0.55, 2.08, 0.3]);
  bx(m, 'woodDark', 0.2, 1.46, 0.06, 0.25, 1.95, 0.11); // hood pillars
  bx(m, 'woodDark', 0.75, 1.46, 0.06, 0.8, 1.95, 0.11);
  return m;
}
/** Round wall clock (wall, 0.62 m). */
function clockWallRound() {
  const m = new Model('clockWallRound');
  const cx = 0.5, cy = 0.31;
  m.cyl('metalDark', [cx, cy, 0], [cx, cy, 0.06], 0.31, 14);
  m.cyl('carpetWhite', [cx, cy, 0.06], [cx, cy, 0.072], 0.26, 14);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, r = 0.21;
    bx(m, 'metalDark', cx + Math.cos(a) * r - 0.014, cy + Math.sin(a) * r - 0.014, 0.072, cx + Math.cos(a) * r + 0.014, cy + Math.sin(a) * r + 0.014, 0.08);
  }
  m.rod('metalDark', [cx, cy, 0.078], [cx, cy + 0.16, 0.078], 0.025, 0.008);
  m.rod('metalDark', [cx, cy, 0.086], [cx + 0.11, cy - 0.06, 0.086], 0.02, 0.008);
  m.cyl('carpet', [cx, cy, 0.08], [cx, cy, 0.094], 0.02, 8);
  return m;
}
/** Cuckoo clock with pine-cone weights (wall, 0.85 m). */
function clockCuckoo() {
  const m = new Model('clockCuckoo');
  bx(m, 'wood', 0.3, 0.45, 0, 0.7, 0.82, 0.22);
  m.slab('woodDark', [0.24, 0.8, -0.02], [0.27, 0.16, 0], [0, 0, 0.28], [-0.025, 0.04, 0]);
  m.slab('woodDark', [0.76, 0.8, -0.02], [-0.27, 0.16, 0], [0, 0, 0.28], [0.025, 0.04, 0]);
  m.poly('wood', [[0.3, 0.82, 0.22], [0.7, 0.82, 0.22], [0.5, 0.94, 0.22]], [0, 0, 1]);
  m.cyl('carpetWhite', [0.5, 0.6, 0.22], [0.5, 0.6, 0.235], 0.08, 10);
  bx(m, 'metalDark', 0.495, 0.6, 0.235, 0.505, 0.67, 0.24);
  bx(m, 'metalDark', 0.5, 0.595, 0.235, 0.56, 0.605, 0.24);
  bx(m, 'woodDark', 0.46, 0.71, 0.22, 0.54, 0.79, 0.228);
  bx(m, 'wood', 0.2, 0.5, 0, 0.3, 0.75, 0.1); // carved sides
  bx(m, 'wood', 0.7, 0.5, 0, 0.8, 0.75, 0.1);
  for (const x of [0.38, 0.62]) {
    m.rod('metal', [x, 0.45, 0.1], [x, 0.3, 0.1], 0.012);
    m.cylY('woodDark', x, 0.1, 0.12, 0.3, 0.05, 0.02, 8); // pine cone weights hang from the chain
  }
  m.rod('metal', [0.5, 0.45, 0.1], [0.5, 0.18, 0.1], 0.012);
  m.cyl('metal', [0.5, 0.14, 0.1], [0.5, 0.14, 0.115], 0.05, 8);
  return m;
}
/** Cheval (swing) mirror on a wooden frame (1 x 1, 1.65 m). */
function mirrorCheval() {
  const m = new Model('mirrorCheval');
  for (const x of [0.12, 0.82]) {
    bx(m, 'woodDark', x - 0.02, 0, 0.2, x + 0.1, 0.05, 0.8); // feet
    bx(m, 'wood', x, 0.05, 0.46, x + 0.06, 1.62, 0.54);
    bx(m, 'woodDark', x - 0.005, 1.62, 0.45, x + 0.065, 1.67, 0.55);
  }
  bx(m, 'wood', 0.18, 0.28, 0.46, 0.82, 0.34, 0.54);
  bx(m, 'wood', 0.18, 1.54, 0.46, 0.82, 1.6, 0.54);
  bx(m, 'wood', 0.18, 0.34, 0.46, 0.22, 1.54, 0.54);
  bx(m, 'wood', 0.78, 0.34, 0.46, 0.82, 1.54, 0.54);
  bx(m, 'glass', 0.22, 0.34, 0.5, 0.78, 1.54, 0.52);
  return m;
}
/** Round wall mirror with a metal rim (wall, 0.7 m). */
function mirrorWallRound() {
  const m = new Model('mirrorWallRound');
  m.cyl('metal', [0.5, 0.35, 0], [0.5, 0.35, 0.05], 0.35, 14);
  m.cyl('glass', [0.5, 0.35, 0.05], [0.5, 0.35, 0.058], 0.3, 14);
  bx(m, 'metalDark', 0.47, 0.66, 0.05, 0.53, 0.72, 0.06);
  return m;
}
/** Sunburst wall mirror (wall, 0.95 m). */
function mirrorSunburst() {
  const m = new Model('mirrorSunburst');
  const cx = 0.5, cy = 0.47;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, r1 = i % 2 ? 0.37 : 0.46;
    m.rod('metal', [cx + Math.cos(a) * 0.19, cy + Math.sin(a) * 0.19, 0.02], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 0.02], 0.045, 0.02);
  }
  m.cyl('metal', [cx, cy, 0], [cx, cy, 0.04], 0.21, 14);
  m.cyl('glass', [cx, cy, 0.04], [cx, cy, 0.048], 0.17, 14);
  return m;
}
/** Landscape painting in a wooden frame (wall, 0.6 m). */
function pictureLandscape() {
  const m = new Model('pictureLandscape');
  bx(m, 'carpetWhite', 0.1, 0, 0, 0.9, 0.6, 0.02);
  frameRect(m, 'wood', 0.1, 0, 0.9, 0.6, 0, 0.045, 0.05);
  bx(m, 'carpetBlue', 0.17, 0.3, 0.02, 0.83, 0.53, 0.026);
  bx(m, 'plant', 0.17, 0.07, 0.02, 0.83, 0.3, 0.026);
  bx(m, 'metalMedium', 0.24, 0.3, 0.026, 0.46, 0.42, 0.03);
  bx(m, 'metalMedium', 0.3, 0.42, 0.026, 0.4, 0.46, 0.03);
  bx(m, 'carpet', 0.64, 0.4, 0.026, 0.74, 0.5, 0.03);
  bx(m, 'woodDark', 0.55, 0.07, 0.026, 0.8, 0.14, 0.03);
  return m;
}
/** Salon-style gallery of three frames (2 x 1 wall). */
function pictureGallery() {
  const m = new Model('pictureGallery');
  // portrait, square, landscape at different heights
  bx(m, 'carpetWhite', 0.12, 0.25, 0, 0.62, 0.95, 0.02);
  frameRect(m, 'wood', 0.12, 0.25, 0.62, 0.95, 0, 0.04, 0.04);
  bx(m, 'carpetBlue', 0.18, 0.31, 0.02, 0.56, 0.89, 0.025);
  m.cyl('carpet', [0.37, 0.65, 0.025], [0.37, 0.65, 0.03], 0.1, 10);
  bx(m, 'carpetDarker', 0.22, 0.34, 0.025, 0.52, 0.5, 0.03);
  bx(m, 'carpetWhite', 0.74, 0.4, 0, 1.24, 0.9, 0.02);
  frameRect(m, 'woodDark', 0.74, 0.4, 1.24, 0.9, 0, 0.04, 0.04);
  for (const [a, b, mat] of [[0, 0, 'carpet'], [1, 0, 'carpetBlue'], [0, 1, 'carpetDarker'], [1, 1, 'carpetWhite']]) {
    bx(m, mat, 0.8 + a * 0.2, 0.46 + b * 0.2, 0.02, 0.8 + a * 0.2 + 0.18, 0.46 + b * 0.2 + 0.18, 0.026);
  }
  bx(m, 'carpetWhite', 1.36, 0, 0, 1.88, 0.5, 0.02);
  frameRect(m, 'wood', 1.36, 0, 1.88, 0.5, 0, 0.04, 0.04);
  bx(m, 'carpetBlue', 1.41, 0.25, 0.02, 1.83, 0.45, 0.025);
  bx(m, 'plant', 1.41, 0.05, 0.02, 1.83, 0.25, 0.025);
  bx(m, 'woodDark', 1.55, 0.25, 0.025, 1.7, 0.33, 0.03);
  return m;
}
/** Portrait in an ornate metal frame (wall, 0.85 m). */
function picturePortrait() {
  const m = new Model('picturePortrait');
  bx(m, 'carpetDarker', 0.25, 0, 0, 0.75, 0.85, 0.02);
  frameRect(m, 'metal', 0.25, 0, 0.75, 0.85, 0, 0.05, 0.06);
  frameRect(m, 'metalMedium', 0.31, 0.06, 0.69, 0.79, 0.02, 0.03, 0.02);
  bx(m, 'carpetBlue', 0.33, 0.08, 0.02, 0.67, 0.77, 0.03);
  bx(m, 'carpetDarker', 0.38, 0.08, 0.03, 0.62, 0.3, 0.036); // shoulders
  bx(m, 'wood', 0.46, 0.3, 0.03, 0.54, 0.38, 0.036); // neck
  bx(m, 'wood', 0.42, 0.38, 0.03, 0.58, 0.56, 0.038); // face
  bx(m, 'woodDark', 0.4, 0.54, 0.03, 0.6, 0.62, 0.04); // hair
  return m;
}
/** Floor globe on a wooden tripod with a brass meridian (1 x 1, 1.35 m). */
function globeFloor() {
  const m = new Model('globeFloor');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    m.rod('woodDark', [0.5 + Math.cos(a) * 0.32, 0, 0.5 + Math.sin(a) * 0.32], [0.5 + Math.cos(a) * 0.1, 0.7, 0.5 + Math.sin(a) * 0.1], 0.045);
  }
  m.cylY('wood', 0.5, 0.5, 0.68, 0.74, 0.17, 0.17, 10);
  m.rod('metalDark', [0.5, 0.74, 0.5], [0.5, 0.82, 0.5], 0.05);
  sphere(m, 'carpetBlue', 0.5, 1.05, 0.5, 0.27, 10, 6);
  for (const [dx, dy, dz, w, h] of [[-0.12, 0.08, 0.2, 0.14, 0.12], [0.1, 0.02, 0.22, 0.12, 0.2], [0.2, 0.14, -0.08, 0.1, 0.08], [-0.15, -0.1, -0.2, 0.14, 0.1], [0.0, 0.22, -0.1, 0.12, 0.06]]) {
    bx(m, 'plant', 0.5 + dx - w / 2, 1.05 + dy - h / 2, 0.5 + dz - 0.01, 0.5 + dx + w / 2, 1.05 + dy + h / 2, 0.5 + dz + 0.03);
  }
  m.rod('metalDark', [0.5, 0.78, 0.5], [0.5, 1.36, 0.5], 0.02);
  for (let i = 0; i < 8; i++) { // meridian arc on the +x side
    const t0 = -1.6 + (i / 8) * 3.2, t1 = -1.6 + ((i + 1) / 8) * 3.2;
    m.rod('metal', [0.5 + Math.cos(t0) * 0.32, 1.05 + Math.sin(t0) * 0.32, 0.5], [0.5 + Math.cos(t1) * 0.32, 1.05 + Math.sin(t1) * 0.32, 0.5], 0.03, 0.03);
  }
  return m;
}
/** Desk globe on a round base (surface, 0.5 m). */
function globeDesk() {
  const m = new Model('globeDesk');
  m.cylY('woodDark', 0.5, 0.5, 0, 0.04, 0.16, 0.14, 10);
  m.cylY('metal', 0.5, 0.5, 0.04, 0.1, 0.03, 0.03, 8);
  sphere(m, 'carpetBlue', 0.5, 0.3, 0.5, 0.17, 10, 6);
  for (const [dx, dy, dz, w, h] of [[-0.08, 0.05, 0.12, 0.09, 0.08], [0.07, 0.0, 0.13, 0.07, 0.12], [-0.1, -0.06, -0.12, 0.09, 0.07]]) {
    bx(m, 'plant', 0.5 + dx - w / 2, 0.3 + dy - h / 2, 0.5 + dz - 0.01, 0.5 + dx + w / 2, 0.3 + dy + h / 2, 0.5 + dz + 0.03);
  }
  bx(m, 'carpetWhite', 0.44, 0.45, 0.44, 0.56, 0.47, 0.56); // polar cap
  for (let i = 0; i < 7; i++) {
    const t0 = -1.5 + (i / 7) * 3, t1 = -1.5 + ((i + 1) / 7) * 3;
    m.rod('metal', [0.5 + Math.cos(t0) * 0.205, 0.3 + Math.sin(t0) * 0.205, 0.5], [0.5 + Math.cos(t1) * 0.205, 0.3 + Math.sin(t1) * 0.205, 0.5], 0.025, 0.025);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Decor: aquarium, screen, fireplaces, tabletop pieces, soft furnishings
// ---------------------------------------------------------------------------------------------

/** Aquarium on a wooden cabinet (2 x 1, 1.4 m): open-front tank so the fish show. */
function aquarium() {
  const m = new Model('aquarium');
  bx(m, 'wood', 0.15, 0, 0.25, 1.85, 0.74, 0.75);
  bx(m, 'woodDark', 0.19, 0.06, 0.75, 0.98, 0.7, 0.77);
  bx(m, 'woodDark', 1.02, 0.06, 0.75, 1.81, 0.7, 0.77);
  for (const x of [0.9, 1.1]) m.rod('metal', [x, 0.3, 0.8], [x, 0.46, 0.8], 0.02);
  bx(m, 'metalDark', 0.2, 0.74, 0.27, 1.8, 0.8, 0.73); // tank base
  bx(m, 'woodDark', 0.24, 0.8, 0.3, 1.76, 0.86, 0.7); // gravel
  bx(m, 'glass', 0.2, 0.8, 0.27, 1.8, 1.3, 0.285); // back and side glass
  bx(m, 'glass', 0.2, 0.8, 0.285, 0.215, 1.3, 0.73);
  bx(m, 'glass', 1.785, 0.8, 0.285, 1.8, 1.3, 0.73);
  for (const x of [0.2, 1.77]) for (const z of [0.27, 0.7]) bx(m, 'metalDark', x, 0.8, z, x + 0.03, 1.3, z + 0.03);
  bx(m, 'metalDark', 0.2, 1.3, 0.27, 1.8, 1.4, 0.73); // hood
  bx(m, 'carpetWhite', 0.3, 1.3, 0.6, 1.7, 1.32, 0.68); // light strip
  bx(m, 'metalMedium', 0.45, 0.86, 0.4, 0.75, 1.0, 0.6); // rocks
  bx(m, 'metalMedium', 0.55, 1.0, 0.45, 0.7, 1.08, 0.58);
  for (const [x, h] of [[1.2, 0.5], [1.35, 0.38], [1.5, 0.45], [0.95, 0.3]]) {
    m.rod('plant', [x, 0.86, 0.45], [x + 0.03, 0.86 + h, 0.45], 0.05, 0.015);
  }
  for (const [x, y, z, mat] of [[0.9, 1.1, 0.5, 'carpet'], [1.3, 1.0, 0.55, 'carpetBlue'], [1.5, 1.15, 0.4, 'carpet'], [1.1, 0.95, 0.6, 'wood']]) {
    bx(m, mat, x, y, z, x + 0.1, y + 0.07, z + 0.03);
    bx(m, mat, x - 0.04, y + 0.01, z, x, y + 0.06, z + 0.03);
  }
  return m;
}
/** Three-panel folding screen (2 x 1, 1.7 m), zig-zag. */
function screenDivider() {
  const m = new Model('screenDivider');
  const P = [[0.08, 0.35], [0.68, 0.62], [1.28, 0.35], [1.88, 0.62]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < 3; i++) {
    const a = P[i], b = P[i + 1];
    panel(m, 'woodDark', a, b, 0.04, 1.7, 0.04);
    panel(m, 'carpetWhite', lerp(a, b, 0.07), lerp(a, b, 0.93), 0.12, 1.6, 0.052);
    panel(m, i === 1 ? 'carpetBlue' : 'carpet', lerp(a, b, 0.07), lerp(a, b, 0.93), 0.7, 1.05, 0.058);
    panel(m, 'carpetWhite', lerp(a, b, 0.4), lerp(a, b, 0.6), 0.2, 1.5, 0.062);
  }
  return m;
}
/** Brick fireplace with a mantel and a chimney breast (2 x 1, 2.4 m). */
function fireplaceBrick() {
  const m = new Model('fireplaceBrick');
  bx(m, 'carpetDarker', 0.12, 0, 0, 0.5, 1.15, 0.45);
  bx(m, 'carpetDarker', 1.5, 0, 0, 1.88, 1.15, 0.45);
  bx(m, 'carpetDarker', 0.5, 0.95, 0, 1.5, 1.15, 0.45);
  bx(m, 'metalDark', 0.5, 0, 0, 1.5, 0.95, 0.1);
  bx(m, 'metalMedium', 0.5, 0, 0.1, 1.5, 0.04, 0.45);
  bx(m, 'metalMedium', 0.1, 0, 0.45, 1.9, 0.06, 0.85); // hearth
  bx(m, 'wood', 0.05, 1.15, 0, 1.95, 1.22, 0.55); // mantel
  bx(m, 'carpetDarker', 0.5, 1.22, 0, 1.5, 2.4, 0.3);
  for (let r = 1; r < 10; r++) bx(m, 'carpetWhite', 0.5, 0.11 * r + 0.0, 0.3, 1.5, 0.11 * r + 0.012 + 0.0, 0.302 + 0.0); // mortar (chimney face)
  for (let r = 1; r < 10; r++) for (const [a, b] of [[0.12, 0.5], [1.5, 1.88]]) bx(m, 'carpetWhite', a, r * 0.115, 0.45, b, r * 0.115 + 0.012, 0.452);
  m.rod('woodDark', [0.62, 0.1, 0.25], [1.38, 0.1, 0.25], 0.12);
  m.rod('woodDark', [0.7, 0.2, 0.2], [1.3, 0.2, 0.2], 0.1);
  for (const [x, h] of [[0.85, 0.3], [1.0, 0.45], [1.15, 0.32]]) bx(m, 'carpet', x - 0.06, 0.26, 0.2, x + 0.06, 0.26 + h, 0.24);
  return m;
}
/** Cast-iron wood stove with a flue pipe (1 x 1, 2.3 m). */
function fireplaceStove() {
  const m = new Model('fireplaceStove');
  for (const x of [0.25, 0.75]) for (const z of [0.25, 0.65]) bx(m, 'metalDark', x - 0.04, 0, z - 0.04, x + 0.04, 0.2, z + 0.04);
  bx(m, 'metalDark', 0.2, 0.2, 0.2, 0.8, 0.85, 0.7);
  bx(m, 'metalMedium', 0.17, 0.85, 0.17, 0.83, 0.9, 0.73);
  bx(m, 'metalMedium', 0.32, 0.36, 0.7, 0.68, 0.76, 0.715); // door frame
  bx(m, 'glass', 0.37, 0.41, 0.715, 0.63, 0.71, 0.72);
  m.rod('metal', [0.7, 0.55, 0.73], [0.7, 0.67, 0.73], 0.02);
  for (let i = 0; i < 3; i++) bx(m, 'metalMedium', 0.3, 0.24 + i * 0.03, 0.7, 0.7, 0.25 + i * 0.03, 0.715); // vents
  m.cylY('metalMedium', 0.5, 0.45, 0.9, 0.96, 0.09, 0.07, 10);
  m.cylY('metalDark', 0.5, 0.45, 0.96, 2.3, 0.065, 0.065, 10);
  m.cylY('metalMedium', 0.5, 0.45, 1.6, 1.66, 0.08, 0.08, 10);
  return m;
}
/** Three pillar candles on a small tray (surface, 0.3 m). */
function candles() {
  const m = new Model('candles');
  bx(m, 'metal', 0.25, 0, 0.35, 0.75, 0.02, 0.65);
  [[0.35, 0.5, 0.26, 0.05], [0.52, 0.45, 0.18, 0.045], [0.66, 0.55, 0.12, 0.04]].forEach(([x, z, h, r]) => {
    m.cylY('carpetWhite', x, z, 0.02, 0.02 + h, r, r, 8);
    bx(m, 'wood', x - 0.012, 0.02 + h, z - 0.012, x + 0.012, 0.02 + h + 0.045, z + 0.012);
  });
  return m;
}
/** Three-arm candelabra (surface, 0.55 m). */
function candelabraThreeArm() {
  const m = new Model('candelabraThreeArm');
  m.cylY('metal', 0.5, 0.5, 0, 0.04, 0.13, 0.1, 10);
  m.cylY('metal', 0.5, 0.5, 0.04, 0.34, 0.03, 0.025, 8);
  m.rod('metal', [0.5, 0.3, 0.5], [0.3, 0.38, 0.5], 0.025);
  m.rod('metal', [0.5, 0.3, 0.5], [0.7, 0.38, 0.5], 0.025);
  for (const [x, y] of [[0.3, 0.38], [0.5, 0.34], [0.7, 0.38]]) {
    m.cylY('metal', x, 0.5, y, y + 0.03, 0.04, 0.05, 8);
    m.cylY('carpetWhite', x, 0.5, y + 0.03, y + 0.16, 0.025, 0.025, 8);
    bx(m, 'wood', x - 0.01, y + 0.16, 0.49, x + 0.01, y + 0.2, 0.51);
  }
  return m;
}
/** Wooden bowl of fruit (surface, 0.22 m). */
function bowlFruit() {
  const m = new Model('bowlFruit');
  m.lathe('wood', 0.5, 0.5, [[0.07, 0], [0.2, 0.08], [0.24, 0.14]], 10);
  m.cylY('wood', 0.5, 0.5, 0.03, 0.09, 0.2, 0.2, 10);
  sphere(m, 'carpet', 0.44, 0.17, 0.5, 0.07, 8, 4);
  sphere(m, 'carpet', 0.56, 0.19, 0.46, 0.07, 8, 4);
  sphere(m, 'plant', 0.5, 0.17, 0.58, 0.065, 8, 4);
  m.lathe('plant', 0.5, 0.45, [[0.02, 0.15], [0.06, 0.2], [0.03, 0.28]], 6);
  return m;
}
/** Nesting ceramic bowls (surface, 0.2 m). */
function bowlCeramicDuo() {
  const m = new Model('bowlCeramicDuo');
  m.lathe('carpetBlue', 0.5, 0.5, [[0.1, 0], [0.26, 0.09], [0.3, 0.16]], 12);
  m.cylY('carpetWhite', 0.5, 0.5, 0.1, 0.12, 0.29, 0.29, 12);
  m.lathe('carpetWhite', 0.5, 0.5, [[0.06, 0.1], [0.14, 0.16], [0.17, 0.22]], 12);
  m.cylY('carpetBlue', 0.5, 0.5, 0.17, 0.19, 0.157, 0.157, 12);
  return m;
}
/** Pair of bookends holding a row of books (surface, 0.25 m). */
function bookends() {
  const m = new Model('bookends');
  for (const x of [0.14, 0.82]) { bx(m, 'metalDark', x, 0, 0.35, x + 0.04, 0.2, 0.65); bx(m, 'metalDark', x - (x < 0.5 ? 0 : 0.0), 0, 0.35, x + 0.04, 0.02, 0.65); }
  bx(m, 'metalDark', 0.14, 0, 0.35, 0.3, 0.02, 0.65);
  bx(m, 'metalDark', 0.7, 0, 0.35, 0.86, 0.02, 0.65);
  let x = 0.3;
  [['carpet', 0.07, 0.2], ['carpetBlue', 0.05, 0.22], ['carpetWhite', 0.08, 0.18], ['carpetDarker', 0.06, 0.21], ['carpetBlue', 0.07, 0.19], ['carpet', 0.05, 0.22], ['carpetWhite', 0.06, 0.17]].forEach(([mat, w, h]) => {
    bx(m, mat, x, 0.02, 0.38, x + w, 0.02 + h, 0.62); x += w + 0.005;
  });
  return m;
}
/** Winner's trophy cup on a plinth (surface, 0.5 m). */
function trophyCup() {
  const m = new Model('trophyCup');
  bx(m, 'woodDark', 0.3, 0, 0.3, 0.7, 0.08, 0.7);
  bx(m, 'wood', 0.34, 0.08, 0.34, 0.66, 0.14, 0.66);
  bx(m, 'metalMedium', 0.38, 0.1, 0.66, 0.62, 0.13, 0.665);
  m.cylY('metal', 0.5, 0.5, 0.14, 0.2, 0.09, 0.05, 10);
  m.cylY('metal', 0.5, 0.5, 0.2, 0.3, 0.025, 0.025, 8);
  m.lathe('metal', 0.5, 0.5, [[0.04, 0.3], [0.1, 0.36], [0.13, 0.46], [0.15, 0.5]], 10);
  for (const s of [-1, 1]) { m.rod('metal', [0.5 + s * 0.12, 0.46, 0.5], [0.5 + s * 0.2, 0.44, 0.5], 0.025); m.rod('metal', [0.5 + s * 0.2, 0.44, 0.5], [0.5 + s * 0.16, 0.34, 0.5], 0.025); }
  return m;
}
/** Umbrella stand with three umbrellas (1 x 1, 0.95 m). */
function umbrellaStand() {
  const m = new Model('umbrellaStand');
  m.lathe('metalDark', 0.5, 0.5, [[0.12, 0], [0.14, 0.05], [0.16, 0.6]], 10);
  m.cylY('metal', 0.5, 0.5, 0.6, 0.64, 0.17, 0.17, 10);
  m.cylY('metalMedium', 0.5, 0.5, 0, 0.03, 0.17, 0.17, 10);
  [[-0.05, 0.9, 'carpetBlue'], [0.03, 0.97, 'carpet'], [0.08, 0.84, 'carpetDarker']].forEach(([dx, h, mat], i) => {
    const x = 0.5 + dx * 1.2, z = 0.5 + (i - 1) * 0.06;
    m.cyl(mat, [x - dx * 0.6, 0.1, z], [x, h - 0.15, z], 0.04, 8);
    m.rod('woodDark', [x, h - 0.15, z], [x, h - 0.06, z], 0.025);
    m.rod('woodDark', [x, h - 0.06, z], [x + 0.07, h - 0.06, z], 0.025);
  });
  return m;
}
/** Wooden magazine rack (1 x 1, 0.45 m). */
function magazineRack() {
  const m = new Model('magazineRack');
  bx(m, 'woodDark', 0.2, 0, 0.3, 0.8, 0.04, 0.7);
  bx(m, 'wood', 0.2, 0.04, 0.3, 0.24, 0.42, 0.7);
  bx(m, 'wood', 0.76, 0.04, 0.3, 0.8, 0.42, 0.7);
  bx(m, 'wood', 0.24, 0.04, 0.3, 0.76, 0.4, 0.33);
  bx(m, 'wood', 0.48, 0.04, 0.33, 0.52, 0.3, 0.66);
  bx(m, 'wood', 0.24, 0.04, 0.66, 0.76, 0.18, 0.7);
  const N = [0, 0.18, 0.3].map((v) => v / Math.hypot(0.18, 0.3));
  [['carpet', 0.26], ['carpetBlue', 0.29], ['carpetWhite', 0.52], ['carpetDarker', 0.55]].forEach(([mat, x], i) => {
    const z = 0.6 - (i % 2) * 0.02;
    m.slab(mat, [x, 0.06, z], [0.18, 0, 0], [0, 0.3, -0.18], N.map((v) => v * 0.014));
  });
  return m;
}
/** Stack of three floor cushions (1 x 1, 0.42 m). */
function poufCushions() {
  const m = new Model('poufCushions');
  rotBox(m, 'carpetBlue', 0.5, 0.5, 0.8, 0.8, 0, 0.16, 0);
  rotBox(m, 'carpetBlue', 0.5, 0.5, 0.74, 0.74, 0.16, 0.19, 0);
  rotBox(m, 'carpet', 0.5, 0.5, 0.64, 0.64, 0.19, 0.31, 0.45);
  rotBox(m, 'carpet', 0.5, 0.5, 0.58, 0.58, 0.31, 0.33, 0.45);
  rotBox(m, 'carpetWhite', 0.5, 0.5, 0.48, 0.48, 0.33, 0.43, -0.3);
  rotBox(m, 'carpetDarker', 0.5, 0.5, 0.06, 0.06, 0.43, 0.45, -0.3);
  return m;
}
/** Woven basket with a folded throw (1 x 1, 0.62 m). */
function basketThrow() {
  const m = new Model('basketThrow');
  m.lathe('wood', 0.5, 0.5, [[0.22, 0], [0.29, 0.14], [0.31, 0.45]], 10);
  for (const y of [0.1, 0.2, 0.3, 0.4]) m.cylY('woodDark', 0.5, 0.5, y, y + 0.03, 0.22 + y * 0.22 + 0.01, 0.22 + y * 0.22 + 0.01, 10);
  for (const s of [-1, 1]) { m.rod('woodDark', [0.5 + s * 0.31, 0.3, 0.5], [0.5 + s * 0.36, 0.4, 0.5], 0.04); m.rod('woodDark', [0.5 + s * 0.36, 0.4, 0.5], [0.5 + s * 0.31, 0.46, 0.5], 0.04); }
  bx(m, 'carpet', 0.28, 0.42, 0.3, 0.72, 0.56, 0.7);
  bx(m, 'carpetWhite', 0.3, 0.52, 0.32, 0.7, 0.6, 0.66);
  bx(m, 'carpet', 0.3, 0.2, 0.66, 0.7, 0.58, 0.7); // drape over the rim
  bx(m, 'carpetDarker', 0.3, 0.2, 0.7, 0.7, 0.28, 0.72);
  return m;
}
/** Hanging wind chime on a wall bracket (wall, 0.85 m). */
function windChime() {
  const m = new Model('windChime');
  bx(m, 'woodDark', 0.46, 0.7, 0, 0.54, 0.85, 0.03);
  m.rod('metalDark', [0.5, 0.82, 0.02], [0.5, 0.84, 0.32], 0.03);
  m.rod('metalDark', [0.5, 0.84, 0.3], [0.5, 0.68, 0.32], 0.012);
  m.cylY('wood', 0.5, 0.32, 0.64, 0.68, 0.1, 0.1, 10);
  [[0, 0.5], [60, 0.42], [120, 0.55], [180, 0.38], [240, 0.47], [300, 0.34]].forEach(([deg, len]) => {
    const a = (deg / 180) * Math.PI;
    m.cylY('metal', 0.5 + Math.cos(a) * 0.07, 0.32 + Math.sin(a) * 0.07, 0.64 - len, 0.64, 0.014, 0.014, 6);
  });
  m.cylY('wood', 0.5, 0.32, 0.3, 0.34, 0.025, 0.025, 6);
  m.rod('metalDark', [0.5, 0.64, 0.32], [0.5, 0.34, 0.32], 0.006);
  bx(m, 'wood', 0.44, 0.1, 0.3, 0.56, 0.2, 0.34); // wind sail
  m.rod('metalDark', [0.5, 0.34, 0.32], [0.5, 0.2, 0.32], 0.006);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Hobby: instruments (keyboards play like the upright piano; the rest are display pieces)
// ---------------------------------------------------------------------------------------------

/** White and black keys over x0..x1 at the given z range and key-top height. */
function keys(m, x0, x1, z0, z1, y, whites, blackMat = 'metalDark') {
  const kw = (x1 - x0) / whites;
  m.box('carpetWhite', [x0, y, z0], [x1, y + 0.02, z1]);
  for (let i = 1; i < whites; i++) bx(m, 'metalMedium', x0 + i * kw - 0.002, y + 0.02, z0, x0 + i * kw + 0.002, y + 0.023, z1);
  for (let i = 0; i < whites - 1; i++) { if ([2, 6].includes(i % 7)) continue; bx(m, blackMat, x0 + (i + 1) * kw - kw * 0.3, y + 0.02, z0 + (z1 - z0) * 0.35, x0 + (i + 1) * kw + kw * 0.3, y + 0.045, z1); }
}

/** Grand piano (2 x 2, 1 m): curved case, closed lid, keys at the front (+z). */
function pianoGrand() {
  const m = new Model('pianoGrand');
  const outline = [[0.2, 1.62], [1.72, 1.62], [1.72, 1.2], [1.56, 0.62], [1.22, 0.26], [0.8, 0.12], [0.2, 0.12]];
  prism(m, 'woodDark', outline, 0.62, 0.8, true);
  prism(m, 'woodDark', [[0.2, 1.24], [1.72, 1.24], [1.56, 0.62], [1.22, 0.26], [0.8, 0.12], [0.2, 0.12]], 0.8, 0.9);
  prism(m, 'wood', [[0.24, 1.2], [1.66, 1.2], [1.52, 0.64], [1.2, 0.3], [0.8, 0.17], [0.24, 0.17]], 0.9, 0.915);
  for (const [x, z] of [[0.3, 1.52], [1.62, 1.52], [0.85, 0.28]]) m.cylY('woodDark', x, z, 0, 0.62, 0.045, 0.06, 8);
  bx(m, 'wood', 0.3, 0.8, 1.24, 1.62, 0.86, 1.62);
  keys(m, 0.38, 1.54, 1.36, 1.6, 0.86, 17);
  bx(m, 'wood', 0.26, 0.86, 1.24, 0.38, 0.92, 1.62); // key blocks
  bx(m, 'wood', 1.54, 0.86, 1.24, 1.66, 0.92, 1.62);
  bx(m, 'woodDark', 0.62, 0.9, 1.24, 1.3, 1.08, 1.27); // music desk
  bx(m, 'metal', 0.78, 0.02, 1.2, 1.1, 0.07, 1.4); // pedals
  m.rod('woodDark', [0.94, 0.07, 1.3], [0.94, 0.62, 1.3], 0.05);
  return m;
}
/** Cottage upright piano with fretwork and candle brackets (2 x 1, 1.35 m). */
function pianoCottage() {
  const m = new Model('pianoCottage');
  bx(m, 'woodDark', 0.2, 0, 0.04, 1.8, 0.1, 0.56);
  bx(m, 'wood', 0.18, 0.1, 0.06, 1.82, 1.15, 0.55);
  bx(m, 'woodDark', 0.16, 1.15, 0.04, 1.84, 1.2, 0.58);
  for (let i = 0; i < 12; i++) bx(m, 'woodDark', 0.24 + i * 0.138, 1.2, 0.1, 0.27 + i * 0.138, 1.36, 0.14); // gallery balusters
  bx(m, 'woodDark', 0.2, 1.36, 0.08, 1.8, 1.4, 0.16);
  bx(m, 'woodDark', 0.2, 0.62, 0.55, 1.8, 0.7, 0.88); // key bed
  keys(m, 0.3, 1.7, 0.6, 0.86, 0.7, 20);
  bx(m, 'carpetDarker', 0.3, 0.84, 0.55, 1.7, 1.08, 0.57); // silk panel behind fretwork
  for (let i = 0; i < 6; i++) bx(m, 'woodDark', 0.4 + i * 0.22, 0.84, 0.57, 0.46 + i * 0.22, 1.08, 0.59);
  for (const x of [0.22, 1.78]) { bx(m, 'woodDark', x - 0.03, 0.0, 0.72, x + 0.05, 0.62, 0.84); } // front posts
  for (const x of [0.16, 1.84]) { m.rod('metal', [x, 0.9, 0.58], [x, 0.9, 0.7], 0.02); bx(m, 'metal', x - 0.04, 0.88, 0.68, x + 0.04, 0.9, 0.76); m.cylY('carpetWhite', x, 0.72, 0.9, 1.0, 0.025, 0.025, 8); }
  for (const x of [0.88, 1.0, 1.12]) bx(m, 'metal', x, 0.04, 0.5, x + 0.1, 0.09, 0.62);
  return m;
}
/** Digital keyboard on an X-stand (2 x 1, 1.05 m). */
function keyboardDigital() {
  const m = new Model('keyboardDigital');
  bx(m, 'metalDark', 0.3, 0.76, 0.28, 1.7, 0.84, 0.72);
  keys(m, 0.34, 1.66, 0.46, 0.7, 0.84, 24, 'metalDark');
  bx(m, 'metalMedium', 0.3, 0.84, 0.28, 1.7, 0.9, 0.46);
  bx(m, 'glass', 0.42, 0.9, 0.34, 0.66, 0.92, 0.42);
  for (let i = 0; i < 5; i++) bx(m, 'carpet', 0.9 + i * 0.1, 0.9, 0.34, 0.96 + i * 0.1, 0.93, 0.4);
  bx(m, 'metalLight', 1.45, 0.9, 0.34, 1.6, 0.92, 0.42);
  for (const s of [-1, 1]) { // X stand
    const x0 = 1 + s * 0.5, x1 = 1 - s * 0.5;
    m.rod('metal', [x0, 0, 0.3], [x1, 0.76, 0.3], 0.04);
    m.rod('metal', [x0, 0, 0.7], [x1, 0.76, 0.7], 0.04);
  }
  m.rod('metal', [1, 0.4, 0.3], [1, 0.4, 0.7], 0.03);
  bx(m, 'metalDark', 1.5, 0, 0.74, 1.62, 0.025, 0.9); // sustain pedal
  return m;
}
/** Two-tier synth rig (2 x 1, 1.2 m). */
function keyboardStage() {
  const m = new Model('keyboardStage');
  for (const x of [0.25, 1.75]) {
    m.rod('metalDark', [x, 0, 0.2], [x, 1.0, 0.35], 0.045);
    m.rod('metalDark', [x, 0, 0.8], [x, 0.7, 0.65], 0.045);
    m.rod('metalDark', [x, 0.7, 0.65], [x, 1.0, 0.35], 0.03);
    bx(m, 'metalDark', x - 0.05, 0, 0.18, x + 0.05, 0.03, 0.82);
  }
  m.rod('metalDark', [0.25, 0.5, 0.5], [1.75, 0.5, 0.5], 0.03);
  bx(m, 'carpetDarker', 0.32, 0.72, 0.5, 1.68, 0.8, 0.82); // lower keyboard
  keys(m, 0.36, 1.64, 0.62, 0.8, 0.8, 22, 'metalDark');
  bx(m, 'metalDark', 0.32, 0.8, 0.5, 1.68, 0.88, 0.62);
  bx(m, 'carpetBlue', 0.32, 1.0, 0.2, 1.68, 1.08, 0.5); // upper keyboard
  keys(m, 0.36, 1.64, 0.32, 0.5, 1.08, 22, 'metalDark');
  bx(m, 'metalDark', 0.32, 1.08, 0.2, 1.68, 1.18, 0.32);
  for (let i = 0; i < 8; i++) bx(m, i % 2 ? 'carpet' : 'metalLight', 0.5 + i * 0.12, 1.18, 0.22, 0.56 + i * 0.12, 1.2, 0.28);
  bx(m, 'metalDark', 1.5, 0, 0.84, 1.64, 0.03, 0.98);
  return m;
}
/** Harpsichord on turned legs (1 x 2, 0.95 m): tapering case with a painted inner lid. */
function harpsichord() {
  const m = new Model('harpsichord');
  prism(m, 'wood', [[0.08, 1.88], [0.92, 1.88], [0.92, 1.2], [0.66, 0.16], [0.08, 0.16]], 0.72, 0.84, true);
  prism(m, 'carpetBlue', [[0.12, 1.26], [0.88, 1.26], [0.64, 0.2], [0.12, 0.2]], 0.84, 0.86);
  prism(m, 'woodDark', [[0.08, 1.26], [0.92, 1.26], [0.66, 0.16], [0.08, 0.16]], 0.86, 0.9);
  bx(m, 'woodDark', 0.1, 0.84, 1.28, 0.9, 0.9, 1.88);
  keys(m, 0.16, 0.84, 1.4, 1.84, 0.9, 12, 'woodDark');
  bx(m, 'woodDark', 0.14, 0.9, 1.26, 0.86, 1.04, 1.3);
  for (const [x, z] of [[0.16, 1.78], [0.84, 1.78], [0.16, 0.26], [0.7, 0.26]]) {
    m.cylY('woodDark', x, z, 0, 0.72, 0.03, 0.05, 8);
    m.cylY('wood', x, z, 0.3, 0.38, 0.06, 0.06, 8);
  }
  bx(m, 'woodDark', 0.16, 0.38, 1.76, 0.84, 0.42, 1.8);
  return m;
}
/** Parlour reed organ with a pipe rack (2 x 1, 1.9 m). */
function organParlour() {
  const m = new Model('organParlour');
  bx(m, 'woodDark', 0.2, 0, 0.1, 1.8, 0.12, 0.62);
  bx(m, 'wood', 0.22, 0.12, 0.12, 1.78, 0.78, 0.6);
  bx(m, 'wood', 0.2, 0.78, 0.1, 1.8, 0.84, 0.88); // key shelf
  keys(m, 0.32, 1.68, 0.64, 0.86, 0.84, 18);
  bx(m, 'woodDark', 0.22, 0.86, 0.1, 1.78, 1.5, 0.52); // upper cabinet
  for (let i = 0; i < 8; i++) bx(m, 'metalLight', 0.4 + i * 0.06, 0.9, 0.52, 0.44 + i * 0.06, 0.94, 0.56); // stops
  for (let i = 0; i < 8; i++) bx(m, 'metalLight', 1.12 + i * 0.06, 0.9, 0.52, 1.16 + i * 0.06, 0.94, 0.56);
  for (let i = 0; i < 11; i++) m.cylY('metal', 0.3 + i * 0.14, 0.3, 1.5, 1.62 + 0.28 * Math.sin((i / 10) * Math.PI), 0.04, 0.04, 8);
  bx(m, 'woodDark', 0.22, 1.5, 0.1, 1.78, 1.54, 0.5);
  for (const x of [0.5, 0.75, 1.25, 1.5]) bx(m, 'metal', x, 0.04, 0.58, x + 0.14, 0.1, 0.78);
  return m;
}
/** Drum kit with throne (2 x 2, 1.35 m); the drummer sits at the front (+z). */
function drumKit() {
  const m = new Model('drumKit');
  m.cyl('carpet', [1.0, 0.32, 0.4], [1.0, 0.32, 0.85], 0.32, 12);
  m.cyl('metal', [1.0, 0.32, 0.38], [1.0, 0.32, 0.4], 0.33, 12);
  m.cyl('metal', [1.0, 0.32, 0.85], [1.0, 0.32, 0.87], 0.33, 12);
  for (const s of [-1, 1]) m.rod('metalDark', [1 + s * 0.28, 0, 0.7], [1 + s * 0.32, 0.36, 0.55], 0.03);
  bx(m, 'metalDark', 0.95, 0.04, 1.0, 1.08, 0.07, 1.25); // kick pedal
  for (const x of [0.78, 1.22]) { m.rod('metalDark', [x, 0.6, 0.55], [x, 0.8, 0.55], 0.03); m.cyl('carpet', [x, 0.85, 0.45], [x, 0.85, 0.7], 0.14, 10); }
  m.cyl('carpet', [0.55, 0.55, 0.95], [0.55, 0.7, 0.95], 0.1, 10); // snare
  m.cylY('carpet', 0.55, 0.95, 0.45, 0.7, 0.16, 0.16, 10);
  m.cylY('metalLight', 0.55, 0.95, 0.7, 0.72, 0.16, 0.16, 10);
  for (const [x, z] of [[0.55, 0.95], [1.55, 0.8]]) m.rod('metalDark', [x, 0, z], [x, 0.45, z], 0.025);
  m.cylY('carpet', 1.55, 0.8, 0.4, 0.8, 0.22, 0.22, 10); // floor tom
  m.cylY('metalLight', 1.55, 0.8, 0.8, 0.82, 0.22, 0.22, 10);
  for (const x of [1.8, 1.8]) m.rod('metalDark', [x, 0, 0.8], [x - 0.15, 0.4, 0.8], 0.025);
  m.rod('metalDark', [0.25, 0, 0.7], [0.25, 0.95, 0.7], 0.025); // hi-hat
  m.cylY('metal', 0.25, 0.7, 0.95, 0.965, 0.14, 0.14, 10);
  m.cylY('metal', 0.25, 0.7, 0.98, 0.995, 0.14, 0.14, 10);
  m.rod('metalDark', [0.6, 0, 0.3], [0.7, 1.25, 0.35], 0.025); // crash
  m.cylY('metal', 0.7, 0.35, 1.25, 1.29, 0.2, 0.05, 10);
  m.rod('metalDark', [1.75, 0, 0.35], [1.6, 1.2, 0.4], 0.025); // ride
  m.cylY('metal', 1.6, 0.4, 1.2, 1.24, 0.23, 0.06, 10);
  m.cylY('carpetDarker', 1.0, 1.55, 0.42, 0.5, 0.17, 0.17, 10); // throne
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; m.rod('metalDark', [1 + Math.cos(a) * 0.22, 0, 1.55 + Math.sin(a) * 0.22], [1, 0.42, 1.55], 0.025); }
  return m;
}
/** Concert harp (1 x 1, 1.75 m). */
function harpConcert() {
  const m = new Model('harpConcert');
  bx(m, 'woodDark', 0.2, 0, 0.36, 0.8, 0.06, 0.64);
  m.box('wood', [0.22, 0.06, 0.4], [0.5, 0.07, 0.6]);
  m.hexa('wood', [[0.22, 0.06, 0.4], [0.5, 0.06, 0.4], [0.5, 0.06, 0.6], [0.22, 0.06, 0.6], [0.3, 1.2, 0.43], [0.42, 1.2, 0.43], [0.42, 1.2, 0.57], [0.3, 1.2, 0.57]]); // soundbox
  bx(m, 'woodDark', 0.62, 0.06, 0.45, 0.7, 1.62, 0.55); // column
  m.rod('wood', [0.66, 1.62, 0.5], [0.52, 1.7, 0.5], 0.07, 0.08);
  m.rod('wood', [0.52, 1.7, 0.5], [0.34, 1.34, 0.5], 0.07, 0.08);
  m.rod('woodDark', [0.34, 1.34, 0.5], [0.36, 1.2, 0.5], 0.06, 0.06);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    m.rod(i % 3 ? 'metalLight' : 'carpet', [0.6 - t * 0.2, 1.62 - 0.1 - t * 0.28 * 0.9, 0.5], [0.46 - t * 0.12, 0.2 + t * 0.95, 0.5], 0.008, 0.008);
  }
  for (const x of [0.6, 0.67, 0.74]) bx(m, 'metal', x - 0.015, 0.06, 0.62, x + 0.015, 0.14, 0.66);
  return m;
}
/** Cello on a stand with bow (1 x 1, 1.65 m). */
function celloStand() {
  const m = new Model('celloStand');
  bx(m, 'metalDark', 0.25, 0, 0.3, 0.75, 0.04, 0.7);
  for (const x of [0.38, 0.62]) m.rod('metalDark', [x, 0.04, 0.5], [x, 0.4, 0.5], 0.025);
  bx(m, 'metalDark', 0.34, 0.38, 0.4, 0.66, 0.42, 0.6);
  bx(m, 'wood', 0.32, 0.28, 0.43, 0.68, 0.58, 0.57); // lower bout
  bx(m, 'wood', 0.38, 0.58, 0.43, 0.62, 0.7, 0.57); // waist
  bx(m, 'wood', 0.35, 0.7, 0.43, 0.65, 1.0, 0.57); // upper bout
  m.rod('woodDark', [0.5, 0.94, 0.58], [0.5, 1.5, 0.58], 0.05, 0.025); // fingerboard
  bx(m, 'wood', 0.46, 1.5, 0.52, 0.54, 1.6, 0.62);
  bx(m, 'woodDark', 0.44, 1.6, 0.52, 0.56, 1.66, 0.6);
  bx(m, 'woodDark', 0.42, 0.52, 0.575, 0.58, 0.58, 0.6); // bridge
  bx(m, 'woodDark', 0.38, 0.38, 0.57, 0.41, 0.52, 0.575); // f-holes
  bx(m, 'woodDark', 0.59, 0.38, 0.57, 0.62, 0.52, 0.575);
  m.rod('metal', [0.5, 0.28, 0.5], [0.5, 0.06, 0.5], 0.015);
  m.rod('woodDark', [0.8, 0.06, 0.5], [0.76, 1.1, 0.5], 0.02);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Hobby: art and craft
// ---------------------------------------------------------------------------------------------

/** Small tabletop easel with a canvas (surface, 0.55 m). */
function easelTabletop() {
  const m = new Model('easelTabletop');
  m.rod('wood', [0.3, 0, 0.62], [0.35, 0.52, 0.45], 0.035);
  m.rod('wood', [0.7, 0, 0.62], [0.65, 0.52, 0.45], 0.035);
  m.rod('woodDark', [0.5, 0, 0.3], [0.5, 0.48, 0.44], 0.035);
  bx(m, 'woodDark', 0.28, 0.1, 0.55, 0.72, 0.14, 0.65);
  bx(m, 'carpetWhite', 0.32, 0.14, 0.5, 0.68, 0.46, 0.53);
  bx(m, 'carpetBlue', 0.35, 0.3, 0.53, 0.65, 0.43, 0.545);
  bx(m, 'plant', 0.35, 0.17, 0.53, 0.65, 0.3, 0.545);
  bx(m, 'carpet', 0.5, 0.3, 0.545, 0.58, 0.38, 0.55);
  for (const x of [0.36, 0.46]) m.cylY('carpet', x, 0.6, 0.14, 0.18, 0.025, 0.025, 6);
  return m;
}
/** Large H-frame gallery easel with crank mast (1 x 1, 1.95 m). */
function easelGallery() {
  const m = new Model('easelGallery');
  for (const x of [0.15, 0.85]) { bx(m, 'wood', x - 0.03, 0, 0.42, x + 0.03, 1.8, 0.48); bx(m, 'woodDark', x - 0.08, 0, 0.3, x + 0.08, 0.04, 0.7); }
  bx(m, 'woodDark', 0.15, 0.1, 0.43, 0.85, 0.16, 0.47);
  bx(m, 'woodDark', 0.15, 1.6, 0.43, 0.85, 1.68, 0.47);
  m.rod('woodDark', [0.5, 0.2, 0.5], [0.5, 1.9, 0.5], 0.05, 0.05);
  bx(m, 'metalDark', 0.38, 1.78, 0.42, 0.62, 1.88, 0.58);
  bx(m, 'metal', 0.74, 1.0, 0.5, 0.82, 1.06, 0.56); // crank
  m.rod('wood', [0.5, 1.3, 0.45], [0.5, 0.02, 0.1], 0.04);
  bx(m, 'wood', 0.2, 0.5, 0.5, 0.8, 0.56, 0.7); // tray
  bx(m, 'woodDark', 0.2, 0.56, 0.68, 0.8, 0.62, 0.7);
  bx(m, 'carpetWhite', 0.18, 0.6, 0.52, 0.82, 1.58, 0.55);
  bx(m, 'carpetBlue', 0.22, 1.1, 0.55, 0.78, 1.54, 0.565);
  bx(m, 'carpet', 0.22, 0.7, 0.55, 0.5, 1.1, 0.565);
  bx(m, 'plant', 0.5, 0.64, 0.55, 0.78, 1.1, 0.565);
  bx(m, 'wood', 0.3, 1.2, 0.565, 0.4, 1.3, 0.57);
  for (const [x, mat] of [[0.3, 'carpet'], [0.5, 'carpetBlue'], [0.7, 'plant']]) m.cylY(mat, x, 0.62, 0.62, 0.68, 0.03, 0.03, 6);
  return m;
}
/** French sketch-box easel on a tripod (1 x 1, 1.55 m). */
function easelFrench() {
  const m = new Model('easelFrench');
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 1.0; m.rod('wood', [0.5 + Math.cos(a) * 0.38, 0, 0.5 + Math.sin(a) * 0.38], [0.5 + Math.cos(a) * 0.1, 0.72, 0.5 + Math.sin(a) * 0.1], 0.04); }
  bx(m, 'wood', 0.24, 0.72, 0.36, 0.76, 0.84, 0.7);
  bx(m, 'woodDark', 0.27, 0.8, 0.39, 0.73, 0.85, 0.67);
  bx(m, 'carpet', 0.3, 0.85, 0.5, 0.36, 0.88, 0.56);
  bx(m, 'carpetBlue', 0.4, 0.85, 0.5, 0.46, 0.88, 0.56);
  bx(m, 'plant', 0.5, 0.85, 0.5, 0.56, 0.88, 0.56);
  bx(m, 'woodDark', 0.24, 0.84, 0.3, 0.76, 1.5, 0.36); // raised lid and mast
  bx(m, 'metal', 0.44, 1.42, 0.36, 0.56, 1.5, 0.4);
  bx(m, 'carpetWhite', 0.28, 0.9, 0.36, 0.72, 1.38, 0.39);
  bx(m, 'carpetBlue', 0.3, 1.1, 0.39, 0.7, 1.36, 0.4);
  bx(m, 'plant', 0.3, 0.92, 0.39, 0.7, 1.1, 0.4);
  bx(m, 'metal', 0.46, 0.78, 0.7, 0.54, 0.82, 0.74); // clasp
  m.rod('metal', [0.24, 0.8, 0.5], [0.16, 0.8, 0.5], 0.02);
  return m;
}
/** Long craft table with supplies (2 x 1, 1.05 m). */
function craftTable() {
  const m = new Model('craftTable');
  bx(m, 'wood', 0.1, 0.74, 0.18, 1.9, 0.79, 0.82);
  for (const x of [0.16, 1.78]) for (const z of [0.24, 0.7]) bx(m, 'woodDark', x, 0, z, x + 0.06, 0.74, z + 0.06);
  bx(m, 'wood', 0.16, 0.2, 0.24, 1.84, 0.24, 0.76);
  bx(m, 'plant', 0.4, 0.79, 0.28, 1.0, 0.795, 0.7); // cutting mat
  bx(m, 'carpetWhite', 0.5, 0.795, 0.34, 0.85, 0.8, 0.6);
  bx(m, 'carpetBlue', 0.6, 0.8, 0.4, 0.9, 0.805, 0.64);
  for (const [i, x, z] of [[0, 1.2, 0.3], [1, 1.32, 0.3], [2, 1.44, 0.3]]) {
    m.cylY('metalDark', x, z, 0.79, 0.9, 0.04, 0.04, 8);
    m.rod(['carpet', 'woodDark', 'carpetBlue'][i], [x, 0.9, z], [x + 0.03 * (i - 1), 1.0, z], 0.014);
  }
  bx(m, 'carpetWhite', 1.55, 0.79, 0.4, 1.85, 0.84, 0.7);
  bx(m, 'carpet', 1.58, 0.84, 0.44, 1.82, 0.87, 0.66);
  bx(m, 'carpetBlue', 1.2, 0.79, 0.5, 1.5, 0.82, 0.74);
  bx(m, 'metalLight', 1.15, 0.79, 0.62, 1.3, 0.8, 0.64);
  m.cyl('carpetDarker', [1.1, 0.79, 0.76], [1.1, 0.88, 0.76], 0.05, 8);
  return m;
}
/** Treadle sewing machine table (1 x 1, 1.0 m). */
function sewingTable() {
  const m = new Model('sewingTable');
  for (const x of [0.15, 0.85]) {
    bx(m, 'metalDark', x - 0.05, 0, 0.3, x + 0.05, 0.04, 0.7);
    m.rod('metalDark', [x, 0.04, 0.5], [x, 0.7, 0.5], 0.05);
    m.rod('metalDark', [x, 0.2, 0.34], [x, 0.7, 0.34], 0.03);
    m.rod('metalDark', [x, 0.2, 0.66], [x, 0.7, 0.66], 0.03);
  }
  bx(m, 'metalDark', 0.18, 0.12, 0.38, 0.82, 0.15, 0.62); // treadle plate
  m.cyl('metalMedium', [0.93, 0.4, 0.5], [0.97, 0.4, 0.5], 0.17, 10);
  bx(m, 'wood', 0.08, 0.7, 0.24, 0.92, 0.76, 0.76);
  bx(m, 'metalLight', 0.24, 0.76, 0.36, 0.76, 0.8, 0.66);
  bx(m, 'metalLight', 0.6, 0.8, 0.44, 0.74, 1.0, 0.58);
  bx(m, 'metalLight', 0.28, 0.92, 0.44, 0.74, 1.0, 0.58);
  bx(m, 'metalLight', 0.24, 0.8, 0.46, 0.34, 1.0, 0.56);
  m.rod('metalDark', [0.3, 0.8, 0.51], [0.3, 0.9, 0.51], 0.014);
  m.cylY('carpetDarker', 0.5, 0.51, 1.0, 1.06, 0.03, 0.03, 8);
  m.cyl('metalDark', [0.74, 0.92, 0.5], [0.8, 0.92, 0.5], 0.06, 8);
  bx(m, 'carpet', 0.3, 0.8, 0.3, 0.44, 0.83, 0.4); // cloth on the bed
  return m;
}

// ---------------------------------------------------------------------------------------------
// Hobby: fitness
// ---------------------------------------------------------------------------------------------

/** Exercise bike (1 x 1, 1.2 m): handlebars at the back, saddle at the front. */
function exerciseBike() {
  const m = new Model('exerciseBike');
  bx(m, 'metalDark', 0.3, 0, 0.16, 0.7, 0.05, 0.26);
  bx(m, 'metalDark', 0.3, 0, 0.78, 0.7, 0.05, 0.88);
  m.rod('metalDark', [0.5, 0.05, 0.22], [0.5, 0.48, 0.45], 0.06);
  m.rod('metalDark', [0.5, 0.05, 0.83], [0.5, 0.48, 0.5], 0.06);
  m.cyl('metalMedium', [0.42, 0.34, 0.3], [0.58, 0.34, 0.3], 0.2, 12);
  m.rod('metalDark', [0.5, 0.48, 0.5], [0.5, 0.7, 0.72], 0.05);
  bx(m, 'carpetDarker', 0.4, 0.7, 0.62, 0.6, 0.76, 0.9); // saddle
  m.rod('metalDark', [0.5, 0.48, 0.38], [0.5, 1.0, 0.25], 0.05);
  m.rod('metal', [0.32, 1.0, 0.22], [0.68, 1.0, 0.22], 0.03);
  bx(m, 'metalDark', 0.4, 0.98, 0.24, 0.6, 1.1, 0.3);
  bx(m, 'glass', 0.43, 1.08, 0.3, 0.57, 1.12, 0.31);
  m.rod('metalLight', [0.3, 0.3, 0.3], [0.3, 0.12, 0.42], 0.03);
  m.rod('metalLight', [0.7, 0.3, 0.3], [0.7, 0.5, 0.18], 0.03);
  bx(m, 'metalDark', 0.24, 0.1, 0.4, 0.36, 0.14, 0.5);
  bx(m, 'metalDark', 0.64, 0.46, 0.14, 0.76, 0.5, 0.24);
  return m;
}
/** Rowing machine (1 x 2, 0.65 m) with the flywheel at the back. */
function rowingMachine() {
  const m = new Model('rowingMachine');
  bx(m, 'metalDark', 0.43, 0.16, 0.3, 0.57, 0.22, 1.9);
  m.cyl('metalMedium', [0.28, 0.4, 0.4], [0.72, 0.4, 0.4], 0.22, 12);
  bx(m, 'metalDark', 0.26, 0.2, 0.3, 0.74, 0.62, 0.5);
  bx(m, 'metalDark', 0.25, 0, 0.2, 0.75, 0.16, 0.34);
  bx(m, 'metalDark', 0.25, 0, 1.8, 0.75, 0.16, 1.94);
  bx(m, 'carpetDarker', 0.35, 0.24, 1.15, 0.65, 0.3, 1.45); // seat
  bx(m, 'metal', 0.4, 0.22, 1.1, 0.6, 0.24, 1.5);
  for (const s of [-1, 1]) m.rod('metalDark', [0.5 + s * 0.14, 0.2, 0.6], [0.5 + s * 0.17, 0.34, 0.7], 0.04); // foot rests
  bx(m, 'metalDark', 0.3, 0.26, 0.6, 0.7, 0.3, 0.7);
  bx(m, 'metalDark', 0.38, 0.62, 0.34, 0.62, 0.8, 0.4);
  bx(m, 'glass', 0.41, 0.68, 0.4, 0.59, 0.77, 0.41);
  m.rod('metal', [0.5, 0.34, 0.5], [0.5, 0.34, 1.1], 0.02);
  bx(m, 'metal', 0.35, 0.3, 1.05, 0.65, 0.34, 1.1);
  return m;
}
/** Heavy punching bag on a stand (1 x 1, 2.0 m). */
function punchingBag() {
  const m = new Model('punchingBag');
  bx(m, 'metalDark', 0.1, 0, 0.1, 0.9, 0.05, 0.9);
  for (const [x, z] of [[0.2, 0.2], [0.8, 0.2]]) m.cylY('metalMedium', x, z, 0.05, 0.12, 0.1, 0.1, 8);
  bx(m, 'metalDark', 0.46, 0.05, 0.14, 0.54, 2.0, 0.22);
  bx(m, 'metalDark', 0.46, 1.92, 0.14, 0.54, 2.0, 0.68);
  m.rod('metal', [0.46, 1.95, 0.48], [0.46, 1.7, 0.48], 0.02);
  m.rod('metal', [0.54, 1.95, 0.48], [0.54, 1.7, 0.48], 0.02);
  m.cylY('carpetDarker', 0.5, 0.64, 1.62, 1.7, 0.1, 0.1, 10);
  m.cylY('carpet', 0.5, 0.64, 0.58, 1.62, 0.17, 0.17, 10);
  m.cylY('carpetDarker', 0.5, 0.64, 0.52, 0.58, 0.14, 0.17, 10);
  m.cylY('metalDark', 0.5, 0.64, 1.2, 1.26, 0.172, 0.172, 10);
  return m;
}
/** Squat rack with a loaded barbell (1 x 2, 2.0 m). */
function squatRack() {
  const m = new Model('squatRack');
  bx(m, 'carpetDarker', 0.04, 0, 0.2, 0.96, 0.025, 1.8);
  for (const x of [0.2, 0.8]) for (const z of [0.5, 1.1]) bx(m, 'metalDark', x - 0.04, 0.025, z - 0.04, x + 0.04, 1.9, z + 0.04);
  for (const x of [0.2, 0.8]) { bx(m, 'metalDark', x - 0.03, 0.025, 0.5, x + 0.03, 0.05, 1.1); bx(m, 'metalDark', x - 0.03, 1.85, 0.5, x + 0.03, 1.9, 1.1); }
  bx(m, 'metalDark', 0.16, 1.82, 0.5, 0.84, 1.9, 0.54); // pull-up bar
  m.rod('metal', [0.04, 1.4, 0.5], [0.96, 1.4, 0.5], 0.03); // barbell
  for (const x of [0.08, 0.13, 0.87, 0.92]) m.cyl('metalDark', [x - 0.02, 1.4, 0.5], [x + 0.02, 1.4, 0.5], x < 0.5 ? 0.16 - (x - 0.08) * 0.4 : 0.16 - (0.92 - x) * 0.4, 10);
  for (const x of [0.2, 0.8]) bx(m, 'metal', x - 0.05, 1.22, 0.44, x + 0.05, 1.26, 0.56); // hooks
  for (const [x, z, r] of [[0.2, 1.1, 0.14], [0.8, 1.1, 0.14], [0.2, 1.1, 0.1]]) m.cyl('metalMedium', [x, 1.0 + (r < 0.12 ? 0.18 : 0), z + 0.05], [x, 1.0 + (r < 0.12 ? 0.18 : 0), z + 0.1], r, 10);
  return m;
}
/** Elliptical cross trainer (1 x 2, 1.6 m). */
function ellipticalTrainer() {
  const m = new Model('ellipticalTrainer');
  bx(m, 'metalDark', 0.25, 0, 0.22, 0.75, 0.06, 0.4);
  bx(m, 'metalDark', 0.25, 0, 1.7, 0.75, 0.06, 1.88);
  bx(m, 'metalDark', 0.42, 0.06, 0.3, 0.58, 0.14, 1.8);
  m.cyl('metalMedium', [0.28, 0.4, 0.4], [0.72, 0.4, 0.4], 0.28, 12);
  bx(m, 'metalDark', 0.26, 0.1, 0.3, 0.74, 0.7, 0.5); // flywheel housing
  m.rod('metalDark', [0.5, 0.5, 0.4], [0.5, 1.5, 0.45], 0.08, 0.06); // console post
  bx(m, 'metalDark', 0.32, 1.38, 0.38, 0.68, 1.6, 0.5);
  bx(m, 'glass', 0.38, 1.44, 0.5, 0.62, 1.55, 0.51);
  for (const s of [-1, 1]) {
    m.rod('metalLight', [0.5 + s * 0.2, 0.35, 0.45], [0.5 + s * 0.2, 1.3, 0.5], 0.04); // handles
    m.rod('metalLight', [0.5 + s * 0.22, 0.34, 0.5], [0.5 + s * 0.22, 0.2, 1.4], 0.04); // foot arms
    bx(m, 'carpetDarker', 0.5 + s * 0.22 - 0.1, 0.2, 1.3, 0.5 + s * 0.22 + 0.1, 0.25, 1.6); // pedals
    bx(m, 'metalDark', 0.5 + s * 0.2 - 0.04, 0.9, 0.46, 0.5 + s * 0.2 + 0.04, 1.0, 0.54);
  }
  return m;
}
/** Round yoga mat (rug layer, 0.9 m). */
function yogaMatRound() {
  const m = new Model('yogaMatRound');
  m.cylY('carpetBlue', 0.5, 0.5, 0, 0.018, 0.45, 0.45, 16);
  m.cylY('carpetWhite', 0.5, 0.5, 0.018, 0.022, 0.4, 0.4, 16);
  m.cylY('carpetBlue', 0.5, 0.5, 0.022, 0.026, 0.34, 0.34, 16);
  m.cylY('carpetWhite', 0.5, 0.5, 0.026, 0.03, 0.12, 0.12, 12);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Hobby: games, science, workshop, reading, gardening
// ---------------------------------------------------------------------------------------------

/** Marble-top chess table (1 x 1, 0.75 m). */
function chessTableMarble() {
  const m = new Model('chessTableMarble');
  m.cylY('woodDark', 0.5, 0.5, 0, 0.05, 0.3, 0.26, 8);
  m.cylY('wood', 0.5, 0.5, 0.05, 0.66, 0.06, 0.05, 8);
  m.cylY('wood', 0.5, 0.5, 0.58, 0.66, 0.12, 0.2, 8);
  prism(m, 'carpetWhite', ngon(0.5, 0.5, 0.42, 0.42, 8, Math.PI / 8), 0.66, 0.7);
  const s = 0.05, x0 = 0.5 - 4 * s, z0 = 0.5 - 4 * s;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) bx(m, 'metalDark', x0 + i * s, 0.7, z0 + j * s, x0 + (i + 1) * s, 0.704, z0 + (j + 1) * s);
  const pieces = [[0, 0, 'carpetWhite', 0.07], [3, 0, 'carpetWhite', 0.09], [4, 1, 'carpetWhite', 0.05], [2, 2, 'metalMedium', 0.06], [5, 6, 'metalMedium', 0.09], [4, 5, 'metalMedium', 0.05]];
  for (const [i, j, mat, h] of pieces) m.cylY(mat, x0 + (i + 0.5) * s, z0 + (j + 0.5) * s, 0.704, 0.704 + h, 0.016, 0.014, 6);
  return m;
}
/** Long games table with a checker board, felt and a drawer (2 x 1, 0.85 m). */
function boardGameTable() {
  const m = new Model('boardGameTable');
  bx(m, 'woodDark', 0.1, 0.72, 0.15, 1.9, 0.8, 0.85);
  bx(m, 'plant', 0.8, 0.8, 0.22, 1.82, 0.805, 0.78); // felt
  bx(m, 'wood', 0.14, 0.62, 0.62, 1.86, 0.72, 0.82); // drawer front
  bx(m, 'metal', 0.9, 0.66, 0.82, 1.1, 0.68, 0.85);
  for (const x of [0.16, 1.8]) for (const z of [0.2, 0.74]) { bx(m, 'wood', x, 0, z, x + 0.06, 0.72, z + 0.06); bx(m, 'woodDark', x - 0.01, 0.3, z - 0.01, x + 0.07, 0.34, z + 0.07); }
  const s = 0.06, bx0 = 0.2, bz0 = 0.26;
  bx(m, 'metalDark', bx0 - 0.02, 0.8, bz0 - 0.02, bx0 + 8 * s * 1.0 + 0.02 - 0.0, 0.806, bz0 + 8 * s + 0.02);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) bx(m, 'carpetWhite', bx0 + i * s, 0.806, bz0 + j * s, bx0 + (i + 1) * s, 0.81, bz0 + (j + 1) * s);
  for (const [i, j, mat] of [[1, 0, 'carpet'], [3, 0, 'carpet'], [2, 1, 'carpet'], [4, 5, 'metalDark'], [6, 7, 'metalDark'], [5, 6, 'metalDark']]) m.cylY(mat, bx0 + (i + 0.5) * s, bz0 + (j + 0.5) * s, 0.81, 0.83, 0.024, 0.024, 8);
  bx(m, 'carpetWhite', 1.2, 0.805, 0.35, 1.34, 0.825, 0.5);
  bx(m, 'carpetBlue', 1.28, 0.825, 0.4, 1.42, 0.83, 0.55);
  bx(m, 'carpetWhite', 1.55, 0.805, 0.5, 1.6, 0.845, 0.55);
  bx(m, 'carpet', 1.65, 0.805, 0.4, 1.7, 0.845, 0.45);
  return m;
}
/** Brass telescope on a wooden tripod (1 x 1, 1.7 m). */
function telescopeBrass() {
  const m = new Model('telescopeBrass');
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.6; m.rod('wood', [0.5 + Math.cos(a) * 0.38, 0, 0.5 + Math.sin(a) * 0.38], [0.5 + Math.cos(a) * 0.04, 1.05, 0.5 + Math.sin(a) * 0.04], 0.045); }
  m.cylY('metalDark', 0.5, 0.5, 1.0, 1.1, 0.09, 0.06, 8);
  bx(m, 'metalDark', 0.46, 1.1, 0.46, 0.54, 1.18, 0.54);
  m.cyl('metal', [0.5, 1.2, 0.82], [0.5, 1.62, 0.18], 0.06, 10);
  m.cyl('metalDark', [0.5, 1.2, 0.82], [0.5, 1.23, 0.88], 0.035, 8);
  m.cyl('metal', [0.5, 1.5, 0.35], [0.5, 1.64, 0.1], 0.08, 10);
  m.cyl('metalDark', [0.5, 1.36, 0.59], [0.5, 1.38, 0.62], 0.07, 10);
  m.rod('metalDark', [0.5, 1.15, 0.4], [0.5, 1.4, 0.45], 0.02);
  bx(m, 'metalDark', 0.48, 1.4, 0.42, 0.52, 1.46, 0.5);
  m.rod('metalDark', [0.58, 1.16, 0.5], [0.72, 1.0, 0.5], 0.015);
  m.cylY('metalMedium', 0.72, 0.5, 0.92, 1.02, 0.04, 0.04, 8);
  return m;
}
/** Woodworking bench with a vice and a tool wall (2 x 1, 1.7 m). */
function workbenchWoodworking() {
  const m = new Model('workbenchWoodworking');
  bx(m, 'wood', 0.08, 0.85, 0.28, 1.92, 0.93, 0.85);
  for (const x of [0.16, 1.76]) for (const z of [0.34, 0.74]) bx(m, 'woodDark', x, 0, z, x + 0.08, 0.85, z + 0.08);
  bx(m, 'woodDark', 0.16, 0.22, 0.34, 1.84, 0.28, 0.82);
  bx(m, 'wood', 0.16, 0.3, 0.36, 1.84, 0.34, 0.8);
  bx(m, 'wood', 0.08, 0.93, 0.2, 1.92, 1.7, 0.24);
  bx(m, 'woodDark', 0.08, 1.4, 0.24, 1.92, 1.44, 0.3); // tool shelf
  bx(m, 'metalDark', 0.1, 0.78, 0.7, 0.34, 0.9, 0.9);
  m.rod('metal', [0.12, 0.84, 0.9], [0.12, 0.84, 1.0], 0.025); // vice screw
  bx(m, 'metalMedium', 0.1, 0.93, 0.7, 0.3, 1.0, 0.9);
  for (const [x, len] of [[0.4, 0.3], [0.6, 0.4], [0.8, 0.28], [1.0, 0.34]]) { bx(m, 'woodDark', x, 1.4 - len, 0.3, x + 0.03, 1.4, 0.34); bx(m, 'metal', x - 0.02, 1.4 - len - 0.06, 0.3, x + 0.05, 1.4 - len, 0.33); } // hanging tools
  bx(m, 'metalMedium', 1.25, 0.95, 0.24, 1.7, 1.3, 0.27); // saw blade
  bx(m, 'woodDark', 1.7, 1.2, 0.24, 1.8, 1.35, 0.27);
  bx(m, 'wood', 0.7, 0.93, 0.5, 1.3, 0.99, 0.7); // plank
  bx(m, 'carpet', 1.4, 0.93, 0.5, 1.58, 1.0, 0.64); // plane
  bx(m, 'woodDark', 1.45, 1.0, 0.54, 1.53, 1.05, 0.6);
  bx(m, 'metal', 1.62, 0.93, 0.62, 1.8, 0.96, 0.7);
  for (const x of [0.5, 0.9, 1.3, 1.7]) m.cylY('metalDark', x, 0.66, 0.34, 0.4, 0.05, 0.05, 6); // jars on the shelf
  return m;
}
/** Window-seat reading nook between two full bookcases (2 x 1, 2.1 m). */
function readingNookShelf() {
  const m = new Model('readingNookShelf');
  const colors = ['carpet', 'carpetBlue', 'carpetWhite', 'carpetDarker', 'woodDark'];
  for (const x0 of [0.08, 1.46]) {
    bx(m, 'wood', x0, 0, 0.06, x0 + 0.46, 2.1, 0.1);
    bx(m, 'wood', x0, 0, 0.06, x0 + 0.04, 2.1, 0.46);
    bx(m, 'wood', x0 + 0.42, 0, 0.06, x0 + 0.46, 2.1, 0.46);
    for (let r = 0; r < 6; r++) {
      const y = 0.04 + r * 0.4;
      bx(m, 'wood', x0, y, 0.06, x0 + 0.46, y + 0.03, 0.46);
      if (r < 5) for (let k = 0; k < 4; k++) bx(m, colors[(r + k) % 5], x0 + 0.06 + k * 0.1, y + 0.03, 0.14, x0 + 0.06 + k * 0.1 + 0.08, y + 0.03 + 0.24 + ((r * k) % 3) * 0.03, 0.4);
    }
  }
  bx(m, 'woodDark', 0.54, 0.0, 0.06, 1.46, 0.4, 0.55); // bench box
  bx(m, 'carpet', 0.56, 0.4, 0.1, 1.44, 0.5, 0.55); // seat cushion
  bx(m, 'carpetBlue', 0.58, 0.5, 0.1, 0.88, 0.8, 0.22); // back cushions
  bx(m, 'carpetWhite', 1.12, 0.5, 0.1, 1.42, 0.78, 0.22);
  bx(m, 'wood', 0.54, 1.0, 0.06, 1.46, 2.1, 0.1); // window frame behind
  frameRect(m, 'woodDark', 0.54, 1.0, 1.46, 2.1, 0.06, 0.06, 0.05);
  bx(m, 'glass', 0.6, 1.05, 0.1, 1.4, 2.05, 0.11);
  bx(m, 'woodDark', 0.54, 0.4, 0.06, 1.46, 0.44, 0.1);
  return m;
}
/** Potting bench with a tray, tools and pots (2 x 1, 1.55 m). */
function pottingBench() {
  const m = new Model('pottingBench');
  for (const x of [0.12, 1.82]) for (const z of [0.3, 0.72]) bx(m, 'woodDark', x, 0, z, x + 0.06, 0.88, z + 0.06);
  for (let i = 0; i < 5; i++) bx(m, 'wood', 0.08, 0.88, 0.26 + i * 0.1, 1.92, 0.94, 0.34 + i * 0.1); // slatted top
  bx(m, 'wood', 0.12, 0.3, 0.3, 1.88, 0.34, 0.78);
  for (const x of [0.12, 1.82]) bx(m, 'woodDark', x, 0.88, 0.2, x + 0.06, 1.55, 0.26); // back posts
  bx(m, 'wood', 0.08, 1.15, 0.2, 1.92, 1.2, 0.34); // shelf
  bx(m, 'woodDark', 0.1, 1.5, 0.2, 1.9, 1.55, 0.26);
  bx(m, 'metal', 0.3, 0.94, 0.34, 0.9, 1.08, 0.78); // soil trough
  bx(m, 'woodDark', 0.34, 1.04, 0.38, 0.86, 1.09, 0.74);
  for (const [x, z] of [[1.15, 0.5], [1.32, 0.6], [1.5, 0.48]]) { m.lathe('wood', x, z, [[0.05, 0.94], [0.08, 1.06]], 8); m.cylY('woodDark', x, z, 1.03, 1.07, 0.07, 0.07, 8); }
  for (const a of [0.5, 2.6, 4.4]) leaf(m, [1.32, 1.06, 0.6], a, 0.8, 0.14, 0.05, 0.012);
  m.cylY('metal', 1.7, 0.5, 0.94, 1.08, 0.07, 0.065, 8); // watering can
  m.rod('metal', [1.7, 1.0, 0.5], [1.86, 1.1, 0.5], 0.03);
  m.rod('metal', [1.64, 1.08, 0.5], [1.76, 1.2, 0.5], 0.025);
  for (const x of [0.4, 0.62, 0.9]) { m.lathe('wood', x, 0.27, [[0.05, 1.2], [0.08, 1.32]], 8); leaf(m, [x, 1.32, 0.27], x * 7, 0.9, 0.1, 0.05, 0.012); }
  bx(m, 'carpetWhite', 1.4, 0.34, 0.4, 1.8, 0.62, 0.7); // soil bag below
  bx(m, 'woodDark', 1.4, 0.58, 0.4, 1.8, 0.62, 0.7);
  return m;
}

// ---- Milestone 13: games and pottery (interactions in src/content/interactionsFurnishings.ts) --------------------------------
/** Pool table with cloth, cushions, pockets and a racked triangle of balls (3 x 2, 0.85 m). */
function poolTable() {
  const m = new Model('poolTable');
  bx(m, 'woodDark', 0.3, 0.62, 0.3, 2.7, 0.82, 1.7); // slate box
  bx(m, 'plant', 0.45, 0.82, 0.45, 2.55, 0.835, 1.55); // cloth
  for (const [x0, z0, x1, z1] of [[0.3, 0.3, 2.7, 0.45], [0.3, 1.55, 2.7, 1.7], [0.3, 0.45, 0.45, 1.55], [2.55, 0.45, 2.7, 1.55]]) bx(m, 'wood', x0, 0.82, z0, x1, 0.9, z1);
  for (const [x, z] of [[0.36, 0.36], [1.5, 0.33], [2.64, 0.36], [0.36, 1.64], [1.5, 1.67], [2.64, 1.64]]) m.cylY('metalDark', x, z, 0.82, 0.91, 0.07, 0.07, 6);
  for (const x of [0.38, 2.5]) for (const z of [0.38, 1.5]) { bx(m, 'wood', x, 0, z, x + 0.12, 0.62, z + 0.12); bx(m, 'woodDark', x - 0.02, 0.5, z - 0.02, x + 0.14, 0.56, z + 0.14); }
  bx(m, 'woodDark', 0.5, 0.56, 0.78, 2.5, 0.62, 0.9); // stretcher
  const r = 0.028; // racked balls
  let n = 0;
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) {
    const mat = ['carpet', 'carpetBlue', 'carpetDarker', 'metalDark', 'wood', 'carpetWhite'][n++ % 6];
    m.cylY(mat, 1.95 + row * 0.05, 1.0 + (i - row / 2) * 0.057, 0.835, 0.835 + 2 * r, r, r, 6);
  }
  m.cylY('carpetWhite', 0.95, 1.0, 0.835, 0.835 + 2 * r, r, r, 6); // cue ball
  m.rod('wood', [0.2, 0.85, 1.95], [1.2, 1.2, 1.97], 0.026, 0.026); // cue resting on the cushion
  return m;
}
/** Wall dartboard in a wooden cabinet (1 x 1, bottom at the mounting height, 0.6 m). */
function dartBoard() {
  const m = new Model('dartBoard');
  bx(m, 'wood', 0.18, 0, 0.0, 0.82, 0.64, 0.05); // cabinet back
  bx(m, 'wood', 0.18, 0, 0.05, 0.24, 0.64, 0.1); bx(m, 'wood', 0.76, 0, 0.05, 0.82, 0.64, 0.1);
  bx(m, 'wood', 0.24, 0.58, 0.05, 0.76, 0.64, 0.1); bx(m, 'wood', 0.24, 0, 0.05, 0.76, 0.06, 0.1);
  m.cyl('metalDark', [0.5, 0.32, 0.05], [0.5, 0.32, 0.085], 0.26, 12);
  m.cyl('carpet', [0.5, 0.32, 0.085], [0.5, 0.32, 0.095], 0.22, 12);
  m.cyl('carpetWhite', [0.5, 0.32, 0.095], [0.5, 0.32, 0.105], 0.17, 12);
  m.cyl('plant', [0.5, 0.32, 0.105], [0.5, 0.32, 0.115], 0.11, 12);
  m.cyl('carpet', [0.5, 0.32, 0.115], [0.5, 0.32, 0.125], 0.04, 8);
  for (const [x, y] of [[0.56, 0.4], [0.44, 0.28], [0.5, 0.22]]) m.rod('metal', [x, y, 0.1], [x + 0.01, y - 0.01, 0.2], 0.012, 0.012);
  return m;
}
/** Foosball table: rods across the width, handles on the long sides (2 x 1, 0.9 m). */
function foosballTable() {
  const m = new Model('foosballTable');
  bx(m, 'woodDark', 0.15, 0.55, 0.15, 1.85, 0.9, 0.85); // cabinet
  bx(m, 'plant', 0.25, 0.86, 0.25, 1.75, 0.875, 0.75); // pitch
  bx(m, 'carpetWhite', 0.99, 0.875, 0.25, 1.01, 0.88, 0.75); // halfway line
  for (const x of [0.17, 1.77]) for (const z of [0.17, 0.77]) bx(m, 'wood', x, 0, z, x + 0.06, 0.55, z + 0.06);
  for (const [i, x] of [0.4, 0.7, 1.3, 1.6].entries()) {
    m.rod('metal', [x, 0.99, 0.05], [x, 0.99, 0.95], 0.02, 0.02);
    bx(m, 'woodDark', x - 0.04, 0.96, 0.9, x + 0.04, 1.02, 1.0); // handle
    for (const z of [0.35, 0.5, 0.65]) bx(m, i < 2 ? 'carpet' : 'carpetBlue', x - 0.03, 0.89, z - 0.03, x + 0.03, 0.99, z + 0.03);
  }
  bx(m, 'metalLight', 1.46, 0.875, 0.48, 1.5, 0.9, 0.52);
  return m;
}
/** Table tennis table with a net and two bats (3 x 2, 0.76 m). */
function tableTennisTable() {
  const m = new Model('tableTennisTable');
  bx(m, 'carpetBlue', 0.13, 0.7, 0.2, 2.87, 0.76, 1.8); // top
  bx(m, 'carpetWhite', 0.13, 0.76, 0.2, 2.87, 0.762, 0.215); bx(m, 'carpetWhite', 0.13, 0.76, 1.785, 2.87, 0.762, 1.8);
  bx(m, 'carpetWhite', 0.13, 0.76, 0.2, 0.145, 0.762, 1.8); bx(m, 'carpetWhite', 2.855, 0.76, 0.2, 2.87, 0.762, 1.8);
  bx(m, 'carpetWhite', 0.13, 0.76, 0.995, 2.87, 0.762, 1.005); // centre line
  for (const x of [0.3, 2.62]) { bx(m, 'metalDark', x, 0, 0.3, x + 0.06, 0.7, 0.36); bx(m, 'metalDark', x, 0, 1.64, x + 0.06, 0.7, 1.7); bx(m, 'metalDark', x, 0.05, 0.3, x + 0.06, 0.1, 1.7); }
  bx(m, 'metalDark', 0.3, 0.5, 0.97, 2.7, 0.55, 1.03);
  bx(m, 'metalLight', 1.4, 0.76, 0.17, 1.6, 0.775, 0.2); // net posts
  bx(m, 'metalLight', 1.4, 0.76, 1.8, 1.6, 0.775, 1.83);
  bx(m, 'metalLight', 1.495, 0.76, 0.2, 1.505, 0.915, 1.8); // net
  bx(m, 'metalLight', 1.49, 0.905, 0.2, 1.51, 0.915, 1.8);
  for (const [x, z, mat] of [[0.45, 0.6, 'carpet'], [2.5, 1.4, 'carpetDarker']]) { m.cylY(mat, x, z, 0.762, 0.77, 0.08, 0.08, 8); bx(m, 'wood', x - 0.015, 0.762, z + 0.07, x + 0.015, 0.77, z + 0.17); }
  m.cylY('carpetWhite', 1.2, 1.3, 0.762, 0.8, 0.02, 0.02, 6);
  return m;
}
/** Pottery wheel: kick wheel with a clay cone, splash pan and a bucket of water (1 x 1, 0.8 m). */
function potteryWheel() {
  const m = new Model('potteryWheel');
  bx(m, 'metalDark', 0.2, 0, 0.2, 0.8, 0.06, 0.8); // base
  for (const [x, z] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) bx(m, 'metal', x - 0.025, 0.06, z - 0.025, x + 0.025, 0.58, z + 0.025);
  m.cylY('woodDark', 0.5, 0.5, 0.58, 0.62, 0.34, 0.34, 10); // splash pan
  m.cylY('metalLight', 0.5, 0.5, 0.62, 0.66, 0.3, 0.3, 10); // pan floor
  m.cylY('metalDark', 0.5, 0.5, 0.66, 0.7, 0.14, 0.14, 10); // wheel head
  m.cylY('wood', 0.5, 0.5, 0.7, 0.86, 0.1, 0.045, 8); // spinning clay
  m.cylY('metalMedium', 0.5, 0.5, 0.06, 0.58, 0.02, 0.02, 6); // shaft
  m.cylY('woodDark', 0.5, 0.5, 0.2, 0.26, 0.2, 0.2, 10); // kick wheel
  m.cylY('carpetBlue', 0.9, 0.82, 0, 0.22, 0.09, 0.11, 8); // water bucket
  return m;
}

//EXPORT
export default { rugRunner, rugBraidedOval, rugHexGeo, rugPersian, rugShag, rugKilim, rugCowhide, rugChecker, rugSunburst, rugDoormatCoir, plantFiddleFig, plantMonstera, plantPalmAreca, plantBonsai, plantCactusTall, plantCactusTrio, plantFernStand, plantSucculentTray, plantOrchid, plantOliveTree, terrarium, plantHerbBox, vaseFloorTall, vaseRound, vaseFlowers, sculptureAbstract, sculptureBust, clockGrandfather, clockWallRound, clockCuckoo, mirrorCheval, mirrorWallRound, mirrorSunburst, pictureLandscape, pictureGallery, picturePortrait, globeFloor, globeDesk, aquarium, screenDivider, fireplaceBrick, fireplaceStove, candles, candelabraThreeArm, bowlFruit, bowlCeramicDuo, bookends, trophyCup, umbrellaStand, magazineRack, poufCushions, basketThrow, windChime, pianoGrand, pianoCottage, keyboardDigital, keyboardStage, harpsichord, organParlour, drumKit, harpConcert, celloStand, easelTabletop, easelGallery, easelFrench, craftTable, sewingTable, exerciseBike, rowingMachine, punchingBag, squatRack, ellipticalTrainer, yogaMatRound, chessTableMarble, boardGameTable, telescopeBrass, workbenchWoodworking, readingNookShelf, pottingBench, poolTable, dartBoard, foosballTable, tableTennisTable, potteryWheel };
