// Milestone 10 furniture, group "kitchen-bath-electronics": export default { modelName: builderFn, ... }.
// See dev/ds-tasks/m10f/AUTHORING.md. Content for these models: src/content/objectsM10/kitchen-bath-electronics.ts

import { Model } from '../kit.mjs';

/**
 * Retro tall fridge (exemplar: a hinged door and an interior). A rounded-top shell, a fixed freezer door on top and a
 * left-hinged fridge door below it. The door is the part `anim:door` (pivot on the hinge edge, the door swings towards +z
 * when the angle is negative); the lined cavity with glass shelves and food is `anim:interior`, shown only while open.
 */
function fridgeRetroTall() {
  const m = new Model('fridgeRetroTall');
  const W = 0.78, D = 0.7, T = 0.04, BASE = 0.06, TOP = 1.7, DOOR_T = 0.05, SPLIT = 1.27;
  // shell: back, sides, floor, ceiling and the divider between the freezer and the fridge compartment
  m.box('metalLight', [0, BASE, 0], [W, TOP, T]);
  m.box('metalLight', [0, BASE, T], [T, TOP, D]);
  m.box('metalLight', [W - T, BASE, T], [W, TOP, D]);
  m.box('metalLight', [T, BASE, T], [W - T, BASE + T, D]);
  m.box('metalLight', [T, TOP - T, T], [W - T, TOP, D]);
  m.box('metalLight', [T, SPLIT, T], [W - T, SPLIT + 0.04, D]);
  m.box('metalLight', [0.03, TOP, 0.03], [W - 0.03, TOP + 0.02, D - 0.02]); // rounded top, in two steps
  m.box('metalLight', [0.07, TOP + 0.02, 0.07], [W - 0.07, TOP + 0.04, D - 0.06]);
  m.box('metalDark', [0.04, 0, 0.04], [W - 0.04, BASE, D - 0.04]); // plinth
  // fixed freezer door with a chrome handle and badge
  m.box('metalLight', [0, SPLIT + 0.04, D], [W, TOP, D + DOOR_T]);
  m.box('metalDark', [0, SPLIT + 0.04, D + DOOR_T - 0.004], [W, SPLIT + 0.055, D + DOOR_T]); // seam
  m.rod('metal', [W - 0.08, 1.4, D + DOOR_T + 0.035], [W - 0.08, 1.6, D + DOOR_T + 0.035], 0.028);
  for (const y of [1.42, 1.58]) m.rod('metal', [W - 0.08, y, D + DOOR_T], [W - 0.08, y, D + DOOR_T + 0.035], 0.02);
  m.box('metal', [0.1, 1.55, D + DOOR_T], [0.28, 1.6, D + DOOR_T + 0.008]); // badge

  // the fridge door: hinged on the left edge, swings out to +z
  const door = m.part('anim:door', [0, 0, D + DOOR_T / 2]);
  door.box('metalLight', [0, BASE, D], [W, SPLIT, D + DOOR_T]);
  door.rod('metal', [W - 0.08, 0.55, D + DOOR_T + 0.035], [W - 0.08, 1.1, D + DOOR_T + 0.035], 0.028);
  for (const y of [0.6, 1.05]) door.rod('metal', [W - 0.08, y, D + DOOR_T], [W - 0.08, y, D + DOOR_T + 0.035], 0.02);
  for (const y of [0.42, 0.74, 1.04]) { // door bins on the inside, with bottles in them
    door.box('carpetWhite', [0.08, y, D - 0.05], [W - 0.08, y + 0.012, D]);
    door.box('carpetWhite', [0.08, y, D - 0.05], [W - 0.08, y + 0.05, D - 0.04]);
  }
  for (const [x, y, mat] of [[0.16, 0.42, 'plant'], [0.26, 0.42, 'carpetBlue'], [0.5, 0.74, 'carpet'], [0.6, 0.74, 'wood'], [0.2, 1.04, 'carpetBlue']]) {
    door.cylY(mat, x, D - 0.025, y + 0.012, y + 0.17, 0.02, 0.02, 8);
  }

  // cavity lining, glass shelves, crispers and food: visible only while the door is open
  const inside = m.part('anim:interior');
  const L = 0.012, y0 = BASE + T, y1 = SPLIT;
  inside.box('carpetWhite', [T, y0, T], [W - T, y1, T + L]); // back
  inside.box('carpetWhite', [T, y0, T], [T + L, y1, D]); // sides
  inside.box('carpetWhite', [W - T - L, y0, T], [W - T, y1, D]);
  inside.box('carpetWhite', [T, y0, T], [W - T, y0 + L, D]); // floor
  inside.box('carpetWhite', [T, y1 - L, T], [W - T, y1, D]); // ceiling
  inside.box('metalLight', [0.2, y1 - 0.03, 0.2], [W - 0.2, y1 - 0.018, 0.32]); // light
  const x0 = T + L, x1 = W - T - L;
  for (const y of [0.46, 0.78, 1.08]) inside.box('glass', [x0, y, T + L], [x1, y + 0.012, D - 0.08]); // shelves
  for (const [a, b] of [[x0, W / 2 - 0.01], [W / 2 + 0.01, x1]]) inside.box('glass', [a, y0 + L, 0.14], [b, y0 + 0.2, D - 0.08]); // crispers
  const food = (mat, a, y, c, b, h, d) => inside.box(mat, [a, y, c], [b, y + h, c + d]);
  food('plant', x0 + 0.04, y0 + L, 0.2, x0 + 0.16, 0.12, 0.14); // lettuce and tomatoes in the crispers
  food('carpet', x0 + 0.2, y0 + L, 0.24, x0 + 0.3, 0.07, 0.07);
  food('carpet', W / 2 + 0.06, y0 + L, 0.22, W / 2 + 0.16, 0.08, 0.08);
  food('plant', W / 2 + 0.2, y0 + L, 0.26, W / 2 + 0.3, 0.1, 0.1);
  food('carpetWhite', 0.14, 0.472, 0.2, 0.22, 0.2, 0.08); // milk
  food('carpetBlue', 0.14, 0.672, 0.2, 0.22, 0.03, 0.08);
  food('wood', 0.3, 0.472, 0.18, 0.48, 0.09, 0.2); // bread
  food('carpet', 0.54, 0.472, 0.24, 0.62, 0.12, 0.12); // jam
  inside.cylY('plant', 0.2, 0.3, 0.792, 1.0, 0.032, 0.032, 8);
  inside.cylY('carpetBlue', 0.3, 0.32, 0.792, 0.95, 0.03, 0.03, 8);
  food('wood', 0.42, 0.792, 0.22, 0.58, 0.07, 0.14); // cheese
  food('carpetWhite', 0.12, 1.092, 0.2, 0.34, 0.05, 0.16); // eggs
  food('carpet', 0.42, 1.092, 0.22, 0.52, 0.1, 0.1);
  return m;
}

/**
 * Thin laptop (exemplar: a screen). The open lid leans back about 24 degrees; the picture is the part `anim:screen`, a thin
 * slab on the lid's front face, so the game measures the picture rectangle from it (ObjectDef.screen).
 */
function laptopThin() {
  const m = new Model('laptopThin');
  const W = 0.32, D = 0.22, Z0 = 0.02, BASE_H = 0.016, HINGE = 0.03;
  m.box('metalDark', [0, 0, Z0], [W, BASE_H, Z0 + D]); // base
  m.box('metalMedium', [0.02, BASE_H, Z0 + 0.03], [W - 0.02, BASE_H + 0.003, Z0 + 0.13]); // keyboard deck
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) {
    const x = 0.035 + c * 0.0285, z = Z0 + 0.038 + r * 0.021;
    m.box('metalLight', [x, BASE_H + 0.003, z], [x + 0.024, BASE_H + 0.007, z + 0.017]); // keys
  }
  m.box('metalMedium', [W / 2 - 0.05, BASE_H, Z0 + 0.15], [W / 2 + 0.05, BASE_H + 0.002, Z0 + 0.2]); // trackpad
  // lid: leans back by `tilt`; `up` runs along the lid, `n` is the front normal (0, sin, cos)
  const tilt = (24 * Math.PI) / 180, up = [0, Math.cos(tilt), -Math.sin(tilt)], n = [0, Math.sin(tilt), Math.cos(tilt)];
  const H = 0.21, TH = 0.012, hinge = [0, BASE_H, HINGE + Z0];
  m.slab('metalDark', hinge, [W, 0, 0], up.map((v) => v * H), n.map((v) => v * TH)); // lid shell
  const bez = 0.012, face = hinge.map((v, i) => v + n[i] * TH);
  const screen = m.part('anim:screen');
  screen.slab('metalMedium', [face[0] + bez, face[1] + up[1] * bez, face[2] + up[2] * bez],
    [W - 2 * bez, 0, 0], up.map((v) => v * (H - 2 * bez)), n.map((v) => v * 0.002));
  return m;
}


// ---------------------------------------------------------------------------------------------------------------------
// Milestone 10 designs. Every function below registers one model in EXTRA; the default export is at the end of the file.
// Conventions: metres, x = width from 0, z = depth from 0 (back) to the front at +z, y up from 0. Hinged parts: left hinge =
// pivot on the left edge and a NEGATIVE angle about y, right hinge = pivot on the right edge and a POSITIVE angle; oven and
// dishwasher doors hinge at the bottom edge and turn about x by a POSITIVE angle; lids hinge at the back, about x, NEGATIVE.
// ---------------------------------------------------------------------------------------------------------------------

const EXTRA = {};
const def = (name, build) => { EXTRA[name] = () => { const m = new Model(name); build(m); return m; }; };

const T = 0.04; // wall thickness of cabinets and appliances

/** Open-front carcass: back, two sides, floor and ceiling. */
function carcass(m, mat, x0, y0, z0, x1, y1, z1, t = T) {
  m.box(mat, [x0, y0, z0], [x1, y1, z0 + t]);
  m.box(mat, [x0, y0, z0 + t], [x0 + t, y1, z1]);
  m.box(mat, [x1 - t, y0, z0 + t], [x1, y1, z1]);
  m.box(mat, [x0 + t, y0, z0 + t], [x1 - t, y0 + t, z1]);
  m.box(mat, [x0 + t, y1 - t, z0 + t], [x1 - t, y1, z1]);
}

/** Thin lining of a cavity: back, sides, floor and ceiling. */
function lining(p, x0, y0, x1, y1, z0, z1, mat = 'carpetWhite', L = 0.012) {
  p.box(mat, [x0, y0, z0], [x1, y1, z0 + L]);
  p.box(mat, [x0, y0, z0], [x0 + L, y1, z1]);
  p.box(mat, [x1 - L, y0, z0], [x1, y1, z1]);
  p.box(mat, [x0, y0, z0], [x1, y0 + L, z1]);
  p.box(mat, [x0, y1 - L, z0], [x1, y1, z1]);
}

const FOODS = [
  (p, x, y, z) => p.cylY('plant', x, z, y, y + 0.16, 0.03, 0.03, 8), // bottle
  (p, x, y, z) => p.box('carpet', [x - 0.05, y, z - 0.05], [x + 0.05, y + 0.08, z + 0.05]), // tomatoes, jam
  (p, x, y, z) => p.box('carpetWhite', [x - 0.04, y, z - 0.03], [x + 0.04, y + 0.12, z + 0.03]), // milk
  (p, x, y, z) => p.box('wood', [x - 0.07, y, z - 0.07], [x + 0.07, y + 0.06, z + 0.07]), // cheese, bread
  (p, x, y, z) => p.cylY('carpetBlue', x, z, y, y + 0.1, 0.04, 0.04, 8), // tin
];

/** A few foods standing on a shelf top at height y, centred at depth z. */
function stockShelf(p, x0, x1, y, z, seed = 0, n = 0) {
  const count = n || Math.max(2, Math.min(5, Math.floor((x1 - x0) / 0.13)));
  for (let i = 0; i < count; i++) FOODS[(i + seed) % FOODS.length](p, x0 + 0.07 + (count === 1 ? 0 : (i * (x1 - x0 - 0.14)) / (count - 1)), y, z + (i % 2 ? 0.05 : -0.04));
}

/** Door face: panel + vertical handle (or a horizontal one on drawers). `tgt` is the model (fixed) or the part (moving). */
function doorFace(tgt, o, d) {
  const D = o.D, DT = o.DT ?? 0.05, body = d.mat ?? o.body ?? 'metalLight';
  tgt.box(body, [d.x0, d.y0, D], [d.x1, d.y1, D + DT]);
  const h = d.y1 - d.y0;
  if (d.drawer) {
    const cx = (d.x0 + d.x1) / 2, y = d.y1 - 0.07;
    tgt.rod('metal', [cx - 0.16, y, D + DT + 0.035], [cx + 0.16, y, D + DT + 0.035], 0.026);
    for (const x of [cx - 0.16, cx + 0.16]) tgt.rod('metal', [x, y, D + DT], [x, y, D + DT + 0.035], 0.02);
  } else if (!d.noHandle) {
    const x = d.hinge === 'L' ? d.x1 - 0.07 : d.x0 + 0.07, len = Math.min(0.5, h * 0.5), c = d.y0 + h * (h > 0.8 ? 0.58 : 0.5);
    tgt.rod('metal', [x, c - len / 2, D + DT + 0.035], [x, c + len / 2, D + DT + 0.035], 0.028);
    for (const y of [c - len / 2 + 0.04, c + len / 2 - 0.04]) tgt.rod('metal', [x, y, D + DT], [x, y, D + DT + 0.035], 0.02);
  }
}

/** Door bins inside a moving door: shelves with a lip and a few bottles. */
function doorBins(door, o, d, ys) {
  const D = o.D, x0 = d.x0 + 0.07, x1 = d.x1 - 0.07;
  ys.forEach((y, i) => {
    door.box('carpetWhite', [x0, y, D - 0.05], [x1, y + 0.012, D]);
    door.box('carpetWhite', [x0, y, D - 0.05], [x1, y + 0.05, D - 0.04]);
    const n = Math.max(1, Math.floor((x1 - x0) / 0.12));
    for (let k = 0; k < n; k++) door.cylY(['plant', 'carpetBlue', 'carpet', 'wood'][(i + k) % 4], x0 + 0.06 + (k * (x1 - x0 - 0.12)) / Math.max(1, n - 1), D - 0.025, y + 0.012, y + 0.15 + (k % 2) * 0.03, 0.02, 0.02, 8);
  });
}

/**
 * A fridge from a layout: `doors` are boxes on the front plane ({x0,x1,y0,y1,hinge:'L'|'R', part:'door'|'door2'|'drawer'|null,
 * drawer:true}); a part name makes the door move (hinged on `hinge`, or a sliding drawer). `cav` lists the cavities shown inside
 * `anim:interior` while a door is open (shelves, food); a glass-door fridge sets `glass` and keeps its contents in the body.
 */
