// The original furniture models (see kit.mjs). Authored in real metres in tile space: x along the width, z along the
// depth with the FRONT at the high-z end, y up. Every model stays inside its footprint so that fit() can centre it.

import { Model } from './kit.mjs';

const range = (n) => Array.from({ length: n }, (_, i) => i);

/** Under-counter dishwasher: the 0.92 m wide, 0.9 m high body of the kit's kitchen counters, a little shallower. */
function dishwasher() {
  const m = new Model('dishwasher');
  const D = 0.86;
  m.box('metalLight', [0, 0.08, 0], [0.92, 0.88, D]);
  m.box('metalDark', [0.02, 0, 0.02], [0.9, 0.08, D - 0.06]); // plinth
  m.box('metal', [0, 0.88, 0], [0.92, 0.9, D]); // worktop
  m.box('metalLight', [0.05, 0.09, D], [0.87, 0.74, D + 0.025]); // door
  m.box('metalDark', [0.05, 0.742, D], [0.87, 0.752, D + 0.03]); // door gap
  m.box('metalDark', [0.05, 0.754, D], [0.87, 0.865, D + 0.025]); // control strip
  for (const x of [0.14, 0.26, 0.38, 0.5]) m.box('metalLight', [x, 0.79, D + 0.025], [x + 0.07, 0.83, D + 0.035]); // buttons
  m.box('glass', [0.66, 0.785, D + 0.025], [0.82, 0.835, D + 0.032]); // display
  m.rod('metal', [0.13, 0.66, D + 0.07], [0.79, 0.66, D + 0.07], 0.03); // handle
  for (const x of [0.13, 0.79]) m.rod('metal', [x, 0.66, D + 0.025], [x, 0.66, D + 0.07], 0.03);
  return m;
}

/** A-frame studio easel with a painted canvas. */
function easel() {
  const m = new Model('easel');
  m.rod('wood', [0.2, 0, 0.62], [0.3, 1.5, 0.4], 0.05);
  m.rod('wood', [0.8, 0, 0.62], [0.7, 1.5, 0.4], 0.05);
  m.rod('woodDark', [0.5, 0, 0.12], [0.5, 1.4, 0.34], 0.05);
  m.box('wood', [0.2, 0.46, 0.4], [0.8, 0.5, 0.78]); // tray
  m.box('woodDark', [0.2, 0.5, 0.74], [0.8, 0.56, 0.78]); // tray lip
  m.rod('wood', [0.27, 1.35, 0.42], [0.73, 1.35, 0.42], 0.04); // top bar
  // canvas leaning back: bottom edge on the tray, top edge against the frame
  const bl = [0.22, 0.5, 0.56], U = [0.56, 0, 0], V = [0, 0.78, -0.14];
  const N = [0, 0.14, 0.78].map((v) => v / Math.hypot(0.14, 0.78)); // points forward and a little up
  const nv = (k) => N.map((v) => v * k);
  m.slab('carpetWhite', bl, U, V, nv(0.03));
  const dab = (mat, u0, v0, u1, v1) => {
    const o = [bl[0] + U[0] * u0 + V[0] * v0 + N[0] * 0.03, bl[1] + V[1] * v0 + N[1] * 0.03, bl[2] + V[2] * v0 + N[2] * 0.03];
    m.slab(mat, o, [U[0] * (u1 - u0), 0, 0], [0, V[1] * (v1 - v0), V[2] * (v1 - v0)], nv(0.012));
  };
  dab('carpetBlue', 0.08, 0.5, 0.92, 0.92); // sky
  dab('plant', 0.08, 0.08, 0.92, 0.42); // field
  dab('carpet', 0.55, 0.28, 0.8, 0.52); // barn
  dab('wood', 0.2, 0.55, 0.38, 0.72); // sun
  for (const [mat, x] of [['carpet', 0.32], ['carpetBlue', 0.5], ['plant', 0.68]]) { // paint pots on the tray
    m.cylY('metalDark', x, 0.67, 0.5, 0.56, 0.035, 0.035, 8);
    m.cylY(mat, x, 0.67, 0.56, 0.575, 0.028, 0.028, 8);
  }
  return m;
}

/** Upright piano (2 x 1 tiles). */
function piano() {
  const m = new Model('piano');
  const W = 1.7, x0 = 0.15;
  m.box('woodDark', [x0 + 0.04, 0, 0.04], [x0 + W - 0.04, 0.1, 0.56]); // plinth
  m.box('wood', [x0, 0.1, 0.02], [x0 + W, 1.2, 0.6]); // body
  m.box('woodDark', [x0 - 0.02, 1.2, 0], [x0 + W + 0.02, 1.25, 0.64]); // lid
  m.box('wood', [x0 + 0.04, 0.66, 0.6], [x0 + W - 0.04, 0.72, 0.8]); // key bed
  m.box('woodDark', [x0 + 0.02, 0.62, 0.6], [x0 + 0.1, 0.72, 0.8]); // key cheeks
  m.box('woodDark', [x0 + W - 0.1, 0.62, 0.6], [x0 + W - 0.02, 0.72, 0.8]);
  const kx0 = x0 + 0.12, kx1 = x0 + W - 0.12, whites = 22, kw = (kx1 - kx0) / whites;
  m.box('carpetWhite', [kx0, 0.72, 0.62], [kx1, 0.745, 0.79]);
  for (let i = 1; i < whites; i++) m.box('metalMedium', [kx0 + i * kw - 0.002, 0.745, 0.62], [kx0 + i * kw + 0.002, 0.748, 0.79]);
  for (let i = 0; i < whites - 1; i++) { if ([2, 6].includes(i % 7)) continue; m.box('metalDark', [kx0 + (i + 1) * kw - 0.017, 0.745, 0.62], [kx0 + (i + 1) * kw + 0.017, 0.775, 0.72]); }
  m.box('woodDark', [x0 + 0.12, 0.9, 0.6], [x0 + W - 0.12, 0.93, 0.7]); // music rest
  m.box('woodDark', [x0 + 0.14, 0.97, 0.6], [x0 + 0.76, 1.16, 0.61]); // inset panels
  m.box('woodDark', [x0 + 0.94, 0.97, 0.6], [x0 + W - 0.14, 1.16, 0.61]);
  m.box('woodDark', [x0 + 0.14, 0.28, 0.6], [x0 + W - 0.14, 0.6, 0.61]); // lower panel
  for (const x of [0.62, 0.85, 1.08]) m.box('metal', [x0 + x, 0.04, 0.5], [x0 + x + 0.12, 0.09, 0.62]); // pedals
  return m;
}

