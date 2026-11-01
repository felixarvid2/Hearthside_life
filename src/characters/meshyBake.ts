// Offline texture analysis for the Meshy bodies (used by tools/build-meshy-bodies.mts and the tests; pure, no DOM and
// no node modules): rasterises the UV layout to find the 3D point of every texel, classifies the texels into skin,
// baked base clothing (tank top / shorts), iris and brow, and packs the result into the RGBA mask the skin shader reads.
//
// Mask channels (RGBA8, 0..255 coverage after box filtering): R skin, G baked clothing, B iris (eye colour), A brow.
// Everything else (sclera, lashes, mouth line, unmapped texels) stays 0 in every channel and keeps the baked colour.

export const CLASS = { none: 0, skin: 1, cloth: 2, iris: 3, brow: 4, face: 5 } as const;

export interface TexelMap {
  size: number;
  /** Triangle id per texel (row-major, v down as in glTF), -1 where the UV layout is empty. */
  tri: Int32Array;
  /** Source position per texel (3 floats), only meaningful where tri >= 0. */
  pos: Float32Array;
}

/** Rasterises triangles of the UV layout; each covered texel gets the interpolated 3D position. */
export function rasterizeUv(uv: ArrayLike<number>, index: ArrayLike<number>, positions: ArrayLike<number>, size: number): TexelMap {
  const tri = new Int32Array(size * size).fill(-1);
  const pos = new Float32Array(size * size * 3);
  const nt = Math.floor(index.length / 3);
  for (let t = 0; t < nt; t++) {
    const a = index[t * 3] as number, b = index[t * 3 + 1] as number, c = index[t * 3 + 2] as number;
    const ax = (uv[a * 2] as number) * size, ay = (uv[a * 2 + 1] as number) * size;
    const bx = (uv[b * 2] as number) * size, by = (uv[b * 2 + 1] as number) * size;
    const cx = (uv[c * 2] as number) * size, cy = (uv[c * 2 + 1] as number) * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const l1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      const l2 = 1 - l0 - l1;
      const e = -0.02;
      if (l0 < e || l1 < e || l2 < e) continue;
      const k = y * size + x;
      tri[k] = t;
      for (let d = 0; d < 3; d++) pos[k * 3 + d] = l0 * (positions[a * 3 + d] as number) + l1 * (positions[b * 3 + d] as number) + l2 * (positions[c * 3 + d] as number);
    }
  }
  return { size, tri, pos };
}

const srgbToLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

export interface ClassifyOptions {
  /** Texels at or above this bind-space height belong to the head (face features are searched there). */
  headMinY: number;
}

export interface ClassifyResult {
  classes: Uint8Array;
  /** Mean linear-sRGB colour of the body skin and the luminance clusters of the baked clothing. */
  skinMean: [number, number, number];
  /** Linear luminance of the baked clothing: [dark cluster, light cluster, split] (one cluster: both equal, split 0). */
  clothLum: [number, number, number];
  /** Face landmark estimates (bind space) from the classified features, null when not found. */
  eyes: Array<{ x: number; y: number; z: number; r: number }>;
  brows: Array<{ x: number; y: number; z: number }>;
  counts: Record<string, number>;
}

/**
 * Colour/position classification of every texel of an RGB image (3 channels, 8 bit). Skin has a warm hue; the baked
 * clothing is anything else below the head; on the head, dark non-skin blobs are split into iris (compact, near-black)
 * and brow (elongated, brown) by connected components in texture space.
 */