function fridgeModel(m, o) {
  const { W, D, H } = o, base = o.base ?? 0.06, DT = o.DT ?? 0.05, body = o.body ?? 'metalLight';
  carcass(m, body, 0, base, 0, W, H, D);
  if (base > 0.04) m.box('metalDark', [0.04, 0, 0.04], [W - 0.04, base, D - 0.04]);
  else for (const x of [0.04, W - 0.08]) for (const z of [0.04, D - 0.08]) m.box('metalDark', [x, 0, z], [x + 0.04, base, z + 0.04]); // feet
  for (const y of o.dividers ?? []) m.box(body, [T, y, T], [W - T, y + 0.04, D]);
  if (o.vdivider) m.box(body, [W / 2 - 0.02, base + T, T], [W / 2 + 0.02, H - T, D]);
  if (o.roundTop) {
    m.box(body, [0.03, H, 0.03], [W - 0.03, H + 0.02, D - 0.02]);
    m.box(body, [0.07, H + 0.02, 0.07], [W - 0.07, H + 0.04, D - 0.06]);
  }
  if (o.worktop) m.box('metal', [-0.01, H, -0.01], [W + 0.01, H + 0.04, D + 0.02]);
  for (const d of o.doors) {
    let tgt = m;
    if (d.part) {
      const pivot = d.drawer ? [(d.x0 + d.x1) / 2, d.y0, D] : [d.hinge === 'L' ? d.x0 : d.x1, d.y0, D + DT / 2];
      tgt = m.part(`anim:${d.part}`, pivot);
    }
    if (o.glass && !d.drawer) { // frame with an open middle: the contents stay visible behind it
      const f = 0.05;
      tgt.box(d.frame ?? 'metalDark', [d.x0, d.y0, D], [d.x1, d.y0 + f, D + DT]);
      tgt.box(d.frame ?? 'metalDark', [d.x0, d.y1 - f, D], [d.x1, d.y1, D + DT]);
      tgt.box(d.frame ?? 'metalDark', [d.x0, d.y0, D], [d.x0 + f, d.y1, D + DT]);
      tgt.box(d.frame ?? 'metalDark', [d.x1 - f, d.y0, D], [d.x1, d.y1, D + DT]);
      tgt.box('glass', [d.x0 + f, d.y0 + f, D + DT / 2 - 0.004], [d.x1 - f, d.y0 + f + 0.03, D + DT / 2 + 0.004]); // reflection strips
      tgt.box('glass', [d.x0 + f, d.y1 - f - 0.12, D + DT / 2 - 0.004], [d.x1 - f, d.y1 - f - 0.09, D + DT / 2 + 0.004]);
      const x = d.hinge === 'L' ? d.x1 - 0.02 : d.x0 + 0.02, c = (d.y0 + d.y1) / 2;
      tgt.rod('metal', [x, c - 0.25, D + DT + 0.03], [x, c + 0.25, D + DT + 0.03], 0.026);
    } else doorFace(tgt, o, d);
    if (d.part && d.bins) doorBins(tgt, o, d, d.bins);
    if (d.extra) d.extra(tgt);
    if (d.part && d.drawer) { // the bin behind a freezer drawer front
      const x0 = d.x0 + 0.05, x1 = d.x1 - 0.05, z0 = D - (d.depth ?? 0.42);
      tgt.box('carpetWhite', [x0, d.y0 + 0.04, z0], [x1, d.y0 + 0.055, D]);
      tgt.box('carpetWhite', [x0, d.y0 + 0.04, z0], [x1, d.y1 - 0.05, z0 + 0.012]);
      tgt.box('carpetWhite', [x0, d.y0 + 0.04, z0], [x0 + 0.012, d.y1 - 0.05, D]);
      tgt.box('carpetWhite', [x1 - 0.012, d.y0 + 0.04, z0], [x1, d.y1 - 0.05, D]);
      stockShelf(tgt, x0, x1, d.y0 + 0.055, D - 0.22, 2, 3);
    }
  }
  const cavs = o.cav ?? [];
  if (cavs.length && !o.glass) {
    const inside = m.part('anim:interior');
    cavs.forEach((c, ci) => {
      lining(inside, c.x0, c.y0, c.x1, c.y1, T, D);
      inside.box('metalLight', [(c.x0 + c.x1) / 2 - 0.1, c.y1 - 0.03, 0.18], [(c.x0 + c.x1) / 2 + 0.1, c.y1 - 0.018, 0.3]); // light
      stockShelf(inside, c.x0 + 0.012, c.x1 - 0.012, c.y0 + 0.012, D * 0.55, ci);
      (c.shelves ?? []).forEach((y, i) => {
        inside.box('glass', [c.x0 + 0.012, y, T + 0.012], [c.x1 - 0.012, y + 0.012, D - 0.08]);
        stockShelf(inside, c.x0 + 0.012, c.x1 - 0.012, y + 0.012, D * 0.5, i + ci + 1);
      });
    });
  } else if (o.glass) { // always-visible contents behind the glass
    for (const c of cavs) {
      lining(m, c.x0, c.y0, c.x1, c.y1, T, D - 0.02, c.lining ?? 'carpetWhite');
      for (const y of c.shelves ?? []) {
        m.box(c.shelfMat ?? 'glass', [c.x0 + 0.012, y, T + 0.012], [c.x1 - 0.012, y + 0.012, D - 0.1]);
        if (c.bottles) for (let k = 0; k < c.bottles; k++) {
          const bx = c.x0 + 0.1 + (k * (c.x1 - c.x0 - 0.2)) / Math.max(1, c.bottles - 1);
          m.cyl(['plant', 'carpetDarker', 'wood'][k % 3], [bx, y + 0.052, 0.14], [bx, y + 0.052, D - 0.14], 0.036, 8);
        }
        else stockShelf(m, c.x0 + 0.012, c.x1 - 0.012, y + 0.012, D * 0.5, 1);
      }
    }
  }
}

def('fridgeTopFreezer', (m) => {
  const W = 0.66, D = 0.66, H = 1.56, SPLIT = 1.12;
  fridgeModel(m, {
    W, D, H, dividers: [SPLIT - 0.04],
    doors: [
      { x0: 0, x1: W, y0: 0.06, y1: SPLIT - 0.005, hinge: 'R', part: 'door', bins: [0.4, 0.72] },
      { x0: 0, x1: W, y0: SPLIT + 0.005, y1: H, hinge: 'R' },
    ],
    cav: [{ x0: T, x1: W - T, y0: 0.06 + T, y1: SPLIT - 0.04, shelves: [0.5, 0.82] }],
  });
  m.box('metalDark', [0.06, H - 0.1, D + 0.045], [0.2, H - 0.07, D + 0.052]); // badge
});

def('fridgeTwinDoor', (m) => {
  const W = 0.92, D = 0.72, H = 1.78;
  fridgeModel(m, {
    W, D, H, body: 'metal', vdivider: true,
    doors: [
      { x0: 0, x1: W / 2 - 0.005, y0: 0.06, y1: H - 0.02, hinge: 'L', part: 'door', bins: [0.4, 0.75, 1.1],
        extra: (t) => { // ice and water dispenser
          t.box('metalDark', [0.1, 1.05, D + 0.05], [0.3, 1.4, D + 0.058]);
          t.box('glass', [0.14, 1.1, D + 0.058], [0.26, 1.18, D + 0.064]);
        } },
      { x0: W / 2 + 0.005, x1: W, y0: 0.06, y1: H - 0.02, hinge: 'R', part: 'door2', bins: [0.4, 0.75, 1.1] },
    ],
    cav: [
      { x0: T, x1: W / 2 - 0.02, y0: 0.06 + T, y1: H - T, shelves: [0.48, 0.82, 1.16, 1.5] },
      { x0: W / 2 + 0.02, x1: W - T, y0: 0.06 + T, y1: H - T, shelves: [0.48, 0.82, 1.16, 1.5] },
    ],
  });
});

def('fridgeFrenchDoor', (m) => {
  const W = 0.9, D = 0.74, H = 1.8, SPLIT = 0.62;
  fridgeModel(m, {
    W, D, H, body: 'metalMedium', dividers: [SPLIT - 0.04], roundTop: true,
    doors: [
      { x0: 0, x1: W / 2 - 0.005, y0: SPLIT + 0.005, y1: H, hinge: 'L', part: 'door', bins: [1.0, 1.3] },
      { x0: W / 2 + 0.005, x1: W, y0: SPLIT + 0.005, y1: H, hinge: 'R', part: 'door2', bins: [1.0, 1.3] },
      { x0: 0, x1: W, y0: 0.06, y1: SPLIT - 0.005, drawer: true, part: 'drawer', depth: 0.5 },
    ],
    cav: [{ x0: T, x1: W - T, y0: SPLIT, y1: H - T, shelves: [0.95, 1.28, 1.6] }],
  });
});

def('fridgeMini', (m) => {
  const W = 0.5, D = 0.5, H = 0.55;
  fridgeModel(m, {
    W, D, H, base: 0.03, body: 'carpetBlue', DT: 0.04,
    doors: [{ x0: 0, x1: W, y0: 0.03, y1: H, hinge: 'L', part: 'door', bins: [0.3] }],
    cav: [{ x0: T, x1: W - T, y0: 0.03 + T, y1: H - T, shelves: [0.2, 0.37] }],
  });
  m.box('metalLight', [0.06, 0.5, 0.5 + 0.035], [0.16, 0.52, 0.5 + 0.042]); // badge
});

def('fridgeCommercial', (m) => {
  const W = 0.78, D = 0.74, H = 1.92;
  fridgeModel(m, {
    W, D, H, body: 'metal', glass: true, roundTop: false,
    doors: [{ x0: 0, x1: W, y0: 0.06, y1: H - 0.18, hinge: 'R', part: 'door', frame: 'metalDark' }],
    cav: [{ x0: T, x1: W - T, y0: 0.06 + T, y1: H - 0.2, shelves: [0.45, 0.8, 1.15, 1.5] }],
  });
  m.box('metalDark', [0.04, H - 0.17, D - 0.01], [W - 0.04, H - 0.01, D + 0.05]); // lit sign box on top of the door
  m.box('glass', [0.1, H - 0.14, D + 0.05], [W - 0.1, H - 0.04, D + 0.056]);
  m.box('metalLight', [0.2, H - 0.01, 0.2], [W - 0.2, H, D - 0.2]);
});

def('fridgeBottomFreezer', (m) => {
  const W = 0.68, D = 0.68, H = 1.76, SPLIT = 0.5;
  fridgeModel(m, {
    W, D, H, body: 'metalDark', dividers: [SPLIT - 0.04],
    doors: [
      { x0: 0, x1: W, y0: SPLIT + 0.005, y1: H, hinge: 'L', part: 'door', bins: [0.8, 1.1, 1.4] },
      { x0: 0, x1: W, y0: 0.06, y1: SPLIT - 0.005, drawer: true, part: 'drawer', depth: 0.44 },
    ],
    cav: [{ x0: T, x1: W - T, y0: SPLIT, y1: H - T, shelves: [0.78, 1.08, 1.38] }],
  });
});

def('fridgeUnderCounter', (m) => {
  const W = 0.62, D = 0.62, H = 0.86;
  fridgeModel(m, {
    W, D, H, body: 'metalLight', worktop: true, base: 0.07,
    doors: [{ x0: 0, x1: W, y0: 0.07, y1: H, hinge: 'L', part: 'door', bins: [0.3, 0.55] }],
    cav: [{ x0: T, x1: W - T, y0: 0.07 + T, y1: H - T, shelves: [0.32, 0.56] }],
  });
});

def('wineCooler', (m) => {
  const W = 0.56, D = 0.56, H = 0.88;
  fridgeModel(m, {
    W, D, H, body: 'metalDark', glass: true, base: 0.05, DT: 0.04,
    doors: [{ x0: 0, x1: W, y0: 0.05, y1: H, hinge: 'R', part: 'door', frame: 'metalDark' }],
    cav: [{ x0: T, x1: W - T, y0: 0.05 + T, y1: H - T, shelves: [0.18, 0.36, 0.54, 0.72], bottles: 4, shelfMat: 'wood', lining: 'metalMedium' }],
  });
});


// --- ranges, ovens, microwaves, hoods -------------------------------------------------------------------------------

const knob = (p, mat, x, y, z, r = 0.022, len = 0.04) => p.cyl(mat, [x, y, z], [x, y, z + len], r, 8);

/** Oven door on a bottom hinge (`anim:<name>`, turns about x by a positive angle). */
function ovenDoor(m, name, o) {
  const { x0, x1, y0, y1, z } = o, mat = o.mat ?? 'metalLight';
  const door = m.part(`anim:${name}`, [(x0 + x1) / 2, y0, z + 0.02]);
  door.box(mat, [x0, y0, z], [x1, y1, z + 0.04]);
  if (o.window !== false) door.box('metalDark', [x0 + 0.07, y0 + 0.07, z + 0.04], [x1 - 0.07, y1 - (o.window === 'high' ? 0.15 : 0.12), z + 0.046]);
  if (o.trim) door.box(o.trim, [x0, y1 - 0.045, z + 0.04], [x1, y1, z + 0.05]);
  const hy = y1 - 0.055;
  door.rod('metal', [x0 + 0.05, hy, z + 0.085], [x1 - 0.05, hy, z + 0.085], 0.026);
  for (const x of [x0 + 0.05, x1 - 0.05]) door.rod('metal', [x, hy, z + 0.04], [x, hy, z + 0.085], 0.02);
}

/** Oven cavity shown while a door is open: dark enamel lining, rack and a tray. */
function ovenCavity(p, x0, x1, y0, y1, z0, z1) {
  lining(p, x0, y0, x1, y1, z0, z1, 'metalMedium', 0.012);
  for (const y of [y0 + 0.1, y0 + 0.2].filter((v) => v < y1 - 0.05)) p.box('metalLight', [x0 + 0.012, y, z0 + 0.012], [x1 - 0.012, y + 0.01, z1 - 0.02]);
  p.box('metalDark', [x0 + 0.06, y0 + 0.1 + 0.01, z0 + 0.1], [x1 - 0.06, y0 + 0.1 + 0.025, z1 - 0.1]);
  p.box('wood', [x0 + 0.12, y0 + 0.1 + 0.025, z0 + 0.16], [x1 - 0.12, y0 + 0.1 + 0.06, z1 - 0.18]); // a loaf on the tray
}

/**
 * A freestanding range: carcass, hob, knobs, one or two bottom-hinged oven doors (`anim:oven`, `anim:oven2`, both the
 * 'oven' role) and the cavity (`anim:interior`).
 */
function rangeModel(m, o) {
  const { W, D, H = 0.92 } = o, base = o.base ?? 0.07, body = o.body ?? 'metalLight', topY = H - 0.04;
  const dY0 = o.doorY0 ?? 0.2, dY1 = o.doorY1 ?? 0.7, doors = o.doors ?? [[0.04, W - 0.04]];
  carcass(m, body, 0, base, 0, W, topY, D);
  m.box('metalDark', [0.04, 0, 0.04], [W - 0.04, base, D - 0.04]);
  m.box(o.hobPlate ?? 'metalDark', [-0.005, topY, -0.005], [W + 0.005, H, D + 0.01]);
  if (doors.length > 1) m.box(body, [W / 2 - 0.02, dY0, T], [W / 2 + 0.02, dY1, D]);
  m.box(o.strip ?? body, [0, dY1 + 0.01, D], [W, topY, D + 0.03]); // control strip
  m.box(o.drawer ?? body, [0, base, D], [W, dY0 - 0.01, D + 0.03]); // storage drawer front
  m.rod('metal', [0.1, (base + dY0) / 2 + 0.03, D + 0.07], [W - 0.1, (base + dY0) / 2 + 0.03, D + 0.07], 0.024);
  for (const x of [0.1, W - 0.1]) m.rod('metal', [x, (base + dY0) / 2 + 0.03, D + 0.03], [x, (base + dY0) / 2 + 0.03, D + 0.07], 0.018);
  const kn = o.knobs ?? 5, ky = (dY1 + topY) / 2;
  for (let i = 0; i < kn; i++) knob(m, o.knobMat ?? 'metalDark', 0.1 + (i * (W - 0.2)) / Math.max(1, kn - 1), ky, D + 0.03);
  // hob
  const cols = o.cols ?? [0.27, 0.73], rows = o.rows ?? [0.3, 0.7];
  for (const rz of rows) for (const cx of cols) {
    const x = cx * W, z = rz * D;
    if (o.hobStyle === 'induction') m.cylY('metalMedium', x, z, H, H + 0.004, 0.09, 0.09, 12);
    else if (o.hobStyle === 'lids') { m.cylY('metal', x, z, H, H + 0.03, 0.2, 0.2, 12); m.cylY('metalDark', x, z, H + 0.03, H + 0.04, 0.03, 0.03, 8); }
    else {
      m.cylY('metalMedium', x, z, H, H + 0.014, 0.075, 0.075, 8);
      m.cylY('metal', x, z, H + 0.014, H + 0.04, 0.04, 0.04, 8);
      m.rod('metalDark', [x - 0.1, H + 0.05, z], [x + 0.1, H + 0.05, z], 0.022);
      m.rod('metalDark', [x, H + 0.05, z - 0.1], [x, H + 0.05, z + 0.1], 0.022);
    }
  }
  if (o.backsplash) { // retro backguard with a clock and dials
    m.box(body, [0, H, 0], [W, H + 0.2, 0.08]);
    m.box('metal', [0, H + 0.2, 0], [W, H + 0.215, 0.09]);
    m.cyl('metalDark', [W / 2, H + 0.1, 0.08], [W / 2, H + 0.1, 0.1], 0.05, 10);
    for (const x of [0.2, W - 0.2]) knob(m, 'carpet', x, H + 0.1, 0.08, 0.025, 0.03);
  }
  doors.forEach(([x0, x1], i) => ovenDoor(m, i ? 'oven2' : 'oven', { x0, x1, y0: dY0, y1: dY1, z: D, mat: o.doorMat ?? body, trim: o.doorTrim, window: o.window }));
  const inside = m.part('anim:interior');
  doors.forEach(([x0, x1]) => ovenCavity(inside, x0 + 0.01 > T ? x0 : T, x1, dY0 + 0.005, dY1 - 0.01, T, D));
}

