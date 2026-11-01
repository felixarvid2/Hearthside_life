// Wall and floor textures for the renderer: procedural CanvasTextures with a shared, reference-counted
// cache, plus cached catalog thumbnails (data URLs).
//
// UV CONVENTION (the renderer must use exactly this so patterns line up along runs and across tiles):
//
//   Walls:  u = (world coordinate along the wall axis) / design.repeat
//                (x for 'h' edges, z for 'v' edges, in metres; use the absolute world coordinate, not a
//                 per-segment 0..1, so adjacent wall segments and the pieces around door/window holes
//                 continue the same pattern)
//           v = (height above the floor of that level) / WALL_TEXTURE_HEIGHT   (2.8 m -> v = 1)
//           The texture is one repeat wide and the full wall tall: wrapS = Repeat, wrapT = ClampToEdge.
//           Canvas row 0 (top) is the top of the wall (flipY = true maps it to v = 1). Skirting boards,
//           dado rails and tile courses are painted at their real heights above the floor.
//   Floors: uv = (worldX, worldZ) / design.repeat, both wrap = Repeat. Planks run along world x.
//
// Both faces of a wall use the same u formula, so a face seen from the opposite side shows the pattern
// mirrored; no painter draws handed content (text, arrows), so this is acceptable and keeps the pattern
// continuous around corners and openings on each side.
//
// Ownership: getSurfaceTexture() returns a texture with one reference held by the caller. Call
// releaseSurfaceTexture() when the material stops using it (or retainSurfaceTexture() for extra owners).
// Unreferenced textures stay in a small idle pool (fast re-use when a player previews finishes) and are
// disposed when evicted or on purgeUnusedSurfaceTextures(). Never call texture.dispose() yourself.

import * as THREE from 'three';
import type { SurfaceDesign } from '../../content/types';
import { findPalette } from '../../content/surfaces';
import { designMaps } from './mapKit';
import { paintDesign, paintThumbnail, textureLayout, type TextureQuality } from './painters';
import { surfaceMapsSettled, whenSurfaceMapsLoaded } from './surfaceMaps';

export { MAX_PX_PER_REPEAT, WALL_TEXTURE_HEIGHT, type TextureQuality } from './painters';

interface Entry {
  key: string;
  texture: THREE.CanvasTexture;
  refs: number;
  bytes: number;
}

const live = new Map<string, Entry>();
const byTexture = new Map<THREE.Texture, Entry>();
/** Unreferenced entries, oldest first (Map keeps insertion order). */
const idle = new Map<string, Entry>();

const config = { anisotropy: { low: 2, high: 8 } as Record<TextureQuality, number>, idleLimit: 12, idleBytes: 12 * 1024 * 1024 };
let idleBytes = 0;

/**
 * Tunes texture creation and the idle pool. `anisotropy` is clamped by three.js to the device maximum;
 * the idle pool keeps at most `idleLimit` unreferenced textures and `idleBytes` of their estimated memory.
 */
export function configureSurfaceTextures(opts: {
  anisotropy?: Partial<Record<TextureQuality, number>>; idleLimit?: number; idleBytes?: number;
}): void {
  if (opts.anisotropy) Object.assign(config.anisotropy, opts.anisotropy);
  if (opts.idleLimit !== undefined) config.idleLimit = Math.max(0, Math.floor(opts.idleLimit));
  if (opts.idleBytes !== undefined) config.idleBytes = Math.max(0, opts.idleBytes);
  trimIdle();
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return ctx;
}

/** Cache key for a texture. */
export function surfaceTextureKey(design: SurfaceDesign, paletteId: string, quality: TextureQuality): string {
  return `${design.surface}:${design.id}:${findPalette(design, paletteId).id}:${quality}`;
}

/** Metadata stored in `texture.userData.surface`. */
export interface SurfaceTextureInfo {
  designId: string;
  paletteId: string;
  surface: 'wall' | 'floor';
  quality: TextureQuality;
  /** Metres covered by one repeat horizontally (u = coordinate / repeat). */
  repeat: number;
  /** Metres covered vertically (walls: 2.8; floors: repeat). */
  heightM: number;
}

function createTexture(design: SurfaceDesign, paletteId: string, quality: TextureQuality): Entry {
  const layout = textureLayout(design, quality);
  const canvas = makeCanvas(layout.widthPx, layout.heightPx);
  const ctx = context2d(canvas);
  paintDesign(ctx, design, paletteId, layout);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = design.surface === 'floor' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = config.anisotropy[quality];
  tex.name = `surface:${design.id}:${findPalette(design, paletteId).id}:${quality}`;
  const info: SurfaceTextureInfo = {
    designId: design.id, paletteId: findPalette(design, paletteId).id, surface: design.surface, quality,
    repeat: layout.widthM, heightM: layout.heightM,
  };
  tex.userData.surface = info;
  tex.needsUpdate = true;
  // designs built on a detail map are painted flat until the map has loaded, then repainted in place
  const maps = designMaps(design);
  if (!surfaceMapsSettled(maps)) {
    void whenSurfaceMapsLoaded(maps).then(() => {
      paintDesign(ctx, design, paletteId, layout);
      tex.needsUpdate = true;
    });
  }
  // RGBA plus about one third for the mip chain
  const bytes = Math.round(layout.widthPx * layout.heightPx * 4 * 4 / 3);
  return { key: surfaceTextureKey(design, paletteId, quality), texture: tex, refs: 0, bytes };
}