/** Treadmill (1 x 2 tiles): the runner stands on the belt, the console is at the back. */
function treadmill() {
  const m = new Model('treadmill');
  m.box('metalDark', [0.17, 0.08, 0.22], [0.83, 0.2, 1.88]); // deck frame
  m.box('metalMedium', [0.22, 0.2, 0.3], [0.78, 0.225, 1.84]); // belt
  m.box('metalDark', [0.17, 0.2, 0.26], [0.22, 0.27, 1.88]); // side rails
  m.box('metalDark', [0.78, 0.2, 0.26], [0.83, 0.27, 1.88]);
  for (const [x, z] of [[0.2, 0.3], [0.8, 0.3], [0.2, 1.8], [0.8, 1.8]]) m.box('metalDark', [x - 0.04, 0, z - 0.04], [x + 0.04, 0.08, z + 0.04]); // feet
  m.rod('metal', [0.22, 0.24, 0.34], [0.24, 1.06, 0.3], 0.045); // uprights
  m.rod('metal', [0.78, 0.24, 0.34], [0.76, 1.06, 0.3], 0.045);
  m.box('metalDark', [0.16, 1.0, 0.18], [0.84, 1.2, 0.44]); // console housing
  m.box('glass', [0.3, 1.04, 0.435], [0.7, 1.16, 0.45]); // screen
  m.rod('metalDark', [0.17, 1.02, 0.4], [0.17, 0.82, 0.95], 0.035); // hand rails
  m.rod('metalDark', [0.83, 1.02, 0.4], [0.83, 0.82, 0.95], 0.035);
  return m;
}

/** Weight bench with a loaded barbell on the rack (1 x 2 tiles), rack at the back. */
function weightBench() {
  const m = new Model('weight-bench');
  m.box('carpetDarker', [0.27, 0.42, 0.78], [0.73, 0.5, 1.68]); // pad
  m.box('carpetDarker', [0.27, 0.5, 0.78], [0.73, 0.54, 0.86]);
  for (const z of [0.88, 1.58]) m.box('metalDark', [0.45, 0, z - 0.04], [0.55, 0.42, z + 0.04]);
  m.box('metalDark', [0.2, 0, 0.8], [0.8, 0.05, 0.9]); // feet
  m.box('metalDark', [0.2, 0, 1.52], [0.8, 0.05, 1.62]);
  for (const x of [0.12, 0.88]) {
    m.rod('metalDark', [x, 0, 0.5], [x, 1.2, 0.5], 0.05);
    m.box('metalDark', [x - 0.04, 0, 0.3], [x + 0.04, 0.04, 0.78]);
    m.box('metal', [x - 0.035, 1.02, 0.43], [x + 0.035, 1.07, 0.57]); // hook
  }
  m.cyl('metal', [0.02, 1.1, 0.5], [0.98, 1.1, 0.5], 0.02, 8); // bar
  for (const side of [[0.07, 0.15], [0.85, 0.93]]) { // plates
    m.cyl('metalDark', [side[0], 1.1, 0.5], [side[0] + 0.04, 1.1, 0.5], 0.17, 12);
    m.cyl('metalDark', [side[1] - 0.04, 1.1, 0.5], [side[1], 1.1, 0.5], 0.17, 12);
  }
  for (const [x, z] of [[0.18, 1.85], [0.82, 1.85]]) { // dumbbells on the floor
    m.cyl('metalDark', [x - 0.08, 0.07, z], [x + 0.08, 0.07, z], 0.06, 8);
    m.cyl('metal', [x - 0.08, 0.07, z], [x + 0.08, 0.07, z], 0.018, 6);
  }
  return m;
}

/** Square table with an inlaid chessboard and a game in progress. */
function chessTable() {
  const m = new Model('chess-table');
  m.box('wood', [0.08, 0.64, 0.08], [0.92, 0.7, 0.92]);
  for (const [x, z] of [[0.13, 0.13], [0.87, 0.13], [0.13, 0.87], [0.87, 0.87]]) m.box('wood', [x - 0.035, 0, z - 0.035], [x + 0.035, 0.64, z + 0.035]);
  m.box('woodDark', [0.1, 0.55, 0.1], [0.9, 0.58, 0.9]); // stretcher shelf
  const bx = 0.2, bs = 0.075;
  m.box('carpetWhite', [bx, 0.7, bx], [bx + 8 * bs, 0.712, bx + 8 * bs]);
  for (const r of range(8)) for (const c of range(8)) if ((r + c) % 2 === 1) m.box('metalDark', [bx + c * bs, 0.712, bx + r * bs], [bx + (c + 1) * bs, 0.716, bx + (r + 1) * bs]);
  const piece = (mat, c, r, tall) => {
    const cx = bx + (c + 0.5) * bs, cz = bx + (r + 0.5) * bs;
    m.lathe(mat, cx, cz, [[0.026, 0.716], [0.018, 0.74], [0.012, 0.75 + tall], [0.02, 0.76 + tall]], 8);
  };
  for (const c of range(8)) { if (c % 2 === 0) piece('carpet', c, 1, 0); else piece('carpetBlue', c, 6, 0); }
  for (const [c, tall] of [[0, 0.01], [3, 0.03], [4, 0.025], [7, 0.01]]) { piece('carpet', c, 0, tall); piece('carpetBlue', c, 7, tall); }
  return m;
}

