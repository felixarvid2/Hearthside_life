// Milestone 10 furniture, group "lighting-outdoor-kids": export default { modelName: builderFn, ... }. See dev/ds-tasks/m10f/AUTHORING.md.
// Content for these models: src/content/objectsM10/lighting-outdoor-kids.ts
//
// Conventions of this file: everything is authored around the tile centre (0.5, 0.5) in real metres; the lamp shade material is
// `carpetWhite` (own finish region), stands and frames are `metal` / `metalDark` / `wood`. Wall lights start at z = 0 (the wall) and
// project to +z; ceiling lights hang from their top (y = height).

import { Model } from '../kit.mjs';

const C = 0.5;
/** Cylinder or cone frustum around the vertical axis through (x, z) (default: the tile centre). */
const cy = (m, mat, y0, y1, r0, r1 = r0, seg = 10, x = C, z = C) => m.cylY(mat, x, z, y0, y1, r0, r1, seg);
/** Box from its centre in x and z, base height y0. */
const cb = (m, mat, x, z, y0, w, h, d) => m.box(mat, [x - w / 2, y0, z - d / 2], [x + w / 2, y0 + h, z + d / 2]);
/** Sphere centred at (x, y, z). */
function sph(m, mat, x, y, z, R, seg = 10, rings = 6) {
  const prof = [];
  for (let i = 0; i <= rings; i++) { const t = (Math.PI * i) / rings; prof.push([R * Math.sin(t), y - R * Math.cos(t)]); }
  m.lathe(mat, x, z, prof, seg);
}
/** Upper half of a sphere (a dome) standing on y0. */
function dome(m, mat, x, y0, z, R, seg = 10, rings = 4, mats) {
  const prof = [];
  for (let i = 0; i <= rings; i++) { const t = (Math.PI / 2) * (i / rings); prof.push([R * Math.cos(t), y0 + R * Math.sin(t)]); }
  m.lathe(mats ?? mat, x, z, prof, seg);
}
/** Four legs (square, t wide, h high) at the corners of the rectangle. */
function legs(m, mat, x0, z0, x1, z1, h, t = 0.05) {
  for (const x of [x0, x1 - t]) for (const z of [z0, z1 - t]) m.box(mat, [x, 0, z], [x + t, h, z + t]);
}
/** Round disc base. */
const discBase = (m, mat, r = 0.18, h = 0.04, y0 = 0) => cy(m, mat, y0, y0 + h, r, r, 10);

// ---------------------------------------------------------------------------------------------
// Lighting: floor lamps
// ---------------------------------------------------------------------------------------------

function floorLampArc() {
  const m = new Model('floorLampArc');
  m.box('metalLight', [0.02, 0, 0.3], [0.3, 0.12, 0.7]); // marble block
  let prev = [0.12, 0.12, C];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2), p = [0.12 + 0.72 * (1 - Math.cos(a)), 0.12 + 1.7 * Math.sin(a), C];
    m.rod('metal', prev, p, 0.035);
    prev = p;
  }
  cy(m, 'carpetWhite', 1.5, 1.8, 0.16, 0.1, 10, 0.84, C);
  cy(m, 'metal', 1.8, 1.84, 0.03, 0.03, 6, 0.84, C);
  return m;
}

function floorLampTripod() {
  const m = new Model('floorLampTripod');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    m.rod('wood', [C + 0.3 * Math.cos(a), 0, C + 0.3 * Math.sin(a)], [C, 1.25, C], 0.04);
  }
  cy(m, 'carpetWhite', 1.2, 1.62, 0.22, 0.19, 10);
  cy(m, 'metal', 1.0, 1.25, 0.03, 0.03, 6);
  return m;
}

function floorLampTorchiere() {
  const m = new Model('floorLampTorchiere');
  discBase(m, 'metalDark', 0.2, 0.05);
  cy(m, 'metalDark', 0.05, 1.45, 0.025, 0.025, 6);
  cy(m, 'metal', 0.6, 0.64, 0.06, 0.06, 8);
  m.lathe('carpetWhite', C, C, [[0.03, 1.38], [0.12, 1.45], [0.24, 1.72], [0.22, 1.72]], 10, { caps: false });
  cy(m, 'metal', 1.4, 1.46, 0.08, 0.04, 8);
  return m;
}

function floorLampReading() {
  const m = new Model('floorLampReading');
  discBase(m, 'metalDark', 0.2, 0.05);
  cy(m, 'metal', 0.05, 1.2, 0.02, 0.02, 6);
  m.rod('metal', [C, 1.2, C], [C + 0.28, 1.5, C + 0.1], 0.025);
  m.rod('metal', [C + 0.28, 1.5, C + 0.1], [C + 0.3, 1.55, C + 0.1], 0.025);
  cy(m, 'carpetWhite', 1.42, 1.62, 0.12, 0.05, 8, C + 0.3, C + 0.1);
  cb(m, 'woodDark', C, C, 0.9, 0.22, 0.04, 0.22); // small shelf
  return m;
}

function floorLampMidCentury() {
  const m = new Model('floorLampMidCentury');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    m.rod('wood', [C + 0.26 * Math.cos(a), 0, C + 0.26 * Math.sin(a)], [C + 0.04 * Math.cos(a), 0.95, C + 0.04 * Math.sin(a)], 0.045);
  }
  cy(m, 'metal', 0.9, 1.1, 0.04, 0.03, 8);
  cy(m, 'carpetWhite', 1.05, 1.6, 0.3, 0.1, 12);
  return m;
}

function floorLampIndustrial() {
  const m = new Model('floorLampIndustrial');
  m.box('metalDark', [0.3, 0, 0.3], [0.7, 0.07, 0.7]);
  cy(m, 'metalDark', 0.07, 1.4, 0.025, 0.025, 6);
  m.rod('metalDark', [C, 1.4, C], [C + 0.2, 1.52, C], 0.025);
  cy(m, 'metalMedium', 1.2, 1.5, 0.2, 0.08, 10, C + 0.2, C);
  cy(m, 'metal', 1.45, 1.55, 0.05, 0.05, 6, C + 0.2, C);
  for (const y of [0.4, 0.8]) cy(m, 'metal', y, y + 0.03, 0.04, 0.04, 6);
  return m;
}

function floorLampGlobe() {
  const m = new Model('floorLampGlobe');
  discBase(m, 'metal', 0.2, 0.04);
  cy(m, 'metal', 0.04, 1.2, 0.02, 0.02, 6);
  sph(m, 'carpetWhite', C, 1.4, C, 0.22, 10, 6);
  cy(m, 'metal', 1.14, 1.2, 0.07, 0.07, 8);
  return m;
}

function floorLampPaper() {
  const m = new Model('floorLampPaper');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 1;
    m.rod('metalDark', [C + 0.22 * Math.cos(a), 0, C + 0.22 * Math.sin(a)], [C + 0.04 * Math.cos(a), 0.6, C + 0.04 * Math.sin(a)], 0.02);
  }
  m.lathe('carpetWhite', C, C, [[0.001, 0.56], [0.2, 0.62], [0.3, 0.95], [0.2, 1.3], [0.001, 1.36]], 10);
  return m;
}

function floorLampTree() {
  const m = new Model('floorLampTree');
  discBase(m, 'metalDark', 0.22, 0.05);
  cy(m, 'metalDark', 0.05, 1.5, 0.025, 0.02, 6);
  const arms = [[0.3, 1.2, 0.4], [-0.3, 1.35, 0.2], [0.05, 1.5, -0.32]];
  for (const [dx, y, dz] of arms) {
    m.rod('metal', [C, y - 0.18, C], [C + dx, y, C + dz], 0.022);
    cy(m, 'carpetWhite', y, y + 0.16, 0.07, 0.11, 8, C + dx, C + dz);
  }
  cy(m, 'carpetWhite', 1.5, 1.68, 0.08, 0.13, 8);
  return m;
}

function floorLampBrass() {
  const m = new Model('floorLampBrass');
  m.box('metal', [0.3, 0, 0.3], [0.7, 0.05, 0.7]);
  cy(m, 'metal', 0.05, 0.22, 0.1, 0.05, 8);
  cy(m, 'metal', 0.22, 1.3, 0.025, 0.025, 8);
  for (const y of [0.55, 0.9]) cy(m, 'metal', y, y + 0.05, 0.05, 0.05, 8);
  m.lathe('carpetBlue', C, C, [[0.12, 1.3], [0.26, 1.62], [0.24, 1.62]], 10, { caps: false });
  cy(m, 'metal', 1.62, 1.68, 0.02, 0.02, 6);
  return m;
}

function floorLampRattan() {
  const m = new Model('floorLampRattan');
  m.lathe('wood', C, C, [[0.001, 0], [0.2, 0], [0.24, 0.2], [0.2, 0.7], [0.12, 0.9]], 10);
  cy(m, 'woodDark', 0.88, 1.0, 0.05, 0.05, 8);
  cy(m, 'carpetWhite', 0.98, 1.4, 0.26, 0.2, 12);
  return m;
}

function floorLampStack() {
  const m = new Model('floorLampStack');
  m.box('metalDark', [0.3, 0, 0.3], [0.7, 0.05, 0.7]);
  cy(m, 'metalDark', 0.05, 0.9, 0.02, 0.02, 6);
  [[0.9, 0.3], [1.15, 0.24], [1.38, 0.18]].forEach(([y, w], i) => {
    m.box(i % 2 ? 'metalLight' : 'carpetWhite', [C - w / 2, y, C - w / 2], [C + w / 2, y + 0.22, C + w / 2]);
  });
  return m;
}

function floorLampUplight() {
  const m = new Model('floorLampUplight');
  m.box('metalDark', [0.34, 0, 0.34], [0.66, 0.04, 0.66]);
  m.box('metalDark', [0.45, 0.04, 0.45], [0.55, 1.55, 0.55]);
  m.box('carpetWhite', [0.4, 1.55, 0.4], [0.6, 1.7, 0.6]);
  m.box('metal', [0.38, 1.7, 0.38], [0.62, 1.73, 0.62]);
  return m;
}

