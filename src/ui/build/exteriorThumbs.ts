// Small pictures for the exterior build tools: roof styles, fence and gate designs, ground paints and roof finishes, drawn on a 2D canvas
// with a tiny isometric projector (no WebGL, so they are cheap and work in any panel). Results are cached data URLs.

import type { FenceDef, PoolStyleDef, RoofFinishDef, RoofPalette, TerrainPaintDef } from '../../content/exterior';
import { fenceVariant } from '../../content/exterior';
import { RodGeometry, toWorld } from '../../render/fenceView';
import { groundTexture, roofTexture } from '../../render/exteriorTextures';
import { fencePieces, rodColor } from '../../world/fencePieces';
import { buildRoofMesh } from '../../world/roofs';
import * as THREE from 'three';

type V3 = [number, number, number];
interface Tri { p: [V3, V3, V3]; n: V3; color: string; alpha: number }

const cache = new Map<string, string>();
const LIGHT = norm([-0.45, 0.8, 0.55]);

function norm(a: V3): V3 { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Draws triangles with a fixed isometric view (camera at +x +z, 30 degrees down), fitted into a size x size canvas. */
function render(tris: Tri[], size: number, bg: string | null = null): string {
  if (typeof document === 'undefined' || tris.length === 0) return '';
  const az = Math.PI / 4, el = (30 * Math.PI) / 180;
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const proj = (p: V3): [number, number, number] => {
    const x1 = p[0] * ca - p[2] * sa, z1 = p[0] * sa + p[2] * ca;
    return [x1, p[1] * ce - z1 * se, p[1] * se + z1 * ce];
  };
  const pts = tris.map((t) => ({ t, v: t.p.map(proj) as [V3, V3, V3] }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { v } of pts) for (const q of v) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const pad = size * 0.06;
  const scale = (size - 2 * pad) / Math.max(maxX - minX, maxY - minY, 1e-6);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return '';
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
  const ox = (size - (maxX - minX) * scale) / 2 - minX * scale, oy = (size + (maxY - minY) * scale) / 2 + minY * scale;
  pts.sort((a, b) => a.v[0][2] + a.v[1][2] + a.v[2][2] - (b.v[0][2] + b.v[1][2] + b.v[2][2]));
  for (const { t, v } of pts) {
    const k = 0.5 + 0.55 * Math.max(0, t.n[0] * LIGHT[0] + t.n[1] * LIGHT[1] + t.n[2] * LIGHT[2]);
    g.globalAlpha = t.alpha;
    g.fillStyle = shade(t.color, k);
    g.strokeStyle = g.fillStyle;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(ox + v[0][0] * scale, oy - v[0][1] * scale);
    g.lineTo(ox + v[1][0] * scale, oy - v[1][1] * scale);
    g.lineTo(ox + v[2][0] * scale, oy - v[2][1] * scale);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.globalAlpha = 1;
  return c.toDataURL('image/png');
}

/** Triangles of a flat-shaded position/normal array. */
function trisOf(pos: ArrayLike<number>, nor: ArrayLike<number>, color: string | ((i: number) => string), alpha = 1): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < pos.length; i += 9) {
    out.push({
      p: [[pos[i]!, pos[i + 1]!, pos[i + 2]!], [pos[i + 3]!, pos[i + 4]!, pos[i + 5]!], [pos[i + 6]!, pos[i + 7]!, pos[i + 8]!]],
      n: [nor[i]!, nor[i + 1]!, nor[i + 2]!], color: typeof color === 'string' ? color : color(i / 9), alpha,
    });
  }
  return out;
}

/** The look of a roof style in a finish palette over a 6 x 4 m house. */
export function roofThumb(styleId: string, palette: RoofPalette, size = 120, pitch?: number): string {
  const key = `roof:${styleId}:${palette.id}:${palette.colors[0]}:${pitch ?? ''}:${size}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let mesh;
  try { mesh = buildRoofMesh(styleId, 6, 4, 'h', pitch ?? 30); } catch { return ''; }
  const tris: Tri[] = [];
  // a simple house under the roof: four plaster walls 2.8 m high
  const wall = '#e9dfcb';
  const H = 2.8;
  const box = (x0: number, z0: number, x1: number, z1: number): Tri[] => {
    const faces: Array<[V3[], V3]> = [
      [[[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1]],
      [[[x1, 0, z0], [x1, 0, z1], [x1, H, z1], [x1, H, z0]], [1, 0, 0]],
      [[[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], [-1, 0, 0]],
      [[[x0, 0, z0], [x1, 0, z0], [x1, H, z0], [x0, H, z0]], [0, 0, -1]],
    ];
    return faces.flatMap(([q, n]) => [
      { p: [q[0]!, q[1]!, q[2]!] as [V3, V3, V3], n, color: wall, alpha: 1 }, { p: [q[0]!, q[2]!, q[3]!] as [V3, V3, V3], n, color: wall, alpha: 1 },
    ]);
  };
  tris.push(...box(0, 0, 6, 4).map((t) => ({ ...t, p: t.p.map((p) => [p[0], p[1] - 2.8, p[2]] as V3) as [V3, V3, V3] })));
  tris.push(...trisOf(mesh.parts.slope.pos, mesh.parts.slope.nor, palette.colors[0]));
  tris.push(...trisOf(mesh.parts.gable.pos, mesh.parts.gable.nor, wall));
  tris.push(...trisOf(mesh.parts.trim.pos, mesh.parts.trim.nor, palette.colors[1]));
  tris.push(...trisOf(mesh.parts.glass.pos, mesh.parts.glass.nor, '#bcd9df', 0.7));
  const url = render(tris, size);
  cache.set(key, url);
  return url;
}

/** Two metres of a fence or gate design in a variant. */
export function fenceThumb(def: FenceDef, variant = 0, size = 120): string {
  const key = `fence:${def.id}:${variant}:${size}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const solid = new RodGeometry(), glass = new RodGeometry();
  const v = Math.max(0, def.variants.indexOf(fenceVariant(def, variant)));
  const color = new THREE.Color();
  const count = def.kind === 'gate' ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const f = { dir: 'h' as const, x: i, z: 0, level: 0 };
    for (const r of fencePieces(def, { endPost: i === count - 1, variant: v })) {
      (r.part === 'glass' ? glass : solid).rod(toWorld(f, r.a), toWorld(f, r.b), r.w, r.t, color.set(rodColor(def, v, r.part)));
    }
  }
  // the ground under it
  const tris = [
    ...trisOf([-0.2, 0, -0.5, count + 0.2, 0, 0.5, count + 0.2, 0, -0.5, -0.2, 0, -0.5, -0.2, 0, 0.5, count + 0.2, 0, 0.5], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], '#9bbf78'),
    ...trisOf(solid.pos, solid.nor, (i) => `#${new THREE.Color(solid.col[i * 9]!, solid.col[i * 9 + 1]!, solid.col[i * 9 + 2]!).getHexString()}`),
    ...trisOf(glass.pos, glass.nor, '#bcd9df', 0.55),
  ];
  const url = render(tris, size);
  cache.set(key, url);
  return url;
}