/** Wooden crib with turned slats (1 x 2 tiles). */
function crib() {
  const m = new Model('crib');
  const x0 = 0.1, x1 = 0.9, z0 = 0.2, z1 = 1.8;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) m.box('wood', [x - 0.03, 0, z - 0.03], [x + 0.03, 1.0, z + 0.03]);
  m.box('wood', [x0 - 0.03, 0.3, z0 - 0.03], [x1 + 0.03, 0.34, z1 + 0.03]); // base frame
  for (const [a, b] of [[x0, x1]]) { for (const z of [z0, z1]) { m.box('wood', [a - 0.03, 0.92, z - 0.025], [b + 0.03, 0.98, z + 0.025]); m.box('wood', [a - 0.03, 0.4, z - 0.025], [b + 0.03, 0.44, z + 0.025]); } }
  for (const x of [x0, x1]) { m.box('wood', [x - 0.025, 0.92, z0 - 0.03], [x + 0.025, 0.98, z1 + 0.03]); m.box('wood', [x - 0.025, 0.4, z0 - 0.03], [x + 0.025, 0.44, z1 + 0.03]); }
  for (let z = z0 + 0.1; z < z1 - 0.05; z += 0.1) for (const x of [x0, x1]) m.box('woodDark', [x - 0.012, 0.44, z - 0.012], [x + 0.012, 0.92, z + 0.012]);
  for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.1) for (const z of [z0, z1]) m.box('woodDark', [x - 0.012, 0.44, z - 0.012], [x + 0.012, 0.92, z + 0.012]);
  m.box('carpetWhite', [x0 + 0.03, 0.34, z0 + 0.03], [x1 - 0.03, 0.46, z1 - 0.03]); // mattress
  m.box('carpetBlue', [x0 + 0.04, 0.46, z0 + 0.7], [x1 - 0.04, 0.5, z1 - 0.04]); // blanket
  m.box('carpetWhite', [x0 + 0.14, 0.46, z0 + 0.08], [x1 - 0.14, 0.54, z0 + 0.4]); // pillow
  return m;
}

/** Painted toy chest with blocks on the lid. */
function toyChest() {
  const m = new Model('toy-chest');
  m.box('wood', [0.1, 0.05, 0.28], [0.9, 0.5, 0.72]);
  for (const x of [0.12, 0.88]) m.box('woodDark', [x - 0.03, 0, 0.3], [x + 0.03, 0.05, 0.7]);
  m.hexa('woodDark', [[0.08, 0.5, 0.26], [0.92, 0.5, 0.26], [0.92, 0.5, 0.74], [0.08, 0.5, 0.74], [0.08, 0.58, 0.3], [0.92, 0.58, 0.3], [0.92, 0.58, 0.7], [0.08, 0.58, 0.7]]); // lid
  for (const x of [0.28, 0.72]) m.box('carpetBlue', [x - 0.04, 0.05, 0.275], [x + 0.04, 0.5, 0.285]); // front straps
  m.box('metal', [0.46, 0.4, 0.725], [0.54, 0.48, 0.74]); // latch
  m.box('carpet', [0.2, 0.58, 0.4], [0.32, 0.7, 0.52]); // blocks
  m.box('carpetBlue', [0.34, 0.58, 0.44], [0.46, 0.7, 0.56]);
  m.box('plant', [0.27, 0.7, 0.42], [0.39, 0.82, 0.54]);
  m.cylY('wood', 0.7, 0.5, 0.58, 0.72, 0.06, 0.06, 10); // drum
  m.cylY('carpet', 0.7, 0.5, 0.72, 0.74, 0.063, 0.063, 10);
  return m;
}

/** Kettle barbecue on legs with a wooden side shelf. */
function grill() {
  const m = new Model('grill');
  const cx = 0.42, cz = 0.5;
  m.lathe('metalDark', cx, cz, [[0.0, 0.7], [0.12, 0.72], [0.25, 0.82], [0.29, 0.94]], 12); // bowl
  m.lathe('metalDark', cx, cz, [[0.3, 0.94], [0.285, 1.04], [0.22, 1.13], [0.12, 1.18], [0.0, 1.19]], 12); // lid
  m.cylY('metal', cx, cz, 0.935, 0.95, 0.3, 0.3, 12); // rim
  m.rod('wood', [cx - 0.1, 1.14, cz + 0.3], [cx + 0.1, 1.14, cz + 0.3], 0.03); // handle
  for (const x of [-0.1, 0.1]) m.rod('metal', [cx + x, 1.1, cz + 0.27], [cx + x, 1.14, cz + 0.3], 0.025);
  for (const [dx, dz] of [[-0.2, -0.17], [0.2, -0.17], [0, 0.27]]) m.rod('metal', [cx + dx * 0.4, 0.72, cz + dz * 0.4], [cx + dx, 0, cz + dz], 0.035);
  m.cyl('metalDark', [cx - 0.24, 0.04, cz - 0.2], [cx - 0.2, 0.04, cz - 0.2], 0.05, 8); // wheel
  m.box('wood', [0.74, 0.78, 0.3], [0.98, 0.82, 0.72]); // side shelf
  for (const z of [0.34, 0.68]) m.rod('metal', [0.96, 0.78, z], [0.96, 0, z], 0.03);
  m.cylY('carpet', 0.86, 0.5, 0.82, 0.88, 0.045, 0.04, 8); // sauce pot
  return m;
}

/** Round patio table with a striped parasol through the middle (2 x 2 tiles). */
function patioSet() {
  const m = new Model('patio-set');
  const c = 1;
  m.cylY('wood', c, c, 0.72, 0.76, 0.62, 0.62, 16);
  m.cylY('woodDark', c, c, 0.68, 0.72, 0.56, 0.56, 16);
  m.cylY('metalDark', c, c, 0, 0.68, 0.045, 0.045, 8);
  for (const a of [0, 1, 2, 3]) {
    const t = (a / 4) * Math.PI * 2 + Math.PI / 4;
    m.rod('metalDark', [c, 0.05, c], [c + 0.5 * Math.cos(t), 0.02, c + 0.5 * Math.sin(t)], 0.05, 0.03);
  }
  m.cylY('metalDark', c, c, 0.76, 2.25, 0.022, 0.022, 8); // pole
  m.lathe(['carpet', 'carpetWhite'], c, c, [[0.0, 2.34], [0.45, 2.24], [0.93, 2.02]], 8);
  m.lathe(['carpet', 'carpetWhite'], c, c, [[0.93, 2.02], [0.95, 1.96]], 8, { caps: false });
  m.cylY('metal', c, c, 2.34, 2.4, 0.02, 0.015, 6);
  return m;
}

