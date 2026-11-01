// Debug scatter plots (front / side / top projections of coloured points) as PNG, no browser needed.

import sharp from 'sharp';

export interface Layer { pts: ArrayLike<number>; color: [number, number, number]; labels?: ArrayLike<number>; size?: number }

/** Renders each layer (xyz triples) in three orthographic views over [-0.55, 0.55]^3 and writes a PNG. */
export async function plotViews(file: string, layers: Layer[], opts: { px?: number; range?: number; center?: [number, number, number] } = {}): Promise<void> {
  const px = opts.px ?? 400, range = opts.range ?? 0.55, c = opts.center ?? [0, 0, 0];
  const W = px * 3, H = px;
  const buf = Buffer.alloc(W * H * 3, 255);
  const views: Array<(p: number[]) => [number, number]> = [
    (p) => [p[0]! - c[0], -(p[1]! - c[1])],
    (p) => [-(p[2]! - c[2]), -(p[1]! - c[1])],
    (p) => [p[0]! - c[0], -(p[2]! - c[2])],
  ];
  for (const L of layers) {
    const n = L.pts.length / 3;
    const r = L.size ?? 1;
    for (let v = 0; v < 3; v++) for (let i = 0; i < n; i++) {
      const [a, b] = views[v]!([L.pts[i * 3] as number, L.pts[i * 3 + 1] as number, L.pts[i * 3 + 2] as number]);
      const x = Math.round(((a / range) * 0.5 + 0.5) * px), y = Math.round(((b / range) * 0.5 + 0.5) * px);
      for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= px || yy < 0 || yy >= px) continue;
        const o = (yy * W + v * px + xx) * 3;
        buf[o] = L.color[0]; buf[o + 1] = L.color[1]; buf[o + 2] = L.color[2];
      }
    }
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
}
