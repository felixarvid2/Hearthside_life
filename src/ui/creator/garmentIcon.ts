// Thumbnails for the creator's garment and accessory pickers: a small flat SVG drawn from the item's own build parameters
// (sleeve length, neckline, hem, flare, pockets, shoe style, hat style...), so every garment gets a silhouette that matches
// what the 3D preview shows without a render pass. Pure: returns SVG markup (viewBox 48 x 48, drawn facing the viewer).

import type { AccessoryDef, GarmentDef } from '../../content/types';
import { mixHex, shadeHex } from '../../characters/outfits';

type B = Record<string, number | string | boolean>;
const num = (b: B, k: string, d: number) => (typeof b[k] === 'number' ? (b[k] as number) : d);
const str = (b: B, k: string, d = '') => (typeof b[k] === 'string' ? (b[k] as string) : d);
const f = (n: number) => (Math.round(n * 10) / 10).toString();
const SKIN = '#e8c39d';
const INK = 'rgba(30,24,20,0.55)';

interface Pen { main: string; dark: string; light: string }

function path(d: string, fill: string, extra = ''): string {
  return `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="1" stroke-linejoin="round" ${extra}/>`;
}
function line(d: string, stroke = INK, w = 0.9): string {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function dot(x: number, y: number, r: number, fill: string): string { return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}"/>`; }

/** Sleeve as a quad from the shoulder; `len` 0..1 of a full sleeve; side +1 = left of the picture. */
function sleeve(len: number, w: number, pen: Pen, side: 1 | -1): string {
  const L = 3 + 19 * len;
  const out = -side; // outward along x
  const x0 = 24 + out * 9.4, y0 = 11.6;
  const dx = out * 0.42, dy = 0.91;
  const px = 0.91 * (w / 2), py = -out * 0.42 * (w / 2);
  const ex = x0 + dx * L, ey = y0 + dy * L;
  const pts = [[x0 + px, y0 + py], [x0 - px, y0 - py], [ex - px, ey - py], [ex + px, ey + py]];
  return path(`M${pts.map((q) => `${f(q[0] as number)} ${f(q[1] as number)}`).join('L')}Z`, pen.main);
}

function pocketMarks(b: B, y0: number, y1: number): string {
  const pocket = str(b, 'pocket');
  if (pocket === 'kangaroo') return line(`M17.5 ${f(y1 - 1)}L19 ${f(y1 - 8)}H29L30.5 ${f(y1 - 1)}`);
  if (pocket === 'chest' || pocket === 'denim') return line(`M18.5 ${f(y0 + 5)}h5v4.5h-5zM25.5 ${f(y0 + 5)}h5v4.5h-5z`);
  if (pocket === 'welt') return line(`M18 ${f(y1 - 6)}h5M25 ${f(y1 - 6)}h5M27 ${f(y0 + 6)}h3.2`);
  return '';
}

function placketMarks(b: B, top: number, bottom: number, pen: Pen): string {
  const p = str(b, 'placket');
  if (p === 'zip') return line(`M24 ${f(top)}V${f(bottom)}`, pen.dark, 1.2);
  if (p === 'double') return [0, 1, 2].map((k) => dot(21 + 0, top + 4 + k * 5, 0.9, INK) + dot(27, top + 4 + k * 5, 0.9, INK)).join('') + line(`M24 ${f(top)}V${f(bottom)}`);
  if (p === 'buttons') return [0, 1, 2, 3].map((k) => dot(24, top + 3 + k * 5, 0.9, INK)).filter((_, k) => top + 3 + k * 5 < bottom).join('');
  if (p === 'two') return dot(24, top + 3, 0.9, INK) + dot(24, top + 8, 0.9, INK);
  if (p === 'short') return [0, 1, 2].map((k) => dot(24, top + 2.5 + k * 3, 0.8, INK)).join('');
  return '';
}

/** A shirt, jacket or the upper half of a dress/jumpsuit/suit; returns markup and the hem y. */
function upper(b: B, pen: Pen, layer: string, hemY?: number): { svg: string; hem: number } {
  const sleeveLen = num(b, 'sleeve', 0);
  const neck = str(b, 'neck', 'crew');
  const hem = hemY ?? (37 - 8 * Math.min(1.6, num(b, 'hem', 0.1)));
  const bulk = layer === 'outer' ? 1.2 : 0;
  const hw = 9.4 + bulk;
  let s = '';
  if (sleeveLen > 0) s += sleeve(sleeveLen, 6.2 + num(b, 'sleeveLoose', 0.3) * 2 + bulk + num(b, 'balloon', 0) * 60, pen, 1) + sleeve(sleeveLen, 6.2 + num(b, 'sleeveLoose', 0.3) * 2 + bulk + num(b, 'balloon', 0) * 60, pen, -1);
  // torso
  s += path(`M${f(24 - hw)} 11.5C${f(24 - hw)} 10 20 9.5 24 9.5S${f(24 + hw)} 10 ${f(24 + hw)} 11.5L${f(24 + hw - 0.8)} ${f(hem)}H${f(24 - hw + 0.8)}Z`, pen.main);
  if (sleeveLen === 0) {
    // sleeveless: armholes cut into the sides
    s += path(`M${f(24 - hw)} 11.5C${f(24 - hw + 1)} 18 ${f(24 - hw + 3)} 16 ${f(24 - hw + 3.4)} 20L${f(24 - hw)} 20Z`, '#fff0', 'opacity="0"');
  }
  // neckline
  const deep = neck === 'cardigan' ? 19 : neck === 'shawl' ? 17 : neck === 'lapel' ? 14 : neck === 'vest' ? 14 : neck === 'wrap' ? 12 : neck === 'v' ? 8 : 0;
  if (deep > 0) {
    const halfW = neck === 'cardigan' ? 6.5 : neck === 'vest' ? 5.5 : neck === 'v' ? 5 : 5.5;
    const inner = layer === 'outer' || str(b, 'collar').includes('lapel') ? mixHex(pen.main, '#ffffff', 0.7) : SKIN;
    s += path(`M${f(24 - halfW)} 9.6L24 ${f(9.6 + deep)}L${f(24 + halfW)} 9.6Z`, inner);
    if (neck === 'lapel' || neck === 'shawl' || neck === 'cardigan') {
      s += line(`M${f(24 - halfW)} 9.6L24 ${f(9.6 + deep)}M${f(24 + halfW)} 9.6L24 ${f(9.6 + deep)}`, pen.dark, neck === 'cardigan' ? 2.6 : 1.8);
      if (neck === 'lapel') s += path(`M${f(24 - halfW - 3)} 10.5L${f(24 - halfW + 0.4)} 9.6L24 ${f(9.6 + deep * 0.55)}Z`, pen.light) + path(`M${f(24 + halfW + 3)} 10.5L${f(24 + halfW - 0.4)} 9.6L24 ${f(9.6 + deep * 0.55)}Z`, pen.light);
    }
    if (b.tie === true) s += path('M23 10.5L25 10.5L25.8 19L24 21L22.2 19Z', '#8a2230');
  } else if (neck === 'boat') s += path('M15 10.2Q24 15.5 33 10.2Z', SKIN);
  else if (neck === 'scoop' || neck === 'tank') s += path('M18 9.8Q24 20 30 9.8Z', SKIN);
  else if (neck === 'square') s += path('M18 9.8V16H30V9.8Z', SKIN);
  else if (neck === 'turtle') s += path('M19.5 4.5H28.5V10.5H19.5Z', pen.main) + line('M19.5 7.5H28.5', pen.dark);
  else if (neck === 'high') s += path('M20 6.5H28V10.5H20Z', pen.main);
  else if (neck === 'collar') s += path('M24 9.8L19 7 20.5 12.5Z', pen.light) + path('M24 9.8L29 7 27.5 12.5Z', pen.light);
  else s += path('M19.5 9.8Q24 15 28.5 9.8Z', SKIN);
  if (b.hood === true) s += path('M17 9.5Q24 3 31 9.5Q24 7.5 17 9.5Z', pen.dark);
  if (str(b, 'collar').includes('shawl')) s += line('M18.5 10L24 26.5L29.5 10', pen.light, 2.6);
  if (b.rib === true || b.hemBand === true) s += line(`M${f(24 - hw + 0.8)} ${f(hem - 2.2)}H${f(24 + hw - 0.8)}`, pen.dark, 0.7);
  if (b.cuffs === true && sleeveLen > 0.6) s += line('M9.4 29.5L11.6 30.3M38.6 29.5L36.4 30.3', pen.dark, 1.1);
  s += pocketMarks(b, 12, hem);
  s += placketMarks(b, deep > 0 ? 9.6 + deep : 10, hem - 1, pen);
  if (b.belt === true) s += line(`M${f(24 - hw + 0.6)} 26.5H${f(24 + hw - 0.6)}`, pen.dark, 1.8);
  if (str(b, 'decor') === 'quilt') s += [17, 22, 27, 32].filter((y) => y < hem - 1).map((y) => line(`M${f(24 - hw + 0.8)} ${y}H${f(24 + hw - 0.8)}`, pen.dark, 0.7)).join('');
  if (str(b, 'decor') === 'wrap') s += line('M19 10L30 27', pen.dark, 1);
  if (str(b, 'decor') === 'cords') s += line('M21.5 12v6M26.5 12v6', pen.light, 0.9);
  return { svg: s, hem };
}

function legs(b: B, pen: Pen, top: number, waistHalf: number): string {
  const len = Math.min(1, num(b, 'leg', 1));
  const hem = top + len * (46 - top);
  const loose = num(b, 'legLoose', 0.4);
  const flare = num(b, 'legFlare', 0);
  const wTop = waistHalf, wHem = 4.2 + loose * 2.4 + flare * 60;
  const gap = 0.8;
  const leg = (side: 1 | -1) => {
    const xc = 24 + side * (gap / 2);
    const xo = 24 + side * wTop, xo2 = 24 + side * (wTop + wHem - 8.8 + 3);
    return path(`M${f(xc)} ${f(top + 4)}L${f(xo)} ${f(top)}L${f(xo2 > xo ? xo2 : xo)} ${f(hem)}L${f(24 + side * (gap / 2 + 0.2))} ${f(hem)}Z`, pen.main);
  };
  return leg(1) + leg(-1);
}

function bottomIcon(b: B, pen: Pen): string {
  const shape = str(b, 'shape');
  if (shape === 'skirt') {
    const length = num(b, 'length', 0.5), flare = num(b, 'flare', 0.5), taper = num(b, 'taper', 0);
    const y1 = 9 + length * 34;
    const hw = 6.2 + flare * 12 - taper * 3;
    let s = path(`M17.6 9H30.4L${f(24 + hw)} ${f(y1)}H${f(24 - hw)}Z`, pen.main);
    s += path('M17.2 9H30.8V12H17.2Z', pen.dark);
    if (num(b, 'pleats', 0) > 0) s += [-0.5, -0.17, 0.17, 0.5].map((k) => line(`M${f(24 + k * 12)} 12L${f(24 + k * hw * 2)} ${f(y1)}`, pen.dark, 0.7)).join('');
    return s;
  }
  let s = legs(b, pen, 10, 7.4);
  s += path('M16.2 7.5H31.8V12.5H16.2Z', pen.dark);
  if (b.sideStripe === true) s += line(`M16.8 12V${f(10 + Math.min(1, num(b, 'leg', 1)) * 36)}M31.2 12V${f(10 + Math.min(1, num(b, 'leg', 1)) * 36)}`, pen.light, 1.2);
  const pocket = str(b, 'pocket');
  if (pocket === 'cargo') s += path(`M17 ${f(16)}h4.6v5H17z`, pen.light) + path('M26.4 16h4.6v5h-4.6z', pen.light);
  if (pocket === 'chino') s += line('M17.5 13L21.5 17M30.5 13L26.5 17');
  if (str(b, 'details') === 'crease') s += line(`M20.2 14V${f(10 + Math.min(1, num(b, 'leg', 1)) * 30)}M27.8 14V${f(10 + Math.min(1, num(b, 'leg', 1)) * 30)}`, pen.dark, 0.6);
  return s;
}

function fullIcon(b: B, pen: Pen): string {
  const shape = str(b, 'shape');
  if (shape === 'dress') {
    const length = num(b, 'length', 0.55), flare = num(b, 'flare', 0.6);
    const hem = 28 + length * 18;
    const hw = 8 + flare * 8.5;
    let s = path(`M16.4 26H31.6L${f(24 + hw)} ${f(hem)}Q24 ${f(hem + 2)} ${f(24 - hw)} ${f(hem)}Z`, pen.main);
    s += upper(b, pen, 'full', 27).svg;
    return s.replace(/$/, '');
  }
  if (shape === 'jumpsuit') return legs(b, pen, 25, 7.4) + upper(b, pen, 'full', 27).svg;
  if (shape === 'suit') {
    let s = legs(b, pen, 27, 7.2);
    s += upper(b, pen, 'outer', 33).svg;
    return s;
  }
  if (shape === 'overalls') {
    return legs(b, pen, 25, 7.4) + path('M14 12L20 12 20 25H28V12H34L34 16H31.5V30H16.5V16H14Z', mixHex(pen.main, '#ffffff', 0.55)) + path('M18.5 8V26M29.5 8V26', 'none') + path('M17 23H31V34H17Z', pen.main) + line('M20 14L20 24M28 14L28 24', pen.dark, 2);
  }
  // swimsuit / unitard
  const sleeveLen = num(b, 'sleeve', 0), leg = num(b, 'leg', 0);
  let s = '';
  if (leg > 0) s += legs({ ...b, legLoose: 0, leg: leg + 0.1 }, pen, 28, 6.4);
  if (sleeveLen > 0) s += sleeve(sleeveLen, 6.2, pen, 1) + sleeve(sleeveLen, 6.2, pen, -1);
  s += path('M17 10Q24 8.5 31 10L30 24Q32 28 31 31H17Q16 28 18 24Z', pen.main);
  if (sleeveLen === 0) s += path('M19 9.5Q24 22 29 9.5Z', SKIN);
  else s += path('M20 9.8Q24 15 28 9.8Z', SKIN);
  if (b.sideStripe === true) s += line('M18.4 12L19 29M29.6 12L29 29', pen.light, 1.1);
  return s;
}

function shoeIcon(b: B, pen: Pen): string {
  const style = str(b, 'style', 'sneaker');
  const sole = mixHex(typeof b.soleColor === 'string' ? (b.soleColor as string) : '#f4f1ea', '#000000', 0.04);
  const soleH = Math.min(5, 2 + num(b, 'sole', 0.02) * 90);
  const baseY = 40;
  const footL = 6, footR = 42;
  let s = '';
  if (style === 'boot') {
    const tall = Math.min(26, 8 + num(b, 'height', 0.2) * 70);
    s += path(`M14 ${f(baseY - soleH - tall)}H25V${f(baseY - soleH - 8)}Q38 ${f(baseY - soleH - 8)} 41 ${f(baseY - soleH - 2)}V${f(baseY - soleH)}H12Z`, pen.main);
    s += path(`M12 ${f(baseY - soleH)}H41V${baseY}H12Z`, sole);
    s += line(`M14 ${f(baseY - soleH - tall + 2.4)}H25`, pen.dark, 1.2);
    return s;
  }
  if (style === 'sandal') {
    s += path(`M${footL} ${f(baseY - 3)}H${footR}V${baseY}H${footL}Z`, sole);
    s += path(`M19 ${f(baseY - 3)}Q26 ${f(baseY - 12)} 33 ${f(baseY - 3)}Z`, pen.main);
    return s;
  }
  const lowTop = style === 'pump' || style === 'flat' ? 9 : style === 'slipper' ? 12 : 14 + Math.min(4, num(b, 'height', 0.08) * 40);
  const toe = style === 'pump' ? 46 : style === 'flat' ? 45 : footR;
  s += path(`M${footL + 2} ${f(baseY - soleH - lowTop)}Q${footL + 2} ${f(baseY - soleH)} ${footL + 4} ${f(baseY - soleH)}H${toe - 6}Q${toe} ${f(baseY - soleH)} ${toe} ${f(baseY - soleH - 2)}Q${toe - 6} ${f(baseY - soleH - lowTop * 0.6)} 24 ${f(baseY - soleH - lowTop * 0.55)}Q19 ${f(baseY - soleH - lowTop)} ${footL + 2} ${f(baseY - soleH - lowTop)}Z`, pen.main);
  s += path(`M${footL + 1} ${f(baseY - soleH)}H${toe}V${baseY}H${footL + 1}Z`, sole);
  if (style === 'pump') s += path(`M${footL + 1} ${baseY}H${footL + 6}L${footL + 4} ${baseY + 4}Z`, pen.dark);
  if (style === 'runner') s += line(`M14 ${f(baseY - soleH - 3)}L30 ${f(baseY - soleH - 10)}`, mixHex(sole, '#ffffff', 0.5), 2);
  if (b.laces === true || style === 'runner') s += line(`M22 ${f(baseY - soleH - 12)}l3 3M26 ${f(baseY - soleH - 12)}l3 3`, INK, 0.8);
  if (style === 'loafer') s += line(`M30 ${f(baseY - soleH - 8)}h6`, pen.dark, 1.4);
  return s;
}

/** SVG markup (48 x 48) of a garment drawn in `color` (the garment's default colour when omitted). */
export function garmentIconSvg(def: GarmentDef, color?: string): string {
  const main = color ?? def.defaultColor;
  const pen: Pen = { main, dark: shadeHex(main, -0.18), light: shadeHex(main, 0.16) };
  const b = def.build;
  const shape = str(b, 'shape');
  let body: string;
  if (def.layer === 'shoes') body = shoeIcon(b, pen);
  else if (def.layer === 'bottom') body = bottomIcon(b, pen);
  else if (def.layer === 'full') body = fullIcon(b, pen);
  else if (shape === 'dress') {
    // a coat: bodice with a skirt below the waist
    body = fullIcon(b, pen);
  } else body = upper(b, pen, def.layer).svg;
  return `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** SVG markup of an accessory in `color`. */
export function accessoryIconSvg(def: AccessoryDef, color?: string): string {
  const main = color ?? def.defaultColor;
  const pen: Pen = { main, dark: shadeHex(main, -0.18), light: shadeHex(main, 0.16) };
  const b = def.build;
  let s = '';
  switch (def.kind) {
    case 'glasses': {
      const square = b.lens === 'square';
      const lens = b.tint === true ? 'rgba(20,18,16,0.85)' : 'rgba(255,255,255,0.35)';
      s = square
        ? `<rect x="6" y="18" width="14" height="10" rx="2.5" fill="${lens}" stroke="${main}" stroke-width="2.2"/><rect x="28" y="18" width="14" height="10" rx="2.5" fill="${lens}" stroke="${main}" stroke-width="2.2"/>`
        : `<circle cx="13" cy="23" r="7" fill="${lens}" stroke="${main}" stroke-width="1.8"/><circle cx="35" cy="23" r="7" fill="${lens}" stroke="${main}" stroke-width="1.8"/>`;
      s += line(`M20 22Q24 19.5 28 22`, main, 1.8) + line('M6 21L2 18M42 21L46 18', main, 1.8);
      break;
    }
    case 'earrings':
      s = b.style === 'hoop'
        ? `<circle cx="14" cy="26" r="7" fill="none" stroke="${main}" stroke-width="2.2"/><circle cx="34" cy="26" r="7" fill="none" stroke="${main}" stroke-width="2.2"/>`
        : dot(14, 24, 4, main) + dot(34, 24, 4, main) + dot(13, 23, 1.2, 'rgba(255,255,255,0.7)') + dot(33, 23, 1.2, 'rgba(255,255,255,0.7)');
      break;
    case 'hat': {
      const style = str(b, 'style', 'beanie');
      if (style === 'beanie') s = path('M10 32Q10 10 24 10Q38 10 38 32Z', main) + path('M9 29H39V36H9Z', pen.dark) + dot(24, 8, 4.5, pen.light);
      else if (style === 'cap') s = path('M11 31Q11 12 25 12Q38 12 38 31Z', main) + path('M26 29Q40 27 46 33Q36 34 26 33Z', pen.dark) + dot(25, 12, 1.8, pen.light);
      else if (style === 'sunhat') s = path('M15 28Q15 12 24 12Q33 12 33 28Z', main) + path('M3 30Q24 24 45 30Q43 37 24 36Q5 37 3 30Z', pen.light) + line('M15 27.5H33', pen.dark, 2.4);
      else s = `<path d="M8 28Q24 14 40 28" fill="none" stroke="${main}" stroke-width="5" stroke-linecap="round"/>`;
      break;
    }
    case 'scarf':
      s = path('M10 16Q24 26 38 16L39 24Q24 34 9 24Z', main) + path('M26 26L36 28 35 44 27 42Z', pen.dark) + path('M20 27L28 30 24 45 17 43Z', main);
      break;
    case 'necklace':
      s = b.style === 'pearls'
        ? Array.from({ length: 11 }, (_, k) => `<circle cx="${f(8 + k * 3.2)}" cy="${f(14 + 14 * Math.sin((k / 10) * Math.PI))}" r="2.2" fill="${main}" stroke="${INK}" stroke-width="0.7"/>`).join('')
        : `<path d="M8 12Q24 44 40 12" fill="none" stroke="${main}" stroke-width="1.6"/>` + path('M24 30Q28 35 24 40Q20 35 24 30Z', main);
      break;
    case 'watch':
      s = path('M17 4H31L30 16H18Z', pen.dark) + path('M17 44H31L30 32H18Z', pen.dark) + `<circle cx="24" cy="24" r="10" fill="${main}" stroke="${INK}"/><circle cx="24" cy="24" r="7.2" fill="#f4f1ea"/>` + line('M24 24V19M24 24L28 26', '#333', 1.1);
      break;
    case 'bracelet':
      s = `<ellipse cx="24" cy="18" rx="14" ry="5" fill="none" stroke="${main}" stroke-width="2.6"/><ellipse cx="24" cy="30" rx="14" ry="5" fill="none" stroke="${pen.light}" stroke-width="2.6"/>`;
      break;
    default:
      s = dot(24, 24, 10, main);
  }
  return `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">${s}</svg>`;
}
