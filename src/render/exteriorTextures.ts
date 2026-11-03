// Procedural canvas textures for the Milestone 9 exterior: roof finishes (shingle, shake, tile, flat tile, standing seam, corrugated,
// slate, thatch, copper, sedum, membrane) and ground paints (grass, meadow, dirt, flagstone, gravel, sand, mulch, bed, stones, cobble,
// tilled, lawn). Seeded and reproducible; every texture tiles. The painters only need a 2D canvas context (a fake in unit tests).

import * as THREE from 'three';
import type { RoofPalette, TerrainPaintDef } from '../content/exterior';
import { hash01 } from './geo';

/** Metres one roof texture repeat covers (the uv of a roof slope is in metres). */
export const ROOF_TEX_METRES = 2;
/** Cells of the terrain atlas. */
export const ATLAS_COLS = 4;
const CELL = 96;

type Ctx = CanvasRenderingContext2D;

const mix = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: Ctx } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  return g ? { c, g } : null;
}

/** Draws `fn` at the nine wrapped offsets so features crossing an edge tile. */
function wrapped(g: Ctx, size: number, fn: () => void): void {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { g.save(); g.translate(dx, dy); fn(); g.restore(); }
}

function paintRoof(g: Ctx, n: number, kind: string, main: string, accent: string, seed: number): void {
  const r = (i: number) => hash01(seed * 131 + i);
  g.fillStyle = main;
  g.fillRect(0, 0, n, n);
  switch (kind) {
    case 'shingle': {
      const rows = 8, rh = n / rows, cols = 6, cw = n / cols;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * cw / 2, t = r(y * 17 + x) * 0.5;
        g.fillStyle = mix(main, accent, t);
        g.fillRect(x * cw + ox + 1, y * rh + 1, cw - 2, rh - 1);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x * cw + ox, y * rh + rh - 3, cw, 3);
        if (ox) g.fillRect(x * cw + ox - cw, y * rh + rh - 3, cw, 3);
      }
      break;
    }
    case 'shake': {
      const rows = 6, rh = n / rows;
      for (let y = 0; y < rows; y++) {
        let x = -r(y) * 14;
        while (x < n) {
          const w = 10 + r(y * 31 + x) * 12;
          g.fillStyle = mix(main, accent, r(y * 7 + Math.floor(x)) * 0.7);
          g.fillRect(x + 1, y * rh, w - 1, rh - 1);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x, y * rh + rh - 2, w, 2);
          x += w;
        }
      }
      break;
    }
    case 'tile': {
      const cols = 6, cw = n / cols, rows = 6, rh = n / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols + 1; x++) {
        const cx = x * cw + (y % 2 ? cw / 2 : 0) - cw / 2, cy = y * rh;
        const grad = g.createLinearGradient(cx, cy, cx + cw, cy);
        grad.addColorStop(0, mix(main, accent, 0.6)); grad.addColorStop(0.5, mix(main, '#ffffff', 0.12)); grad.addColorStop(1, mix(main, accent, 0.7));
        g.fillStyle = grad;
        g.fillRect(cx + 1, cy, cw - 2, rh);
        g.fillStyle = 'rgba(0,0,0,0.32)';
        g.fillRect(cx, cy + rh - 3, cw, 3);
      }
      break;
    }
    case 'flatTile': {
      const cols = 5, cw = n / cols, rows = 8, rh = n / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        g.fillStyle = mix(main, accent, r(y * 11 + x) * 0.35);
        g.fillRect(x * cw + (y % 2) * 3 + 1, y * rh + 1, cw - 2, rh - 2);
      }
      break;
    }
    case 'seam': case 'corrugated': {
      const ribs = kind === 'seam' ? 6 : 12, rw = n / ribs;
      for (let x = 0; x < ribs; x++) {
        const grad = g.createLinearGradient(x * rw, 0, (x + 1) * rw, 0);
        grad.addColorStop(0, mix(main, '#ffffff', kind === 'seam' ? 0.1 : 0.2));
        grad.addColorStop(0.5, main);
        grad.addColorStop(1, mix(main, accent, 0.8));
        g.fillStyle = grad;
        g.fillRect(x * rw, 0, rw, n);
        if (kind === 'seam') { g.fillStyle = mix(main, accent, 1); g.fillRect(x * rw, 0, 2, n); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x * rw + 2, 0, 1, n); }
      }
      break;
    }
    case 'slate': {
      const rows = 7, rh = n / rows, cols = 4, cw = n / cols;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * cw / 2;
        g.fillStyle = mix(main, accent, r(y * 13 + x) * 0.9);
        g.fillRect(x * cw + ox + 1, y * rh + 1, cw - 2, rh - 1);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(x * cw + ox + 1, y * rh + 1, cw - 2, 2);
        if (ox) g.fillRect(x * cw + ox - cw + 1, y * rh + 1, cw - 2, 2);
      }
      break;
    }
    case 'thatch': {
      for (let i = 0; i < 700; i++) {
        const x = r(i * 3) * n, y = r(i * 3 + 1) * n, len = 10 + r(i * 3 + 2) * 16;
        g.strokeStyle = mix(main, accent, r(i * 5)); g.lineWidth = 1.5;
        wrapped(g, n, () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r(i) - 0.5) * 4, y + len); g.stroke(); });
      }
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < n; y += 16) g.fillRect(0, y, n, 2);
      break;
    }
    case 'copper': {
      for (let x = 0; x < 5; x++) { g.fillStyle = mix(main, accent, x % 2 ? 0.25 : 0); g.fillRect(x * n / 5, 0, n / 5 - 2, n); }
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + r(i) * 0.06})`; g.fillRect(r(i * 2) * n, r(i * 2 + 1) * n, 10, 2); }
      break;
    }
    case 'sedum': {
      for (let i = 0; i < 900; i++) {
        const x = r(i * 3) * n, y = r(i * 3 + 1) * n, rad = 2 + r(i * 3 + 2) * 3;
        g.fillStyle = mix(main, accent, r(i * 7) * (i % 5 === 0 ? 1 : 0.4));
        wrapped(g, n, () => { g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); });
      }
      break;
    }
    default: { // membrane
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, 0, 2, n); g.fillRect(n / 2, 0, 2, n);
      for (let i = 0; i < 150; i++) { g.fillStyle = `rgba(${r(i) > 0.5 ? '255,255,255' : '0,0,0'},0.03)`; g.fillRect(r(i * 2) * n, r(i * 2 + 1) * n, 5, 5); }
    }
  }
}

/** A roof surface texture (null without a DOM). Colour space is sRGB; the caller sets repeat. */
export function roofTexture(kind: string, palette: RoofPalette): THREE.CanvasTexture | null {
  const cv = canvas(128, 128);
  if (!cv) return null;
  const seed = [...`${kind}${palette.id}`].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) | 0;
  paintRoof(cv.g, 128, kind, palette.colors[0], palette.colors[1], seed);
  const tex = new THREE.CanvasTexture(cv.c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / ROOF_TEX_METRES, 1 / ROOF_TEX_METRES);
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------------------------

function paintGround(g: Ctx, n: number, pattern: string, c1: string, c2: string, seed: number): void {
  const r = (i: number) => hash01(seed * 977 + i);
  g.fillStyle = c1;
  g.fillRect(0, 0, n, n);
  const speckle = (count: number, size: number, alpha: number, color: string) => {
    for (let i = 0; i < count; i++) {
      g.fillStyle = color; g.globalAlpha = alpha * (0.4 + r(i * 3) * 0.6);
      wrapped(g, n, () => g.fillRect(r(i * 3 + 1) * n, r(i * 3 + 2) * n, size, size));
    }
    g.globalAlpha = 1;
  };
  switch (pattern) {
    case 'grass': case 'lawn': case 'meadow': {
      speckle(260, 2, 0.5, c2); speckle(160, 2, 0.35, '#3f6b2f');
      if (pattern === 'lawn') { g.fillStyle = 'rgba(255,255,255,0.1)'; for (let y = 0; y < n; y += n / 3) g.fillRect(0, y, n, n / 6); }
      if (pattern === 'meadow') for (let i = 0; i < 26; i++) { g.fillStyle = ['#f2c84a', '#fff3f0', '#d89ab4', '#9b7cd0'][i % 4]!; g.fillRect(r(i * 2) * n, r(i * 2 + 1) * n, 3, 3); }
      break;
    }
    case 'dirt': speckle(240, 3, 0.45, c2); speckle(80, 2, 0.3, '#b8946b'); break;
    case 'flagstone': {
      const s = n / 3;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        g.fillStyle = mix(c1, '#ffffff', r(y * 3 + x) * 0.18); g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
      g.fillStyle = c2; for (let i = 0; i <= 3; i++) { g.fillRect(i * s - 1, 0, 3, n); g.fillRect(0, i * s - 1, n, 3); }
      break;
    }
    case 'gravel': speckle(520, 3, 0.7, c2); speckle(260, 2, 0.5, '#d8d0c0'); speckle(120, 3, 0.4, '#6e665a'); break;
    case 'sand': speckle(300, 2, 0.4, c2); speckle(120, 1, 0.5, '#f5ebc8'); break;
    case 'mulch': {
      for (let i = 0; i < 160; i++) {
        g.strokeStyle = mix(c1, c2, r(i)); g.lineWidth = 2;
        const x = r(i * 2) * n, y = r(i * 2 + 1) * n, a = r(i * 5) * Math.PI;
        wrapped(g, n, () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke(); });
      }
      break;
    }
    case 'bed': speckle(260, 3, 0.5, c2); speckle(70, 2, 0.4, '#6e4d36'); break;
    case 'tilled': {
      for (let y = 0; y < 4; y++) {
        g.fillStyle = c2; g.fillRect(0, y * n / 4 + 2, n, n / 8);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y * n / 4 + n / 8 + 2, n, 3);
      }
      speckle(120, 2, 0.4, '#8a6a4e');
      break;
    }
    case 'stones': { // round stepping stones in grass
      speckle(240, 2, 0.5, '#a8c883');
      for (const [x, y, rad] of [[0.3, 0.3, 0.2], [0.72, 0.68, 0.22]] as const) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x * n + 2, y * n + 3, rad * n, rad * n * 0.86, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = c2; g.beginPath(); g.ellipse(x * n, y * n, rad * n, rad * n * 0.86, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(x * n - 3, y * n - 3, rad * n * 0.5, rad * n * 0.4, 0, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'cobble': {
      const s = n / 5;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        const ox = (y % 2) * s / 2;
        g.fillStyle = mix(c1, c2, r(y * 5 + x) * 0.8);
        g.beginPath(); g.ellipse((x * s + ox + s / 2) % n, y * s + s / 2, s * 0.45, s * 0.42, 0, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    default: speckle(200, 2, 0.4, c2);
  }
}

/** One painted ground texture on its own canvas (the lot ground). */
export function groundTexture(def: Pick<TerrainPaintDef, 'id' | 'color' | 'color2' | 'pattern'>, size = 128): THREE.CanvasTexture | null {
  const cv = canvas(size, size);
  if (!cv) return null;
  paintGround(cv.g, size, def.pattern, def.color, def.color2, [...def.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 5) | 0);
  const tex = new THREE.CanvasTexture(cv.c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export interface TerrainAtlas { texture: THREE.CanvasTexture; cols: number; rows: number; index: Record<string, number> }

/** Every paint on one canvas, ATLAS_COLS cells per row; a cell is addressed by index (row-major from the top-left). */
export function terrainAtlas(defs: readonly Pick<TerrainPaintDef, 'id' | 'color' | 'color2' | 'pattern'>[]): TerrainAtlas | null {
  const rows = Math.ceil(defs.length / ATLAS_COLS);
  const cv = canvas(ATLAS_COLS * CELL, rows * CELL);
  if (!cv) return null;
  const index: Record<string, number> = {};
  defs.forEach((d, i) => {
    index[d.id] = i;
    const cell = canvas(CELL, CELL);
    if (!cell) return;
    paintGround(cell.g, CELL, d.pattern, d.color, d.color2, [...d.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 5) | 0);
    cv.g.drawImage(cell.c, (i % ATLAS_COLS) * CELL, Math.floor(i / ATLAS_COLS) * CELL);
  });
  const texture = new THREE.CanvasTexture(cv.c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, cols: ATLAS_COLS, rows, index };
}