function floorLampCandelabra() {
  const m = new Model('floorLampCandelabra');
  cy(m, 'metalDark', 0, 0.06, 0.2, 0.15, 8);
  cy(m, 'metalDark', 0.06, 1.3, 0.025, 0.025, 6);
  for (const y of [0.4, 0.8]) cy(m, 'metalDark', y, y + 0.06, 0.05, 0.03, 6);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, x = C + 0.26 * Math.cos(a), z = C + 0.26 * Math.sin(a);
    m.rod('metalDark', [C, 1.15, C], [x, 1.3, z], 0.02);
    cy(m, 'metalDark', 1.3, 1.34, 0.04, 0.04, 6, x, z);
    cy(m, 'carpetWhite', 1.34, 1.52, 0.022, 0.022, 6, x, z);
    cy(m, 'wood', 1.52, 1.56, 0.012, 0.004, 4, x, z);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Lighting: table lamps (they stand on a table, desk or nightstand)
// ---------------------------------------------------------------------------------------------

function lampBedside() {
  const m = new Model('lampBedside');
  m.box('wood', [0.4, 0, 0.4], [0.6, 0.05, 0.6]);
  cy(m, 'wood', 0.05, 0.2, 0.05, 0.035, 8);
  cy(m, 'carpetWhite', 0.18, 0.4, 0.15, 0.1, 10);
  return m;
}

function lampDeskArticulated() {
  const m = new Model('lampDeskArticulated');
  discBase(m, 'metalDark', 0.1, 0.03);
  m.rod('metal', [0.42, 0.03, C], [0.5, 0.36, C], 0.02);
  m.rod('metal', [0.5, 0.36, C], [0.7, 0.5, C], 0.02);
  cy(m, 'metalDark', 0.02, 0.05, 0.03, 0.03, 6, 0.42, C);
  m.lathe('metalMedium', 0.72, C, [[0.12, 0.38], [0.09, 0.46], [0.04, 0.5]], 8, { caps: false });
  cy(m, 'carpetWhite', 0.37, 0.39, 0.04, 0.04, 6, 0.72, C);
  return m;
}

function lampBanker() {
  const m = new Model('lampBanker');
  m.box('metal', [0.38, 0, 0.4], [0.62, 0.04, 0.6]);
  cy(m, 'metal', 0.04, 0.12, 0.05, 0.03, 8);
  cy(m, 'metal', 0.12, 0.3, 0.018, 0.018, 8);
  // half-cylinder green shade: an arch of slabs, open at both ends, running along x
  const R = 0.1, cz = C, cyy = 0.27;
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6);
    const p0 = [cz + R * Math.cos(a0), cyy + R * Math.sin(a0)], p1 = [cz + R * Math.cos(a1), cyy + R * Math.sin(a1)];
    const nz = (p0[0] + p1[0]) / 2 - cz, ny = (p0[1] + p1[1]) / 2 - cyy, l = Math.hypot(nz, ny);
    m.slab('plant', [0.22, p0[1], p0[0]], [0.56, 0, 0], [0, p1[1] - p0[1], p1[0] - p0[0]], [0, (ny / l) * 0.015, (nz / l) * 0.015]);
  }
  m.rod('metal', [0.5, 0.18, 0.6], [0.5, 0.18, 0.66], 0.012); // arm of the pull chain
  m.rod('metal', [0.5, 0.18, 0.66], [0.5, 0.1, 0.66], 0.008);
  m.box('metal', [0.48, 0.07, 0.64], [0.52, 0.1, 0.68]);
  return m;
}

function lampCeramic() {
  const m = new Model('lampCeramic');
  m.lathe('carpetBlue', C, C, [[0.001, 0], [0.09, 0.01], [0.14, 0.15], [0.1, 0.3], [0.05, 0.38]], 10);
  cy(m, 'wood', 0, 0.02, 0.1, 0.1, 8);
  cy(m, 'carpetWhite', 0.36, 0.62, 0.17, 0.12, 10);
  return m;
}

function lampMushroom() {
  const m = new Model('lampMushroom');
  cy(m, 'carpetWhite', 0, 0.2, 0.06, 0.04, 8);
  discBase(m, 'carpetWhite', 0.1, 0.03);
  dome(m, 'carpet', C, 0.18, C, 0.2, 12, 4);
  return m;
}

function lampGlobeTable() {
  const m = new Model('lampGlobeTable');
  discBase(m, 'metal', 0.09, 0.03);
  cy(m, 'metal', 0.03, 0.12, 0.025, 0.025, 6);
  sph(m, 'carpetWhite', C, 0.3, C, 0.17, 10, 6);
  return m;
}

function lampCubeTouch() {
  const m = new Model('lampCubeTouch');
  m.box('metalDark', [0.38, 0, 0.38], [0.62, 0.03, 0.62]);
  m.box('carpetWhite', [0.39, 0.03, 0.39], [0.61, 0.25, 0.61]);
  m.box('metalLight', [0.41, 0.25, 0.41], [0.59, 0.265, 0.59]);
  return m;
}

function lampTiffany() {
  const m = new Model('lampTiffany');
  cy(m, 'wood', 0, 0.04, 0.12, 0.1, 8);
  cy(m, 'wood', 0.04, 0.3, 0.03, 0.02, 8);
  dome(m, 'carpet', C, 0.26, C, 0.22, 12, 4, ['carpet', 'carpetBlue', 'plant', 'woodDark']);
  return m;
}

function lampTaper() {
  const m = new Model('lampTaper');
  cy(m, 'metal', 0, 0.03, 0.1, 0.1, 8);
  cy(m, 'metal', 0.03, 0.36, 0.02, 0.02, 6);
  m.lathe('carpetWhite', C, C, [[0.19, 0.3], [0.08, 0.7], [0.075, 0.7]], 8, { caps: false });
  return m;
}

function lampGourd() {
  const m = new Model('lampGourd');
  m.lathe('woodDark', C, C, [[0.001, 0], [0.1, 0.01], [0.17, 0.14], [0.1, 0.27], [0.04, 0.34]], 10);
  cy(m, 'carpetWhite', 0.32, 0.58, 0.17, 0.12, 10);
  return m;
}

function lampClamp() {
  const m = new Model('lampClamp');
  m.box('metalDark', [0.4, 0, 0.4], [0.6, 0.06, 0.6]);
  m.box('metalDark', [0.47, 0.06, 0.47], [0.53, 0.14, 0.53]);
  m.rod('metal', [0.5, 0.1, 0.5], [0.5, 0.4, 0.5], 0.02);
  m.rod('metal', [0.5, 0.4, 0.5], [0.68, 0.46, 0.5], 0.02);
  cy(m, 'carpet', 0.36, 0.5, 0.1, 0.045, 8, 0.7, 0.5);
  return m;
}

function lampPharmacy() {
  const m = new Model('lampPharmacy');
  m.box('metalDark', [0.35, 0, 0.35], [0.65, 0.04, 0.65]);
  cy(m, 'metalDark', 0.04, 0.5, 0.02, 0.02, 6);
  m.rod('metalDark', [C, 0.47, C], [C + 0.25, 0.47, C], 0.02);
  m.rod('metalDark', [C + 0.25, 0.47, C], [C + 0.25, 0.41, C], 0.02);
  cy(m, 'carpetWhite', 0.27, 0.42, 0.11, 0.04, 10, C + 0.25, C);
  return m;
}

