// Original garden models (Milestone 9). Authored in metres inside the footprint, front at +z, y up, bottom on y = 0, like
// tools/furniture-extra. Kit materials: wood, woodDark, metal, metalDark, plant (bright foliage), glass (water) and the
// outdoor additions of ./kit.mjs. Crops are not part of the models: render/gardenView.ts draws them by growth stage.

import { Model, bloom, dome, rnd } from './kit.mjs';

const BLOOMS = ['carpet', 'blossomYellow', 'blossomPink', 'carpetWhite', 'blossomPurple', 'carpetBlue'];

/** Timber-framed flower bed, 2 x 1 tiles. */
function gardenFlowerbed() {
  const m = new Model('garden-flowerbed');
  m.box('wood', [0.04, 0, 0.1], [1.96, 0.3, 0.16]);
  m.box('wood', [0.04, 0, 0.84], [1.96, 0.3, 0.9]);
  m.box('woodDark', [0.04, 0, 0.16], [0.1, 0.3, 0.84]);
  m.box('woodDark', [1.9, 0, 0.16], [1.96, 0.3, 0.84]);
  m.box('soil', [0.1, 0.02, 0.16], [1.9, 0.26, 0.84]);
  for (let i = 0; i < 9; i++) {
    const x = 0.25 + i * 0.19, z = 0.3 + 0.4 * rnd(i, 1), h = 0.28 + 0.12 * rnd(i, 2);
    dome(m, x, z, 0.24, 0.17, h, i % 3 ? 'plant' : 'leafDark', 7);
    bloom(m, x + 0.03, 0.24 + h, z, BLOOMS[i % BLOOMS.length], 0.08);
  }
  for (let i = 0; i < 10; i++) bloom(m, 0.2 + 0.17 * i, 0.5, 0.2 + 0.6 * rnd(i, 5), BLOOMS[(i + 2) % BLOOMS.length], 0.05);
  return m;
}

/** Round stone-ringed flower bed, 1 x 1. */
function gardenFlowerbedRound() {
  const m = new Model('garden-flowerbed-round');
  const c = 0.5;
  m.lathe('stone', c, c, [[0.46, 0], [0.46, 0.2], [0.38, 0.2]], 12, { caps: false });
  m.lathe('stone', c, c, [[0.46, 0], [0.46, 0.2]], 12, { caps: false });
  m.cylY('soil', c, c, 0.02, 0.18, 0.4, 0.4, 12);
  dome(m, c, c, 0.16, 0.3, 0.32, 'leafDark', 9);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 0.12 + 0.18 * rnd(i, 3);
    bloom(m, c + Math.cos(a) * r, 0.34 + 0.12 * rnd(i, 4), c + Math.sin(a) * r, BLOOMS[i % BLOOMS.length], 0.07);
  }
  bloom(m, c, 0.52, c, 'blossomYellow', 0.08);
  return m;
}

/** A clipped hedge block, 1 x 1. */
function gardenHedge() {
  const m = new Model('garden-hedge');
  m.cylY('woodDark', 0.5, 0.5, 0, 0.1, 0.06, 0.06, 6);
  m.box('plant', [0.04, 0.08, 0.14], [0.96, 0.78, 0.86]);
  for (let i = 0; i < 4; i++) dome(m, 0.2 + i * 0.2, 0.5, 0.7, 0.2, 0.18, 'plant', 8);
  m.box('leafDark', [0.04, 0.08, 0.14], [0.96, 0.2, 0.86]);
  return m;
}

/** A topiary ball on a stem in a terracotta pot, 1 x 1. */
function gardenTopiary() {
  const m = new Model('garden-topiary');
  const c = 0.5;
  m.lathe('terracotta', c, c, [[0.2, 0], [0.26, 0.38], [0.29, 0.4]], 12);
  m.cylY('soil', c, c, 0.36, 0.4, 0.25, 0.25, 12);
  m.cylY('woodDark', c, c, 0.4, 1.0, 0.035, 0.03, 6);
  m.lathe('plant', c, c, [[0.0, 0.95], [0.22, 1.02], [0.33, 1.22], [0.22, 1.45], [0.0, 1.5]], 12);
  m.lathe('leafDark', c, c, [[0.0, 1.45], [0.14, 1.5], [0.0, 1.62]], 8);
  return m;
}

