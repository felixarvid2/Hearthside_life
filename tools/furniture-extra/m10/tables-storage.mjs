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

export default { chestOfDrawers };