def('rangeSteelGas', (m) => rangeModel(m, { W: 0.9, D: 0.72, body: 'metal', strip: 'metalDark', knobs: 5, cols: [0.25, 0.75], rows: [0.3, 0.72], doorTrim: 'metalDark' }));

def('rangeInduction', (m) => rangeModel(m, {
  W: 0.9, D: 0.68, H: 0.9, body: 'metalDark', strip: 'metalMedium', hobPlate: 'metalDark', hobStyle: 'induction', knobs: 4, knobMat: 'metalLight',
  cols: [0.27, 0.73], rows: [0.3, 0.7], doorMat: 'metalMedium',
}));

def('rangeCottage', (m) => {
  const W = 1.4, D = 0.76;
  rangeModel(m, {
    W, D, H: 0.95, body: 'metalDark', hobPlate: 'metalDark', hobStyle: 'lids', cols: [0.27, 0.73], rows: [0.5], knobs: 0, doorY0: 0.16, doorY1: 0.62,
    doors: [[0.05, W / 2 - 0.03], [W / 2 + 0.03, W - 0.05]], doorMat: 'metalDark', doorTrim: 'metal', window: false, strip: 'metalDark',
  });
  // towel rail along the front on two brackets
  m.rod('metal', [0.05, 0.78, D + 0.12], [W - 0.05, 0.78, D + 0.12], 0.025);
  for (const x of [0.05, W - 0.05]) m.rod('metal', [x, 0.78, D + 0.03], [x, 0.78, D + 0.12], 0.02);
  for (const x of [0.4, 1.0]) m.box('metal', [x - 0.06, 0.72, D + 0.03], [x + 0.06, 0.75, D + 0.04]); // enamel badges
});

def('rangeChef', (m) => rangeModel(m, {
  W: 1.5, D: 0.78, H: 0.95, body: 'metal', strip: 'metalDark', hobPlate: 'metalDark', cols: [0.15, 0.5, 0.85], rows: [0.3, 0.7], knobs: 6, knobMat: 'carpet',
  doors: [[0.05, 0.72], [0.78, 1.45]], doorMat: 'metal', doorTrim: 'metalDark',
}));

def('stoveCompact', (m) => rangeModel(m, { W: 0.6, D: 0.6, H: 0.88, body: 'metalLight', strip: 'metalLight', cols: [0.28, 0.72], rows: [0.5], knobs: 3, base: 0.05, doorY0: 0.16, doorY1: 0.62, doorTrim: 'metalMedium' }));

def('rangeRetro', (m) => rangeModel(m, {
  W: 0.8, D: 0.66, H: 0.9, body: 'metalLight', strip: 'metalLight', hobPlate: 'metal', cols: [0.28, 0.72], rows: [0.32, 0.7], knobs: 4, knobMat: 'carpet',
  backsplash: true, doorTrim: 'metal', doorY0: 0.2, doorY1: 0.68,
}));

/** Tall wall-oven tower: drawer below, bottom-hinged oven door in the middle, control strip, a warming drawer above. */
def('wallOven', (m) => {
  const W = 0.64, D = 0.62, H = 2.0, base = 0.07, y0 = 0.9, y1 = 1.42;
  carcass(m, 'metalDark', 0, base, 0, W, H, D);
  m.box('metalDark', [0.04, 0, 0.04], [W - 0.04, base, D - 0.04]);
  m.box('metalDark', [T, y0 - 0.04, T], [W - T, y0, D]); // shelf under the oven
  m.box('metalDark', [T, y1, T], [W - T, y1 + 0.04, D]);
  m.box('metalMedium', [0, base, D], [W, y0 - 0.01, D + 0.03]); // cupboard front below
  m.rod('metal', [0.1, 0.7, D + 0.07], [W - 0.1, 0.7, D + 0.07], 0.024);
  for (const x of [0.1, W - 0.1]) m.rod('metal', [x, 0.7, D + 0.03], [x, 0.7, D + 0.07], 0.018);
  m.box('metalMedium', [0, y1 + 0.01, D], [W, y1 + 0.2, D + 0.03]); // control strip
  m.box('glass', [0.2, y1 + 0.07, D + 0.03], [W - 0.2, y1 + 0.13, D + 0.036]); // display
  for (const x of [0.07, 0.15, W - 0.15, W - 0.07]) knob(m, 'metalLight', x, y1 + 0.1, D + 0.03, 0.018, 0.03);
  m.box('metalMedium', [0, y1 + 0.21, D], [W, H, D + 0.03]); // warming drawer front
  m.rod('metal', [0.1, H - 0.1, D + 0.07], [W - 0.1, H - 0.1, D + 0.07], 0.024);
  for (const x of [0.1, W - 0.1]) m.rod('metal', [x, H - 0.1, D + 0.03], [x, H - 0.1, D + 0.07], 0.018);
  ovenDoor(m, 'oven', { x0: 0.03, x1: W - 0.03, y0, y1, z: D, mat: 'metal', trim: 'metalDark', window: 'high' });
  ovenCavity(m.part('anim:interior'), T, W - T, y0 + 0.005, y1 - 0.01, T, D);
});

/** Counter-top microwave: fixed control panel on the right, left-hinged door. */
function microwaveModel(m, o) {
  const { W, D, H } = o, base = 0.014, split = W * 0.72, body = o.body, cav = o.cavity ?? 'metalDark';
  carcass(m, body, 0, base, 0, W, H, D);
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, base, D - 0.03]);
  m.box(body, [split - 0.02, base, T], [split, H, D]);
  m.box(o.panel ?? 'metalDark', [split, base, D], [W, H, D + 0.02]);
  m.box('glass', [split + 0.02, H - 0.09, D + 0.02], [W - 0.02, H - 0.04, D + 0.026]); // display
  for (let i = 0; i < 3; i++) m.box('metalLight', [split + 0.02, H * 0.4 - i * 0.045, D + 0.02], [W - 0.02, H * 0.4 - i * 0.045 + 0.03, D + 0.026]);
  if (o.dials) { knob(m, o.dials, split + (W - split) / 2, H * 0.62, D + 0.02, 0.025, 0.03); }
  if (o.sideTrim) for (const x of [-0.01, W]) m.box(o.sideTrim, [x, base, 0], [x + 0.01, H, D]);
  const door = m.part('anim:door', [0, base, D + 0.01]);
  door.box(body, [0.005, base, D], [split - 0.005, H, D + 0.02]);
  door.box('metalDark', [0.05, base + 0.04, D + 0.02], [split - 0.05, H - 0.04, D + 0.026]);
  door.rod('metal', [split - 0.03, H * 0.25, D + 0.05], [split - 0.03, H * 0.8, D + 0.05], 0.022);
  const inside = m.part('anim:interior');
  lining(inside, T, base + T, split - 0.02, H - T, T, D, cav, 0.01);
  inside.cylY('glass', (split - 0.02) / 2, D * 0.5, base + T, base + T + 0.012, 0.1, 0.1, 10); // turntable
  inside.cylY('carpetWhite', (split - 0.02) / 2, D * 0.5, base + T + 0.012, base + T + 0.04, 0.05, 0.065, 8); // a bowl
}
def('microwaveSteel', (m) => microwaveModel(m, { W: 0.52, D: 0.4, H: 0.3, body: 'metal', panel: 'metalDark' }));
def('microwaveRetro', (m) => microwaveModel(m, { W: 0.5, D: 0.38, H: 0.3, body: 'metalLight', panel: 'wood', dials: 'carpet', sideTrim: 'wood', cavity: 'metalMedium' }));

/** Chimney hood: a tapered canopy and a square flue (wall mounted; the model's bottom is the underside of the canopy). */
def('rangeHood', (m) => {
  const W = 0.9, D = 0.5, Hc = 0.28, H = 0.85;
  m.hexa('metal', [[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D], [0.28, Hc, 0], [W - 0.28, Hc, 0], [W - 0.28, Hc, 0.3], [0.28, Hc, 0.3]]);
  m.box('metal', [0.28, Hc, 0], [W - 0.28, H, 0.3]);
  m.box('metalDark', [0.04, -0.004, 0.04], [W - 0.04, 0.01, D - 0.04]); // filter
  for (const x of [0.2, W - 0.3]) m.box('glass', [x, -0.008, 0.2], [x + 0.1, 0, 0.3]); // lamps
  m.box('metalDark', [0.3, 0.06, D - 0.01], [0.6, 0.11, D + 0.01]); // control strip
});

// --- dishwashers --------------------------------------------------------------------------------------------------------

function dishwasherModel(m, o) {
  const { W, D } = o, body = o.body, H = 0.88, base = 0.08;
  carcass(m, body, 0, base, 0, W, H, D);
  m.box('metalDark', [0.02, 0, 0.02], [W - 0.02, base, D - 0.06]);
  m.box('metal', [-0.005, H, -0.005], [W + 0.005, H + 0.025, D + 0.02]); // worktop
  m.box(o.strip ?? 'metalDark', [0.02, 0.742, D], [W - 0.02, H, D + 0.025]); // control strip
  for (let i = 0; i < 4; i++) m.box('metalLight', [0.1 + i * 0.1, 0.79, D + 0.025], [0.17 + i * 0.1, 0.83, D + 0.033]);
  m.box('glass', [W - 0.26, 0.785, D + 0.025], [W - 0.1, 0.835, D + 0.031]);
  const door = m.part('anim:door', [W / 2, base, D + 0.0125]);
  door.box(o.door ?? body, [0.02, base, D], [W - 0.02, 0.74, D + 0.025]);
  if (o.handle === 'bar') door.rod('metal', [0.1, 0.62, D + 0.07], [W - 0.1, 0.62, D + 0.07], 0.03);
  else door.rod('metal', [W / 2 - 0.2, 0.64, D + 0.06], [W / 2 + 0.2, 0.64, D + 0.06], 0.026);
  for (const x of o.handle === 'bar' ? [0.1, W - 0.1] : [W / 2 - 0.2, W / 2 + 0.2]) door.rod('metal', [x, o.handle === 'bar' ? 0.62 : 0.64, D + 0.025], [x, o.handle === 'bar' ? 0.62 : 0.64, D + 0.07], 0.02);
  if (o.panelInlay) door.box(o.panelInlay, [0.08, 0.12, D + 0.025], [W - 0.08, 0.5, D + 0.031]);
  // the tub with its racks, plates and cups
  const inside = m.part('anim:interior');
  lining(inside, T, base + T, W - T, 0.74, T, D, 'metal', 0.012);
  for (const y of [0.22, 0.46]) {
    inside.box('metalLight', [0.06, y, 0.06], [W - 0.06, y + 0.012, D - 0.06]);
    for (let k = 0; k < 6; k++) inside.box('metalLight', [0.06 + k * ((W - 0.14) / 5), y, 0.06], [0.072 + k * ((W - 0.14) / 5), y + 0.07, D - 0.06]);
  }
  for (let k = 0; k < 5; k++) inside.box('carpetWhite', [0.1 + k * 0.12, 0.232, 0.2], [0.112 + k * 0.12, 0.38, D - 0.2]);
  for (let k = 0; k < 4; k++) inside.cylY(k % 2 ? 'carpetBlue' : 'carpet', 0.16 + k * 0.17, 0.35, 0.472, 0.55, 0.04, 0.05, 8);
  inside.cylY('metalLight', W / 2, D / 2, 0.14, 0.15, 0.1, 0.1, 8); // lower spray arm
}
def('dishwasherPanel', (m) => dishwasherModel(m, { W: 0.9, D: 0.86, body: 'wood', door: 'wood', strip: 'woodDark', handle: 'rail', panelInlay: 'woodDark' }));
def('dishwasherSteel', (m) => dishwasherModel(m, { W: 0.9, D: 0.88, body: 'metal', door: 'metal', strip: 'metalDark', handle: 'bar' }));


// --- counters, sinks, island, pantry ----------------------------------------------------------------------------------

/** A flat top with rectangular holes (all holes share one z range): the strips around them. */
function worktop(m, mat, x0, x1, y0, y1, z0, z1, holes = []) {
  if (!holes.length) { m.box(mat, [x0, y0, z0], [x1, y1, z1]); return; }
  const hs = [...holes].sort((a, b) => a.x0 - b.x0), hz0 = hs[0].z0, hz1 = hs[0].z1;
  m.box(mat, [x0, y0, z0], [x1, y1, hz0]);
  m.box(mat, [x0, y0, hz1], [x1, y1, z1]);
  let cx = x0;
  for (const h of hs) { if (h.x0 > cx) m.box(mat, [cx, y0, hz0], [h.x0, y1, hz1]); cx = h.x1; }
  if (cx < x1) m.box(mat, [cx, y0, hz0], [x1, y1, hz1]);
}

/** Door and drawer fronts across a cabinet: `n` doors or drawers (rows = 1 door/drawer; style plain|shaker|flat). */
function cabFronts(m, o) {
  const { x0 = 0.02, x1, D, y0 = 0.12, y1 = 0.84, n = 2, style = 'plain', drawers = 0, front = 'woodDark', inset = 'wood' } = o;
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w + 0.006, b = x0 + (i + 1) * w - 0.006;
    const rows = drawers ? [[y0, y0 + (y1 - y0) / drawers - 0.012]] : [[y0, y1]];
    for (let r = 0; r < Math.max(1, drawers); r++) {
      const h = (y1 - y0) / Math.max(1, drawers), ya = y0 + r * h + 0.004, yb = y0 + (r + 1) * h - 0.004;
      m.box(front, [a, ya, D], [b, yb, D + 0.02]);
      if (style === 'shaker') m.box(inset, [a + 0.06, ya + 0.06, D + 0.02], [b - 0.06, yb - 0.06, D + 0.028]);
      if (style === 'flat') m.box('metalDark', [a, yb - 0.02, D + 0.02], [b, yb, D + 0.028]); // finger-pull groove
      else if (drawers) m.rod('metal', [(a + b) / 2 - 0.07, (ya + yb) / 2, D + 0.05], [(a + b) / 2 + 0.07, (ya + yb) / 2, D + 0.05], 0.02);
      else if (style === 'shaker') m.cyl('metal', [i % 2 ? a + 0.05 : b - 0.05, yb - 0.1, D + 0.028], [i % 2 ? a + 0.05 : b - 0.05, yb - 0.1, D + 0.06], 0.016, 8);
      else m.rod('metal', [i % 2 ? a + 0.05 : b - 0.05, yb - 0.3, D + 0.045], [i % 2 ? a + 0.05 : b - 0.05, yb - 0.08, D + 0.045], 0.018);
    }
  }
}

function cabinetBase(m, o) {
  const { W, D } = o, top = o.topMat ?? 'metal', topY = o.topY ?? 0.9;
  m.box('metalDark', [0.02, 0, 0.04], [W - 0.02, 0.1, D - 0.06]);
  if (o.holes) {
    m.box(o.body ?? 'wood', [0, 0.1, 0], [W, o.holeFloor ?? 0.72, D]);
    worktop(m, o.body ?? 'wood', 0, W, o.holeFloor ?? 0.72, topY - 0.04, 0, D, o.holes);
  } else m.box(o.body ?? 'wood', [0, 0.1, 0], [W, topY - 0.04, D]);
  worktop(m, top, -0.01, W + 0.01, topY - 0.04, topY, -0.01, D + 0.03, o.holes?.map((h) => ({ ...h })));
}

