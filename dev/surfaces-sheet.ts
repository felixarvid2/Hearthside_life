// Contact-sheet renderer for the surface review tool (dev/surfaces-sheet.mjs). For each design: a room-scale swatch
// (150 px per metre: a wall 2.4 m wide and its lowest 2 m, a floor 2 x 2 m; designs whose repeat is wider than
// 2.4 m show one whole repeat) with the design id and name underneath, and a strip of its first 8 palettes.
// With `palettes` every palette is drawn large instead. Returns PNG data URLs, one per sheet.

import { FLOOR_DESIGNS, WALL_DESIGNS } from '../src/content/surfaces';
import type { SurfaceDesign } from '../src/content/types';
import { WALLS_A } from '../src/content/surfaces3/walls-a';
import { WALLS_B } from '../src/content/surfaces3/walls-b';
import { WALLS_C } from '../src/content/surfaces3/walls-c';
import { WALLS_D } from '../src/content/surfaces3/walls-d';
import { WALLS_E } from '../src/content/surfaces3/walls-e';
import { WALLS_F } from '../src/content/surfaces3/walls-f';
import { FLOORS_A } from '../src/content/surfaces3/floors-a';
import { FLOORS_B } from '../src/content/surfaces3/floors-b';
import { FLOORS_C } from '../src/content/surfaces3/floors-c';
import { designMaps } from '../src/render/textures/mapKit';
import { WALL_TEXTURE_HEIGHT } from '../src/render/textures/painters';
import { onSurfaceMapArrived, preloadSurfaceMaps, setSurfaceMapBase, surfaceMapsSettled } from '../src/render/textures/surfaceMaps';
import { paintSurfaceCanvas } from '../src/render/textures/surfaceTextures';

setSurfaceMapBase('/assets/surfaces/');

const GROUPS: Record<string, SurfaceDesign[]> = {
  'walls-a': WALLS_A, 'walls-b': WALLS_B, 'walls-c': WALLS_C, 'walls-d': WALLS_D, 'walls-e': WALLS_E, 'walls-f': WALLS_F,
  'floors-a': FLOORS_A, 'floors-b': FLOORS_B, 'floors-c': FLOORS_C,
};
const BY_ID = new Map([...WALL_DESIGNS, ...FLOOR_DESIGNS].map((d) => [d.id, d]));

const PPM = 150; // swatch pixels per metre
const BG = '#efe9dd', INK = '#33291d', MUTED = '#7a6c5a';

interface Options { group?: string; ids?: string[]; palettes?: boolean; perSheet?: number }

