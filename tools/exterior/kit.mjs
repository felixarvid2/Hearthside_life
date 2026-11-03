// Modelling kit for the exterior models: the furniture kit (tools/furniture-extra/kit.mjs) plus a few outdoor materials.
// The extra materials are added to the shared COLORS table, so GLB writing and the thumbnail renderer know them. Finish
// regions in src/content/exteriorObjects.ts recolour the kit's own names (wood, woodDark, metal, ...) like any furniture.

import { COLORS, Model } from '../furniture-extra/kit.mjs';

Object.assign(COLORS, {
  stone: [0.66, 0.64, 0.6], stoneDark: [0.45, 0.44, 0.42], soil: [0.33, 0.23, 0.16], leafDark: [0.14, 0.5, 0.33],
  blossomYellow: [0.96, 0.8, 0.25], blossomPink: [0.93, 0.55, 0.68], blossomPurple: [0.6, 0.45, 0.82],
  terracotta: [0.76, 0.4, 0.27], straw: [0.87, 0.74, 0.36], lamp: [1.0, 0.9, 0.55], water: [0.45, 0.72, 0.85],
});

export { COLORS, Model };

/** A soft dome of foliage: bottom centre (cx, y, cz), radius r, height h. */
export function dome(m, cx, cz, y, r, h, mat = 'plant', seg = 10) {
  m.lathe(mat, cx, cz, [[0.0, y], [r * 0.72, y + h * 0.1], [r, y + h * 0.45], [r * 0.8, y + h * 0.82], [0.0, y + h]], seg);
}

/** A small round bloom (a flat button) at a point. */
export function bloom(m, x, y, z, mat, r = 0.05) {
  m.lathe(mat, x, z, [[0.0, y - r * 0.4], [r, y - r * 0.1], [r * 0.8, y + r * 0.3], [0.0, y + r * 0.5]], 6);
}

/** Deterministic noise in [0, 1). */
export function rnd(i, j = 0) {
  let x = (i * 374761393 + j * 668265263 + 1274126177) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
