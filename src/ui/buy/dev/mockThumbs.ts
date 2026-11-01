// OWNER: UI editors agent. DEV ONLY: simple SVG thumbnails standing in for the renderer's thumbnails.

import type { ObjectDef, Palette, SurfaceDesign } from '../../../content/types';

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Isometric box sized by the footprint and height, coloured from the default finishes. */
export function furnitureThumb(def: ObjectDef): string {
  const c = def.finishes[0]?.swatches[0]?.color ?? '#b9a48a';
  const c2 = def.finishes[1]?.swatches[0]?.color ?? shade(c, 0.18);
  let w = def.footprint.w, d = def.footprint.d, hgt = Math.max(0.04, Math.min(2.2, def.height));
  if (def.layer === 'wall') d = 0.1;
  if (def.layer === 'surface') { w *= 0.7; d *= 0.6; }
  const cos = Math.cos(Math.PI / 6), sin = 0.5;
  const P = (x: number, y: number, z: number) => [(x - z) * cos, (x + z) * sin - y] as const;
  const pts = [[0, 0, 0], [w, 0, 0], [w, 0, d], [0, 0, d], [0, hgt, 0], [w, hgt, 0], [w, hgt, d], [0, hgt, d]].map(([x, y, z]) => P(x!, y!, z!));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = 76 / Math.max(maxX - minX, maxY - minY, 0.5);
  const ox = 50 - ((minX + maxX) / 2) * s, oy = 54 - ((minY + maxY) / 2) * s;
  const poly = (corners: number[][], fill: string) => `<polygon points="${corners.map(([x, y, z]) => { const p = P(x!, y!, z!); return `${(p[0] * s + ox).toFixed(1)},${(p[1] * s + oy).toFixed(1)}`; }).join(' ')}" fill="${fill}" stroke="${shade(c, -0.45)}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const top = poly([[0, hgt, 0], [w, hgt, 0], [w, hgt, d], [0, hgt, d]], def.finishes[1] ? c2 : shade(c, 0.22));
  const front = poly([[0, 0, d], [w, 0, d], [w, hgt, d], [0, hgt, d]], c);
  const right = poly([[w, 0, 0], [w, 0, d], [w, hgt, d], [w, hgt, 0]], shade(c, -0.2));
  const shadow = `<ellipse cx="50" cy="${(maxY * s + oy + 3).toFixed(1)}" rx="34" ry="5" fill="rgba(60,40,20,0.12)"/>`;
  return url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fbf8f3"/>${shadow}${front}${right}${top}</svg>`);
}