function basinSink(m, h, topY, floorY, wall = 'metalLight') {
  m.box(wall, [h.x0, floorY, h.z0], [h.x0 + 0.015, topY - 0.04, h.z1]);
  m.box(wall, [h.x1 - 0.015, floorY, h.z0], [h.x1, topY - 0.04, h.z1]);
  m.box(wall, [h.x0, floorY, h.z0], [h.x1, topY - 0.04, h.z0 + 0.015]);
  m.box(wall, [h.x0, floorY, h.z1 - 0.015], [h.x1, topY - 0.04, h.z1]);
  m.box('metalMedium', [h.x0, floorY, h.z0], [h.x1, floorY + 0.012, h.z1]);
  m.cylY('metalDark', (h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2, floorY + 0.012, floorY + 0.018, 0.03, 0.03, 8);
}

/** Swan-neck tap on the back edge of a sink, centred at x. */
function swanTap(m, x, z, y, mat = 'metalLight', reach = 0.17) {
  m.cylY(mat, x, z, y, y + 0.04, 0.035, 0.035, 8);
  m.rod(mat, [x, y + 0.04, z], [x, y + 0.3, z], 0.034);
  m.rod(mat, [x, y + 0.3, z], [x, y + 0.3, z + reach], 0.034);
  m.rod(mat, [x, y + 0.3, z + reach], [x, y + 0.2, z + reach], 0.034);
  m.rod(mat, [x + 0.1, y + 0.04, z + 0.02], [x + 0.1, y + 0.17, z + 0.02], 0.026); // side lever
}

def('sinkSingleBowl', (m) => {
  const W = 0.9, D = 0.86, h = { x0: 0.16, x1: W - 0.16, z0: 0.14, z1: D - 0.16 };
  cabinetBase(m, { W, D, holes: [h] });
  basinSink(m, h, 0.9, 0.72);
  swanTap(m, W / 2, 0.08, 0.9);
  cabFronts(m, { x1: W - 0.02, D, n: 2, style: 'shaker' });
});

def('sinkDoubleBowl', (m) => {
  const W = 1.8, D = 0.86, y = 0.9;
  const holes = [{ x0: 0.1, x1: 0.78, z0: 0.14, z1: D - 0.16 }, { x0: 0.86, x1: 1.4, z0: 0.14, z1: D - 0.16 }];
  cabinetBase(m, { W, D, holes });
  for (const h of holes) basinSink(m, h, y, 0.72);
  swanTap(m, 0.82, 0.08, y);
  for (let i = 0; i < 6; i++) m.box('metalMedium', [1.48, y, 0.2 + i * 0.1], [1.74, y + 0.004, 0.25 + i * 0.1]); // drainboard ribs
  cabFronts(m, { x1: W - 0.02, D, n: 4, style: 'plain' });
});

def('sinkFarmhouse', (m) => {
  const W = 0.9, D = 0.86;
  m.box('metalDark', [0.02, 0, 0.04], [W - 0.02, 0.1, D - 0.06]);
  m.box('wood', [0, 0.1, 0], [W, 0.46, D]);
  m.box('wood', [0, 0.46, 0], [0.08, 0.86, D]);
  m.box('wood', [W - 0.08, 0.46, 0], [W, 0.86, D]);
  m.box('wood', [0.08, 0.46, 0], [W - 0.08, 0.86, 0.1]);
  // deep ceramic apron-front basin standing proud of the cabinet
  m.box('carpetWhite', [0.08, 0.46, 0.1], [W - 0.08, 0.64, D + 0.04]);
  m.box('carpetWhite', [0.08, 0.64, 0.1], [0.17, 0.9, D + 0.04]);
  m.box('carpetWhite', [W - 0.17, 0.64, 0.1], [W - 0.08, 0.9, D + 0.04]);
  m.box('carpetWhite', [0.08, 0.64, 0.1], [W - 0.08, 0.9, 0.18]);
  m.box('carpetWhite', [0.08, 0.64, D - 0.02], [W - 0.08, 0.9, D + 0.04]);
  m.cylY('metalDark', W / 2, 0.5, 0.64, 0.646, 0.03, 0.03, 8);
  m.box('woodDark', [-0.01, 0.86, -0.01], [0.09, 0.9, D + 0.03]); // worktop strips either side
  m.box('woodDark', [W - 0.09, 0.86, -0.01], [W + 0.01, 0.9, D + 0.03]);
  m.box('woodDark', [0.09, 0.86, -0.01], [W - 0.09, 0.9, 0.1]);
  swanTap(m, W / 2, 0.14, 0.9, 'metal', 0.2);
  cabFronts(m, { x1: W - 0.02, D, y1: 0.44, y0: 0.12, n: 2, style: 'shaker' });
});

def('counterShaker', (m) => {
  const W = 0.9, D = 0.86;
  cabinetBase(m, { W, D });
  cabFronts(m, { x1: W - 0.02, D, n: 2, style: 'shaker' });
});

def('counterCornerL', (m) => {
  // blind corner cabinet: the back is square, the front is chamfered towards a door set across the corner
  const W = 0.94, D = 0.9, c = 0.26;
  m.box('metalDark', [0.05, 0, 0.05], [W - 0.05, 0.1, D - 0.1]);
  const ring = (y) => [[0, y, 0], [W, y, 0], [W, y, D - c], [W - c, y, D], [c, y, D], [0, y, D - c]];
  // prism over the hexagonal plan: two hexahedra (fans) keep every face planar
  const lo = ring(0.1), hi = ring(0.86);
  m.hexa('wood', [lo[0], lo[1], lo[2], lo[5], hi[0], hi[1], hi[2], hi[5]]);
  m.hexa('wood', [lo[5], lo[2], lo[3], lo[4], hi[5], hi[2], hi[3], hi[4]]);
  const lt = ring(0.86), ht = ring(0.9);
  m.hexa('metal', [lt[0], lt[1], lt[2], lt[5], ht[0], ht[1], ht[2], ht[5]]);
  m.hexa('metal', [lt[5], lt[2], lt[3], lt[4], ht[5], ht[2], ht[3], ht[4]]);
  m.box('woodDark', [c + 0.02, 0.12, D], [W - c - 0.02, 0.84, D + 0.02]); // door across the corner
  m.box('wood', [c + 0.08, 0.18, D + 0.02], [W - c - 0.08, 0.78, D + 0.028]);
  m.rod('metal', [W - c - 0.06, 0.42, D + 0.05], [W - c - 0.06, 0.64, D + 0.05], 0.018);
});

def('counterButcherBlock', (m) => {
  const W = 0.9, D = 0.8;
  m.box('wood', [-0.01, 0.84, 0], [W + 0.01, 0.9, D + 0.03]); // thick butcher-block top
  m.box('woodDark', [0, 0.82, 0.02], [W, 0.84, D - 0.02]);
  for (const x of [0.03, W - 0.09]) for (const z of [0.03, D - 0.09]) m.box('woodDark', [x, 0, z], [x + 0.06, 0.82, z + 0.06]); // legs
  for (const y of [0.1, 0.46]) m.box('woodDark', [0.09, y, 0.05], [W - 0.09, y + 0.03, D - 0.05]); // shelves
  for (const [x0, y0, mat] of [[0.14, 0.13, 'carpetDarker'], [0.5, 0.13, 'carpetDarker'], [0.16, 0.49, 'carpet'], [0.5, 0.49, 'plant']]) {
    m.box(mat, [x0, y0, 0.14], [x0 + 0.26, y0 + 0.2, D - 0.14]); // storage baskets
    m.box('woodDark', [x0 + 0.03, y0 + 0.17, D - 0.14], [x0 + 0.23, y0 + 0.2, D - 0.13]);
  }
  m.rod('metal', [0.2, 0.74, D - 0.03], [W - 0.2, 0.74, D - 0.03], 0.018); // towel rail under the top
});

def('wallCabinetShaker', (m) => {
  const W = 0.9, D = 0.38, H = 0.72;
  m.box('wood', [0, 0, 0], [W, H, D]);
  for (let i = 0; i < 2; i++) {
    const a = 0.02 + i * 0.43, b = a + 0.41;
    m.box('woodDark', [a, 0.02, D], [b, H - 0.02, D + 0.02]);
    m.box('wood', [a + 0.05, 0.07, D + 0.02], [b - 0.05, H - 0.07, D + 0.028]);
    m.cyl('metal', [i ? a + 0.05 : b - 0.05, 0.12, D + 0.028], [i ? a + 0.05 : b - 0.05, 0.12, D + 0.06], 0.016, 8);
  }
  m.box('woodDark', [0.0, -0.02, 0.02], [W, 0, D - 0.02]); // pelmet under
});

def('kitchenIsland', (m) => {
  const W = 1.8, D = 0.86, y = 0.92;
  m.box('metalDark', [0.04, 0, 0.04], [W - 0.04, 0.1, D - 0.06]);
  m.box('woodDark', [0, 0.1, 0], [W, y - 0.05, D]);
  cabFronts(m, { x1: W - 0.02, D, n: 3, drawers: 2, y0: 0.4, y1: 0.86, front: 'wood' }); // two rows of drawers
  cabFronts(m, { x1: W - 0.02, D, n: 3, y0: 0.12, y1: 0.4, front: 'wood', style: 'plain' }); // cupboards below
  m.box('metal', [-0.02, y - 0.05, -0.02], [W + 0.02, y, D + 0.1]); // worktop with a breakfast overhang at the front
  for (const x of [0.15, W - 0.21]) m.box('wood', [x, y - 0.12, D], [x + 0.06, y - 0.05, D + 0.08]); // corbels
  m.box('wood', [W / 2 - 0.2, y, 0.2], [W / 2 + 0.2, y + 0.03, 0.5]); // chopping board
});

/** Tall pantry cupboard: two doors on the front (`anim:door`, `anim:door2`) and shelves of tins and jars inside. */
def('pantryTall', (m) => {
  const W = 0.8, D = 0.5, H = 2.0, DT = 0.03;
  carcass(m, 'wood', 0, 0.08, 0, W, H, D);
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, 0.08, D - 0.03]);
  m.box('woodDark', [-0.01, H, -0.01], [W + 0.01, H + 0.03, D + 0.02]); // crown
  for (const [name, x0, x1, hinge] of [['door', 0.01, W / 2 - 0.004, 'L'], ['door2', W / 2 + 0.004, W - 0.01, 'R']]) {
    const door = m.part(`anim:${name}`, [hinge === 'L' ? x0 : x1, 0.08, D + DT / 2]);
    door.box('woodDark', [x0, 0.08, D], [x1, H - 0.02, D + DT]);
    for (const [ya, yb] of [[0.16, 0.9], [1.0, H - 0.1]]) door.box('wood', [x0 + 0.05, ya, D + DT], [x1 - 0.05, yb, D + DT + 0.008]); // raised panels
    const hx = hinge === 'L' ? x1 - 0.05 : x0 + 0.05;
    door.cyl('metal', [hx, 1.0, D + DT + 0.008], [hx, 1.0, D + DT + 0.045], 0.018, 8);
  }
  const inside = m.part('anim:interior');
  lining(inside, T, 0.08 + T, W - T, H - T, T, D, 'carpetWhite', 0.012);
  [0.5, 0.88, 1.26, 1.64].forEach((y, i) => {
    inside.box('wood', [T + 0.012, y, T + 0.012], [W - T - 0.012, y + 0.02, D - 0.04]);
    stockShelf(inside, T + 0.02, W - T - 0.02, y + 0.02, D * 0.5, i, 5);
  });
  stockShelf(inside, T + 0.02, W - T - 0.02, 0.08 + T + 0.012, D * 0.5, 3, 4);
});

// --- counter-top appliances and wall pieces --------------------------------------------------------------------------

def('toasterFourSlice', (m) => {
  const W = 0.34, D = 0.2, H = 0.2;
  m.box('metalDark', [0.02, 0, 0.02], [W - 0.02, 0.02, D - 0.02]); // feet
  m.box('metal', [0, 0.02, 0], [W, H, D]);
  m.box('metalLight', [0, H - 0.04, 0], [W, H, D]); // top rim
  for (const x of [0.04, 0.18]) for (const z of [0.05, 0.12]) m.box('metalDark', [x, H, z], [x + 0.12, H + 0.002, z + 0.02]); // slots
  for (const z of [0.09]) m.box('metalDark', [0.04, H - 0.001, z - 0.004], [W - 0.04, H + 0.004, z + 0.004]);
  for (const x of [0.07, W - 0.07]) { m.box('metalDark', [x - 0.01, 0.06, D], [x + 0.01, 0.15, D + 0.01]); m.box('metalLight', [x - 0.02, 0.1, D + 0.01], [x + 0.02, 0.12, D + 0.04]); } // levers
  m.cyl('metalDark', [W / 2, 0.11, D], [W / 2, 0.11, D + 0.025], 0.02, 8); // browning dial
  m.box('carpet', [W / 2 - 0.035, 0.05, D], [W / 2 + 0.035, 0.065, D + 0.008]);
});

def('coffeeMakerDrip', (m) => {
  const W = 0.26, D = 0.28, H = 0.36;
  m.box('metalDark', [0, 0, 0], [W, 0.025, D]); // warming plate base
  m.box('metalDark', [0, 0.025, 0], [W, H, 0.07]); // back column
  m.box('metalDark', [0, H - 0.1, 0], [W, H, D]); // top head with the filter basket
  m.box('metal', [0.04, H - 0.14, 0.1], [W - 0.04, H - 0.1, 0.22]); // basket
  m.box('glass', [0.01, 0.1, 0.005], [W - 0.01, H - 0.11, 0.06]); // water tank
  m.cylY('glass', W / 2, 0.17, 0.027, 0.17, 0.065, 0.065, 10); // carafe
  m.rod('metalDark', [W / 2 + 0.065, 0.06, 0.17], [W / 2 + 0.065, 0.15, 0.17], 0.018); // handle
  m.cylY('carpetDarker', W / 2, 0.17, 0.17, 0.19, 0.06, 0.06, 10); // lid
  m.box('carpet', [W - 0.07, H - 0.08, D], [W - 0.04, H - 0.06, D + 0.006]); // power light
});

def('kettleElectric', (m) => {
  m.cylY('metalDark', 0.1, 0.1, 0, 0.03, 0.095, 0.095, 12); // power base
  m.lathe('metalLight', 0.1, 0.1, [[0.085, 0.03], [0.095, 0.05], [0.082, 0.22], [0.06, 0.25]], 12);
  m.cylY('metalDark', 0.1, 0.1, 0.25, 0.27, 0.058, 0.04, 12); // lid
  m.cylY('metalDark', 0.1, 0.1, 0.27, 0.29, 0.02, 0.02, 8); // knob
  m.box('metalLight', [0.06, 0.17, 0.17], [0.14, 0.23, 0.25]); // spout
  m.rod('metalDark', [0.1, 0.24, 0.0], [0.1, 0.24, -0.03], 0.02); // handle top bracket
  m.box('metalDark', [0.085, 0.07, -0.07], [0.115, 0.25, -0.04]); // handle, at the back
  m.box('metalDark', [0.085, 0.07, -0.07], [0.115, 0.1, 0.0]);
  m.box('metalDark', [0.085, 0.22, -0.07], [0.115, 0.25, 0.0]);
  m.box('carpet', [0.093, 0.04, 0.095], [0.107, 0.05, 0.11]);
});

def('spiceRack', (m) => {
  const W = 0.6, D = 0.12, H = 0.34;
  m.box('wood', [0, 0, 0], [W, H, 0.02]);
  for (const y of [0.0, 0.17]) {
    m.box('wood', [0, y, 0], [W, y + 0.02, D]);
    m.box('woodDark', [0.0, y + 0.02, D - 0.015], [W, y + 0.05, D]); // lip
    for (let i = 0; i < 5; i++) {
      const x = 0.07 + i * 0.115;
      m.cylY(['carpet', 'plant', 'carpetBlue', 'wood', 'carpetWhite'][(i + (y ? 2 : 0)) % 5], x, 0.07, y + 0.02, y + 0.11, 0.035, 0.035, 8);
      m.cylY('metalDark', x, 0.07, y + 0.11, y + 0.125, 0.03, 0.03, 8);
    }
  }
  m.box('wood', [0, H - 0.02, 0], [W, H, D]);
});


// --- bathroom: toilets and bidet --------------------------------------------------------------------------------------

/**
 * Bowl, seat and the lifting lid (`anim:lid`, hinged at the back, turns about x by a negative angle) of a toilet. The back of
 * the model is at z = 0; `cx` is the centre line, `zc` the centre of the rounded front.
 */
function toiletBowl(m, o) {
  const cx = o.cx, zc = o.zc, r = o.r ?? 0.18, zb = o.zb ?? 0.2, seatY = o.seatY ?? 0.43, bowlY = o.bowlY ?? 0.24, seat = o.seat ?? 'carpetWhite', body = o.body ?? 'carpetWhite';
  if (!o.wallHung) m.box(body, [cx - 0.14, 0, zb], [cx + 0.14, bowlY, zc]); // pedestal
  m.box(body, [cx - r, bowlY, 0.04 + (o.zBack ?? 0)], [cx + r, seatY - 0.03, zc]);
  m.cylY(body, cx, zc, bowlY, seatY - 0.03, r, r, 12);
  // seat ring, then the dark water inside it
  m.box(seat, [cx - r - 0.01, seatY - 0.03, zb], [cx + r + 0.01, seatY, zc]);
  m.cylY(seat, cx, zc, seatY - 0.03, seatY, r + 0.01, r + 0.01, 12);
  m.cylY('metalMedium', cx, zc, seatY, seatY + 0.006, r - 0.06, r - 0.06, 10);
  const lid = m.part('anim:lid', [cx, seatY, zb + 0.02]);
  lid.box(o.lid ?? seat, [cx - r - 0.01, seatY + 0.008, zb + 0.02], [cx + r + 0.01, seatY + 0.03, zc]);
  lid.cylY(o.lid ?? seat, cx, zc, seatY + 0.008, seatY + 0.03, r + 0.01, r + 0.01, 12);
}

