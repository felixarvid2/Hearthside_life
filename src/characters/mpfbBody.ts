// The MPFB (MakeHuman) bodies as a character style: public/assets/characters/mpfb_{f,m}.glb (tools/mpfb/README.md "GLB format").
// This pure module holds what is not three.js specific: the creator sliders -> morph target influences, the skin tone maths of the
// shader, the transfer of the body's own morph targets onto generated meshes (garments, hair, accessories: each of their vertices
// takes the deltas of the nearest skin vertices of the same body part, so clothing follows every slider exactly) and the assembly of
// the five primitives (skin, underwear, eyes, brows, lashes) into skinned MeshData with face-paint coordinates and head sculpt morphs.

import type { BodyMorphSource, ShapeContext } from './bodyShape';
import { bodyDeltas } from './bodyShape';
import { HeadMap } from './headMap';
import type { MeshyHeadInfo } from './headMap';
import type { MeshData } from './meshData';
import { buildMeshyMesh } from './meshyBody';
import type { RawBody, Skin, Vec3 } from './rig';
import { dominantBone } from './rig';
import { buildBodyTemplate } from './template';
import type { BodyTemplate } from './template';

/** Stored in the extras of the body node of mpfb_f.glb / mpfb_m.glb (`extras.mpfbBody`). Unknown fields are ignored. */
export interface MpfbExtras {
  version: number;
  sex: 'f' | 'm';
  frame: 'a' | 'b';
  /** Names of the morph targets, in target order. */
  morphs: string[];
  /** Mean linear colour of the skin texture (the neutral of the tone recolour). */
  skinMean: [number, number, number];
  head: MeshyHeadInfo;
  /** Format 2 additions (tools/mpfb/README.md "GLB format"); older builds lack them. */
  format?: number;
  bodyMorphs?: string[];
  faceMorphs?: string[];
  /** Colour factor of the iris material that gives the original eye colour back. */
  iris?: { primitive: string; material: string; tint: [number, number, number] };
  lips?: { attribute: string; primitive: string; range: [number, number] };
  [key: string]: unknown;
}

/** The primitives of a body GLB, by the name of their material (`mpfb_<part>`). */
export const MPFB_PARTS = ['skin', 'underwear', 'eyes', 'iris', 'brows', 'lashes'] as const;
export type MpfbPart = (typeof MPFB_PARTS)[number];

// ---------------------------------------------------------------------------------------------
// Sliders -> morph targets
// ---------------------------------------------------------------------------------------------

/** How a creator body slider (-1..1) drives the morph targets: a signed slider picks the `up` or the `down` target. */
interface SliderMap {
  up?: string;
  down?: string;
  /** Influence at slider +1 and at -1: scaled so a full slider moves the surface by about 3-4 cm at most, like the displacement fields of the other styles. */
  gainUp: number;
  gainDown: number;
}

/**
 * Creator body slider -> morph targets of the GLB. One-sided targets (waist, hips, shoulders, belly only widen) narrow by a
 * negative influence, which extrapolates the same shape the other way. `bust` is the female chest: the male cup-size target only
 * makes a lump, so the male chest uses the displacement field instead (see MPFB_FIELD_IDS).
 */
export const MPFB_SLIDERS: Record<string, SliderMap> = {
  build: { up: 'weight_up', down: 'weight_down', gainUp: 1.6, gainDown: 1.6 },
  muscle: { up: 'muscle_up', down: 'muscle_down', gainUp: 1.4, gainDown: 1.4 },
  chest: { up: 'bust_up', down: 'bust_down', gainUp: 0.7, gainDown: 1 },
  waist: { up: 'waist_wide', gainUp: 1, gainDown: 0.8 },
  hips: { up: 'hips_wide', gainUp: 1, gainDown: 0.8 },
  shoulders: { up: 'shoulders_wide', gainUp: 1.4, gainDown: 1 },
  belly: { up: 'belly_round', gainUp: 0.5, gainDown: 0.8 },
};

/** Sliders without a morph target in the GLB: the displacement fields of bodyShape.ts (same morph name as the slider id) drive them. */
export function mpfbFieldIds(sex: 'f' | 'm'): string[] {
  return sex === 'm' ? ['chest', 'arms', 'legs', 'neck'] : ['arms', 'legs', 'neck'];
}