export function classifyTexels(rgb: Uint8Array, map: TexelMap, o: ClassifyOptions): ClassifyResult {
  const { size, tri, pos } = map;
  const n = size * size;
  const classes = new Uint8Array(n);
  const sat = new Float32Array(n);
  const lum = new Float32Array(n);
  const warm = new Uint8Array(n);
  let skinLumSum = 0, skinLumN = 0;
  for (let k = 0; k < n; k++) {
    const r = rgb[k * 3] as number, g = rgb[k * 3 + 1] as number, b = rgb[k * 3 + 2] as number;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[k] = mx > 0 ? (mx - mn) / mx : 0;
    lum[k] = 0.299 * r + 0.587 * g + 0.114 * b;
    // skin and the brows are warm: red leads, blue trails, and the colour is not grey
    warm[k] = r >= g && g >= b - 6 && sat[k]! > 0.12 && r > 40 ? 1 : 0;
    if (tri[k]! >= 0 && warm[k] && ((pos[k * 3 + 1] as number) < o.headMinY) && lum[k]! > 120) { skinLumSum += lum[k]!; skinLumN++; }
  }
  const skinLum = skinLumN ? skinLumSum / skinLumN : 190;
  const head = (k: number) => tri[k]! >= 0 && (pos[k * 3 + 1] as number) >= o.headMinY && Math.abs(pos[k * 3] as number) < 0.13;
  const mx = (k: number) => Math.max(rgb[k * 3] as number, rgb[k * 3 + 1] as number, rgb[k * 3 + 2] as number);
  // body: warm = skin, anything else on the mesh = baked clothing
  let headLumSum = 0, headLumN = 0;
  for (let k = 0; k < n; k++) {
    if (head(k)) {
      classes[k] = CLASS.skin;
      if (warm[k] && lum[k]! > 0.7 * skinLum) { headLumSum += lum[k]!; headLumN++; }
    } else {
      classes[k] = warm[k] && lum[k]! > 60 ? CLASS.skin : (tri[k]! >= 0 || lum[k]! < 150 ? CLASS.cloth : CLASS.skin);
    }
  }
  const headLum = headLumN ? headLumSum / headLumN : skinLum;
  // head: sclera and other bright non-skin detail are left alone
  for (let k = 0; k < n; k++) if (head(k) && !warm[k] && lum[k]! > 0.8 * headLum) classes[k] = CLASS.face;
  // iris: near-black texels that survive a 2 px opening (lashes and liner are thinner than that)
  const black = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (head(k) && mx(k) < 85) black[k] = 1;
  const opened = morph(morph(black, size, 2, 'erode'), size, 2, 'dilate');
  const eyes: ClassifyResult['eyes'] = [];
  const brows: ClassifyResult['brows'] = [];
  const comps = (mask: Uint8Array, min: number, visit: (members: number[], w: number, h: number) => void) => {
    const seen = new Uint8Array(n);
    const stack: number[] = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (!mask[s0] || seen[s0]) continue;
      const members: number[] = [];
      stack.push(s0); seen[s0] = 1;
      let x0 = size, x1 = 0, y0 = size, y1 = 0;
      while (stack.length) {
        const k = stack.pop() as number;
        members.push(k);
        const x = k % size, y = (k - x) / size;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          const q = yy * size + xx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      if (members.length >= min) visit(members, x1 - x0 + 1, y1 - y0 + 1);
    }
  };
  const centroid = (members: number[]) => {
    let cx = 0, cy = 0, cz = 0;
    for (const k of members) { cx += pos[k * 3] as number; cy += pos[k * 3 + 1] as number; cz += pos[k * 3 + 2] as number; }
    return { x: cx / members.length, y: cy / members.length, z: cz / members.length };
  };
  const irisSeeds: number[][] = [];
  comps(opened, 40, (members, w, h) => {
    const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
    if (aspect >= 2.2) return;
    // an iris sits in the white of the eye: bright non-skin texels around the blob
    let x0 = size, x1 = 0, y0 = size, y1 = 0;
    for (const k of members) { const x = k % size, y = (k - x) / size; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const m = 12;
    let white = 0;
    for (let y = Math.max(0, y0 - m); y <= Math.min(size - 1, y1 + m); y++) for (let x = Math.max(0, x0 - m); x <= Math.min(size - 1, x1 + m); x++) if (classes[y * size + x] === CLASS.face) white++;
    if (white >= 30) irisSeeds.push(members);
  });
  // eyes share a height: keep the blobs near the median height (drops stray dark patches such as nostrils)
  const ys = irisSeeds.map((m) => centroid(m).y).sort((p, q) => p - q);
  const eyeY = ys.length ? (ys[ys.length >> 1] as number) : 0;
  for (const members of irisSeeds) {
    const c = centroid(members);
    if (Math.abs(c.y - eyeY) > 0.02) continue;
    const grow = new Uint8Array(n);
    for (const k of members) grow[k] = 1;
    const g2 = morph(grow, size, 1, 'dilate');
    for (let k = 0; k < n; k++) if (g2[k] && head(k) && mx(k) < 130) classes[k] = CLASS.iris;
    eyes.push({ ...c, r: Math.sqrt(members.length / Math.PI) / size });
  }
  // brows: warm, darker than the face, elongated, above the eyes
  const browCand = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!head(k) || classes[k] === CLASS.iris || classes[k] === CLASS.face) continue;
    const y = pos[k * 3 + 1] as number;
    if (y < eyeY + 0.009 || y > eyeY + 0.05) continue;
    if (lum[k]! < 0.74 * headLum && sat[k]! > 0.22) browCand[k] = 1;
  }
  comps(morph(morph(browCand, size, 1, 'dilate'), size, 1, 'erode'), 60, (members, w, h) => {
    const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
    if (aspect < 1.9) return;
    for (const k of members) if (browCand[k]) classes[k] = CLASS.brow;
    brows.push(centroid(members));
  });
  // statistics
  const sm = [0, 0, 0];
  let sn = 0;
  const counts: Record<string, number> = {};
  const clothY: number[] = [];
  for (let k = 0; k < n; k++) {
    if (tri[k]! < 0) continue;
    const c = classes[k] as number;
    counts[c] = (counts[c] ?? 0) + 1;
    if (c === CLASS.skin && !head(k)) { sn++; for (let d = 0; d < 3; d++) sm[d] = (sm[d] as number) + srgbToLinear(rgb[k * 3 + d] as number); }
    else if (c === CLASS.cloth && k % 5 === 0) clothY.push(0.2126 * srgbToLinear(rgb[k * 3] as number) + 0.7152 * srgbToLinear(rgb[k * 3 + 1] as number) + 0.0722 * srgbToLinear(rgb[k * 3 + 2] as number));
  }
  const skinMean = sm.map((v) => v / Math.max(1, sn)) as [number, number, number];
  // one-dimensional two-means over the clothing luminance (black shorts and a grey tank top are two clusters)
  let lo = Infinity, hi = -Infinity;
  for (const v of clothY) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let it = 0; it < 12 && clothY.length; it++) {
    const mid = (lo + hi) / 2;
    let a = 0, an = 0, b = 0, bn = 0;
    for (const v of clothY) if (v < mid) { a += v; an++; } else { b += v; bn++; }
    if (an) lo = a / an;
    if (bn) hi = b / bn;
  }
  const clothLum: [number, number, number] = hi / Math.max(lo, 1e-4) > 1.8 ? [lo, hi, (lo + hi) / 2] : [(lo + hi) / 2, (lo + hi) / 2, 0];
  return { classes, skinMean, clothLum, eyes, brows, counts };
}

