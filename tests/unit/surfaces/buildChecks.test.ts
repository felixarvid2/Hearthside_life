// The pure checks of tools/build-surface-maps.mjs: motif isolation, cropping and the id lists it writes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GENERIC_MATERIAL, MOTIF_MARGIN, coverageMask, inkBox, motifCheck, squareMotif,
} from '../../../tools/surface-checks.mjs';
import { MATERIAL_MAP_IDS, MOTIF_IDS, MURAL_IDS } from '../../../src/render/textures/surfaceMapIds.generated';

/** A w x h white image (255) with a black (0) rectangle. */
function image(w: number, h: number, rect: [number, number, number, number]): Uint8Array {
  const g = new Uint8Array(w * h).fill(255);
  for (let y = rect[1]; y < rect[3]; y++) for (let x = rect[0]; x < rect[2]; x++) g[y * w + x] = 0;
  return g;
}

describe('motif build checks', () => {
  const W = 100;

  it('accepts an isolated motif', () => {
    const mask = coverageMask(image(W, W, [30, 30, 70, 60]));
    const c = motifCheck(mask, W, W);
    expect(c.ok).toBe(true);
    expect(c.coverage).toBeCloseTo(0.12, 2);
    expect(c.border).toBe(0);
  });

  it('rejects ink on the border (more than 2 % of the border pixels)', () => {
    const touching = coverageMask(image(W, W, [0, 30, 40, 60])); // touches the left edge over 30 of 396 border pixels
    const c = motifCheck(touching, W, W);
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/border/);
    // a speck of two pixels on the border (about 0.5 %) is tolerated
    const speck = image(W, W, [30, 30, 70, 60]);
    speck[0] = 0; speck[1] = 0;
    expect(motifCheck(coverageMask(speck), W, W).ok).toBe(true);
  });

  it('rejects too little and too much ink', () => {
    expect(motifCheck(coverageMask(image(W, W, [48, 48, 52, 52])), W, W)).toMatchObject({ ok: false });
    expect(motifCheck(coverageMask(image(W, W, [48, 48, 52, 52])), W, W).reason).toMatch(/only/);
    const big = motifCheck(coverageMask(image(W, W, [2, 2, 98, 98])), W, W);
    expect(big.ok).toBe(false);
    expect(big.reason).toMatch(/max|covers/);
    const blank = motifCheck(coverageMask(new Uint8Array(W * W).fill(255)), W, W);
    expect(blank.ok).toBe(false);
  });

  it('turns grey into an anti-aliased coverage mask (255 = ink)', () => {
    const m = coverageMask(Uint8Array.from([0, 255, 128, 90]));
    expect(m[0]).toBe(255);
    expect(m[1]).toBe(0);
    expect(m[2]).toBeGreaterThan(100);
    expect(m[2]).toBeLessThan(160);
    expect(m[3]).toBeGreaterThan(m[2] as number);
  });

  it('finds the ink box and pads it to a square with a 4 % margin, centred', () => {
    const mask = coverageMask(image(200, 100, [60, 20, 120, 50])); // 60 x 30
    const box = inkBox(mask, 200, 100);
    expect(box).toEqual({ x0: 60, y0: 20, x1: 120, y1: 50 });
    const { side, data } = squareMotif(mask, 200, box as NonNullable<typeof box>);
    expect(side).toBe(Math.round(60 * (1 + MOTIF_MARGIN * 2)));
    expect(data.length).toBe(side * side);
    // the ink sits in the middle: nothing in the margin rows or columns, ink in the centre
    const ink = inkBox(data, side, side) as NonNullable<ReturnType<typeof inkBox>>;
    expect(ink.x0).toBeGreaterThanOrEqual(Math.floor(side * MOTIF_MARGIN) - 1);
    expect(side - ink.x1).toBeGreaterThanOrEqual(Math.floor(side * MOTIF_MARGIN) - 1);
    expect(Math.abs(ink.y0 - (side - ink.y1))).toBeLessThanOrEqual(1);
    expect(data[Math.floor(side / 2) * side + Math.floor(side / 2)]).toBe(255);
    expect(inkBox(new Uint8Array(16), 4, 4)).toBeNull();
  });

  it('keeps the generic material options', () => {
    expect(GENERIC_MATERIAL).toEqual({ std: 0.17, flatten: 1, drift: 0.5 });
  });
});

describe('generated id lists', () => {
  it('are sorted, unique and match the file written by the build tool', () => {
    for (const list of [MATERIAL_MAP_IDS, MOTIF_IDS, MURAL_IDS] as ReadonlyArray<readonly string[]>) {
      expect([...list]).toEqual([...list].sort());
      expect(new Set(list).size).toBe(list.length);
    }
    const text = readFileSync(resolve(__dirname, '../../../src/render/textures/surfaceMapIds.generated.ts'), 'utf8');
    expect(text).toMatch(/^\/\/ GENERATED/);
    for (const id of [...MATERIAL_MAP_IDS, ...MOTIF_IDS, ...MURAL_IDS]) expect(text).toContain(`'${id}'`);
  });

  it('contain the 14 original maps and the pilot images', () => {
    for (const id of ['grain-oak', 'lawn', 'concrete-board', 'stone-slate']) expect(MATERIAL_MAP_IDS as readonly string[]).toContain(id);
    expect(MATERIAL_MAP_IDS.length).toBeGreaterThanOrEqual(15);
    expect(MOTIF_IDS).toEqual(expect.arrayContaining(['motif-peony', 'motif-rocket']));
    expect(MURAL_IDS).toContain('mural-misty-pines');
  });
});
