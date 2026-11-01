// Browser side of the surface detail maps (see mapKit.ts): loads public/assets/surfaces/<id>.webp once per
// map, keeps the greyscale in memory and builds palette-tinted canvases on demand (small LRU cache).
//
// Textures are painted synchronously, so a design whose map has not arrived yet is painted with its flat
// fallback; surfaceTextures.ts repaints it as soon as the map is there (whenSurfaceMapsLoaded) and does not
// cache thumbnails made without their map. Call preloadSurfaceMaps() at start-up to avoid the fallback.

import { MAP_IDS, setSurfaceMapProvider } from './mapKit';
import { hexToRgb } from './painterKit';

const SIDE = 512;
const TINT_LIMIT = 24;

let baseUrl = './assets/surfaces/';
const grey = new Map<string, Uint8ClampedArray>();
const loading = new Map<string, Promise<void>>();
const failed = new Set<string>();
const tints = new Map<string, HTMLCanvasElement>();

/** Directory URL (trailing slash) that holds the map files; default './assets/surfaces/'. */
export function setSurfaceMapBase(url: string): void {
  baseUrl = url.endsWith('/') ? url : `${url}/`;
}

const canLoad = () => typeof document !== 'undefined' && typeof createImageBitmap === 'function' && typeof fetch === 'function';

function load(id: string): Promise<void> {
  const known = loading.get(id);
  if (known) return known;
  const p = (async () => {
    try {
      const res = await fetch(`${baseUrl}${id}.webp`);
      if (!res.ok) throw new Error(`${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement('canvas');
      c.width = SIDE; c.height = SIDE;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(bmp, 0, 0, SIDE, SIDE);
      const rgba = ctx.getImageData(0, 0, SIDE, SIDE).data;
      const g = new Uint8ClampedArray(SIDE * SIDE);
      for (let i = 0; i < g.length; i++) g[i] = rgba[i * 4] ?? 128;
      grey.set(id, g);
      bmp.close();
    } catch (e) {
      failed.add(id);
      console.warn(`[surfaces] map '${id}' unavailable`, e);
    }
  })();
  loading.set(id, p);
  return p;
}

/** Starts loading maps (default: all) and resolves when each has loaded or failed. */
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

function tint(id: string, colors: readonly string[]): HTMLCanvasElement | null {
  const g = grey.get(id);
  if (!g) return null;
  const key = `${id}|${colors.slice(0, 3).join(',')}`;
  const hit = tints.get(key);
  if (hit) { tints.delete(key); tints.set(key, hit); return hit; }
  const base = hexToRgb(colors[0] ?? '#808080');
  const light = hexToRgb(colors[1] ?? '#ffffff');
  const dark = hexToRgb(colors[2] ?? '#000000');
  // 256-entry ramp: 0 -> dark, 128 -> base, 255 -> light
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const lo = v < 128;
    const t = lo ? v / 128 : (v - 128) / 127;
    const a = lo ? dark : base, b = lo ? base : light;
    for (let k = 0; k < 3; k++) lut[v * 3 + k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  }
  const c = document.createElement('canvas');
  c.width = SIDE; c.height = SIDE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(SIDE, SIDE);
  const d = img.data;
  for (let i = 0; i < g.length; i++) {
    const v = (g[i] ?? 128) * 3;
    d[i * 4] = lut[v] ?? 0; d[i * 4 + 1] = lut[v + 1] ?? 0; d[i * 4 + 2] = lut[v + 2] ?? 0; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tints.set(key, c);
  if (tints.size > TINT_LIMIT) {
    const oldest = tints.keys().next().value as string | undefined;
    if (oldest !== undefined) tints.delete(oldest);
  }
  return c;
}

setSurfaceMapProvider((id, colors) => {
  if (!canLoad() || failed.has(id)) return null;
  if (!grey.has(id)) { void load(id); return null; }
  return tint(id, colors);
});

/** Frees the greyscale and tinted copies (renderer teardown, tests). */
export function disposeSurfaceMaps(): void {
  grey.clear(); loading.clear(); failed.clear(); tints.clear();
}