/** Square erosion or dilation of a binary mask by `r` texels (separable). */
function morph(src: Uint8Array, size: number, r: number, mode: 'erode' | 'dilate'): Uint8Array {
  const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
  const hit = mode === 'dilate' ? 1 : 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = hit ? 0 : 1;
    for (let d = -r; d <= r; d++) { const xx = x + d; const s = xx < 0 || xx >= size ? 0 : (src[y * size + xx] as number); if (hit ? s : !s) { v = hit; break; } }
    tmp[y * size + x] = v;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = hit ? 0 : 1;
    for (let d = -r; d <= r; d++) { const yy = y + d; const s = yy < 0 || yy >= size ? 0 : (tmp[yy * size + x] as number); if (hit ? s : !s) { v = hit; break; } }
    out[y * size + x] = v;
  }
  return out;
}

/** Bleeds the colours of covered texels into the empty ones (a few rings), so mip levels and filtering do not pull in black. */
export function dilateTexels(rgb: Uint8Array, covered: Uint8Array, size: number, rings: number): void {
  let cur = covered.slice();
  for (let r = 0; r < rings; r++) {
    const next = cur.slice();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const k = y * size + x;
      if (cur[k]) continue;
      let sr = 0, sg = 0, sb = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const q = yy * size + xx;
        if (!cur[q]) continue;
        sr += rgb[q * 3] as number; sg += rgb[q * 3 + 1] as number; sb += rgb[q * 3 + 2] as number; c++;
      }
      if (c) { rgb[k * 3] = sr / c; rgb[k * 3 + 1] = sg / c; rgb[k * 3 + 2] = sb / c; next[k] = 1; }
    }
    cur = next;
  }
}

/** Packs the classes into an RGBA mask of `outSize` (box filtered from the class map). */
export function packMask(classes: Uint8Array, covered: Uint8Array, size: number, outSize: number): Uint8Array {
  const f = size / outSize;
  const out = new Uint8Array(outSize * outSize * 4);
  for (let y = 0; y < outSize; y++) for (let x = 0; x < outSize; x++) {
    const acc = [0, 0, 0, 0];
    let cov = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const k = (y * f + dy) * size + (x * f + dx);
      if (!covered[k]) continue;
      cov++;
      const c = classes[k] as number;
      if (c === CLASS.skin) acc[0]!++;
      else if (c === CLASS.cloth) acc[1]!++;
      else if (c === CLASS.iris) acc[2]!++;
      else if (c === CLASS.brow) acc[3]!++;
    }
    const o = (y * outSize + x) * 4;
    // texels of the output that are only partly covered take their value from the covered part
    for (let ch = 0; ch < 4; ch++) out[o + ch] = cov ? Math.round((255 * (acc[ch] as number)) / cov) : 0;
  }
  return out;
}
