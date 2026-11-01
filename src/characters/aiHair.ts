// AI hairstyles: hair-only meshes generated with fal.ai (FLUX image -> TRELLIS 3D), registered on the parametric head and
// reduced to about 4k triangles by tools/build-ai-hair.mts (public/assets/characters/hair/<id>.glb). Vertices are stored in
// head-local metres (the space of headShape.ts), so one file serves both body frames and both character styles:
// the classic head takes them as they are, a Meshy head through HeadMap, exactly like the procedural hair. The GLB carries
// positions, normals, uv (a greyscale tint map) and a root-shade vertex colour; skin weights and morph targets are derived at
// load from the vertex position like the procedural hair's (head bone, blending to the neck and upper spine below the skull).
// The hair colour multiplies the tint map in the shader (materials.ts createAiHairMaterial). Pure module (no three.js).

import { planeAngle, sampleProfile } from './fit';
import { HAIR_MORPHS, hairContext, hairMorphs, headSkinFor } from './hair';
import { HEAD_SCULPT_IDS, headToBind } from './headShape';
import type { MeshData } from './meshData';
import { addVertex, computeSmoothNormals, emptyMesh } from './meshData';
import type { Vec3 } from './rig';
import { smoothstep } from './rig';
import type { BodyTemplate } from './template';

/** Parsed hair GLB: head-local positions, normals, uv, root shade (0..1 per vertex) and triangles. */
export interface AiHairData {
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  uv: Float32Array;
  shade: Float32Array;
  index: Uint32Array;
}

export const AI_HAIR_ATTRS = { uv: 2, color: 3 };

/** True for a hairstyle backed by a generated mesh (its `build` also holds the procedural parameters used as a fallback). */
export function isMeshHair(def: { build: Record<string, number | string | boolean> } | null | undefined): def is { build: Record<string, number | string | boolean> } {
  return !!def && def.build.kind === 'mesh' && typeof def.build.asset === 'string';
}

/** Distance (m) the hair keeps from the torso surface where it hangs over the shoulders. */
export const HAIR_BODY_MARGIN = 0.012;

/**
 * Skinned MeshData of an AI hairstyle on a body template: bind-space positions (moved onto the Meshy head through the
 * template's HeadMap), skin weights by height, body / head-sculpt / hairClear morph deltas, and a push-out of the hair that
 * hangs over the shoulders so it does not sink into the torso.
 */
export function buildAiHair(t: BodyTemplate, data: AiHairData): MeshData {
  const m = emptyMesh(AI_HAIR_ATTRS, HAIR_MORPHS);
  const c = hairContext(t, m);
  const n = data.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const local: Vec3 = [data.positions[i * 3] as number, data.positions[i * 3 + 1] as number, data.positions[i * 3 + 2] as number];
    const p = headToBind(c.O, local);
    const skin = headSkinFor(c, p[1], local[1]);
    // the part of the hair that sits on the skull follows the face sculpt like the scalp under it; hanging hair does not
    const onHead = smoothstep(-0.05, 0.0, local[1]);
    const morphs = hairMorphs(c, p, skin, onHead > 0.01 ? local : null, Math.atan2(local[0], local[2]));
    if (onHead < 0.99) for (const k of HEAD_SCULPT_IDS) { const d = morphs[k]; if (d) morphs[k] = [d[0] * onHead, d[1] * onHead, d[2] * onHead]; }
    const s = data.shade[i] as number;
    addVertex(m, p, skin, { uv: [data.uv[i * 2] as number, data.uv[i * 2 + 1] as number], color: [s, s, s] }, morphs);
  }
  for (const k of data.index) m.indices.push(k);
  t.headMap?.apply(m);
  clearBody(t, m);
  computeSmoothNormals(m, 1e-6);
  return m;
}

/** Pushes vertices that ended up inside the torso (long hair over the shoulders) out to its surface plus a margin. */
export function clearBody(t: BodyTemplate, m: MeshData): void {
  const top = t.lm.neckBaseY + 0.02;
  for (let i = 0; i < m.positions.length; i += 3) {
    const y = m.positions[i + 1] as number;
    if (y > top) continue;
    const w = smoothstep(top, top - 0.03, y);
    const q = sampleProfile(t.profiles.torso, y, 0);
    const da = (m.positions[i] as number) - q.ca, db = (m.positions[i + 2] as number) - q.cb;
    const a = planeAngle('y', da, db);
    const s = sampleProfile(t.profiles.torso, y, a);
    const dx = (m.positions[i] as number) - s.ca, dz = (m.positions[i + 2] as number) - s.cb;
    const r = Math.hypot(dx, dz);
    const want = s.r + HAIR_BODY_MARGIN;
    if (r >= want || r < 1e-6) continue;
    const k = 1 + ((want - r) / r) * w;
    m.positions[i] = s.ca + dx * k;
    m.positions[i + 2] = s.cb + dz * k;
  }
}

/** Highest vertex of a mesh (hair top, for the name tag and the camera). */
export function topOf(m: MeshData): number {
  let top = 0;
  for (let i = 1; i < m.positions.length; i += 3) top = Math.max(top, m.positions[i] as number);
  return top;
}