function lampCrystal() {
  const m = new Model('lampCrystal');
  cy(m, 'metal', 0, 0.03, 0.12, 0.1, 8);
  m.lathe('glass', C, C, [[0.001, 0.03], [0.1, 0.05], [0.12, 0.2], [0.07, 0.34], [0.05, 0.4]], 8);
  cy(m, 'metal', 0.38, 0.42, 0.06, 0.06, 8);
  cy(m, 'carpetWhite', 0.4, 0.66, 0.2, 0.13, 8);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Lighting: wall lights (back at z = 0, projecting to +z, bottom at y = 0), ceiling lights (hang from y = height)
// ---------------------------------------------------------------------------------------------

function sconceCandle() {
  const m = new Model('sconceCandle');
  m.box('metalDark', [0.44, 0, 0], [0.56, 0.3, 0.02]);
  m.rod('metalDark', [C, 0.08, 0.02], [C, 0.08, 0.14], 0.025);
  cy(m, 'metalDark', 0.08, 0.1, 0.05, 0.05, 6, C, 0.14);
  cy(m, 'carpetWhite', 0.1, 0.24, 0.025, 0.025, 6, C, 0.14);
  return m;
}
function sconceSwingArm() {
  const m = new Model('sconceSwingArm');
  m.box('metal', [0.44, 0.05, 0], [0.56, 0.2, 0.03]);
  m.rod('metal', [C, 0.12, 0.03], [C + 0.2, 0.12, 0.2], 0.025);
  m.rod('metal', [C + 0.2, 0.12, 0.2], [C + 0.3, 0.12, 0.38], 0.025);
  cy(m, 'carpetWhite', 0.1, 0.3, 0.05, 0.12, 8, C + 0.3, 0.42);
  return m;
}
function sconceGlobe() {
  const m = new Model('sconceGlobe');
  m.box('metalDark', [0.4, 0, 0], [0.6, 0.2, 0.025]);
  m.box('metalDark', [0.46, 0.06, 0.025], [0.54, 0.14, 0.07]);
  sph(m, 'carpetWhite', C, 0.1, 0.17, 0.11, 8, 5);
  return m;
}
function sconceCone() {
  const m = new Model('sconceCone');
  m.box('metalDark', [0.42, 0, 0], [0.58, 0.34, 0.025]);
  cy(m, 'metalMedium', 0.02, 0.32, 0.07, 0.07, 8, C, 0.1);
  cy(m, 'carpetWhite', 0.02, 0.04, 0.05, 0.05, 8, C, 0.1);
  return m;
}
function sconceLantern() {
  const m = new Model('sconceLantern');
  m.box('metalDark', [0.45, 0.2, 0], [0.55, 0.4, 0.02]);
  m.rod('metalDark', [C, 0.34, 0.02], [C, 0.34, 0.15], 0.03);
  m.box('metalDark', [0.4, 0, 0.1], [0.6, 0.03, 0.3]);
  m.box('glass', [0.42, 0.03, 0.12], [0.58, 0.28, 0.28]);
  m.box('metalDark', [0.39, 0.28, 0.09], [0.61, 0.31, 0.31]);
  return m;
}
function sconceArc() {
  const m = new Model('sconceArc');
  m.box('metal', [0.46, 0, 0], [0.54, 0.4, 0.02]);
  let prev = [C, 0.05, 0.02];
  for (let i = 1; i <= 5; i++) { const a = (i / 5) * (Math.PI / 2), p = [C, 0.05 + 0.3 * Math.sin(a), 0.02 + 0.3 * (1 - Math.cos(a))]; m.rod('metal', prev, p, 0.025); prev = p; }
  cy(m, 'carpetWhite', 0.35, 0.4, 0.08, 0.06, 8, C, 0.32);
  return m;
}
function sconceBracketShade() {
  const m = new Model('sconceBracketShade');
  m.box('wood', [0.44, 0.02, 0], [0.56, 0.18, 0.03]);
  m.box('wood', [0.46, 0.1, 0.03], [0.54, 0.14, 0.14]);
  cy(m, 'carpetWhite', 0.12, 0.34, 0.1, 0.07, 10, C, 0.16);
  return m;
}

function pendantBell() {
  const m = new Model('pendantBell');
  cy(m, 'metalDark', 0.55, 0.9, 0.012, 0.012, 4);
  m.lathe('metalMedium', C, C, [[0.22, 0.2], [0.18, 0.32], [0.08, 0.5], [0.06, 0.56]], 10, { caps: false });
  cy(m, 'carpetWhite', 0.19, 0.21, 0.15, 0.15, 10);
  return m;
}
function pendantGlobe() {
  const m = new Model('pendantGlobe');
  cy(m, 'metal', 0.5, 0.9, 0.01, 0.01, 4);
  sph(m, 'carpetWhite', C, 0.28, C, 0.24, 10, 6);
  cy(m, 'metal', 0.5, 0.54, 0.04, 0.04, 6);
  return m;
}
function chandelierTiered() {
  const m = new Model('chandelierTiered');
  cy(m, 'metal', 0.35, 0.8, 0.012, 0.012, 4);
  for (const [y, r] of [[0.2, 0.4], [0.4, 0.26]]) {
    cy(m, 'metal', y, y + 0.03, r, r, 12);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; cy(m, 'carpetWhite', y + 0.03, y + 0.12, 0.02, 0.02, 4, C + r * 0.85 * Math.cos(a), C + r * 0.85 * Math.sin(a)); }
  }
  cy(m, 'glass', 0.1, 0.35, 0.03, 0.06, 6);
  return m;
}
function chandelierWheel() {
  const m = new Model('chandelierWheel');
  m.rod('metalDark', [C - 0.2, 0.4, C], [C - 0.02, 0.8, C], 0.012);
  m.rod('metalDark', [C + 0.2, 0.4, C], [C + 0.02, 0.8, C], 0.012);
  cy(m, 'woodDark', 0.3, 0.38, 0.4, 0.4, 12);
  cy(m, 'wood', 0.3, 0.38, 0.3, 0.3, 12);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; cy(m, 'carpetWhite', 0.38, 0.5, 0.025, 0.025, 4, C + 0.36 * Math.cos(a), C + 0.36 * Math.sin(a)); }
  return m;
}
function pendantTrio() {
  const m = new Model('pendantTrio');
  m.box('metalDark', [0.1, 0.75, 0.44], [0.9, 0.8, 0.56]);
  [[0.2, 0.5], [0.5, 0.35], [0.8, 0.45]].forEach(([x, h]) => {
    cy(m, 'metalDark', 0.75 - h + 0.2, 0.75, 0.008, 0.008, 4, x, C);
    cy(m, 'carpetWhite', 0.75 - h, 0.75 - h + 0.2, 0.13, 0.05, 8, x, C);
  });
  return m;
}
function pendantRattan() {
  const m = new Model('pendantRattan');
  cy(m, 'woodDark', 0.55, 0.9, 0.01, 0.01, 4);
  m.lathe('wood', C, C, [[0.001, 0.2], [0.2, 0.26], [0.3, 0.42], [0.12, 0.56], [0.06, 0.58]], 10);
  return m;
}
function lanternHanging() {
  const m = new Model('lanternHanging');
  cy(m, 'metalDark', 0.55, 0.9, 0.008, 0.008, 4);
  m.box('metalDark', [0.38, 0.5, 0.38], [0.62, 0.55, 0.62]);
  m.box('metalDark', [0.36, 0.2, 0.36], [0.64, 0.24, 0.64]);
  m.box('glass', [0.39, 0.24, 0.39], [0.61, 0.5, 0.61]);
  for (const x of [0.38, 0.6]) for (const z of [0.38, 0.6]) m.box('metalDark', [x, 0.24, z], [x + 0.02, 0.5, z + 0.02]);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Lighting: lanterns, candles, mood and garden lights
// ---------------------------------------------------------------------------------------------

function lanternFloor() {
  const m = new Model('lanternFloor');
  m.box('woodDark', [0.28, 0, 0.28], [0.72, 0.1, 0.72]);
  for (const x of [0.3, 0.68]) for (const z of [0.3, 0.68]) m.box('wood', [x, 0.1, z], [x + 0.04, 0.78, z + 0.04]);
  m.box('glass', [0.32, 0.1, 0.32], [0.68, 0.78, 0.68]);
  m.box('woodDark', [0.26, 0.78, 0.26], [0.74, 0.86, 0.74]);
  m.box('wood', [0.4, 0.86, 0.4], [0.6, 0.98, 0.6]);
  m.box('carpetWhite', [0.42, 0.1, 0.42], [0.58, 0.45, 0.58]);
  return m;
}
function lanternTable() {
  const m = new Model('lanternTable');
  m.box('metalDark', [0.38, 0, 0.38], [0.62, 0.03, 0.62]);
  m.box('glass', [0.4, 0.03, 0.4], [0.6, 0.28, 0.6]);
  for (const x of [0.38, 0.6]) for (const z of [0.38, 0.6]) m.box('metalDark', [x, 0.03, z], [x + 0.02, 0.28, z + 0.02]);
  m.box('metalDark', [0.37, 0.28, 0.37], [0.63, 0.31, 0.63]);
  m.rod('metalDark', [0.46, 0.31, C], [0.46, 0.4, C], 0.015);
  m.rod('metalDark', [0.54, 0.31, C], [0.54, 0.4, C], 0.015);
  m.rod('metalDark', [0.46, 0.4, C], [0.54, 0.4, C], 0.015);
  m.box('carpetWhite', [0.46, 0.03, 0.46], [0.54, 0.14, 0.54]);
  return m;
}
function candleSingle() {
  const m = new Model('candleSingle');
  cy(m, 'metal', 0, 0.02, 0.07, 0.07, 8);
  cy(m, 'metal', 0.02, 0.06, 0.03, 0.045, 8);
  cy(m, 'carpetWhite', 0.06, 0.22, 0.025, 0.025, 6);
  cy(m, 'wood', 0.22, 0.26, 0.012, 0.004, 4);
  return m;
}
function candelabra() {
  const m = new Model('candelabra');
  cy(m, 'metal', 0, 0.03, 0.08, 0.06, 8);
  cy(m, 'metal', 0.03, 0.2, 0.015, 0.015, 6);
  m.box('metal', [0.2, 0.18, 0.485], [0.8, 0.205, 0.515]);
  for (const x of [0.2, 0.5, 0.8]) {
    m.rod('metal', [x, 0.18, C], [x, 0.24, C], 0.015);
    cy(m, 'metal', 0.24, 0.26, 0.035, 0.035, 6, x, C);
    cy(m, 'carpetWhite', 0.26, 0.42, 0.022, 0.022, 6, x, C);
    cy(m, 'wood', 0.42, 0.46, 0.012, 0.004, 4, x, C);
  }
  return m;
}
function candleTrio() {
  const m = new Model('candleTrio');
  m.box('woodDark', [0.25, 0, 0.35], [0.75, 0.025, 0.65]);
  [[0.35, 0.45, 0.2, 0.06], [0.55, 0.55, 0.14, 0.05], [0.65, 0.42, 0.26, 0.04]].forEach(([x, z, h, r]) => {
    cy(m, 'carpetWhite', 0.025, 0.025 + h, r, r, 8, x, z);
    cy(m, 'wood', 0.025 + h, 0.025 + h + 0.03, 0.01, 0.003, 4, x, z);
  });
  return m;
}
function fairyLightStand() {
  const m = new Model('fairyLightStand');
  cy(m, 'woodDark', 0, 0.08, 0.2, 0.2, 8);
  const tips = [[0.3, 0.5, 1.3], [0.7, 0.45, 1.5], [0.5, 0.75, 1.4], [0.45, 0.25, 1.1], [0.62, 0.62, 1.0]];
  m.rod('woodDark', [C, 0.08, C], [C, 0.9, C], 0.04);
  for (const [x, z, y] of tips) {
    m.rod('woodDark', [C, y - 0.45, C], [x, y, z], 0.025);
    for (const t of [0.4, 0.7, 1]) { const px = C + (x - C) * t, pz = C + (z - C) * t, py = y - 0.45 * (1 - t); cy(m, 'wood', py, py + 0.06, 0.025, 0.025, 4, px, pz); }
  }
  return m;
}
function lavaLamp() {
  const m = new Model('lavaLamp');
  cy(m, 'metal', 0, 0.08, 0.09, 0.06, 8);
  m.lathe('carpet', C, C, [[0.06, 0.08], [0.075, 0.2], [0.04, 0.38], [0.035, 0.4]], 8);
  cy(m, 'carpetDarker', 0.1, 0.15, 0.05, 0.06, 8);
  sph(m, 'carpetBlue', C, 0.26, C, 0.03, 6, 4);
  cy(m, 'metal', 0.4, 0.45, 0.03, 0.015, 8);
  return m;
}
function saltLamp() {
  const m = new Model('saltLamp');
  m.box('woodDark', [0.35, 0, 0.35], [0.65, 0.04, 0.65]);
  m.lathe('carpetDarker', C, C, [[0.12, 0.04], [0.15, 0.1], [0.13, 0.2], [0.07, 0.26], [0.05, 0.27]], 7);
  return m;
}
function neonSign() {
  const m = new Model('neonSign');
  m.box('metalDark', [0.1, 0, 0], [0.9, 0.5, 0.02]);
  m.rod('carpet', [0.3, 0.2, 0.03], [0.4, 0.34, 0.03], 0.03);
  m.rod('carpet', [0.4, 0.34, 0.03], [0.5, 0.2, 0.03], 0.03);
  m.rod('carpet', [0.5, 0.2, 0.03], [0.4, 0.08, 0.03], 0.03);
  m.rod('carpet', [0.4, 0.08, 0.03], [0.3, 0.2, 0.03], 0.03);
  m.rod('carpetBlue', [0.58, 0.2, 0.03], [0.66, 0.34, 0.03], 0.03);
  m.rod('carpetBlue', [0.66, 0.34, 0.03], [0.74, 0.08, 0.03], 0.03);
  m.rod('carpetBlue', [0.74, 0.08, 0.03], [0.82, 0.3, 0.03], 0.03);
  return m;
}
function stringLights() {
  const m = new Model('stringLights');
  let prev = [0.04, 0.4, 0.02];
  for (let i = 1; i <= 10; i++) {
    const t = i / 10, p = [0.04 + 0.92 * t, 0.4 - 0.3 * Math.sin(Math.PI * t), 0.02];
    m.rod('metalDark', prev, p, 0.01);
    if (i % 2 === 0 && i < 10) cb(m, i % 4 === 0 ? 'carpetBlue' : 'wood', p[0], 0.03, p[1] - 0.07, 0.05, 0.07, 0.05);
    prev = p;
  }
  m.box('metalDark', [0.02, 0.38, 0], [0.06, 0.42, 0.04]);
  m.box('metalDark', [0.94, 0.38, 0], [0.98, 0.42, 0.04]);
  return m;
}
function tikiTorch() {
  const m = new Model('tikiTorch');
  cy(m, 'woodDark', 0, 1.5, 0.035, 0.03, 6);
  cy(m, 'metalDark', 1.4, 1.5, 0.07, 0.1, 8);
  cy(m, 'wood', 1.5, 1.68, 0.02, 0.03, 6);
  cy(m, 'carpet', 1.68, 1.82, 0.03, 0.005, 6);
  return m;
}
function pathLight() {
  const m = new Model('pathLight');
  cy(m, 'metalDark', 0, 0.4, 0.015, 0.015, 6);
  cy(m, 'metalDark', 0.4, 0.43, 0.09, 0.09, 8);
  cy(m, 'carpetWhite', 0.43, 0.58, 0.075, 0.075, 8);
  dome(m, 'metalDark', C, 0.58, C, 0.1, 8, 3);
  return m;
}
function lampPost() {
  const m = new Model('lampPost');
  cy(m, 'metalDark', 0, 0.2, 0.12, 0.07, 8);
  cy(m, 'metalDark', 0.2, 2.0, 0.04, 0.03, 8);
  m.box('metalDark', [0.38, 2.0, 0.38], [0.62, 2.04, 0.62]);
  m.box('carpetWhite', [0.4, 2.04, 0.4], [0.6, 2.3, 0.6]);
  for (const x of [0.4, 0.58]) for (const z of [0.4, 0.58]) m.box('metalDark', [x, 2.04, z], [x + 0.02, 2.3, z + 0.02]);
  m.box('metalDark', [0.36, 2.3, 0.36], [0.64, 2.34, 0.64]);
  return m;
}
function bollardLight() {
  const m = new Model('bollardLight');
  cy(m, 'metalMedium', 0, 0.6, 0.07, 0.07, 8);
  cy(m, 'carpetWhite', 0.5, 0.56, 0.072, 0.072, 8);
  cy(m, 'metalDark', 0.6, 0.64, 0.075, 0.075, 8);
  return m;
}
function nightlightMoon() {
  const m = new Model('nightlightMoon');
  m.box('carpetWhite', [0.32, 0, 0.4], [0.68, 0.05, 0.6]); // base
  m.box('carpetWhite', [0.46, 0.05, 0.46], [0.54, 0.12, 0.54]);
  // crescent: an arc of chunky segments around (0.5, 0.28), open to the right
  const R = 0.13, cx = C, cyy = 0.28, n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (Math.PI / 180) * (50 + (260 * i) / n), a1 = (Math.PI / 180) * (50 + (260 * (i + 1)) / n);
    m.rod('carpetBlue', [cx + R * Math.cos(a0), cyy + R * Math.sin(a0), 0.5], [cx + R * Math.cos(a1), cyy + R * Math.sin(a1), 0.5], 0.07, 0.07);
  }
  return m;
}
function pendantCone() {
  const m = new Model('pendantCone');
  cy(m, 'metalDark', 0.5, 0.9, 0.008, 0.008, 4);
  cy(m, 'metalLight', 0.2, 0.5, 0.2, 0.03, 10);
  cy(m, 'carpetWhite', 0.19, 0.2, 0.17, 0.17, 10);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Outdoor
// ---------------------------------------------------------------------------------------------

function benchIron() {
  const m = new Model('benchIron');
  const W = 1.5, x0 = 0.25;
  for (const x of [x0 + 0.06, x0 + W - 0.08]) { // cast ends: legs, arm and back post
    m.box('metalDark', [x - 0.02, 0, 0.3], [x + 0.02, 0.45, 0.34]);
    m.box('metalDark', [x - 0.02, 0, 0.7], [x + 0.02, 0.45, 0.74]);
    m.box('metalDark', [x - 0.02, 0.44, 0.28], [x + 0.02, 0.48, 0.76]);
    m.rod('metalDark', [x, 0.46, 0.3], [x, 0.9, 0.2], 0.04, 0.04);
    m.box('metalDark', [x - 0.02, 0.62, 0.3], [x + 0.02, 0.66, 0.74]);
  }
  for (let i = 0; i < 5; i++) m.box('wood', [x0, 0.45, 0.3 + i * 0.1], [x0 + W, 0.485, 0.38 + i * 0.1]); // seat slats
  for (let i = 0; i < 4; i++) m.rod('wood', [x0 + 0.02, 0.55 + i * 0.1, 0.27 - i * 0.025], [x0 + W - 0.02, 0.55 + i * 0.1, 0.27 - i * 0.025], 0.07, 0.025);
  return m;
}

function picnicTable() {
  const m = new Model('picnicTable');
  const x0 = 0.1, W = 1.8;
  m.box('wood', [x0, 0.72, 0.5], [x0 + W, 0.76, 1.5]);
  for (let i = 1; i < 5; i++) m.box('woodDark', [x0, 0.715, 0.5 + i * 0.2 - 0.005], [x0 + W, 0.725, 0.5 + i * 0.2 + 0.005]);
  for (const z of [0.1, 1.5]) m.box('wood', [x0 + 0.1, 0.44, z], [x0 + W - 0.1, 0.48, z + 0.4]);
  for (const x of [0.4, 1.5]) {
    m.rod('woodDark', [x, 0.02, 0.3], [x + 0.05, 0.72, 0.8], 0.07, 0.05);
    m.rod('woodDark', [x, 0.02, 1.7], [x + 0.05, 0.72, 1.2], 0.07, 0.05);
    m.box('woodDark', [x - 0.02, 0.4, 0.3], [x + 0.08, 0.44, 1.7]);
  }
  return m;
}

function parasolStanding() {
  const m = new Model('parasolStanding');
  cy(m, 'metalDark', 0, 0.08, 0.28, 0.25, 8);
  cy(m, 'metalDark', 0.08, 2.15, 0.025, 0.02, 6);
  m.lathe(['carpet', 'carpetWhite'], C, C, [[0.001, 2.35], [0.2, 2.3], [0.46, 2.08], [0.47, 2.04]], 8);
  cy(m, 'metalDark', 2.34, 2.42, 0.01, 0.01, 4);
  return m;
}

function porchSwing() {
  const m = new Model('porchSwing');
  const x0 = 0.1, W = 1.8;
  for (const x of [x0, x0 + W - 0.08]) { // A-frame ends
    m.rod('woodDark', [x + 0.04, 0, 0.1], [x + 0.04, 1.9, 0.5], 0.08, 0.08);
    m.rod('woodDark', [x + 0.04, 0, 0.9], [x + 0.04, 1.9, 0.5], 0.08, 0.08);
  }
  m.box('woodDark', [x0, 1.85, 0.44], [x0 + W, 1.95, 0.56]); // top beam
  const sx0 = 0.3, sx1 = 1.7;
  for (const x of [sx0, sx1]) { // chains
    m.rod('metalDark', [x, 1.85, 0.4], [x, 0.5, 0.35], 0.02);
    m.rod('metalDark', [x, 1.85, 0.6], [x, 0.5, 0.65], 0.02);
  }
  m.box('wood', [sx0 - 0.04, 0.42, 0.28], [sx1 + 0.04, 0.5, 0.72]); // seat
  m.box('wood', [sx0 - 0.04, 0.5, 0.26], [sx1 + 0.04, 0.54, 0.7]);
  m.rod('wood', [sx0 - 0.04, 0.5, 0.3], [sx0 - 0.04, 0.95, 0.25], 0.06, 0.06);
  m.rod('wood', [sx1 + 0.04, 0.5, 0.3], [sx1 + 0.04, 0.95, 0.25], 0.06, 0.06);
  for (let i = 0; i < 4; i++) m.rod('wood', [sx0 - 0.04, 0.58 + i * 0.12, 0.3 - i * 0.012], [sx1 + 0.04, 0.58 + i * 0.12, 0.3 - i * 0.012], 0.09, 0.03);
  m.box('carpetBlue', [sx0 + 0.05, 0.54, 0.34], [sx1 - 0.05, 0.6, 0.7]); // cushion
  return m;
}

function deckChair() {
  const m = new Model('deckChair');
  for (const x of [0.2, 0.8]) {
    m.rod('woodDark', [x, 0, 0.3], [x, 0.4, 0.7], 0.05);
    m.rod('woodDark', [x, 0.35, 0.95], [x, 0.4, 0.7], 0.05);
    m.rod('woodDark', [x, 0.02, 0.9], [x, 0.9, 0.2], 0.05);
    m.rod('wood', [x, 0.4, 0.7], [x, 0.7, 0.55], 0.04);
  }
  m.slab('carpetBlue', [0.21, 0.08, 0.92], [0.58, 0, 0], [0, 0.78, -0.7], [0, 0.03, 0.03]); // striped canvas
  m.slab('carpetWhite', [0.35, 0.08, 0.92], [0.12, 0, 0], [0, 0.78, -0.7], [0, 0.035, 0.035]);
  return m;
}

function gasGrill() {
  const m = new Model('gasGrill');
  legs(m, 'metalDark', 0.1, 0.25, 0.9, 0.75, 0.75, 0.04);
  m.box('metalMedium', [0.1, 0.2, 0.25], [0.9, 0.35, 0.75]); // gas cabinet
  m.box('metalDark', [0.1, 0.75, 0.25], [0.9, 0.9, 0.75]); // firebox
  m.box('metalLight', [0.1, 0.9, 0.25], [0.9, 1.0, 0.75]); // hood
  m.box('metalDark', [0.14, 0.75, 0.75], [0.86, 0.9, 0.78]);
  m.rod('metal', [0.2, 0.96, 0.82], [0.8, 0.96, 0.82], 0.025);
  for (const x of [0.2, 0.4, 0.6, 0.8]) m.box('metalLight', [x - 0.025, 0.8, 0.78], [x + 0.025, 0.85, 0.82]); // knobs
  m.box('wood', [0.9, 0.75, 0.3], [1.0, 0.8, 0.7]); // side shelf
  m.box('metalDark', [0.1, 0.35, 0.74], [0.9, 0.7, 0.76]);
  m.box('metalLight', [0.28, 0.4, 0.76], [0.72, 0.64, 0.78]);
  cy(m, 'metalDark', 0, 0.06, 0.04, 0.04, 6, 0.12, 0.28);
  return m;
}

function planterTrough() {
  const m = new Model('planterTrough');
  m.box('woodDark', [0.1, 0, 0.3], [0.9, 0.04, 0.7]);
  m.box('wood', [0.1, 0.04, 0.3], [0.9, 0.4, 0.34]);
  m.box('wood', [0.1, 0.04, 0.66], [0.9, 0.4, 0.7]);
  m.box('wood', [0.1, 0.04, 0.34], [0.14, 0.4, 0.66]);
  m.box('wood', [0.86, 0.04, 0.34], [0.9, 0.4, 0.66]);
  m.box('woodDark', [0.14, 0.04, 0.34], [0.86, 0.34, 0.66]);
  for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) { sph(m, 'plant', x, 0.44 + (x * 7 % 3) * 0.02, C, 0.09, 6, 4); }
  for (const [x, z] of [[0.28, 0.45], [0.58, 0.55], [0.74, 0.46]]) cb(m, 'carpet', x, z, 0.5, 0.05, 0.05, 0.05);
  return m;
}

