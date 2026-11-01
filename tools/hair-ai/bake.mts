// Albedo -> tint map. The creator's hair colour multiplies this map in the shader, so it holds only light and dark: the
// mannequin-grey and baked-shadow texels of the generation are removed, strand detail is kept and amplified, the large-scale
// baked shading is flattened (the game lights the hair itself), and the result is scaled to a bright mean so any colour stays itself.

import sharp from 'sharp';
import type { RawModel } from './mesh.mts';
import { relChroma } from './segment.mts';

/** Separable gaussian blur of a single-channel float image. */
export function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r] as number; }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] as number) / sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += (src[y * w + Math.min(w - 1, Math.max(0, x + i))] as number) * (k[i + r] as number);
    tmp[y * w + x] = a;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += (tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] as number) * (k[i + r] as number);
    out[y * w + x] = a;
  }
  return out;
}

/** Fills the unknown texels (known = 0) from their known neighbours by repeated dilation (colour bleeding). */
export function fillUnknown(v: Float32Array, known: Uint8Array, w: number, h: number, maxIter = 64): void {
  const k = known.slice();
  for (let it = 0; it < maxIter; it++) {
    const add: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (k[i]) continue;
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !k[yy * w + xx]) continue;
        s += v[yy * w + xx] as number; n++;
      }
      if (n) add.push(i, s / n);
    }
    if (!add.length) break;
    for (let j = 0; j < add.length; j += 2) { v[add[j] as number] = add[j + 1] as number; k[add[j] as number] = 1; }
  }
}

export interface BakeOptions { size: number; mean?: number; detail?: number; flatten?: number }

/** The tint map as 8-bit RGB (grey) pixels, `size` x `size`. */
export async function bakeTint(m: RawModel['tex'], o: BakeOptions): Promise<{ rgb: Buffer; stats: { mean: number; p5: number; p95: number; unknownShare: number } }> {
  const { w, h } = m;
  const L = new Float32Array(w * h), known = new Uint8Array(w * h);
  let unknown = 0;
  for (let i = 0; i < w * h; i++) {
    const r = (m.rgb[i * 3] as number) / 255, g = (m.rgb[i * 3 + 1] as number) / 255, b = (m.rgb[i * 3 + 2] as number) / 255;
    L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // mannequin grey (and the grey gutter between islands): chroma-less texels are not hair
    if (relChroma([r, g, b]) < 0.08) unknown++; else known[i] = 1;
  }
  fillUnknown(L, known, w, h);
  // flatten the baked large-scale shading, keep and boost the strand detail
  const base = blur(L, w, h, 2.2);
  const wide = blur(L, w, h, 14);
  let mean = 0, n = 0;
  for (let i = 0; i < w * h; i++) if (known[i]) { mean += wide[i] as number; n++; }
  mean /= Math.max(1, n);
  const flat = o.flatten ?? 0.45, det = o.detail ?? 1.5;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const detail = (L[i] as number) - (base[i] as number);
    out[i] = mean + ((wide[i] as number) - mean) * flat + ((base[i] as number) - (wide[i] as number)) * 0.9 + detail * det;
  }
  // levels: p5 -> 0.62, p95 -> 1.0 so the mean tint stays bright and a colour keeps its value
  const vals: number[] = [];
  for (let i = 0; i < w * h; i += 7) if (known[i]) vals.push(out[i] as number);
  vals.sort((a, b) => a - b);
  const p5 = vals[Math.floor(vals.length * 0.05)] as number, p95 = vals[Math.floor(vals.length * 0.95)] as number;
  const lo = o.mean !== undefined ? 0.62 : 0.62;
  const buf = Buffer.alloc(w * h * 3);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const t = ((out[i] as number) - p5) / Math.max(1e-4, p95 - p5);
    const v = Math.max(0.28, Math.min(1, lo + (1 - lo) * t));
    const b = Math.round(v * 255);
    buf[i * 3] = buf[i * 3 + 1] = buf[i * 3 + 2] = b;
    sum += v;
  }
  const resized = await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).resize(o.size, o.size, { kernel: 'lanczos3' }).sharpen({ sigma: 0.7, m1: 0.2, m2: 1.2 }).raw().toBuffer();
  return { rgb: resized, stats: { mean: sum / (w * h), p5, p95, unknownShare: unknown / (w * h) } };
}