/** The surface of a roof finish in one palette (a square of the procedural texture). */
export function finishThumb(fin: RoofFinishDef, palette: RoofPalette): string {
  const key = `finish:${fin.id}:${palette.id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const tex = roofTexture(fin.texture, palette);
  const img = tex?.image as HTMLCanvasElement | undefined;
  const url = img?.toDataURL ? img.toDataURL('image/png') : '';
  tex?.dispose();
  cache.set(key, url);
  return url;
}

/** A small pool: coping frame, tiled basin walls and floor, the water surface and a ladder. */
export function poolThumb(def: PoolStyleDef, size = 120): string {
  const key = `pool:${def.id}:${def.water}:${def.tile}:${def.coping}:${size}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const W = 5, D = 3, INSET = 0.3, H = 0.55;
  const quad = (p: [V3, V3, V3, V3], n: V3, color: string, alpha = 1): Tri[] => [
    { p: [p[0], p[1], p[2]], n, color, alpha }, { p: [p[0], p[2], p[3]], n, color, alpha },
  ];
  const x0 = INSET, x1 = W - INSET, z0 = INSET, z1 = D - INSET;
  const tris: Tri[] = [];
  // coping: the flat frame around the water, and the outer lip
  tris.push(...quad([[0, 0, 0], [W, 0, 0], [W, 0, z0], [0, 0, z0]], [0, 1, 0], def.coping));
  tris.push(...quad([[0, 0, z1], [W, 0, z1], [W, 0, D], [0, 0, D]], [0, 1, 0], def.coping));
  tris.push(...quad([[0, 0, z0], [x0, 0, z0], [x0, 0, z1], [0, 0, z1]], [0, 1, 0], def.coping));
  tris.push(...quad([[x1, 0, z0], [W, 0, z0], [W, 0, z1], [x1, 0, z1]], [0, 1, 0], def.coping));
  // basin walls (the inside faces) and the tiled floor
  tris.push(...quad([[x0, -H, z0], [x1, -H, z0], [x1, 0, z0], [x0, 0, z0]], [0, 0, -1], def.tile));
  tris.push(...quad([[x0, -H, z1], [x1, -H, z1], [x1, 0, z1], [x0, 0, z1]], [0, 0, 1], def.tile));
  tris.push(...quad([[x0, -H, z0], [x0, -H, z1], [x0, 0, z1], [x0, 0, z0]], [-1, 0, 0], def.tile));
  tris.push(...quad([[x1, -H, z0], [x1, -H, z1], [x1, 0, z1], [x1, 0, z0]], [1, 0, 0], def.tile));
  tris.push(...quad([[x0, -H, z0], [x1, -H, z0], [x1, -H, z1], [x0, -H, z1]], [0, 1, 0], shade(def.tile, 0.82)));
  // water surface, slightly below the coping
  const wy = -0.07;
  tris.push(...quad([[x0, wy, z0], [x1, wy, z0], [x1, wy, z1], [x0, wy, z1]], [0, 1, 0], def.water, 0.86));
  // a ladder on the south coping
  const lx = W / 2 + 0.35, rail = '#d8dde0';
  for (const dx of [-0.22, 0.22]) {
    tris.push(...quad([[lx + dx - 0.04, -H, z1 + 0.02], [lx + dx + 0.04, -H, z1 + 0.02], [lx + dx + 0.04, 0.5, z1 + 0.02], [lx + dx - 0.04, 0.5, z1 + 0.02]], [0, 0, 1], rail));
  }
  for (const y of [-H + 0.12, -H + 0.3, 0.12, 0.3]) {
    tris.push(...quad([[lx - 0.22, y, z1 + 0.0], [lx + 0.22, y, z1 + 0.0], [lx + 0.22, y + 0.05, z1 + 0.05], [lx - 0.22, y + 0.05, z1 + 0.05]], [0, 0, 1], rail));
  }
  const url = render(tris, size, '#b7d3a0');
  cache.set(key, url);
  return url;
}

/** The look of a ground paint. */
export function paintThumb(def: TerrainPaintDef): string {
  const key = `paint:${def.id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const tex = groundTexture(def, 96);
  const img = tex?.image as HTMLCanvasElement | undefined;
  const url = img?.toDataURL ? img.toDataURL('image/png') : '';
  tex?.dispose();
  cache.set(key, url);
  return url;
}