function birdBath() {
  const m = new Model('birdBath');
  cy(m, 'metal', 0, 0.08, 0.17, 0.15, 8);
  cy(m, 'metal', 0.08, 0.65, 0.07, 0.05, 8);
  m.lathe('metal', C, C, [[0.001, 0.62], [0.14, 0.66], [0.3, 0.78], [0.28, 0.78]], 10, { caps: false });
  cy(m, 'metal', 0.66, 0.76, 0.28, 0.28, 10);
  cy(m, 'glass', 0.76, 0.77, 0.25, 0.25, 10);
  cb(m, 'carpetBlue', 0.5, 0.52, 0.77, 0.06, 0.06, 0.1);
  return m;
}

function firePit() {
  const m = new Model('firePit');
  const R = 0.38;
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; cb(m, k % 2 ? 'metal' : 'metalMedium', C + R * Math.cos(a), C + R * Math.sin(a), 0, 0.2, 0.18, 0.2); }
  for (let k = 0; k < 10; k++) { const a = ((k + 0.5) / 10) * Math.PI * 2; cb(m, k % 2 ? 'metalMedium' : 'metal', C + R * 0.95 * Math.cos(a), C + R * 0.95 * Math.sin(a), 0.18, 0.18, 0.12, 0.18); }
  cy(m, 'metalDark', 0.02, 0.2, 0.3, 0.3, 10);
  m.rod('woodDark', [0.35, 0.2, 0.4], [0.6, 0.3, 0.55], 0.07);
  m.rod('woodDark', [0.6, 0.2, 0.4], [0.4, 0.3, 0.6], 0.07);
  cy(m, 'carpet', 0.22, 0.45, 0.12, 0.02, 6);
  cy(m, 'wood', 0.22, 0.38, 0.07, 0.01, 6);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Kids and nursery
