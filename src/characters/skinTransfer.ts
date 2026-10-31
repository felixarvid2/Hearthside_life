// Skin-weight transfer from the source mannequin to generated geometry (fitted body tubes, garments, hair):
// a Gaussian-weighted blend of the influences of nearby source vertices, restricted by a filter so that,
// for example, a left-leg point never inherits right-thigh weights. Pure module.

import type { RawBody, Skin, Vec3 } from './rig';
import { dominantBone, skinFromMap } from './rig';

export class SkinTransfer {
  private cells = new Map<string, number[]>();
  readonly dominant: Int32Array;

  constructor(readonly raw: RawBody, private cell = 0.03) {
    const n = raw.positions.length / 3;
    this.dominant = new Int32Array(n);
    for (let v = 0; v < n; v++) {
      this.dominant[v] = dominantBone(raw, v);
      const key = this.key(raw.positions[v * 3] as number, raw.positions[v * 3 + 1] as number, raw.positions[v * 3 + 2] as number);
      let list = this.cells.get(key);
      if (!list) { list = []; this.cells.set(key, list); }
      list.push(v);
    }
  }

  private key(x: number, y: number, z: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`;
  }

  /** Source vertices within `radius` of p that pass the filter. */
  near(p: Vec3, radius: number, filter: (v: number) => boolean): Array<{ v: number; d2: number }> {
    const out: Array<{ v: number; d2: number }> = [];
    const c = this.cell;
    const r = Math.ceil(radius / c);
    const cx = Math.floor(p[0] / c), cy = Math.floor(p[1] / c), cz = Math.floor(p[2] / c);
    const pos = this.raw.positions;
    const r2 = radius * radius;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
      const list = this.cells.get(`${cx + i},${cy + j},${cz + k}`);
      if (!list) continue;
      for (const v of list) {
        const dx = (pos[v * 3] as number) - p[0], dy = (pos[v * 3 + 1] as number) - p[1], dz = (pos[v * 3 + 2] as number) - p[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= r2 && filter(v)) out.push({ v, d2 });
      }
    }
    return out;
  }

  /** Blended skin at p. sigma controls smoothness (metres). */
  skinAt(p: Vec3, filter: (v: number) => boolean = () => true, sigma = 0.02): Skin {
    let radius = sigma * 2.5;
    let cand = this.near(p, radius, filter);
    for (let tries = 0; cand.length < 3 && tries < 5; tries++) { radius *= 2; cand = this.near(p, radius, filter); }
    if (cand.length === 0) return { j: [0, 0, 0, 0], w: [1, 0, 0, 0] };
    const dmin = Math.min(...cand.map((c) => c.d2));
    const map = new Map<number, number>();
    const inv = 1 / (2 * sigma * sigma);
    for (const { v, d2 } of cand) {
      // relative kernel: distance beyond the nearest candidate decides the weight
      const k = Math.exp(-(d2 - dmin) * inv);
      if (k < 1e-4) continue;
      for (let q = 0; q < 4; q++) {
        const w = (this.raw.weights[v * 4 + q] as number) * k;
        if (w <= 0) continue;
        const b = this.raw.joints[v * 4 + q] as number;
        map.set(b, (map.get(b) ?? 0) + w);
      }
    }
    return skinFromMap(map);
  }

  /** Filter accepting source vertices whose dominant bone name passes `test`. */
  boneFilter(test: (name: string) => boolean): (v: number) => boolean {
    const ok = this.raw.boneNames.map((n) => test(n));
    return (v: number) => ok[this.dominant[v] as number] === true;
  }
}

const LIMB = /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|thigh|calf|foot|ball)/;

/** Bone test for points on one side of the body (side 1 = left/+x, -1 = right, 0 = centre). */
export function sideTest(side: number): (name: string) => boolean {
  return (name) => {
    if (side > 0 && name.endsWith('_r')) return false;
    if (side < 0 && name.endsWith('_l')) return false;
    return true;
  };
}

/** Torso and legs (no arms/hands) for a side. */
export function trunkTest(side: number): (name: string) => boolean {
  const st = sideTest(side);
  return (name) => st(name) && !/^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(name) && name !== 'Head';
}

/** Arm (shoulder to wrist) for a side. */
export function armTest(side: number): (name: string) => boolean {
  const st = sideTest(side);
  return (name) => st(name) && /^(clavicle|upperarm|lowerarm|hand)/.test(name);
}

export function isLimbBone(name: string): boolean { return LIMB.test(name); }
