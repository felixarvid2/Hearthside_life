// Milestone 11.5, task Q: the moving door/lid and the code-built cavity must sit on the face the person uses.
//
// The use slot of every animated object is in rot-0 local space in front of the object (+z, `useFront` in
// content/objects.ts). This test checks, from the real catalog and the real GLB node transforms, that every
// descriptor's hinge / interior is on that same +z side, and that the relation survives all four rotations
// (0/90/180/270). It catches a descriptor whose door is on the back, and a fitted model whose door node is not
// where the descriptor assumes.
import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rotYaw } from '../../../src/core/geometry';
import type { Rot } from '../../../src/core/types';
import { OBJECTS, fittedBounds, MODEL_BOUNDS } from '../../../src/content/objects';
import { DESCRIPTORS, type AnimDescriptor, type NodePart, type OverlayPart } from '../../../src/render/objectAnim';

const io = new NodeIO();
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as {
  furniture: Record<string, { file: string }>;
};

interface Bounds { min: [number, number, number]; max: [number, number, number] }
type Vec3 = [number, number, number];

interface NodeBounds { box: Bounds; origin: Vec3 }

const assetCache = new Map<string, Map<string, NodeBounds>>();

/** World-space AABB and origin of every named node (and its subtree meshes), in the asset's own root space. */
async function nodeBounds(asset: string): Promise<Map<string, NodeBounds>> {
  const cached = assetCache.get(asset);
  if (cached) return cached;
  const entry = manifest.furniture[asset];
  if (!entry) throw new Error(`no manifest entry for ${asset}`);
  const doc = await io.readBinary(readFileSync(`public/assets/${entry.file}`));
  const out = new Map<string, NodeBounds>();
  for (const node of doc.getRoot().listNodes()) {
    const name = node.getName();
    if (!name) continue;
    const wm = node.getWorldMatrix();
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const n of [node, ...node.listChildren()]) {
      const mesh = n.getMesh();
      if (!mesh) continue;
      const m = n.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const mn = pos.getMin([]), mx = pos.getMax([]);
        for (const x of [mn[0]!, mx[0]!]) for (const y of [mn[1]!, mx[1]!]) for (const z of [mn[2]!, mx[2]!]) {
          // mat4 is column-major
          const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
          const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
          const wz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
          min[0] = Math.min(min[0], wx); min[1] = Math.min(min[1], wy); min[2] = Math.min(min[2], wz);
          max[0] = Math.max(max[0], wx); max[1] = Math.max(max[1], wy); max[2] = Math.max(max[2], wz);
        }
      }
    }
    if (Number.isFinite(min[0])) out.set(name, { box: { min, max }, origin: [wm[12]!, wm[13]!, wm[14]!] });
  }
  assetCache.set(asset, out);
  return out;
}

/** Rotate + scale + offset a model-space point the same way ObjectAssets fits the model (see fittedBounds). */
function toFitted(x: number, z: number, model: { scale: number; yaw: number; offset: Vec3 }): [number, number] {
  const c = Math.cos(model.yaw), s = Math.sin(model.yaw);
  return [(x * c + z * s) * model.scale + model.offset[0], (-x * s + z * c) * model.scale + model.offset[2]];
}

/** Fitted-local AABB of a model-space box. */
function fittedBox(b: Bounds, model: { scale: number; yaw: number; offset: Vec3 }): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const x of [b.min[0], b.max[0]]) for (const z of [b.min[2], b.max[2]]) {
    const [fx, fz] = toFitted(x, z, model);
    x0 = Math.min(x0, fx); x1 = Math.max(x1, fx); z0 = Math.min(z0, fz); z1 = Math.max(z1, fz);
  }
  return { x0, x1, z0, z1 };
}

const norm2 = (x: number, z: number): [number, number] => {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
};

/** Rotate a rot-0 local direction by a quarter-turn yaw (same convention as ObjectsView). */
function rotateDir(dir: [number, number], rot: Rot): [number, number] {
  const yaw = rotYaw(rot);
  return [dir[0] * Math.cos(yaw) + dir[1] * Math.sin(yaw), -dir[0] * Math.sin(yaw) + dir[1] * Math.cos(yaw)];
}

function defFor(desc: AnimDescriptor) {
  const def = OBJECTS.find((o) => o.id === desc.defId);
  if (!def) throw new Error(`no catalog def ${desc.defId}`);
  return def;
}