/** Raised vegetable patch with timber sides and tilled soil, 2 x 2. */
function gardenVegpatch() {
  const m = new Model('garden-vegpatch');
  m.box('wood', [0.08, 0, 0.1], [1.92, 0.34, 0.18]);
  m.box('wood', [0.08, 0, 1.82], [1.92, 0.34, 1.9]);
  m.box('woodDark', [0.08, 0, 0.18], [0.16, 0.34, 1.82]);
  m.box('woodDark', [1.84, 0, 0.18], [1.92, 0.34, 1.82]);
  for (const [x, z] of [[0.08, 0.1], [1.84, 0.1], [0.08, 1.82], [1.84, 1.82]]) m.box('woodDark', [x, 0, z], [x + 0.08, 0.4, z + 0.08]);
  m.box('soil', [0.16, 0.02, 0.18], [1.84, 0.28, 1.82]);
  for (let r = 0; r < 4; r++) m.box('soil', [0.2, 0.28, 0.3 + r * 0.4], [1.8, 0.34, 0.5 + r * 0.4]); // ridges
  m.rod('wood', [0.3, 0.34, 0.1], [0.3, 0.7, 0.1], 0.03); // marker stakes
  m.rod('wood', [1.7, 0.34, 0.1], [1.7, 0.7, 0.1], 0.03);
  return m;
}

/** A fruit tree with a broad crown, 2 x 2. */
function gardenFruitTree() {
  const m = new Model('garden-fruit-tree');
  const c = 1;
  m.lathe('woodDark', c, c, [[0.3, 0], [0.2, 0.2], [0.14, 0.7], [0.12, 1.4]], 8);
  m.rod('woodDark', [c, 1.1, c], [c - 0.45, 1.8, c + 0.2], 0.07);
  m.rod('woodDark', [c, 1.2, c], [c + 0.5, 1.85, c - 0.1], 0.07);
  dome(m, c, c, 1.55, 0.85, 1.25, 'plant', 10);
  dome(m, 0.55, 1.2, 1.45, 0.5, 0.85, 'plant', 9);
  dome(m, 1.45, 0.8, 1.5, 0.5, 0.85, 'leafDark', 9);
  dome(m, 1.4, 1.45, 1.4, 0.45, 0.8, 'plant', 9);
  dome(m, 0.7, 0.65, 1.7, 0.4, 0.7, 'leafDark', 9);
  m.cylY('stone', c, c, 0, 0.03, 0.55, 0.5, 12); // tree ring
  return m;
}

/** A timber herb planter box with soil, 1 x 1. */
function gardenHerbPlanter() {
  const m = new Model('garden-herb-planter');
  m.box('wood', [0.1, 0.08, 0.22], [0.9, 0.46, 0.78]);
  m.box('woodDark', [0.08, 0.44, 0.2], [0.92, 0.52, 0.26]); // rim: four boards around the soil
  m.box('woodDark', [0.08, 0.44, 0.74], [0.92, 0.52, 0.8]);
  m.box('woodDark', [0.08, 0.44, 0.26], [0.14, 0.52, 0.74]);
  m.box('woodDark', [0.86, 0.44, 0.26], [0.92, 0.52, 0.74]);
  m.box('soil', [0.14, 0.42, 0.26], [0.86, 0.5, 0.74]);
  for (const x of [0.16, 0.8]) m.box('woodDark', [x, 0, 0.26], [x + 0.06, 0.1, 0.74]);
  m.box('woodDark', [0.1, 0.18, 0.78], [0.9, 0.3, 0.81]);
  return m;
}