/** Raised garden bed (2 x 1 tiles) with leafy plants and a few flowers. */
function gardenBed() {
  const m = new Model('garden-bed');
  const x0 = 0.1, x1 = 1.9, z0 = 0.12, z1 = 0.88;
  for (const [a, b] of [[0.0, 0.14], [0.14, 0.28], [0.28, 0.42]]) {
    m.box(a === 0 ? 'wood' : 'woodDark', [x0, a, z0], [x1, b, z0 + 0.06]);
    m.box(a === 0 ? 'wood' : 'woodDark', [x0, a, z1 - 0.06], [x1, b, z1]);
    m.box(a === 0 ? 'wood' : 'woodDark', [x0, a, z0 + 0.06], [x0 + 0.06, b, z1 - 0.06]);
    m.box(a === 0 ? 'wood' : 'woodDark', [x1 - 0.06, a, z0 + 0.06], [x1, b, z1 - 0.06]);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) m.box('wood', [x - 0.04, 0, z - 0.04], [x + 0.04, 0.45, z + 0.04]);
  m.box('fur', [x0 + 0.06, 0.1, z0 + 0.06], [x1 - 0.06, 0.36, z1 - 0.06]); // soil
  const plants = [];
  for (let i = 0; i < 5; i++) for (const z of [0.36, 0.64]) plants.push([0.3 + i * 0.35 + (z > 0.5 ? 0.1 : 0), z + (i % 2 ? 0.04 : -0.04)]);
  plants.forEach(([x, z], i) => {
    const h = 0.28 + (i % 3) * 0.07;
    m.lathe('plant', x, z, [[0.1, 0.36], [0.13, 0.36 + h * 0.5], [0.05, 0.36 + h], [0.0, 0.36 + h + 0.03]], 6);
    if (i % 3 === 0) m.lathe('carpet', x, z, [[0.0, 0.36 + h + 0.03], [0.05, 0.36 + h + 0.05], [0.0, 0.36 + h + 0.09]], 5);
  });
  return m;
}

/** Two-seat slatted garden bench (2 x 1 tiles). */
function gardenBench() {
  const m = new Model('garden-bench');
  const x0 = 0.15, x1 = 1.85;
  for (const x of [x0 + 0.05, x1 - 0.05]) { // side frames
    m.box('woodDark', [x - 0.04, 0, 0.3], [x + 0.04, 0.46, 0.38]);
    m.box('woodDark', [x - 0.04, 0, 0.72], [x + 0.04, 0.46, 0.8]);
    m.box('woodDark', [x - 0.04, 0.46, 0.3], [x + 0.04, 0.5, 0.8]);
    m.rod('woodDark', [x, 0.5, 0.3], [x, 0.95, 0.24], 0.07, 0.05);
    m.box('woodDark', [x - 0.05, 0.62, 0.3], [x + 0.05, 0.66, 0.78]); // arm
  }
  for (const z of [0.34, 0.47, 0.6, 0.73]) m.box('wood', [x0, 0.5, z - 0.05], [x1, 0.55, z + 0.05]); // seat slats
  for (const [y, h] of [[0.65, 0.12], [0.8, 0.12]]) m.hexa('wood', [[x0, y, 0.25], [x1, y, 0.25], [x1, y + h, 0.25], [x0, y + h, 0.25], [x0, y, 0.3], [x1, y, 0.3], [x1, y + h, 0.3], [x0, y + h, 0.3]]);
  m.box('wood', [x0, 0.93, 0.24], [x1, 0.99, 0.31]); // top rail
  return m;
}

/** Slatted Adirondack garden chair. */
function gardenChair() {
  const m = new Model('garden-chair');
  const x0 = 0.12, x1 = 0.88;
  for (const x of [x0 + 0.04, x1 - 0.04]) { // legs, arms
    m.box('woodDark', [x - 0.035, 0, 0.7], [x + 0.035, 0.42, 0.76]);
    m.rod('woodDark', [x, 0.2, 0.3], [x, 0.4, 0.74], 0.06, 0.04);
    m.rod('woodDark', [x, 0.4, 0.74], [x, 0.58, 0.74], 0.06, 0.06);
    m.box('wood', [x - 0.07, 0.58, 0.28], [x + 0.07, 0.62, 0.8]);
  }
  for (let i = 0; i < 5; i++) { // seat slats sloping down towards the back
    const z = 0.34 + i * 0.1;
    m.rod('wood', [x0 + 0.02, 0.38 + (z - 0.34) * -0.12 + 0.05, z], [x1 - 0.02, 0.38 + (z - 0.34) * -0.12 + 0.05, z], 0.05, 0.03);
  }
  for (let i = 0; i < 6; i++) { // back slats fanning up and back
    const x = x0 + 0.1 + i * ((x1 - x0 - 0.2) / 5);
    m.rod('wood', [x, 0.4, 0.34], [x + (i - 2.5) * 0.015, 1.0, 0.1], 0.1, 0.03);
  }
  m.rod('woodDark', [x0 + 0.04, 0.45, 0.32], [x1 - 0.04, 0.45, 0.32], 0.04);
  return m;
}


// ---------------------------------------------------------------------------------------------
// Neighbourhood venues (Milestone 7): park, playground, cafe, market, gym and library furnishings.
// ---------------------------------------------------------------------------------------------