def('toiletBudget', (m) => {
  const cx = 0.21, zc = 0.5;
  m.box('carpetWhite', [cx - 0.19, 0.33, 0], [cx + 0.19, 0.78, 0.2]); // tall boxy cistern
  m.box('carpetWhite', [cx - 0.2, 0.78, -0.005], [cx + 0.2, 0.8, 0.21]);
  m.box('metalLight', [cx + 0.19, 0.7, 0.07], [cx + 0.23, 0.73, 0.1]); // side lever
  m.box('metalLight', [cx + 0.2, 0.7, 0.05], [cx + 0.23, 0.74, 0.11]);
  toiletBowl(m, { cx, zc, zb: 0.2, seat: 'carpetWhite' });
  m.box('metalMedium', [cx - 0.12, 0.34, 0.2], [cx + 0.12, 0.36, 0.21]); // seat hinge block
});
def('toiletRound', (m) => {
  const cx = 0.21;
  m.cylY('carpetWhite', cx, 0.2, 0.3, 0.8, 0.2, 0.2, 12); // round cistern
  m.box('carpetWhite', [cx - 0.2, 0.3, 0], [cx + 0.2, 0.8, 0.12]);
  m.cylY('carpetWhite', cx, 0.2, 0.8, 0.83, 0.205, 0.205, 12);
  for (const x of [-0.04, 0.04]) m.box('metalLight', [cx + x - 0.025, 0.83, 0.17], [cx + x + 0.025, 0.845, 0.23]); // dual flush
  toiletBowl(m, { cx, zc: 0.52, zb: 0.3, seat: 'carpetBlue', lid: 'carpetBlue', r: 0.19 });
});
def('toiletHighCistern', (m) => {
  const cx = 0.21;
  m.box('metalDark', [cx - 0.22, 1.5, 0], [cx + 0.22, 1.74, 0.16]); // high-level iron cistern
  m.box('metalDark', [cx - 0.24, 1.74, -0.005], [cx + 0.24, 1.77, 0.17]);
  m.rod('metal', [cx, 0.4, 0.06], [cx, 1.5, 0.06], 0.05); // flush pipe
  m.box('metal', [cx - 0.04, 0.38, 0.0], [cx + 0.04, 0.46, 0.14]); // elbow into the bowl
  m.rod('metalMedium', [cx + 0.12, 1.45, 0.1], [cx + 0.12, 1.1, 0.1], 0.012); // pull chain
  m.cylY('wood', cx + 0.12, 0.1, 1.04, 1.1, 0.025, 0.025, 8);
  m.box('metalDark', [cx - 0.1, 1.55, 0.16], [cx + 0.1, 1.6, 0.17]);
  toiletBowl(m, { cx, zc: 0.5, zb: 0.12, seat: 'wood', lid: 'wood', body: 'carpetWhite', zBack: 0.0 });
});
def('toiletWallHung', (m) => {
  const cx = 0.3;
  m.box('carpetWhite', [cx - 0.28, 0, 0], [cx + 0.28, 1.02, 0.14]); // cistern frame cover down to the floor
  m.box('metalLight', [cx - 0.11, 0.62, 0.14], [cx + 0.11, 0.88, 0.148]); // flush plate
  for (const x of [-0.045, 0.045]) m.box('metalDark', [cx + x - 0.03, 0.74 - (x > 0 ? 0 : 0.0), 0.148], [cx + x + 0.03, 0.8, 0.158]);
  m.box('carpetWhite', [cx - 0.16, 0.3, 0.14], [cx + 0.16, 0.36, 0.3]); // bowl bracket
  toiletBowl(m, { cx, zc: 0.52, zb: 0.26, r: 0.17, bowlY: 0.3, seat: 'carpetWhite', wallHung: true, zBack: 0.1, seatY: 0.4 });
});

def('bidet', (m) => {
  const cx = 0.21, zc = 0.42, r = 0.17;
  m.box('carpetWhite', [cx - 0.14, 0, 0.06], [cx + 0.14, 0.26, zc]);
  m.box('carpetWhite', [cx - r, 0.26, 0.04], [cx + r, 0.38, zc]);
  m.cylY('carpetWhite', cx, zc, 0.26, 0.38, r, r, 12);
  m.box('carpetWhite', [cx - r - 0.01, 0.38, 0.04], [cx + r + 0.01, 0.4, zc]);
  m.cylY('carpetWhite', cx, zc, 0.38, 0.4, r + 0.01, r + 0.01, 12);
  m.cylY('metalMedium', cx, zc - 0.02, 0.4, 0.406, r - 0.05, r - 0.05, 10); // basin
  m.box('carpetWhite', [cx - 0.2, 0.38, 0], [cx + 0.2, 0.46, 0.1]); // back deck with the mixer
  m.cylY('metalLight', cx, 0.06, 0.46, 0.5, 0.03, 0.03, 8);
  m.rod('metalLight', [cx, 0.5, 0.06], [cx, 0.5, 0.16], 0.025);
  for (const x of [-0.1, 0.1]) m.cylY('metalLight', cx + x, 0.05, 0.46, 0.51, 0.02, 0.02, 8);
});

// --- bathroom: basins and vanities -------------------------------------------------------------------------------------

function bathTap(m, x, z, y, mat = 'metalLight') {
  m.cylY(mat, x, z, y, y + 0.05, 0.03, 0.03, 8);
  m.rod(mat, [x, y + 0.05, z], [x, y + 0.14, z + 0.02], 0.03);
  m.rod(mat, [x, y + 0.14, z + 0.02], [x, y + 0.13, z + 0.12], 0.028);
  m.rod(mat, [x + 0.07, y + 0.01, z], [x + 0.07, y + 0.08, z], 0.02);
  m.rod(mat, [x - 0.07, y + 0.01, z], [x - 0.07, y + 0.08, z], 0.02);
}

def('basinPedestalRound', (m) => {
  const cx = 0.3, zc = 0.3;
  m.cylY('carpetWhite', cx, 0.12, 0, 0.1, 0.1, 0.1, 10);
  m.cylY('carpetWhite', cx, 0.12, 0.1, 0.62, 0.075, 0.075, 10); // pedestal column
  m.box('carpetWhite', [cx - 0.2, 0.62, 0], [cx + 0.2, 0.86, 0.12]); // back splash and bowl rim
  m.lathe('carpetWhite', cx, zc, [[0.1, 0.62], [0.27, 0.8], [0.27, 0.86]], 12);
  m.cylY('carpetWhite', cx, zc, 0.84, 0.86, 0.27, 0.27, 12);
  m.cylY('metalMedium', cx, zc, 0.855, 0.862, 0.21, 0.21, 12);
  bathTap(m, cx, 0.06, 0.86);
});
def('vanityDouble', (m) => {
  const W = 1.5, D = 0.56, y = 0.86;
  const holes = [{ x0: 0.12, x1: 0.62, z0: 0.1, z1: D - 0.1 }, { x0: W - 0.62, x1: W - 0.12, z0: 0.1, z1: D - 0.1 }];
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, 0.1, D - 0.06]);
  m.box('wood', [0, 0.1, 0], [W, 0.68, D]);
  worktop(m, 'wood', 0, W, 0.68, y - 0.04, 0, D, holes);
  worktop(m, 'carpetWhite', -0.01, W + 0.01, y - 0.04, y, -0.01, D + 0.03, holes);
  for (const h of holes) basinSink(m, h, y, 0.68, 'carpetWhite');
  bathTap(m, 0.37, 0.05, y); bathTap(m, W - 0.37, 0.05, y);
  m.box('carpetWhite', [0, y, 0], [W, y + 0.1, 0.03]); // splashback
  cabFronts(m, { x1: W - 0.02, D, y0: 0.12, y1: 0.66, n: 4, style: 'plain', front: 'woodDark' });
});
def('vanityVessel', (m) => {
  const W = 0.8, D = 0.5, y = 0.8;
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, 0.1, D - 0.06]);
  m.box('woodDark', [0, 0.1, 0], [W, y, D]);
  m.box('wood', [-0.01, y, -0.01], [W + 0.01, y + 0.04, D + 0.02]); // wooden top
  cabFronts(m, { x1: W - 0.02, D, y0: 0.12, y1: y - 0.02, n: 1, drawers: 2, front: 'wood' });
  m.lathe('carpetWhite', W / 2, 0.26, [[0.1, y + 0.04], [0.19, y + 0.14], [0.2, y + 0.2]], 12); // vessel bowl on the top
  m.cylY('metalMedium', W / 2, 0.26, y + 0.198, y + 0.204, 0.15, 0.15, 12);
  m.rod('metalLight', [W / 2, y + 0.04, 0.05], [W / 2, y + 0.4, 0.05], 0.035); // tall tap
  m.rod('metalLight', [W / 2, y + 0.4, 0.05], [W / 2, y + 0.4, 0.2], 0.03);
  m.box('metalLight', [W / 2 - 0.04, y + 0.04, 0.03], [W / 2 + 0.04, y + 0.07, 0.07]);
});
def('basinConsole', (m) => {
  const W = 0.8, D = 0.46, y = 0.86;
  m.box('metalLight', [0, y - 0.1, 0], [W, y, D]); // wall-hung ceramic console basin
  m.box('carpetWhite', [0, y - 0.1, 0], [W, y - 0.02, D]);
  m.box('metalMedium', [0.1, y - 0.04, 0.12], [W - 0.1, y - 0.03, D - 0.08]);
  m.box('carpetWhite', [0, y - 0.02, 0], [W, y + 0.12, 0.04]); // splashback
  bathTap(m, W / 2, 0.08, y - 0.02);
  for (const x of [0.03, W - 0.07]) m.box('metal', [x, 0, D - 0.07], [x + 0.04, y - 0.1, D - 0.03]); // chrome legs at the front
  for (const x of [0.03, W - 0.07]) m.box('metal', [x, 0.6, 0], [x + 0.04, 0.64, D - 0.03]);
  m.rod('metal', [0.04, 0.55, D - 0.01], [W - 0.04, 0.55, D - 0.01], 0.02); // towel rail at the front
});
def('vanityCompact', (m) => {
  const W = 0.6, D = 0.42, y = 0.84;
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, 0.08, D - 0.05]);
  m.box('carpetBlue', [0, 0.08, 0], [W, y - 0.05, D]);
  cabFronts(m, { x1: W - 0.02, D, y0: 0.1, y1: y - 0.07, n: 1, front: 'carpetBlue', style: 'flat' });
  m.box('carpetWhite', [-0.01, y - 0.05, -0.01], [W + 0.01, y, D + 0.02]); // moulded top
  m.box('carpetWhite', [-0.01, y, -0.01], [W + 0.01, y + 0.1, 0.03]); // splashback
  m.box('carpetWhite', [0.1, y, 0.08], [W - 0.1, y + 0.005, D - 0.02]);
  m.box('metalMedium', [0.14, y + 0.004, 0.12], [W - 0.14, y + 0.008, D - 0.06]); // basin hollow
  bathTap(m, W / 2, 0.05, y);
});


// --- bathroom: showers and baths --------------------------------------------------------------------------------------
// A shower or bath has a hinged glass door or screen on the front (`anim:door`). The 'shower' and 'bath' kinds run the water
// effect; they do not open the door, so it stays shut while somebody uses the unit.

/** A hinged pane on the front plane: x0..x1 wide, y0..y1 high, hinge on the left or right edge. */
function glassDoor(m, name, o) {
  const { x0, x1, y0, y1, z, hinge = 'L' } = o;
  const d = m.part(`anim:${name}`, [hinge === 'L' ? x0 : x1, y0, z]);
  d.box('glass', [x0, y0, z - 0.008], [x1, y1, z + 0.008]);
  d.box(o.frame ?? 'metal', [x0, y0, z - 0.012], [x1, y0 + 0.03, z + 0.012]);
  d.box(o.frame ?? 'metal', [x0, y1 - 0.03, z - 0.012], [x1, y1, z + 0.012]);
  d.box(o.frame ?? 'metal', [x0, y0, z - 0.012], [x0 + 0.03, y1, z + 0.012]);
  d.box(o.frame ?? 'metal', [x1 - 0.03, y0, z - 0.012], [x1, y1, z + 0.012]);
  const hx = hinge === 'L' ? x1 - 0.1 : x0 + 0.1, hy = (y0 + y1) / 2;
  d.rod('metalLight', [hx, hy - 0.15, z + 0.04], [hx, hy + 0.15, z + 0.04], 0.026); // handle
  for (const y of [hy - 0.15, hy + 0.15]) d.rod('metalLight', [hx, y, z + 0.012], [hx, y, z + 0.04], 0.018);
}
/** Fixed glass pane, `axis` 'x' along the front or 'z' along a side. */
function glassPane(m, x0, y0, z0, x1, y1, z1, frame = 'metal') {
  m.box('glass', [x0, y0, z0], [x1, y1, z1]);
  m.box(frame, [x0 - 0.004, y0, z0 - 0.004], [x1 + 0.004, y0 + 0.03, z1 + 0.004]);
  m.box(frame, [x0 - 0.004, y1 - 0.03, z0 - 0.004], [x1 + 0.004, y1, z1 + 0.004]);
}
function trayWithDrain(m, W, D, h, mat = 'carpetWhite') {
  m.box(mat, [0, 0, 0], [W, h, D]);
  m.box('metalDark', [W / 2 - 0.05, h, D / 2 - 0.05], [W / 2 + 0.05, h + 0.006, D / 2 + 0.05]);
}
/** Wall-side shower fittings: mixer panel, riser and a handset holder on the back. */
function showerBack(m, W, y0, y1, head = 'rain') {
  m.box('metalLight', [W / 2 - 0.1, y0 + 0.9, 0.0], [W / 2 + 0.1, y0 + 1.0, 0.04]); // mixer plate
  m.cylY('metal', W / 2, 0.06, y0 + 0.9, y0 + 0.9, 0, 0, 3);
  m.cyl('metal', [W / 2, y0 + 0.95, 0.04], [W / 2, y0 + 0.95, 0.1], 0.03, 8);
  m.rod('metal', [W / 2 + 0.16, y0 + 0.3, 0.03], [W / 2 + 0.16, y1 - 0.2, 0.03], 0.02); // slide rail
  if (head === 'rain') { // ceiling-mounted rain head on an arm
    m.rod('metal', [W / 2, y1 - 0.06, 0.03], [W / 2, y1 - 0.06, 0.4], 0.035);
    m.cylY('metal', W / 2, 0.4, y1 - 0.1, y1 - 0.06, 0.16, 0.16, 12);
  } else m.cyl('metal', [W / 2 + 0.16, y1 - 0.3, 0.05], [W / 2 + 0.16, y1 - 0.3, 0.14], 0.07, 10); // fixed head on the wall
}

def('showerWalkIn', (m) => {
  const W = 0.95, D = 0.93, H = 2.0;
  trayWithDrain(m, W, D, 0.07);
  m.box('carpetWhite', [0, 0.07, 0], [W, H, 0.03]); // tiled back wall
  showerBack(m, W, 0.07, H);
  glassPane(m, 0, 0.07, 0, 0.012, H, D); // left side pane (full depth)
  glassPane(m, 0.0, 0.07, D - 0.012, 0.42, H, D); // fixed front pane
  glassDoor(m, 'door', { x0: 0.46, x1: W - 0.02, y0: 0.07, y1: H - 0.1, z: D - 0.004, hinge: 'R' });
  m.rod('metal', [0.0, H, 0.0], [0.0, H, D], 0.03); // top rail along the side
});