/** A garden pond with a stone rim, lily pads and reeds, 2 x 2. */
function gardenPond() {
  const m = new Model('garden-pond');
  const c = 1;
  m.lathe('stone', c, c, [[0.95, 0], [0.95, 0.14], [0.78, 0.14]], 16, { caps: false });
  for (let i = 0; i < 14; i++) { // rim stones
    const a = (i / 14) * Math.PI * 2, r = 0.86;
    m.cylY('stone', c + Math.cos(a) * r, c + Math.sin(a) * r, 0, 0.18 + 0.06 * rnd(i, 2), 0.11, 0.09, 6);
  }
  m.cylY('stoneDark', c, c, 0.01, 0.1, 0.78, 0.78, 16);
  m.cylY('water', c, c, 0.1, 0.12, 0.76, 0.76, 16);
  for (const [x, z, r] of [[0.9, 1.2, 0.17], [1.3, 0.85, 0.14], [1.15, 1.4, 0.12]]) {
    m.cylY('leafDark', x, z, 0.12, 0.135, r, r, 8);
  }
  bloom(m, 0.9, 0.17, 1.2, 'blossomPink', 0.07);
  for (let i = 0; i < 6; i++) m.rod('plant', [0.3 + i * 0.05, 0.12, 1.55 - i * 0.04], [0.3 + i * 0.05, 0.62 + 0.08 * (i % 3), 1.55 - i * 0.04], 0.03); // reeds
  m.lathe('stoneDark', 1.55, 0.45, [[0.18, 0.1], [0.12, 0.3], [0.0, 0.34]], 6);
  return m;
}

/** A stone bird bath with a little bird, 1 x 1. */
function gardenBirdbath() {
  const m = new Model('garden-birdbath');
  const c = 0.5;
  m.lathe('stone', c, c, [[0.2, 0], [0.2, 0.06], [0.1, 0.12], [0.07, 0.55]], 10);
  m.lathe('stone', c, c, [[0.07, 0.55], [0.3, 0.62], [0.33, 0.7], [0.28, 0.7], [0.0, 0.64]], 12, { caps: false });
  m.cylY('water', c, c, 0.64, 0.68, 0.27, 0.27, 12);
  m.lathe('carpetBlue', c + 0.15, c - 0.05, [[0.0, 0.69], [0.05, 0.72], [0.04, 0.78], [0.0, 0.8]], 6); // bird
  m.rod('carpetBlue', [c + 0.15, 0.74, c - 0.05], [c + 0.25, 0.77, c - 0.05], 0.015);
  return m;
}

/** A freestanding trellis with climbing roses, 1 x 1. */
function gardenTrellis() {
  const m = new Model('garden-trellis');
  for (const x of [0.1, 0.9]) m.rod('wood', [x, 0, 0.5], [x, 2.0, 0.5], 0.07);
  m.rod('wood', [0.1, 1.95, 0.5], [0.9, 1.95, 0.5], 0.07, 0.05);
  m.rod('wood', [0.1, 0.5, 0.5], [0.9, 0.5, 0.5], 0.04, 0.04);
  for (let i = 0; i < 5; i++) {
    const x0 = 0.12 + i * 0.13;
    m.rod('woodDark', [x0, 0.52, 0.5], [x0 + 0.26, 1.92, 0.5], 0.025, 0.025);
    m.rod('woodDark', [x0 + 0.26, 0.52, 0.5], [x0, 1.92, 0.5], 0.025, 0.025);
  }
  for (let i = 0; i < 14; i++) {
    const x = 0.16 + 0.68 * rnd(i, 1), y = 0.35 + 1.5 * rnd(i, 2), z = 0.5 + (i % 2 ? 0.05 : -0.05);
    dome(m, x, z, y, 0.1, 0.12, i % 3 ? 'plant' : 'leafDark', 6);
    if (i % 2) bloom(m, x, y + 0.13, z + 0.04, 'blossomPink', 0.055);
  }
  m.cylY('terracotta', 0.5, 0.5, 0, 0.3, 0.14, 0.12, 8);
  return m;
}