/** Park tree (2 x 2 tiles): a trunk with a root flare and a canopy of overlapping leaf domes with a few blossoms. */
function tree() {
  const m = new Model('tree');
  const c = 1;
  m.lathe('woodDark', c, c, [[0.34, 0], [0.22, 0.22], [0.16, 0.9], [0.13, 1.9]], 8); // trunk with root flare
  m.rod('woodDark', [c, 1.5, c], [c - 0.5, 2.2, c + 0.15], 0.08); // two forks into the canopy
  m.rod('woodDark', [c, 1.6, c], [c + 0.45, 2.3, c - 0.15], 0.08);
  const dome = (cx, cz, y, r, h) => m.lathe('plant', cx, cz, [[0.0, y], [r * 0.72, y + h * 0.1], [r, y + h * 0.45], [r * 0.8, y + h * 0.82], [0.0, y + h]], 10);
  dome(c, c, 2.15, 0.92, 1.6); // crown
  dome(0.62, 1.2, 1.95, 0.52, 1.1);
  dome(1.4, 0.78, 2.05, 0.52, 1.15);
  dome(1.38, 1.42, 1.9, 0.5, 1.0);
  dome(0.7, 0.62, 2.35, 0.42, 0.9);
  for (const [x, y, z] of [[0.55, 2.7, 1.45], [1.45, 3.0, 0.7], [0.9, 3.55, 0.8], [1.5, 2.6, 1.6], [0.45, 2.3, 0.85], [1.05, 3.4, 1.3]]) {
    m.lathe('carpet', x, z, [[0.0, y - 0.06], [0.07, y - 0.02], [0.07, y + 0.03], [0.0, y + 0.07]], 5); // blossoms
  }
  return m;
}

/** Round clipped shrub (1 x 1 tile) with a few flowers. */
function shrub() {
  const m = new Model('shrub');
  m.cylY('woodDark', 0.5, 0.5, 0, 0.12, 0.05, 0.05, 6);
  m.lathe('plant', 0.5, 0.5, [[0.0, 0.1], [0.3, 0.16], [0.43, 0.4], [0.4, 0.68], [0.24, 0.9], [0.0, 0.98]], 9);
  for (const [x, y, z] of [[0.3, 0.7, 0.62], [0.66, 0.6, 0.66], [0.55, 0.88, 0.4], [0.4, 0.45, 0.8]]) {
    m.lathe('carpet', x, z, [[0.0, y - 0.05], [0.06, y], [0.0, y + 0.06]], 5);
  }
  return m;
}

/** Park fountain (2 x 2 tiles): a stone basin with water, a central column and an upper bowl. */
function fountain() {
  const m = new Model('fountain');
  const c = 1;
  m.lathe('metal', c, c, [[0.9, 0], [0.92, 0.38], [0.84, 0.42]], 16); // outer basin wall
  m.lathe('metal', c, c, [[0.84, 0.42], [0.76, 0.42]], 16, { caps: false });
  m.cylY('glass', c, c, 0.3, 0.34, 0.78, 0.78, 16); // water
  m.lathe('metal', c, c, [[0.0, 0.34], [0.2, 0.36], [0.16, 0.9]], 10); // pedestal
  m.lathe('metal', c, c, [[0.16, 0.9], [0.55, 1.05], [0.52, 1.12], [0.0, 1.0]], 12, { caps: false }); // upper bowl
  m.cylY('glass', c, c, 1.04, 1.08, 0.5, 0.5, 12); // water in the bowl
  m.cylY('metal', c, c, 1.08, 1.5, 0.07, 0.04, 8); // spout
  m.lathe('glass', c, c, [[0.0, 1.62], [0.08, 1.52], [0.02, 1.45]], 6, { caps: false }); // spray
  return m;
}

/** Playground tower with a ladder and a slide (2 x 2 tiles); the front (+z) side is the play side. */
function playgroundSlide() {
  const m = new Model('playground-slide');
  const x0 = 0.12, x1 = 0.9, z0 = 0.12, z1 = 0.9, top = 1.15;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) m.box('carpetBlue', [x - 0.04, 0, z - 0.04], [x + 0.04, top + 0.8, z + 0.04]); // posts
  m.box('wood', [x0 - 0.02, top - 0.05, z0 - 0.02], [x1 + 0.02, top, z1 + 0.02]); // platform
  for (const z of [z0, z1]) m.box('woodDark', [x0, top, z - 0.02], [x1, top + 0.45, z + 0.02]); // fence panels
  m.box('woodDark', [x0 - 0.02, top, z0], [x0 + 0.02, top + 0.45, z1]);
  m.hexa('carpet', [[x0 - 0.12, top + 0.8, z0 - 0.12], [x1 + 0.12, top + 0.8, z0 - 0.12], [x1 + 0.12, top + 0.8, z1 + 0.12], [x0 - 0.12, top + 0.8, z1 + 0.12],
    [x0 + 0.1, top + 1.08, z0 + 0.1], [x1 - 0.1, top + 1.08, z0 + 0.1], [x1 - 0.1, top + 1.08, z1 - 0.1], [x0 + 0.1, top + 1.08, z1 - 0.1]]); // roof
  // ladder on the front of the tower (towards +z)
  for (const x of [0.3, 0.72]) m.rod('metal', [x, 0, 1.45], [x, top, z1], 0.04);
  for (let i = 1; i <= 4; i++) { const t = i / 5; m.rod('metal', [0.3, top * t, 1.45 - (1.45 - z1) * t], [0.72, top * t, 1.45 - (1.45 - z1) * t], 0.035); }
  // chute: from the platform's east edge down to the ground at x 1.9
  const w = 0.5, cz = 0.51;
  m.slab('metal', [x1, top - 0.02, cz - w / 2], [1.0, -1.0, 0], [0, 0.04, 0], [0, 0, w]); // bed of the chute
  for (const dz of [-w / 2, w / 2]) m.slab('carpet', [x1, top - 0.02, cz + dz - (dz < 0 ? 0.03 : 0)], [1.0, -1.0, 0], [0, 0.18, 0], [0, 0, 0.03]);
  m.box('woodDark', [1.86, 0, cz - w / 2], [1.9, 0.05, cz + w / 2]);
  return m;
}