// ---------------------------------------------------------------------------------------------

/** n vertical bars between x0 and x1 at depth z. */
function bars(m, mat, x0, x1, z, y0, y1, n, t = 0.025) {
  for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n; m.box(mat, [x - t / 2, y0, z - t / 2], [x + t / 2, y1, z + t / 2]); }
}
/** n bars along z between z0 and z1 at x. */
function barsZ(m, mat, z0, z1, x, y0, y1, n, t = 0.025) {
  for (let i = 0; i < n; i++) { const z = z0 + ((z1 - z0) * (i + 0.5)) / n; m.box(mat, [x - t / 2, y0, z - t / 2], [x + t / 2, y1, z + t / 2]); }
}
/** Simple bed: frame, mattress, bedding, pillow. W across x, D along z; headboard at low z. */
function bedBase(m, { W = 0.92, D = 1.9, legH = 0.12, mat = 0.18, head = 0.7, foot = 0.4, wood = 'wood', bedding = 'carpetBlue', x0 = 0.04, z0 = 0.04 } = {}) {
  const x1 = x0 + W, z1 = z0 + D;
  legs(m, 'woodDark', x0, z0, x1, z1, legH, 0.06);
  m.box(wood, [x0, legH, z0], [x1, legH + 0.06, z1]);
  m.box('carpetWhite', [x0 + 0.04, legH + 0.06, z0 + 0.04], [x1 - 0.04, legH + 0.06 + mat, z1 - 0.04]);
  m.box(bedding, [x0 + 0.03, legH + 0.06 + mat * 0.7, z0 + 0.5], [x1 - 0.03, legH + 0.06 + mat + 0.04, z1 - 0.02]);
  m.box('carpetWhite', [x0 + 0.12, legH + 0.06 + mat, z0 + 0.08], [x1 - 0.12, legH + 0.06 + mat + 0.08, z0 + 0.4]);
  m.box(wood, [x0, legH, z0], [x1, head, z0 + 0.05]);
  m.box(wood, [x0, legH, z1 - 0.05], [x1, foot, z1]);
  return legH + 0.06 + mat;
}

function cribModern() {
  const m = new Model('cribModern');
  const x0 = 0.1, x1 = 0.9, z0 = 0.1, z1 = 1.5;
  legs(m, 'metalLight', x0, z0, x1, z1, 1.0, 0.05);
  m.box('metalLight', [x0, 0.2, z0], [x1, 0.24, z1]);
  m.box('carpetWhite', [x0 + 0.03, 0.24, z0 + 0.03], [x1 - 0.03, 0.34, z1 - 0.03]);
  m.box('carpetBlue', [x0 + 0.03, 0.3, z0 + 0.5], [x1 - 0.03, 0.36, z1 - 0.03]);
  for (const y of [0.98, 0.5]) { m.box('metalLight', [x0, y, z0], [x1, y + 0.04, z0 + 0.05]); m.box('metalLight', [x0, y, z1 - 0.05], [x1, y + 0.04, z1]); m.box('metalLight', [x0, y, z0], [x0 + 0.05, y + 0.04, z1]); m.box('metalLight', [x1 - 0.05, y, z0], [x1, y + 0.04, z1]); }
  bars(m, 'metalLight', x0, x1, z0 + 0.025, 0.5, 0.98, 14); bars(m, 'metalLight', x0, x1, z1 - 0.025, 0.5, 0.98, 14);
  barsZ(m, 'metalLight', z0, z1, x0 + 0.025, 0.5, 0.98, 20); barsZ(m, 'metalLight', z0, z1, x1 - 0.025, 0.5, 0.98, 20);
  return m;
}

function cribCanopy() {
  const m = new Model('cribCanopy');
  const x0 = 0.1, x1 = 0.9, z0 = 0.1, z1 = 1.5;
  legs(m, 'wood', x0, z0, x1, z1, 0.95, 0.06);
  m.box('wood', [x0, 0.2, z0], [x1, 0.24, z1]);
  m.box('carpetWhite', [x0 + 0.03, 0.24, z0 + 0.03], [x1 - 0.03, 0.34, z1 - 0.03]);
  m.box('carpetDarker', [x0 + 0.03, 0.3, z0 + 0.5], [x1 - 0.03, 0.36, z1 - 0.03]);
  m.box('wood', [x0, 0.9, z0], [x1, 0.95, z0 + 0.05]); m.box('wood', [x0, 0.9, z1 - 0.05], [x1, 0.95, z1]);
  m.box('wood', [x0, 0.9, z0], [x0 + 0.05, 0.95, z1]); m.box('wood', [x1 - 0.05, 0.9, z0], [x1, 0.95, z1]);
  bars(m, 'wood', x0, x1, z0 + 0.025, 0.24, 0.9, 12); barsZ(m, 'wood', z0, z1, x0 + 0.025, 0.24, 0.9, 18); barsZ(m, 'wood', z0, z1, x1 - 0.025, 0.24, 0.9, 18);
  m.box('wood', [x0, 0.4, z1 - 0.025], [x1, 0.43, z1 + 0.0]);
  m.rod('wood', [C, 0.95, z0], [C, 1.7, z0], 0.04); // canopy post and crown
  m.box('wood', [0.4, 1.68, z0 - 0.04], [0.6, 1.72, z0 + 0.3]);
  return m;
}

function cradleRocking() {
  const m = new Model('cradleRocking');
  for (const x of [0.2, 0.8]) { // rockers
    m.rod('woodDark', [x, 0.02, 0.15], [x, 0.06, 0.4], 0.05, 0.05); m.rod('woodDark', [x, 0.06, 0.4], [x, 0.06, 0.6], 0.05, 0.05); m.rod('woodDark', [x, 0.06, 0.6], [x, 0.02, 0.85], 0.05, 0.05);
    m.rod('wood', [x, 0.06, 0.2], [x, 0.3, 0.2], 0.05); m.rod('wood', [x, 0.06, 0.8], [x, 0.3, 0.8], 0.05);
  }
  m.box('wood', [0.2, 0.28, 0.15], [0.8, 0.34, 0.85]);
  m.box('wood', [0.2, 0.3, 0.15], [0.24, 0.55, 0.85]); m.box('wood', [0.76, 0.3, 0.15], [0.8, 0.55, 0.85]);
  m.box('wood', [0.2, 0.3, 0.15], [0.8, 0.62, 0.19]); m.box('wood', [0.2, 0.3, 0.81], [0.8, 0.46, 0.85]);
  m.box('carpetWhite', [0.24, 0.34, 0.19], [0.76, 0.42, 0.81]);
  m.box('carpetBlue', [0.25, 0.4, 0.42], [0.75, 0.46, 0.8]);
  return m;
}

function changingDresser() {
  const m = new Model('changingDresser');
  const x0 = 0.05, x1 = 0.95, z1 = 0.5;
  legs(m, 'woodDark', x0, 0, x1, z1, 0.1, 0.06);
  m.box('wood', [x0, 0.1, 0], [x1, 0.88, z1]);
  for (let i = 0; i < 3; i++) { m.box('woodDark', [x0 + 0.04, 0.14 + i * 0.25, z1], [x1 - 0.04, 0.34 + i * 0.25, z1 + 0.02]); m.rod('metal', [0.4, 0.24 + i * 0.25, z1 + 0.04], [0.6, 0.24 + i * 0.25, z1 + 0.04], 0.02); }
  m.box('woodDark', [x0 - 0.01, 0.88, 0], [x1 + 0.01, 0.92, z1 + 0.02]);
  m.box('carpetBlue', [x0 + 0.04, 0.92, 0.04], [x1 - 0.04, 0.99, z1 - 0.02]); // pad
  m.box('woodDark', [x0, 0.92, 0], [x0 + 0.04, 1.02, z1 + 0.02]); m.box('woodDark', [x1 - 0.04, 0.92, 0], [x1, 1.02, z1 + 0.02]);
  m.box('woodDark', [x0, 0.92, 0], [x1, 1.02, 0.04]);
  return m;
}

/** Lidded box: body plus an `anim:lid` part hinged on the back top edge. */
function toyBoxLidded() {
  const m = new Model('toyBoxLidded');
  const x0 = 0.12, x1 = 0.88, z0 = 0.2, z1 = 0.8, H = 0.5;
  m.box('wood', [x0, 0, z0], [x1, H, z0 + 0.03]); m.box('wood', [x0, 0, z1 - 0.03], [x1, H, z1]);
  m.box('wood', [x0, 0, z0], [x0 + 0.03, H, z1]); m.box('wood', [x1 - 0.03, 0, z0], [x1, H, z1]);
  m.box('woodDark', [x0 + 0.03, 0, z0 + 0.03], [x1 - 0.03, 0.03, z1 - 0.03]);
  m.box('carpetBlue', [x0 + 0.05, 0.12, z1 - 0.034], [x1 - 0.05, 0.4, z1 + 0.004]); // painted panel
  m.box('carpet', [x0 + 0.05, 0.12, z0 - 0.004], [x1 - 0.05, 0.4, z0 + 0.034]);
  for (const x of [x0 + 0.02, x1 - 0.1]) m.box('woodDark', [x, 0, z1], [x + 0.08, 0.5, z1 + 0.03]);
  const lid = m.part('anim:lid', [C, H, z0]);
  lid.box('woodDark', [x0 - 0.01, H, z0 - 0.01], [x1 + 0.01, H + 0.05, z1 + 0.02]);
  lid.box('carpet', [0.42, H + 0.05, z1 - 0.1], [0.58, H + 0.08, z1 - 0.02]);
  return m;
}

