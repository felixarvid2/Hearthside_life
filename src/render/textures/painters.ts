// Painter registry and texture layout. Pure (no three.js, no DOM): paints a SurfaceDesign + Palette into
// any Canvas2DLike, so it runs in tests against a fake context and in the browser against a real canvas.
//
// Layout: a texture covers one repeat. Walls: `design.repeat` metres wide x WALL_TEXTURE_HEIGHT (2.8 m)
// tall, seamless horizontally. Floors: repeat x repeat metres, seamless both ways. Pixel density is
// chosen so the larger side is at most MAX_PX_PER_REPEAT[quality].

import type { Palette, SurfaceDesign } from '../../content/types';
import { findPalette } from '../../content/surfaces';
import { FLOOR_PAINTERS } from './floorPainters';
import { hashString, mixSeed, resolveParams, type Canvas2DLike, type PainterDef, type PaintSpec } from './painterKit';
import { WALL_MATERIAL_PAINTERS } from './wallMaterials';
import { WALL_PATTERN_PAINTERS } from './wallPatterns';

export type { Canvas2DLike, PainterDef, PaintSpec, ParamSpec, ParamValue } from './painterKit';
export { checkParams } from './painterKit';

/** Height in metres that a wall texture spans vertically (M1 wall height). */
export const WALL_TEXTURE_HEIGHT = 2.8;

export type TextureQuality = 'low' | 'high';

/** Largest texture side in pixels for one repeat. */
export const MAX_PX_PER_REPEAT: Readonly<Record<TextureQuality, number>> = { low: 256, high: 512 };

/** Every painter by id. Designs reference painters through `SurfaceDesign.painter`. */
export const PAINTERS: Readonly<Record<string, PainterDef>> = Object.freeze(
  Object.fromEntries([...WALL_PATTERN_PAINTERS, ...WALL_MATERIAL_PAINTERS, ...FLOOR_PAINTERS].map((p) => [p.id, p])),
);

export function painterFor(design: SurfaceDesign): PainterDef {
  const p = PAINTERS[design.painter];
  if (!p) throw new Error(`No painter '${design.painter}' for surface design '${design.id}'`);
  return p;
}

/** Size of one texture repeat in metres and pixels. */
export interface TextureLayout {
  widthM: number;
  heightM: number;
  widthPx: number;
  heightPx: number;
  /** Pixels per metre (the larger side is capped at the quality limit). */
  ppm: number;
  wrapY: boolean;
}

export function textureLayout(design: SurfaceDesign, quality: TextureQuality | number): TextureLayout {
  const maxPx = typeof quality === 'number' ? quality : MAX_PX_PER_REPEAT[quality];
  const widthM = design.repeat;
  const heightM = design.surface === 'wall' ? WALL_TEXTURE_HEIGHT : design.repeat;
  const ppm = maxPx / Math.max(widthM, heightM);
  return {
    widthM, heightM, ppm,
    widthPx: Math.max(1, Math.round(widthM * ppm)),
    heightPx: Math.max(1, Math.round(heightM * ppm)),
    wrapY: design.surface === 'floor',
  };
}

/** Layout seed of a design: palette changes never move the pattern. */
export function designSeed(design: SurfaceDesign): number {
  const extra = design.params.seed;
  return mixSeed(hashString(design.id), typeof extra === 'number' ? extra : 0);
}

export function paintSpecFor(design: SurfaceDesign, palette: Palette, ppm: number): PaintSpec {
  const painter = painterFor(design);
  return {
    w: design.repeat,
    h: design.surface === 'wall' ? WALL_TEXTURE_HEIGHT : design.repeat,
    wrapY: design.surface === 'floor',
    colors: palette.colors,
    params: resolveParams(painter, design.params),
    seed: designSeed(design),
    ppm,
  };
}

/** Paints one texture repeat into a context whose pixel size matches `layout`. */
export function paintDesign(ctx: Canvas2DLike, design: SurfaceDesign, paletteId: string, layout: TextureLayout): void {
  const painter = painterFor(design);
  const spec = paintSpecFor(design, findPalette(design, paletteId), layout.ppm);
  ctx.save();
  ctx.scale(layout.widthPx / layout.widthM, layout.heightPx / layout.heightM);
  painter.paint(ctx, spec);
  ctx.restore();
}

/**
 * Paints a square catalog thumbnail (`px` x `px`) at real scale: `painter.thumbSpan` metres across.
 * Walls show the lowest part of the wall (skirting, dado and panel structure); floors show a corner of
 * the repeat. Repeats are re-painted as vectors and clipped, so thumbnails stay crisp.
 */
export function paintThumbnail(ctx: Canvas2DLike, design: SurfaceDesign, paletteId: string, px: number): void {
  const painter = painterFor(design);
  const wall = design.surface === 'wall';
  const span = Math.min(painter.thumbSpan, wall ? WALL_TEXTURE_HEIGHT : Infinity);
  const ppm = px / span;
  const spec = paintSpecFor(design, findPalette(design, paletteId), ppm);
  const nx = Math.ceil(span / spec.w - 1e-9);
  const ny = wall ? 1 : Math.ceil(span / spec.h - 1e-9);
  // whole-pixel repeat sizes, so the clipped repeats meet on pixel boundaries (no hairline seams)
  const sx = Math.max(1, Math.round(spec.w * ppm)) / spec.w;
  const sy = wall ? ppm : Math.max(1, Math.round(spec.h * ppm)) / spec.h;
  ctx.save();
  ctx.scale(sx, sy);
  if (wall) ctx.translate(0, -(spec.h - span));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      ctx.save();
      ctx.translate(i * spec.w, j * spec.h);
      ctx.beginPath();
      ctx.rect(0, 0, spec.w, spec.h);
      ctx.clip();
      painter.paint(ctx, spec);
      ctx.restore();
    }
  }
  ctx.restore();
}