/** A-frame swing set with two swings (2 x 2 tiles); the swings hang in the middle of the footprint, seats face +z. */
function swingSet() {
  const m = new Model('swing-set');
  const barY = 2.05, zc = 1.0;
  m.rod('metalDark', [0.1, barY, zc], [1.9, barY, zc], 0.07);
  for (const x of [0.1, 1.9]) {
    m.rod('metalDark', [x, barY, zc], [x, 0, 0.25], 0.06);
    m.rod('metalDark', [x, barY, zc], [x, 0, 1.75], 0.06);
  }
  for (const x of [0.62, 1.38]) {
    for (const dx of [-0.17, 0.17]) m.rod('metal', [x + dx, barY, zc], [x + dx, 0.5, zc], 0.015); // chains
    m.box('carpet', [x - 0.22, 0.44, zc - 0.1], [x + 0.22, 0.5, zc + 0.1]); // seat
  }
  return m;
}

/** Service counter module (1 x 1 tile): a worktop with a cash register, a pastry display case and a menu board. */
function serviceCounter() {
  const m = new Model('service-counter');
  m.box('wood', [0.04, 0, 0.1], [0.96, 0.88, 0.96]); // body
  m.box('woodDark', [0.06, 0, 0.9], [0.94, 0.1, 0.99]); // kick plate
  m.box('woodDark', [0.1, 0.18, 0.96], [0.9, 0.8, 0.985]); // front panel
  m.box('metal', [0.02, 0.88, 0.06], [0.98, 0.92, 1.0]); // worktop
  m.box('woodDark', [0.04, 0.92, 0.06], [0.96, 1.4, 0.14]); // menu board behind the counter
  m.box('carpetWhite', [0.12, 1.02, 0.14], [0.88, 1.34, 0.15]);
  for (const y of [1.2, 1.12, 1.04]) m.box('metalDark', [0.18, y, 0.15], [0.62, y + 0.025, 0.155]); // menu lines
  m.box('carpet', [0.7, 1.02, 0.15], [0.82, 1.16, 0.155]);
  // cash register
  m.box('metalDark', [0.12, 0.92, 0.38], [0.44, 1.0, 0.7]);
  m.slab('metalDark', [0.14, 1.0, 0.5], [0.28, 0, 0], [0, 0.22, -0.1], [0, 0.04, 0.12]); // screen on its back
  m.box('glass', [0.16, 1.02, 0.54], [0.38, 1.18, 0.56]);
  m.box('metal', [0.14, 0.93, 0.62], [0.42, 0.97, 0.68]); // keys
  // pastry case
  m.box('woodDark', [0.54, 0.92, 0.3], [0.92, 0.95, 0.8]);
  m.box('glass', [0.55, 0.95, 0.31], [0.91, 1.22, 0.79]);
  m.box('woodDark', [0.54, 1.22, 0.3], [0.92, 1.25, 0.8]);
  for (const [x, z, mat] of [[0.64, 0.44, 'carpet'], [0.78, 0.44, 'wood'], [0.64, 0.66, 'wood'], [0.78, 0.66, 'carpet']]) m.cylY(mat, x, z, 0.95, 1.03, 0.055, 0.045, 8); // pastries
  return m;
}

/** Market produce stall (2 x 1 tiles): crates of fruit and vegetables under a striped awning. */
function produceStand() {
  const m = new Model('produce-stand');
  for (const x of [0.1, 1.9]) { m.box('woodDark', [x - 0.04, 0, 0.1], [x + 0.04, 2.0, 0.18]); m.box('woodDark', [x - 0.04, 0, 0.82], [x + 0.04, 1.35, 0.9]); }
  m.box('wood', [0.08, 0.2, 0.2], [1.92, 0.62, 0.9]); // table
  m.box('woodDark', [0.08, 0.62, 0.2], [1.92, 0.66, 0.9]);
  // sloped display trays at the front
  m.slab('wood', [0.14, 0.66, 0.5], [0.8, 0, 0], [0, 0.14, 0.4], [0, 0, 0.02]);
  m.slab('wood', [1.06, 0.66, 0.5], [0.8, 0, 0], [0, 0.14, 0.4], [0, 0, 0.02]);
  const heap = (mat, x, z, r) => m.lathe(mat, x, z, [[0.0, 0.74], [r, 0.78], [r * 0.9, 0.88], [0.0, 0.98]], 7);
  heap('carpet', 0.32, 0.72, 0.17); heap('plant', 0.62, 0.72, 0.17); heap('wood', 0.9, 0.72, 0.16);
  heap('carpetBlue', 1.2, 0.72, 0.15); heap('carpet', 1.48, 0.72, 0.16); heap('plant', 1.74, 0.72, 0.15);
  for (const [x, mat] of [[0.35, 'plant'], [0.85, 'carpet'], [1.35, 'wood'], [1.7, 'plant']]) { // crates on the table top
    m.box('woodDark', [x - 0.2, 0.62, 0.24], [x + 0.2, 0.84, 0.46]);
    m.lathe(mat, x, 0.35, [[0.0, 0.8], [0.17, 0.84], [0.0, 0.96]], 6);
  }
  const stripes = ['carpet', 'carpetWhite'];
  for (let i = 0; i < 8; i++) { // striped awning sloping towards the front
    const x = 0.04 + i * 0.24;
    m.slab(stripes[i % 2], [x, 2.05, 0.05], [0.24, 0, 0], [0, -0.28, 0.98], [0, 0.03, 0]);
  }
  return m;
}

/** Drinks and snacks vending machine (1 x 1 tile), back against the wall. */
function vendingMachine() {
  const m = new Model('vending-machine');
  m.box('carpetBlue', [0.1, 0, 0.1], [0.9, 1.85, 0.78]); // cabinet
  m.box('metalDark', [0.1, 0, 0.1], [0.9, 0.08, 0.8]);
  m.box('glass', [0.16, 0.7, 0.78], [0.64, 1.75, 0.8]); // display window
  for (const [i, y] of [[0, 1.55], [1, 1.35], [2, 1.15], [3, 0.95]]) {
    m.box('metal', [0.17, y - 0.04, 0.78], [0.63, y - 0.02, 0.84]); // shelf
    for (let k = 0; k < 4; k++) m.box(['carpet', 'plant', 'wood', 'carpetWhite'][(i + k) % 4], [0.2 + k * 0.11, y - 0.02, 0.8], [0.28 + k * 0.11, y + 0.14, 0.86]);
  }
  m.box('metalDark', [0.68, 0.7, 0.78], [0.86, 1.75, 0.82]); // keypad panel
  m.box('glass', [0.7, 1.55, 0.82], [0.84, 1.68, 0.84]);
  for (let i = 0; i < 6; i++) m.box('metal', [0.71 + (i % 2) * 0.07, 1.2 + Math.floor(i / 2) * 0.1, 0.82], [0.75 + (i % 2) * 0.07, 1.26 + Math.floor(i / 2) * 0.1, 0.84]);
  m.box('metalDark', [0.2, 0.18, 0.78], [0.8, 0.5, 0.82]); // delivery bin
  m.box('metal', [0.26, 0.24, 0.82], [0.74, 0.44, 0.84]);
  return m;
}

