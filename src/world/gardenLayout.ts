// Milestone 9: where the crops of a garden bed are drawn. Pure layout in the object's rot-0 local metres (origin at the footprint's min
// corner, y up from the bed's own ground); render/gardenView.ts rotates it into the world. A crop looks like its growth stage: a seedling
// sprout, a leafy plant, a ripe plant with fruit; a dry bed wilts (browner, lower). Beds without their own layout draw nothing.

import { CROPS, type CropDef } from '../content/exterior';
import type { GardenState } from '../core/types';
import { gardenStage, isWilted } from './gardenGrowth';

export interface PlantBlob {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  color: string;
  /** 'leaf' plants and 'fruit' pieces (tests tell them apart). */
  kind: 'leaf' | 'fruit' | 'bloom';
}

const WILT = '#b8a35a';
const BLOSSOM = '#fff2f4';

function noise(a: string, i: number): number {
  let h = 2166136261;
  const s = `${a}:${i}`;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Plants on a rectangular soil patch: rows x per-row positions at a soil height. */
function patch(id: string, crop: CropDef, g: GardenState, o: { x0: number; z0: number; x1: number; z1: number; rows: number; per: number; soil: number; scale: number }): PlantBlob[] {
  const stage = gardenStage(g);
  const wilt = isWilted(g);
  const out: PlantBlob[] = [];
  const grow = Math.min(1, g.need > 0 ? g.growth / g.need : 0);
  const leaf = wilt ? mix(crop.leaf, WILT, 0.6) : crop.leaf;
  for (let r = 0; r < o.rows; r++) {
    for (let i = 0; i < o.per; i++) {
      const k = r * o.per + i;
      if (crop.id === 'pumpkin' && (r + i) % 2) continue; // pumpkins sprawl: every other spot
      const x = o.x0 + ((o.x1 - o.x0) * (i + 0.5)) / o.per + (noise(id, k) - 0.5) * 0.06;
      const z = o.z0 + ((o.z1 - o.z0) * (r + 0.5)) / o.rows + (noise(id, k + 99) - 0.5) * 0.06;
      if (stage === 1) {
        out.push({ x, y: o.soil + 0.04 * o.scale, z, rx: 0.045 * o.scale, ry: 0.06 * o.scale, rz: 0.045 * o.scale, color: leaf, kind: 'leaf' });
        continue;
      }
      const s = (0.55 + 0.45 * grow) * (wilt ? 0.75 : 1) * o.scale;
      out.push({ x, y: o.soil + 0.1 * s, z, rx: 0.11 * s, ry: 0.1 * s * (wilt ? 0.7 : 1), rz: 0.11 * s, color: leaf, kind: 'leaf' });
      if (stage === 3) {
        if (crop.id === 'pumpkin') out.push({ x: x + 0.05, y: o.soil + 0.1 * s, z: z + 0.06, rx: 0.12 * s, ry: 0.09 * s, rz: 0.12 * s, color: crop.fruit, kind: 'fruit' });
        else if (crop.id === 'carrot') for (let c = 0; c < 2; c++) out.push({ x: x + (c - 0.5) * 0.06, y: o.soil + 0.02, z, rx: 0.025 * s, ry: 0.035 * s, rz: 0.025 * s, color: crop.fruit, kind: 'fruit' });
        else if (crop.kind === 'herb') out.push({ x: x + 0.03, y: o.soil + 0.2 * s, z, rx: 0.03, ry: 0.03, rz: 0.03, color: '#f4f0ff', kind: 'bloom' });
        else for (let c = 0; c < 3; c++) {
          const a = (c / 3) * Math.PI * 2 + noise(id, k + c);
          out.push({ x: x + Math.cos(a) * 0.09 * s, y: o.soil + (0.07 + 0.05 * noise(id, k * 3 + c)) * s, z: z + Math.sin(a) * 0.09 * s, rx: 0.04, ry: 0.04, rz: 0.04, color: crop.fruit, kind: 'fruit' });
        }
      }
    }
  }
  return out;
}

/** The blobs of a bed, or [] when it has no crop or no layout. */
export function gardenBlobs(defId: string, objId: string, g: GardenState | undefined): PlantBlob[] {
  if (!g || !g.crop) return [];
  const crop = CROPS.find((c) => c.id === g.crop);
  if (!crop) return [];
  const stage = gardenStage(g);
  switch (defId) {
    case 'garden-vegpatch': return patch(objId, crop, g, { x0: 0.28, z0: 0.3, x1: 1.72, z1: 1.7, rows: 4, per: 5, soil: 0.3, scale: 1 });
    case 'garden-herb-planter': return patch(objId, crop, g, { x0: 0.25, z0: 0.34, x1: 0.75, z1: 0.66, rows: 2, per: 3, soil: 0.5, scale: 1.1 });
    case 'garden-fruit-tree': {
      const out: PlantBlob[] = [];
      const n = stage === 3 ? 11 : 7;
      for (let i = 0; i < n; i++) {
        const a = noise(objId, i) * Math.PI * 2, h = 0.15 + 0.8 * noise(objId, i + 40);
        const r = 0.78 * Math.sqrt(1 - h * h * 0.6);
        const x = 1 + Math.cos(a) * r, z = 1 + Math.sin(a) * r, y = 1.9 + h * 0.85;
        if (stage === 1) out.push({ x, y, z, rx: 0.035, ry: 0.035, rz: 0.035, color: BLOSSOM, kind: 'bloom' });
        else if (stage === 2) out.push({ x, y, z, rx: 0.04, ry: 0.04, rz: 0.04, color: i % 2 ? BLOSSOM : mix(crop.fruit, '#5a9a3a', 0.7), kind: i % 2 ? 'bloom' : 'fruit' });
        else out.push({ x, y, z, rx: 0.075, ry: 0.075, rz: 0.075, color: crop.fruit, kind: 'fruit' });
      }
      return out;
    }
    default: return [];
  }
}