/** A hanging basket on a wall bracket (back at z = 0), 1 x 1. Mounted high on the wall. */
function gardenHangingBasket() {
  const m = new Model('garden-hanging-basket');
  m.rod('metalDark', [0.5, 0.5, 0.0], [0.5, 0.5, 0.45], 0.03); // bracket arm
  m.rod('metalDark', [0.5, 0.18, 0.0], [0.5, 0.5, 0.0], 0.03);
  m.rod('metalDark', [0.5, 0.2, 0.02], [0.5, 0.5, 0.45], 0.02);
  for (const dx of [-0.12, 0.12]) m.rod('metalDark', [0.5, 0.5, 0.45], [0.5 + dx, 0.18, 0.45 + (dx > 0 ? 0 : 0)], 0.012);
  m.lathe('terracotta', 0.5, 0.45, [[0.0, 0.1], [0.12, 0.12], [0.2, 0.26], [0.2, 0.3]], 10);
  dome(m, 0.5, 0.45, 0.28, 0.2, 0.18, 'plant', 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bloom(m, 0.5 + Math.cos(a) * 0.14, 0.4, 0.45 + Math.sin(a) * 0.14, BLOOMS[i % BLOOMS.length], 0.06);
    m.rod('plant', [0.5 + Math.cos(a) * 0.17, 0.3, 0.45 + Math.sin(a) * 0.17], [0.5 + Math.cos(a) * 0.2, 0.12, 0.45 + Math.sin(a) * 0.2], 0.025);
  }
  return m;
}

/** A slatted compost bin with a lid, 1 x 1. */
function gardenCompost() {
  const m = new Model('garden-compost');
  for (const [x, z] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) m.rod('woodDark', [x, 0, z], [x, 0.85, z], 0.07);
  for (let i = 0; i < 5; i++) {
    const y = 0.08 + i * 0.15;
    m.box('wood', [0.1, y, 0.07], [0.9, y + 0.11, 0.12]);
    m.box('wood', [0.1, y, 0.88], [0.9, y + 0.11, 0.93]);
    m.box('wood', [0.07, y, 0.1], [0.12, y + 0.11, 0.9]);
    m.box('wood', [0.88, y, 0.1], [0.93, y + 0.11, 0.9]);
  }
  m.box('soil', [0.14, 0.05, 0.14], [0.86, 0.6, 0.86]);
  dome(m, 0.5, 0.5, 0.55, 0.3, 0.14, 'soil', 8);
  m.slab('woodDark', [0.08, 0.86, 0.14], [0.84, 0, 0], [0, 0.04, 0], [0, 0, 0.72]);
  m.rod('metalDark', [0.45, 0.9, 0.5], [0.55, 0.9, 0.5], 0.05);
  return m;
}

/** A scarecrow on a pole, 1 x 1. */
function gardenScarecrow() {
  const m = new Model('garden-scarecrow');
  const c = 0.5;
  m.rod('wood', [c, 0, c], [c, 1.7, c], 0.07);
  m.rod('wood', [0.1, 1.3, c], [0.9, 1.3, c], 0.06);
  m.box('carpetBlue', [0.35, 0.75, 0.38], [0.65, 1.38, 0.62]); // shirt
  m.rod('carpetBlue', [0.35, 1.28, c], [0.14, 1.28, c], 0.14, 0.12);
  m.rod('carpetBlue', [0.65, 1.28, c], [0.86, 1.28, c], 0.14, 0.12);
  for (const x of [0.1, 0.9]) m.cylY('straw', x, c, 1.22, 1.3, 0.05, 0.07, 6);
  m.lathe('straw', c, c, [[0.0, 1.36], [0.14, 1.42], [0.14, 1.62], [0.0, 1.66]], 10); // head
  m.cylY('straw', c, c, 1.6, 1.63, 0.3, 0.3, 14); // hat brim
  m.cylY('woodDark', c, c, 1.62, 1.82, 0.14, 0.11, 10);
  for (const x of [0.4, 0.6]) m.rod('metalDark', [x, 1.5, 0.64], [x, 1.52, 0.64], 0.03);
  m.slab('straw', [0.38, 0.5, 0.4], [0.24, 0, 0], [0, 0.26, 0], [0, 0, 0.2]); // straw stuffing
  m.slab('carpet', [0.4, 1.38, 0.45], [0.2, 0, 0], [0, 0.03, 0], [0, 0, 0.1]); // neckerchief
  return m;
}