/** Notebook, open book and a green-shaded desk lamp (1 x 1 tile) for a study desk. */
function studyNotes() {
  const m = new Model('study-notes');
  m.slab('carpetBlue', [0.2, 0.0, 0.3], [0.5, 0, 0], [0, 0.03, 0], [0, 0, 0.42]); // book cover
  m.slab('carpetWhite', [0.22, 0.03, 0.32], [0.46, 0, 0], [0, 0.03, 0], [0, 0, 0.38]);
  m.box('metalDark', [0.44, 0.06, 0.32], [0.46, 0.065, 0.7]); // spine gutter
  m.slab('carpetWhite', [0.12, 0.0, 0.62], [0.28, 0, 0], [0, 0.015, 0], [0, 0, 0.3]); // loose notes
  m.rod('carpet', [0.36, 0.02, 0.78], [0.62, 0.02, 0.9], 0.02); // pencil
  m.cylY('metalDark', 0.82, 0.3, 0, 0.03, 0.1, 0.1, 10); // lamp base
  m.rod('metal', [0.82, 0.03, 0.3], [0.82, 0.38, 0.3], 0.02);
  m.lathe('plant', 0.82, 0.38, [[0.14, 0.36], [0.1, 0.44], [0.03, 0.5]], 8, { caps: false }); // green shade
  return m;
}

/** Row of gym lockers (1 x 1 tile), back against the wall. */
function lockerBank() {
  const m = new Model('locker-bank');
  m.box('metalMedium', [0.04, 0, 0.06], [0.96, 1.9, 0.62]);
  m.box('metalDark', [0.04, 0, 0.06], [0.96, 0.1, 0.64]);
  for (let i = 0; i < 3; i++) {
    const x0 = 0.07 + i * 0.3;
    m.box('carpetBlue', [x0, 0.14, 0.62], [x0 + 0.27, 1.84, 0.645]); // door
    for (let k = 0; k < 4; k++) m.box('metalDark', [x0 + 0.06 + k * 0.045, 1.58, 0.645], [x0 + 0.075 + k * 0.045, 1.76, 0.655]); // vents
    m.box('metalLight', [x0 + 0.2, 0.95, 0.645], [x0 + 0.24, 1.1, 0.66]); // handle
  }
  m.box('metalDark', [0.02, 1.9, 0.04], [0.98, 1.95, 0.66]); // top cap
  return m;
}


// --- Milestone 8: family furniture (bassinet, high chair, toddler bed, potty, changing table, birthday cake) ---------

/** Wicker bassinet on a wooden stand with a hood (1 x 1 tile). */
function bassinet() {
  const m = new Model('bassinet');
  for (const [x, z] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) m.rod('wood', [x, 0, z], [x, 0.5, z], 0.05);
  m.rod('wood', [0.2, 0.16, 0.2], [0.8, 0.16, 0.2], 0.03); // cross bars
  m.rod('wood', [0.2, 0.16, 0.8], [0.8, 0.16, 0.8], 0.03);
  m.box('woodDark', [0.14, 0.5, 0.14], [0.86, 0.55, 0.86]); // base
  m.box('woodDark', [0.14, 0.55, 0.14], [0.86, 0.8, 0.18]); // back wall
  m.box('woodDark', [0.14, 0.55, 0.82], [0.86, 0.75, 0.86]); // front wall
  m.box('woodDark', [0.14, 0.55, 0.18], [0.18, 0.8, 0.82]); // sides
  m.box('woodDark', [0.82, 0.55, 0.18], [0.86, 0.8, 0.82]);
  m.box('carpetWhite', [0.18, 0.55, 0.18], [0.82, 0.63, 0.82]); // mattress
  m.box('carpetBlue', [0.2, 0.63, 0.4], [0.8, 0.67, 0.8]); // blanket
  m.box('carpetWhite', [0.28, 0.63, 0.2], [0.72, 0.7, 0.38]); // pillow
  // hood over the head end
  m.box('carpetWhite', [0.12, 0.8, 0.12], [0.88, 0.85, 0.5]);
  m.box('carpetWhite', [0.12, 0.55, 0.12], [0.16, 0.85, 0.5]);
  m.box('carpetWhite', [0.84, 0.55, 0.12], [0.88, 0.85, 0.5]);
  return m;
}

/** High chair with a tray (1 x 1 tile, seat toward +z). */
function highChair() {
  const m = new Model('high-chair');
  for (const [x, z] of [[0.25, 0.3], [0.75, 0.3], [0.2, 0.8], [0.8, 0.8]]) m.rod('wood', [x, 0, z], [x, 0.62, z], 0.05);
  m.box('wood', [0.2, 0.62, 0.25], [0.8, 0.68, 0.8]); // seat
  m.box('carpetBlue', [0.24, 0.68, 0.3], [0.76, 0.72, 0.76]); // cushion
  m.box('woodDark', [0.2, 0.68, 0.22], [0.8, 1.15, 0.28]); // back
  m.box('woodDark', [0.2, 0.68, 0.28], [0.25, 0.9, 0.78]); // arms
  m.box('woodDark', [0.75, 0.68, 0.28], [0.8, 0.9, 0.78]);
  m.box('carpetWhite', [0.18, 0.88, 0.62], [0.82, 0.92, 0.98]); // tray
  m.box('woodDark', [0.18, 0.92, 0.95], [0.82, 0.96, 0.98]); // tray lip
  m.rod('metal', [0.2, 0.2, 0.8], [0.8, 0.2, 0.8], 0.03); // foot bar
  return m;
}