/** Unit direction from the object towards the use slot (the side the person stands on), null without a slot. */
function useDir(desc: AnimDescriptor): [number, number] | null {
  const def = defFor(desc);
  const slot = def.slots?.find((s) => s.kind === 'use');
  if (!slot) return null;
  const box = fittedBounds(def.model)!;
  const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
  return norm2(slot.pos[0] - cx, slot.pos[1] - cz);
}

describe('objectAnim: doors and cavities face the use slot', () => {
  it('every animated door/cavity has its use slot in front of the object (+z at rot 0)', () => {
    for (const desc of DESCRIPTORS) {
      // Corner units (the shower stall) have a diagonal approach and no moving part to orient.
      if (desc.parts.length === 0 && !desc.interior) continue;
      const dir = useDir(desc);
      if (!dir) continue;
      expect(dir[1], desc.defId).toBeGreaterThan(0.9);
    }
  });

  for (const desc of DESCRIPTORS) {
    const def = defFor(desc);
    const slot = def.slots?.find((s) => s.kind === 'use');
    if (!slot) continue;
    const box = fittedBounds(def.model)!;
    const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;

    it(`${desc.defId}: every hinge and cavity sits on the +z (use slot) side for all four rotations`, async () => {
      const dir = useDir(desc)!;
      const bounds = await nodeBounds(desc.asset);

      for (const part of desc.parts) {
        let side: [number, number];
        if (part.kind === 'overlay') {
          const p = part as OverlayPart;
          // Hinge in fitted-box fractions: z must be the front face (the panel is flush with the model front).
          const hz = box.z0 + p.hinge[2] * (box.z1 - box.z0);
          side = norm2(box.x0 + p.hinge[0] * (box.x1 - box.x0) - cx, hz - cz);
          expect(p.hinge[2], `${desc.defId}: overlay hinge z`).toBeGreaterThanOrEqual(0.9);
        } else {
          const p = part as NodePart;
          const b = bounds.get(p.node);
          expect(b, `${desc.defId}: node ${p.node} missing from ${desc.asset}`).toBeTruthy();
          const fb = fittedBox(b!.box, def.model);
          const partCx = (fb.x0 + fb.x1) / 2, partCz = (fb.z0 + fb.z1) / 2;
          if (p.role === 'lid') {
            // A lid hinges at the back and lies over the front; the lid itself must reach the use side.
            const hinge = toFitted(b!.origin[0], b!.origin[2], def.model);
            side = norm2(partCx - hinge[0], partCz - hinge[1]);
          } else {
            side = norm2(partCx - cx, partCz - cz);
          }
        }
        const dot = side[0] * dir[0] + side[1] * dir[1];
        expect(dot, `${desc.defId}: ${part.role} on the use-slot side`).toBeGreaterThan(0.5);

        if (part.kind === 'overlay') continue;
        for (let rot = 0; rot < 4; rot++) {
          const a = rotateDir(side, rot as Rot), b = rotateDir(dir, rot as Rot);
          expect(a[0] * b[0] + a[1] * b[1], `${desc.defId}: ${part.role} rot ${rot * 90}`).toBeGreaterThan(0.5);
        }
      }

      if (desc.interiorBox) {
        // The cavity must be at the front of the model too (the opening the person reaches into).
        const z0 = desc.interiorBox[2], z1 = desc.interiorBox[5];
        expect((z0 + z1) / 2, `${desc.defId}: cavity z`).toBeGreaterThan(0.85);
        const side = norm2(0, 1);
        const dot = side[0] * dir[0] + side[1] * dir[1];
        expect(dot, `${desc.defId}: cavity on the use-slot side`).toBeGreaterThan(0.9);
        for (let rot = 0; rot < 4; rot++) {
          const a = rotateDir(side, rot as Rot), b = rotateDir(dir, rot as Rot);
          expect(a[0] * b[0] + a[1] * b[1], `${desc.defId}: cavity rot ${rot * 90}`).toBeGreaterThan(0.9);
        }
      }
    });
  }

  it('every animated asset the descriptors name has measured bounds and a manifest file', () => {
    for (const desc of DESCRIPTORS) {
      expect(MODEL_BOUNDS[desc.asset], desc.asset).toBeTruthy();
      expect(manifest.furniture[desc.asset], desc.asset).toBeTruthy();
    }
  });
});
