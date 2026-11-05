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

export default { fridgeRetroTall, laptopThin };