/** A garden path lantern on a post, 1 x 1. */
function gardenLantern() {
  const m = new Model('garden-lantern');
  const c = 0.5;
  m.lathe('metalDark', c, c, [[0.12, 0], [0.12, 0.06], [0.04, 0.1], [0.035, 0.85]], 8);
  m.box('metalDark', [c - 0.12, 0.85, c - 0.12], [c + 0.12, 0.89, c + 0.12]);
  m.box('lamp', [c - 0.09, 0.89, c - 0.09], [c + 0.09, 1.15, c + 0.09]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.rod('metalDark', [c + x * 0.1, 0.89, c + z * 0.1], [c + x * 0.1, 1.15, c + z * 0.1], 0.025);
  m.lathe('metalDark', c, c, [[0.16, 1.15], [0.12, 1.22], [0.0, 1.3]], 4, { phase: Math.PI / 4 });
  m.cylY('metalDark', c, c, 1.3, 1.34, 0.02, 0.02, 6);
  return m;
}

/** A garden gnome statue, 1 x 1. */
function gardenGnome() {
  const m = new Model('garden-gnome');
  const c = 0.5;
  m.cylY('stone', c, c, 0, 0.08, 0.2, 0.2, 10);
  m.lathe('carpetBlue', c, c, [[0.15, 0.08], [0.17, 0.3], [0.12, 0.42]], 10); // body
  m.lathe('carpetWhite', c, c + 0.05, [[0.0, 0.28], [0.1, 0.34], [0.1, 0.46], [0.0, 0.52]], 8); // beard
  m.lathe('blossomPink', c, c, [[0.0, 0.4], [0.075, 0.43], [0.075, 0.52], [0.0, 0.55]], 8); // face
  m.lathe('carpet', c, c, [[0.1, 0.51], [0.09, 0.57], [0.0, 0.8]], 8); // hat
  m.rod('metalDark', [c - 0.08, 0.22, c + 0.12], [c - 0.18, 0.3, c + 0.22], 0.03);
  m.lathe('metal', c - 0.2, c + 0.24, [[0.0, 0.3], [0.04, 0.34], [0.0, 0.4]], 6);
  return m;
}

/** A garden arbour with a bench, 2 x 1. */
function gardenArbour() {
  const m = new Model('garden-arbour');
  for (const x of [0.15, 1.85]) for (const z of [0.2, 0.8]) m.rod('wood', [x, 0, z], [x, 2.2, z], 0.09);
  for (const z of [0.2, 0.8]) m.rod('woodDark', [0.1, 2.15, z], [1.9, 2.15, z], 0.07, 0.07);
  for (let i = 0; i < 8; i++) {
    const x = 0.25 + i * 0.21;
    m.rod('wood', [x, 2.15, 0.15], [x, 2.15, 0.85], 0.05, 0.06);
  }
  for (const x of [0.15, 1.85]) { // side lattice
    for (let i = 0; i < 4; i++) {
      m.rod('woodDark', [x, 0.3 + i * 0.45, 0.22], [x, 0.7 + i * 0.45, 0.78], 0.025, 0.025);
      m.rod('woodDark', [x, 0.7 + i * 0.45, 0.22], [x, 0.3 + i * 0.45, 0.78], 0.025, 0.025);
    }
    for (let i = 0; i < 6; i++) dome(m, x, 0.25 + 0.5 * rnd(i, x), 0.4 + i * 0.3, 0.1, 0.13, 'plant', 6);
  }
  m.box('wood', [0.35, 0.44, 0.35], [1.65, 0.5, 0.75]); // bench seat
  m.box('woodDark', [0.35, 0.5, 0.28], [1.65, 0.95, 0.33]); // backrest
  for (const x of [0.4, 1.6]) m.rod('woodDark', [x, 0, 0.55], [x, 0.44, 0.55], 0.06);
  for (let i = 0; i < 7; i++) {
    const x = 0.3 + i * 0.23;
    dome(m, x, 0.5, 2.1, 0.15, 0.15, i % 2 ? 'plant' : 'leafDark', 6);
    if (i % 2 === 0) bloom(m, x, 2.3, 0.55, 'blossomPink', 0.06);
  }
  return m;
}

export const GARDEN_MODELS = {
  gardenFlowerbed, gardenFlowerbedRound, gardenHedge, gardenTopiary, gardenVegpatch, gardenFruitTree, gardenHerbPlanter, gardenPond,
  gardenBirdbath, gardenTrellis, gardenHangingBasket, gardenCompost, gardenScarecrow, gardenLantern, gardenGnome, gardenArbour,
};