/**
 * Returns the texture for a design + palette + quality and takes one reference to it. Unknown palette
 * ids fall back to the design default. Pair every call with releaseSurfaceTexture().
 */
export function getSurfaceTexture(design: SurfaceDesign, paletteId: string, quality: TextureQuality): THREE.CanvasTexture {
  const key = surfaceTextureKey(design, paletteId, quality);
  let entry = live.get(key);
  if (!entry) {
    entry = idle.get(key);
    if (entry) { idle.delete(key); idleBytes -= entry.bytes; }
    else {
      entry = createTexture(design, paletteId, quality);
      byTexture.set(entry.texture, entry);
    }
    live.set(key, entry);
  }
  entry.refs++;
  return entry.texture;
}

/** Adds an owner to a texture obtained from getSurfaceTexture(). */
export function retainSurfaceTexture(tex: THREE.Texture): void {
  const entry = byTexture.get(tex);
  if (!entry || entry.refs <= 0) throw new Error('retainSurfaceTexture: texture is not a live surface texture');
  entry.refs++;
}

/** Drops one owner. At zero owners the texture moves to the idle pool and is disposed when evicted. */
export function releaseSurfaceTexture(tex: THREE.Texture): void {
  const entry = byTexture.get(tex);
  if (!entry || entry.refs <= 0) return; // tolerate double release after a purge
  entry.refs--;
  if (entry.refs > 0) return;
  live.delete(entry.key);
  idle.set(entry.key, entry);
  idleBytes += entry.bytes;
  trimIdle();
}

function disposeEntry(entry: Entry): void {
  byTexture.delete(entry.texture);
  entry.texture.dispose();
}

function trimIdle(): void {
  while (idle.size > config.idleLimit || (idle.size > 0 && idleBytes > config.idleBytes)) {
    const first = idle.values().next().value as Entry | undefined;
    if (!first) break;
    idle.delete(first.key);
    idleBytes -= first.bytes;
    disposeEntry(first);
  }
}

/** Disposes every unreferenced texture now. Returns how many were disposed. */
export function purgeUnusedSurfaceTextures(): number {
  const n = idle.size;
  for (const e of idle.values()) disposeEntry(e);
  idle.clear();
  idleBytes = 0;
  return n;
}

/** Disposes everything, including referenced textures (renderer teardown only). */
export function disposeAllSurfaceTextures(): void {
  purgeUnusedSurfaceTextures();
  for (const e of live.values()) disposeEntry(e);
  live.clear();
  thumbs.clear();
}

/** Counts for the developer overlay. */
export function surfaceTextureStats(): { live: number; idle: number; refs: number; bytes: number; thumbnails: number } {
  let refs = 0, bytes = 0;
  for (const e of live.values()) { refs += e.refs; bytes += e.bytes; }
  for (const e of idle.values()) bytes += e.bytes;
  return { live: live.size, idle: idle.size, refs, bytes, thumbnails: thumbs.size };
}

// ---------------------------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------------------------

const THUMB_LIMIT = 600;
const thumbs = new Map<string, string>();

/**
 * Square catalog thumbnail (PNG data URL) of a design and palette at real scale. Cached (bounded LRU),
 * so calling it on every UI render is cheap.
 */
export function surfaceThumbnail(design: SurfaceDesign, paletteId: string, px = 96): string {
  const size = Math.max(8, Math.round(px));
  const key = `${design.surface}:${design.id}:${findPalette(design, paletteId).id}:${size}`;
  const hit = thumbs.get(key);
  if (hit) {
    thumbs.delete(key);
    thumbs.set(key, hit);
    return hit;
  }
  const canvas = makeCanvas(size, size);
  const ctx = context2d(canvas);
  paintThumbnail(ctx, design, paletteId, size);
  const url = canvas.toDataURL('image/png');
  // a thumbnail painted before its detail map arrived is flat: do not keep it, the next call repaints it
  if (!surfaceMapsSettled(designMaps(design))) return url;
  thumbs.set(key, url);
  if (thumbs.size > THUMB_LIMIT) {
    const oldest = thumbs.keys().next().value as string | undefined;
    if (oldest !== undefined) thumbs.delete(oldest);
  }
  return url;
}

/** Paints a texture repeat into a new canvas (dev tools, seam checks). Not cached. */
export function paintSurfaceCanvas(design: SurfaceDesign, paletteId: string, quality: TextureQuality | number): HTMLCanvasElement {
  const layout = textureLayout(design, quality);
  const canvas = makeCanvas(layout.widthPx, layout.heightPx);
  paintDesign(context2d(canvas), design, paletteId, layout);
  return canvas;
}