/** Pattern swatch for a wall or floor design in one palette. */
export function surfaceThumb(design: SurfaceDesign, palette: Palette): string {
  const [a = '#dddddd', b = a, c = b] = palette.colors;
  const f = `${design.family} ${design.id}`.toLowerCase();
  let body: string;
  if (/mural/.test(f)) {
    body = `<rect width="96" height="96" fill="${a}"/><path d="M0 60 Q24 38 48 56 T96 50 V96 H0z" fill="${b}"/><path d="M0 74 Q30 58 60 72 T96 70 V96 H0z" fill="${shade(b, -0.25)}"/><circle cx="72" cy="24" r="10" fill="${c}"/>`;
  } else if (/stripe/.test(f) && !/gingham|check(?!er)/.test(f)) {
    body = `<rect width="96" height="96" fill="${a}"/>${[0, 32, 64].map((x) => `<rect x="${x + 6}" width="14" height="96" fill="${b}"/><rect x="${x + 24}" width="3" height="96" fill="${c}"/>`).join('')}`;
  } else if (/gingham|check(?!er)/.test(f)) {
    body = `<rect width="96" height="96" fill="${a}"/>${[0, 24, 48, 72].map((v) => `<rect x="${v}" width="12" height="96" fill="${b}" opacity="0.55"/><rect y="${v}" width="96" height="12" fill="${b}" opacity="0.55"/>`).join('')}`;
  } else if (/hex|mosaic/.test(f)) {
    let dots = '';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) dots += `<circle cx="${x * 15 + (y % 2) * 7.5 + 4}" cy="${y * 14 + 6}" r="6.4" fill="${(x + y) % 5 === 0 ? b : a}"/>`;
    body = `<rect width="96" height="96" fill="${c}"/>${dots}`;
  } else if (/checker/.test(f)) {
    let sq = '';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) sq += `<rect x="${x * 24}" y="${y * 24}" width="24" height="24" fill="${(x + y) % 2 ? c : a}"/>`;
    body = sq;
  } else if (/tile|ceramic|brick|stone|paver/.test(f)) {
    const bw = /paver|stone/.test(f) ? 32 : 24, bh = /paver|stone/.test(f) ? 32 : 12;
    let bricks = '';
    for (let y = 0; y * bh < 96; y++) for (let x = -1; x * bw < 96; x++) bricks += `<rect x="${x * bw + (y % 2) * (bw / 2) + 1}" y="${y * bh + 1}" width="${bw - 2}" height="${bh - 2}" rx="1" fill="${(x * 7 + y * 3) % 4 === 0 ? b : a}"/>`;
    body = `<rect width="96" height="96" fill="${/brick/.test(f) ? shade(c, 0.3) : c}"/>${bricks}`;
  } else if (/wood|plank|parquet|deck|panel|board/.test(f)) {
    let planks = '';
    if (/parquet|herringbone/.test(f)) {
      for (let y = -1; y < 7; y++) for (let x = 0; x < 6; x++) planks += `<rect x="${x * 16}" y="${y * 16 + (x % 2) * 8}" width="8" height="24" fill="${(x + y) % 3 ? a : b}" stroke="${c}" stroke-width="0.8"/>`;
    } else {
      const vertical = /panel|bead|board-formed/.test(f);
      for (let i = 0; i < 8; i++) planks += vertical
        ? `<rect x="${i * 12}" width="12" height="96" fill="${i % 3 ? a : b}" stroke="${c}" stroke-width="0.8"/>`
        : `<rect y="${i * 12}" width="96" height="12" fill="${i % 3 ? a : b}" stroke="${c}" stroke-width="0.8"/><line x1="${(i * 37) % 96}" y1="${i * 12}" x2="${(i * 37) % 96}" y2="${i * 12 + 12}" stroke="${c}"/>`;
    }
    body = planks;
  } else if (/carpet|textile/.test(f)) {
    let dots = '';
    for (let i = 0; i < 90; i++) dots += `<circle cx="${(i * 37) % 96}" cy="${(i * 53) % 96}" r="1.3" fill="${b}" opacity="0.6"/>`;
    body = `<rect width="96" height="96" fill="${a}"/>${dots}`;
  } else if (/concrete|terrazzo|industrial/.test(f)) {
    let chips = '';
    for (let i = 0; i < 60; i++) chips += `<circle cx="${(i * 41) % 96}" cy="${(i * 29) % 96}" r="${/terrazzo/.test(f) ? 2.6 : 0.9}" fill="${i % 2 ? b : c}" opacity="0.7"/>`;
    body = `<rect width="96" height="96" fill="${a}"/>${chips}`;
  } else if (/floral|botanical|fern/.test(f)) {
    let fl = '';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 24 + 12 + (y % 2) * 6, cy = y * 24 + 12;
      fl += /fern|botanical/.test(f) ? `<path d="M${cx - 8} ${cy + 8} Q${cx} ${cy - 10} ${cx + 8} ${cy - 8}" stroke="${b}" stroke-width="3" fill="none"/>` : `<circle cx="${cx}" cy="${cy}" r="5" fill="${b}"/><circle cx="${cx}" cy="${cy}" r="2" fill="${c}"/>`;
    }
    body = `<rect width="96" height="96" fill="${a}"/>${fl}`;
  } else if (/geometric|geo/.test(f)) {
    let tri = '';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) tri += `<path d="M${x * 24} ${y * 24 + 24} L${x * 24 + 12} ${y * 24} L${x * 24 + 24} ${y * 24 + 24}z" fill="${(x + y) % 2 ? b : c}"/>`;
    body = `<rect width="96" height="96" fill="${a}"/>${tri}`;
  } else if (/luxury|damask/.test(f)) {
    let dm = '';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) dm += `<path d="M${x * 24 + 12} ${y * 24 + 2} l10 10 -10 10 -10 -10z" fill="none" stroke="${c}" stroke-width="2"/>`;
    body = `<rect width="96" height="96" fill="${a}"/>${dm}`;
  } else {
    body = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(a, 0.08)}"/><stop offset="1" stop-color="${shade(a, -0.08)}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/>`;
  }
  return url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${body}</svg>`);
}
