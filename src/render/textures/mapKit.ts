// Surface detail maps: seamless 512 px greyscale images (AI-generated, see tools/build-surface-maps.mjs and
// dev/surfaces-ai/) that a palette tints at runtime. This file is the pure side (no DOM, no three.js): the
// provider hook the painters read maps through, and a tiled-rectangle draw helper. The browser side, which
// loads the images and builds the tinted canvases, is surfaceMaps.ts.
//
// Tint: map value 0 -> palette dark, 0.5 -> palette base, 1 -> palette light, so a palette's colours are
// ordered [base, light, dark, ...] for every map painter, like the procedural wood painters.

import type { SurfaceDesign } from '../../content/types';
import type { Canvas2DLike } from './painterKit';

import { MATERIAL_MAP_IDS, MOTIF_IDS, MURAL_IDS } from './surfaceMapIds.generated';

/** Every detail map (public/assets/surfaces/<id>.webp); generated from the files by tools/build-surface-maps.mjs. */
export const MAP_IDS = MATERIAL_MAP_IDS;
export type MapId = (typeof MAP_IDS)[number];
export { MOTIF_IDS, MURAL_IDS };

/** The 14 original detail maps: preloaded at start-up; every other image loads on demand (or with its lot). */
export const BASE_MAP_IDS: readonly string[] = [
  'grain-oak', 'grain-barn', 'stone-marble', 'stone-slate', 'fibre-berber', 'fibre-sisal',
  'concrete-aggregate', 'gravel', 'lawn',
  'plaster-rough', 'grasscloth', 'rubble-stone', 'slate-ledge', 'concrete-board',
];

/** What an id names: a material detail map, a motif mask (tinted with one colour) or a mural. */
export type MapKind = 'material' | 'motif' | 'mural';

/**
 * Returns a tinted, drawable image for the palette colours, or null while it is not available.
 * material: colours [base, light, dark] tint the map; motif: colours[0] is the ink colour; mural: [base, light, dark]
 * as a tritone.
 */
export type MapProvider = (mapId: string, colors: readonly string[], kind?: MapKind) => unknown;

let provider: MapProvider | null = null;

export function setSurfaceMapProvider(p: MapProvider | null): void {
  provider = p;
}

export function surfaceMapImage(mapId: string, colors: readonly string[], kind: MapKind = 'material'): unknown {
  return provider ? provider(mapId, colors, kind) : null;
}

/** Params that name an image: map and ground (material), motif and motif2, mural. */
const PARAM_KINDS: ReadonlyArray<readonly [string, MapKind]> = [
  ['map', 'material'], ['ground', 'material'], ['motif', 'motif'], ['motif2', 'motif'], ['mural', 'mural'],
];

/**
 * Every map, motif and mural id a design's params reference (empty for purely procedural painters). Older painters
 * use a `motif` param for procedural shapes ('chevron', 0.48), so motif and mural values only count when they name
 * an existing image; a misspelt id is caught by checkParams (the painter's enum), not here.
 */
export function designMaps(design: Pick<SurfaceDesign, 'params'>): string[] {
  const out: string[] = [];
  for (const [key, kind] of PARAM_KINDS) {
    const v = design.params[key];
    if (typeof v !== 'string' || v === '' || out.includes(v)) continue;
    if (kind === 'material' || (kind === 'motif' ? MOTIF_IDS : MURAL_IDS).includes(v)) out.push(v);
  }
  return out;
}

/** Kind of an id by the list it is in (material when unknown). */
export function mapKindOf(id: string): MapKind {
  if ((MOTIF_IDS as readonly string[]).includes(id)) return 'motif';
  if ((MURAL_IDS as readonly string[]).includes(id)) return 'mural';
  return 'material';
}

/**
 * Fills the rectangle (x, y, w, h) (metres) with the map repeated in squares of `tileM` metres whose corner
 * grid starts at (ox, oy). Tiles overdraw by about half a pixel so no hairline gaps open between them.
 * Returns false (drawing nothing) when the canvas or the image is missing.
 */
export function drawMapRect(
  ctx: Canvas2DLike, image: unknown, x: number, y: number, w: number, h: number, tileM: number, ox: number, oy: number, ppm: number,
): boolean {
  if (!image || !ctx.drawImage || w <= 0 || h <= 0) return false;
  const pad = 0.6 / ppm;
  const i0 = Math.floor((x - ox) / tileM), i1 = Math.ceil((x + w - ox) / tileM);
  const j0 = Math.floor((y - oy) / tileM), j1 = Math.ceil((y + h - oy) / tileM);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) ctx.drawImage(image, ox + i * tileM, oy + j * tileM, tileM + pad, tileM + pad);
  }
  ctx.restore();
  return true;
}
