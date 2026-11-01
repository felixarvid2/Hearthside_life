// Offline build of the AI hair GLBs from the cached TRELLIS generations (dev/hair-ai/raw/<id>.glb); costs nothing.

import { runnerImport } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { bakeTint } from './bake.mts';
import { readModel } from './mesh.mts';
import { plotViews } from './plot.mts';
import { DistanceField, applyTransform, fitHead } from './register.mts';
import type { Transform } from './register.mts';
import { extractHair, freeUvBlock, mergeMeshes, orientNormals, rootShade, scalpCap, simplifyHair, smoothNormals, writeHairGlb } from './process.mts';
import { segment } from './segment.mts';
import type { AiStyle } from './styles.mts';

export const TARGET_TRIS = 4000;
export const TINT_SIZE = 512;

export async function buildAll(styles: AiStyle[], root: string, opts: { debug?: boolean } = {}): Promise<void> {
  const hs = (await runnerImport(`${root}/src/characters/headShape.ts`)).module as Record<string, any>;
  const cols: number[] = hs.headColumns(72), rows: number[] = hs.headRows();
  const surf: number[] = [], face: number[] = [];
  for (const h of rows) for (const th of cols) {
    const p = hs.headPoint(th, h) as number[];
    surf.push(...p);
    if (Math.abs(th) < 0.9 || h > 0.15) face.push(...p);
  }
  const hairMod = (await runnerImport(`${root}/src/characters/hair.ts`)).module as Record<string, any>;
  const surfaceField = new DistanceField(surf, [-0.14, -0.1, -0.14], [0.14, 0.3, 0.16], 0.004);
  if (opts.debug) mkdirSync(`${root}/dev/hair-ai/debug`, { recursive: true });
  const report: string[] = [];
  for (const s of styles) {
    const src = `${root}/dev/hair-ai/raw/${s.id}.glb`;
    if (!existsSync(src)) { console.log(`[build] ${s.id}: no raw model, skipped`); continue; }
    const t0 = Date.now();
    const m = await readModel(src);
    const seg = segment(m);
    const n = m.pos.length / 3;
    // ear level and width of the visible mannequin: initial scale and height of the fit
    const B = 80, xw = new Array<number>(B).fill(0);
    for (let i = 0; i < n; i++) if (!seg.hair[i]) { const b = Math.min(B - 1, Math.floor(((m.pos[i * 3 + 1] as number) + 0.5) * B)); xw[b] = Math.max(xw[b] as number, Math.abs(m.pos[i * 3] as number)); }
    let yE = 0, ew = 0;
    for (let b = Math.floor(B * 0.25); b < B; b++) if ((xw[b] as number) > ew) { ew = xw[b] as number; yE = b / B - 0.5 + 0.5 / B; }
    const head: number[] = [];
    for (let i = 0; i < n; i++) if (!seg.hair[i] && (m.pos[i * 3 + 1] as number) > yE - 1.25 * ew) head.push(m.pos[i * 3] as number, m.pos[i * 3 + 1] as number, m.pos[i * 3 + 2] as number);
    const fit = fitHead({ head: new Float32Array(head), all: m.pos, surface: new Float32Array(surf), face: new Float32Array(face) }, { yE });
    const T: Transform = fit.T;
    const raw = extractHair(m, seg.keepTri, T);
    const capTris = s.scalp ? 30 * 9 * 2 : 0;
    let simp = await simplifyHair(raw, TARGET_TRIS - capTris);
    let paint: { u: number; v: number; size: number } | undefined;
    if (s.scalp) {
      const block = freeUvBlock(simp, TINT_SIZE, 20);
      if (!block) throw new Error(`${s.id}: no free texel block for the scalp cap`);
      paint = { ...block, size: 20 };
      simp = mergeMeshes(simp, scalpCap(hs, hairMod, { hairline: s.scalp.hairline, fringe: s.scalp.fringe ?? 0, offset: 0.0035, block, blockSize: 20, size: TINT_SIZE }));
    }
    const normals = smoothNormals(simp);
    orientNormals(simp, normals);
    const colors = rootShade(simp, surfaceField);
    const tint = await bakeTint(m.tex, { size: TINT_SIZE, paint });
    const file = `${root}/public/assets/characters/hair/${s.id}.glb`;
    const bytes = await writeHairGlb(file, {
      id: s.id, mesh: simp, normals, colors, tint: tint.rgb, tintSize: TINT_SIZE,
      extras: { version: 1, id: s.id, space: 'head-local', source: 'fal-ai/trellis', tris: simp.index.length / 3, fitCost: +fit.cost.toFixed(4) },
    });
    const line = `${s.id}: ${seg.stats.hairTris} -> ${simp.index.length / 3} tris, ${simp.pos.length / 3} verts, ${(bytes / 1024).toFixed(0)} kB, fit ${fit.cost.toFixed(4)} scale ${T.s.map((v) => v.toFixed(3)).join('/')} yaw ${T.yaw.toFixed(2)}, tint mean ${tint.stats.mean.toFixed(2)} (${tint.stats.unknownShare.toFixed(2)} grey), ${Date.now() - t0} ms`;
    console.log(`[build] ${line}`);
    report.push(line);
    if (opts.debug) {
      const q: [number, number, number] = [0, 0, 0];
      const G: number[] = [], Hh: number[] = [];
      for (let i = 0; i < n; i++) { applyTransform(T, m.pos, i * 3, q); (seg.hair[i] ? Hh : G).push(...q); }
      await plotViews(`${root}/dev/hair-ai/debug/${s.id}_fit.png`, [{ pts: G, color: [150, 150, 150] }, { pts: Hh, color: [220, 120, 90] }, { pts: surf, color: [0, 0, 255] }, { pts: simp.pos, color: [0, 140, 0] }], { range: 0.2, center: [0, 0.07, 0] });
    }
  }
  if (report.length) writeFileSync(`${root}/dev/hair-ai/BUILD.txt`, report.join('\n') + '\n');
}
