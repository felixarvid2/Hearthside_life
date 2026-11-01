// Isometric catalog thumbnail renderer for the original furniture models: a small z-buffer rasteriser (no GPU, no
// browser) that frames the model like the Kenney isometric renders (camera at the front-right, ~30 degrees down,
// transparent background, cropped to the content). Used by build-extra-furniture.mjs.

import sharp from 'sharp';
import { COLORS } from './kit.mjs';

const SS = 3; // supersampling per axis

export async function renderThumb(tris, { az = -Math.PI / 4, el = (30 * Math.PI) / 180, px = 150 } = {}) {
  // view space: x right, y up, z towards the camera
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const proj = (p) => {
    const x1 = p[0] * ca - p[2] * sa, z1 = p[0] * sa + p[2] * ca; // spin about y
    return [x1, p[1] * ce - z1 * se, p[1] * se + z1 * ce];
  };
  const rotN = (n) => { const x1 = n[0] * ca - n[2] * sa, z1 = n[0] * sa + n[2] * ca; return [x1, n[1] * ce - z1 * se, n[1] * se + z1 * ce]; };
  const view = tris.map((t) => ({ mat: t.mat, p: t.p.map(proj), n: t.n.map(rotN) }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of view) for (const p of t.p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const scale = (px * SS) / Math.max(maxX - minX, (maxY - minY) * 1.0);
  const W = Math.ceil((maxX - minX) * scale) + 2 * SS * 3, H = Math.ceil((maxY - minY) * scale) + 2 * SS * 3;
  const color = new Uint8ClampedArray(W * H * 4), depth = new Float32Array(W * H).fill(-Infinity);
  const light = (() => { const l = [-0.45, 0.8, 0.55]; const m = Math.hypot(...l); return l.map((v) => v / m); })();
  for (const t of view) {
    const base = COLORS[t.mat];
    const pts = t.p.map((p) => [(p[0] - minX) * scale + SS * 3, (maxY - p[1]) * scale + SS * 3, p[2]]);
    const [a, b, c] = pts;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px_ = x + 0.5, py = y + 0.5;
      const w0 = ((b[0] - px_) * (c[1] - py) - (b[1] - py) * (c[0] - px_)) / area;
      const w1 = ((c[0] - px_) * (a[1] - py) - (c[1] - py) * (a[0] - px_)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const i = y * W + x;
      if (z <= depth[i]) continue;
      const n = [0, 1, 2].map((k) => t.n[0][k] * w0 + t.n[1][k] * w1 + t.n[2][k] * w2);
      const nl = Math.hypot(...n) || 1;
      const d = Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / nl);
      const k = 0.62 + 0.5 * d;
      depth[i] = z;
      color[i * 4] = Math.min(255, base[0] * 255 * k); color[i * 4 + 1] = Math.min(255, base[1] * 255 * k); color[i * 4 + 2] = Math.min(255, base[2] * 255 * k); color[i * 4 + 3] = 255;
    }
  }
  const big = sharp(Buffer.from(color.buffer), { raw: { width: W, height: H, channels: 4 } });
  return big.resize(Math.round(W / SS), Math.round(H / SS), { kernel: 'lanczos3' }).trim().png().toBuffer();
}
