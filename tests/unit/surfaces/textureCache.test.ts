// Texture cache, reference counting, idle pool and thumbnails, with a minimal canvas stub standing in for
// the DOM (the painters draw into the recording FakeCanvas).
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FLOOR_DESIGNS, WALL_DESIGNS } from '../../../src/content/surfaces';
import type { SurfaceDesign } from '../../../src/content/types';
import {
  configureSurfaceTextures, disposeAllSurfaceTextures, getSurfaceTexture, purgeUnusedSurfaceTextures,
  releaseSurfaceTexture, retainSurfaceTexture, surfaceTextureStats, surfaceThumbnail, type SurfaceTextureInfo,
} from '../../../src/render/textures/surfaceTextures';
import { FakeCanvas } from './fakeCanvas';

let thumbsMade = 0;

beforeAll(() => {
  const doc = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
      const ctx = new FakeCanvas();
      return {
        width: 0, height: 0,
        getContext: () => ctx,
        toDataURL: () => `data:image/png;base64,stub${++thumbsMade}`,
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = doc;
});

afterEach(() => {
  disposeAllSurfaceTextures();
  configureSurfaceTextures({ idleLimit: 12, idleBytes: 12 * 1024 * 1024 });
});

const wall = WALL_DESIGNS.find((d) => d.id === 'subway-tile') as SurfaceDesign;
const floor = FLOOR_DESIGNS.find((d) => d.id === 'oak-planks') as SurfaceDesign;

describe('surface texture cache', () => {
  it('returns one shared texture per design + palette + quality and counts references', () => {
    const a = getSurfaceTexture(wall, 'sage', 'high');
    const b = getSurfaceTexture(wall, 'sage', 'high');
    expect(a).toBe(b);
    expect(getSurfaceTexture(wall, 'sage', 'low')).not.toBe(a);
    expect(getSurfaceTexture(wall, 'blush', 'high')).not.toBe(a);
    expect(surfaceTextureStats().live).toBe(3);
    expect(surfaceTextureStats().refs).toBe(4);
  });

  it('configures colour space, wrapping, mipmaps and metadata', () => {
    const w = getSurfaceTexture(wall, 'sage', 'high');
    expect(w.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(w.wrapS).toBe(THREE.RepeatWrapping);
    expect(w.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(w.generateMipmaps).toBe(true);
    expect(w.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(w.anisotropy).toBeGreaterThan(1);
    const info = w.userData.surface as SurfaceTextureInfo;
    expect(info).toMatchObject({ designId: 'subway-tile', paletteId: 'sage', surface: 'wall', repeat: wall.repeat, heightM: 2.8 });
    const f = getSurfaceTexture(floor, 'walnut', 'low');
    expect(f.wrapT).toBe(THREE.RepeatWrapping);
    expect((f.userData.surface as SurfaceTextureInfo).heightM).toBe(floor.repeat);
  });

  it('falls back to the default palette for unknown ids', () => {
    const t = getSurfaceTexture(wall, 'no-such-palette', 'low');
    expect((t.userData.surface as SurfaceTextureInfo).paletteId).toBe(wall.palettes[0]?.id);
    expect(getSurfaceTexture(wall, wall.palettes[0]?.id ?? '', 'low')).toBe(t);
  });

  it('keeps released textures idle for re-use, then disposes them on purge', () => {
    const t = getSurfaceTexture(wall, 'sage', 'high');
    let disposed = 0;
    t.addEventListener('dispose', () => disposed++);
    retainSurfaceTexture(t);
    releaseSurfaceTexture(t);
    expect(surfaceTextureStats()).toMatchObject({ live: 1, idle: 0 });
    releaseSurfaceTexture(t);
    expect(surfaceTextureStats()).toMatchObject({ live: 0, idle: 1 });
    expect(disposed).toBe(0);
    // re-acquiring an idle texture revives the same object
    expect(getSurfaceTexture(wall, 'sage', 'high')).toBe(t);
    releaseSurfaceTexture(t);
    expect(purgeUnusedSurfaceTextures()).toBe(1);
    expect(disposed).toBe(1);
    expect(surfaceTextureStats()).toMatchObject({ live: 0, idle: 0, bytes: 0 });
    releaseSurfaceTexture(t); // a stale release is ignored
    expect(() => retainSurfaceTexture(t)).toThrow();
  });

  it('bounds the idle pool by count and bytes, evicting the oldest first', () => {
    configureSurfaceTextures({ idleLimit: 2 });
    const texs = wall.palettes.slice(0, 4).map((p) => getSurfaceTexture(wall, p.id, 'low'));
    const disposed = texs.map(() => 0);
    texs.forEach((t, i) => t.addEventListener('dispose', () => { disposed[i] = (disposed[i] ?? 0) + 1; }));
    texs.forEach((t) => releaseSurfaceTexture(t));
    expect(surfaceTextureStats().idle).toBe(2);
    expect(disposed).toEqual([1, 1, 0, 0]);
    configureSurfaceTextures({ idleBytes: 0 });
    expect(surfaceTextureStats().idle).toBe(0);
  });

  it('caches thumbnails per design, palette and size', () => {
    const before = thumbsMade;
    const a = surfaceThumbnail(floor, 'walnut', 64);
    expect(a.startsWith('data:image/png')).toBe(true);
    expect(surfaceThumbnail(floor, 'walnut', 64)).toBe(a);
    expect(thumbsMade).toBe(before + 1);
    expect(surfaceThumbnail(floor, 'walnut', 96)).not.toBe(a);
    expect(surfaceTextureStats().thumbnails).toBeGreaterThanOrEqual(2);
  });
});
