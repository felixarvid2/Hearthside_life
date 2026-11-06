// Shape of the generated <group>.models.ts files (written by tools/build-extra-furniture.mjs from the built GLBs).

export type M10Vec3 = [number, number, number];

/** Picture rectangle of an `anim:screen` part in model space (the units of the GLB / manifest). */
export interface M10ScreenQuad {
  centre: M10Vec3;
  /** Unit normal pointing out of the glass. */
  normal: M10Vec3;
  width: number;
  height: number;
}

export interface M10ModelInfo {
  /** Manifest min/max of the model, before the def's scale. */
  bounds: [min: M10Vec3, max: M10Vec3];
  screen?: M10ScreenQuad;
}