/** Toddler bed: a low bed with side rails (1 x 2 tiles). */
function toddlerBed() {
  const m = new Model('toddler-bed');
  const x0 = 0.1, x1 = 0.9, z0 = 0.15, z1 = 1.85;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) m.box('wood', [x - 0.04, 0, z - 0.04], [x + 0.04, 0.55, z + 0.04]);
  m.box('wood', [x0 - 0.04, 0.12, z0 - 0.03], [x1 + 0.04, 0.2, z1 + 0.03]); // base frame
  m.box('carpetWhite', [x0, 0.2, z0], [x1, 0.3, z1]); // mattress
  m.box('carpet', [x0 + 0.02, 0.3, z0 + 0.6], [x1 - 0.02, 0.34, z1 - 0.02]); // blanket
  m.box('carpetWhite', [x0 + 0.12, 0.3, z0 + 0.06], [x1 - 0.12, 0.38, z0 + 0.4]); // pillow
  m.box('woodDark', [x0 - 0.04, 0.2, z0 - 0.04], [x1 + 0.04, 0.6, z0 + 0.02]); // headboard
  m.box('woodDark', [x0 - 0.04, 0.2, z1 - 0.02], [x1 + 0.04, 0.4, z1 + 0.04]); // footboard
  for (const x of [x0, x1]) { // side rails with a gap in the middle for climbing in
    m.box('woodDark', [x - 0.02, 0.38, z0], [x + 0.02, 0.42, z0 + 0.7]);
    m.box('woodDark', [x - 0.02, 0.38, z1 - 0.5], [x + 0.02, 0.42, z1]);
    for (const z of [z0 + 0.15, z0 + 0.35, z0 + 0.55, z1 - 0.35, z1 - 0.15]) m.box('woodDark', [x - 0.015, 0.2, z - 0.015], [x + 0.015, 0.38, z + 0.015]);
  }
  return m;
}

/** Potty chair (1 x 1 tile, backrest at the back). */
function pottyChair() {
  const m = new Model('potty-chair');
  m.cylY('carpetBlue', 0.5, 0.55, 0.0, 0.3, 0.2, 0.25, 12); // body
  m.cylY('carpetWhite', 0.5, 0.58, 0.3, 0.34, 0.24, 0.24, 12); // rim
  m.cylY('metalDark', 0.5, 0.58, 0.335, 0.34, 0.14, 0.14, 12); // opening
  m.box('carpetBlue', [0.28, 0.3, 0.26], [0.72, 0.62, 0.34]); // backrest
  m.box('carpetWhite', [0.26, 0.6, 0.24], [0.74, 0.65, 0.36]);
  return m;
}

/** Changing table: a pad with raised edges on a chest with shelves (1 x 1 tile). */
function changingTable() {
  const m = new Model('changing-table');
  m.box('wood', [0.06, 0, 0.1], [0.94, 0.9, 0.9]); // chest
  m.box('woodDark', [0.04, 0.9, 0.08], [0.96, 0.95, 0.92]); // top
  m.box('carpetWhite', [0.1, 0.95, 0.14], [0.9, 1.02, 0.86]); // pad
  m.box('woodDark', [0.04, 0.95, 0.08], [0.96, 1.08, 0.12]); // raised edges
  m.box('woodDark', [0.04, 0.95, 0.88], [0.96, 1.05, 0.92]);
  m.box('woodDark', [0.04, 0.95, 0.08], [0.08, 1.08, 0.92]);
  m.box('woodDark', [0.92, 0.95, 0.08], [0.96, 1.08, 0.92]);
  m.box('woodDark', [0.1, 0.45, 0.9], [0.9, 0.5, 0.92]); // shelf divider seen from the front
  for (const y of [0.1, 0.5]) { // open shelves with baskets
    m.box('carpetBlue', [0.12, y, 0.9], [0.46, y + 0.28, 0.93]);
    m.box('carpet', [0.54, y, 0.9], [0.88, y + 0.28, 0.93]);
  }
  return m;
}

/** Birthday cake on a plate with three candles (1 x 1 tile, stands on a table or counter). */
function birthdayCake() {
  const m = new Model('birthday-cake');
  m.cylY('carpetWhite', 0.5, 0.5, 0, 0.03, 0.4, 0.4, 16); // plate
  m.cylY('wood', 0.5, 0.5, 0.03, 0.2, 0.3, 0.3, 16); // sponge
  m.cylY('carpetWhite', 0.5, 0.5, 0.2, 0.26, 0.31, 0.31, 16); // icing
  m.cylY('carpet', 0.5, 0.5, 0.26, 0.28, 0.22, 0.22, 16); // jam top
  for (const [x, z] of [[0.38, 0.5], [0.5, 0.58], [0.62, 0.5]]) {
    m.cylY('carpetBlue', x, z, 0.28, 0.42, 0.018, 0.018, 6); // candle
    m.cylY('wood', x, z, 0.42, 0.47, 0.012, 0.004, 6); // flame
  }
  for (let k = 0; k < 8; k++) { // icing dots
    const t = (k / 8) * Math.PI * 2;
    m.cylY('carpet', 0.5 + 0.28 * Math.cos(t), 0.5 + 0.28 * Math.sin(t), 0.26, 0.3, 0.03, 0.025, 6);
  }
  return m;
}

export const EXTRA_MODELS = {
  dishwasher, easel, piano, treadmill, weightBench, chessTable, crib, toyChest, grill, patioSet, gardenBed, gardenBench, gardenChair,
  tree, shrub, fountain, playgroundSlide, swingSet, serviceCounter, produceStand, vendingMachine, studyNotes, lockerBank,
  bassinet, highChair, toddlerBed, pottyChair, changingTable, birthdayCake,
};

/** Builds every model keyed by its asset name (the GLB file name). */
export function buildModels() {
  const out = {};
  for (const [name, make] of Object.entries(EXTRA_MODELS)) { const m = make(); m.id = name; out[name] = m; }
  return out;
}