/** Largest influence of any morph target (a slider at its limit times its gain stays well inside this). */
const MAX_INFLUENCE = 2;

/**
 * Influence of every morph of an MPFB body for the creator's body values. `has` tells which morph names the body carries; the result
 * only holds those. Slider ids that map to a displacement field (see mpfbFieldIds) are passed through under their own name.
 */
export function mpfbInfluences(body: Readonly<Record<string, number>>, sex: 'f' | 'm', has: (name: string) => boolean = () => true): Record<string, number> {
  const out: Record<string, number> = {};
  const clamp1 = (v: number) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  const fields = new Set(mpfbFieldIds(sex));
  for (const [id, m] of Object.entries(MPFB_SLIDERS)) {
    if (fields.has(id)) continue;
    const v = clamp1(body[id] ?? 0);
    const set = (name: string | undefined, w: number) => { if (name && has(name)) out[name] = Math.max(-MAX_INFLUENCE, Math.min(MAX_INFLUENCE, w)); };
    if (v >= 0) { set(m.up, v * m.gainUp); if (m.down) set(m.down, 0); }
    else if (m.down) { set(m.down, -v * m.gainDown); set(m.up, 0); }
    else set(m.up, v * m.gainDown);
  }
  for (const id of fields) if (has(id)) out[id] = clamp1(body[id] ?? 0);
  return out;
}

/**
 * Creator face slider -> the signed face morph of the GLB (-1..1, the two ends of MakeHuman's own slider). Sliders that are not here
 * (cheekbones, nose bridge, ear size, eye tilt and height, brow angle) keep the displacement fields of headShape.ts / meshyBody.ts,
 * which move the same vertices (skin, eyes, brows) and every mesh built on the head.
 */
export const MPFB_FACE_SLIDERS: Record<string, string> = {
  faceLength: 'face_length', faceWidth: 'face_width', jawWidth: 'face_jaw_width', chin: 'face_chin_length', cheeks: 'face_cheek_fullness',
  noseWidth: 'face_nose_width', noseLength: 'face_nose_length', eyeSize: 'face_eye_size', eyeSpacing: 'face_eye_spacing',
  lipFullness: 'face_lip_fullness', mouthWidth: 'face_mouth_width', browHeight: 'face_brow_height',
};

/**
 * Influence of the face morphs for the creator's face sliders, and the ids of the sliders the body's morphs cover (their displacement
 * field must then stay off, or the change would be applied twice). `has` tells which morph names the body carries.
 */
export function mpfbFaceInfluences(face: Readonly<Record<string, number>>, has: (name: string) => boolean = () => true): { influences: Record<string, number>; covered: ReadonlySet<string> } {
  const influences: Record<string, number> = {};
  const covered = new Set<string>();
  for (const [slider, morph] of Object.entries(MPFB_FACE_SLIDERS)) {
    if (!has(morph)) continue;
    covered.add(slider);
    const v = face[slider] ?? 0;
    influences[morph] = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  }
  return { influences, covered };
}

// ---------------------------------------------------------------------------------------------
// Skin tone
// ---------------------------------------------------------------------------------------------

/** Fraction of the per-channel texture/mean ratio kept next to the luminance ratio: lips, knees and nails stay a little redder. */
export const TONE_CHROMA = 0.35;

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * The skin shader's recolour of one texel (all linear): `tone * (l * (1 - C) + (texel / mean) * C)` per channel, where `l` is the
 * luminance ratio of the texel to the mean skin. The mean texel therefore maps to exactly the chosen tone, and the painted shading
 * (veins, creases, the darker inner parts) stays on top of any tone.
 */
export function recolourTexel(texel: Vec3, mean: Vec3, tone: Vec3, chroma = TONE_CHROMA): Vec3 {
  const l = luma(texel[0], texel[1], texel[2]) / luma(mean[0], mean[1], mean[2]);
  return [0, 1, 2].map((c) => (tone[c] as number) * (l * (1 - chroma) + ((texel[c] as number) / (mean[c] as number)) * chroma)) as Vec3;
}

// ---------------------------------------------------------------------------------------------
// Morph transfer onto generated meshes
// ---------------------------------------------------------------------------------------------

/** Body part groups: a garment vertex only takes morph deltas from skin vertices of the parts its own skin weights touch. */
const FAMILY_TORSO = 1, FAMILY_ARM_L = 2, FAMILY_ARM_R = 4, FAMILY_LEG_L = 8, FAMILY_LEG_R = 16;
const ALL_FAMILIES = 31;