function toyBoxBench() {
  const m = new Model('toyBoxBench');
  const x0 = 0.1, x1 = 1.9, z0 = 0.25, z1 = 0.75, H = 0.42;
  m.box('wood', [x0, 0, z0], [x1, H, z0 + 0.03]); m.box('wood', [x0, 0, z1 - 0.03], [x1, H, z1]);
  m.box('wood', [x0, 0, z0], [x0 + 0.03, H, z1]); m.box('wood', [x1 - 0.03, 0, z0], [x1, H, z1]);
  m.box('woodDark', [x0 + 0.03, 0, z0 + 0.03], [x1 - 0.03, 0.03, z1 - 0.03]);
  m.box('woodDark', [x0, 0, z1 - 0.03], [x1, 0.06, z1 + 0.015]);
  for (const x of [0.6, 1.0, 1.4]) m.box('woodDark', [x - 0.15, 0.1, z1], [x + 0.15, 0.34, z1 + 0.015]);
  const lid = m.part('anim:lid', [1, H, z0]);
  lid.box('carpetBlue', [x0 - 0.01, H, z0 - 0.01], [x1 + 0.01, H + 0.07, z1 + 0.02]);
  lid.box('woodDark', [x0 - 0.01, H, z1 + 0.0], [x1 + 0.01, H + 0.03, z1 + 0.02]);
  return m;
}

function kidsBedHouse() {
  const m = new Model('kidsBedHouse');
  bedBase(m, { wood: 'carpetWhite', head: 0.4, foot: 0.4, legH: 0.1, mat: 0.16, bedding: 'carpet' });
  for (const [x, z] of [[0.04, 0.04], [0.96 - 0.06, 0.04], [0.04, 1.88], [0.9, 1.88]]) m.box('wood', [x, 0.1, z], [x + 0.06, 1.15, z + 0.06]);
  m.box('wood', [0.04, 1.1, 0.04], [0.96, 1.15, 0.1]); m.box('wood', [0.04, 1.1, 1.88], [0.96, 1.15, 1.94]);
  // gable roof frame on both ends
  for (const z of [0.04, 1.88]) { m.rod('wood', [0.04, 1.12, z + 0.03], [C, 1.5, z + 0.03], 0.06, 0.05); m.rod('wood', [0.96, 1.12, z + 0.03], [C, 1.5, z + 0.03], 0.06, 0.05); }
  m.rod('woodDark', [C, 1.5, 0.07], [C, 1.5, 1.91], 0.06, 0.06);
  m.box('carpet', [0.04, 0.4, 1.9], [0.96, 0.5, 1.94]);
  return m;
}

function kidsBedCar() {
  const m = new Model('kidsBedCar');
  m.box('carpet', [0.04, 0.12, 0.04], [0.96, 0.55, 1.94]); // body shell
  m.box('carpetDarker', [0.04, 0.12, 0.04], [0.96, 0.2, 1.94]);
  m.box('carpetWhite', [0.12, 0.55, 0.3], [0.88, 0.7, 1.8]); // mattress
  m.box('carpetBlue', [0.12, 0.62, 0.8], [0.88, 0.7, 1.8]);
  m.box('carpetWhite', [0.2, 0.7, 0.34], [0.8, 0.78, 0.7]);
  m.box('carpet', [0.04, 0.55, 0.04], [0.96, 0.95, 0.3]); // bonnet / windscreen end
  m.box('carpetBlue', [0.1, 0.55, 0.04], [0.9, 0.5 + 0.55, 0.12]);
  for (const x of [0.2, 0.8]) for (const z of [0.4, 1.55]) { m.cyl('metalDark', [x - 0.06 + (x < 0.5 ? -0.04 : 0.1), 0.18, z], [x + (x < 0.5 ? 0.0 : 0.16), 0.18, z], 0.16, 8); }
  m.box('metalLight', [0.1, 0.3, 1.94], [0.25, 0.4, 1.97]); m.box('metalLight', [0.75, 0.3, 1.94], [0.9, 0.4, 1.97]);
  return m;
}

function kidsBunkLadder() {
  const m = new Model('kidsBunkLadder');
  const x0 = 0.04, x1 = 0.76, z0 = 0.04, z1 = 1.94;
  for (const x of [x0, x1 - 0.07]) for (const z of [z0, z1 - 0.07]) m.box('wood', [x, 0, z], [x + 0.07, 1.65, z + 0.07]);
  for (const y of [0.2, 1.0]) {
    m.box('wood', [x0, y, z0], [x1, y + 0.07, z1]);
    m.box('carpetWhite', [x0 + 0.04, y + 0.07, z0 + 0.04], [x1 - 0.04, y + 0.21, z1 - 0.04]);
    m.box(y < 0.5 ? 'carpetBlue' : 'carpet', [x0 + 0.03, y + 0.15, z0 + 0.5], [x1 - 0.03, y + 0.24, z1 - 0.02]);
    m.box('carpetWhite', [x0 + 0.1, y + 0.21, z0 + 0.08], [x1 - 0.1, y + 0.29, z0 + 0.4]);
  }
  m.box('wood', [x0, 0.2, z0], [x1, 0.5, z0 + 0.04]);
  m.box('wood', [x0, 1.0, z0], [x1, 1.4, z0 + 0.04]); m.box('wood', [x0, 1.0, z1 - 0.04], [x1, 1.3, z1]);
  m.box('wood', [x0, 1.07, z0], [x0 + 0.04, 1.4, 1.0]); // top guard rail
  m.box('wood', [x1 - 0.04, 1.07, z0], [x1, 1.4, 1.2]);
  for (let i = 0; i < 6; i++) m.box('woodDark', [x1 + 0.0, 0.2 + i * 0.2, 1.4], [x1 + 0.05, 0.25 + i * 0.2, 1.55]);
  m.box('woodDark', [x1, 0.15, 1.35], [x1 + 0.05, 1.3, 1.4]); m.box('woodDark', [x1, 0.15, 1.55], [x1 + 0.05, 1.3, 1.6]);
  return m;
}

function kidsLoftBed() {
  const m = new Model('kidsLoftBed');
  const x0 = 0.04, x1 = 0.96, z0 = 0.04, z1 = 1.94, Y = 1.1;
  for (const x of [x0, x1 - 0.07]) for (const z of [z0, z1 - 0.07]) m.box('metalDark', [x, 0, z], [x + 0.07, Y + 0.45, z + 0.07]);
  m.box('metalDark', [x0, Y, z0], [x1, Y + 0.06, z1]);
  m.box('carpetWhite', [x0 + 0.04, Y + 0.06, z0 + 0.04], [x1 - 0.04, Y + 0.2, z1 - 0.04]);
  m.box('carpet', [x0 + 0.03, Y + 0.14, z0 + 0.5], [x1 - 0.03, Y + 0.23, z1 - 0.02]);
  for (const z of [z0, z1 - 0.03]) m.box('metalDark', [x0, Y + 0.3, z], [x1, Y + 0.34, z + 0.03]);
  m.box('metalDark', [x0, Y + 0.3, z0], [x0 + 0.03, Y + 0.34, z1]); m.box('metalDark', [x1 - 0.03, Y + 0.3, z0], [x1, Y + 0.34, z1]);
  barsZ(m, 'metalDark', z0, z1, x0 + 0.015, Y + 0.06, Y + 0.3, 8); barsZ(m, 'metalDark', z0, z1, x1 - 0.015, Y + 0.06, Y + 0.3, 8);
  // desk underneath
  m.box('wood', [x0 + 0.1, 0.7, z0 + 0.1], [x1 - 0.1, 0.74, z0 + 0.6]);
  m.box('wood', [x0 + 0.1, 0.1, z0 + 0.1], [x0 + 0.14, 0.7, z0 + 0.6]);
  // ladder
  for (const z of [1.5, 1.8]) m.box('wood', [x0 + 0.1, 0.1 + (z - 1.5) * 0, z - 0.0], [x1 - 0.1, 0.13, z + 0.03]);
  for (let i = 0; i < 5; i++) m.box('wood', [x0, 0.2 + i * 0.2, 1.5 - 0.0], [x0 + 0.04, 0.24 + i * 0.2, 1.8]);
  return m;
}

function kidsDeskSmall() {
  const m = new Model('kidsDeskSmall');
  const x0 = 0.1, x1 = 0.9, z0 = 0.2, z1 = 0.8, H = 0.56;
  legs(m, 'woodDark', x0, z0, x1, z1, H, 0.05);
  m.box('wood', [x0 - 0.01, H, z0 - 0.01], [x1 + 0.01, H + 0.04, z1 + 0.01]);
  m.box('wood', [x1 - 0.3, 0.2, z0 + 0.05], [x1 - 0.05, H, z1 - 0.05]); // drawer unit
  m.box('woodDark', [x1 - 0.28, 0.3, z1 - 0.05], [x1 - 0.07, 0.5, z1 - 0.03]);
  m.rod('metal', [x1 - 0.22, 0.4, z1 - 0.02], [x1 - 0.13, 0.4, z1 - 0.02], 0.015);
  m.box('carpetBlue', [0.2, H + 0.04, 0.35], [0.5, H + 0.05, 0.65]); // blotter
  m.box('carpet', [0.55, H + 0.04, 0.3], [0.62, H + 0.1, 0.4]);
  return m;
}

function kidsChairSmall() {
  const m = new Model('kidsChairSmall');
  const x0 = 0.25, x1 = 0.75, z0 = 0.25, z1 = 0.75;
  legs(m, 'wood', x0, z0, x1, z1, 0.3, 0.05);
  m.box('carpet', [x0 - 0.01, 0.3, z0 - 0.01], [x1 + 0.01, 0.34, z1 + 0.01]);
  m.box('wood', [x0, 0.3, z0], [x0 + 0.05, 0.7, z0 + 0.05]); m.box('wood', [x1 - 0.05, 0.3, z0], [x1, 0.7, z0 + 0.05]);
  m.box('carpet', [x0, 0.48, z0], [x1, 0.68, z0 + 0.04]);
  return m;
}

function kidsTableSet() {
  const m = new Model('kidsTableSet');
  m.box('carpetBlue', [0.2, 0.46, 0.2], [0.8, 0.5, 0.8]);
  for (const [x, z] of [[0.24, 0.24], [0.72, 0.24], [0.24, 0.72], [0.72, 0.72]]) m.box('wood', [x, 0, z], [x + 0.04, 0.46, z + 0.04]);
  m.box('woodDark', [0.25, 0.25, 0.25], [0.75, 0.28, 0.75]);
  for (const [x, z] of [[0.5, 0.88], [0.5, 0.12]]) { cy(m, 'carpet', 0.24, 0.28, 0.1, 0.1, 8, x, z); cy(m, 'wood', 0, 0.24, 0.03, 0.05, 6, x, z); }
  return m;
}