def('showerCornerSquare', (m) => {
  const W = 0.95, D = 0.95, H = 1.95;
  trayWithDrain(m, W, D, 0.12, 'carpetWhite');
  m.box('metalLight', [0, 0.12, 0], [W, H, 0.03]); // back panel
  showerBack(m, W, 0.12, H, 'wall');
  for (const [x, z] of [[0, 0], [0, D - 0.04], [W - 0.04, D - 0.04]]) m.box('metalLight', [x, 0.12, z], [x + 0.04, H, z + 0.04]); // posts
  m.box('metalLight', [0, H, 0], [W, H + 0.04, D]); // roof
  glassPane(m, 0.0, 0.12, 0.04, 0.012, H, D - 0.04, 'metalLight');
  glassPane(m, W - 0.012, 0.12, 0.04, W, H, D - 0.04, 'metalLight');
  glassDoor(m, 'door', { x0: 0.04, x1: W - 0.04, y0: 0.12, y1: H - 0.02, z: D - 0.02, hinge: 'L', frame: 'metalLight' });
  m.box('wood', [W - 0.28, 0.5, 0.03], [W - 0.04, 0.54, 0.26]); // corner seat
});

def('showerCabin', (m) => {
  const W = 0.94, D = 0.94, H = 2.1;
  trayWithDrain(m, W, D, 0.14, 'metalDark');
  m.box('metalLight', [0, 0.14, 0], [W, H, 0.04]); // back wall with a mirror strip
  m.box('glass', [0.12, 1.1, 0.04], [W - 0.12, 1.8, 0.046]);
  m.box('metalLight', [0, 0.14, 0], [0.04, H, D]); // solid left wall
  m.box('metalLight', [W - 0.04, 0.14, 0], [W, H, D - 0.3]); // right wall; the front part is the door
  showerBack(m, W, 0.14, H - 0.1, 'rain');
  m.box('metalLight', [0, H - 0.1, 0], [W, H, D]); // roof with a vent
  m.box('metalMedium', [W - 0.3, H, 0.1], [W - 0.1, H + 0.04, 0.3]);
  m.box('metalLight', [0.04, 0.14, D - 0.05], [W - 0.04, 0.9, D]); // lower door panel strip
  glassDoor(m, 'door', { x0: 0.04, x1: W - 0.04, y0: 0.9, y1: H - 0.1, z: D - 0.02, hinge: 'L', frame: 'metalLight' });
  m.box('woodDark', [0.04, 0.62, 0.04], [0.5, 0.66, 0.24]); // fold-down seat
  m.box('carpetBlue', [0.1, 0.66, 0.06], [0.2, 0.84, 0.14]); // bottle on the shelf
});

/** A rectangular tub: four walls and a floor around a hollow, a rim, feet or plinth. */
function tubShell(m, x0, z0, x1, z1, yTop, floorY, mat = 'carpetWhite', wall = 0.08) {
  m.box(mat, [x0, floorY - 0.04, z0], [x1, floorY, z1]);
  m.box('metalLight', [x0 + wall, floorY, z0 + wall], [x1 - wall, floorY + 0.004, z1 - wall]); // light inside floor
  m.box(mat, [x0, floorY, z0], [x1, yTop, z0 + wall]);
  m.box(mat, [x0, floorY, z1 - wall], [x1, yTop, z1]);
  m.box(mat, [x0, floorY, z0 + wall], [x0 + wall, yTop, z1 - wall]);
  m.box(mat, [x1 - wall, floorY, z0 + wall], [x1, yTop, z1 - wall]);
}
function bathMixer(m, x, z, y, mat = 'metal') {
  m.cylY(mat, x, z, y, y + 0.1, 0.03, 0.03, 8);
  m.rod(mat, [x, y + 0.1, z], [x, y + 0.14, z + 0.14], 0.03);
  m.rod(mat, [x - 0.07, y, z], [x - 0.07, y + 0.07, z], 0.02);
  m.rod(mat, [x + 0.07, y, z], [x + 0.07, y + 0.07, z], 0.02);
}

def('bathClawfoot', (m) => {
  const W = 1.7, D = 0.8, y0 = 0.15, H = 0.62;
  tubShell(m, 0, 0, W, D, H, y0 + 0.1, 'carpetWhite', 0.07);
  m.box('carpetWhite', [-0.02, H - 0.05, -0.02], [W + 0.02, H, D + 0.02]); // rolled rim
  m.box('carpetWhite', [0, y0, 0], [W, y0 + 0.1, D]);
  for (const [x, z] of [[0.14, 0.14], [W - 0.14, 0.14], [0.14, D - 0.14], [W - 0.14, D - 0.14]]) { // claw feet
    m.cylY('metalDark', x, z, 0.04, y0, 0.045, 0.03, 8);
    m.cylY('metalDark', x, z, 0, 0.05, 0.06, 0.06, 8);
  }
  bathMixer(m, 0.25, 0.04, H, 'metal');
  m.rod('metal', [0.25, H + 0.1, 0.04], [0.25, H + 0.6, 0.04], 0.025); // tall riser to the handset
  m.cylY('metal', 0.25, 0.04, H + 0.6, H + 0.64, 0.045, 0.045, 8);
  glassDoor(m, 'door', { x0: W / 2 - 0.4, x1: W / 2 + 0.4, y0: H, y1: H + 0.75, z: D - 0.06, hinge: 'L' });
});
def('bathModern', (m) => {
  const W = 1.7, D = 0.8, H = 0.58;
  tubShell(m, 0, 0, W, D, H, 0.14, 'carpetWhite', 0.1);
  m.box('metalDark', [0.04, 0, 0.04], [W - 0.04, 0.1, D - 0.04]);
  m.box('carpetWhite', [0, 0.1, 0], [W, 0.14, D]);
  m.box('metalLight', [0, H, 0], [W, H + 0.012, D]); // thin rim lip, paler
  m.hexa('metalLight', [[0.1, 0.14, 0.1], [0.1 + 0.001, 0.14, D - 0.1], [0.3, 0.14, D - 0.1], [0.3, 0.14, 0.1], [0.1, H - 0.05, 0.1], [0.1, H - 0.05, D - 0.1], [0.12, H - 0.05, D - 0.1], [0.12, H - 0.05, 0.1]]); // sloped back rest
  m.rod('metal', [W - 0.12, 0.14, 0.05], [W - 0.12, H + 0.5, 0.05], 0.045); // floor-standing filler column
  m.rod('metal', [W - 0.12, H + 0.5, 0.05], [W - 0.12, H + 0.5, 0.25], 0.035);
  glassDoor(m, 'door', { x0: W / 2 - 0.4, x1: W / 2 + 0.4, y0: H, y1: H + 0.78, z: D - 0.07, hinge: 'R', frame: 'metalLight' });
});
def('bathBudget', (m) => {
  const W = 1.6, D = 0.72, H = 0.5;
  tubShell(m, 0, 0, W, D, H, 0.14, 'carpetWhite', 0.07);
  m.box('carpetWhite', [0.0, 0.04, D - 0.005], [W, H - 0.04, D + 0.02]); // plain side panel
  m.box('metalDark', [0.02, 0, 0.02], [W - 0.02, 0.04, D - 0.02]);
  m.box('metalLight', [0.0, H, 0], [W, H + 0.008, D]);
  bathMixer(m, W - 0.2, 0.03, H, 'metalLight');
  m.box('metalLight', [W - 0.3, H, 0], [W - 0.1, H + 0.6, 0.03]); // wall plate for a shower
  m.cyl('metalLight', [W - 0.2, H + 0.6, 0.03], [W - 0.2, H + 0.6, 0.12], 0.05, 8);
  glassDoor(m, 'door', { x0: W / 2 - 0.36, x1: W / 2 + 0.36, y0: H, y1: H + 0.7, z: D - 0.04, hinge: 'L', frame: 'metalLight' });
});
def('bathShowerCombo', (m) => {
  const W = 1.7, D = 0.75, H = 0.55;
  tubShell(m, 0, 0, W, D, H, 0.13, 'carpetWhite', 0.07);
  m.box('carpetWhite', [0.0, 0.05, D - 0.005], [W, H - 0.04, D + 0.02]);
  m.box('metalDark', [0.02, 0, 0.02], [W - 0.02, 0.05, D - 0.02]);
  m.box('carpetWhite', [0, 0.14, 0], [W, 1.9, 0.03]); // tiled wall behind
  m.box('metalLight', [W / 2 - 0.1, 1.0, 0.03], [W / 2 + 0.1, 1.1, 0.07]);
  m.cyl('metal', [W / 2, 1.05, 0.07], [W / 2, 1.05, 0.14], 0.03, 8);
  m.rod('metal', [W / 2 + 0.2, 1.1, 0.04], [W / 2 + 0.2, 1.85, 0.04], 0.02);
  m.cyl('metal', [W / 2 + 0.2, 1.85, 0.04], [W / 2 + 0.2, 1.85, 0.2], 0.08, 10);
  bathMixer(m, W / 2 - 0.45, 0.04, H, 'metal');
  glassPane(m, 0.04, H, D - 0.05, 0.4, 1.85, D - 0.036); // fixed end screen
  glassDoor(m, 'door', { x0: 0.44, x1: W - 0.04, y0: H, y1: 1.85, z: D - 0.04, hinge: 'R' });
  m.rod('metal', [0.04, 1.85, D - 0.043], [W - 0.04, 1.85, D - 0.043], 0.026);
});
def('bathCornerSpa', (m) => {
  const W = 1.8, D = 1.8, deck = 0.5;
  m.box('metalDark', [0.04, 0, 0.04], [W - 0.04, 0.06, D - 0.04]);
  // wooden deck around a sunken square tub
  m.box('wood', [0, 0.06, 0], [W, deck, 0.3]);
  m.box('wood', [0, 0.06, 0.3], [0.3, deck, D]);
  m.box('wood', [W - 0.3, 0.06, 0.3], [W, deck, D]);
  m.box('wood', [0.3, 0.06, D - 0.3], [W - 0.3, deck, D]);
  tubShell(m, 0.3, 0.3, W - 0.3, D - 0.3, deck + 0.01, 0.24, 'carpetWhite', 0.06);
  m.box('carpetWhite', [0.26, deck, 0.26], [W - 0.26, deck + 0.04, 0.3]); // coping
  m.box('carpetWhite', [0.26, deck, D - 0.3], [W - 0.26, deck + 0.04, D - 0.26]);
  m.box('carpetWhite', [0.26, deck, 0.3], [0.3, deck + 0.04, D - 0.3]);
  m.box('carpetWhite', [W - 0.3, deck, 0.3], [W - 0.26, deck + 0.04, D - 0.3]);
  bathMixer(m, W / 2, 0.1, deck + 0.04, 'metal');
  m.box('carpetWhite', [0.3, 0.24, 0.3], [0.7, 0.34, 0.7]); // corner step seat inside
  glassDoor(m, 'door', { x0: W / 2 - 0.45, x1: W / 2 + 0.45, y0: deck + 0.04, y1: deck + 0.8, z: D - 0.12, hinge: 'L' });
});

// --- bathroom: mirrors, rails, shelves, basket ----------------------------------------------------------------------------

/** Mirror cabinet: hollow body with one or two mirror doors (`anim:door`, `anim:door2`) and a shelf of toiletries inside. */
function mirrorCabinet(m, o) {
  const { W, H, D = 0.14, n = 1 } = o;
  carcass(m, o.body ?? 'wood', 0, 0, 0, W, H, D, 0.03);
  const inside = m.part('anim:interior');
  lining(inside, 0.03, 0.03, W - 0.03, H - 0.03, 0.03, D, 'carpetWhite', 0.008);
  (o.shelves ?? [H / 3, (2 * H) / 3]).forEach((y, i) => {
    inside.box('glass', [0.038, y, 0.038], [W - 0.038, y + 0.01, D - 0.02]);
    stockShelf(inside, 0.04, W - 0.04, y + 0.01, D * 0.5, i + 2, Math.max(2, Math.floor(W / 0.16)));
  });
  for (let i = 0; i < n; i++) {
    const x0 = (i * W) / n + 0.003, x1 = ((i + 1) * W) / n - 0.003, hinge = n === 1 ? (o.hinge ?? 'L') : i ? 'R' : 'L';
    const d = m.part(i ? 'anim:door2' : 'anim:door', [hinge === 'L' ? x0 : x1, 0, D + 0.01]);
    d.box(o.frame ?? 'metal', [x0, 0, D], [x1, H, D + 0.02]);
    d.box('glass', [x0 + 0.025, 0.025, D + 0.02], [x1 - 0.025, H - 0.025, D + 0.026]); // the mirror
    const hx = hinge === 'L' ? x1 - 0.03 : x0 + 0.03;
    d.cyl('metalLight', [hx, H / 2, D + 0.026], [hx, H / 2, D + 0.05], 0.014, 8);
  }
}
def('mirrorCabinetWide', (m) => mirrorCabinet(m, { W: 0.9, H: 0.75, n: 1, body: 'wood', frame: 'woodDark' }));
def('mirrorCabinetSlim', (m) => mirrorCabinet(m, { W: 0.45, H: 0.8, n: 1, body: 'metalLight', frame: 'metal', shelves: [0.22, 0.42, 0.62], hinge: 'R' }));

def('towelRail', (m) => {
  const W = 0.55, H = 0.85, D = 0.1;
  for (const x of [0.03, W - 0.03]) m.rod('metal', [x, 0, 0.0], [x, H, 0.0], 0.03);
  for (const x of [0.03, W - 0.03]) m.box('metal', [x - 0.02, 0, 0], [x + 0.02, 0.04, D]); // wall brackets drawn as feet
  for (let i = 0; i < 6; i++) m.rod('metalLight', [0.03, 0.08 + i * 0.14, 0.0], [W - 0.03, 0.08 + i * 0.14, 0.0], 0.022);
  m.box('carpetBlue', [0.08, 0.2, 0.0], [W - 0.08, 0.5, 0.07]); // towel folded over two rungs
  m.box('carpetBlue', [0.08, 0.2, 0.06], [W - 0.08, 0.24, 0.07]);
  m.box('carpetWhite', [0.1, 0.5, 0.05], [W - 0.1, 0.75, 0.085]); // a second one
});
def('bathShelf', (m) => {
  const W = 0.7, D = 0.2, H = 0.4;
  m.box('metalLight', [0, 0, 0], [W, 0.025, D]);
  m.box('metalLight', [0, 0.22, 0], [W, 0.245, D]);
  for (const x of [0.04, W - 0.06]) m.box('metal', [x, 0.0, 0.0], [x + 0.02, H, 0.03]); // brackets
  for (const x of [0.04, W - 0.06]) m.box('metal', [x, 0.0, 0.0], [x + 0.02, 0.025, D]);
  for (const x of [0.12, 0.3]) m.box('carpetWhite', [x, 0.025, 0.05], [x + 0.14, 0.09, D - 0.04]); // towel rolls
  m.cylY('carpetBlue', 0.5, 0.1, 0.025, 0.17, 0.035, 0.035, 8); // soap bottle
  m.cylY('plant', 0.6, 0.1, 0.245, 0.35, 0.05, 0.05, 8); // little plant
  m.cylY('wood', 0.2, 0.1, 0.245, 0.3, 0.05, 0.045, 8);
  m.cylY('carpet', 0.38, 0.1, 0.245, 0.32, 0.03, 0.03, 8);
});
def('laundryBasket', (m) => {
  m.lathe('wood', 0.22, 0.22, [[0.17, 0], [0.2, 0.01], [0.23, 0.5]], 10);
  for (const y of [0.15, 0.3, 0.45]) m.cylY('woodDark', 0.22, 0.22, y, y + 0.02, 0.215 + y * 0.06, 0.215 + y * 0.06, 10);
  m.cylY('woodDark', 0.22, 0.22, 0.5, 0.53, 0.235, 0.235, 10);
  m.box('carpetBlue', [0.1, 0.5, 0.12], [0.26, 0.6, 0.28]); // laundry piled in the top
  m.box('carpet', [0.2, 0.5, 0.2], [0.34, 0.58, 0.32]);
  m.box('carpetWhite', [0.12, 0.5, 0.26], [0.22, 0.56, 0.34]);
  for (const x of [0.0, 0.44]) m.box('woodDark', [x - 0.015, 0.4, 0.18], [x + 0.015, 0.46, 0.26]); // handles
});


// --- laundry --------------------------------------------------------------------------------------------------------------

/**
 * Front-loading unit: a round door on a left hinge (`anim:door`, or `anim:<name>`) over the dark drum (`anim:interior`).
 * `cy` is the height of the door centre, `unit` is { y0, y1 } of the cabinet.
 */