/** Part group bit of a bone (clavicles and the neck belong to the torso: the shoulder line moves as one). */
export function familyOf(boneName: string): number {
  if (/^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(boneName)) return boneName.endsWith('_r') ? FAMILY_ARM_R : FAMILY_ARM_L;
  if (/^(thigh|calf|foot|ball)/.test(boneName)) return boneName.endsWith('_r') ? FAMILY_LEG_R : FAMILY_LEG_L;
  return FAMILY_TORSO;
}

/** The nearest skin vertices' morph deltas, blended by inverse squared distance. Pure and fast: a hash grid of integer keys. */
export class MorphField {
  private cells = new Map<number, number[]>();
  private family: Uint8Array;

  constructor(
    private positions: ArrayLike<number>,
    dominantBoneName: (v: number) => string,
    /** Relative deltas (3 per vertex) by morph name. */
    private targets: Readonly<Record<string, Float32Array>>,
    private cell = 0.03,
  ) {
    const n = positions.length / 3;
    this.family = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      this.family[v] = familyOf(dominantBoneName(v));
      const key = this.key(Math.floor((positions[v * 3] as number) / cell), Math.floor((positions[v * 3 + 1] as number) / cell), Math.floor((positions[v * 3 + 2] as number) / cell));
      let list = this.cells.get(key);
      if (!list) { list = []; this.cells.set(key, list); }
      list.push(v);
    }
  }

  private key(ix: number, iy: number, iz: number): number { return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512); }

  /** Skin vertices nearest to p (up to k) among the allowed part groups: [vertex, squared distance] sorted by distance. */
  nearest(p: Vec3, families: number, k = 4): Array<[number, number]> {
    const c = this.cell;
    const cx = Math.floor(p[0] / c), cy = Math.floor(p[1] / c), cz = Math.floor(p[2] / c);
    const pos = this.positions;
    for (const r of [1, 2, 3, 5, 8, 12]) {
      const found: Array<[number, number]> = [];
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let l = -r; l <= r; l++) {
        const list = this.cells.get(this.key(cx + i, cy + j, cz + l));
        if (!list) continue;
        for (const v of list) {
          if (!((this.family[v] as number) & families)) continue;
          const dx = (pos[v * 3] as number) - p[0], dy = (pos[v * 3 + 1] as number) - p[1], dz = (pos[v * 3 + 2] as number) - p[2];
          found.push([v, dx * dx + dy * dy + dz * dz]);
        }
      }
      if (found.length >= k || r === 12) {
        if (!found.length && families !== ALL_FAMILIES) return this.nearest(p, ALL_FAMILIES, k);
        return found.sort((a, b) => a[1] - b[1]).slice(0, k);
      }
    }
    return [];
  }

  /** Morph deltas at p for every target, from the part groups in `families`. */
  at(p: Vec3, families = ALL_FAMILIES): Record<string, Vec3> {
    const near = this.nearest(p, families);
    const out: Record<string, Vec3> = {};
    let sum = 0;
    const w = near.map(([, d2]) => { const x = 1 / (d2 + 1e-4); sum += x; return x; });
    for (const [id, t] of Object.entries(this.targets)) {
      let x = 0, y = 0, z = 0;
      near.forEach(([v], i) => { const k = w[i] as number; x += (t[v * 3] as number) * k; y += (t[v * 3 + 1] as number) * k; z += (t[v * 3 + 2] as number) * k; });
      out[id] = sum > 0 ? [x / sum, y / sum, z / sum] : [0, 0, 0];
    }
    return out;
  }

  /** Part groups touched by a skin (bones with weight above 0.1), all of them when none. */
  static familiesOf(skin: Skin, boneNames: readonly string[]): number {
    let mask = 0;
    for (let k = 0; k < 4; k++) if ((skin.w[k] as number) > 0.1) mask |= familyOf(boneNames[skin.j[k] as number] ?? '');
    return mask || ALL_FAMILIES;
  }
}

/**
 * Where the generated meshes of an MPFB body get their body morph deltas: the GLB's own targets (by nearest skin vertices) plus the
 * displacement fields of the sliders the GLB has no target for. Install with `template.ctx = { ...ctx, source }`.
 */