function playKitchen() {
  const m = new Model('playKitchen');
  const x0 = 0.05, x1 = 0.95, D = 0.45, H = 0.55;
  m.box('carpetWhite', [x0, 0, 0], [x1, H, D]);
  m.box('metalLight', [x0 - 0.01, H, 0], [x1 + 0.01, H + 0.03, D + 0.02]);
  m.box('carpetBlue', [x0, H + 0.03, 0], [x1, 1.1, 0.04]); // back panel
  m.box('wood', [x0, 0.85, 0], [x1, 0.88, 0.2]); // shelf
  m.box('metalDark', [0.1, 0.15, D], [0.4, 0.5, D + 0.02]); // oven door
  m.box('glass', [0.14, 0.2, D + 0.02], [0.36, 0.4, D + 0.025]);
  m.rod('metal', [0.14, 0.45, D + 0.045], [0.36, 0.45, D + 0.045], 0.015);
  for (const x of [0.5, 0.64]) m.box('carpet', [x, 0.5, D], [x + 0.1, 0.6 - 0.03, D + 0.02]);
  m.box('metalDark', [0.55, 0.15, D], [0.9, 0.45, D + 0.02]); // cupboard
  cy(m, 'metalDark', H + 0.03, H + 0.05, 0.07, 0.07, 8, 0.2, 0.25); cy(m, 'metalDark', H + 0.03, H + 0.05, 0.07, 0.07, 8, 0.4, 0.25); // hob rings
  m.box('metal', [0.65, H + 0.03, 0.12], [0.85, H + 0.1, 0.32]); // sink
  m.rod('metal', [0.75, H + 0.1, 0.1], [0.75, H + 0.3, 0.1], 0.02); m.rod('metal', [0.75, H + 0.3, 0.1], [0.75, H + 0.3, 0.2], 0.02);
  cy(m, 'carpet', 0.88, 0.99, 0.05, 0.05, 8, 0.25, 0.1); cy(m, 'carpetBlue', 0.88, 0.97, 0.05, 0.05, 8, 0.5, 0.1);
  return m;
}

function dollhouse() {
  const m = new Model('dollhouse');
  const x0 = 0.1, x1 = 0.9, z0 = 0.15, z1 = 0.7;
  m.box('wood', [x0, 0, z0], [x1, 0.04, z1]);
  m.box('carpetWhite', [x0, 0.04, z0], [x1, 0.88, z0 + 0.03]);
  m.box('wood', [x0, 0.04, z0], [x0 + 0.03, 0.88, z1]); m.box('wood', [x1 - 0.03, 0.04, z0], [x1, 0.88, z1]);
  m.box('wood', [x0, 0.4, z0], [x1, 0.43, z1]); // floor between storeys
  m.box('woodDark', [C - 0.015, 0.04, z0], [C + 0.015, 0.4, z1 - 0.1]); // partition
  m.slab('carpet', [x0 - 0.04, 0.88, z0 - 0.03], [0, 0, 0.6], [0.44, 0.26, 0], [-0.026, 0.044, 0]);
  m.slab('carpetDarker', [x1 + 0.04, 0.88, z0 - 0.03], [0, 0, 0.6], [-0.44, 0.26, 0], [0.026, 0.044, 0]);
  m.box('carpetBlue', [0.18, 0.04, 0.4], [0.34, 0.14, 0.58]); m.box('carpet', [0.62, 0.43, 0.4], [0.78, 0.52, 0.56]);
  m.box('carpetBlue', [0.22, 0.43, 0.25], [0.26, 0.6, 0.29]); m.box('glass', [0.62, 0.5, z0 + 0.03], [0.78, 0.72, z0 + 0.035]);
  m.box('woodDark', [0.62, 0.04, z1 - 0.04], [0.74, 0.34, z1]); // front door (on the side facing out)
  return m;
}

function rockingHorse() {
  const m = new Model('rockingHorse');
  for (const x of [0.3, 0.7]) { m.rod('wood', [x, 0.04, 0.05], [x, 0.1, 0.3], 0.05); m.rod('wood', [x, 0.1, 0.3], [x, 0.1, 0.7], 0.05); m.rod('wood', [x, 0.1, 0.7], [x, 0.04, 0.95], 0.05); m.rod('woodDark', [x, 0.1, 0.25], [x, 0.4, 0.3], 0.04); m.rod('woodDark', [x, 0.1, 0.75], [x, 0.4, 0.7], 0.04); }
  m.box('carpetWhite', [0.28, 0.4, 0.2], [0.72, 0.62, 0.8]); // body
  m.box('carpetDarker', [0.32, 0.62, 0.35], [0.68, 0.7, 0.6]); // saddle
  m.rod('carpetWhite', [C, 0.55, 0.8], [C, 0.9, 0.9], 0.2, 0.2); // neck
  m.box('carpetWhite', [0.4, 0.8, 0.88], [0.6, 0.95, 1.0]); // head
  m.box('carpetDarker', [0.44, 0.95, 0.88], [0.56, 1.0, 0.92]);
  m.box('woodDark', [0.47, 0.7, 0.8], [0.53, 0.95, 0.84]); // mane
  m.box('woodDark', [0.45, 0.45, 0.14], [0.55, 0.62, 0.2]); // tail
  m.rod('metalDark', [0.3, 0.65, 0.88], [0.7, 0.65, 0.88], 0.02);
  return m;
}

function easelKids() {
  const m = new Model('easelKids');
  m.rod('wood', [0.25, 0, 0.65], [0.32, 1.1, 0.45], 0.04);
  m.rod('wood', [0.75, 0, 0.65], [0.68, 1.1, 0.45], 0.04);
  m.rod('woodDark', [C, 0, 0.15], [C, 1.0, 0.4], 0.04);
  m.box('wood', [0.25, 0.45, 0.46], [0.75, 0.48, 0.7]);
  m.box('carpetWhite', [0.28, 0.5, 0.5], [0.72, 1.0, 0.54]); // paper
  m.box('carpetBlue', [0.32, 0.8, 0.54], [0.52, 0.95, 0.55]); m.box('carpet', [0.5, 0.58, 0.54], [0.66, 0.7, 0.55]); m.box('plant', [0.34, 0.55, 0.54], [0.46, 0.64, 0.55]);
  for (const [mat, x] of [['carpet', 0.35], ['carpetBlue', 0.5], ['plant', 0.65]]) cy(m, mat, 0.48, 0.54, 0.03, 0.03, 6, x, 0.6);
  return m;
}

function kidsBookshelf() {
  const m = new Model('kidsBookshelf');
  const x0 = 0.1, x1 = 0.9, D = 0.3, H = 0.9;
  m.box('wood', [x0, 0, 0], [x0 + 0.03, H, D]); m.box('wood', [x1 - 0.03, 0, 0], [x1, H, D]); m.box('woodDark', [x0, 0, 0], [x1, H, 0.02]);
  for (const y of [0, 0.3, 0.6, H - 0.03]) m.box('wood', [x0, y, 0], [x1, y + 0.03, D]);
  const cols = ['carpet', 'carpetBlue', 'plant', 'carpetDarker', 'carpetWhite'];
  [[0.03, 0], [0.33, 1], [0.63, 2]].forEach(([y, r]) => {
    let x = x0 + 0.05;
    for (let i = 0; i < 6 - r; i++) { const w = 0.05 + ((i * 3 + r) % 3) * 0.02, h = 0.14 + ((i + r) % 3) * 0.03; m.box(cols[(i + r) % 5], [x, y, 0.04], [x + w, y + h, 0.26]); x += w + 0.015; }
  });
  m.box('carpet', [x1 - 0.2, 0.63, 0.04], [x1 - 0.06, 0.8, 0.26]);
  return m;
}

function playTent() {
  const m = new Model('playTent');
  const P = [C, 1.1, C], A = [0.08, 0, 0.08], B = [0.92, 0, 0.08], Cc = [0.92, 0, 0.92], D = [0.08, 0, 0.92];
  for (const [x, z] of [[A[0], A[2]], [B[0], B[2]], [Cc[0], Cc[2]], [D[0], D[2]]]) m.rod('wood', [x, 0, z], P, 0.04);
  m.poly('carpetBlue', [A, B, P], [0, 0.4, -1]);
  m.poly('carpetWhite', [B, Cc, P], [1, 0.4, 0]);
  m.poly('carpetWhite', [D, A, P], [-1, 0.4, 0]);
  m.poly('carpet', [D, [0.44, 0, 0.92], P], [0, 0.4, 1]); // door flaps, pulled aside
  m.poly('carpet', [[0.56, 0, 0.92], Cc, P], [0, 0.4, 1]);
  m.box('carpetDarker', [0.1, 0, 0.1], [0.9, 0.02, 0.9]);
  m.box('carpetBlue', [0.3, 0.02, 0.3], [0.6, 0.1, 0.62]);
  return m;
}

function ballPit() {
  const m = new Model('ballPit');
  const x0 = 0.1, x1 = 1.9, z0 = 0.1, z1 = 1.9;
  m.box('carpetBlue', [x0, 0, z0], [x1, 0.4, z0 + 0.1]); m.box('carpetBlue', [x0, 0, z1 - 0.1], [x1, 0.4, z1]);
  m.box('carpetBlue', [x0, 0, z0], [x0 + 0.1, 0.4, z1]); m.box('carpetBlue', [x1 - 0.1, 0, z0], [x1, 0.4, z1]);
  m.box('carpetWhite', [x0 + 0.1, 0, z0 + 0.1], [x1 - 0.1, 0.2, z1 - 0.1]);
  const cols = ['carpet', 'carpetBlue', 'plant', 'wood', 'carpetWhite'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) sph(m, cols[(i * 2 + j * 3) % 5], 0.35 + i * 0.26 + (j % 2) * 0.05, 0.25 + ((i + j) % 3) * 0.02, 0.35 + j * 0.26, 0.09, 6, 3);
  return m;
}

function trainTable() {
  const m = new Model('trainTable');
  const x0 = 0.1, x1 = 1.9, z0 = 0.2, z1 = 0.8, H = 0.5;
  legs(m, 'woodDark', x0, z0, x1, z1, H, 0.06);
  m.box('wood', [x0 - 0.02, H, z0 - 0.02], [x1 + 0.02, H + 0.04, z1 + 0.02]);
  m.box('woodDark', [x0 - 0.02, H + 0.04, z0 - 0.02], [x1 + 0.02, H + 0.08, z0 + 0.02]); m.box('woodDark', [x0 - 0.02, H + 0.04, z1 - 0.02], [x1 + 0.02, H + 0.08, z1 + 0.02]);
  m.box('woodDark', [x0 - 0.02, H + 0.04, z0], [x0 + 0.02, H + 0.08, z1]); m.box('woodDark', [x1 - 0.02, H + 0.04, z0], [x1 + 0.02, H + 0.08, z1]);
  m.box('plant', [x0 + 0.1, H + 0.04, z0 + 0.1], [x1 - 0.1, H + 0.05, z1 - 0.1]); // green board
  m.box('metalDark', [x0 + 0.2, H + 0.05, z0 + 0.12], [x1 - 0.2, H + 0.06, z0 + 0.16]); m.box('metalDark', [x0 + 0.2, H + 0.05, z1 - 0.16], [x1 - 0.2, H + 0.06, z1 - 0.12]);
  m.box('metalDark', [x0 + 0.2, H + 0.05, z0 + 0.12], [x0 + 0.24, H + 0.06, z1 - 0.12]); m.box('metalDark', [x1 - 0.24, H + 0.05, z0 + 0.12], [x1 - 0.2, H + 0.06, z1 - 0.12]);
  [['carpet', 0.7], ['carpetBlue', 0.9], ['carpetWhite', 1.08]].forEach(([mat, x]) => m.box(mat, [x, H + 0.06, 0.22], [x + 0.16, H + 0.14, 0.34]));
  m.box('carpetDarker', [1.45, H + 0.05, 0.5], [1.7, H + 0.2, 0.7]); m.box('carpet', [1.5, H + 0.2, 0.55], [1.65, H + 0.25, 0.65]);
  return m;
}