function portholeDoor(m, inside, name, o) {
  const { cx, cy, R, D, mat = 'metal', glassMat = 'glass' } = o;
  const d = m.part(`anim:${name}`, [cx - R, cy, D + 0.03]);
  d.cyl(mat, [cx, cy, D], [cx, cy, D + 0.045], R, 12);
  d.cyl(glassMat, [cx, cy, D + 0.045], [cx, cy, D + 0.056], R - 0.065, 12);
  d.box('metalDark', [cx + R - 0.045, cy - 0.06, D + 0.045], [cx + R - 0.02, cy + 0.06, D + 0.075]); // handle
  inside.cyl('metalDark', [cx, cy, D - 0.25], [cx, cy, D + 0.006], R - 0.03, 12);
  inside.cyl('metal', [cx, cy, D + 0.006], [cx, cy, D + 0.012], R - 0.01, 12);
  inside.cyl('metalDark', [cx, cy, D + 0.012], [cx, cy, D + 0.016], R - 0.04, 12);
  inside.box('carpetBlue', [cx - 0.1, cy - 0.12, D + 0.016], [cx + 0.02, cy - 0.04, D + 0.05]); // a few clothes in the drum
  inside.box('carpet', [cx - 0.02, cy - 0.14, D + 0.016], [cx + 0.1, cy - 0.06, D + 0.045]);
}

function frontLoader(m, o) {
  const { W, D, H } = o, inside = m.part('anim:interior');
  m.box(o.body, [0, 0.03, 0], [W, H, D]);
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, 0.03, D - 0.03]);
  m.box(o.top, [-0.005, H, -0.005], [W + 0.005, H + 0.025, D + 0.01]);
  const cy = o.cy ?? 0.4, R = o.R ?? 0.22;
  m.box(o.panel ?? 'metalDark', [0.04, H - 0.14, D], [W - 0.04, H - 0.03, D + 0.012]); // control strip
  m.box('metalDark', [0.06, H - 0.12, D + 0.012], [0.22, H - 0.05, D + 0.02]); // detergent drawer
  m.box('glass', [W - 0.26, H - 0.11, D + 0.012], [W - 0.12, H - 0.06, D + 0.018]);
  knob(m, 'metalLight', W - 0.06, H - 0.085, D + 0.012, 0.02, 0.025);
  portholeDoor(m, inside, 'door', { cx: W / 2, cy, R, D, mat: o.doorMat ?? 'metal', glassMat: o.glassMat ?? 'glass' });
  return inside;
}
def('washerFrontSteel', (m) => frontLoader(m, { W: 0.62, D: 0.62, H: 0.86, body: 'metal', top: 'metalLight', doorMat: 'metalLight' }));
def('dryerVented', (m) => {
  const W = 0.64, D = 0.66, H = 0.88;
  frontLoader(m, { W, D, H, body: 'metalLight', top: 'metal', doorMat: 'metalDark', R: 0.23, cy: 0.42, panel: 'metalMedium' });
  m.box('metalMedium', [W - 0.2, H + 0.025, 0.05], [W - 0.06, H + 0.04, 0.2]); // lint filter slot on the top
  m.box('metalDark', [0.1, 0.12, D], [W - 0.1, 0.17, D + 0.012]); // ventilation slot
});
def('washerDryerStack', (m) => {
  const W = 0.64, D = 0.64, H = 1.78, inside = m.part('anim:interior');
  m.box('metalLight', [0, 0.03, 0], [W, H, D]);
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, 0.03, D - 0.03]);
  m.box('metal', [-0.005, H, -0.005], [W + 0.005, H + 0.025, D + 0.01]);
  m.box('metalDark', [0.0, 0.86, D], [W, 1.0, D + 0.012]); // control strip between the two units
  m.box('metalMedium', [0, 0.855, D - 0.005], [W, 0.862, D + 0.02]);
  m.box('glass', [W - 0.26, 0.9, D + 0.012], [W - 0.12, 0.96, D + 0.018]);
  for (const x of [0.12, 0.22, 0.32]) knob(m, 'metalLight', x, 0.93, D + 0.012, 0.022, 0.025);
  m.box('metalDark', [0.04, 1.62, D], [W - 0.04, 1.74, D + 0.012]); // top unit strip
  portholeDoor(m, inside, 'door', { cx: W / 2, cy: 0.43, R: 0.21, D, mat: 'metal' }); // washer below
  portholeDoor(m, inside, 'door2', { cx: W / 2, cy: 1.27, R: 0.21, D, mat: 'metalDark' }); // dryer above
});
def('washerTopLoad', (m) => {
  const W = 0.62, D = 0.66, H = 0.95, inside = m.part('anim:interior');
  m.box('metalLight', [0, 0.03, 0], [W, H - 0.04, D]);
  m.box('metalDark', [0.03, 0, 0.03], [W - 0.03, 0.03, D - 0.03]);
  m.box('metalLight', [0, H - 0.04, 0], [W, H, 0.26]); // raised back console
  m.box('metalMedium', [0.04, H - 0.14, 0.26], [W - 0.04, H - 0.04, 0.275]);
  m.box('glass', [0.06, H - 0.12, 0.275], [0.2, H - 0.07, 0.281]);
  for (const x of [W - 0.12, W - 0.22, W - 0.32]) m.cyl('metalDark', [x, H - 0.09, 0.275], [x, H - 0.09, 0.3], 0.025, 8);
  m.box('metalLight', [0, H - 0.04, 0.26], [0.03, H, D]); // frame of the lid opening
  m.box('metalLight', [W - 0.03, H - 0.04, 0.26], [W, H, D]);
  m.box('metalLight', [0.03, H - 0.04, D - 0.03], [W - 0.03, H, D]);
  m.cylY('metalDark', W / 2, 0.46, H - 0.04, H - 0.034, 0.22, 0.22, 12); // drum opening, seen when the lid is up
  m.box('carpetBlue', [W / 2 - 0.12, H - 0.034, 0.4], [W / 2 + 0.0, H - 0.01, 0.5]);
  const lid = m.part('anim:door', [W / 2, H - 0.02, D - 0.03]); // lid hinged on its front edge
  lid.box('metal', [0.03, H - 0.04, 0.27], [W - 0.03, H - 0.015, D - 0.03]);
  lid.box('glass', [0.1, H - 0.015, 0.34], [W - 0.1, H - 0.011, D - 0.1]);
  lid.box('metalDark', [W / 2 - 0.1, H - 0.04, D - 0.03], [W / 2 + 0.1, H - 0.01, D - 0.01]); // lip
  inside.cylY('metalLight', W / 2, 0.46, H - 0.034, H - 0.03, 0.04, 0.04, 8); // agitator
});


// --- electronics ------------------------------------------------------------------------------------------------------------

/** The picture of a screen design: a 2 mm slab on the glass, leaning back by `tilt` degrees about its bottom edge. */
function screenPart(m, x0, y0, z, x1, y1, tilt = 0, mat = 'metalMedium') {
  const t = (tilt * Math.PI) / 180, h = y1 - y0;
  m.part('anim:screen').slab(mat, [x0, y0, z], [x1 - x0, 0, 0], [0, h * Math.cos(t), -h * Math.sin(t)], [0, 0.002 * Math.sin(t), 0.002 * Math.cos(t)]);
}
/** Keyboard with keys on a flat base at (x0, z0), w x d. */
function keyboard(m, x0, y, z0, w, d, base = 'metalDark', keys = 'metalLight') {
  m.box(base, [x0, y, z0], [x0 + w, y + 0.012, z0 + d]);
  const cols = Math.floor(w / 0.027), rows = 3;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) m.box(keys, [x0 + 0.008 + c * ((w - 0.03) / cols), y + 0.012, z0 + 0.01 + r * ((d - 0.02) / rows)], [x0 + 0.008 + c * ((w - 0.03) / cols) + 0.02, y + 0.018, z0 + 0.01 + r * ((d - 0.02) / rows) + 0.02]);
}

def('tvPortable', (m) => {
  const W = 0.5, H = 0.36, D = 0.08;
  m.box('metalDark', [0, 0.06, 0.1], [W, 0.06 + H, 0.1 + D]);
  m.box('metalDark', [0.06, 0.06, 0.1 + D], [W - 0.06, 0.06 + H, 0.1 + D + 0.04]); // rear bulge
  screenPart(m, 0.025, 0.085, 0.1 + D, W - 0.025, 0.06 + H - 0.025);
  m.box('metalDark', [0.18, 0, 0.12], [W - 0.18, 0.06, 0.28]); // foot
  m.rod('metalLight', [W / 2, 0.06 + H, 0.2], [W / 2 - 0.16, 0.06 + H + 0.25, 0.2], 0.01); // rabbit ears
  m.rod('metalLight', [W / 2, 0.06 + H, 0.2], [W / 2 + 0.16, 0.06 + H + 0.25, 0.2], 0.01);
  m.box('carpet', [W - 0.05, 0.075, 0.1 + D], [W - 0.03, 0.09, 0.1 + D + 0.006]);
});
def('tvWallSlim', (m) => {
  const W = 0.95, H = 0.56, D = 0.04;
  m.box('metalDark', [0, 0, 0.03], [W, H, 0.03 + D]);
  screenPart(m, 0.012, 0.012, 0.03 + D, W - 0.012, H - 0.012);
  m.box('metalMedium', [W / 2 - 0.1, 0.1, 0], [W / 2 + 0.1, H - 0.1, 0.03]); // wall bracket
  m.box('metalMedium', [W / 2 - 0.2, H / 2 - 0.02, 0.0], [W / 2 + 0.2, H / 2 + 0.02, 0.03]);
});
def('tvCurved', (m) => {
  const W = 1.0, H = 0.58, y0 = 0.12;
  m.box('metalDark', [0, y0, 0.03], [W, y0 + H, 0.09]);
  m.hexa('metalDark', [[0, y0, 0.03], [W, y0, 0.03], [W, y0 + H, 0.03], [0, y0 + H, 0.03], [0.12, y0 + 0.08, 0.0], [W - 0.12, y0 + 0.08, 0.0], [W - 0.12, y0 + H - 0.08, 0.0], [0.12, y0 + H - 0.08, 0.0]]); // curved back hump
  for (const x of [0, W - 0.025]) m.box('metalDark', [x, y0, 0.09], [x + 0.025, y0 + H, 0.13]); // wrapping ends
  screenPart(m, 0.02, y0 + 0.02, 0.09, W - 0.02, y0 + H - 0.02);
  m.box('metalLight', [W / 2 - 0.3, 0, 0.0], [W / 2 + 0.3, 0.02, 0.2]); // wide foot
  m.box('metalLight', [W / 2 - 0.04, 0.02, 0.05], [W / 2 + 0.04, y0 + 0.05, 0.1]);
});
def('tvCrtBox', (m) => {
  const W = 0.62, H = 0.5, D = 0.5;
  m.box('metalMedium', [0, 0.04, 0.0], [W, 0.04 + H, 0.3]);
  m.hexa('metalMedium', [[0, 0.04, 0.3], [W, 0.04, 0.3], [W, 0.04 + H, 0.3], [0, 0.04 + H, 0.3], [0.04, 0.04, 0.02], [W - 0.04, 0.04, 0.02], [W - 0.04, 0.04 + H, 0.02], [0.04, 0.04 + H, 0.02]].map((p, i) => i < 4 ? [p[0], p[1], p[2] - 0.0] : p));
  m.box('metalDark', [0.02, 0.06, 0.3], [W - 0.02, 0.02 + H, 0.34]); // bezel
  m.box('metalDark', [0.03, 0.0, 0.05], [W - 0.03, 0.04, D - 0.2]); // feet
  screenPart(m, 0.05, 0.1, 0.34, W - 0.17, H - 0.0);
  m.box('wood', [W - 0.15, 0.08, 0.3], [W - 0.03, H, 0.34]); // side control panel
  for (const y of [0.4, 0.3]) m.cyl('metalLight', [W - 0.09, y, 0.34], [W - 0.09, y, 0.37], 0.03, 8);
  for (let i = 0; i < 4; i++) m.box('metalDark', [W - 0.14, 0.12 + i * 0.018, 0.34], [W - 0.04, 0.125 + i * 0.018, 0.345]);
});
def('projectorScreen', (m) => {
  const W = 0.95, H = 1.0;
  m.box('metalDark', [-0.02, H - 0.08, 0.0], [W + 0.02, H, 0.1]); // roller case
  screenPart(m, 0.0, 0.06, 0.07, W, H - 0.08, 0, 'carpetWhite');
  m.box('metalDark', [0, 0.04, 0.06], [W, 0.06, 0.09]); // weighted bar
  m.box('metalLight', [0, 0.06, 0.06], [W, H - 0.08, 0.07]); // fabric backing
  m.rod('metalMedium', [W / 2, 0.04, 0.075], [W / 2, 0.0, 0.075], 0.01);
  m.cylY('metalLight', W / 2, 0.075, -0.02, 0.0, 0.015, 0.015, 6);
});
def('pcGaming', (m) => {
  const W = 0.9;
  m.box('metalDark', [0.02, 0, 0.1], [0.24, 0.5, 0.5]); // tower
  m.box('glass', [0.025, 0.05, 0.5], [0.025 + 0.0, 0.45, 0.5]);
  m.box('glass', [0.24, 0.05, 0.18], [0.243, 0.45, 0.46]); // side window
  m.box('plant', [0.03, 0.46, 0.5], [0.23, 0.48, 0.505]); // RGB strip
  m.box('carpetBlue', [0.03, 0.04, 0.5], [0.23, 0.06, 0.505]);
  m.cyl('metalLight', [0.13, 0.32, 0.5], [0.13, 0.32, 0.51], 0.05, 10);
  m.box('metalDark', [0.3, 0, 0.18], [W - 0.04, 0.02, 0.4]); // monitor foot
  m.box('metalDark', [0.57, 0.02, 0.24], [0.63, 0.22, 0.3]);
  m.box('metalDark', [0.3, 0.2, 0.28], [W - 0.04, 0.2 + 0.46, 0.3 + 0.03]);
  screenPart(m, 0.31, 0.215, 0.33, W - 0.05, 0.2 + 0.45);
  keyboard(m, 0.36, 0, 0.55, 0.42, 0.14, 'metalDark', 'carpet');
  m.box('carpetBlue', [0.7, 0, 0.58], [0.78, 0.035, 0.66]); // mouse
});
def('pcAllInOne', (m) => {
  const W = 0.62, H = 0.44, y0 = 0.14;
  m.box('metalLight', [0, y0, 0.12], [W, y0 + H, 0.15]);
  m.box('metalLight', [0.1, y0 + 0.05, 0.06], [W - 0.1, y0 + H - 0.1, 0.12]); // thicker rear
  m.box('metalLight', [0, y0, 0.15], [W, y0 + 0.07, 0.155]); // chin
  screenPart(m, 0.012, y0 + 0.07, 0.155, W - 0.012, y0 + H - 0.012);
  m.box('metalLight', [W / 2 - 0.05, 0.0, 0.08], [W / 2 + 0.05, y0 + 0.02, 0.14]);
  m.box('metalLight', [W / 2 - 0.16, 0, 0.1], [W / 2 + 0.16, 0.012, 0.28]);
  keyboard(m, 0.1, 0, 0.42, 0.34, 0.12, 'metalLight', 'metal');
  m.box('metalLight', [0.5, 0, 0.45], [0.56, 0.03, 0.53]);
});
def('pcRetroBeige', (m) => {
  m.box('carpetWhite', [0.05, 0.0, 0.1], [0.75, 0.12, 0.5]); // flat desktop case
  m.box('metalDark', [0.1, 0.07, 0.5], [0.4, 0.09, 0.505]); // floppy slot
  m.box('metalDark', [0.5, 0.05, 0.5], [0.7, 0.07, 0.505]);
  m.box('carpetWhite', [0.12, 0.12, 0.14], [0.68, 0.5, 0.5]); // crt body
  m.hexa('carpetWhite', [[0.12, 0.12, 0.14], [0.68, 0.12, 0.14], [0.68, 0.5, 0.14], [0.12, 0.5, 0.14], [0.2, 0.18, -0.04], [0.6, 0.18, -0.04], [0.6, 0.44, -0.04], [0.2, 0.44, -0.04]]);
  m.box('carpetWhite', [0.12, 0.12, 0.5], [0.68, 0.5, 0.52]);
  screenPart(m, 0.17, 0.17, 0.52, 0.63, 0.45);
  keyboard(m, 0.1, 0, 0.6, 0.5, 0.15, 'carpetWhite', 'metal');
  m.box('metalLight', [0.7, 0, 0.62], [0.78, 0.035, 0.72]);
});
def('laptopGaming', (m) => {
  const W = 0.4, D = 0.28, BH = 0.03;
  m.box('metalDark', [0, 0, 0.0], [W, BH, D]);
  m.box('metalMedium', [0.02, BH, 0.03], [W - 0.02, BH + 0.003, 0.15]);
  keyboard(m, 0.03, BH, 0.04, W - 0.06, 0.12, 'metalMedium', 'carpet');
  m.box('metalMedium', [W / 2 - 0.05, BH, 0.19], [W / 2 + 0.05, BH + 0.002, 0.24]);
  for (let i = 0; i < 6; i++) m.box('metalMedium', [0.02, 0.005 + i * 0.004, D], [0.1, 0.007 + i * 0.004, D + 0.004]); // vents
  const tilt = (22 * Math.PI) / 180, up = [0, Math.cos(tilt), -Math.sin(tilt)], n = [0, Math.sin(tilt), Math.cos(tilt)], H = 0.26, TH = 0.02, hz = 0.03;
  m.slab('metalDark', [0, BH, hz], [W, 0, 0], up.map((v) => v * H), n.map((v) => v * TH));
  const face = [0, BH, hz].map((v, i) => v + n[i] * TH), b = 0.014;
  m.part('anim:screen').slab('metalMedium', [b, face[1] + up[1] * b, face[2] + up[2] * b], [W - 2 * b, 0, 0], up.map((v) => v * (H - 2 * b)), n.map((v) => v * 0.002));
  m.box('carpet', [W / 2 - 0.04, BH + 0.003, D - 0.01], [W / 2 + 0.04, BH + 0.01, D + 0.003]); // red light bar
});
def('laptopRetro', (m) => {
  const W = 0.34, D = 0.3, BH = 0.05;
  m.box('carpetWhite', [0, 0, 0], [W, BH, D]);
  keyboard(m, 0.03, BH, 0.04, W - 0.06, 0.13, 'carpetWhite', 'metalMedium');
  m.box('metalMedium', [0.12, BH, 0.21], [W - 0.12, BH + 0.003, 0.26]);
  const tilt = (12 * Math.PI) / 180, up = [0, Math.cos(tilt), -Math.sin(tilt)], n = [0, Math.sin(tilt), Math.cos(tilt)], H = 0.26, TH = 0.04, hz = 0.03;
  m.slab('carpetWhite', [0, BH, hz], [W, 0, 0], up.map((v) => v * H), n.map((v) => v * TH));
  const face = [0, BH, hz].map((v, i) => v + n[i] * TH), b = 0.04;
  m.part('anim:screen').slab('metalMedium', [b, face[1] + up[1] * b, face[2] + up[2] * b], [W - 2 * b, 0, 0], up.map((v) => v * (H - 2 * b)), n.map((v) => v * 0.002));
  m.box('metalLight', [W - 0.04, BH, 0.0], [W - 0.01, BH + 0.1, 0.03]); // carry handle post
});
def('tabletStand', (m) => {
  const W = 0.3, H = 0.22, tilt = (68 * Math.PI) / 180;
  const up = [0, Math.sin(tilt), -Math.cos(tilt)].map((v, i) => i === 1 ? Math.sin(tilt) : v), n = [0, Math.cos(tilt), Math.sin(tilt)];
  m.box('metal', [W / 2 - 0.1, 0, 0.0], [W / 2 + 0.1, 0.02, 0.2]); // base
  m.box('metal', [W / 2 - 0.02, 0.02, 0.1], [W / 2 + 0.02, 0.12, 0.13]);
  const o = [0, 0.1, 0.08];
  m.slab('metalDark', o, [W, 0, 0], [0, H * Math.sin(tilt), -H * Math.cos(tilt)], [0, 0.01 * Math.cos(tilt), 0.01 * Math.sin(tilt)]);
  const b = 0.015, f = [o[0], o[1] + 0.01 * Math.cos(tilt), o[2] + 0.01 * Math.sin(tilt)], u = [0, Math.sin(tilt), -Math.cos(tilt)];
  m.part('anim:screen').slab('metalMedium', [b, f[1] + u[1] * b, f[2] + u[2] * b], [W - 2 * b, 0, 0], u.map((v) => v * (H - 2 * b)), n.map((v) => v * 0.002));
  m.box('metalMedium', [W - 0.07, 0.1, 0.0], [W - 0.04, 0.12, 0.12]); // charging cable
});
def('pcUltrawide', (m) => {
  const W = 0.95;
  m.box('metalDark', [W / 2 - 0.2, 0, 0.18], [W / 2 + 0.2, 0.02, 0.36]);
  m.box('metalDark', [W / 2 - 0.04, 0.02, 0.24], [W / 2 + 0.04, 0.2, 0.3]);
  m.box('metalDark', [0.03, 0.18, 0.27], [W - 0.03, 0.18 + 0.4, 0.3]);
  m.hexa('metalDark', [[0.2, 0.2, 0.27], [W - 0.2, 0.2, 0.27], [W - 0.2, 0.5, 0.27], [0.2, 0.5, 0.27], [0.3, 0.22, 0.2], [W - 0.3, 0.22, 0.2], [W - 0.3, 0.46, 0.2], [0.3, 0.46, 0.2]]);
  screenPart(m, 0.04, 0.2, 0.3, W - 0.04, 0.18 + 0.39);
  keyboard(m, 0.2, 0, 0.5, 0.45, 0.14, 'metalMedium', 'metalLight');
  m.box('metalMedium', [0.72, 0, 0.52], [0.8, 0.03, 0.6]);
  m.box('metalDark', [0.02, 0, 0.1], [0.14, 0.34, 0.4]); // small slim tower
});