export function mpfbMorphSource(field: MorphField, targetNames: readonly string[], classic: ShapeContext, sex: 'f' | 'm'): BodyMorphSource {
  const fieldIds = mpfbFieldIds(sex);
  return {
    ids: [...targetNames, ...fieldIds],
    at(p, skin) {
      const out = field.at(p, MorphField.familiesOf(skin, classic.boneNames));
      const d = bodyDeltas(classic, p, skin) as unknown as Record<string, Vec3>;
      for (const id of fieldIds) out[id] = d[id] as Vec3;
      return out;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------

/** One primitive of the GLB as plain arrays. */
export interface MpfbPrim {
  positions: Float32Array;
  normals: Float32Array;
  /** Null for primitives without texture coordinates. */
  uv: Float32Array | null;
  /** The `_LIPS` weight (0..1 per vertex) of the skin primitive, when the file has it. */
  lips?: Float32Array | null;
  joints: Uint16Array;
  weights: Float32Array;
  index: Uint32Array;
  /** Relative morph deltas by target name. */
  targets: Record<string, Float32Array>;
}

/** The skinned mesh data of every part present: skin first; the template must already carry the morph source. */
export function buildMpfbMeshes(t: BodyTemplate, headMap: HeadMap, sex: 'f' | 'm', prims: Partial<Record<MpfbPart, MpfbPrim>>, classic: ShapeContext): Partial<Record<MpfbPart, MeshData>> {
  const source = t.ctx.source;
  if (!source) throw new Error('mpfb: template has no morph source');
  const fieldIds = mpfbFieldIds(sex);
  const out: Partial<Record<MpfbPart, MeshData>> = {};
  for (const part of MPFB_PARTS) {
    const prim = prims[part];
    if (!prim) continue;
    const raw: RawBody = { ...t.raw, positions: prim.positions, joints: prim.joints, weights: prim.weights, index: prim.index };
    const ownIds = source.ids.filter((id) => !fieldIds.includes(id));
    const mesh = out[part] = buildMeshyMesh({
      raw, normals: prim.normals, uv: prim.uv ?? new Float32Array((prim.positions.length / 3) * 2), template: t, headMap,
      body: {
        ids: source.ids,
        at(i, p, skin) {
          const d: Record<string, Vec3> = {};
          for (const id of ownIds) { const tg = prim.targets[id]; d[id] = tg ? [tg[i * 3] as number, tg[i * 3 + 1] as number, tg[i * 3 + 2] as number] : [0, 0, 0]; }
          const f = bodyDeltas(classic, p, skin) as unknown as Record<string, Vec3>;
          for (const id of fieldIds) d[id] = f[id] as Vec3;
          return d;
        },
      },
    });
    // the lip weight of the skin (every part gets the attribute so they share one shader layout)
    mesh.attrs.aLips = { size: 1, data: prim.lips ? Array.from(prim.lips) : new Array<number>(prim.positions.length / 3).fill(0) };
  }
  return out;
}

/**
 * Everything the runtime derives from the GLB's arrays: the fitted body template (garment, hair and accessory generators run on it),
 * with the MPFB morph source and head map installed, and the MeshData of every part. `raw` is the skin primitive's RawBody.
 */
export function assembleMpfb(raw: RawBody, prims: Partial<Record<MpfbPart, MpfbPrim>>, extras: Pick<MpfbExtras, 'sex' | 'head'>): { template: BodyTemplate; meshes: Partial<Record<MpfbPart, MeshData>>; source: BodyMorphSource } {
  const skin = prims.skin;
  if (!skin) throw new Error('mpfb: no skin primitive');
  // the surface is the body: no stylisation, no procedural hands, feet or head
  const template = buildBodyTemplate(raw, { stylise: false, skinParts: false });
  const classic = template.ctx;
  const field = new MorphField(raw.positions, (v) => raw.boneNames[dominantBone(raw, v)] as string, skin.targets);
  const source = mpfbMorphSource(field, Object.keys(skin.targets), classic, extras.sex);
  template.ctx = { ...classic, source };
  const headMap = new HeadMap(extras.head, template.headOrigin);
  template.headMap = headMap;
  const meshes = buildMpfbMeshes(template, headMap, extras.sex, prims, classic);
  template.skinMesh = meshes.skin as MeshData;
  return { template, meshes, source };
}
