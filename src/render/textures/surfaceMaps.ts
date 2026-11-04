// Browser side of the surface detail maps (see mapKit.ts): loads public/assets/surfaces/<id>.webp (materials),
// motifs/<id>.webp and murals/<id>.webp once per image, keeps the greyscale in memory and builds palette-tinted
// canvases on demand (small LRU caches per kind).
//
// Textures are painted synchronously, so a design whose map has not arrived yet is painted with its flat
// fallback; surfaceTextures.ts repaints it as soon as the map is there (whenSurfaceMapsLoaded) and does not
// cache thumbnails made without their map. Loading is on demand: a painter that asks for an image that is not
// loaded starts the load and gets null; onSurfaceMapArrived() tells the UI to repaint. preloadSurfaceMaps(ids)
// avoids the fallback for the images a scene is known to use.

import { MAP_IDS, mapKindOf, setSurfaceMapProvider, type MapKind } from './mapKit';
import { hexToRgb } from './painterKit';

/** Pixel size of each kind's image and the sub-folder of public/assets/surfaces that holds it. */
const KIND: Record<MapKind, { w: number; h: number; dir: string; tintLimit: number }> = {
  material: { w: 512, h: 512, dir: '', tintLimit: 24 },
  motif: { w: 256, h: 256, dir: 'motifs/', tintLimit: 160 },
  mural: { w: 1024, h: 512, dir: 'murals/', tintLimit: 8 },
};

let baseUrl = './assets/surfaces/';
const grey = new Map<string, Uint8ClampedArray>();
const loading = new Map<string, Promise<void>>();
const failed = new Set<string>();
/** One LRU per kind (Map keeps insertion order). */
const tints: Record<MapKind, Map<string, HTMLCanvasElement>> = { material: new Map(), motif: new Map(), mural: new Map() };
const arrivalListeners = new Set<(id: string) => void>();

/** Directory URL (trailing slash) that holds the map files; default './assets/surfaces/'. */
export function setSurfaceMapBase(url: string): void {
  baseUrl = url.endsWith('/') ? url : `${url}/`;
}

/**
 * Calls `fn(id)` whenever an image arrived (or failed for good), so textures and catalog thumbnails that were
 * painted without it can repaint. Returns the unsubscribe function.
 */
export function onSurfaceMapArrived(fn: (id: string) => void): () => void {
  arrivalListeners.add(fn);
  return () => { arrivalListeners.delete(fn); };
}

const canLoad = () => typeof document !== 'undefined' && typeof createImageBitmap === 'function' && typeof fetch === 'function';

function load(id: string): Promise<void> {
  const known = loading.get(id);
  if (known) return known;
  const kind = mapKindOf(id);
  const { w, h, dir } = KIND[kind];
  const p = (async () => {
    try {
      const res = await fetch(`${baseUrl}${dir}${id}.webp`);
      if (!res.ok) throw new Error(`${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(bmp, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const g = new Uint8ClampedArray(w * h);
      for (let i = 0; i < g.length; i++) g[i] = rgba[i * 4] ?? 128;
      grey.set(id, g);
      bmp.close();
    } catch (e) {
      failed.add(id);
      console.warn(`[surfaces] map '${id}' unavailable`, e);
    }
    for (const fn of [...arrivalListeners]) fn(id);
  })();
  loading.set(id, p);
  return p;
}

/** Starts loading maps (default: the material maps) and resolves when each has loaded or failed. */
export function preloadSurfaceMaps(ids: readonly string[] = MAP_IDS): Promise<void> {
  if (!canLoad()) return Promise.resolve();
  return Promise.all(ids.map(load)).then(() => undefined);
}

/** True when every listed map has loaded (or failed for good, so waiting is pointless). */
export function surfaceMapsSettled(ids: readonly string[]): boolean {
  return ids.every((id) => grey.has(id) || failed.has(id));
}

/** Resolves once the maps have loaded or failed; starts loading them. */
export function whenSurfaceMapsLoaded(ids: readonly string[]): Promise<void> {
  return preloadSurfaceMaps(ids);
}

function remember(kind: MapKind, key: string, c: HTMLCanvasElement): void {
  const cache = tints[kind];
  cache.set(key, c);
  if (cache.size > KIND[kind].tintLimit) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** A canvas filled from a greyscale image through `pixel(value, out, offset)`. */
function paintGrey(id: string, kind: MapKind, key: string, pixel: (v: number, d: Uint8ClampedArray, o: number) => void): HTMLCanvasElement | null {
  const g = grey.get(id);
  if (!g) return null;
  const hit = tints[kind].get(key);
  if (hit) { tints[kind].delete(key); tints[kind].set(key, hit); return hit; }
  const { w, h } = KIND[kind];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < g.length; i++) pixel(g[i] ?? 0, d, i * 4);
  ctx.putImageData(img, 0, 0);
  remember(kind, key, c);
  return c;
}

/** Tritone ramp, 256 entries: 0 -> dark, 128 -> base, 255 -> light. */
function tritone(colors: readonly string[]): Uint8ClampedArray {
  const base = hexToRgb(colors[0] ?? '#808080');
  const light = hexToRgb(colors[1] ?? '#ffffff');
  const dark = hexToRgb(colors[2] ?? '#000000');
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const lo = v < 128;
    const t = lo ? v / 128 : (v - 128) / 127;
    const a = lo ? dark : base, b = lo ? base : light;
    for (let k = 0; k < 3; k++) lut[v * 3 + k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  }
  return lut;
}

function tintRamp(id: string, kind: 'material' | 'mural', colors: readonly string[]): HTMLCanvasElement | null {
  const key = `${id}|${colors.slice(0, 3).join(',')}`;
  if (!grey.has(id)) return null;
  const lut = tritone(colors);
  return paintGrey(id, kind, key, (v, d, o) => {
    d[o] = lut[v * 3] ?? 0; d[o + 1] = lut[v * 3 + 1] ?? 0; d[o + 2] = lut[v * 3 + 2] ?? 0; d[o + 3] = 255;
  });
}

/** A motif mask becomes a canvas of one colour whose alpha is the mask (LRU-cached per colour). */
function tintMotif(id: string, color: string): HTMLCanvasElement | null {
  const key = `${id}|${color}`;
  if (!grey.has(id)) return null;
  const [r, g, b] = hexToRgb(color);
  return paintGrey(id, 'motif', key, (v, d, o) => { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = v; });
}

setSurfaceMapProvider((id, colors, kind) => {
  if (!canLoad() || failed.has(id)) return null;
  // on demand: start loading and let the painter draw its flat fallback; the arrival listeners repaint
  if (!grey.has(id)) { void load(id); return null; }
  const k = kind ?? mapKindOf(id);
  return k === 'motif' ? tintMotif(id, colors[0] ?? '#000000') : tintRamp(id, k, colors);
});

/** Frees the greyscale and tinted copies (renderer teardown, tests). */
export function disposeSurfaceMaps(): void {
  grey.clear(); loading.clear(); failed.clear();
  for (const k of Object.keys(tints) as MapKind[]) tints[k].clear();
}