function activityTable() {
  const m = new Model('activityTable');
  cy(m, 'woodDark', 0, 0.5, 0.05, 0.05, 8);
  cy(m, 'woodDark', 0, 0.05, 0.3, 0.3, 8);
  cy(m, 'carpetBlue', 0.5, 0.56, 0.4, 0.4, 10);
  cy(m, 'wood', 0.56, 0.62, 0.4, 0.4, 10);
  cy(m, 'carpetBlue', 0.5, 0.62, 0.0, 0.0, 3); // (empty stub)
  m.rod('metalDark', [0.3, 0.62, 0.4], [0.5, 0.75, 0.55], 0.015); m.rod('metalDark', [0.5, 0.75, 0.55], [0.7, 0.62, 0.6], 0.015);
  sph(m, 'carpet', 0.3, 0.68, 0.4, 0.04, 6, 3); sph(m, 'plant', 0.5, 0.78, 0.55, 0.04, 6, 3); sph(m, 'carpetWhite', 0.7, 0.66, 0.6, 0.04, 6, 3);
  m.box('carpet', [0.4, 0.62, 0.3], [0.5, 0.7, 0.38]); m.box('plant', [0.55, 0.62, 0.38], [0.64, 0.68, 0.46]);
  return m;
}

function nurseryRocker() {
  const m = new Model('nurseryRocker');
  for (const x of [0.12, 0.88]) { m.rod('woodDark', [x, 0.04, 0.1], [x, 0.08, 0.35], 0.06, 0.06); m.rod('woodDark', [x, 0.08, 0.35], [x, 0.08, 0.65], 0.06, 0.06); m.rod('woodDark', [x, 0.08, 0.65], [x, 0.04, 0.9], 0.06, 0.06); m.rod('wood', [x, 0.08, 0.3], [x, 0.5, 0.3], 0.05); m.rod('wood', [x, 0.08, 0.7], [x, 0.5, 0.7], 0.05); m.box('wood', [x - 0.04, 0.48, 0.25], [x + 0.04, 0.6, 0.78]); }
  m.box('carpet', [0.16, 0.38, 0.28], [0.84, 0.5, 0.78]);
  m.box('carpet', [0.16, 0.5, 0.2], [0.84, 1.0, 0.3]);
  m.box('carpetDarker', [0.28, 0.9, 0.2], [0.72, 1.05, 0.34]);
  m.box('carpetDarker', [0.16, 0.5, 0.3], [0.2, 0.62, 0.78]); m.box('carpetDarker', [0.8, 0.5, 0.3], [0.84, 0.62, 0.78]);
  return m;
}

function babyBouncer() {
  const m = new Model('babyBouncer');
  m.rod('metalDark', [0.2, 0.02, 0.2], [0.2, 0.02, 0.8], 0.04); m.rod('metalDark', [0.8, 0.02, 0.2], [0.8, 0.02, 0.8], 0.04);
  m.rod('metalDark', [0.2, 0.02, 0.2], [0.8, 0.02, 0.2], 0.04); m.rod('metalDark', [0.2, 0.02, 0.8], [0.8, 0.02, 0.8], 0.04);
  m.rod('metalDark', [0.2, 0.02, 0.8], [0.2, 0.2, 0.45], 0.035); m.rod('metalDark', [0.8, 0.02, 0.8], [0.8, 0.2, 0.45], 0.035);
  m.rod('metalDark', [0.2, 0.02, 0.2], [0.2, 0.22, 0.28], 0.035); m.rod('metalDark', [0.8, 0.02, 0.2], [0.8, 0.22, 0.28], 0.035);
  m.slab('carpetBlue', [0.18, 0.22, 0.75], [0.64, 0, 0], [0, 0.0, -0.45], [0, 0.04, 0]); // seat sling
  m.slab('carpetBlue', [0.18, 0.24, 0.32], [0.64, 0, 0], [0, 0.4, -0.12], [0, 0.04, 0.04]); // back
  m.box('carpetWhite', [0.24, 0.26, 0.4], [0.76, 0.3, 0.7]);
  m.box('carpet', [0.3, 0.42, 0.62], [0.7, 0.48, 0.72]);
  return m;
}

/** Kids' wardrobe (1 tile, wall-hugging) with two hinged doors, `anim:doorL` and `anim:doorR`. */
function kidsWardrobe() {
  const m = new Model('kidsWardrobe');
  const x0 = 0.08, x1 = 0.92, D = 0.45, H = 1.3;
  m.box('wood', [x0, 0, 0], [x1, H, 0.03]); m.box('wood', [x0, 0, 0], [x0 + 0.03, H, D]); m.box('wood', [x1 - 0.03, 0, 0], [x1, H, D]);
  m.box('wood', [x0, 0, 0], [x1, 0.05, D]); m.box('wood', [x0, H - 0.04, 0], [x1, H, D]);
  m.box('woodDark', [x0 - 0.01, H, 0], [x1 + 0.01, H + 0.04, D + 0.02]); // cornice
  m.box('carpetWhite', [x0 + 0.03, 0.05, 0.03], [x1 - 0.03, 0.4, D - 0.03]); // folded clothes (visible when open)
  m.rod('metalDark', [x0 + 0.03, 1.15, 0.2], [x1 - 0.03, 1.15, 0.2], 0.02);
  [['carpet', 0.2], ['carpetBlue', 0.4], ['plant', 0.62]].forEach(([mat, x]) => m.box(mat, [x, 0.7, 0.17], [x + 0.08, 1.12, 0.23]));
  const mid = (x0 + x1) / 2;
  const l = m.part('anim:doorL', [x0, 0, D]);
  l.box('carpetBlue', [x0, 0.04, D], [mid, H - 0.02, D + 0.03]); l.box('carpetDarker', [x0 + 0.05, 0.1, D + 0.03], [mid - 0.05, 0.4, D + 0.04]);
  l.rod('metalLight', [mid - 0.06, 0.6, D + 0.05], [mid - 0.06, 0.85, D + 0.05], 0.02);
  const r = m.part('anim:doorR', [x1, 0, D]);
  r.box('carpetBlue', [mid, 0.04, D], [x1, H - 0.02, D + 0.03]); r.box('carpetDarker', [mid + 0.05, 0.1, D + 0.03], [x1 - 0.05, 0.4, D + 0.04]);
  r.rod('metalLight', [mid + 0.06, 0.6, D + 0.05], [mid + 0.06, 0.85, D + 0.05], 0.02);
  return m;
}

function kidsBeanBag() {
  const m = new Model('kidsBeanBag');
  m.lathe('carpet', C, C, [[0.001, 0], [0.3, 0.02], [0.4, 0.18], [0.34, 0.34], [0.2, 0.45], [0.001, 0.48]], 10);
  cy(m, 'carpetDarker', 0.46, 0.5, 0.1, 0.1, 8); // top seam knot
  return m;
}

function puppetTheater() {
  const m = new Model('puppetTheater');
  const x0 = 0.1, x1 = 0.9, D = 0.4;
  m.box('wood', [x0, 0, 0.05], [x0 + 0.05, 1.4, D]); m.box('wood', [x1 - 0.05, 0, 0.05], [x1, 1.4, D]);
  m.box('carpetBlue', [x0, 0.6, 0.05], [x1, 1.4, 0.09]); // back wall with stage opening below
  m.box('carpetBlue', [x0, 0.0, D - 0.03], [x1, 0.55, D]); // front screen
  m.box('wood', [x0, 0.55, D - 0.04], [x1, 0.6, D + 0.02]);
  m.box('carpet', [x0, 1.2, D - 0.04], [x1, 1.4, D]); // valance
  m.box('carpetDarker', [x0 + 0.05, 1.0, D - 0.04], [x0 + 0.2, 1.2, D]); m.box('carpetDarker', [x1 - 0.2, 1.0, D - 0.04], [x1 - 0.05, 1.2, D]);
  m.box('wood', [x0, 0, 0.05], [x1, 0.04, D]);
  sph(m, 'carpetWhite', 0.4, 0.8, 0.25, 0.05, 6, 3); sph(m, 'carpet', 0.6, 0.78, 0.25, 0.05, 6, 3);
  return m;
}
// EXPORTS-BEGIN
export default {
  floorLampArc,
  floorLampTripod,
  floorLampTorchiere,
  floorLampReading,
  floorLampMidCentury,
  floorLampIndustrial,
  floorLampGlobe,
  floorLampPaper,
  floorLampTree,
  floorLampBrass,
  floorLampRattan,
  floorLampStack,
  floorLampUplight,
  floorLampCandelabra,
  lampBedside,
  lampDeskArticulated,
  lampBanker,
  lampCeramic,
  lampMushroom,
  lampGlobeTable,
  lampCubeTouch,
  lampTiffany,
  lampTaper,
  lampGourd,
  lampClamp,
  lampPharmacy,
  lampCrystal,
  sconceCandle,
  sconceSwingArm,
  sconceGlobe,
  sconceCone,
  sconceLantern,
  sconceArc,
  sconceBracketShade,
  pendantBell,
  pendantGlobe,
  chandelierTiered,
  chandelierWheel,
  pendantTrio,
  pendantRattan,
  lanternHanging,
  lanternFloor,
  lanternTable,
  candleSingle,
  candelabra,
  candleTrio,
  fairyLightStand,
  lavaLamp,
  saltLamp,
  neonSign,
  stringLights,
  tikiTorch,
  pathLight,
  lampPost,
  bollardLight,
  nightlightMoon,
  pendantCone,
  benchIron,
  picnicTable,
  parasolStanding,
  porchSwing,
  deckChair,
  gasGrill,
  planterTrough,
  birdBath,
  firePit,
  cribModern,
  cribCanopy,
  cradleRocking,
  changingDresser,
  toyBoxLidded,
  toyBoxBench,
  kidsBedHouse,
  kidsBedCar,
  kidsBunkLadder,
  kidsLoftBed,
  kidsDeskSmall,
  kidsChairSmall,
  kidsTableSet,
  playKitchen,
  dollhouse,
  rockingHorse,
  easelKids,
  kidsBookshelf,
  playTent,
  ballPit,
  trainTable,
  activityTable,
  nurseryRocker,
  babyBouncer,
  kidsWardrobe,
  kidsBeanBag,
  puppetTheater,
};