def('hifiStack', (m) => {
  const W = 0.5, D = 0.36;
  m.box('wood', [0, 0, 0], [W, 0.03, D]);
  m.box('metalDark', [0, 0.03, 0], [W, 0.1, D]); // amplifier
  m.box('metal', [0, 0.11, 0], [W, 0.18, D]); // cd player
  m.box('metalDark', [0, 0.19, 0], [W, 0.26, D]); // tuner
  m.box('wood', [0, 0.27, 0], [W, 0.3, D]);
  for (const [y0, k] of [[0.03, 'metalLight'], [0.11, 'metalDark'], [0.19, 'metalLight']]) {
    m.box('metalMedium', [0.03, y0 + 0.01, D], [W - 0.03, y0 + 0.06, D + 0.006]);
    m.box(k, [0.08, y0 + 0.025, D + 0.006], [0.2, y0 + 0.04, D + 0.01]);
    for (const x of [W - 0.1, W - 0.17]) m.cyl('metalLight', [x, y0 + 0.035, D + 0.006], [x, y0 + 0.035, D + 0.03], 0.018, 8);
  }
  m.box('glass', [0.26, 0.2, D + 0.006], [0.38, 0.24, D + 0.01]);
  for (const x of [0.04, W - 0.08]) m.box('metalDark', [x, 0, 0.04], [x + 0.04, 0.0, 0.08]);
});
def('recordPlayer', (m) => {
  const W = 0.44, D = 0.36, H = 0.1;
  m.box('wood', [0, 0.02, 0], [W, H, D]);
  m.box('metalDark', [0.02, 0, 0.02], [0.06, 0.02, 0.06]);
  m.box('metalDark', [W - 0.06, 0, 0.02], [W - 0.02, 0.02, 0.06]);
  m.cylY('metalLight', 0.19, 0.19, H, H + 0.015, 0.14, 0.14, 12); // platter
  m.cylY('metalDark', 0.19, 0.19, H + 0.015, H + 0.02, 0.125, 0.125, 12); // record
  m.cylY('carpet', 0.19, 0.19, H + 0.02, H + 0.022, 0.04, 0.04, 8);
  m.cylY('metalLight', W - 0.07, 0.08, H, H + 0.04, 0.025, 0.02, 8); // tonearm pivot
  m.rod('metalLight', [W - 0.07, H + 0.04, 0.08], [W - 0.1, H + 0.04, 0.26], 0.012);
  m.box('metalDark', [W - 0.12, H + 0.035, 0.25], [W - 0.08, H + 0.05, 0.29]);
  m.box('metalMedium', [W - 0.12, H, D - 0.07], [W - 0.04, H + 0.01, D - 0.03]);
  const lid = m.part('anim:lid', [W / 2, H + 0.04, 0.0]);
  lid.box('glass', [0.01, H + 0.0, 0.0], [W - 0.01, H + 0.045, D]); // dust cover
  lid.box('metalDark', [0.01, H + 0.045, 0.0], [W - 0.01, H + 0.05, D]);
  lid.box('metalDark', [0.01, H + 0.0, D - 0.01], [W - 0.01, H + 0.045, D]);
});
def('boombox', (m) => {
  const W = 0.5, D = 0.18, H = 0.26;
  m.box('metalMedium', [0, 0, 0], [W, H, D]);
  for (const x of [0.08, W - 0.08]) { m.cyl('metalDark', [x, 0.12, D], [x, 0.12, D + 0.015], 0.07, 10); m.cyl('metalLight', [x, 0.12, D + 0.015], [x, 0.12, D + 0.025], 0.025, 8); }
  m.box('metalDark', [0.17, 0.08, D], [W - 0.17, 0.2, D + 0.01]); // cassette deck
  m.box('glass', [0.2, 0.14, D + 0.01], [W - 0.2, 0.19, D + 0.015]);
  for (let i = 0; i < 4; i++) m.box('metalLight', [0.19 + i * 0.03, 0.04, D], [0.21 + i * 0.03, 0.065, D + 0.012]);
  m.rod('metal', [0.06, H, D / 2], [0.14, H + 0.07, D / 2], 0.02);
  m.rod('metal', [W - 0.06, H, D / 2], [W - 0.14, H + 0.07, D / 2], 0.02);
  m.rod('metal', [0.14, H + 0.07, D / 2], [W - 0.14, H + 0.07, D / 2], 0.02); // carry handle
  m.rod('metalLight', [W - 0.05, H, 0.04], [W - 0.12, H + 0.2, 0.04], 0.008); // aerial
});
def('soundbar', (m) => {
  const W = 0.9, D = 0.1, H = 0.07;
  m.box('metalDark', [0, 0.02, 0], [W, 0.02 + H, D]);
  m.box('metalMedium', [0.01, 0.03, D], [W - 0.01, 0.02 + H - 0.01, D + 0.004]); // grille
  for (let i = 0; i < 12; i++) m.box('metalDark', [0.04 + i * 0.07, 0.04, D + 0.004], [0.05 + i * 0.07, 0.07, D + 0.008]);
  for (const x of [0.06, W - 0.1]) m.box('metalLight', [x, 0, 0.02], [x + 0.04, 0.02, D - 0.02]);
  m.box('plant', [W - 0.12, 0.07, D], [W - 0.08, 0.075, D + 0.008]);
});
def('speakerSatellites', (m) => {
  for (const x of [0.12, 0.62]) {
    m.cylY('metalDark', x, 0.15, 0, 0.02, 0.1, 0.1, 10);
    m.rod('metal', [x, 0.02, 0.15], [x, 0.5, 0.15], 0.03);
    m.box('metalDark', [x - 0.09, 0.5, 0.08], [x + 0.09, 0.72, 0.22]);
    m.cyl('metalMedium', [x, 0.6, 0.22], [x, 0.6, 0.235], 0.055, 10);
    m.cyl('metalLight', [x, 0.6, 0.235], [x, 0.6, 0.245], 0.02, 8);
    m.cyl('metalMedium', [x, 0.68, 0.22], [x, 0.68, 0.23], 0.02, 8);
  }
  m.rod('metalMedium', [0.12, 0.02, 0.12], [0.62, 0.02, 0.12], 0.01); // speaker cable
});

def('consoleSet', (m) => {
  const W = 0.9, D = 0.45;
  m.box('woodDark', [0, 0, 0], [W, 0.04, D]);
  m.box('wood', [0, 0.04, 0], [0.03, 0.28, D]); m.box('wood', [W - 0.03, 0.04, 0], [W, 0.28, D]);
  m.box('wood', [0, 0.28, 0], [W, 0.31, D]);
  m.box('metalLight', [0.1, 0.04, 0.1], [0.42, 0.1, 0.38]); // console on the lower shelf
  m.box('metalDark', [0.1, 0.1, 0.1], [0.42, 0.14, 0.38]);
  m.box('plant', [0.14, 0.14, 0.34], [0.38, 0.145, 0.37]);
  m.box('metalDark', [0.55, 0.04, 0.25], [0.64, 0.056, 0.33]); // controllers
  m.box('carpet', [0.68, 0.04, 0.25], [0.77, 0.056, 0.33]);
  m.box('metalDark', [0.25, 0.31, 0.12], [0.65, 0.34, 0.3]); // tv foot
  m.box('metalDark', [0.05, 0.34, 0.14], [W - 0.05, 0.34 + 0.5, 0.2]);
  screenPart(m, 0.065, 0.355, 0.2, W - 0.065, 0.34 + 0.485);
});
def('homeCinema', (m) => {
  const W = 1.7, D = 0.45;
  m.box('woodDark', [0, 0, 0], [W, 0.05, D]);
  m.box('woodDark', [0, 0.05, 0], [0.04, 0.5, D]); m.box('woodDark', [W - 0.04, 0.05, 0], [W, 0.5, D]); m.box('woodDark', [W / 2 - 0.02, 0.05, 0], [W / 2 + 0.02, 0.5, D]);
  m.box('wood', [0, 0.5, 0], [W, 0.54, D]);
  m.box('metalDark', [0.3, 0.1, D - 0.05], [W / 2 - 0.1, 0.2, D]); // av gear on shelves
  m.box('metalLight', [W / 2 + 0.1, 0.1, 0.1], [W - 0.3, 0.16, D - 0.08]);
  m.box('metalDark', [0.2, 0.54, 0.1], [W - 0.2, 0.57, 0.3]);
  m.box('metalDark', [0.06, 0.57, 0.13], [W - 0.06, 0.57 + 0.9, 0.2]);
  screenPart(m, 0.075, 0.585, 0.2, W - 0.075, 0.57 + 0.885);
  m.box('metalMedium', [0.4, 0.54, D - 0.1], [W - 0.4, 0.61, D]); // soundbar in front
  for (const x of [0.02, W - 0.2]) { m.box('metalDark', [x, 0.54, 0.05], [x + 0.18, 0.86, 0.25]); m.cyl('metalMedium', [x + 0.09, 0.7, 0.25], [x + 0.09, 0.7, 0.265], 0.06, 10); }
});
def('arcadeCabinet', (m) => {
  const W = 0.72, D = 0.85, H = 1.8;
  m.box('metalDark', [0, 0, 0.1], [W, 0.9, D]); // lower body
  m.box('carpetBlue', [0, 0.0, 0.1], [0.03, H - 0.1, 0.78]); m.box('carpetBlue', [W - 0.03, 0.0, 0.1], [W, H - 0.1, 0.78]); // side art
  m.box('metalDark', [0.03, 0.9, 0.1], [W - 0.03, H - 0.1, 0.3]); // back of the upper cabinet
  m.box('metalDark', [0.03, 0.9, 0.3], [W - 0.03, 1.1, 0.62]);
  m.box('metalDark', [0.03, 1.0, 0.62], [W - 0.03, 1.5, 0.66]); // screen frame
  screenPart(m, 0.08, 1.04, 0.665, W - 0.08, 1.46, 8);
  m.box('carpet', [0.03, 1.6, 0.1], [W - 0.03, H, 0.7]); // marquee
  m.box('glass', [0.06, 1.62, 0.7], [W - 0.06, H - 0.04, 0.704]);
  m.box('metalDark', [0.03, 0.9, 0.62], [W - 0.03, 1.0, D]); // control panel, sloped look
  m.box('metalMedium', [0.0, 0.88, 0.62], [W, 0.92, D + 0.05]);
  m.cylY('metalLight', 0.2, 0.76, 0.92, 0.98, 0.012, 0.012, 6);
  m.cylY('carpet', 0.2, 0.76, 0.98, 1.02, 0.03, 0.03, 8);
  for (const [x, mat] of [[0.42, 'carpet'], [0.5, 'plant'], [0.58, 'carpetBlue']]) m.cylY(mat, x, 0.78, 0.92, 0.94, 0.025, 0.025, 8);
  m.box('metalLight', [0.1, 0.0, 0.05], [W - 0.1, 0.05, 0.1]);
});

export default { fridgeRetroTall, laptopThin, ...EXTRA };