/** Paints one design + palette at room scale into a w x h box of `ctx` at (x, y). */
function swatch(ctx: CanvasRenderingContext2D, d: SurfaceDesign, paletteId: string, x: number, y: number, scale: number): { w: number; h: number } {
  const tex = paintSurfaceCanvas(d, paletteId, 'high');
  const ppm = d.repeat > 2.4 && d.surface === 'wall' ? 360 / d.repeat : PPM;
  const k = ppm * scale;
  const rw = d.repeat * k;
  ctx.save();
  if (d.surface === 'wall') {
    const wm = d.repeat > 2.4 ? d.repeat : 2.4;
    const hm = d.repeat > 2.4 ? WALL_TEXTURE_HEIGHT : 2.0;
    const w = Math.round(wm * k), h = Math.round(hm * k);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const top = (WALL_TEXTURE_HEIGHT - hm) / WALL_TEXTURE_HEIGHT; // skip the top of the wall
    for (let i = 0; i * rw < w; i++) {
      ctx.drawImage(tex, 0, tex.height * top, tex.width, tex.height * (1 - top), x + i * rw, y, rw + 0.5, h);
    }
    ctx.restore();
    return { w, h };
  }
  const side = Math.round(2 * k);
  ctx.beginPath(); ctx.rect(x, y, side, side); ctx.clip();
  for (let j = 0; j * rw < side; j++) for (let i = 0; i * rw < side; i++) ctx.drawImage(tex, x + i * rw, y + j * rw, rw + 0.5, rw + 0.5);
  ctx.restore();
  return { w: side, h: side };
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, max: number): void {
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'top';
  let t = text;
  while (t.length > 4 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}.`;
  ctx.fillText(t, x, y);
}

function newSheet(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

async function settle(designs: SurfaceDesign[]): Promise<string[]> {
  const ids = [...new Set(designs.flatMap((d) => designMaps(d)))];
  await preloadSurfaceMaps(ids);
  const problems: string[] = [];
  if (!surfaceMapsSettled(ids)) problems.push('maps still loading');
  return problems;
}

async function render(o: Options): Promise<{ sheets: string[]; problems: string[]; designs: string[] }> {
  const designs = o.ids?.length
    ? o.ids.map((id) => BY_ID.get(id)).filter((d): d is SurfaceDesign => !!d)
    : GROUPS[o.group ?? ''] ?? [];
  const missing = (o.ids ?? []).filter((id) => !BY_ID.has(id));
  const problems = missing.map((id) => `unknown design ${id}`);
  problems.push(...await settle(designs));
  void onSurfaceMapArrived;
  const sheets: string[] = [];
  const pad = 14;
  if (o.palettes) {
    // every palette, large: one sheet per design, 4 columns
    for (const d of designs) {
      const cell = d.surface === 'wall' ? { w: Math.round((d.repeat > 2.4 ? 360 : 2.4 * PPM) * 0.75), h: Math.round((d.repeat > 2.4 ? 180 : 2.0 * PPM) * 0.75) } : { w: 225, h: 225 };
      const cols = 4, rowsN = Math.ceil(d.palettes.length / cols);
      const { canvas, ctx } = newSheet(pad + cols * (cell.w + pad), 40 + rowsN * (cell.h + 34 + pad));
      label(ctx, `${d.id}  -  ${d.name}`, pad, 12, '600 15px system-ui', INK, canvas.width - 2 * pad);
      d.palettes.forEach((p, i) => {
        const x = pad + (i % cols) * (cell.w + pad), y = 40 + Math.floor(i / cols) * (cell.h + 34 + pad);
        swatch(ctx, d, p.id, x, y, 0.75);
        label(ctx, `${p.id}`, x, y + cell.h + 4, '11px system-ui', INK, cell.w);
        label(ctx, p.colors.slice(0, 4).join(' '), x, y + cell.h + 18, '10px ui-monospace, monospace', MUTED, cell.w);
      });
      sheets.push(canvas.toDataURL('image/png'));
    }
    return { sheets, problems, designs: designs.map((d) => d.id) };
  }
  const per = o.perSheet ?? 6, cols = 3;
  const cellW = 372, cellH = 300 + 8 + 38 + 52;
  for (let s = 0; s < designs.length; s += per) {
    const chunk = designs.slice(s, s + per);
    const rowsN = Math.ceil(chunk.length / cols);
    const { canvas, ctx } = newSheet(pad + cols * (cellW + pad), pad + rowsN * (cellH + pad));
    chunk.forEach((d, i) => {
      const x = pad + (i % cols) * (cellW + pad), y = pad + Math.floor(i / cols) * (cellH + pad);
      const box = swatch(ctx, d, d.palettes[0]?.id ?? '', x, y, 1);
      label(ctx, d.id, x, y + 300 + 6, '600 13px system-ui', INK, cellW);
      label(ctx, `${d.name}  (${d.surface}, repeat ${d.repeat} m${d.repeat > 2.4 && d.surface === 'wall' ? ', whole repeat' : ''}, ${d.palettes.length} palettes)`, x, y + 300 + 22, '11px system-ui', MUTED, cellW);
      void box;
      // strip of the first 8 palettes: small swatches (~0.6 m square of the surface)
      const n = Math.min(8, d.palettes.length), sw = Math.floor((cellW - (n - 1) * 4) / n);
      for (let k = 0; k < n; k++) {
        const pal = d.palettes[k];
        if (!pal) continue;
        const tex = paintSurfaceCanvas(d, pal.id, 'low');
        const tx = x + k * (sw + 4), ty = y + 300 + 44;
        ctx.save(); ctx.beginPath(); ctx.rect(tx, ty, sw, sw); ctx.clip();
        const srcH = d.surface === 'wall' ? Math.min(tex.height, tex.width) : tex.height;
        ctx.drawImage(tex, 0, tex.height - srcH, Math.min(tex.width, srcH), srcH, tx, ty, sw, sw);
        ctx.restore();
      }
    });
    sheets.push(canvas.toDataURL('image/png'));
  }
  return { sheets, problems, designs: designs.map((d) => d.id) };
}

(window as unknown as { surfaceSheets: { render: typeof render } }).surfaceSheets = { render };
